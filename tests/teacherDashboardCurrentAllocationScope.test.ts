import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260919175400_scope_teacher_dashboard_to_current_allocations.sql',
  'utf8',
);

test('teacher dashboard metrics use the same active allocation scope as the assignment workspace', () => {
  assert.match(migration, /current_scope_assignments/i);
  assert.match(migration, /y\.status = 'current'/i);
  assert.match(migration, /public\.class_teacher_assignments/i);
  assert.match(migration, /cta\.class_id = a\.class_id/i);
  assert.match(migration, /cta\.teacher_user_id = t\.teacher_user_id/i);
  assert.match(migration, /cta\.active = true/i);
  assert.match(migration, /teacher_assignment_subject_key\(cta\.subject\)/i);
  assert.match(migration, /teacher_assignment_subject_key\(a\.subject_name\)/i);
  assert.match(migration, /join current_scope_assignments csa on csa\.id = r\.assignment_id/i);
  assert.match(migration, /legacy_quarantined_assignment_students/i);
  assert.doesNotMatch(migration, /update public\.assignments/i);
  assert.doesNotMatch(migration, /delete from public\.assignments/i);
});
