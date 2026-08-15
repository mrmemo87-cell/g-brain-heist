import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260730170000_cambridge_reports_use_current_student_class.sql',
  'utf8',
);
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');

test('Cambridge reports resolve the current roster class without rewriting the attempt snapshot', () => {
  assert.match(migration, /left join lateral[\s\S]*public\.class_students cs/);
  assert.match(migration, /cs\.student_id = qs\.student_id/);
  assert.match(migration, /coalesce\(current_class\.class_code, qs\.student_class\)/);
  assert.match(migration, /current_cta\.teacher_user_id = v_actor/);
  assert.match(migration, /public\.cambridge_assignment_matches_test/);
  assert.doesNotMatch(migration, /update public\.quiz_scores/);
});

test('Cambridge class picker includes every distinct currently assigned class', () => {
  assert.match(teacherPortal, /const allocatedCambridgeClassCodes = useMemo/);
  assert.match(teacherPortal, /\.\.\.allocatedCambridgeClassCodes/);
  assert.match(teacherPortal, /your \{allocatedCambridgeClassCodes\.length\} allocated class/);
});
