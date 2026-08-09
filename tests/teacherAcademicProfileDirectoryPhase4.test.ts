import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260809174500_teacher_academic_profile_directory.sql', 'utf8');
const page = readFileSync('components/student-progress/TeacherAcademicProfilesPage.tsx', 'utf8');
const entry = readFileSync('teacher-academic-profiles.html', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');

test('teacher directory returns only active class assignment students', () => {
  assert.match(migration, /class_students/i);
  assert.match(migration, /class_teacher_assignments/i);
  assert.match(migration, /teacher_user_id = v_caller/i);
  assert.match(migration, /cta\.active is true/i);
  assert.match(migration, /array_agg\(distinct cta\.subject/i);
  assert.match(migration, /revoke all on function public\.rpc_teacher_academic_profile_students\(\) from public, anon/i);
});

test('teacher academic profile directory supports search class subject and one-click report flow', () => {
  assert.match(page, /Student Academic Profiles/i);
  assert.match(page, /Search/i);
  assert.match(page, /Class/i);
  assert.match(page, /Subject/i);
  assert.match(page, /Open academic profile/i);
  assert.match(page, /StudentAcademicProfile/i);
  assert.match(page, /Only students and subjects covered by your active teaching assignments/i);
});

test('teacher academic profile directory is a production build entry', () => {
  assert.match(entry, /teacher-academic-profiles-root/i);
  assert.match(vite, /teacherAcademicProfiles:\s*path\.resolve\(__dirname, 'teacher-academic-profiles\.html'\)/i);
});
