#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED_DIR = path.resolve(__dirname, '..', 'supabase', 'seed', 'admission-official-bank');

const VALID_SUBJECTS = new Set(['english', 'maths', 'science']);
const VALID_PLACEMENT_BANDS = new Set(['foundation', 'target', 'stretch']);
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const WRITING_TYPES = new Set(['writing_prompt', 'essay_writing', 'email_writing']);
const READING_TYPES = new Set(['reading_comprehension']);
const AUTO_SCORED_TYPES = new Set([
  'mcq',
  'gap_fill',
  'error_correction',
  'sentence_transformation',
  'word_formation',
  'open_cloze',
  'reading_comprehension',
  'short_answer',
  'structured',
  'matching',
]);
const REQUIRED_OFFICIAL_FLAGS = {
  is_official: true,
  is_locked: true,
  content_owner: 'brain_heist',
};

const FORBIDDEN_TEMPLATE_PATTERNS = [
  /\bin investigation\s+\d+\b/i,
  /\bgrade\s+6\s+science\s+question\b/i,
  /\bquestion\s+on\b/i,
  /\bproblem\s+\d+\b/i,
  /\bitem\s+\d+\b/i,
  /\bchoose the correct result\b/i,
];

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { __parseError: error instanceof Error ? error.message : String(error) };
  }
}

function pushMissing(errors, filePath, location, record, fields) {
  for (const field of fields) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      errors.push(`${filePath}: ${location} is missing required field '${field}'`);
    }
  }
}

function validateOfficialFlags(errors, filePath, location, record) {
  for (const [field, expected] of Object.entries(REQUIRED_OFFICIAL_FLAGS)) {
    if (record[field] !== expected) {
      errors.push(`${filePath}: ${location} must set ${field} to ${JSON.stringify(expected)}`);
    }
  }
}

function validatePositiveNumber(errors, filePath, location, record, field) {
  if (typeof record[field] !== 'number' || !Number.isFinite(record[field]) || record[field] <= 0) {
    errors.push(`${filePath}: ${location} must have ${field} > 0`);
  }
}

function addExternalId(errors, duplicateMap, filePath, location, record) {
  if (!record.external_id) return;
  const existing = duplicateMap.get(record.external_id);
  if (existing) {
    errors.push(`${filePath}: ${location} duplicates external_id '${record.external_id}' already used at ${existing}`);
    return;
  }
  duplicateMap.set(record.external_id, `${filePath}: ${location}`);
}

function validateSubject(errors, filePath, location, subject) {
  if (!VALID_SUBJECTS.has(subject)) {
    errors.push(`${filePath}: ${location} has invalid subject '${subject}'`);
  }
}

function validatePlacementBand(errors, filePath, location, placementBand) {
  if (!VALID_PLACEMENT_BANDS.has(placementBand)) {
    errors.push(`${filePath}: ${location} has invalid placement_band '${placementBand}'`);
  }
}

function validateSharedPassages(seedDir, errors, duplicateMap) {
  const filePath = path.join(seedDir, 'shared', 'reading_passages.json');
  const data = readJson(filePath);
  validateAntiTemplateText(errors, filePath, 'file', data);
  const passageIds = new Set();

  if (data.__parseError) {
    errors.push(`${filePath}: invalid JSON: ${data.__parseError}`);
    return passageIds;
  }
  if (!Array.isArray(data.passages)) {
    errors.push(`${filePath}: expected top-level 'passages' array`);
    return passageIds;
  }

  data.passages.forEach((passage, index) => {
    const location = `passages[${index}]`;
    pushMissing(errors, filePath, location, passage, [
      'external_id',
      'title',
      'subject',
      'grade_level',
      'stage_level',
      'text',
      'content_version',
      'source_label',
    ]);
    addExternalId(errors, duplicateMap, filePath, location, passage);
    validateOfficialFlags(errors, filePath, location, passage);
    validateSubject(errors, filePath, location, passage.subject);
    if (passage.external_id) passageIds.add(passage.external_id);
  });

  return passageIds;
}

function validateSharedRubrics(seedDir, errors, duplicateMap) {
  const filePath = path.join(seedDir, 'shared', 'writing_rubrics.json');
  const data = readJson(filePath);
  validateAntiTemplateText(errors, filePath, 'file', data);
  const rubricIds = new Set();

  if (data.__parseError) {
    errors.push(`${filePath}: invalid JSON: ${data.__parseError}`);
    return rubricIds;
  }
  if (!Array.isArray(data.rubrics)) {
    errors.push(`${filePath}: expected top-level 'rubrics' array`);
    return rubricIds;
  }

  data.rubrics.forEach((rubric, index) => {
    const location = `rubrics[${index}]`;
    pushMissing(errors, filePath, location, rubric, [
      'external_id',
      'name',
      'grade_level',
      'stage_level',
      'max_marks',
      'criteria',
      'content_version',
      'source_label',
    ]);
    addExternalId(errors, duplicateMap, filePath, location, rubric);
    validateOfficialFlags(errors, filePath, location, rubric);
    validatePositiveNumber(errors, filePath, location, rubric, 'max_marks');
    if (!Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
      errors.push(`${filePath}: ${location} must include at least one rubric criterion`);
    }
    if (rubric.external_id) rubricIds.add(rubric.external_id);
  });

  return rubricIds;
}

