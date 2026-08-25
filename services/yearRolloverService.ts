import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type YearRolloverPlanStatus = 'draft' | 'running' | 'completed' | 'cancelled';
export type YearRolloverOutcome = 'promote' | 'repeat' | 'already_promoted' | 'graduate' | 'leave' | 'manual';
export type YearRolloverRouteOutcome = 'promote' | 'repeat' | 'graduate' | 'manual';
export type YearRolloverReviewState = 'auto_ready' | 'needs_review' | 'reviewed' | 'applied';
export type YearRolloverSourceAuthority = 'academic_enrolment' | 'historical_assignment' | 'current_placement' | 'profile_fallback' | 'unresolved';

export interface YearRolloverYear {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'planned' | 'current' | 'closed';
}

export interface YearRolloverPlan {
  id: string;
  schoolId: string;
  status: YearRolloverPlanStatus;
  effectiveDate: string;
  sourceYear: YearRolloverYear;
  targetYear: YearRolloverYear;
}

export interface YearRolloverClassOption {
  id: string;
  classCode: string;
  className: string;
  gradeLevel: string | null;
  studentCount: number;
  teacherCount: number;
  subjectOfferingCount: number;
}

export interface YearRolloverClassRoute {
  id: string;
  sourceClassId: string;
  sourceClassCode: string;
  sourceClassName: string;
  sourceGrade: string | null;
  targetClassId: string | null;
  targetClassCode: string | null;
  targetClassName: string | null;
  targetGrade: string | null;
  outcome: YearRolloverRouteOutcome;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  isOverridden: boolean;
  studentCount: number;
  currentTargetCount: number;
  projectedTargetCount: number;
  teacherCount: number;
  subjectOfferingCount: number;
}

export interface YearRolloverStudentDecision {
  id: string;
  studentId: string;
  studentName: string;
  sourceClassId: string | null;
  sourceClassCode: string | null;
  sourceGrade: string | null;
  currentClassId: string | null;
  currentClassCode: string | null;
  currentGrade: string | null;
  liveCurrentClassId: string | null;
  liveCurrentClassCode: string | null;
  targetClassId: string | null;
  targetClassCode: string | null;
  targetGrade: string | null;
  sourceAuthority: YearRolloverSourceAuthority;
  outcome: YearRolloverOutcome;
  reviewState: YearRolloverReviewState;
  rationale: string;
  isOverridden: boolean;
  overrideReason: string | null;
}

export interface YearRolloverIssue {
  code: string;
  message: string;
  studentId?: string;
  classId?: string;
  gradeLevel?: string;
  projectedStudents?: number;
}

export interface YearRolloverSummary {
  totalStudents: number;
  autoReady: number;
  reviewed: number;
  needsReview: number;
  promote: number;
  alreadyPromoted: number;
  repeat: number;
  graduate: number;
  leave: number;
  manual: number;
  sourceAuthority: {
    academicEnrolment: number;
    historicalAssignment: number;
    currentPlacement: number;
    profileFallback: number;
    unresolved: number;
  };
}

export interface YearRolloverCompletionSummary {
  studentsProcessed?: number;
  promoted?: number;
  alreadyPromoted?: number;
  repeating?: number;
  graduated?: number;
  leftSchool?: number;
  targetYearId?: string;
  targetYearName?: string;
  effectiveDate?: string;
  historyPreserved?: boolean;
  schoolAccessReviewsRequired?: number;
}

export interface YearRolloverPreview {
  success: boolean;
  code?: string;
  plan: YearRolloverPlan | null;
  summary?: YearRolloverSummary;
  classRoutes?: YearRolloverClassRoute[];
  students?: YearRolloverStudentDecision[];
  classOptions?: YearRolloverClassOption[];
  blockers?: YearRolloverIssue[];
  warnings?: YearRolloverIssue[];
  previewHash?: string;
  canCommit?: boolean;
  safety?: {
    historicalAssignmentsRewritten: boolean;
    historicalWritingRewritten: boolean;
    closedYearEnrolmentsPreserved: boolean;
    currentPlacementChangesRequireConfirmation: boolean;
    commitIsAtomic: boolean;
    driftProtectionEnabled: boolean;
  };
  completionSummary?: YearRolloverCompletionSummary;
}

export interface YearRolloverCommitResult {
  success: boolean;
  code?: string;
  planId?: string;
  status?: YearRolloverPlanStatus;
  reused?: boolean;
  summary?: YearRolloverCompletionSummary;
  blockers?: YearRolloverIssue[];
  warnings?: YearRolloverIssue[];
}

const assertPreview = (value: YearRolloverPreview | null, fallback: string): YearRolloverPreview => {
  if (!value?.success) throw new Error(value?.code || fallback);
  return {
    ...value,
    classRoutes: value.classRoutes || [],
    students: value.students || [],
    classOptions: value.classOptions || [],
    blockers: value.blockers || [],
    warnings: value.warnings || [],
  };
};

