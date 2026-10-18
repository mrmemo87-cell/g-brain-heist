import { supabase } from './supabaseClient';

/** AI first-pass practice feedback (Diagnostic Bible 2.0.0 section 10.5). */
export type FeedbackCriterion = { comment: string; action: string; evidence: { quote: string }[]; indication: { low: number; high: number } | null };
export interface PracticeFeedbackView {
  id: string; status: 'working' | 'ready' | 'failed'; created_at: string;
  fields: { task_number: 1 | 2; criteria: Record<string, FeedbackCriterion>; next_step: string; prompt_version: string } | null;
  confirmed: boolean; confirmed_at: string | null; confirmed_by: string | null; teacher_note: string | null;
}
export const criterionLabel: Record<string, string> = {
  task_achievement: 'Task Achievement', task_response: 'Task Response', coherence_cohesion: 'Coherence and Cohesion',
  lexical_resource: 'Lexical Resource', grammar_range_accuracy: 'Grammatical Range and Accuracy',
};
const errors: Record<string, string> = {
  ai_rate_limit: 'You have used today\'s AI feedback. Your teacher will still review your writing.',
  ai_already_working: 'AI feedback is already being prepared. Wait a moment and try again.',
  too_short: 'Write a longer response (at least 50 words) to get AI feedback.',
  not_available: 'AI feedback is not available for this task.',
  sign_in_required: 'Please sign in again to get AI feedback.',
};
export async function requestPracticeFeedback(attemptId: string): Promise<PracticeFeedbackView> {
  const { data, error } = await supabase.functions.invoke('ielts_practice_writing_feedback', { body: { attemptId } });
  if (error) {
    let code = '';
    try { code = (await (error as { context?: Response }).context?.json())?.error || ''; } catch { /* generic below */ }
    throw new Error(errors[code] ?? 'AI feedback could not be prepared right now. Your writing is saved; try again later.');
  }
  return data as PracticeFeedbackView;
}
export async function practiceFeedback(attemptId: string): Promise<PracticeFeedbackView | null> {
  const { data, error } = await supabase.rpc('rpc_ielts_practice_feedback', { p_attempt: attemptId });
  if (error) throw new Error('AI feedback could not load.');
  return (data ?? null) as PracticeFeedbackView | null;
}
export async function confirmPracticeFeedback(id: string, note: string): Promise<PracticeFeedbackView> {
  const { data, error } = await supabase.rpc('rpc_ielts_practice_feedback_confirm', { p_id: id, p_note: note });
  if (error) throw new Error('The confirmation could not be saved. Check your access and retry.');
  return data as PracticeFeedbackView;
}
