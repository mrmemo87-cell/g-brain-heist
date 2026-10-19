import { supabase } from './supabaseClient';

/** Answer keys and evidence for the signed-in student's own completed attempt (keys never load before submitting). */
export interface PracticeAttemptReviewItem { question_id: number; correct_answer: unknown; explanation: string | null; is_correct: boolean; construct?: { code: string; name: string } | null }
export interface PracticeAttemptReview { raw_score: number; total: number; percent: number; items: PracticeAttemptReviewItem[] }

export async function fetchPracticeAttemptReview(skill: 'reading' | 'listening', attemptId: string): Promise<PracticeAttemptReview> {
  const { data, error } = await supabase.rpc('rpc_ielts_practice_attempt_review', { p_skill: skill, p_attempt: attemptId });
  if (error || !data) throw new Error('Your answers were saved, but the answer review could not load. Refresh to try again.');
  return data as PracticeAttemptReview;
}

/** Student-safe question columns (answer keys and evidence are not readable through the Data API). */
export const PRACTICE_QUESTION_COLUMNS = 'id, set_id, question_order, question_type, body, options';
