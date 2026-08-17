import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260812153000_teaching_staff_assignment_contract.sql');
const accountRoleMigration = read('supabase/migrations/20260812154500_legacy_school_admin_role_normalization.sql');
const app = read('App.tsx');
const teachers = read('components/school-admin/tabs/TeachersTab.tsx');
const roster = read('components/ClassRoster.tsx');
const head = read('components/SchoolHeadPortal.tsx');

test('new school owners start as administrators without implicit teaching status', () => {
  assert.match(migration, /before insert on public\.school_members/);
  assert.match(migration, /if new\.is_owner then\s+new\.can_teach := false/);
  assert.match(migration, /Explicit teaching-staff registration/);
  assert.match(accountRoleMigration, /sm\.role_in_school = 'school_admin'/);
  assert.match(accountRoleMigration, /set role = 'school_admin'/);
});

test('administrator teaching status is owner-controlled, audited, and assignment-safe', () => {
  assert.match(migration, /rpc_school_admin_set_teaching_staff_status/);
  assert.match(migration, /not public\.is_school_owner\(p_school_id\)/);
  assert.match(migration, /ACTIVE_ASSIGNMENTS_REQUIRE_RESOLUTION/);
  assert.match(migration, /insert into public\.school_member_role_audit/);
  assert.match(migration, /revoke all on function public\.rpc_school_admin_set_teaching_staff_status[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.rpc_school_admin_set_teaching_staff_status[\s\S]*to authenticated/);
});

test('Teacher Workspace for an administrator requires both registration and an active assignment', () => {
  assert.match(migration, /'has_active_teaching_assignment', v_has_active_assignment/);
  assert.match(app, /profile\?\.role === 'teacher' && !schoolCapabilities\?\.can_administer/);
  assert.match(app, /schoolCapabilities\?\.can_teach && hasActiveTeacherAllocation/);
  assert.match(app, /capabilities\?\.can_teach && capabilities\.has_active_teacher_allocation/);
});

test('teacher allocation keeps invitation access and the operational allocation flow', () => {
  assert.match(teachers, /<InvitesTab showRotate=\{false\}/);
  assert.match(teachers, /selectedFilterGrade|setFilterSubject|No allocations match these filters/);
  assert.match(teachers, /handleAllocateTeacher/);
});

test('student placement and executive programmes have professional setup states', () => {
  assert.match(roster, /Ready for enrolment/);
  assert.match(roster, /No registered students yet/);
  assert.doesNotMatch(roster, /Attendance register|Lv\.|student\.level/);
  assert.match(head, /No active programmes/);
  assert.match(head, /Review programmes and billing/);
});
