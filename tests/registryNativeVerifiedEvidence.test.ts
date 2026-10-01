import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20261001111500_registry_native_verified_question_evidence.sql',
  'utf8',
);

test('registry-native evidence is additive and preserves the legacy curriculum ledger', () => {
  assert.match(migration, /create table if not exists public\.verified_question_registry_taxonomy/);
  assert.match(migration, /create table if not exists public\.student_learning_registry_item_evidence/);
  assert.doesNotMatch(migration, /drop table\s+public\.student_learning_item_evidence/i);
  assert.doesNotMatch(migration, /alter table\s+public\.student_learning_item_evidence\s+drop/i);
  assert.match(migration, /perform private\.ingest_verified_assignment_registry_evidence/);
  assert.match(migration, /perform private\.ingest_verified_assignment_diagnostic_evidence/);
});

test('registry taxonomy is hash-bound to current governed verified questions', () => {
  assert.match(migration, /question_content_hash text not null/);
  assert.match(migration, /q\.current_content_hash=q\.verified_content_hash/);
  assert.match(migration, /new\.question_content_hash <> v_question\.current_content_hash/);
  assert.match(migration, /registry_taxonomy_question_hash_mismatch/);
  assert.match(migration, /registry_taxonomy_requires_current_verified_question/);
});

test('registry taxonomy enforces canonical skill, subskill and Evidence Focus relationships', () => {
  assert.match(migration, /node_type='skill'/);
  assert.match(migration, /node_type='subskill'/);
  assert.match(migration, /n\.parent_id=v_skill\.id/);
  assert.match(migration, /f\.atomic_subskill_node_id=v_subskill\.id/);
  assert.match(migration, /registry_taxonomy_evidence_focus_invalid/);
});

test('internal BH-AO namespace remains separate and cognitive-process validated', () => {
  for (const code of ['BH-AO1','BH-AO2','BH-AO3','BH-AO4']) assert.match(migration, new RegExp(code));
  assert.match(migration, /BH-AO1'[\s\S]*remember'[\s\S]*understand/);
  assert.match(migration, /BH-AO2'[\s\S]*apply/);
  assert.match(migration, /BH-AO3'[\s\S]*analyze/);
  assert.match(migration, /BH-AO4'[\s\S]*evaluate/);
});

test('registry item evidence is append-only and inaccessible to client roles', () => {
  assert.match(migration, /student_learning_registry_item_evidence/);
  assert.match(migration, /reject_student_learning_item_evidence_mutation/);
  assert.match(migration, /alter table public\.student_learning_registry_item_evidence enable row level security/);
  assert.match(migration, /revoke all on table public\.student_learning_registry_item_evidence\s+from public,anon,authenticated/);
  assert.match(migration, /grant select,insert on table public\.student_learning_registry_item_evidence\s+to service_role/);
});

test('only immutable verified assignment snapshots can materialize registry evidence', () => {
  assert.match(migration, /aq\.analytics_eligible_snapshot/);
  assert.match(migration, /aq\.verification_status_snapshot='verified'/);
  assert.match(migration, /aq\.question_content_hash=q\.current_content_hash/);
  assert.match(migration, /q\.current_content_hash=q\.verified_content_hash/);
  assert.match(migration, /rt\.question_content_hash=aq\.question_content_hash/);
  assert.match(migration, /saa\.grading_status='graded'/);
  assert.match(migration, /saa\.is_correct is not null/);
});

test('targeted practice is recorded but never qualifies as independent mastery evidence', () => {
  assert.match(migration, /student_learning_intervention_practice_assignments/);
  assert.match(migration, /is_independent_assessment/);
  assert.match(migration, /'intervention_practice',not v_group\.independent_assessment/);
  assert.match(migration, /'independent_mastery_evidence',v_group\.independent_assessment/);
  assert.match(migration, /p_source_type='registry_verified_assignment'/);
});

test('canonical observations flow into existing confidence and focus-state machinery', () => {
  assert.match(migration, /source_type='registry_verified_assignment'/);
  assert.match(migration, /v_skill_key:=concat_ws\([\s\S]*'registry'[\s\S]*registry_version_code[\s\S]*atomic_subskill_code/);
  assert.match(migration, /student_learning_refresh_focus_state/);
  assert.match(migration, /registry_version_code/);
  assert.match(migration, /evidence_focus_code/);
});

test('Economics is promoted to first-class academic subject context', () => {
  assert.match(migration, /values \('economics','Economics',true\)/);
  assert.match(migration, /update public\.school_subjects/);
  assert.match(migration, /academic_normalize_subject_key\(ss\.name\)='economics'/);
  assert.match(migration, /update public\.assignments/);
});

test('private registry ingestion functions are explicitly non-callable by API roles', () => {
  assert.match(migration, /revoke all on function private\.materialize_verified_assignment_registry_evidence\(uuid,uuid\)/);
  assert.match(migration, /revoke all on function private\.ingest_verified_assignment_registry_evidence\(uuid,uuid\)/);
  assert.match(migration, /registry_evidence_private_ingest_exposed/);
});
