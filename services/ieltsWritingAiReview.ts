import { supabase } from './supabaseClient';
import { IELTS_WRITING_CRITERIA, writingEvidenceMatches, type WritingObservations, type WritingScreenerResult } from './ieltsWritingScreener';
export type WritingAiDraft = { draft_id: string; attempt_id: string; response_sha256: string; fields: { observations: WritingObservations; next_step: string; delivery_comment: string }; teacher_confirmation_required: true };
export function parseWritingAiDraft(value: unknown, source: WritingScreenerResult): WritingAiDraft {
  const v = value as WritingAiDraft;
  if (!v || !/^[0-9a-f-]{36}$/i.test(v.draft_id) || v.attempt_id !== source.attempt_id || v.response_sha256 !== source.response_sha256 || v.teacher_confirmation_required !== true
    || !v.fields || typeof v.fields.next_step !== 'string' || v.fields.next_step.trim().length < 10 || typeof v.fields.delivery_comment !== 'string') throw new Error('invalid_ai_draft');
  for (const { key } of IELTS_WRITING_CRITERIA) {
    const o = v.fields.observations?.[key];
    if (!o || !['observed','developing','insufficient_evidence'].includes(o.status) || typeof o.comment !== 'string' || o.comment.trim().length < 20
      || !Array.isArray(o.evidence) || o.evidence.some(span => !writingEvidenceMatches(source.response_text, span))
      || (o.status !== 'insufficient_evidence' && (!o.evidence.length || source.response_state !== 'answered'))) throw new Error('invalid_ai_draft');
  }
  return v;
}
export async function generateWritingAiReview(source: WritingScreenerResult, signal: AbortSignal): Promise<WritingAiDraft> {
  const { data, error } = await supabase.functions.invoke('ielts_writing_teacher_ai', { body: { attemptId: source.attempt_id }, signal });
  if (error) {
    let code = '';
    try { code = (await (error as { context?: Response }).context?.json())?.error || ''; } catch { /* Safe generic fallback. */ }
    throw new Error(code === 'ai_rate_limit' ? 'AI help is taking a short break. Try again later, or continue your review below.'
      : code === 'ai_already_working' ? 'AI is already preparing this essay. Wait a moment, then try again.'
      : code === 'sign_in_required' ? 'Please sign in again to use AI help. Your original essay and shared feedback are safe.'
      : 'AI could not prepare a complete draft. Your notes are unchanged. Try again, or continue your review below.');
  }
  try { return parseWritingAiDraft(data, source); } catch { throw new Error('AI could not prepare a complete draft. Your notes are unchanged. Try again, or continue your review below.'); }
}
/** Fill gaps while preserving the teacher's existing words, excerpts and next step. */
export function mergeWritingAiDraft(current: WritingObservations, nextStep: string, delivery: string, draft: WritingAiDraft) {
  const observations = Object.fromEntries(IELTS_WRITING_CRITERIA.map(({ key }) => {
    const prior = current[key], ai = draft.fields.observations[key];
    const hasInput = !!prior.comment.trim() || prior.evidence.length > 0;
    return [key, { status: hasInput ? prior.status : ai.status, comment: prior.comment.trim() ? prior.comment : ai.comment,
      evidence: prior.evidence.length ? prior.evidence : ai.evidence }];
  })) as WritingObservations;
  return { observations, nextStep: nextStep.trim() ? nextStep : draft.fields.next_step, delivery: delivery.trim() ? delivery : draft.fields.delivery_comment };
}
