import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
