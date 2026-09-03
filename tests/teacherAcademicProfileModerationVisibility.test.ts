import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260901123000_academic_profiles_preserve_moderated_students.sql',
  'utf8',
);

test('Academic Profiles preserve enrolled suspended and banned students without admitting pending members', () => {
  assert.match(migration, /rpc_teacher_academic_profile_students_for_year/i);
  assert.match(migration, /rpc_student_academic_subjects_for_year/i);
  assert.match(migration, /rpc_student_academic_profile_for_year/i);
  assert.match(migration, /sm\.status in \(''active'', ''suspended''\)/i);
  assert.doesNotMatch(migration, /sm\.status in \([^)]*''pending''/i);
});

test('Academic Profile moderation visibility patch fails closed if protected function shapes drift', () => {
  assert.match(migration, /expected_occurrences/i);
  assert.match(migration, /v_occurrences <> v_target\.expected_occurrences/i);
  assert.match(migration, /raise exception[\s\S]*patch refused/i);
  assert.match(migration, /pg_get_function_identity_arguments/i);
});

test('Academic Profile visibility patch changes read visibility only, not enrolment or moderation state', () => {
  assert.doesNotMatch(migration, /update public\.users/i);
  assert.doesNotMatch(migration, /update public\.school_members/i);
  assert.doesNotMatch(migration, /insert into public\.school_members/i);
  assert.doesNotMatch(migration, /delete from public\.school_members/i);
  assert.doesNotMatch(migration, /class_teacher_assignments[\s\S]*update/i);
});