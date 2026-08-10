import { supabase } from './supabaseClient';

export type GovernanceCapability =
  | 'student_reports'
  | 'family_reports'
  | 'schoolwide_reporting'
  | 'intervention_effectiveness';
export type ReleaseDecision = 'enabled' | 'paused' | 'disabled';

export interface GovernanceYear {
  id: string;
  name: string;
  status: string;
  startsOn: string;
  endsOn: string;
}

export interface GovernancePolicy {
  id: string;
  version: number;
  policyHash: string;
  minEvidenceCoveragePercent: number;
  minCurriculumCoveragePercent: number;
  minShadowReviewPercent: number;
  minInterventionReviewPercent: number;
  minReproducibleReportSamples: number;
  retentionMonths: number;
  correctionResponseDays: number;
  governanceAttestation: string;
  approvedAt: string;
}

export interface GovernanceReadiness {
  id: string;
  status: 'ready' | 'not_ready';
  metrics: Record<string, number | boolean>;
  blockers: string[];
  warnings: string[];
  sourceSnapshotHash: string;
  readinessHash: string;
  policyId: string;
  evaluatedAt: string;
}

export interface AcademicIntelligenceGovernanceContext {
  success: boolean;
  schoolId: string;
  academicYearId: string;
  viewer: { id: string; role: 'school_head' | 'school_admin' };
  years: GovernanceYear[];
  policy: GovernancePolicy | null;
  readiness: GovernanceReadiness | null;
  releases: Array<{
    capability: GovernanceCapability;
    decision: ReleaseDecision;
    rationale: string;
    readinessSnapshotId: string;
    decidedAt: string;
  }>;
  corrections: Array<{
    id: string;
    reportId: string;
    reasonCode: string;
    detail: string;
    requestedAt: string;
    latestEvent: string;
    latestEventAt: string;
  }>;
  retentionRequests: Array<{
    id: string;
    requestType: 'export' | 'restrict' | 'delete';
    scopeType: 'report' | 'student' | 'academic_year';
    reason: string;
    requestedAt: string;
    latestDecision?: string | null;
    latestDecisionAt?: string | null;
  }>;
  permissions: {
    canEvaluate: boolean;
    canApprovePolicy: boolean;
    canDecideRelease: boolean;
    canDecideRetention: boolean;
  };
  disclosure: Record<string, boolean>;
}

export interface GovernancePolicyInput {
  schoolId: string;
  academicYearId: string;
  minEvidenceCoveragePercent: number;
  minCurriculumCoveragePercent: number;
  minShadowReviewPercent: number;
  minInterventionReviewPercent: number;
  minReproducibleReportSamples: number;
  retentionMonths: number;
  correctionResponseDays: number;
  governanceAttestation: string;
}

const ensureObject = <T>(value: unknown, operation: string): T => {
  if (!value || typeof value !== 'object') throw new Error(`${operation} returned an invalid response.`);
  return value as T;
};

export const getAcademicIntelligenceGovernanceContext = async (
  schoolId: string,
  academicYearId?: string | null,
): Promise<AcademicIntelligenceGovernanceContext> => {
  const { data, error } = await supabase.rpc('rpc_academic_intelligence_governance_context', {
    p_school_id: schoolId,
    p_academic_year_id: academicYearId ?? null,
  });
  if (error) throw error;
  return ensureObject<AcademicIntelligenceGovernanceContext>(data, 'Academic-intelligence governance context');
};

export const approveAcademicIntelligenceGovernancePolicy = async (input: GovernancePolicyInput) => {
  const { data, error } = await supabase.rpc('rpc_approve_academic_intelligence_governance_policy', {
    p_school_id: input.schoolId,
    p_academic_year_id: input.academicYearId,
    p_min_evidence_coverage_percent: input.minEvidenceCoveragePercent,
    p_min_curriculum_coverage_percent: input.minCurriculumCoveragePercent,
    p_min_shadow_review_percent: input.minShadowReviewPercent,
    p_min_intervention_review_percent: input.minInterventionReviewPercent,
    p_min_reproducible_report_samples: input.minReproducibleReportSamples,
    p_retention_months: input.retentionMonths,
    p_correction_response_days: input.correctionResponseDays,
    p_governance_attestation: input.governanceAttestation,
  });
  if (error) throw error;
  return ensureObject<{ success: boolean; policyId: string; version: number; policyHash: string }>(data, 'Governance policy approval');
};

