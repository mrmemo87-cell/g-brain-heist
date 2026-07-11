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

const CURRICULUM_LINKAGE_STATUSES = new Set(['linked', 'legacy_review_required']);
const LEGACY_LINKAGE_ALLOWED = new Set([
  'english/grade_5.json','english/grade_6.json','english/grade_7.json','english/grade_8.json',
  'maths/grade_5.json','maths/grade_6.json','maths/grade_7.json','maths/grade_8.json',
  'science/grade_5.json','science/grade_6.json','science/grade_7.json','science/grade_8.json',
]);

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const MAX_UNIQUE_LONGEST_CORRECT_RATIO = 0.6;
const MAX_ANSWER_POSITION_RATIO = 0.4;
const MIN_ANSWER_POSITION_RATIO = 0.1;
const EXTREME_CORRECT_LENGTH_RATIO = 1.8;
const EXTREME_CORRECT_LENGTH_DELTA = 20;
const SHORT_OPTION_RATIO = 0.45;
const SHORT_OPTION_DELTA = 18;
const WEAK_DISTRACTOR_PATTERNS = [
  /\ball of the above\b/i,
  /\bnone of the above\b/i,
  /\bunsupported idea unrelated\b/i,
  /\bnot stated or implied\b/i,
  /\bignores the evidence\b/i,
  /\bunclear meaning\b/i,
  /\bobviously wrong\b/i,
  /\bthrowaway\b/i,
];

const FORBIDDEN_VISIBLE_GLYPH_PATTERNS = [
  { pattern: /[□▢�]/u, label: 'box/replacement placeholder glyph' },
  { pattern: /[\uFFFD]/u, label: 'Unicode replacement character' },
  { pattern: /[\u25A0-\u25A3\u25A8-\u25A9\u25AB-\u25AE]/u, label: 'placeholder-like square glyph' },
];

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function preview(value, length = 96) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);
}

function correctOptionIndex(question) {
  if (Number.isInteger(question.correct_index)) return question.correct_index;
  if (!Array.isArray(question.options)) return -1;
  return question.options.findIndex((option) => String(option) === String(question.correct_answer));
}

function validateMcqOptionQuality(errors, mcqEntries) {
  const byBank = new Map();
  for (const entry of mcqEntries) {
    const question = entry.question;
    if (!Array.isArray(question.options) || question.options.length < 4) continue;
    const key = `${question.grade_level}|${question.subject}`;
    if (!byBank.has(key)) byBank.set(key, []);
    byBank.get(key).push(entry);

    const index = correctOptionIndex(question);
    if (index < 0 || index >= question.options.length) continue;
    const optionTexts = question.options.map((option) => String(option ?? '').trim());
    const lengths = optionTexts.map((option) => option.length);
    const correctLength = lengths[index];
    const distractorLengths = lengths.filter((_, optionIndex) => optionIndex !== index);
    const medianDistractorLength = median(distractorLengths);
    if (medianDistractorLength > 0 && correctLength > medianDistractorLength * EXTREME_CORRECT_LENGTH_RATIO && correctLength - medianDistractorLength > EXTREME_CORRECT_LENGTH_DELTA) {
      errors.push(`${entry.filePath}: ${entry.location} ${question.external_id} has extreme correct-option length imbalance (${correctLength} chars vs median distractor ${medianDistractorLength.toFixed(1)}): "${preview(question.prompt)}"`);
    }

    const maxLength = Math.max(...lengths);
    const minLength = Math.min(...lengths);
    if (maxLength - minLength > SHORT_OPTION_DELTA && minLength < median(lengths) * SHORT_OPTION_RATIO) {
      const shortIndex = lengths.indexOf(minLength);
      errors.push(`${entry.filePath}: ${entry.location} ${question.external_id} has an obviously short option ${OPTION_LETTERS[shortIndex] ?? shortIndex + 1} (${minLength} chars vs max ${maxLength}): "${preview(question.prompt)}"`);
    }

    optionTexts.forEach((option, optionIndex) => {
      const weakPattern = WEAK_DISTRACTOR_PATTERNS.find((pattern) => pattern.test(option));
      if (weakPattern) {
        errors.push(`${entry.filePath}: ${entry.location} ${question.external_id} option ${OPTION_LETTERS[optionIndex] ?? optionIndex + 1} uses weak/filler wording matching ${weakPattern}: "${preview(option)}"`);
      }
    });

    const seen = new Set();
    optionTexts.forEach((option, optionIndex) => {
      const normalized = option.toLowerCase().trim();
      if (!normalized) return;
      if (seen.has(normalized)) errors.push(`${entry.filePath}: ${entry.location} ${question.external_id} repeats option text at ${OPTION_LETTERS[optionIndex] ?? optionIndex + 1}: "${preview(option)}"`);
      seen.add(normalized);
    });
  }

  for (const [key, entries] of byBank) {
    const [grade, subject] = key.split('|');
    let uniqueLongestCorrect = 0;
    const answerCounts = new Map(OPTION_LETTERS.map((letter) => [letter, 0]));
    let eligible = 0;
    for (const entry of entries) {
      const { question } = entry;
      const index = correctOptionIndex(question);
      if (index < 0 || index >= 4) continue;
      eligible += 1;
      answerCounts.set(OPTION_LETTERS[index], (answerCounts.get(OPTION_LETTERS[index]) ?? 0) + 1);
      const lengths = question.options.map((option) => String(option ?? '').trim().length);
      const maxLength = Math.max(...lengths);
      if (lengths[index] === maxLength && lengths.filter((length) => length === maxLength).length === 1) uniqueLongestCorrect += 1;
    }
    if (!eligible) continue;
    const longestPct = (uniqueLongestCorrect / eligible) * 100;
    if (uniqueLongestCorrect / eligible > MAX_UNIQUE_LONGEST_CORRECT_RATIO) {
      errors.push(`grade ${grade} ${subject} official bank has correct option as uniquely longest ${longestPct.toFixed(1)}% of MCQs (${uniqueLongestCorrect}/${eligible}); threshold is ${(MAX_UNIQUE_LONGEST_CORRECT_RATIO * 100).toFixed(0)}%`);
    }
    for (const letter of OPTION_LETTERS) {
      const count = answerCounts.get(letter) ?? 0;
      const ratio = count / eligible;
      if (ratio > MAX_ANSWER_POSITION_RATIO || ratio < MIN_ANSWER_POSITION_RATIO) {
        errors.push(`grade ${grade} ${subject} official bank answer-position ${letter} is ${(ratio * 100).toFixed(1)}% (${count}/${eligible}); expected between ${(MIN_ANSWER_POSITION_RATIO * 100).toFixed(0)}% and ${(MAX_ANSWER_POSITION_RATIO * 100).toFixed(0)}%`);
      }
    }
  }
}


