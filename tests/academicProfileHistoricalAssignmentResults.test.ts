import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_preserve_historical_assignment_outcomes.sql'))
  .sort()
  .at(-1);

assert.ok(migrationName, 'historical assignment outcome migration must exist');
const migration = readFileSync(`supabase/migrations/${migrationName}`, 'utf8');

test('legacy qualified assignment evidence is frozen into the append-only item ledger', () => {
  assert.match(migration, /from public\.student_learning_observations obs/i);
  assert.match(migration, /public\.student_learning_observation_is_qualified\(/i);
  assert.match(migration, /jsonb_array_elements_text\(obs\.evidence->'question_ids'\)/i);
  assert.match(migration, /insert into public\.student_learning_item_evidence/i);
  assert.match(migration, /mapping\.status in \('approved', 'superseded'\)/i);
  assert.match(migration, /mapping\.item_content_hash = item\.content_hash/i);
  assert.match(migration, /aq\.question_content_hash = q\.verified_content_hash/i);
  assert.match(migration, /'historicalAssignmentEvidence', true/i);
  assert.match(migration, /extensions\.digest\(candidate\.taxonomy_snapshot::text, 'sha256'\)/i);
  assert.match(migration, /on conflict \(answer_id, curriculum_mapping_id\) do nothing/i);
});

test('historical continuity does not weaken current question integrity or targeted-practice exclusion', () => {
  assert.match(migration, /q\.verification_status = 'verified'/i);
  assert.match(migration, /q\.analytics_eligible/i);
  assert.match(migration, /q\.is_active/i);
  assert.match(migration, /q\.current_content_hash = q\.verified_content_hash/i);
  assert.match(migration, /effective\.grade_level::smallint = any\(q\.eligible_grade_levels\)/i);
  assert.match(
    migration,
    /not exists \(\s*select 1\s*from public\.student_learning_intervention_practice_assignments practice/i,
  );
});

test('official assignment summaries preserve mapping-superseded outcomes only through immutable item evidence', () => {
  const viewStart = migration.indexOf(
    'create or replace view private.student_verified_assignment_summaries',
  );
  assert.ok(viewStart >= 0);
  const view = migration.slice(viewStart);

  assert.match(view, /private\.verified_question_has_curriculum_mapping\(/i);
  assert.match(view, /or exists \(\s*select 1\s*from public\.student_learning_item_evidence historical_item/i);
  assert.match(view, /historical_item\.answer_id = answer\.id/i);
  assert.match(view, /historical_item\.question_id = answer\.question_id/i);
  assert.match(view, /historical_item\.question_content_hash = aq\.question_content_hash/i);
  assert.match(view, /historical_item\.is_independent_assessment/i);
  assert.match(view, /historical_item\.academic_year_id = assignment\.academic_year_id/i);
  assert.match(view, /historical_item\.academic_subject_id = assignment\.academic_subject_id/i);
  assert.doesNotMatch(view, /from public\.student_learning_observations obs/i);
});

test('migration documents the reporting contract instead of silently dropping completed outcomes', () => {
  assert.match(migration, /Mapping supersession alone does not erase a completed academic outcome/i);
  assert.match(migration, /retired or changed question content remains excluded/i);
  assert.match(migration, /targeted practice never contributes/i);
});
