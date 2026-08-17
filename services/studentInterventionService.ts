import { supabase } from './supabaseClient';
import { userFacingError } from './userFacingError';

export type InterventionType = 'targeted_question_practice' | 'writing_practice' | 'reassessment' | 'teacher_support' | 'custom';
export interface InterventionEvidenceExample {
  original?: string | null; better_version?: string | null; issue?: string | null; weakness_tag?: string | null;
}
export interface InterventionConfidence {
  score?: number | null; band?: string | null; assessment_state?: string | null; decision_eligible: boolean;
}
export interface InterventionProfessionalReview {
  id: string; decision: 'confirmed' | 'needs_more_evidence' | 'rejected'; rationale: string;
  reviewed_at: string; diagnostic_targets: string[];
}
export interface InterventionRecommendation {
  subject: string; topic?: string | null; skill: string; skill_key: string; status: string; trend: string; priority: string;
  evidence_items: number; focus_occurrences: number; last_observed_at: string; days_since_evidence: number; available_questions: number;
  recommended_type: InterventionType; rationale: string; suggested_goal: string; has_open_intervention: boolean;
  diagnostic_targets: string[]; evidence_examples: InterventionEvidenceExample[];
  evidence_authority: 'teacher_validated' | 'automated_history';
  readiness: 'open_plan' | 'collect_evidence' | 'review_evidence' | 'ready';
  readiness_blocker?: string | null; can_create_plan: boolean;
  confidence: InterventionConfidence; professional_review?: InterventionProfessionalReview | null;
}
export interface LearningIntervention {
  id: string; subject: string; skill: string; skill_key: string; topic?: string | null; intervention_type: InterventionType;
  status: 'planned' | 'active' | 'completed' | 'cancelled'; rationale: string; goal: string; baseline_status: string;
  baseline_evidence_items: number; baseline_last_observed_at?: string | null; target_date?: string | null; created_at: string;
  started_at?: string | null; completed_at?: string | null; outcome_status?: string | null; outcome_note?: string | null;
  approval_status: 'pending' | 'approved' | 'rejected' | 'legacy_approved'; approved_at?: string | null;
  academic_year_id?: string | null; validation_shadow_result_id?: string | null;
  baseline_qualifying_observations: number; baseline_cutoff_at: string; baseline_snapshot_hash: string;
  baseline_confidence_score?: number | null; baseline_confidence_band?: string | null;
  target_status: 'improving' | 'resolved' | 'emerging_strength' | 'consistent_strength';
  target_min_followup_observations: number; target_min_successful_observations: number;
  follow_up_observation_count: number; follow_up_qualifying_observations: number;
  follow_up_successful_observations: number; system_outcome_status?: string | null;
  professional_review_id?: string | null; teaching_action?: string | null; evidence_task?: string | null;
  checkpoints: InterventionCheckpoint[];
}
export interface InterventionCheckpoint {
  id: string; number: number; type: 'interim' | 'final'; status: 'scheduled' | 'evaluated' | 'waived';
  due_at: string; evaluated_as_of?: string | null; observation_count: number;
  qualifying_observation_count: number; successful_observation_count: number;
  candidate_status?: string | null; system_outcome?: string | null;
  evidence_snapshot_hash?: string | null; evaluated_at?: string | null;
}
export interface InterventionEvaluation {
  success: boolean; interventionId: string; checkpointId: string; systemOutcome: string;
  candidateStatus: string; candidateTrend: string; followUpObservationCount: number;
  qualifyingFollowUpObservations: number; successfulFollowUpObservations: number;
  minimumFollowUpObservations: number; minimumSuccessfulObservations: number;
  evidenceSnapshotHash: string; teacherConfirmationRequired: boolean;
}
export interface InterventionIntelligence {
  student: { id: string; name: string; grade?: string | null; class_name?: string | null; school_id: string };
  recommendations: InterventionRecommendation[];
  interventions: LearningIntervention[];
}

export async function getInterventionIntelligence(studentId: string, subject?: string | null): Promise<InterventionIntelligence> {
  const { data, error } = await supabase.rpc('rpc_teacher_student_intervention_workspace_v2', { p_student_id: studentId, p_subject: subject || null });
  if (error) throw userFacingError(error, 'We could not open this student’s support recommendations just now. Please try again.');
  return data as InterventionIntelligence;
}

export async function createLearningIntervention(input: {
  studentId: string; skillKey: string; interventionType: InterventionType; goal: string;
  teachingAction: string; evidenceTask: string;
  targetDate: string; targetStatus?: LearningIntervention['target_status'];
  minimumFollowUpObservations?: number; minimumSuccessfulObservations?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_teacher_create_learning_intervention_v3', {
    p_student_id: input.studentId,
    p_skill_key: input.skillKey,
    p_intervention_type: input.interventionType,
    p_goal: input.goal,
    p_teaching_action: input.teachingAction,
    p_evidence_task: input.evidenceTask,
    p_target_date: input.targetDate,
    p_target_status: input.targetStatus ?? 'improving',
    p_min_followup_observations: input.minimumFollowUpObservations ?? 2,
    p_min_successful_observations: input.minimumSuccessfulObservations ?? 2,
  });
  if (error) throw userFacingError(error, 'We could not create the support plan just now. Please try again.');
  return String((data as { interventionId?: string } | null)?.interventionId || data);
}

export async function reviewLearningFocusEvidence(input: {
  studentId: string; skillKey: string;
  decision: InterventionProfessionalReview['decision']; diagnosticTargets: string[]; rationale: string;
}): Promise<void> {
  const { error } = await supabase.rpc('rpc_teacher_review_learning_focus_evidence', {
    p_student_id: input.studentId,
    p_skill_key: input.skillKey,
    p_decision: input.decision,
    p_diagnostic_targets: input.diagnosticTargets,
    p_rationale: input.rationale,
  });
  if (error) throw userFacingError(error, 'We could not save the evidence review just now. Please try again.');
}

export async function reviewLearningInterventionPlan(input: {
  interventionId: string; decision: 'approved' | 'rejected'; rationale: string;
}): Promise<void> {
  const { error } = await supabase.rpc('rpc_teacher_review_learning_intervention_plan', {
    p_intervention_id: input.interventionId,
    p_decision: input.decision,
    p_rationale: input.rationale,
  });
  if (error) throw userFacingError(error, 'We could not review the support plan just now. Please try again.');
}

export async function evaluateLearningIntervention(interventionId: string): Promise<InterventionEvaluation> {
  const { data, error } = await supabase.rpc('rpc_teacher_evaluate_learning_intervention', {
    p_intervention_id: interventionId,
    p_as_of: new Date().toISOString(),
  });
  if (error) throw userFacingError(error, 'We could not evaluate the follow-up evidence just now. Please try again.');
  return data as InterventionEvaluation;
}

export async function updateLearningIntervention(input: { interventionId: string; action: 'start' | 'complete' | 'cancel' | 'note'; note?: string; outcomeStatus?: 'improved' | 'resolved' | 'no_change' | 'declined' | 'inconclusive' | 'needs_more_support' }): Promise<void> {
  const { error } = await supabase.rpc('rpc_teacher_update_learning_intervention', {
    p_intervention_id: input.interventionId,
    p_action: input.action,
    p_note: input.note || null,
    p_outcome_status: input.outcomeStatus || null,
  });
  if (error) throw userFacingError(error, 'We could not update the support plan just now. Please try again.');
}
