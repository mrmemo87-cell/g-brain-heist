import { supabase } from './supabaseClient';
import { parseWritingScreenerResult, type WritingObservations } from './ieltsWritingScreener';
export interface WritingScreenerQueueEntry {
  attempt_id: string; student_name: string | null; submitted_at: string; word_count: number;
  evidence_kind: 'first_sitting' | 'same_prompt_practice'; review_status: 'pending' | 'teacher_reviewed';
}
export async function fetchWritingScreenerResult(attemptId: string) {
  const { data, error } = await supabase.rpc('rpc_ielts_writing_screener_result', { p_attempt_id: attemptId });
  if (error) throw new Error('Your essay is saved. We could not open the feedback. Check your access and connection, then try again.');
  return parseWritingScreenerResult(data);
}
export async function fetchWritingScreenerReviewQueue(): Promise<WritingScreenerQueueEntry[]> {
  const { data, error } = await supabase.rpc('rpc_ielts_writing_screener_review_queue');
  if (error || !Array.isArray(data)) throw new Error('We could not load the essays available to you. Please try again.');
  return data;
}
export async function submitWritingScreenerReview(input: {
  attemptId: string; reviewId: string; expectedReviewId: string | null; responseHash: string;
  observations: WritingObservations; nextStep: string; deliveryComment: string;
}) {
  const { data, error } = await supabase.rpc('rpc_ielts_submit_writing_screener_review', {
    p_attempt_id: input.attemptId, p_review_id: input.reviewId, p_expected_review_id: input.expectedReviewId,
    p_response_sha256: input.responseHash, p_criterion_observations: input.observations,
    p_next_step: input.nextStep, p_delivery_comment: input.deliveryComment,
  });
  if (error) throw new Error('The review could not be confirmed. Check that every observation refers to the original essay, or reload if another reviewer has saved changes.');
  return parseWritingScreenerResult(data);
}

export async function saveWritingScreenerRevision(input: { attemptId: string; revisionId: string; sourceReviewId: string; text: string }) {
  const { data, error } = await supabase.rpc('rpc_ielts_save_writing_screener_revision', {
    p_attempt_id: input.attemptId, p_revision_id: input.revisionId, p_source_review_id: input.sourceReviewId, p_response_text: input.text,
  });
  if (error) throw new Error('Your practice revision could not save. Keep this page open and try again. Your original essay is safe.');
  return parseWritingScreenerResult(data);
}
