import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260817130000_school_identity_requests_and_invite_rules.sql');
const settings = read('components/school-admin/tabs/SettingsTab.tsx');
const admin = read('components/AdminPortal.tsx');
const schoolAdmin = read('components/SchoolAdminPortal.tsx');
const head = read('components/SchoolHeadPortal.tsx');
const headStyles = read('src/styles/school-head.css');
const invites = read('components/school-admin/tabs/InvitesTab.tsx');
const teachers = read('components/school-admin/tabs/TeachersTab.tsx');
const setup = read('components/onboarding/SetupWizard.tsx');
const app = read('App.tsx');
const chooser = read('components/SchoolWorkspaceChooser.tsx');
const schoolAdminNavIcon = read('components/school-admin/SchoolAdminNavIcon.tsx');

test('identity changes use a superadmin-governed unlock queue', () => {
  assert.match(migration, /create table if not exists public\.school_identity_change_requests/);
  assert.match(migration, /rpc_school_request_identity_change/);
  assert.match(migration, /rpc_superadmin_list_school_identity_change_requests/);
  assert.match(migration, /rpc_superadmin_decide_school_identity_change_request/);
  assert.match(migration, /set identity_confirmed_at = null/);
  assert.match(migration, /status = 'completed'/);
  assert.match(migration, /revoke all on table public\.school_identity_change_requests from public, anon, authenticated/);
  assert.match(settings, /requestSchoolIdentityChange/);
  assert.match(settings, /Send request to superadmin/);
  assert.doesNotMatch(settings, /mailto:/);
  assert.match(admin, /identity-requests/);
  assert.match(admin, /activeTab === 'identity-requests' && isSuperadmin/);
});

test('registration rules fail closed before student or teacher membership is created', () => {
  const studentGuard = migration.indexOf("v_role = 'student' and coalesce((v_school.settings->>'allow_student_signup')::boolean, false) is not true");
  const teacherGuard = migration.indexOf("v_role = 'teacher' and coalesce((v_school.settings->>'allow_teacher_signup')::boolean, false) is not true");
  const membershipInsert = migration.indexOf('insert into public.school_members');
  assert.ok(studentGuard >= 0 && studentGuard < membershipInsert);
  assert.ok(teacherGuard >= 0 && teacherGuard < membershipInsert);
  assert.match(settings, /When unchecked, students cannot join this school by code or invitation link/);
  assert.match(settings, /When unchecked, teachers cannot join this school by code or invitation link/);
});

test('teacher allocation is invitation-only and links skip code entry after validation', () => {
  assert.match(teachers, /<InvitesTab showRotate=\{false\}/);
  assert.doesNotMatch(teachers, /allocationClasses|selectedFilterGrade|admin-table-scroll/);
  assert.match(invites, /searchParams\.set\('schoolInvite', school\.invite_code\)/);
  assert.match(invites, /Send invitation link/);
  assert.match(setup, /get\('schoolInvite'\)/);
  assert.match(setup, /handleInviteCodeValidate\(linkedCode\)/);
  assert.match(setup, /p_role: finalRole/);
});

test('school administration uses broad-to-specific core ordering and embeds progress tools', () => {
  const labels = ['Overview', 'Curriculum & Subjects', 'Classes & Registration', 'Teacher Allocation', 'Staff & Students', 'Document Center', 'Plan & Billing', 'School Settings'];
  let previous = -1;
  labels.forEach((label) => {
    const position = schoolAdmin.indexOf(`label: '${label}'`);
    assert.ok(position > previous, `${label} must follow the requested navigation order`);
    previous = position;
  });
  assert.match(schoolAdmin, /<TeacherAcademicProfilesPage/);
  assert.match(schoolAdmin, /<TeacherInterventionIntelligencePage/);
  assert.match(schoolAdmin, /<GuardianManagementPage/);
  assert.doesNotMatch(schoolAdmin, /window\.location\.assign/);
});

test('School Admin navigation uses SVG icons instead of initials on desktop and mobile', () => {
  assert.match(schoolAdmin, /<SchoolAdminNavIcon name=\{tab\.icon\}/);
  assert.match(schoolAdmin, /<SchoolAdminNavIcon name=\{tool\.icon\}/);
  assert.match(schoolAdmin, /<SchoolAdminNavIcon name=\{icon\}/);
  assert.match(schoolAdmin, /<SchoolAdminNavIcon name="more"/);
  assert.doesNotMatch(schoolAdmin, /icon: '(OV|CU|CL|TA|PE|DO|BI|SE|AD|CA|IE|AP|IN|PG|EX|AS|RE|RS|SP)'/);
  assert.match(schoolAdminNavIcon, /<svg/);
  assert.match(schoolAdminNavIcon, /stroke="currentColor"/);
});

test('School Head setup is removed and responsive navigation uses icons', () => {
  assert.doesNotMatch(head, /First login setup|School launch checklist|setupChecklist/);
  assert.match(head, /Important school matters, in priority order/);
  assert.match(head, /Day-to-day school alerts stay in School Administration/);
  assert.match(head, /HeadNavIcon/);
  assert.doesNotMatch(head, /code: 'EO'|code: 'DC'|>•••</);
  assert.match(head, /useSmartCollapsedNavigation/);
  assert.match(head, /createPortal/);
  assert.match(headStyles, /school-head-layout\.is-sidebar-collapsed/);
  assert.match(headStyles, /school-head-mobile-menu-layer/);
});

test('School Head and School Admin switch dashboards from matching header actions', () => {
  assert.match(schoolAdmin, /className="school-admin-workspace-switch">Principal Dashboard<\/button>/);
  assert.match(head, /className="school-head-workspace-switch"[\s\S]*?>School Admin Dashboard<\/button>/);
  assert.doesNotMatch(head, />Operational Administration/);
  assert.match(headStyles, /button:not\(\.school-head-signout\):not\(\.school-head-workspace-switch\)/);
});

test('all detected account roles are offered in the post-sign-in workspace chooser', () => {
  assert.match(app, /getGuardianChildren/);
  assert.match(app, /hasParentWorkspace/);
  assert.match(app, /resolveAccountWorkspace/);
  assert.match(app, /case 'parent'/);
  assert.match(app, /onOpenParent/);
  assert.match(chooser, /School Head/);
  assert.match(chooser, /School Administration/);
  assert.match(chooser, /Teacher Portal/);
  assert.match(chooser, /Parent Portal/);
  assert.match(chooser, /Student Dashboard/);
  assert.match(chooser, /Super Admin/);
  assert.doesNotMatch(chooser, /🏫|📚/);
});
