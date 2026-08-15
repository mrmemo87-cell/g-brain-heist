import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const statusMigration = readFileSync(
  'supabase/migrations/20260815021520_allow_assignment_in_progress_status.sql',
  'utf8',
);
const verifiedAssignmentMigration = readFileSync(
  'supabase/migrations/20260812110000_verified_question_authority.sql',
  'utf8',
);

test('student assignment lifecycle allows the status used by answer persistence', () => {
  assert.match(statusMigration, /drop constraint if exists student_assignments_status_check/);
  assert.match(
    statusMigration,
    /check \(status in \('pending', 'in_progress', 'completed'\)\)/,
  );
  assert.match(
    verifiedAssignmentMigration,
    /update public\.student_assignments set status = 'in_progress'/,
  );
});

test('final assignment submission remains server-authoritative over persisted answers', () => {
  assert.match(
    verifiedAssignmentMigration,
    /from public\.student_assignment_answers saa/,
  );
  assert.match(verifiedAssignmentMigration, /MISMATCHED_QUESTION_TOTAL/);
});

test('status repair does not alter longitudinal academic evidence logic', () => {
  assert.doesNotMatch(statusMigration, /student_learning_observations/);
  assert.doesNotMatch(statusMigration, /student_learning_focus_states/);
  assert.doesNotMatch(statusMigration, /student_learning_ingest_assignment_result/);
});
