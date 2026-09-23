import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const subjects = readFileSync('components/school-admin/SchoolSubjectsManager.tsx', 'utf8');
const groupsPanel = readFileSync('components/school-admin/SubjectTeachingGroupsPanel.tsx', 'utf8');
const teachers = readFileSync('components/school-admin/tabs/TeachersTab.tsx', 'utf8');
const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const wizard = readFileSync('components/teacher/AssignmentWizard.tsx', 'utf8');
const questionBank = readFileSync('components/teacher/QuestionBank.tsx', 'utf8');
const batch = readFileSync('components/teacher/QuestionBatchWorkspace.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260923142000_complete_subject_teaching_groups.sql', 'utf8');

test('School Subjects owns delivery, custom rosters and group staffing', () => {
  assert.match(subjects, /SubjectTeachingGroupsPanel/);
  assert.match(groupsPanel, /By registration class/);
  assert.match(groupsPanel, /Whole grade/);
  assert.match(groupsPanel, /Custom teaching groups/);
  assert.match(groupsPanel, /setSchoolSubjectGroupStudents/);
  assert.match(groupsPanel, /setSchoolSubjectGroupTeacher/);
  assert.doesNotMatch(subjects, /manageTeacherAllocation/);
});

test('Teacher Allocation operates on exact teaching groups instead of registration-class subject text', () => {
  assert.match(teachers, /fetchSchoolSubjectGroups/);
  assert.match(teachers, /setSchoolSubjectGroupTeacher/);
  assert.match(teachers, /Grade → School Subject → Teaching Group|exact teaching groups|Teaching group/);
  assert.doesNotMatch(teachers, /allocateTeacherToSchoolSubject/);
});

test('teacher Question Bank fails closed when a school teacher has no allocated subjects', () => {
  assert.match(questionBank, /restrictedSubjects === undefined/);
  assert.match(questionBank, /isMyPoolQuestion\(question, teacher\?\.id\)/);
  assert.match(batch, /restrictedSubjects === undefined/);
  assert.match(portal, /restrictedSubjects=\{profile\.school_id \? teacherResourceSubjects : undefined\}/);
  assert.doesNotMatch(migration, /not v_has_allocations/);
  assert.match(migration, /school_subject_group_teachers/);
});

test('assignment wizard uses school subject plus teaching group while resources follow academic mapping', () => {
  assert.match(portal, /fetchTeacherTeachingGroups/);
  assert.match(portal, /assignmentGroupId/);
  assert.match(wizard, /Choose the teaching group this assignment belongs to/);
  assert.match(wizard, /selectedTeachingGroup\?\.academicSubjectName \|\| assignmentSubject/);
  assert.match(portal, /school_subject_id: selectedTeachingGroup\?\.schoolSubjectId/);
  assert.match(portal, /subject_group_id: selectedTeachingGroup\?\.id/);
});

test('database integration keeps group assignment reads and authorization first-class', () => {
  assert.match(migration, /rpc_teacher_attach_assignment_group/);
  assert.match(migration, /rpc_teacher_assignment_group_context/);
  assert.match(migration, /a\.subject_group_id is not null/);
  assert.match(migration, /private\.subject_group_roster/);
  assert.match(migration, /rpc_school_admin_subject_group_roster/);
  assert.match(migration, /'deliveryMode',o\.delivery_mode/);
});
