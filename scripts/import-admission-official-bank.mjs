#!/usr/bin/env node
process.env.NO_COLOR = '1';
process.env.FORCE_COLOR = '0';
import util from 'node:util';
util.inspect.defaultOptions.colors = false;
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAdmissionOfficialBank } from './validate-admission-official-bank.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED_DIR = path.resolve(__dirname, '..', 'supabase', 'seed', 'admission-official-bank');
const VALID_TARGETS = new Set(['local', 'staging', 'production']);
const SAMPLE_SOURCE_LABEL_FRAGMENT = 'Sample/Dev Content';

function parseArgs(argv) {
  const args = {
    seedDir: DEFAULT_SEED_DIR,
    dryRun: false,
    confirmProduction: false,
    allowSampleProduction: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--confirm-production') args.confirmProduction = true;
    else if (arg === '--allow-sample-production') args.allowSampleProduction = true;
    else if (arg === '--seed-dir') {
      const next = argv[i + 1];
      if (!next) throw new Error('--seed-dir requires a path');
      args.seedDir = path.resolve(next);
      i += 1;
    } else if (arg.startsWith('--seed-dir=')) {
      args.seedDir = path.resolve(arg.slice('--seed-dir='.length));
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return `Usage: node scripts/import-admission-official-bank.mjs [--dry-run] [--seed-dir path]

Required environment variables:
  SUPABASE_URL                         Target Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY            Service-role key only; never anon or school-admin credentials
  ADMISSION_BANK_IMPORT_TARGET         One of: local, staging, production

Production requires --confirm-production. Sample/dev content is blocked in production unless --allow-sample-production is explicitly supplied.`;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function requireImportEnvironment(env, args) {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const target = env.ADMISSION_BANK_IMPORT_TARGET;

  if (!url) throw new Error('SUPABASE_URL is required');
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required; refusing to run without service-role credentials');
  if (!target || !VALID_TARGETS.has(target)) {
    throw new Error('ADMISSION_BANK_IMPORT_TARGET must be set to one of: local, staging, production');
  }
  if (target === 'production' && !args.confirmProduction) {
    throw new Error('Production import requires --confirm-production');
  }

  return { url, serviceKey, target };
}

function gradeFiles(seedDir) {
  const files = [];
  for (const subject of ['english', 'maths', 'science']) {
    const subjectDir = path.join(seedDir, subject);
    for (const entry of readdirSync(subjectDir)) {
      const filePath = path.join(subjectDir, entry);
      if (statSync(filePath).isFile() && /^grade_\d+\.json$/.test(entry)) files.push(filePath);
    }
  }
  return files.sort();
}

export function mapSeedSubjectToDb(seedSubject) {
  if (seedSubject === 'maths') return 'math';
  return seedSubject;
}

export function mapSeedStageLevelToDb(stageLevel, gradeLevel) {
  if (stageLevel === 'primary') return gradeLevel;
  if (!Number.isInteger(stageLevel) || stageLevel <= 0) {
    throw new Error(`stage_level must be a positive integer before DB import; received ${JSON.stringify(stageLevel)} for grade ${JSON.stringify(gradeLevel)}`);
  }
  return stageLevel;
}

function requirePositiveInteger(value, field, externalId) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${externalId} has invalid ${field}; expected a positive integer for DB smallint compatibility, received ${JSON.stringify(value)}`);
  }
  return value;
}

function mapSkillTag(subject, strand) {
  const normalized = String(strand || '').toLowerCase();
  if (subject === 'english') {
    if (normalized.includes('reading')) return 'reading';
    if (normalized.includes('writing')) return 'writing';
    if (normalized.includes('vocab')) return 'vocabulary';
    return 'grammar';
  }
  if (subject === 'math' || subject === 'maths') {
    if (normalized.includes('algebra')) return 'math_algebra';
    if (normalized.includes('geometry') || normalized.includes('measurement')) return 'math_geometry';
    if (normalized.includes('data') || normalized.includes('stat')) return 'math_statistics';
    return 'math_number';
  }
  return null;
}

function toJsonb(value) {
  if (value === undefined) return null;
  return value;
}

export function loadAdmissionSeed(seedDir = DEFAULT_SEED_DIR) {
  const passages = new Map();
  const rubrics = new Map();
  const pools = [];
  const questions = [];

  for (const passage of readJson(path.join(seedDir, 'shared', 'reading_passages.json')).passages ?? []) {
    passages.set(passage.external_id, passage);
  }
  for (const rubric of readJson(path.join(seedDir, 'shared', 'writing_rubrics.json')).rubrics ?? []) {
    rubrics.set(rubric.external_id, rubric);
  }
  for (const filePath of gradeFiles(seedDir)) {
    const data = readJson(filePath);
    for (const pool of data.pools ?? []) pools.push({ ...pool, __filePath: filePath });
    for (const question of data.questions ?? []) questions.push({ ...question, __filePath: filePath });
  }

  return { passages, rubrics, pools, questions };
}

function ensureOfficialRecord(record, label) {
  if (record.is_official !== true || record.is_locked !== true || record.content_owner !== 'brain_heist') {
    throw new Error(`${label} must preserve is_official=true, is_locked=true, content_owner='brain_heist'`);
  }
}

export function buildPoolRow(pool) {
  ensureOfficialRecord(pool, `Pool ${pool.external_id}`);
  return {
    external_id: pool.external_id,
    school_id: null,
    subject: mapSeedSubjectToDb(pool.subject),
    stage: requirePositiveInteger(mapSeedStageLevelToDb(pool.stage_level, pool.grade_level), 'stage', pool.external_id),
    stage_level: requirePositiveInteger(mapSeedStageLevelToDb(pool.stage_level, pool.grade_level), 'stage_level', pool.external_id),
    grade_level: requirePositiveInteger(pool.grade_level, 'grade_level', pool.external_id),
    name: pool.name,
    description: pool.description ?? null,
    is_active: true,
    is_official: true,
    is_locked: true,
    content_owner: 'brain_heist',
    content_version: pool.content_version,
    source_label: pool.source_label,
    placement_band: pool.placement_band,
  };
}

export function buildQuestionRow(question, poolId, passages, rubrics) {
  ensureOfficialRecord(question, `Question ${question.external_id}`);
  const passage = question.passage_external_id ? passages.get(question.passage_external_id) : null;
  const rubric = question.rubric_external_id ? rubrics.get(question.rubric_external_id) : null;
  const dbSubject = mapSeedSubjectToDb(question.subject);

  return {
    external_id: question.external_id,
    pool_id: poolId,
    question_type: question.question_type,
    stem: question.prompt,
    passage: question.passage ?? passage?.text ?? null,
    reading_passage_id: question.passage_external_id ?? null,
    options: toJsonb(question.options),
    correct_answer: toJsonb(question.correct_answer ?? null),
    correct_index: question.correct_index ?? null,
    marks: question.marks,
    difficulty: question.difficulty,
    cognitive_level: question.cognitive_level ?? 'application',
    topic: question.diagnostic_skill,
    skill_tag: mapSkillTag(dbSubject, question.strand),
    diagnostic_skill: question.diagnostic_skill,
    strand: question.strand,
    subskill: question.subskill,
    grade_level: requirePositiveInteger(question.grade_level, 'grade_level', question.external_id),
    stage_level: requirePositiveInteger(mapSeedStageLevelToDb(question.stage_level, question.grade_level), 'stage_level', question.external_id),
    placement_band: question.placement_band,
    estimated_seconds: question.estimated_seconds,
    explanation: question.explanation,
    writing_rubric: rubric ?? null,
    status: question.status ?? 'published',
    is_official: true,
    is_locked: true,
    content_owner: 'brain_heist',
    content_version: question.content_version,
    source_label: question.source_label,
  };
}

function seedContainsSampleContent(seed) {
  return [...seed.pools, ...seed.questions].some((record) => String(record.source_label || '').includes(SAMPLE_SOURCE_LABEL_FRAGMENT));
}

async function upsertOrThrow(supabase, table, row, key = 'external_id') {
  const { data, error } = await supabase
    .from(table)
    .upsert(row, { onConflict: key })
    .select('id, external_id')
    .single();
  if (error) throw new Error(`${table} upsert failed for ${row.external_id}: ${error.message}`);
  if (!data?.id) throw new Error(`${table} upsert for ${row.external_id} did not return an id`);
  return data;
}

export async function importAdmissionOfficialBank({ seedDir = DEFAULT_SEED_DIR, dryRun = false, env = process.env, confirmProduction = false, allowSampleProduction = false } = {}) {
  const args = { dryRun, confirmProduction, allowSampleProduction };
  const targetEnv = requireImportEnvironment(env, args);

  const validation = validateAdmissionOfficialBank(seedDir);
  if (!validation.ok) {
    throw new Error(`Validation failed before import:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`);
  }

  const seed = loadAdmissionSeed(seedDir);
  if (targetEnv.target === 'production' && seedContainsSampleContent(seed) && !allowSampleProduction) {
    throw new Error('Sample/dev content is blocked from production imports');
  }

  const summary = {
    target: targetEnv.target,
    dryRun,
    pools: seed.pools.length,
    questions: seed.questions.length,
    passages: seed.passages.size,
    rubrics: seed.rubrics.size,
    upsertedPools: 0,
    upsertedQuestions: 0,
  };

  const poolRows = seed.pools.map(buildPoolRow);
  const poolExternalIds = new Map(poolRows.map((row) => [row.external_id, row.external_id]));
  const questionRowsByPoolExternalId = seed.questions.map((question) => ({
    poolExternalId: question.pool_external_id,
    question,
  }));

  if (dryRun) return { summary, poolRows, questionCount: questionRowsByPoolExternalId.length };

  const supabase = createClient(targetEnv.url, targetEnv.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const poolIdByExternalId = new Map();
  for (const row of poolRows) {
    const data = await upsertOrThrow(supabase, 'adm_question_pools', row);
    poolIdByExternalId.set(data.external_id, data.id);
    summary.upsertedPools += 1;
  }

  for (const { poolExternalId, question } of questionRowsByPoolExternalId) {
    if (!poolExternalIds.has(poolExternalId) && !poolIdByExternalId.has(poolExternalId)) {
      throw new Error(`Question ${question.external_id} references unknown pool ${poolExternalId}`);
    }
    const poolId = poolIdByExternalId.get(poolExternalId);
    if (!poolId) throw new Error(`No database id available for pool ${poolExternalId}`);
    const row = buildQuestionRow(question, poolId, seed.passages, seed.rubrics);
    await upsertOrThrow(supabase, 'adm_questions', row);
    summary.upsertedQuestions += 1;
  }

  return { summary };
}

function printSummary(result) {
  const { summary } = result;
  console.log(`Admission official bank import ${summary.dryRun ? 'dry-run' : 'completed'} for ${summary.target}`);
  console.log(`Pools: ${summary.pools}${summary.dryRun ? '' : ` (${summary.upsertedPools} upserted)`}`);
  console.log(`Questions: ${summary.questions}${summary.dryRun ? '' : ` (${summary.upsertedQuestions} upserted)`}`);
  console.log(`Reading passages loaded: ${summary.passages}`);
  console.log(`Writing rubrics loaded: ${summary.rubrics}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    const result = await importAdmissionOfficialBank({ ...args, env: process.env });
    printSummary(result);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\n' + usage());
    process.exit(1);
  }
}