export function normalizeAdmissionQuestionStem(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^in a (?:sports report|library conversation|science diary|school newsletter|museum guide|travel timetable),\s*/g, ' ')
    .replace(/\bfocus on\s+[^.?!]+/g, ' ')
    .replace(/\bwhich (?:sentence|word) (?:is |best )?/g, 'which ')
    .replace(/\b(?:question|item|investigation|scenario|problem)\s+\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarityRatio(a, b) {
  if (!a || !b) return 0;
  const aWords = new Set(a.split(' ').filter(Boolean));
  const bWords = new Set(b.split(' ').filter(Boolean));
  const intersection = [...aWords].filter((word) => bWords.has(word)).length;
  const union = new Set([...aWords, ...bWords]).size;
  return union ? intersection / union : 0;
}

function validateDuplicateQuestionStems(errors, questionsByScope) {
  for (const [scope, entries] of questionsByScope) {
    const exact = new Map();
    for (const entry of entries) {
      const normalized = normalizeAdmissionQuestionStem(entry.question.prompt);
      if (!normalized) continue;
      const previous = exact.get(normalized);
      if (previous && (normalized.length > 80 || /\bquestion\s+\d+|\bfocus on\b/i.test(`${entry.question.prompt} ${previous.question.prompt}`))) {
        errors.push(`${entry.filePath}: ${entry.location} duplicates normalized prompt in ${scope}; ${entry.question.external_id} matches ${previous.question.external_id}: "${entry.question.prompt}"`);
      } else {
        exact.set(normalized, entry);
      }
    }
    const unique = [...exact.entries()].map(([normalized, entry]) => ({ normalized, entry }));
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const score = similarityRatio(unique[i].normalized, unique[j].normalized);
        if (score >= 0.98 && Math.min(unique[i].normalized.length, unique[j].normalized.length) >= 24) {
          errors.push(`${unique[j].entry.filePath}: ${unique[j].entry.location} is a near-duplicate prompt in ${scope}; ${unique[j].entry.question.external_id} is ${(score * 100).toFixed(0)}% similar to ${unique[i].entry.question.external_id}`);
        }
      }
    }
  }
}

