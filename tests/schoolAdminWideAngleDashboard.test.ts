import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file: string) => readFileSync(file, 'utf8');
const dashboard = read('components/school-admin/tabs/DashboardTab.tsx');
const classes = read('components/school-admin/tabs/ClassesTab.tsx');
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

test('overview exposes the requested whole-school totals without duplicating class coverage', () => {
  const labels = ['Classes', 'Subjects', 'Students', 'Teaching staff', 'Admins'];
  let previous = -1;
  labels.forEach((label) => {
    const position = dashboard.indexOf(`label: '${label}'`);
    assert.ok(position > previous, `${label} should appear in the requested order`);
    previous = position;
  });
  assert.doesNotMatch(dashboard, /Grades, classes and teaching coverage/);
  assert.doesNotMatch(dashboard, /Setup readiness/);
});

test('classes and registration owns editable grade-class teaching coverage', () => {
  assert.doesNotMatch(classes, /Classes in school/);
  assert.match(classes, /Grades, classes and teaching coverage/);
  assert.match(classes, /studentCount/);
  assert.match(classes, /teacherCount/);
  assert.match(classes, /subjects:/);
  assert.match(classes, /handleEditClass\(row\)/);
  assert.match(classes, /aria-label={`Edit \${row\.class_code}`}/);
});

test('teacher allocation exposes the invitation code and link instead of operational allocation tables', () => {
  assert.match(teachers, /<InvitesTab showRotate=\{false\}/);
  assert.doesNotMatch(teachers, />Class <|>Subject <|changeSort|admin-table-scroll/);
  assert.match(service, /allocated_at: row\.allocated_at \?\? row\.created_at/);
  assert.match(migration, /'assigned_at'/);
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
  assert.match(workspaceChooser, /Your account has more than one role/);
  assert.match(workspaceChooser, /Parent Portal/);
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

test('admissions uses formal light modals, fitted candidate actions, and explicit workflow steps', () => {
  assert.match(admission, /school-admin-modal school-admin-detail-modal/);
  assert.match(admission, /school-admin-detail-header/);
  assert.match(admission, /school-admin-detail-body/);
  assert.match(admission, /school-admin-modal-close/);
  assert.match(admission, /admission-candidate-sticky/);
  assert.match(admission, /admission-candidate-actions/);
  assert.match(admission, /admin-button-danger admin-button-small/);
  assert.match(admission, /aria-label="Admission workflow steps"/);
  assert.match(admission, /Step \{i \+ 1\}/);
});
