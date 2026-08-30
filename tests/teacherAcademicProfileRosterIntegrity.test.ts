import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const retiredMembershipRepair = readFileSync(
  'supabase/migrations/20260830061952_repair_academic_profile_student_memberships.sql',
  'utf8',
);
const reportingRoleFix = readFileSync(
  'supabase/migrations/20260830062029_fix_academic_reporting_teacher_role_resolution.sql',
  'utf8',
);
const rolloverGuard = readFileSync(
  'supabase/migrations/20260830062050_guard_rollover_target_enrolment_membership.sql',
  'utf8',
);
const liveRosterFix = readFileSync(
  'supabase/migrations/20260830071032_fix_academic_profile_live_roster_authority.sql',
  'utf8',
);
const operationalStudentContextFix = readFileSync(
  'supabase/migrations/20260830105211_fix_academic_profile_operational_student_context.sql',
  'utf8',
);
const teacherProfiles = readFileSync(
  'components/student-progress/TeacherAcademicProfilesPage.tsx',
  'utf8',
);

test('academic enrolments never recreate removed school memberships', () => {
  assert.match(retiredMembershipRepair, /RETIRED/i);
  assert.match(retiredMembershipRepair, /do not infer or recreate school membership/i);
  assert.doesNotMatch(retiredMembershipRepair, /insert into public\.school_members/i);
  assert.doesNotMatch(retiredMembershipRepair, /academic_resolve_operational_year_id/i);
});

test('teacher reporting context resolves active assigned teachers before student fallback', () => {
  const teacherBranch = reportingRoleFix.indexOf("then v_role := 'teacher';", reportingRoleFix.indexOf('p_student_id is null and exists'));
  const studentFallback = reportingRoleFix.indexOf("then v_role := 'student';", teacherBranch);
  assert.ok(teacherBranch >= 0, 'teacher role branch should exist');
  assert.ok(studentFallback > teacherBranch, 'teacher role must be resolved before the student fallback');
  assert.match(reportingRoleFix, /cta\.teacher_user_id = v_caller/i);
  assert.match(reportingRoleFix, /cta\.active is true/i);
});

test('rollover cannot create target enrolments for non-members', () => {
  assert.match(rolloverGuard, /rollover_student_membership_required/i);
  assert.match(rolloverGuard, /sm\.status = 'active'/i);
  assert.match(rolloverGuard, /sm\.role_in_school = 'student'/i);
  assert.match(rolloverGuard, /insert into public\.student_academic_enrolments/i);
});

test('current academic profile directory uses active live class placement instead of prepared rollover rows', () => {
  assert.match(liveRosterFix, /p_academic_year_id = v_operational_year_id/i);
  assert.match(liveRosterFix, /join public\.class_students cs/i);
  assert.match(liveRosterFix, /sm\.status = 'active'/i);
  assert.match(liveRosterFix, /sm\.role_in_school = 'student'/i);
  assert.match(liveRosterFix, /p_academic_year_id is distinct from v_operational_year_id/i);
  assert.match(liveRosterFix, /from public\.student_academic_enrolments e/i);
  assert.match(liveRosterFix, /grant execute on function public\.rpc_teacher_academic_profile_students_for_year\(uuid\) to authenticated, service_role/i);
});

test('current Academic Profile detail and subject access use the same live placement authority', () => {
  assert.match(operationalStudentContextFix, /if v_year = v_operational_year then/i);
  assert.match(operationalStudentContextFix, /Current\/operational year: live class placement is authoritative/i);
  assert.match(operationalStudentContextFix, /if v_year\.id = v_operational_year_id then/i);
  assert.match(operationalStudentContextFix, /mirror the active live placement shown by School Admin/i);
  assert.match(operationalStudentContextFix, /'archived', v_year\.id <> v_operational_year_id/i);
  assert.match(operationalStudentContextFix, /Historical years continue to use the stored academic-year enrolment/i);
});

test('live placement changes synchronize the operational academic enrolment without widening membership', () => {
  assert.match(operationalStudentContextFix, /create or replace function private\.academic_sync_operational_student_placement/i);
  assert.match(operationalStudentContextFix, /operational_student_membership_required/i);
  assert.match(operationalStudentContextFix, /context_quality = 'confirmed'/i);
  assert.match(operationalStudentContextFix, /rpc_school_admin_transfer_student_placement/i);
  assert.match(operationalStudentContextFix, /rpc_setup_approved_class_enrollment/i);
  assert.match(operationalStudentContextFix, /perform private\.academic_sync_operational_student_placement/i);
  assert.doesNotMatch(operationalStudentContextFix, /insert into public\.school_members/i);
});

test('removing a student from school clears current placement but preserves historical enrolment records', () => {
  assert.match(liveRosterFix, /delete from public\.class_students cs/i);
  assert.match(liveRosterFix, /update public\.school_ops_group_students gs/i);
  assert.match(liveRosterFix, /v_target\.role_in_school = 'student'/i);
  assert.doesNotMatch(liveRosterFix, /delete from public\.student_academic_enrolments/i);
});

test('teacher academic profiles explain an empty authorised roster instead of showing a dead picker', () => {
  assert.match(teacherProfiles, /students\.length === 0/i);
  assert.match(teacherProfiles, /No eligible students are currently rostered to your authorised class allocations/i);
  assert.match(teacherProfiles, /students\.length > 0/i);
  assert.match(teacherProfiles, /AcademicStudentPicker/i);
});
