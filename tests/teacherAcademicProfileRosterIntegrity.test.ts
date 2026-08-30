import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const membershipRepair = readFileSync(
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
const teacherProfiles = readFileSync(
  'components/student-progress/TeacherAcademicProfilesPage.tsx',
  'utf8',
);

test('academic profile membership repair stays operational-year and conflict scoped', () => {
  assert.match(membershipRepair, /academic_resolve_operational_year_id/i);
  assert.match(membershipRepair, /having count\(distinct oe\.school_id\) = 1/i);
  assert.match(membershipRepair, /sm\.status = 'active'/i);
  assert.match(membershipRepair, /sm\.school_id <> e\.school_id/i);
  assert.match(membershipRepair, /insert into public\.school_members/i);
  assert.doesNotMatch(membershipRepair, /update public\.users/i);
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

test('teacher academic profiles explain an empty authorised roster instead of showing a dead picker', () => {
  assert.match(teacherProfiles, /students\.length === 0/i);
  assert.match(teacherProfiles, /No eligible students are currently rostered to your authorised class allocations/i);
  assert.match(teacherProfiles, /students\.length > 0/i);
  assert.match(teacherProfiles, /AcademicStudentPicker/i);
});
