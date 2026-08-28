import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';
import { getAcademicReportingContext, type AcademicReportingYear } from './academicReportingService';

export type LearningStatus =
  | 'new_focus'
  | 'recurring'
  | 'persistent'
  | 'improving'
  | 'resolved'
  | 'emerging_strength'
  | 'consistent_strength';

export type LearningTrend = 'declining' | 'stable' | 'improving' | 'resolved' | 'strong';
export type LearningPriority = 'high' | 'medium' | 'low';
export type LearningObservationType = 'focus' | 'developing' | 'strength';

export interface StudentAcademicProfile {
  student: { id: string; name: string; username?: string | null; grade?: string | number | null; class_name?: string | null; school_id?: string | null };
  scope: { subject?: string | null; date_from?: string | null; date_to?: string | null; viewer: 'student' | 'teacher' | 'school_admin' | 'school_head'; allowed_subjects: string[]; academic_year_id?: string | null; academic_year_name?: string | null; academic_year_status?: string | null; archived?: boolean };
  summary: { subjects_tracked: number; completed_assignments: number; assignment_average: number | null; persistent_focus_count: number; recurring_focus_count: number; improving_count: number; resolved_count: number; strength_count: number };
  subjects: Array<{ subject: string; assignment_average: number | null; completed_assignments: number; persistent_focus_count: number; improving_count: number; resolved_count: number; strength_count: number; latest_evidence_at?: string | null }>;
  assignments: Array<{ assignment_id: string; title: string; subject: string; topic?: string | null; class_name?: string | null; assigned_at?: string | null; due_at?: string | null; completed_at: string; score: number; accuracy: number; correct: number; incorrect: number; time_taken_seconds?: number | null }>;
  focus_areas: Array<{ subject: string; topic?: string | null; skill: string; subskill?: string | null; skill_key: string; status: LearningStatus; trend: LearningTrend; priority: LearningPriority; first_observed_at: string; last_observed_at: string; focus_occurrences: number; developing_occurrences: number; strength_occurrences: number; latest_evidence_percentage?: number | null; evidence_items: number; evidence_occurrences: number }>;
  timeline: Array<{ id: string; subject: string; topic?: string | null; skill: string; subskill?: string | null; observation_type: LearningObservationType; source_type: 'assignment_result' | 'writing_attempt' | 'teacher_observation' | 'import'; source_id?: string | null; observed_at: string; evidence_percentage?: number | null; evidence_count: number; evidence_quality?: 'provisional' | 'standard' | 'strong' | null; contributes_to_focus_state?: boolean; evidence?: Record<string, unknown> }>;
}

export interface StudentAcademicProfileQuery { studentId?: string | null; subject?: string | null; academicYearId?: string | null; dateFrom?: string | null; dateTo?: string | null }

export interface StudentAcademicSubjectOption {
  id: string;
  code: string;
  name: string;
  requirement: 'required' | 'elective';
  scopeId: string | null;
  approvedQuestionCount: number;
}

export type AcademicAssessmentState = 'not_assessed' | 'low_data' | 'assessed' | 'stale' | 'contradictory';
export type AcademicConfidenceBand = 'low' | 'medium' | 'high';

export interface StudentAcademicConfidenceState {
  skillKey: string;
  subject: string;
  topic?: string | null;
  skill: string;
  subskill?: string | null;
  academicYearId?: string | null;
  academicSubjectId?: string | null;
  curriculumObjectiveId?: string | null;
  confidenceScore?: number | null;
  confidenceBand?: AcademicConfidenceBand | null;
  assessmentState: AcademicAssessmentState;
  qualifyingObservations: number;
  evidenceItems: number;
  sourceTypes: number;
  sourceInstances: number;
  evidenceAgeDays?: number | null;
  evidenceSpanDays?: number | null;
  decisionEligible: boolean;
  persistentEligible: boolean;
  resolutionEligible: boolean;
  strengthEligible: boolean;
  teacherReviewRequired: boolean;
  asOf?: string | null;
  computedAt?: string | null;
}

export interface StudentCurriculumCoverageState {
  academicYearId?: string | null;
  academicSubjectId?: string | null;
  gradeLevel?: string | null;
  mappingQuality?: string | null;
  totalAssessableObjectives: number;
  observedObjectives: number;
  qualifiedObjectives: number;
  unassessedObjectives: number;
  lowDataObjectives: number;
  focusObjectives: number;
  strengthObjectives: number;
  outsideScopeObjectives: number;
  unmappedSkillCount: number;
  observedCoveragePercent?: number | null;
  qualifiedCoveragePercent?: number | null;
  reportingReadiness: string;
  asOf?: string | null;
  computedAt?: string | null;
}