export const yearRolloverErrorMessage = (raw: unknown): string => {
  const message = raw instanceof Error ? raw.message : String(raw || '');
  const code = message.toLowerCase();
  const known: Record<string, string> = {
    academic_year_not_found: 'Choose two academic years that belong to this school.',
    academic_year_sequence_invalid: 'The new academic year must begin after the finished year ends.',
    academic_year_status_invalid: 'Use a finished or current source year and a planned or current target year.',
    rollover_plan_not_found: 'This rollover plan is no longer available. Build a fresh rehearsal.',
    rollover_plan_not_editable: 'This rollover has already been launched or cancelled.',
    rollover_route_outcome_invalid: 'Choose a valid route for this class.',
    rollover_student_outcome_invalid: 'Choose a valid student outcome.',
    rollover_review_reason_required: 'Add a short reason so the decision is clear in the audit history.',
    source_class_not_found: 'The previous class could not be found. Refresh the rehearsal.',
    target_class_not_found: 'Choose an active destination class in this school.',
    promotion_target_grade_mismatch: 'A promotion must move the student exactly one grade forward.',
    repeat_target_grade_mismatch: 'A repeating student must remain in the same grade level.',
    already_promoted_class_mismatch: 'The selected class does not match the student’s live placement.',
    rollover_rehearsal_has_blockers: 'Resolve the highlighted exceptions before launching the new year.',
    rollover_rehearsal_changed: 'The roster changed after the rehearsal. Refresh once more before launch.',
    rollover_confirmation_mismatch: 'Type the new academic-year name exactly as shown.',
    completed_rollover_cannot_be_cancelled: 'A completed rollover cannot be cancelled.',
  };
  return known[code] || message || 'The Year Bridge action could not be completed.';
};

export async function fetchLatestYearRollover(schoolId: string): Promise<YearRolloverPreview | null> {
  const { data, error } = await supabase.rpc('rpc_school_admin_latest_year_rollover', {
    p_school_id: schoolId,
  });
  if (error) throw userFacingError(error, 'We could not load the latest year rollover.');
  const result = data as YearRolloverPreview | null;
  if (!result?.success) throw new Error(result?.code || 'year_rollover_unavailable');
  return result.plan ? assertPreview(result, 'year_rollover_unavailable') : null;
}

export async function prepareYearRollover(input: {
  schoolId: string;
  sourceAcademicYearId: string;
  targetAcademicYearId: string;
}): Promise<YearRolloverPreview> {
  const { data, error } = await supabase.rpc('rpc_school_admin_prepare_year_rollover', {
    p_school_id: input.schoolId,
    p_source_academic_year_id: input.sourceAcademicYearId,
    p_target_academic_year_id: input.targetAcademicYearId,
  });
  if (error) throw userFacingError(error, 'We could not build the rollover rehearsal.');
  return assertPreview(data as YearRolloverPreview | null, 'year_rollover_not_prepared');
}

export async function fetchYearRolloverPreview(planId: string): Promise<YearRolloverPreview> {
  const { data, error } = await supabase.rpc('rpc_school_admin_year_rollover_preview', {
    p_plan_id: planId,
  });
  if (error) throw userFacingError(error, 'We could not refresh the rollover rehearsal.');
  return assertPreview(data as YearRolloverPreview | null, 'year_rollover_preview_unavailable');
}

export async function saveYearRolloverClassRoute(input: {
  planId: string;
  sourceClassId: string;
  outcome: YearRolloverRouteOutcome;
  targetClassId?: string | null;
  reason: string;
}): Promise<YearRolloverPreview> {
  const { data, error } = await supabase.rpc('rpc_school_admin_set_year_rollover_class_route', {
    p_plan_id: input.planId,
    p_source_class_id: input.sourceClassId,
    p_outcome: input.outcome,
    p_target_class_id: input.targetClassId || null,
    p_reason: input.reason,
  });
  if (error) throw userFacingError(error, 'We could not save this class route.');
  return assertPreview(data as YearRolloverPreview | null, 'year_rollover_route_not_saved');
}

export async function saveYearRolloverStudentDecision(input: {
  planId: string;
  studentId: string;
  outcome: YearRolloverOutcome;
  targetClassId?: string | null;
  reason: string;
}): Promise<YearRolloverPreview> {
  const { data, error } = await supabase.rpc('rpc_school_admin_set_year_rollover_student_decision', {
    p_plan_id: input.planId,
    p_student_id: input.studentId,
    p_outcome: input.outcome,
    p_target_class_id: input.targetClassId || null,
    p_reason: input.reason,
  });
  if (error) throw userFacingError(error, 'We could not save this student decision.');
  return assertPreview(data as YearRolloverPreview | null, 'year_rollover_student_not_saved');
}

export async function cancelYearRollover(planId: string, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc('rpc_school_admin_cancel_year_rollover', {
    p_plan_id: planId,
    p_reason: reason,
  });
  if (error) throw userFacingError(error, 'We could not cancel this rollover plan.');
  const result = data as { success?: boolean; code?: string } | null;
  if (!result?.success) throw new Error(result?.code || 'year_rollover_not_cancelled');
}

export async function commitYearRollover(input: {
  planId: string;
  previewHash: string;
  confirmation: string;
}): Promise<YearRolloverCommitResult> {
  const { data, error } = await supabase.rpc('rpc_school_admin_commit_year_rollover', {
    p_plan_id: input.planId,
    p_preview_hash: input.previewHash,
    p_confirmation: input.confirmation,
  });
  if (error) throw userFacingError(error, 'We could not launch the new academic year.');
  const result = data as YearRolloverCommitResult | null;
  if (!result?.success) {
    const failure = new Error(result?.code || 'year_rollover_not_committed') as Error & {
      blockers?: YearRolloverIssue[];
      warnings?: YearRolloverIssue[];
    };
    failure.blockers = result?.blockers;
    failure.warnings = result?.warnings;
    throw failure;
  }
  return result;
}
