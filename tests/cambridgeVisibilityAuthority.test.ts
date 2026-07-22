import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260722033000_correct_cambridge_visibility_authority.sql'),
  'utf8'
);
const teacherPortal = fs.readFileSync(path.resolve(process.cwd(), 'components/TeacherPortal.tsx'), 'utf8');
const schoolAdmin = fs.readFileSync(path.resolve(process.cwd(), 'components/school-admin/tabs/CambridgeTab.tsx'), 'utf8');

test('student Cambridge visibility derives identity and roster server-side', () => {
  assert.match(migration, /v_student_id uuid := auth\.uid\(\)/);
  assert.match(migration, /JOIN public\.class_students cs/);
  assert.match(migration, /cs\.student_id = v_student_id/);
  assert.doesNotMatch(
    migration.match(/CREATE OR REPLACE FUNCTION public\.get_visible_cambridge_tests_for_student[\s\S]*?\$\$;/)?.[0] || '',
    /WHERE[\s\S]*p_school_id|WHERE[\s\S]*p_student_grade/
  );
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_visible_cambridge_tests_for_student[\s\S]*FROM PUBLIC, anon/);
});

test('Cambridge stages use canonical grade and subject metadata', () => {
  assert.match(migration, /curriculum_subject text/);
  assert.match(migration, /curriculum_stage integer/);
  assert.match(migration, /mapped_grade_level integer/);
  assert.match(migration, /Stage 9 -> Grade 8/);
  assert.match(migration, /lower\(btrim\(ct\.curriculum_subject\)\) = lower\(btrim\(cta\.subject\)\)/);
});

test('teacher releases are class scoped and school availability remains the first gate', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.teacher_cambridge_class_visibility/);
  assert.match(migration, /PRIMARY KEY \(class_id, test_id\)/);
  assert.match(migration, /COALESCE\(sctv\.is_visible, true\)/);
  assert.match(teacherPortal, /get_teacher_cambridge_test_catalog/);
  assert.match(teacherPortal, /set_teacher_cambridge_class_visibility/);
  assert.match(teacherPortal, /bulk_set_teacher_cambridge_class_visibility/);
  assert.match(teacherPortal, /Release Cambridge Tests/);
});

test('role-specific copy clearly explains both access gates', () => {
  assert.doesNotMatch(teacherPortal, /title="Manage school-wide test visibility for your subjects"/);
  assert.match(teacherPortal, /school admin chooses which Cambridge tests the school can use/);
  assert.match(teacherPortal, /release available tests to each class you teach/);
  assert.match(schoolAdmin, /School availability is the first gate/);
  assert.match(schoolAdmin, /only after their teacher releases it to their class/);
});