export const evaluateAcademicIntelligenceReadiness = async (schoolId: string, academicYearId: string) => {
  const { data, error } = await supabase.rpc('rpc_evaluate_academic_intelligence_readiness', {
    p_school_id: schoolId,
    p_academic_year_id: academicYearId,
  });
  if (error) throw error;
  return ensureObject<{ success: boolean; readinessSnapshotId: string; status: 'ready' | 'not_ready'; readinessHash: string }>(data, 'Readiness evaluation');
};

export const decideAcademicIntelligenceRelease = async (
  readinessSnapshotId: string,
  capability: GovernanceCapability,
  decision: ReleaseDecision,
  rationale: string,
) => {
  const { data, error } = await supabase.rpc('rpc_decide_academic_intelligence_release', {
    p_readiness_snapshot_id: readinessSnapshotId,
    p_capability: capability,
    p_decision: decision,
    p_rationale: rationale,
  });
  if (error) throw error;
  return ensureObject<{ success: boolean; releaseDecisionId: string }>(data, 'Release decision');
};

export const resolveAcademicReportCorrection = async (
  correctionRequestId: string,
  eventType: 'acknowledged' | 'rejected' | 'superseded' | 'closed',
  rationale: string,
  replacementReportId?: string | null,
) => {
  const { data, error } = await supabase.rpc('rpc_resolve_academic_report_correction', {
    p_correction_request_id: correctionRequestId,
    p_event_type: eventType,
    p_rationale: rationale,
    p_replacement_report_id: replacementReportId ?? null,
  });
  if (error) throw error;
  return ensureObject<{ success: boolean; correctionEventId: string }>(data, 'Correction resolution');
};

export const requestAcademicIntelligenceRetentionAction = async (input: {
  schoolId: string;
  requestType: 'export' | 'restrict' | 'delete';
  scopeType: 'report' | 'student' | 'academic_year';
  reason: string;
  reportId?: string | null;
  studentId?: string | null;
  academicYearId?: string | null;
}) => {
  const { data, error } = await supabase.rpc('rpc_request_academic_intelligence_retention_action', {
    p_school_id: input.schoolId,
    p_request_type: input.requestType,
    p_scope_type: input.scopeType,
    p_reason: input.reason,
    p_report_id: input.reportId ?? null,
    p_student_id: input.studentId ?? null,
    p_academic_year_id: input.academicYearId ?? null,
  });
  if (error) throw error;
  return ensureObject<{ success: boolean; retentionRequestId: string }>(data, 'Retention request');
};

export const decideAcademicIntelligenceRetentionAction = async (
  retentionRequestId: string,
  decision: 'needs_legal_review' | 'approved_for_export' | 'approved_for_restriction' | 'approved_for_deletion' | 'rejected' | 'completed',
  rationale: string,
) => {
  const { data, error } = await supabase.rpc('rpc_decide_academic_intelligence_retention_action', {
    p_retention_request_id: retentionRequestId,
    p_decision: decision,
    p_rationale: rationale,
    p_evidence_manifest: {},
  });
  if (error) throw error;
  return ensureObject<{ success: boolean; retentionDecisionId: string }>(data, 'Retention decision');
};

export const getAcademicIntelligenceAuditManifest = async (schoolId: string, academicYearId: string) => {
  const { data, error } = await supabase.rpc('rpc_academic_intelligence_audit_manifest', {
    p_school_id: schoolId,
    p_academic_year_id: academicYearId,
  });
  if (error) throw error;
  return ensureObject<{ success: boolean; manifest: Record<string, unknown>; manifestHash: string; generatedAt: string }>(data, 'Audit manifest');
};
