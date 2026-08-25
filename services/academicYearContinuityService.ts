import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export interface AcademicYearContinuityYear {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'planned' | 'current' | 'closed';
  accessMode: 'active' | 'read_only';
  assignments: number;
  writingSubmissions: number;
  teacherReviewedWriting: number;
  officialLearningObservations: number;
  studentsEnrolled: number;
  finalReports: number;
  openSupportSignals: number;
  studentsWithSupportSignals: number;
  legacyProjectedAssignments: number;
  legacyProjectedWritingSubmissions: number;
  latestEvidenceAt: string | null;
  hasActivity: boolean;
}

export interface AcademicYearContinuityPolicy {
  defaultYearScope: 'current';
  historicalYearsReadOnly: boolean;
  currentYearResultsIsolated: boolean;
  historicalRecordsRemainAvailable: boolean;
  previousEvidenceAffectsCurrentAttainment: boolean;
  teacherCanUseHistoryAsContext: boolean;
  historicalAssignmentsResolvedByOriginalAssignedDate: boolean;
  rawAutomatedWritingIsAuthoritative: boolean;
}

export interface AcademicYearContinuity {
  success: boolean;
  schoolId: string;
  currentYearId: string | null;
  freshStart: boolean;
  previousHistoryAvailable: boolean;
  years: AcademicYearContinuityYear[];
  policy: AcademicYearContinuityPolicy;
}

export async function fetchAcademicYearContinuity(
  schoolId: string,
): Promise<AcademicYearContinuity> {
  const { data, error } = await supabase.rpc(
    'rpc_school_admin_academic_year_continuity',
    { p_school_id: schoolId },
  );

  if (error) {
    throw userFacingError(
      error,
      'We could not load the academic-year continuity summary.',
    );
  }

  const result = data as AcademicYearContinuity | null;
  if (!result?.success) {
    throw new Error('academic_year_continuity_unavailable');
  }

  return result;
}
