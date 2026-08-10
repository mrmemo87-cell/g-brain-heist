import { supabase } from './supabaseClient';

export type AcademicReportType = 'student' | 'class' | 'grade' | 'subject' | 'school';
export type AcademicReportAudience = 'student' | 'family' | 'teacher' | 'school_head' | 'internal';
export type AcademicReportStatus = 'draft' | 'final';

export interface AcademicReportingYear { id: string; name: string; startsOn: string; endsOn: string; status: string; }
export interface AcademicReportingTerm { id: string; academicYearId: string; name: string; sequenceNumber: number; startsOn: string; endsOn: string; }
export interface AcademicReportingSubject { id: string; code: string; name: string; }
export interface AcademicReportingClass { id: string; name: string; code?: string | null; gradeLevel?: string | null; }

export interface AcademicReportingContext {
  success: boolean;
  viewer: { id: string; role: 'student' | 'teacher' | 'school_admin' | 'school_head' };
  schoolId: string;
  years: AcademicReportingYear[];
  terms: AcademicReportingTerm[];
  subjects: AcademicReportingSubject[];
  classes: AcademicReportingClass[];
  grades: string[];
  recentReports: Array<{ id: string; reportType: AcademicReportType; audience: AcademicReportAudience; status: AcademicReportStatus; version: number; academicYearId: string; academicTermId?: string | null; payloadHash: string; generatedAt: string; finalizedAt?: string | null }>;
  permissions: Record<'canGenerateStudent' | 'canGenerateClass' | 'canGenerateGrade' | 'canGenerateSubject' | 'canGenerateSchool', boolean>;
  disclosure: { reportSnapshotsAreImmutable: boolean; draftRequiresFinalApprovalBeforeExport: boolean; privateTeacherNotesExcluded: boolean };
}

export interface AcademicReportSubject {
  academicSubjectId: string;
  code: string;
  subject: string;
  studentsWithEvidence: number;
  observationCount: number;
  qualifyingObservations: number;
  evidenceItems: number;
  attainmentAverage: number | null;
  expectedStandard: number | null;
  expectationStatus: 'not_configured' | string;
  evidenceStatus: 'not_assessed' | 'low_data' | 'assessed';
  progressStates: Record<'newFocus' | 'recurring' | 'persistent' | 'improving' | 'resolved' | 'emergingStrength' | 'consistentStrength', number>;
  confidence: { averageScore: number | null; high: number; medium: number; low: number; notAssessed: number; lowData: number; stale: number; contradictory: number; policyIds: string[]; asOf: string | null };
  coverage: { students: number; averageQualifiedPercent: number | null; unassessedObjectives: number; lowDataObjectives: number; readiness: Record<string, number>; scope: string; asOf: string | null };
  historicalProjectionUnavailable: number;
}

export interface AcademicReportPayload {
  schemaVersion: 'academic-report-v1';
  reportType: AcademicReportType;
  audience: AcademicReportAudience;
  reportingPeriod: { kind: 'term' | 'annual'; academicYearId: string; academicYearName: string; academicTermId?: string | null; academicTermName?: string | null; startsOn: string; endsOn: string; evidenceCutoffAt: string };
  scope: { schoolId: string; studentId?: string | null; classId?: string | null; gradeLevel?: string | null; academicSubjectId?: string | null };
  summary: { studentsInScope: number; studentsWithEvidence: number; studentsWithoutEvidence: number; subjectsInReport: number; observationCount: number; qualifyingObservations: number; evidenceItems: number; attainmentAverage: number | null; sourceTypes: Record<string, number> };
  subjects: AcademicReportSubject[];
  interventions: Array<{ id: string; studentId: string; subject: string; skill: string; interventionType: string; status: string; approvalStatus: string; targetStatus?: string | null; targetDate?: string | null; completedAt?: string | null; outcomeStatus?: string | null; systemOutcomeStatus?: string | null }>;
  disclosures: Record<string, boolean | string>;
}

export interface AcademicReportSnapshot {
  id: string;
  reportType: AcademicReportType;
  audience: AcademicReportAudience;
  status: AcademicReportStatus;
  version: number;
  supersedesReportId?: string | null;
  academicYearId: string;
  academicTermId?: string | null;
  periodStart: string;
  periodEnd: string;
  evidenceCutoffAt: string;
  sourceSnapshotHash: string;
  payloadHash: string;
  payload: AcademicReportPayload;
  generatedAt: string;
  finalizedAt?: string | null;
  sourceReferences: Array<{ sourceType: string; sourceId: string; snapshotHash: string }>;
}

export interface GenerateAcademicReportInput {
  reportType: AcademicReportType;
  academicYearId: string;
  academicTermId?: string | null;
  studentId?: string | null;
  classId?: string | null;
  gradeLevel?: string | null;
  academicSubjectId?: string | null;
  audience: AcademicReportAudience;
  evidenceCutoffAt?: string | null;
}

const ensureObject = <T>(data: unknown, operation: string): T => {
  if (!data || typeof data !== 'object') throw new Error(`${operation} returned an invalid response.`);
  return data as T;
};

export const getAcademicReportingContext = async (studentId?: string | null): Promise<AcademicReportingContext> => {
  const { data, error } = await supabase.rpc('rpc_academic_reporting_context', { p_student_id: studentId ?? null });
  if (error) throw error;
  return ensureObject<AcademicReportingContext>(data, 'Academic reporting context');
};

export const generateAcademicReportSnapshot = async (input: GenerateAcademicReportInput) => {
  const { data, error } = await supabase.rpc('rpc_generate_academic_report_snapshot', {
    p_report_type: input.reportType,
    p_academic_year_id: input.academicYearId,
    p_academic_term_id: input.academicTermId ?? null,
    p_student_id: input.studentId ?? null,
    p_class_id: input.classId ?? null,
    p_grade_level: input.gradeLevel ?? null,
    p_academic_subject_id: input.academicSubjectId ?? null,
    p_audience: input.audience,
    p_evidence_cutoff_at: input.evidenceCutoffAt ?? null,
  });
  if (error) throw error;
  return ensureObject<{ success: boolean; reportId: string; status: AcademicReportStatus; version: number; payloadHash: string; sourceSnapshotHash: string; reused: boolean; reportAutomaticallyFinalized: false }>(data, 'Academic report generation');
};

export const getAcademicReportSnapshot = async (reportId: string): Promise<AcademicReportSnapshot> => {
  const { data, error } = await supabase.rpc('rpc_get_academic_report_snapshot', { p_report_id: reportId });
  if (error) throw error;
  return ensureObject<{ success: boolean; report: AcademicReportSnapshot }>(data, 'Academic report retrieval').report;
};

export const finalizeAcademicReportSnapshot = async (reportId: string) => {
  const { data, error } = await supabase.rpc('rpc_finalize_academic_report_snapshot', { p_report_id: reportId });
  if (error) throw error;
  return ensureObject<{ success: boolean; reportId: string; status: 'final'; payloadHash: string; alreadyFinal: boolean }>(data, 'Academic report finalization');
};

export const requestAcademicReportCorrection = async (
  reportId: string,
  reasonCode: 'source_error' | 'scope_error' | 'identity_error' | 'interpretation_concern' | 'privacy_concern' | 'other',
  detail: string,
) => {
  const { data, error } = await supabase.rpc('rpc_request_academic_report_correction', {
    p_report_id: reportId,
    p_reason_code: reasonCode,
    p_detail: detail,
  });
  if (error) throw error;
  return ensureObject<{ success: boolean; correctionRequestId: string; originalReportRemainsImmutable: true }>(data, 'Academic report correction request');
};
