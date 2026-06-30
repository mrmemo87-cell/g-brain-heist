import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const hub = readFileSync('components/AdmissionHub.tsx', 'utf8');
const rpc = readFileSync('ADM_RPCS.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20260629143500_admission_generate_from_official_bank.sql', 'utf8');
const grade5EnglishSeed = readFileSync('supabase/seed/admission-official-bank/english/grade_5.json', 'utf8');
const readingPassagesSeed = readFileSync('supabase/seed/admission-official-bank/shared/reading_passages.json', 'utf8');

test('English wizard distribution reserves reading comprehension and MCQ buckets', () => {
  assert.match(hub, /const ENGLISH_WIZARD_TYPE_MIX: Record<string, number> = \{/);
  assert.match(hub, /reading_comprehension: 0\.32/);
  assert.match(hub, /mcq: 0\.68/);
  assert.match(hub, /buildWizardDistribution\(wizardQuestionCount, wizardDifficulty, wizardQuestions, wizardSubject\)/);
});

test('English blueprint preset includes reading comprehension for official tests', () => {
  assert.match(hub, /marks: 25/);
  assert.match(hub, /reading_comprehension: \{ easy: 3, medium: 5 \}/);
  assert.match(hub, /mcq: \{ easy: 7, medium: 8, hard: 2 \}/);
});

test('generated form RPC selects reading comprehension question_type buckets', () => {
  for (const sql of [rpc, migration]) {
    assert.match(sql, /FOR v_dist_key, v_dist_val IN SELECT \* FROM jsonb_each\(v_bp\.question_distribution\)/);
    assert.match(sql, /AND question_type = v_dist_key/);
    assert.match(sql, /AND difficulty = v_diff_key/);
  }
});

test('Grade 5 English official bank has passage-backed reading comprehension questions', () => {
  const seed = JSON.parse(grade5EnglishSeed);
  const passageSeed = JSON.parse(readingPassagesSeed);
  const passageByExternalId = new Map(passageSeed.passages.map((passage: any) => [passage.external_id, passage]));
  const reading = seed.questions.filter((q: any) => q.question_type === 'reading_comprehension');
  assert.ok(reading.length > 0);
  assert.ok(reading.every((q: any) => typeof q.passage_external_id === 'string' && q.passage_external_id.trim().length > 0));
  assert.ok(reading.every((q: any) => {
    const passage = passageByExternalId.get(q.passage_external_id) as any;
    return typeof passage?.text === 'string' && passage.text.trim().length > 0;
  }));
});
