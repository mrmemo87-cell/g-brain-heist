import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260901093000_add_grade4_future_tense_verified_supplement.sql';
const migration = readFileSync(migrationPath, 'utf8');

const externalIds = Array.from(
  migration.matchAll(/"externalId": "(bh-g4-eng-future-2026\.12-\d{3})"/g),
  (match) => match[1],
);

const atomicSubskills = Array.from(
  migration.matchAll(/'english\.future-tense\.([a-z0-9-]+)'/g),
  (match) => match[1],
);

test('Grade 4 Future Tense supplement is versioned instead of mutating the immutable core release', () => {
  assert.match(migration, /brain-heist-grade-4-future-tense-2026-12/);
  assert.match(migration, /"packageVersion": "2026\.12\.0"/);
  assert.match(migration, /"versionCode": "2026-11"/);
  assert.match(migration, /rpc_import_verified_question_package\(v_package, false\)/);
  assert.doesNotMatch(migration, /update\s+public\.questions/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.questions/i);
});

test('supplement contains exactly six focused Grade 4 Future Tense questions', () => {
  assert.deepEqual(externalIds, [
    'bh-g4-eng-future-2026.12-001',
    'bh-g4-eng-future-2026.12-002',
    'bh-g4-eng-future-2026.12-003',
    'bh-g4-eng-future-2026.12-004',
    'bh-g4-eng-future-2026.12-005',
    'bh-g4-eng-future-2026.12-006',
  ]);
  assert.equal((migration.match(/"grade": 4/g) ?? []).length, 6);
  assert.equal((migration.match(/"topic": "Future Tense"/g) ?? []).length, 6);
  assert.equal((migration.match(/"skill": "Future Tense"/g) ?? []).length, 6);
  assert.equal((migration.match(/"scopeCode": "english-grade-4"/g) ?? []).length, 6);
  assert.equal((migration.match(/"objectiveCode": "eng4-grammar-punctuation"/g) ?? []).length, 6);
});

test('question set covers distinct future-tense remediation performances', () => {
  for (const phrase of [
    'Recognise future tense',
    'Form affirmative future tense',
    'Use the base verb after will',
    'Form negative future tense',
    'Form future-tense questions',
    'Choose future tense from context',
  ]) {
    assert.ok(migration.includes(phrase), `Expected Future Tense supplement to cover: ${phrase}`);
  }

  assert.deepEqual(new Set(atomicSubskills), new Set([
    'identify-a-future-action-marked-by-will',
    'form-affirmative-will-plus-base-verb',
    'use-base-verb-after-will',
    'form-negative-will-not-plus-base-verb',
    'form-question-will-subject-base-verb',
    'select-future-form-from-time-context',
  ]));
});

test('supplement is governed as exact Future Tense evidence', () => {
  assert.match(migration, /'english\.future-tense', 'Future Tense'/);
  assert.match(migration, /'bh-canonical-1'/);
  assert.match(migration, /'approved', false/);
  assert.match(migration, /confidence_score[\s\S]*0\.980/);
  assert.match(migration, /private\.active_verified_question_diagnostic_taxonomy/);
  assert.match(migration, /taxonomy\.primary_skill_code = 'english\.future-tense'/);
  assert.match(migration, /taxonomy\.primary_skill_name = 'Future Tense'/);
});

test('supplement fails closed on importer, verified-pool, mapping, or taxonomy drift', () => {
  assert.match(migration, /grade4_future_tense_verified_import_failed/);
  assert.match(migration, /grade4_future_tense_verified_question_integrity_failed/);
  assert.match(migration, /into strict v_item_id, v_mapping_id/);
  assert.match(migration, /grade4_future_tense_taxonomy_identity_conflict/);
  assert.match(migration, /grade4_future_tense_active_taxonomy_integrity_failed/);
  assert.match(migration, /q\.current_content_hash = q\.verified_content_hash/);
});
