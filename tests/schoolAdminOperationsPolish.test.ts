import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file: string) => readFileSync(file, 'utf8');
const portal = read('components/SchoolAdminPortal.tsx');
const members = read('components/school-admin/tabs/MembersTab.tsx');
const memberModal = read('components/school-admin/modals/MemberActionModal.tsx');
const teachers = read('components/school-admin/tabs/TeachersTab.tsx');
const classes = read('components/school-admin/tabs/ClassesTab.tsx');
const admissions = read('components/AdmissionHub.tsx');
const service = read('services/schoolAdminService.ts');
const styles = read('src/index.css');
const realNameSearchMigration = read('supabase/migrations/20260808180000_school_member_real_name_search.sql');

test('staff and student naming is consistent in the admin portal', () => {
  assert.match(portal, /label: 'Staff & Students'/);
  assert.match(members, /<h2>Staff &amp; Students<\/h2>/);
  assert.doesNotMatch(members, /Students &amp; Staff/);
});

test('member search uses real names, usernames, and emails and highlights matches', () => {
  assert.match(realNameSearchMigration, /u\.full_name ilike/);
  assert.match(realNameSearchMigration, /u\.username ilike/);
  assert.match(realNameSearchMigration, /u\.email ilike/);
  assert.match(realNameSearchMigration, /set search_path = ''/);
  assert.match(realNameSearchMigration, /public\.school_members/);
  assert.match(service, /row\.full_name \?\? identity\?\.full_name/);
  assert.match(members, /highlightMatch\(member\.full_name \|\| member\.username, memberSearch\)/);
  assert.match(members, /highlightMatch\(member\.username, memberSearch\)/);
  assert.match(members, /highlightMatch\(member\.email, memberSearch\)/);
  assert.match(styles, /\.community-search-match/);
});

test('member filters and student placement share grade-level-first class controls', () => {
  assert.match(members, /Filter staff and students by role/);
  assert.match(members, /Grade level/);
  assert.match(members, /Account status/);
  assert.match(memberModal, /Choose grade level first/);
  assert.match(memberModal, /classesForAcademicYear/);
  assert.match(memberModal, /setSelectedClassId\(''\)/);
});

test('bulk actions omit role changes and report already-active unban selections', () => {
  assert.doesNotMatch(members, /Change role to student|Change role to teacher|role:student|role:teacher/);
  assert.match(portal, /already active and not banned/);
  assert.match(portal, /already active and will be skipped/);
  assert.match(portal, /const bannedMembers = selectedMembers\.filter/);
});

test('teacher assignments lead with current coverage and use school-created grade offerings', () => {
  const currentPosition = teachers.indexOf('id="current-assignments-title"');
  const formPosition = teachers.indexOf('id="assign-teacher-panel"');
  assert.ok(currentPosition >= 0 && currentPosition < formPosition);
  assert.match(teachers, /availableTeachers\.length \? 'Assign teacher'/);
  assert.match(teachers, /Print teacher allocation register/);
  assert.match(teachers, /Filter assignments by grade level/);
  assert.match(teachers, /Select grade level first/);
  assert.match(teachers, /assignableSubjects\.map/);
  assert.match(teachers, /assignmentClasses\.map/);
  assert.match(teachers, /selectedFilterGrade/);
  assert.match(teachers, /No teaching staff registered yet/);
});

test('classes group teaching coverage by grade level and expose no archive action', () => {
  assert.match(classes, /Grades, classes and teaching coverage/);
  assert.match(classes, /grades\.map/);
  assert.match(classes, /<select[\s\S]*?Select grade level/);
  assert.match(classes, /handleEditClass\(row\)/);
  assert.doesNotMatch(classes, /Filter classes by academic year \(grade\)/);
  assert.doesNotMatch(classes, /Archive Class|>\s*Archive\s*<\/|archiveSchoolClass/);
  assert.doesNotMatch(classes, />Active<\/label>/);
});

test('admission candidates use sortable sticky identity rows and pagination', () => {
  assert.match(admissions, /candAcademicYearFilter/);
  assert.match(admissions, /changeCandidateSort\('name'\)/);
  assert.match(admissions, /changeCandidateSort\('academic_year'\)/);
  assert.match(admissions, /pagedCandidates\.map/);
  assert.match(admissions, /admission-candidate-sticky/);
  assert.match(admissions, /candidateTotalPages/);
  assert.match(styles, /\.admission-candidate-sticky\{position:sticky;left:0/);
  assert.match(styles, /\.admission-candidate-row\.is-odd/);
});
