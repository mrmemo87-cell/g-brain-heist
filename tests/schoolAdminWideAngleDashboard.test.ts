import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file: string) => readFileSync(file, 'utf8');
const dashboard = read('components/school-admin/tabs/DashboardTab.tsx');
const teachers = read('components/school-admin/tabs/TeachersTab.tsx');
const members = read('components/school-admin/modals/MemberActionModal.tsx');
const memberDirectory = read('components/school-admin/tabs/MembersTab.tsx');
const portal = read('components/SchoolAdminPortal.tsx');
const admission = read('components/AdmissionHub.tsx');
const settings = read('components/school-admin/tabs/SettingsTab.tsx');
const service = read('services/schoolAdminService.ts');
const migration = read('supabase/migrations/20260801120000_school_admin_assignment_dates.sql');
const capabilitiesMigration = read('supabase/migrations/20260801173000_school_membership_capabilities.sql');
const app = read('App.tsx');
const workspaceChooser = read('components/SchoolWorkspaceChooser.tsx');

test('overview exposes the requested whole-school totals and grade-class coverage', () => {
  const labels = ['Classes', 'Subjects', 'Students', 'Teaching staff', 'Admins'];
  let previous = -1;
  labels.forEach((label) => {
    const position = dashboard.indexOf(`label: '${label}'`);
    assert.ok(position > previous, `${label} should appear in the requested order`);
    previous = position;
  });
  assert.match(dashboard, /Grades, classes and teaching coverage/);
  assert.match(dashboard, /studentCount/);
  assert.match(dashboard, /teacherCount/);
  assert.match(dashboard, /subjects:/);
  assert.doesNotMatch(dashboard, /Setup readiness/);
});

test('teacher assignment flow is class-subject-teacher with subject filtering and sortable columns', () => {
  const classPosition = teachers.indexOf('>Class <');
  const subjectPosition = teachers.indexOf('>Subject <');
  const teacherPosition = teachers.indexOf('>Teacher <');
  assert.ok(classPosition >= 0 && classPosition < subjectPosition && subjectPosition < teacherPosition);
  assert.match(teachers, /Filter assignments by subject/);
  for (const key of ['class', 'subject', 'teacher', 'assigned_at']) assert.match(teachers, new RegExp(`changeSort\\('${key}'\\)`));
  assert.doesNotMatch(teachers, /Active assignment/);
  assert.match(service, /assigned_at: row\.assigned_at/);
  assert.match(migration, /'assigned_at'/);
  assert.match(teachers, /getAssignableTeachers\(teachers \|\| \[\]\)/);
  assert.doesNotMatch(teachers, /protectedAdminIds/);
  assert.doesNotMatch(teachers, /school administrators are excluded/);
});

test('school administrator is protected and destructive actions use branded confirmations', () => {
  assert.match(members, /Protected school owner/);
  assert.match(members, /isProtectedAdmin/);
  assert.match(portal, /selectedMember\.is_owner/);
  assert.match(portal, /Change this member’s role\?/);
  assert.match(portal, /Suspend this student\?/);
  assert.match(admission, /school-admin-confirm-modal is-destructive/);
});

test('school membership capabilities are canonical, audited and assignment-safe', () => {
  assert.match(capabilitiesMigration, /add column if not exists is_owner/);
  assert.match(capabilitiesMigration, /add column if not exists can_teach/);
  assert.match(capabilitiesMigration, /school_members_one_owner_per_school_idx/);
  assert.match(capabilitiesMigration, /school_member_role_audit/);
  assert.match(capabilitiesMigration, /school_admin_transition_member_role/);
  assert.match(capabilitiesMigration, /ACTIVE_ASSIGNMENTS_REQUIRE_RESOLUTION/);
  assert.match(capabilitiesMigration, /Only the school owner can promote or demote delegated administrators/);
  assert.match(capabilitiesMigration, /school_admin_list_teachers[\s\S]*sm\.can_teach/);
  assert.match(capabilitiesMigration, /public\.update_member_role[\s\S]*school_admin_transition_member_role/);
});

test('dual-role staff can choose and switch workspaces without signing out', () => {
  assert.match(app, /workspace_chooser/);
  assert.match(app, /school_workspace:/);
  assert.match(app, /getMySchoolCapabilities/);
  assert.match(app, /onOpenTeacherPortal/);
  assert.match(workspaceChooser, /School Administration/);
  assert.match(workspaceChooser, /Teacher Portal/);
  assert.match(workspaceChooser, /switch again at any time without signing out/);
});

test('member management opens at the top and preloads existing academic placement', () => {
  assert.match(members, /modal\.scrollTop = 0/);
  assert.match(members, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(members, /autoFocus/);
  assert.match(memberDirectory, /studentAssignments\[member\.user_id\]/);
  assert.doesNotMatch(memberDirectory, /normaliseClassCode|schoolClass\.class_code.*member\.batch/s);
  assert.match(memberDirectory, /setSelectedGrade\(assignedClass\?\.grade_level \?\? member\.grade \?\? ''\)/);
});

test('admissions and settings removals match the school-admin brief', () => {
  assert.match(admission, /useState<AdmTab>\('overview'\)/);
  assert.doesNotMatch(admission, /Quick Action Cards/);
  assert.doesNotMatch(admission, /Advanced \/ Support Tools/);
  assert.doesNotMatch(settings, /Danger Zone/);
});

test('admissions uses formal light modals, fitted delete actions, and explicit workflow steps', () => {
  assert.match(admission, /school-admin-modal school-admin-detail-modal/);
  assert.match(admission, /school-admin-detail-header/);
  assert.match(admission, /school-admin-detail-body/);
  assert.match(admission, /school-admin-modal-close/);
  assert.match(admission, /school-admin-icon-button school-admin-icon-button--danger/);
  assert.match(admission, /admission-delete-column/);
  assert.match(admission, /aria-label="Admission workflow steps"/);
  assert.match(admission, /Step \{i \+ 1\}/);
});
