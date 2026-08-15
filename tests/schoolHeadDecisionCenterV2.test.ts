import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (filePath: string) => fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8');
const migration = read('supabase/migrations/20260815165505_school_head_decision_center_v2.sql');
const teacherAllocationGateMigration = read('supabase/migrations/20260815180000_fix_teacher_allocation_entitlement_gate.sql');
const portal = read('components/SchoolHeadPortal.tsx');
const headService = read('services/schoolHeadService.ts');
const adminService = read('services/schoolAdminService.ts');
const listTeacherAllocationsService = adminService.slice(
  adminService.indexOf('export async function listTeacherAllocations'),
  adminService.indexOf('export async function allocateTeacherToClassSubject'),
);
const teachersTab = read('components/school-admin/tabs/TeachersTab.tsx');
const dispatcher = read('supabase/functions/school_email_dispatcher/index.ts');

test('Decision Center evaluates the complete executive signal set', () => {
  for (const decisionKey of [
    'missing_class_subject_teachers', 'inactive_teacher_assignments', 'unassigned_teachers',
    'teacher_overload', 'unplaced_students', 'empty_classes', 'academic_decline',
    'overdue_grading_reviews', 'low_assignment_completion', 'student_disengagement',
    'curriculum_activity_gaps', 'stalled_admissions', 'no_delegated_admin',
    'missing_guardian_links', 'seat_capacity', 'subscription_risk',
    'enabled_programs_unconfigured', 'school_data_quality',
  ]) assert.match(migration, new RegExp(`'${decisionKey}'`));
});

test('class coverage is evaluated at required class-subject level with eligible active teachers', () => {
  assert.match(migration, /m\.subject_requirement='required'/);
  assert.match(migration, /m\.grade_level=c\.grade_level/);
  assert.match(migration, /cta\.class_id=c\.id/);
  assert.match(migration, /sm\.status='active' and sm\.can_teach/);
  assert.match(migration, /academic_normalize_subject_key\(cta\.subject\)=s\.code/);
});

test('executive alerts persist, auto-resolve, deduplicate, and follow severity cadence', () => {
  assert.match(migration, /create table if not exists public\.school_head_decision_alerts/);
  assert.match(migration, /unique \(school_id, decision_key\)/);
  assert.match(migration, /status='resolved',resolved_at=now\(\)/);
  assert.match(migration, /school-head-decision-digest-/);
  assert.match(migration, /when 'critical' then interval '1 day'/);
  assert.match(migration, /else interval '7 days'/);
  assert.match(migration, /cron\.schedule\('school-head-decision-center'/);
  assert.match(dispatcher, /case "school_head_decision_digest"/);
});

test('Decision Center exposes accountable evidence and notification policy', () => {
  for (const field of ['category', 'owner', 'why', 'age_days', 'affected', 'notification_level']) {
    assert.match(headService, new RegExp(field));
  }
  assert.match(headService, /rpc\('rpc_school_head_refresh_decision_alerts'/);
  assert.match(portal, /Why this matters:/);
  assert.match(portal, /Affected records/);
  assert.match(portal, /Resolved records close automatically/);
});

test('teacher allocations carry and render teacher identity independently of eligibility list', () => {
  assert.match(migration, /'teacher_name',coalesce\(nullif\(u\.full_name,''\),nullif\(u\.username,''\),u\.email,'Unknown teacher'\)/);
  assert.match(migration, /'teacher_email',u\.email/);
  assert.match(listTeacherAllocationsService, /teacher_name: row\.teacher_name \|\| row\.teacher_username \|\| row\.teacher_email/);
  assert.match(listTeacherAllocationsService, /throw new Error\(error\.message \|\| 'Teacher allocations could not be loaded\.'/);
  assert.match(listTeacherAllocationsService, /catch \(err\)[\s\S]*?throw err instanceof Error/);
  assert.doesNotMatch(listTeacherAllocationsService, /return \[\];/);
  assert.match(teachersTab, /allocation\.teacher_name \|\| teacher\?\.username/);
  assert.match(teachersTab, /Allocation needs staff-status review/);
});

test('core teacher allocation administration is not gated by the student assignments add-on', () => {
  assert.match(teacherAllocationGateMigration, /Core teacher allocation is school administration/);
  assert.match(teacherAllocationGateMigration, /'\/rpc\/school_admin_list_teacher_assignments'/);
  assert.match(teacherAllocationGateMigration, /'\/rpc\/school_admin_delete_teacher_assignment'/);
  assert.match(teacherAllocationGateMigration, /then\s+return;\s+end if;/);
  assert.match(teacherAllocationGateMigration, /'\/assignments','\/assignment_questions'/);
  assert.match(teacherAllocationGateMigration, /v_feature := 'assignments'/);
});

test('new service-role and authenticated RPC boundaries remain fail closed', () => {
  assert.match(migration, /school_head_access_required/);
  assert.match(migration, /school_administrator_access_required/);
  assert.match(migration, /revoke all on function public\.rpc_school_head_refresh_decision_alerts\(uuid,integer\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.rpc_school_head_refresh_decision_alerts\(uuid,integer\) to authenticated/);
  assert.match(migration, /revoke all on function public\.rpc_refresh_all_school_head_decisions\(\)[\s\S]*from public, anon, authenticated/);
});
