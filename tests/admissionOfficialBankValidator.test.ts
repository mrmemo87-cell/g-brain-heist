import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';

const validator = 'scripts/validate-admission-official-bank.mjs';

function runValidator(seedDir?: string) {
  return spawnSync(process.execPath, seedDir ? [validator, seedDir] : [validator], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeInvalidSeedDir() {
  const root = mkdtempSync(path.join(tmpdir(), 'adm-official-bank-invalid-'));
  for (const dir of ['english', 'maths', 'science', 'shared']) mkdirSync(path.join(root, dir), { recursive: true });

  writeJson(path.join(root, 'shared', 'reading_passages.json'), {
    passages: [
      {
        external_id: 'duplicate-id',
        title: 'Bad passage',
        subject: 'english',
        grade_level: 5,
        stage_level: 5,
        text: 'Short passage.',
        content_version: 'test',
        source_label: 'Brain Heist Official Admission Bank — Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
    ],
  });
  writeJson(path.join(root, 'shared', 'writing_rubrics.json'), {
    rubrics: [
      {
        external_id: 'rubric-ok',
        name: 'Rubric',
        grade_level: 5,
        stage_level: 5,
        max_marks: 10,
        criteria: [{ name: 'Ideas', marks: 10, descriptors: ['Clear ideas'] }],
        content_version: 'test',
        source_label: 'Brain Heist Official Admission Bank — Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
    ],
  });

  const empty = { content_version: 'test', source_label: 'Brain Heist Official Admission Bank — Test', pools: [], questions: [] };
  for (const subject of ['english', 'maths', 'science']) {
    for (const grade of [5, 6, 7, 8]) writeJson(path.join(root, subject, `grade_${grade}.json`), empty);
  }

  writeJson(path.join(root, 'english', 'grade_5.json'), {
    content_version: 'test',
    source_label: 'Brain Heist Official Admission Bank — Test',
    pools: [
      {
        external_id: 'pool-ok',
        subject: 'english',
        grade_level: 5,
        stage_level: 5,
        placement_band: 'foundation',
        name: 'Pool',
        content_version: 'test',
        source_label: 'Brain Heist Official Admission Bank — Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
    ],
    questions: [
      {
        external_id: 'duplicate-id',
        pool_external_id: 'pool-ok',
        subject: 'history',
        grade_level: 5,
        stage_level: 5,
        placement_band: 'bonus',
        diagnostic_skill: 'Reading',
        strand: 'reading',
        subskill: 'detail',
        difficulty: 'extreme',
        question_type: 'mcq',
        prompt: 'Bad MCQ',
        options: ['A', 'B', 'C'],
        explanation: 'Missing answer and bad metadata.',
        marks: 0,
        estimated_seconds: 0,
        content_version: 'test',
        source_label: 'Brain Heist Official Admission Bank — Test',
        is_official: false,
        is_locked: true,
        content_owner: 'school',
      },
      {
        external_id: 'reading-no-passage',
        pool_external_id: 'pool-ok',
        subject: 'english',
        grade_level: 5,
        stage_level: 5,
        placement_band: 'foundation',
        diagnostic_skill: 'Reading',
        strand: 'reading',
        subskill: 'main idea',
        difficulty: 'easy',
        question_type: 'reading_comprehension',
        prompt: 'Missing passage?',
        correct_answer: 'Yes',
        explanation: 'Should fail because no passage is linked.',
        marks: 1,
        estimated_seconds: 30,
        content_version: 'test',
        source_label: 'Brain Heist Official Admission Bank — Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
      {
        external_id: 'writing-no-rubric',
        pool_external_id: 'pool-ok',
        subject: 'english',
        grade_level: 5,
        stage_level: 5,
        placement_band: 'target',
        diagnostic_skill: 'Writing',
        strand: 'writing',
        subskill: 'organisation',
        difficulty: 'medium',
        question_type: 'writing_prompt',
        prompt: 'Write a paragraph.',
        explanation: 'Should fail because rubric is missing.',
        marks: 10,
        estimated_seconds: 600,
        content_version: 'test',
        source_label: 'Brain Heist Official Admission Bank — Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
    ],
  });

  return root;
}

test('official admission bank sample seed validates successfully', () => {
  const result = runValidator();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validation passed/);
});

test('official admission bank validator catches unsafe and incomplete seed records', () => {
  const result = runValidator(makeInvalidSeedDir());
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  for (const expected of [
    'duplicates external_id',
    "invalid subject 'history'",
    "invalid placement_band 'bonus'",
    "invalid difficulty 'extreme'",
    'auto-scored question is missing correct_answer',
    'multiple-choice question must include at least 4 options',
    'writing prompt is missing rubric_external_id',
    'reading question must include passage_external_id or inline passage',
    'must set is_official to true',
    'must set content_owner to "brain_heist"',
    'must have marks > 0',
    'must have estimated_seconds > 0',
  ]) {
    assert.match(output, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});


test('official admission bank validator rejects string smallint seed fields', () => {
  const root = makeInvalidSeedDir();
  writeJson(path.join(root, 'maths', 'grade_5.json'), {
    content_version: 'test',
    source_label: 'Brain Heist Official Admission Bank — Test',
    pools: [
      {
        external_id: 'string-stage-pool',
        subject: 'maths',
        grade_level: 5,
        stage_level: 'secondary',
        placement_band: 'foundation',
        name: 'String stage pool',
        content_version: 'test',
        source_label: 'Brain Heist Official Admission Bank — Test',
        is_official: true,
        is_locked: true,
        content_owner: 'brain_heist',
      },
    ],
    questions: [],
  });

  const result = runValidator(root);
  const output = `${result.stdout}
${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /stage_level > 0 for DB smallint compatibility/);
  assert.match(output, /received \"secondary\"/);
});

test('official admission bank validator fails synthetic bank where the correct option is always longest', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'adm-official-bank-bias-'));
  for (const dir of ['english', 'maths', 'science', 'shared']) mkdirSync(path.join(root, dir), { recursive: true });
  writeJson(path.join(root, 'shared', 'reading_passages.json'), { passages: [] });
  writeJson(path.join(root, 'shared', 'writing_rubrics.json'), { rubrics: [] });
  const empty = { content_version: 'test', source_label: 'Brain Heist Official Admission Bank — Test', pools: [], questions: [] };
  for (const subject of ['english', 'maths', 'science']) for (const grade of [5, 6, 7, 8]) writeJson(path.join(root, subject, `grade_${grade}.json`), empty);
  writeJson(path.join(root, 'english', 'grade_7.json'), {
    content_version: 'test',
    source_label: 'Brain Heist Official Admission Bank — Test',
    pools: [{
      external_id: 'bias-pool', subject: 'english', grade_level: 7, stage_level: 7, placement_band: 'target', name: 'Bias Pool',
      content_version: 'test', source_label: 'Brain Heist Official Admission Bank — Test', is_official: true, is_locked: true, content_owner: 'brain_heist',
    }],
    questions: Array.from({ length: 10 }, (_, index) => ({
      external_id: `bias-q-${index}`, pool_external_id: 'bias-pool', subject: 'english', grade_level: 7, stage_level: 7,
      placement_band: 'target', diagnostic_skill: 'Reading', strand: 'reading', subskill: `bias ${index}`, difficulty: 'medium',
      question_type: 'mcq', prompt: `Synthetic bias prompt ${index}`, options: ['short', 'brief', 'tiny', 'the only very long correct answer every time'],
      correct_index: 3, correct_answer: 'the only very long correct answer every time', explanation: 'Synthetic explanation.', marks: 1,
      estimated_seconds: 30, content_version: 'test', source_label: 'Brain Heist Official Admission Bank — Test', is_official: true,
      is_locked: true, content_owner: 'brain_heist',
    })),
  });
  const result = runValidator(root);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /correct option as uniquely longest 100\.0%/);
  assert.match(output, /answer-position D is 100\.0%/);
});

test('official admission bank validator reports Grade 7 English longest-answer bias if it is reintroduced', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'adm-official-bank-g7-bias-'));
  for (const dir of ['english', 'maths', 'science', 'shared']) mkdirSync(path.join(root, dir), { recursive: true });
  const seedRoot = path.join(process.cwd(), 'supabase', 'seed', 'admission-official-bank');
  copyFileSync(path.join(seedRoot, 'shared', 'reading_passages.json'), path.join(root, 'shared', 'reading_passages.json'));
  copyFileSync(path.join(seedRoot, 'shared', 'writing_rubrics.json'), path.join(root, 'shared', 'writing_rubrics.json'));
  for (const subject of ['english', 'maths', 'science']) {
    for (const grade of [5, 6, 7, 8]) {
      const source = JSON.parse(readFileSync(path.join(seedRoot, subject, `grade_${grade}.json`), 'utf8'));
      if (subject === 'english' && grade === 7) {
        for (const question of source.questions.filter((q: any) => Array.isArray(q.options)).slice(0, 50)) {
          const correctIndex = question.correct_index;
          question.options = question.options.map((option: string, optionIndex: number) => optionIndex === correctIndex ? `${option} with a uniquely identifying extra phrase` : option.replace(/ with .*/, ''));
          question.correct_answer = question.options[correctIndex];
        }
      }
      writeJson(path.join(root, subject, `grade_${grade}.json`), source);
    }
  }
  const result = runValidator(root);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /grade 7 english official bank has correct option as uniquely longest/);
});

test('official admission bank validator hard-fails visible placeholder box glyphs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'adm-official-bank-glyph-'));
  for (const dir of ['english', 'maths', 'science', 'shared']) mkdirSync(path.join(root, dir), { recursive: true });
  const seedRoot = path.join(process.cwd(), 'supabase', 'seed', 'admission-official-bank');
  copyFileSync(path.join(seedRoot, 'shared', 'reading_passages.json'), path.join(root, 'shared', 'reading_passages.json'));
  copyFileSync(path.join(seedRoot, 'shared', 'writing_rubrics.json'), path.join(root, 'shared', 'writing_rubrics.json'));
  for (const subject of ['english', 'maths', 'science']) {
    for (const grade of [5, 6, 7, 8]) {
      const source = JSON.parse(readFileSync(path.join(seedRoot, subject, `grade_${grade}.json`), 'utf8'));
      if (subject === 'maths' && grade === 6) source.questions[0].prompt = 'What is the missing number? 640 ÷ □ = 8';
      writeJson(path.join(root, subject, `grade_${grade}.json`), source);
    }
  }
  const result = runValidator(root);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /forbidden visible box\/replacement placeholder glyph/);
});

function linkedOfficialBankFixture(overrides: { bank?: Record<string, unknown>; question?: Record<string, unknown>; objective?: Record<string, unknown>; map?: Record<string, unknown>; fileName?: string } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'admission-linked-bank-'));
  mkdirSync(path.join(root, 'shared'), { recursive: true });
  mkdirSync(path.join(root, 'science'), { recursive: true });
  mkdirSync(path.join(root, 'english'), { recursive: true });
  mkdirSync(path.join(root, 'maths'), { recursive: true });
  mkdirSync(path.join(root, 'curriculum-maps', 'science'), { recursive: true });
  writeFileSync(path.join(root, 'shared', 'reading_passages.json'), JSON.stringify({ passages: [] }));
  writeFileSync(path.join(root, 'shared', 'writing_rubrics.json'), JSON.stringify({ rubrics: [] }));
  writeFileSync(path.join(root, 'english', 'grade_6.json'), JSON.stringify({ curriculum_linkage_status: 'legacy_review_required', pools: [], questions: [] }));
  writeFileSync(path.join(root, 'maths', 'grade_6.json'), JSON.stringify({ curriculum_linkage_status: 'legacy_review_required', pools: [], questions: [] }));
  const objective = {
    school_grade: 6,
    programme: 'Cambridge Primary',
    cambridge_stage: 6,
    typical_age_min: 10,
    typical_age_max: 11,
    subject: 'science',
    subject_code: 'CAM_PRIMARY_SCIENCE',
    source_version: 'licensed-source-version',
    source_status: 'approved',
    objective_id: 'SCI6-LINK-001',
    strand: 'Working scientifically',
    subskill: 'Identify the controlled variable in a fair test',
    learner_can: 'Learner can identify the controlled variable in a fair-test investigation.',
    prerequisites: [],
    prohibited_extensions: [],
    allowed_question_types: ['mcq'],
    allowed_difficulties: ['easy'],
    allowed_cognitive_levels: ['apply'],
    source_reference: 'Licensed source reference redacted from test fixture.',
    review_status: 'approved',
    ...overrides.objective,
  };
  writeFileSync(path.join(root, 'curriculum-maps', 'science', 'grade_6.json'), JSON.stringify({
    map_id: 'SCI-G6-LINKED',
    map_version: 'v1',
    locked: true,
    grade_stage_mapping: { explicit: true, school_grade: 6, programme: 'Cambridge Primary', cambridge_stage: 6 },
    objectives: [objective],
    ...overrides.map,
  }, null, 2));
  const pool = {
    external_id: 'pool-linked-sci6',
    subject: 'science',
    grade_level: 6,
    stage_level: 6,
    placement_band: 'target',
    name: 'Linked Science Grade 6 Pool',
    content_version: 'linked-test',
    source_label: 'Linked test fixture',
    is_official: true,
    is_locked: true,
    content_owner: 'brain_heist',
  };
  const baseQuestion = {
    external_id: 'q-linked-sci6-001',
    pool_external_id: 'pool-linked-sci6',
    subject: 'science',
    grade_level: 6,
    stage_level: 6,
    placement_band: 'target',
    diagnostic_skill: 'Working scientifically',
    strand: 'Working scientifically',
    subskill: 'Identify the controlled variable in a fair test',
    difficulty: 'easy',
    cognitive_level: 'apply',
    question_type: 'mcq',
    prompt: 'A learner changes the amount of light for two plants. What should stay the same to make the test fair?',
    options: ['The type of plant', 'The water amount', 'The soil type', 'The plant pot size'],
    correct_answer: 'The type of plant',
    correct_index: 0,
    explanation: 'The type of plant should stay the same so light is the only changed variable.',
    marks: 1,
    estimated_seconds: 45,
    content_version: 'linked-test',
    source_label: 'Linked test fixture',
    is_official: true,
    is_locked: true,
    content_owner: 'brain_heist',
    curriculum_objective_id: 'SCI6-LINK-001',
    ...overrides.question,
  };
  const questions = Array.from({ length: 10 }, (_, index) => {
    const options = ['The plant type', 'The water amount', 'The soil type', 'The pot size'];
    const correct_index = index % 4;
    return {
      ...baseQuestion,
      external_id: `q-linked-sci6-${String(index + 1).padStart(3, '0')}`,
      prompt: `Fair-test setup ${index + 1}: which condition should be controlled when light is changed?`,
      options,
      correct_index,
      correct_answer: options[correct_index],
    };
  });
  writeFileSync(path.join(root, 'science', overrides.fileName ?? 'grade_6.json'), JSON.stringify({
    curriculum_linkage_status: 'linked',
    curriculum_map_id: 'SCI-G6-LINKED',
    curriculum_map_version: 'v1',
    content_version: 'linked-test',
    source_label: 'Linked test fixture',
    pools: [pool],
    questions,
    ...overrides.bank,
  }, null, 2));
  return root;
}

test('official bank validator accepts valid linked curriculum content', () => {
  const result = execFileSync(process.execPath, [validator, linkedOfficialBankFixture()], { encoding: 'utf8' });
  assert.match(result, /validation passed/);
});

test('official bank validator keeps current legacy files valid only with explicit compatibility status', () => {
  const output = execFileSync(process.execPath, [validator], { encoding: 'utf8' });
  assert.match(output, /validation passed/);
  const root = linkedOfficialBankFixture({ bank: { curriculum_linkage_status: 'legacy_review_required' }, fileName: 'grade_11.json' });
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /legacy_review_required is not allowed for new official-bank grade files/);
});

test('official bank validator rejects linked content with missing map reference', () => {
  const root = linkedOfficialBankFixture({ bank: { curriculum_map_id: undefined } });
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /linked content is missing curriculum_map_id/);
});

test('official bank validator rejects linked questions with missing objective id', () => {
  const root = linkedOfficialBankFixture({ question: { curriculum_objective_id: undefined } });
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /missing curriculum_objective_id/);
});

test('official bank validator rejects linked questions with unknown objective id', () => {
  const root = linkedOfficialBankFixture({ question: { curriculum_objective_id: 'UNKNOWN' } });
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /unknown curriculum_objective_id/);
});

test('official bank validator rejects linked subject mismatches', () => {
  const root = linkedOfficialBankFixture({ question: { subject: 'maths' } });
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /does not match curriculum objective subject/);
});

test('official bank validator rejects linked grade and stage mismatches', () => {
  const root = linkedOfficialBankFixture({ question: { grade_level: 7, stage_level: 7 } });
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /does not match curriculum objective school_grade/);
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /does not match curriculum objective cambridge_stage/);
});

test('official bank validator rejects linked forbidden question type difficulty and cognitive level', () => {
  const root = linkedOfficialBankFixture({ question: { question_type: 'short_answer', difficulty: 'hard', cognitive_level: 'evaluate', correct_answer: 'Same plant type', options: undefined } });
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /question_type 'short_answer' is not allowed/);
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /difficulty 'hard' is not allowed/);
  assert.throws(() => execFileSync(process.execPath, [validator, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /cognitive_level 'evaluate' is not allowed/);
});

test('official bank validator accepts Brain Heist International linked content without Cambridge subject code', () => {
  const root = linkedOfficialBankFixture({
    map: {
      curriculum_authority: 'brain_heist',
      programme: 'brain_heist_international',
      assessment_style: 'international_school_admission',
      official_affiliation: 'none',
      reference_frameworks: ['NGSS', 'other reviewed public national or international standards'],
      source_references: ['Public science practice framework reviewed for admissions readiness.'],
      source_licences: ['Public framework reference; original Brain Heist questions only.'],
      copyright_policy: 'original_questions_only',
      source_review_status: 'approved',
      academic_review_status: 'approved',
      grade_stage_mapping: { explicit: true, school_grade: 6, programme: 'brain_heist_international', level_definition: 'General international Grade 6 admission-readiness.' },
    },
    objective: {
      programme: 'brain_heist_international',
      subject_code: undefined,
      source_version: undefined,
      source_status: undefined,
      source_reference: undefined,
      review_status: undefined,
      level_definition: 'General international Grade 6 admission-readiness scientific enquiry.',
      prerequisite_definition: 'Basic observation and fair-test vocabulary.',
      source_references: ['Public science practice framework reviewed for admissions readiness.'],
      source_review_status: 'approved',
      academic_review_status: 'approved',
    },
  });
  const result = execFileSync(process.execPath, [validator, root], { encoding: 'utf8' });
  assert.match(result, /validation passed/);
});
