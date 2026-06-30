import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const grade5 = JSON.parse(readFileSync('supabase/seed/admission-official-bank/english/grade_5.json', 'utf8'));
const passages = JSON.parse(readFileSync('supabase/seed/admission-official-bank/shared/reading_passages.json', 'utf8'));
const rubrics = JSON.parse(readFileSync('supabase/seed/admission-official-bank/shared/writing_rubrics.json', 'utf8'));

test('Grade 5 English official bank v1 has required content counts', () => {
  assert.equal(passages.passages.filter((passage: any) => passage.grade_level === 5).length, 5);
  assert.equal(rubrics.rubrics.filter((rubric: any) => rubric.grade_level === 5).length, 1);
  assert.equal(grade5.questions.length, 96);

  const byType = new Map<string, number>();
  for (const question of grade5.questions) byType.set(question.question_type, (byType.get(question.question_type) ?? 0) + 1);
  assert.equal(byType.get('reading_comprehension'), 30);
  assert.equal(byType.get('mcq'), 60);
  assert.equal(byType.get('writing_prompt'), 6);
});

test('Grade 5 English official bank v1 has intended placement band distribution', () => {
  const byBand = new Map<string, number>();
  for (const question of grade5.questions) byBand.set(question.placement_band, (byBand.get(question.placement_band) ?? 0) + 1);
  assert.equal(byBand.get('foundation'), 36);
  assert.equal(byBand.get('target'), 46);
  assert.equal(byBand.get('stretch'), 14);
});

test('Grade 5 English official bank v1 uses production metadata and no sample labels', () => {
  assert.equal(grade5.content_version, 'adm-bank-v1-g5-english');
  assert.equal(grade5.source_label, 'Brain Heist Official Admission Bank');
  for (const record of [...grade5.pools, ...grade5.questions, ...passages.passages.filter((passage: any) => passage.grade_level === 5), ...rubrics.rubrics.filter((rubric: any) => rubric.grade_level === 5)]) {
    assert.equal(record.content_version, 'adm-bank-v1-g5-english');
    assert.equal(record.source_label, 'Brain Heist Official Admission Bank');
    assert.equal(record.is_official, true);
    assert.equal(record.is_locked, true);
    assert.equal(record.content_owner, 'brain_heist');
  }
});
