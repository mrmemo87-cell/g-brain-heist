import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const subjectsManager = readFileSync('components/school-admin/SchoolSubjectsManager.tsx', 'utf8');
const academicSetup = readFileSync('components/school-admin/AcademicSetupPanel.tsx', 'utf8');
const teachersTab = readFileSync('components/school-admin/tabs/TeachersTab.tsx', 'utf8');
const adminPortal = readFileSync('components/SchoolAdminPortal.tsx', 'utf8');
const adminService = readFileSync('services/schoolAdminService.ts', 'utf8');
const teacherPortal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const gameService = readFileSync('services/gameService.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260923105000_school_subject_allocation_consistency.sql', 'utf8');

test('school subjects remain school-owned and dynamically named', () => {
  assert.match(subjectsManager, /Your school owns this catalogue/);
  assert.match(subjectsManager, /academic mapping is optional/i);
  assert.doesNotMatch(subjectsManager, /Add English, ESL, Math Club, Chinese/);
});

test('Academic Setup is coverage-only and no longer mutates school subject access', () => {
  assert.match(academicSetup, /title="Curriculum coverage"/);
  assert.match(academicSetup, /School Subjects is the source of truth/);
  assert.match(academicSetup, /Nothing on this screen changes student access or teacher allocation/);
  assert.doesNotMatch(academicSetup, /saveSubjectOfferings/);
  assert.doesNotMatch(academicSetup, /setStudentElective/);
  assert.doesNotMatch(academicSetup, /Elective — selected students/);
});

test('teacher allocation uses exact school-subject teaching groups', () => {
  assert.match(teachersTab, /fetchSchoolSubjectGroups/);
  assert.match(teachersTab, /allocationSubjectId/);
  assert.match(teachersTab, /group\.schoolSubjectId/);
  assert.match(teachersTab, /setSchoolSubjectGroupTeacher/);
  assert.match(teachersTab, /Teaching group/);
  assert.doesNotMatch(teachersTab, /allocateTeacherToSchoolSubject/);
});

test('teacher/admin reads show the same local school subject identity', () => {
  assert.match(migration, /coalesce\(ss\.name,cta\.subject\)::text/);
  assert.match(migration, /'subject',coalesce\(ss\.name,cta\.subject\)/);
  assert.match(migration, /where cta\.school_id=p_school_id\s+and cta\.active/);
});

test('legacy canonical-label collisions are split without hardcoded subject names', () => {
  assert.match(migration, /exact\.academic_subject_id=linked\.academic_subject_id/);
  assert.match(migration, /insert into public\.class_teacher_assignments/);
  assert.match(migration, /set school_subject_id=r\.exact_subject_id/);
  assert.match(migration, /cta_unique_class_teacher_school_subject/);
  assert.match(migration, /insert into public\.school_subject_offerings/);
  assert.match(migration, /'all_grade'/);
  assert.match(migration, /on conflict \(school_subject_id,academic_year_id,grade_level\) do nothing/);
  assert.doesNotMatch(migration, /Silk Road|Jess|\bESL\b|\bEnglish\b/);
});

test('selected-student access constrains assignment audiences by school subject', () => {
  assert.match(migration, /private\.teacher_assignment_authorized_students/);
  assert.match(migration, /public\.school_subject_offerings/);
  assert.match(migration, /r\.access_mode='all_grade'/);
  assert.match(migration, /r\.access_mode='selected'/);
  assert.match(migration, /public\.school_subject_enrolments/);
  assert.match(migration, /enrolment\.school_subject_id=r\.school_subject_id/);
});


test('mapped academic resources are shared without merging local subject identity', () => {
  assert.match(gameService, /canonicalName\?: string \| null/);
  assert.match(gameService, /export const fetchStudentAcademicSubjectCatalog/);
  assert.match(teacherPortal, /teacherSubjectResourceMap/);
  assert.match(teacherPortal, /assignmentResourceSubject/);
  assert.match(teacherPortal, /q\.subject === assignmentSubject \|\| q\.subject === assignmentResourceSubject/);
  assert.match(teacherPortal, /teacherResourceSubjects/);
});
