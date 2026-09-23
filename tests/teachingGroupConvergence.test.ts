import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (filePath: string) => readFileSync(filePath, 'utf8');

const groupSync = read('supabase/migrations/20260923145910_sync_subject_offering_teaching_groups.sql');
const bridge = read('supabase/migrations/20260923153843_bridge_by_class_group_allocations.sql');
const coreScope = read('supabase/migrations/20260923154650_converge_teacher_group_scope_core.sql');
const assignmentRls = read('supabase/migrations/20260923162137_teaching_group_reporting_and_assignment_rls.sql');
const history = read('supabase/migrations/20260923162334_snapshot_teaching_groups_for_academic_history.sql');
const writing = read('supabase/migrations/20260923162526_writing_teaching_group_roster_scope.sql');
const gapClosure = read('supabase/migrations/20260923162842_close_teaching_group_transition_gaps.sql');
const writingReview = read('supabase/migrations/20260923163024_writing_review_teaching_group_scope.sql');
const teacherPortal = read('components/TeacherPortal.tsx');

test('by-class offerings materialize class teaching groups and remain idempotent', () => {
  assert.match(groupSync, /delivery_mode = 'by_class'/i);
  assert.match(groupSync, /group_type\s*=\s*'class'/i);
  assert.match(groupSync, /registration_class_id/i);
  assert.match(groupSync, /on conflict \(school_subject_offering_id, registration_class_id\)/i);
  assert.match(groupSync, /sync_subject_groups_after_class_write/i);
});

test('by-class allocations keep the legacy compatibility mirror bidirectional', () => {
  assert.match(bridge, /sync_group_teacher_to_legacy_class_allocation/i);
  assert.match(bridge, /sync_legacy_class_allocation_to_group_teacher/i);
  assert.match(bridge, /v_group\.group_type <> 'class'/i);
  assert.match(bridge, /v_offering\.delivery_mode <> 'by_class'/i);
  assert.match(bridge, /teacher_current_teaching_groups/i);
});

test('current teacher visibility uses exact teaching-group roster scope', () => {
  assert.match(coreScope, /teacher_current_teaching_roster/i);
  assert.match(coreScope, /school_subject_group_students/i);
  assert.match(coreScope, /rpc_get_my_teacher_class_roster/i);
  assert.match(coreScope, /rpc_get_students_for_assignment/i);
  assert.match(coreScope, /rpc_teacher_academic_profile_students/i);
  assert.match(coreScope, /student_learning_can_manage_intervention/i);
});

test('assignment row policies explicitly permit canonical teaching-group ownership', () => {
  assert.match(assignmentRls, /assignments_teacher_group_select/i);
  assert.match(assignmentRls, /assignments_teacher_group_insert/i);
  assert.match(assignmentRls, /assignments_teacher_group_update/i);
  assert.match(assignmentRls, /saa_teacher_group_select/i);
  assert.match(assignmentRls, /sar_teacher_group_select/i);
  assert.match(assignmentRls, /school_subject_group_teachers/i);
});

test('year rollover preserves exact group and student teaching history', () => {
  assert.match(history, /school_year_teaching_group_snapshots/i);
  assert.match(history, /school_year_teaching_group_student_snapshots/i);
  assert.match(history, /teacher_historical_teaching_roster/i);
  assert.match(history, /capture_school_year_teaching_group_snapshots_for_plan/i);
  assert.match(history, /rpc_teacher_academic_profile_students_for_year/i);
  assert.match(history, /rpc_student_academic_subjects_for_year/i);
});

test('Writing Hub and review authorization stay exact-group scoped', () => {
  assert.match(writing, /bh_writing_authorized_english_roster/i);
  assert.match(writing, /teacher_current_teaching_roster/i);
  assert.match(writing, /rpc_bh_writing_teacher_monitoring_legacy_v1/i);
  assert.match(writingReview, /actor_can_review_bh_writing_assessment/i);
  assert.match(writingReview, /rpc_bh_writing_canonical_assessment_entitlement_internal/i);
  assert.match(writingReview, /rpc_bh_writing_submit_assessment_review_entitlement_internal/i);
});

test('staff lifecycle and question creation respect active teaching groups', () => {
  assert.match(gapClosure, /rpc_school_admin_set_teaching_staff_status/i);
  assert.match(gapClosure, /school_admin_transition_member_role/i);
  assert.match(gapClosure, /remove_school_member/i);
  assert.match(gapClosure, /ACTIVE_ASSIGNMENTS_REQUIRE_RESOLUTION/i);
  assert.match(gapClosure, /rpc_teacher_submit_question_batch/i);
  assert.match(gapClosure, /teacher_current_teaching_groups/i);
});

test('teacher workspace renders exact teaching groups in My Classes', () => {
  assert.match(teacherPortal, /fetchTeacherTeachingGroupRoster/);
  assert.match(teacherPortal, /teachingGroupRosters/);
  assert.match(teacherPortal, /canonicalGroups/);
  assert.match(teacherPortal, /Custom teaching group/);
  assert.match(teacherPortal, /Each teaching group stays separate/);
  assert.match(teacherPortal, /teacher_subjects/);
  assert.match(teacherPortal, /subject_names/);
});
