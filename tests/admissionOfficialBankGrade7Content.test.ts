import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const english = JSON.parse(readFileSync('supabase/seed/admission-official-bank/english/grade_7.json', 'utf8'));
const maths = JSON.parse(readFileSync('supabase/seed/admission-official-bank/maths/grade_7.json', 'utf8'));
const science = JSON.parse(readFileSync('supabase/seed/admission-official-bank/science/grade_7.json', 'utf8'));
const passages = JSON.parse(readFileSync('supabase/seed/admission-official-bank/shared/reading_passages.json', 'utf8'));
const rubrics = JSON.parse(readFileSync('supabase/seed/admission-official-bank/shared/writing_rubrics.json', 'utf8'));

function normalizeAdmissionQuestionStem(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\b(?:question|item|investigation)\s+\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const g7Passages = passages.passages.filter((p: any) => p.grade_level === 7 && p.content_version === 'adm-bank-v1-g7-english');
const g7Rubrics = rubrics.rubrics.filter((r: any) => r.grade_level === 7 && r.content_version === 'adm-bank-v1-g7-english');

function countBy(records: any[], key: string) {
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record[key], (counts.get(record[key]) ?? 0) + 1);
  return counts;
}

function assertPlacement(records: any[], foundation: number, target: number, stretch: number) {
  const byBand = countBy(records, 'placement_band');
  assert.equal(byBand.get('foundation'), foundation);
  assert.equal(byBand.get('target'), target);
  assert.equal(byBand.get('stretch'), stretch);
}

function assertBalancedMcqAnswers(records: any[]) {
  const mcqs = records.filter((q) => Array.isArray(q.options));
  const byAnswer = countBy(mcqs.map((q) => ({ answer: String.fromCharCode(65 + q.correct_index) })), 'answer');
  const values = ['A', 'B', 'C', 'D'].map((key) => byAnswer.get(key) ?? 0);
  assert.ok(Math.max(...values) - Math.min(...values) <= 1, `answer distribution must be balanced: ${values.join('/')}`);
}

test('Grade 7 English official bank v1 has required counts and links', () => {
  assert.equal(english.questions.length, 96);
  assert.equal(g7Passages.length, 5);
  assert.equal(g7Rubrics.length, 1);
  const byType = countBy(english.questions, 'question_type');
  assert.equal(byType.get('reading_comprehension'), 30);
  assert.equal(byType.get('mcq'), 60);
  assert.equal((byType.get('email_writing') ?? 0) + (byType.get('essay_writing') ?? 0) + (byType.get('writing_prompt') ?? 0), 6);
  assertPlacement(english.questions, 36, 46, 14);
  const passageIds = new Set(g7Passages.map((p: any) => p.external_id));
  const rubricIds = new Set(g7Rubrics.map((r: any) => r.external_id));
  for (const question of english.questions.filter((q: any) => q.question_type === 'reading_comprehension')) assert.ok(passageIds.has(question.passage_external_id));
  for (const question of english.questions.filter((q: any) => String(q.question_type).includes('writing'))) assert.ok(rubricIds.has(question.rubric_external_id));
  assertBalancedMcqAnswers(english.questions);
});

test('Grade 7 Maths official bank v1 has required counts and distributions', () => {
  assert.equal(maths.questions.length, 90);
  assertPlacement(maths.questions, 34, 43, 13);
  const byStrand = countBy(maths.questions, 'strand');
  assert.equal(byStrand.get('number and operations'), 18);
  assert.equal(byStrand.get('fractions decimals percentages'), 18);
  assert.equal(byStrand.get('algebraic thinking'), 12);
  assert.equal(byStrand.get('geometry measurement'), 18);
  assert.equal(byStrand.get('data statistics'), 10);
  assert.equal(byStrand.get('problem solving'), 14);
  for (const question of maths.questions) assert.equal(question.options.length, 4);
  assertBalancedMcqAnswers(maths.questions);
});

test('Grade 7 Science official bank v1 has required counts and distributions', () => {
  assert.equal(science.questions.length, 70);
  assertPlacement(science.questions, 26, 34, 10);
  const byStrand = countBy(science.questions, 'strand');
  assert.equal(byStrand.get('biology / living things'), 14);
  assert.equal(byStrand.get('chemistry / materials'), 12);
  assert.equal(byStrand.get('physics / forces and energy'), 12);
  assert.equal(byStrand.get('earth and space'), 12);
  assert.equal(byStrand.get('scientific enquiry / data'), 8);
  assert.equal(byStrand.get('applied problem solving'), 12);
  for (const question of science.questions) assert.equal(question.options.length, 4);
  assertBalancedMcqAnswers(science.questions);
});

test('Grade 7 official bank v1 uses managed metadata and unique non-template identifiers', () => {
  const allRecords = [...english.pools, ...english.questions, ...maths.pools, ...maths.questions, ...science.pools, ...science.questions, ...g7Passages, ...g7Rubrics];
  const externalIds = new Set<string>();
  for (const record of allRecords) {
    assert.ok(record.external_id);
    assert.equal(record.grade_level, 7);
    assert.equal(record.content_owner, 'brain_heist');
    assert.notEqual(record.content_version, 'legacy-import');
    assert.match(record.content_version, /^adm-bank-v1-g7-/);
    assert.equal(externalIds.has(record.external_id), false, `${record.external_id} must be unique`);
    externalIds.add(record.external_id);
    assert.doesNotMatch(JSON.stringify(record), /Grade 7 question|question on|In investigation 1|In investigation 2|Choose best answer for item|cloze sentence completion: item/i);
  }

  const scopes = new Map<string, string>();
  for (const question of [...english.questions, ...maths.questions, ...science.questions]) {
    const scope = [question.subject, question.question_type, question.strand, question.subskill, normalizeAdmissionQuestionStem(question.prompt)].join('|');
    assert.equal(scopes.has(scope), false, `${question.external_id} duplicates ${scopes.get(scope)}`);
    scopes.set(scope, question.external_id);
  }
});


test('Grade 7 official bank v1 uses numeric smallint stage fields', () => {
  const allRecords = [...english.pools, ...english.questions, ...maths.pools, ...maths.questions, ...science.pools, ...science.questions, ...g7Passages, ...g7Rubrics];
  for (const record of allRecords) {
    assert.equal(record.grade_level, 7);
    assert.equal(record.stage_level, 7);
    assert.equal(typeof record.grade_level, 'number');
    assert.equal(typeof record.stage_level, 'number');
    assert.notEqual(record.stage_level, 'secondary');
    if ('stage' in record) assert.equal(typeof record.stage, 'number');
  }
});