const FORBIDDEN_TEMPLATE_PATTERNS = [
  /\bfocus on\b/i,
  /\btarget answer\b/i,
  /\bcorrect answer\s*(?:is|:)\b/i,
  /\btarget answer\s*(?:is|:)\b/i,
  /\btempting but incomplete explanation\b/i,
  /\bplausible but incorrect detail\b/i,
  /\bunsupported condition\b/i,
  /\bmixing in an extra\b/i,
  /\bcorrectly uses evidence\b/i,
  /\bdifferent measurement than the one described\b/i,
  /\bchanges two variables at once\b/i,
  /\bconfuses cause and effect\b/i,
  /\bwhich conclusion best applies the .* idea being tested\b/i,
  /\bscenario\s+\d+\b/i,
  /\bcalculate the result for the described situation\b/i,
  /\bnumber and operations scenario\b/i,
  /\balgebraic thinking scenario\b/i,
  /\bgeometry measurement scenario\b/i,
  /\bfractions decimals percentages scenario\b/i,
  /\bdescribed situation\b/i,
  /\bplaceholder\b/i,
  /\bgrade\s+[5-7]\s+.*\bquestion\b/i,
  /\bquestion\s+on\b/i,
  /\bitem\s+\d+\b/i,
  /\bchoose best answer\b/i,
  /\bin investigation\s+\d+\b/i,
  /\bproblem\s+\d+\b/i,
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

function validatePositiveInteger(errors, filePath, location, record, field) {
  if (!Number.isInteger(record[field]) || record[field] <= 0) {
    errors.push(`${filePath}: ${location} must have numeric integer ${field} > 0 for DB smallint compatibility; received ${JSON.stringify(record[field])}`);
  }
}

function validateSmallintFields(errors, filePath, location, record, fields) {
  for (const field of fields) validatePositiveInteger(errors, filePath, location, record, field);
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
    validateSmallintFields(errors, filePath, location, passage, ['grade_level', 'stage_level']);
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
    validateSmallintFields(errors, filePath, location, rubric, ['grade_level', 'stage_level']);
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
  validateSmallintFields(errors, filePath, location, pool, ['grade_level', 'stage_level']);
  if (pool.stage !== undefined) validateSmallintFields(errors, filePath, location, pool, ['stage']);
  if (pool.external_id) poolIds.add(pool.external_id);
}


function validateAntiTemplateText(errors, filePath, location, value) {
  if (typeof value === 'string') {
    const matched = FORBIDDEN_TEMPLATE_PATTERNS.find((pattern) => pattern.test(value));
    if (matched) {
      errors.push(`${filePath}: ${location} contains template/generator residue matching ${matched}: ${value.slice(0, 120)}`);
    }
    const glyphMatch = FORBIDDEN_VISIBLE_GLYPH_PATTERNS.find(({ pattern }) => pattern.test(value));
    if (glyphMatch) {
      errors.push(`${filePath}: ${location} contains forbidden visible ${glyphMatch.label}; use plain text variables/blanks instead: ${value.slice(0, 120)}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateAntiTemplateText(errors, filePath, `${location}[${index}]`, entry));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'explanation') continue;
      validateAntiTemplateText(errors, filePath, `${location}.${key}`, entry);
    }
  }
}


function curriculumMapFiles(root) {
  const out = [];
  for (const entry of readdirSync(root)) {
    const filePath = path.join(root, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) out.push(...curriculumMapFiles(filePath));
    else if (entry.endsWith('.json') && entry !== 'schema.json' && !entry.endsWith('.template.json')) out.push(filePath);
  }
  return out;
}

function loadCurriculumMaps(seedDir, errors) {
  const root = path.join(seedDir, 'curriculum-maps');
  const maps = new Map();
  for (const filePath of curriculumMapFiles(root)) {
    const data = readJson(filePath);
    if (data.__parseError) {
      errors.push(`${filePath}: invalid curriculum map JSON: ${data.__parseError}`);
      continue;
    }
    if (data.locked !== true) errors.push(`${filePath}: linked curriculum map must be locked`);
    if (!data.map_id || !data.map_version) errors.push(`${filePath}: linked curriculum map requires map_id and map_version`);
    const objectives = new Map();
    for (const objective of Array.isArray(data.objectives) ? data.objectives : []) {
      if (objective.objective_id) objectives.set(objective.objective_id, objective);
      if (objective.source_status !== 'approved' || objective.review_status !== 'approved') {
        errors.push(`${filePath}: objective ${objective.objective_id || '(missing id)'} is not approved for linked official-bank use`);
      }
    }
    if (data.map_id && data.map_version) maps.set(`${data.map_id}@${data.map_version}`, { filePath, data, objectives });
  }
  return maps;
}

function validateLinkedQuestion(errors, filePath, location, bank, question, mapRecord) {
  if (!question.curriculum_objective_id) {
    errors.push(`${filePath}: ${location} linked question is missing curriculum_objective_id`);
    return;
  }
  const objective = mapRecord.objectives.get(question.curriculum_objective_id);
  if (!objective) {
    errors.push(`${filePath}: ${location} references unknown curriculum_objective_id '${question.curriculum_objective_id}'`);
    return;
  }
  if (objective.source_status !== 'approved' || objective.review_status !== 'approved') {
    errors.push(`${filePath}: ${location} references unapproved curriculum objective '${question.curriculum_objective_id}'`);
  }
  if (objective.subject !== question.subject) errors.push(`${filePath}: ${location} subject '${question.subject}' does not match curriculum objective subject '${objective.subject}'`);
  if (objective.school_grade !== question.grade_level) errors.push(`${filePath}: ${location} grade_level ${question.grade_level} does not match curriculum objective school_grade ${objective.school_grade}`);
  if (objective.cambridge_stage !== question.stage_level) errors.push(`${filePath}: ${location} stage_level ${question.stage_level} does not match curriculum objective cambridge_stage ${objective.cambridge_stage}`);
  if (!Array.isArray(objective.allowed_question_types) || !objective.allowed_question_types.includes(question.question_type)) errors.push(`${filePath}: ${location} question_type '${question.question_type}' is not allowed by curriculum objective '${question.curriculum_objective_id}'`);
  if (!Array.isArray(objective.allowed_difficulties) || !objective.allowed_difficulties.includes(question.difficulty)) errors.push(`${filePath}: ${location} difficulty '${question.difficulty}' is not allowed by curriculum objective '${question.curriculum_objective_id}'`);
  if (!question.cognitive_level) errors.push(`${filePath}: ${location} linked question is missing cognitive_level`);
  else if (!Array.isArray(objective.allowed_cognitive_levels) || !objective.allowed_cognitive_levels.includes(question.cognitive_level)) errors.push(`${filePath}: ${location} cognitive_level '${question.cognitive_level}' is not allowed by curriculum objective '${question.curriculum_objective_id}'`);
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
  validateSmallintFields(errors, filePath, location, question, ['grade_level', 'stage_level']);

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
  const questionsByStemScope = new Map();
  const mcqEntries = [];
  let needsCurriculumMaps = false;

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
    const relativeGradeFile = path.relative(seedDir, filePath).replace(/\\/g, '/');
    if (!CURRICULUM_LINKAGE_STATUSES.has(data.curriculum_linkage_status)) {
      errors.push(`${filePath}: missing or invalid curriculum_linkage_status; use 'linked' for newly authored files or 'legacy_review_required' only for current reviewed legacy files`);
    }
    if (data.curriculum_linkage_status === 'legacy_review_required' && !LEGACY_LINKAGE_ALLOWED.has(relativeGradeFile)) {
      errors.push(`${filePath}: legacy_review_required is not allowed for new official-bank grade files`);
    }
    if (data.curriculum_linkage_status === 'linked') {
      needsCurriculumMaps = true;
      if (!data.curriculum_map_id) errors.push(`${filePath}: linked content is missing curriculum_map_id`);
      if (!data.curriculum_map_version) errors.push(`${filePath}: linked content is missing curriculum_map_version`);
    }
    parsedGradeFiles.push({ filePath, subject, data });
    data.pools.forEach((pool, index) => validatePool(errors, duplicateMap, filePath, `pools[${index}]`, pool, poolIds));
  }

  const curriculumMaps = needsCurriculumMaps ? loadCurriculumMaps(seedDir, errors) : new Map();

  for (const { filePath, data } of parsedGradeFiles) {
    const mapRecord = data.curriculum_linkage_status === 'linked' && data.curriculum_map_id && data.curriculum_map_version ? curriculumMaps.get(`${data.curriculum_map_id}@${data.curriculum_map_version}`) : null;
    if (data.curriculum_linkage_status === 'linked' && data.curriculum_map_id && data.curriculum_map_version && !mapRecord) {
      errors.push(`${filePath}: linked curriculum map '${data.curriculum_map_id}@${data.curriculum_map_version}' was not found or is not a production map`);
    }
    data.questions.forEach((question, index) => {
      validateQuestion(
        errors,
        duplicateMap,
        filePath,
        `questions[${index}]`,
        question,
        poolIds,
        passageIds,
        rubricIds,
      );
      if (data.curriculum_linkage_status === 'linked' && mapRecord) validateLinkedQuestion(errors, filePath, `questions[${index}]`, data, question, mapRecord);
      if (Array.isArray(question.options)) mcqEntries.push({ filePath, location: `questions[${index}]`, question });
      const scope = [question.grade_level, question.subject, question.question_type, question.strand || '', question.subskill || ''].join('|');
      if (!questionsByStemScope.has(scope)) questionsByStemScope.set(scope, []);
      questionsByStemScope.get(scope).push({ filePath, location: `questions[${index}]`, question });
    });
  }

  validateDuplicateQuestionStems(errors, questionsByStemScope);
  validateMcqOptionQuality(errors, mcqEntries);

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
