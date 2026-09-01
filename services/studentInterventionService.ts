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
  available_exact_questions: number; available_related_questions: number;
  recommended_question_ids: string[]; exact_question_ids: string[]; related_question_ids: string[];
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

export async function registerInterventionPractice(input: {
  assignmentId: string;
  studentId: string;
  skillKey: string;
  diagnosticTargets: string[];
  interventionId?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('rpc_teacher_register_intervention_practice', {
    p_assignment_id: input.assignmentId,
    p_student_id: input.studentId,
    p_skill_key: input.skillKey,
    p_diagnostic_targets: input.diagnosticTargets,
    p_intervention_id: input.interventionId || null,
  });
  if (error) throw userFacingError(error, 'We could not link this targeted practice to the student support record. Please try again.');
}

const INTERVENTION_SUBJECT_IDS: Record<string, string> = {
  Mathematics: 'mathematics',
  Biology: 'biology',
  Chemistry: 'chemistry',
  Physics: 'physics',
  English: 'english',
  'Russian Language': 'russian_language',
  'Kyrgyz Language': 'kyrgyz_language',
  'German Language': 'german_language',
  Geography: 'geography',
  'Global Perspective': 'global_perspective',
  'Travel & Tourism': 'travel_tourism',
  ICT: 'ict',
};

export interface CreatedInterventionPracticeAssignment {
  id: string;
  title?: string | null;
  question_count?: number | null;
}

export async function createInterventionPracticeAssignment(input: {
  teacherId: string;
  subject: string;
  topicName: string;
  questionIds: string[];
  assignedAt: string;
  dueAt?: string | null;
  title: string;
  description?: string | null;
  instructions?: string | null;
  difficulty?: string | null;
  assignmentCategory: 'classwork' | 'homework' | 'quiz' | 'term_exam' | null;
  publishStatus: 'draft' | 'scheduled' | 'published';
  closeSubmissionsAfterDue: boolean;
  notifyStudentsByEmail: boolean;
  studentId: string;
  skillKey: string;
  diagnosticTargets: string[];
}): Promise<CreatedInterventionPracticeAssignment> {
  const subjectId = INTERVENTION_SUBJECT_IDS[input.subject]
    || input.subject.toLowerCase().replace(/\s+/g, '_');
  const { data, error } = await supabase.rpc('rpc_create_intervention_practice_assignment', {
    p_teacher_id: input.teacherId,
    p_subject_id: subjectId,
    p_subject_name: input.subject,
    p_topic_name: input.topicName,
    p_question_ids: input.questionIds,
    p_assigned_at: input.assignedAt,
    p_due_at: input.dueAt || null,
    p_title: input.title,
    p_instructions: input.instructions || null,
    p_difficulty: input.difficulty || null,
    p_student_id: input.studentId,
    p_skill_key: input.skillKey,
    p_diagnostic_targets: input.diagnosticTargets,
    p_assignment_category: input.assignmentCategory,
    p_client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    p_description: input.description || null,
    p_publish_status: input.publishStatus,
    p_close_submissions_after_due: input.closeSubmissionsAfterDue,
    p_notify_students_by_email: input.notifyStudentsByEmail,
  });
  if (error) {
    throw userFacingError(
      error,
      'We could not create this targeted practice safely. Nothing was published; please try again.',
    );
  }
  const assignment = (Array.isArray(data) ? data[0] : data) as CreatedInterventionPracticeAssignment | null;
  if (!assignment?.id) throw new Error('Targeted practice could not be created.');
  return assignment;
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
