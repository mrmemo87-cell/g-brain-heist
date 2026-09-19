import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260919174600_scope_teacher_assignments_to_current_allocations.sql',
  'utf8',
);

test('teacher assignment list only exposes the current operational class scope', () => {
  assert.match(migration, /y\.status = 'current'/);
  assert.match(migration, /cta\.teacher_user_id = v_teacher_user_id/);
  assert.match(migration, /cta\.class_id = a\.class_id/);
  assert.match(migration, /cta\.active = true/);
  assert.match(migration, /teacher_assignment_subject_key\(cta\.subject\)/);
  assert.match(migration, /teacher_assignment_subject_key\(a\.subject_name\)/);
});

test('historical individual and classless assignments require a current recipient entitlement', () => {
  assert.match(migration, /coalesce\(a\.assignment_mode, 'batch'\) = 'custom'/);
  assert.match(migration, /join public\.class_students cs on cs\.student_id = sa\.student_id/);
  assert.match(migration, /where sa\.assignment_id = a\.id/);
});

test('the scope fix is read-only with respect to assignment history', () => {
  assert.doesNotMatch(migration, /delete\s+from\s+public\.assignments/i);
  assert.doesNotMatch(migration, /update\s+public\.assignments/i);
  assert.doesNotMatch(migration, /truncate\s+public\.assignments/i);
});