export interface StudentAcademicConfidence {
  success: boolean;
  studentId: string;
  scope?: { academicYearId?: string | null; academicSubjectId?: string | null; viewer?: StudentAcademicProfile['scope']['viewer'] };
  summary: { skillsTracked: number; assessedSkills: number; lowDataSkills: number; staleSkills: number; contradictorySkills: number; teacherReviewRequired: number };
  confidenceStates: StudentAcademicConfidenceState[];
  coverage: StudentCurriculumCoverageState[];
  disclosure?: Record<string, boolean>;
}

const emptyProfile = (): StudentAcademicProfile => ({
  student: { id: '', name: '' },
  scope: { viewer: 'student', allowed_subjects: [] },
  summary: { subjects_tracked: 0, completed_assignments: 0, assignment_average: null, persistent_focus_count: 0, recurring_focus_count: 0, improving_count: 0, resolved_count: 0, strength_count: 0 },
  subjects: [], assignments: [], focus_areas: [], timeline: [],
});

const operationalAcademicYearId = (years: AcademicReportingYear[]): string | null => {
  const today = new Date().toISOString().slice(0, 10);
  return years.find((year) => year.status === 'current')?.id
    ?? years.find((year) => year.startsOn <= today && today <= year.endsOn)?.id
    ?? years[0]?.id
    ?? null;
};

export const fetchStudentAcademicProfile = async (query: StudentAcademicProfileQuery = {}): Promise<StudentAcademicProfile> => {
  const params = {
    p_student_id: query.studentId ?? null,
    p_subject: query.subject ?? null,
    p_date_from: query.dateFrom ?? null,
    p_date_to: query.dateTo ?? null,
  };
  const request = query.academicYearId
    ? supabase.rpc('rpc_student_academic_profile_for_year', {
        ...params,
        p_academic_year_id: query.academicYearId,
      })
    : supabase.rpc('rpc_student_academic_profile', params);
  const { data, error } = await request;
  if (error) throw userFacingError(error, 'We could not open this student’s progress just now. Please try again.');
  if (!data || typeof data !== 'object') return emptyProfile();
  return data as StudentAcademicProfile;
};

export const fetchStudentAcademicSubjects = async (
  studentId?: string | null,
  academicYearId?: string | null,
): Promise<StudentAcademicSubjectOption[]> => {
  let resolvedAcademicYearId = academicYearId ?? null;
  if (!resolvedAcademicYearId) {
    try {
      const reportingContext = await getAcademicReportingContext(studentId);
      resolvedAcademicYearId = operationalAcademicYearId(reportingContext.years);
    } catch {
      // Keep the legacy RPC as a resilient fallback when reporting context is unavailable.
    }
  }

  const request = resolvedAcademicYearId
    ? supabase.rpc('rpc_student_academic_subjects_for_year', {
        p_student_id: studentId ?? null,
        p_academic_year_id: resolvedAcademicYearId,
      })
    : supabase.rpc('rpc_student_academic_subjects', {
        p_student_id: studentId ?? null,
      });
  const { data, error } = await request;
  if (error) throw userFacingError(error, 'We could not load this student’s subjects for the selected academic year.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const result = data as { subjects?: StudentAcademicSubjectOption[] };
  return result.subjects || [];
};

export const fetchStudentAcademicConfidence = async (
  studentId?: string | null,
  academicYearId?: string | null,
): Promise<StudentAcademicConfidence> => {
  let resolvedAcademicYearId = academicYearId ?? null;
  if (!resolvedAcademicYearId) {
    const reportingContext = await getAcademicReportingContext(studentId);
    resolvedAcademicYearId = operationalAcademicYearId(reportingContext.years);
  }
  const { data, error } = await supabase.rpc('rpc_student_academic_confidence', {
    p_student_id: studentId ?? null,
    p_academic_year_id: resolvedAcademicYearId,
    p_academic_subject_id: null,
  });
  if (error) throw userFacingError(error, 'We could not load the evidence confidence record just now. Please try again.');
  if (!data || typeof data !== 'object') {
    return {
      success: true,
      studentId: studentId || '',
      summary: { skillsTracked: 0, assessedSkills: 0, lowDataSkills: 0, staleSkills: 0, contradictorySkills: 0, teacherReviewRequired: 0 },
      confidenceStates: [],
      coverage: [],
    };
  }
  return data as StudentAcademicConfidence;
};

export const formatLearningStatus = (status: LearningStatus): string => {
  switch (status) {
    case 'new_focus': return 'New focus area';
    case 'recurring': return 'Recurring focus area';
    case 'persistent': return 'Persistent focus area';
    case 'improving': return 'Improving';
    case 'resolved': return 'Resolved';
    case 'emerging_strength': return 'Emerging strength';
    case 'consistent_strength': return 'Consistent strength';
  }
};
