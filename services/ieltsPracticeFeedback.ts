import { supabase } from './supabaseClient';
import { toSpeakingWav } from '../src/lib/speakingWav';

/**
 * Brains Heist practice feedback (Diagnostic Bible 2.1.0 sections 10.5-10.6): Writing and Speaking PRACTICE only.
 * Never evidence, never an overall band, never on screeners.
 */
export type FeedbackCriterion = { comment: string; action: string; evidence: { quote: string }[]; indication: { low: number; high: number } | null };
export type PracticeSkill = 'writing' | 'speaking';
/** Coloured transcript phrase (Diagnostic Bible 2.2.0 section 10.7). */
export type SpeakingHighlight = { criterion: 'fluency_coherence' | 'lexical_resource' | 'grammar_range_accuracy'; kind: 'strength' | 'fix'; quote: string; note: string };
/** A word the audio model heard mispronounced; ipa comes from a pronouncing dictionary (American English). */
export type PronunciationWord = { word: string; tip: string; ipa: string | null };
/** Coloured essay phrase (Diagnostic Bible 2.4.0 section 10.9); offsets are Unicode code points into fields.essay. */
export type WritingHighlight = {
  criterion: 'task_achievement' | 'task_response' | 'coherence_cohesion' | 'lexical_resource' | 'grammar_range_accuracy';
  kind: 'strength' | 'fix'; quote: string; note: string; correction: string | null; start_char: number; end_char: number;
};
/** AI estimated band for THIS task, worked out on the server from the four criterion ranges; the teacher confirms it. */
export type TaskEstimate = { band: number; low: number; high: number };
export interface PracticeFeedbackView {
  id: string; status: 'working' | 'ready' | 'failed'; created_at: string;
  fields: {
    task_number?: 1 | 2; part?: number; transcript?: string; pronunciation_assessed?: boolean;
    criteria: Record<string, FeedbackCriterion>; next_step: string; prompt_version: string;
    highlights?: SpeakingHighlight[] | WritingHighlight[]; pronunciation_words?: PronunciationWord[];
    /** Writing (v3+): the essay snapshot the highlights point into, and the AI estimated task band. */
    essay?: string; estimate?: TaskEstimate | null;
  } | null;
  confirmed: boolean; confirmed_at: string | null; confirmed_by: string | null; teacher_note: string | null;
}
export const criterionLabel: Record<string, string> = {
  task_achievement: 'Task Achievement', task_response: 'Task Response', coherence_cohesion: 'Coherence and Cohesion',
  lexical_resource: 'Lexical Resource', grammar_range_accuracy: 'Grammatical Range and Accuracy',
  fluency_coherence: 'Fluency and Coherence', pronunciation: 'Pronunciation',
};
const errors: Record<string, string> = {
  ai_rate_limit: 'You have used today\'s feedback for this skill. Try again tomorrow; your work is saved.',
  ai_already_working: 'Feedback is already being prepared. Wait a moment and try again.',
  too_short: 'This response is too short for useful feedback. It needs at least 50 words, or at least 15 seconds of speaking.',
  not_available: 'Feedback is not available for this task.',
  sign_in_required: 'Please sign in again to get feedback.',
  audio_missing: 'Your recording could not be prepared. Try again.',
  not_authorized: 'You can only run feedback for students in your school.',
};
const failure = async (error: unknown, fallback: string) => {
  let code = '';
  try { code = (await (error as { context?: Response }).context?.json())?.error || ''; } catch { /* generic below */ }
  return new Error(errors[code] ?? fallback);
};

export async function requestPracticeFeedback(attemptId: string, options: { asTeacher?: boolean } = {}): Promise<PracticeFeedbackView> {
  const { data, error } = await supabase.functions.invoke('ielts_practice_writing_feedback', { body: options.asTeacher ? { attemptId, asTeacher: true } : { attemptId } });
  if (error) throw await failure(error, options.asTeacher ? 'The AI check could not run right now. The essay is safe; try again in a minute.' : 'Feedback could not be prepared right now. Your writing is saved; try again later.');
  return data as PracticeFeedbackView;
}
export async function practiceFeedback(attemptId: string): Promise<PracticeFeedbackView | null> {
  const { data, error } = await supabase.rpc('rpc_ielts_practice_feedback', { p_attempt: attemptId });
  if (error) throw new Error('Feedback could not load.');
  return (data ?? null) as PracticeFeedbackView | null;
}
export async function confirmPracticeFeedback(id: string, note: string): Promise<PracticeFeedbackView> {
  const { data, error } = await supabase.rpc('rpc_ielts_practice_feedback_confirm', { p_id: id, p_note: note });
  if (error) throw new Error('The confirmation could not be saved. Check your access and retry.');
  return data as PracticeFeedbackView;
}

export async function speakingPracticeFeedback(attemptId: string): Promise<PracticeFeedbackView | null> {
  const { data, error } = await supabase.rpc('rpc_ielts_practice_speaking_feedback', { p_attempt: attemptId });
  if (error) throw new Error('Feedback could not load.');
  return (data ?? null) as PracticeFeedbackView | null;
}

/**
 * Converts the learner's own recording to 16 kHz mono WAV, stores it in their folder, then asks for feedback.
 * `loadRecording` returns the original practice recording (in memory, or downloaded from their folder).
 */
export async function requestSpeakingPracticeFeedback(attemptId: string, loadRecording: () => Promise<Blob>, options: { asTeacher?: boolean } = {}): Promise<PracticeFeedbackView> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) throw new Error(errors['sign_in_required']);
  let wav: Blob;
  try { wav = await toSpeakingWav(await loadRecording()); }
  catch { throw new Error('This browser could not prepare your recording for feedback. Try Chrome or Safari.'); }
  const path = `speaking/${userId}/feedback/${attemptId}.wav`;
  const { error: uploadError } = await supabase.storage.from('ielts-recordings').upload(path, wav, { contentType: 'audio/wav', upsert: true });
  if (uploadError) throw new Error(errors['audio_missing']);
  const { data, error } = await supabase.functions.invoke('ielts_practice_speaking_feedback', { body: options.asTeacher ? { attemptId, asTeacher: true } : { attemptId } });
  if (error) throw await failure(error, 'Feedback could not be prepared right now. Your recording is saved; try again later.');
  return data as PracticeFeedbackView;
}

export async function confirmSpeakingPracticeFeedback(id: string, note: string): Promise<PracticeFeedbackView> {
  const { data, error } = await supabase.rpc('rpc_ielts_practice_speaking_feedback_confirm', { p_id: id, p_note: note });
  if (error) throw new Error('The confirmation could not be saved. Check your access and retry.');
  return data as PracticeFeedbackView;
}

export async function downloadOwnRecording(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('ielts-recordings').download(path);
  if (error || !data) throw new Error('recording_unavailable');
  return data;
}
