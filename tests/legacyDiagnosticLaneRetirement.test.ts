import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20261030060000_retire_legacy_diagnostic_evidence_lane.sql', 'utf8');
const doc = readFileSync('docs/academic-skill-registry.md', 'utf8');

test('legacy diagnostic evidence is superseded, never deleted or re-keyed', () => {
  assert.doesNotMatch(migration, /delete from public\.student_learning_observations/i);
  assert.doesNotMatch(migration, /set skill_key/i);
  assert.match(migration, /'superseded_by_scheme', 'registry'/);
  assert.match(migration, /contributes_to_focus_state = false/);
  // Only observations that have a registry twin from the same assignment are superseded.
  assert.match(migration, /x\.source_id = d\.source_id and x\.skill_key like 'registry:%'/);
});

test('registry lane is backfilled before anything is superseded, then derived states are refreshed', () => {
  const backfill = migration.indexOf('ingest_verified_assignment_registry_evidence(r.assignment_id, r.student_id)');
  const supersede = migration.indexOf("'superseded_by_scheme', 'registry'");
  const refresh = migration.indexOf('student_learning_refresh_focus_state(r.student_id, r.skill_key)');
  assert.ok(backfill > 0 && supersede > backfill && refresh > supersede);
});

test('both ingest entry points call only the registry lane', () => {
  const entry = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.student_learning_ingest_assignment_result'));
  assert.doesNotMatch(entry, /perform private\.ingest_verified_assignment_diagnostic_evidence/);
  assert.equal((entry.match(/perform private\.ingest_verified_assignment_registry_evidence/g) || []).length, 2);
  assert.match(entry, /revoke all on function public\.student_learning_ingest_assignment_result/);
  assert.match(entry, /grant execute on function public\.student_learning_ingest_assignment_result[\s\S]*?to service_role/);
});

test('registry doc records the retirement', () => {
  assert.match(doc, /20261030060000_retire_legacy_diagnostic_evidence_lane/);
  assert.match(doc, /registry key is the only live identity/);
});
