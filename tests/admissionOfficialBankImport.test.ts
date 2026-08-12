import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const importer = 'scripts/import-admission-official-bank.mjs';

function runImport(args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [importer, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function makeInvalidSeedDir() {
  const root = mkdtempSync(path.join(tmpdir(), 'adm-official-bank-import-invalid-'));
  for (const dir of ['english', 'maths', 'science', 'shared']) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, 'shared', 'reading_passages.json'), JSON.stringify({ passages: [] }));
  writeFileSync(path.join(root, 'shared', 'writing_rubrics.json'), JSON.stringify({ rubrics: [] }));
  const empty = { content_version: 'test', source_label: 'Test', pools: [], questions: [] };
  for (const subject of ['english', 'maths', 'science']) {
    for (const grade of [5, 6, 7, 8]) writeFileSync(path.join(root, subject, `grade_${grade}.json`), JSON.stringify(empty));
  }
  writeFileSync(path.join(root, 'maths', 'grade_5.json'), JSON.stringify({
    content_version: 'test',
    source_label: 'Test',
    pools: [
      {
        external_id: 'bad-pool',
        subject: 'maths',
        grade_level: 5,
        stage_level: 5,
        placement_band: 'foundation',
        name: 'Bad pool',
        content_version: 'test',
        source_label: 'Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
    ],
    questions: [
      {
        external_id: 'bad-question',
        pool_external_id: 'bad-pool',
        subject: 'maths',
        grade_level: 5,
        stage_level: 5,
        placement_band: 'foundation',
        diagnostic_skill: 'Number',
        strand: 'number',
        subskill: 'fractions',
        difficulty: 'easy',
        question_type: 'mcq',
        prompt: 'Broken question',
        options: ['A', 'B', 'C'],
        explanation: 'Missing correct answer and one option.',
        marks: 1,
        estimated_seconds: 30,
        content_version: 'test',
        source_label: 'Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
    ],
  }));
  return root;
}

test('official admission bank import refuses without service-role credentials', () => {
  const result = runImport(['--dry-run'], {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: '',
    ADMISSION_BANK_IMPORT_TARGET: 'staging',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /SUPABASE_SERVICE_ROLE_KEY is required/);
});

test('official admission bank import refuses unclear target environments', () => {
  const result = runImport(['--dry-run'], {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
    ADMISSION_BANK_IMPORT_TARGET: '',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ADMISSION_BANK_IMPORT_TARGET must be set/);
});

test('official admission bank import runs validation before dry-run/import work', () => {
  const result = runImport(['--dry-run', '--seed-dir', makeInvalidSeedDir()], {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
    ADMISSION_BANK_IMPORT_TARGET: 'staging',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /Validation failed before import/);
  assert.match(output, /auto-scored question is missing correct_answer/);
  assert.match(output, /multiple-choice question must include at least 4 options/);
});

test('official admission bank import dry-run summarizes without Supabase mutation', () => {
  const result = runImport(['--dry-run'], {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
    ADMISSION_BANK_IMPORT_TARGET: 'staging',
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /import dry-run for staging/);
  assert.match(output, /Pools: 27/);
  assert.match(output, /Questions: 768/);
  assert.doesNotMatch(output, /upserted/);
});

test('official admission bank import maps seed subject and numeric stage to database-compatible values', () => {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    "import { mapSeedSubjectToDb, mapSeedStageLevelToDb } from './scripts/import-admission-official-bank.mjs'; console.log(mapSeedSubjectToDb('maths')); console.log(mapSeedSubjectToDb('science')); console.log(mapSeedStageLevelToDb(7, 7));",
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['math', 'science', '7']);
});

test('official admission bank import maps cognitive levels to database-compatible values', async () => {
  const moduleUrl = pathToFileURL(path.resolve('scripts/import-admission-official-bank.mjs')).href;
  const { mapSeedCognitiveLevelToDb } = await import(moduleUrl) as {
    mapSeedCognitiveLevelToDb: (value: unknown) => string;
  };

  assert.equal(mapSeedCognitiveLevelToDb(' understand '), 'knowledge');
  assert.equal(mapSeedCognitiveLevelToDb('APPLY'), 'application');
  assert.equal(mapSeedCognitiveLevelToDb('Reason'), 'reasoning');
  assert.equal(mapSeedCognitiveLevelToDb('knowledge'), 'knowledge');
  assert.equal(mapSeedCognitiveLevelToDb('application'), 'application');
  assert.equal(mapSeedCognitiveLevelToDb('reasoning'), 'reasoning');
  assert.equal(mapSeedCognitiveLevelToDb(undefined), 'application');
  assert.throws(() => mapSeedCognitiveLevelToDb('evaluate'), /Unsupported seed cognitive_level "evaluate"/);
});


test('official admission bank pool rows never send secondary into smallint stage fields', async () => {
  const moduleUrl = pathToFileURL(path.resolve('scripts/import-admission-official-bank.mjs')).href;
  const { buildPoolRow } = await import(moduleUrl) as {
    buildPoolRow: (pool: Record<string, unknown>) => Record<string, unknown>;
  };

  const row = buildPoolRow({
    external_id: 'adm-g7-eng-v1-foundation-pool',
    subject: 'english',
    grade_level: 7,
    stage_level: 7,
    placement_band: 'foundation',
    name: 'Grade 7 English Foundation',
    content_version: 'adm-bank-v1-g7-english',
    source_label: 'Brains Heist Official Admission Bank — Grade 7 English',
    is_official: true,
    is_locked: true,
    content_owner: 'brain_heist',
  });

  assert.equal(row['stage'], 7);
  assert.equal(row['stage_level'], 7);
  assert.equal(row['grade_level'], 7);
  assert.notEqual(row['stage'], 'secondary');
});

test('official admission bank question row maps editable fields for upsert refreshes', async () => {
  const moduleUrl = pathToFileURL(path.resolve('scripts/import-admission-official-bank.mjs')).href;
  const { buildQuestionRow } = await import(moduleUrl) as {
    buildQuestionRow: (question: Record<string, unknown>, poolId: string, passages: Map<string, unknown>, rubrics: Map<string, unknown>) => Record<string, unknown>;
  };
  const row = buildQuestionRow({
    external_id: 'question-update-check',
    subject: 'science',
    grade_level: 6,
    stage_level: 6,
    question_type: 'mcq',
    prompt: 'Updated stem text',
    passage: 'Updated passage text',
    options: ['A', 'B', 'C', 'D'],
    correct_answer: 'B',
    correct_index: 1,
    marks: 1,
    difficulty: 'medium',
    cognitive_level: ' apply ',
    diagnostic_skill: 'Updated diagnostic skill',
    strand: 'working scientifically',
    subskill: 'Updated subskill',
    placement_band: 'target',
    estimated_seconds: 70,
    explanation: 'Updated explanation',
    content_version: 'updated-version',
    source_label: 'Brains Heist Official Admission Bank',
    is_official: true,
    is_locked: true,
    content_owner: 'brain_heist',
  }, 'pool-id', new Map(), new Map());

  assert.equal(row['stem'], 'Updated stem text');
  assert.deepEqual(row['options'], ['A', 'B', 'C', 'D']);
  assert.equal(row['correct_answer'], 'B');
  assert.equal(row['correct_index'], 1);
  assert.equal(row['explanation'], 'Updated explanation');
  assert.equal(row['diagnostic_skill'], 'Updated diagnostic skill');
  assert.equal(row['strand'], 'working scientifically');
  assert.equal(row['subskill'], 'Updated subskill');
  assert.equal(row['passage'], 'Updated passage text');
  assert.equal(row['placement_band'], 'target');
  assert.equal(row['content_version'], 'updated-version');
  assert.equal(row['cognitive_level'], 'application');
});