function gradeFiles(seedDir) {
  const subjects = ['english', 'maths', 'science'];
  const files = [];
  for (const subject of subjects) {
    const subjectDir = path.join(seedDir, subject);
    for (const entry of readdirSync(subjectDir)) {
      const filePath = path.join(subjectDir, entry);
      if (statSync(filePath).isFile() && /^grade_\d+\.json$/.test(entry)) {
        files.push({ subject, filePath });
      }
    }
  }
  return files.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function validatePool(errors, duplicateMap, filePath, location, pool, poolIds) {
  pushMissing(errors, filePath, location, pool, [
    'external_id',
    'subject',
    'grade_level',
    'stage_level',
    'placement_band',
    'name',
    'content_version',
    'source_label',
  ]);
  addExternalId(errors, duplicateMap, filePath, location, pool);
  validateOfficialFlags(errors, filePath, location, pool);
  validateSubject(errors, filePath, location, pool.subject);
  validatePlacementBand(errors, filePath, location, pool.placement_band);
  if (pool.external_id) poolIds.add(pool.external_id);
}


function validateAntiTemplateText(errors, filePath, location, value) {
  if (typeof value === 'string') {
    const matched = FORBIDDEN_TEMPLATE_PATTERNS.find((pattern) => pattern.test(value));
    if (matched) {
      errors.push(`${filePath}: ${location} contains template/generator residue matching ${matched}: ${value.slice(0, 120)}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateAntiTemplateText(errors, filePath, `${location}[${index}]`, entry));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      validateAntiTemplateText(errors, filePath, `${location}.${key}`, entry);
    }
  }
}

function validateQuestion(errors, duplicateMap, filePath, location, question, poolIds, passageIds, rubricIds) {
  pushMissing(errors, filePath, location, question, [
    'external_id',
    'pool_external_id',
    'subject',
    'grade_level',
    'stage_level',
    'placement_band',
    'diagnostic_skill',
    'strand',
    'subskill',
    'difficulty',
    'question_type',
    'prompt',
    'explanation',
    'marks',
    'estimated_seconds',
    'content_version',
    'source_label',
  ]);
  addExternalId(errors, duplicateMap, filePath, location, question);
  validateOfficialFlags(errors, filePath, location, question);
  validateSubject(errors, filePath, location, question.subject);
  validatePlacementBand(errors, filePath, location, question.placement_band);

  if (!VALID_DIFFICULTIES.has(question.difficulty)) {
    errors.push(`${filePath}: ${location} has invalid difficulty '${question.difficulty}'`);
  }
  if (question.pool_external_id && !poolIds.has(question.pool_external_id)) {
    errors.push(`${filePath}: ${location} references unknown pool_external_id '${question.pool_external_id}'`);
  }
  validatePositiveNumber(errors, filePath, location, question, 'marks');
  validatePositiveNumber(errors, filePath, location, question, 'estimated_seconds');

  if (question.question_type === 'mcq') {
    if (!Array.isArray(question.options) || question.options.length < 4) {
      errors.push(`${filePath}: ${location} multiple-choice question must include at least 4 options`);
    }
  }

  if (AUTO_SCORED_TYPES.has(question.question_type) && (question.correct_answer === undefined || question.correct_answer === null || question.correct_answer === '')) {
    errors.push(`${filePath}: ${location} auto-scored question is missing correct_answer`);
  }

  if (WRITING_TYPES.has(question.question_type)) {
    if (!question.rubric_external_id) {
      errors.push(`${filePath}: ${location} writing prompt is missing rubric_external_id`);
    } else if (!rubricIds.has(question.rubric_external_id)) {
      errors.push(`${filePath}: ${location} references unknown rubric_external_id '${question.rubric_external_id}'`);
    }
  }

  if (READING_TYPES.has(question.question_type)) {
    if (!question.passage_external_id && !question.passage) {
      errors.push(`${filePath}: ${location} reading question must include passage_external_id or inline passage`);
    } else if (question.passage_external_id && !passageIds.has(question.passage_external_id)) {
      errors.push(`${filePath}: ${location} references unknown passage_external_id '${question.passage_external_id}'`);
    }
  }
}

export function validateAdmissionOfficialBank(seedDir = DEFAULT_SEED_DIR) {
  const errors = [];
  const duplicateMap = new Map();
  const passageIds = validateSharedPassages(seedDir, errors, duplicateMap);
  const rubricIds = validateSharedRubrics(seedDir, errors, duplicateMap);
  const poolIds = new Set();
  const parsedGradeFiles = [];

  for (const { filePath, subject } of gradeFiles(seedDir)) {
    const data = readJson(filePath);
    if (data.__parseError) {
      errors.push(`${filePath}: invalid JSON: ${data.__parseError}`);
      continue;
    }
    if (!Array.isArray(data.pools)) {
      errors.push(`${filePath}: expected top-level 'pools' array`);
      continue;
    }
    if (!Array.isArray(data.questions)) {
      errors.push(`${filePath}: expected top-level 'questions' array`);
      continue;
    }
    validateAntiTemplateText(errors, filePath, 'file', data);
    parsedGradeFiles.push({ filePath, subject, data });
    data.pools.forEach((pool, index) => validatePool(errors, duplicateMap, filePath, `pools[${index}]`, pool, poolIds));
  }

  for (const { filePath, data } of parsedGradeFiles) {
    data.questions.forEach((question, index) => validateQuestion(
      errors,
      duplicateMap,
      filePath,
      `questions[${index}]`,
      question,
      poolIds,
      passageIds,
      rubricIds,
    ));
  }

  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seedDir = path.resolve(process.argv[2] || DEFAULT_SEED_DIR);
  const result = validateAdmissionOfficialBank(seedDir);
  if (!result.ok) {
    console.error(`Admission official bank validation failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Admission official bank validation passed for ${seedDir}`);
}
