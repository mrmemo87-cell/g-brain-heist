import { supabase } from './supabaseClient';

export type InterventionType = 'targeted_question_practice' | 'writing_practice' | 'reassessment' | 'teacher_support' | 'custom';
export interface InterventionRecommendation {
  subject: string; topic?: string | null; skill: string; skill_key: string; status: string; trend: string; priority: string;
  evidence_items: number; focus_occurrences: number; last_observed_at: string; days_since_evidence: number; available_questions: number;
  recommended_type: InterventionType; rationale: string; suggested_goal: string; has_open_intervention: boolean;
}
export interface LearningIntervention {
  id: string; subject: string; skill: string; skill_key: string; topic?: string | null; intervention_type: InterventionType;
  status: 'planned' | 'active' | 'completed' | 'cancelled'; rationale: string; goal: string; baseline_status: string;
  baseline_evidence_items: number; baseline_last_observed_at?: string | null; target_date?: string | null; created_at: string;
  started_at?: string | null; completed_at?: string | null; outcome_status?: string | null; outcome_note?: string | null;
}
export interface InterventionIntelligence {
  student: { id: string; name: string; grade?: string | null; class_name?: string | null; school_id: string };
  recommendations: InterventionRecommendation[];
  interventions: LearningIntervention[];
}

export async function getInterventionIntelligence(studentId: string, subject?: string | null): Promise<InterventionIntelligence> {
  const { data, error } = await supabase.rpc('rpc_teacher_student_intervention_intelligence', { p_student_id: studentId, p_subject: subject || null });
  if (error) throw new Error(error.message || 'Intervention intelligence could not be loaded.');
  return data as InterventionIntelligence;
}

export async function createLearningIntervention(input: { studentId: string; skillKey: string; interventionType: InterventionType; goal?: string; targetDate?: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc('rpc_teacher_create_learning_intervention', {
    p_student_id: input.studentId,
    p_skill_key: input.skillKey,
    p_intervention_type: input.interventionType,
    p_goal: input.goal || null,
    p_target_date: input.targetDate || null,
  });
  if (error) throw new Error(error.message || 'Intervention could not be created.');
  return String(data);
}

export async function updateLearningIntervention(input: { interventionId: string; action: 'start' | 'complete' | 'cancel' | 'note'; note?: string; outcomeStatus?: 'improved' | 'resolved' | 'no_change' | 'needs_more_support' }): Promise<void> {
  const { error } = await supabase.rpc('rpc_teacher_update_learning_intervention', {
    p_intervention_id: input.interventionId,
    p_action: input.action,
    p_note: input.note || null,
    p_outcome_status: input.outcomeStatus || null,
  });
  if (error) throw new Error(error.message || 'Intervention could not be updated.');
}
