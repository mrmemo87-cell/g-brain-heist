import { supabase } from './supabaseClient.js';
import { toSpeakingWav } from '../src/lib/speakingWav.js';
export const criterionLabel = {
    task_achievement: 'Task Achievement', task_response: 'Task Response', coherence_cohesion: 'Coherence and Cohesion',
    lexical_resource: 'Lexical Resource', grammar_range_accuracy: 'Grammatical Range and Accuracy',
    fluency_coherence: 'Fluency and Coherence', pronunciation: 'Pronunciation',
};
const errors = {
    ai_rate_limit: 'You have used today\'s feedback for this skill. Try again tomorrow; your work is saved.',
    ai_already_working: 'Feedback is already being prepared. Wait a moment and try again.',
    too_short: 'This response is too short for useful feedback. Write at least 50 words, or speak for at least 15 seconds.',
    not_available: 'Feedback is not available for this task.',
    sign_in_required: 'Please sign in again to get feedback.',
    audio_missing: 'Your recording could not be prepared. Try again.',
    not_authorized: 'You can only run feedback for students in your school.',
};
const failure = async (error, fallback) => {
    let code = '';
    try {
        code = (await error.context?.json())?.error || '';
    }
    catch { /* generic below */ }
    return new Error(errors[code] ?? fallback);
};
export async function requestPracticeFeedback(attemptId) {
    const { data, error } = await supabase.functions.invoke('ielts_practice_writing_feedback', { body: { attemptId } });
    if (error)
        throw await failure(error, 'Feedback could not be prepared right now. Your writing is saved; try again later.');
    return data;
}
export async function practiceFeedback(attemptId) {
    const { data, error } = await supabase.rpc('rpc_ielts_practice_feedback', { p_attempt: attemptId });
    if (error)
        throw new Error('Feedback could not load.');
    return (data ?? null);
}
export async function confirmPracticeFeedback(id, note) {
    const { data, error } = await supabase.rpc('rpc_ielts_practice_feedback_confirm', { p_id: id, p_note: note });
    if (error)
        throw new Error('The confirmation could not be saved. Check your access and retry.');
    return data;
}
export async function speakingPracticeFeedback(attemptId) {
    const { data, error } = await supabase.rpc('rpc_ielts_practice_speaking_feedback', { p_attempt: attemptId });
    if (error)
        throw new Error('Feedback could not load.');
    return (data ?? null);
}
/**
 * Converts the learner's own recording to 16 kHz mono WAV, stores it in their folder, then asks for feedback.
 * `loadRecording` returns the original practice recording (in memory, or downloaded from their folder).
 */
export async function requestSpeakingPracticeFeedback(attemptId, loadRecording, options = {}) {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId)
        throw new Error(errors['sign_in_required']);
    let wav;
    try {
        wav = await toSpeakingWav(await loadRecording());
    }
    catch {
        throw new Error('This browser could not prepare your recording for feedback. Try Chrome or Safari.');
    }
    const path = `speaking/${userId}/feedback/${attemptId}.wav`;
    const { error: uploadError } = await supabase.storage.from('ielts-recordings').upload(path, wav, { contentType: 'audio/wav', upsert: true });
    if (uploadError)
        throw new Error(errors['audio_missing']);
    const { data, error } = await supabase.functions.invoke('ielts_practice_speaking_feedback', { body: options.asTeacher ? { attemptId, asTeacher: true } : { attemptId } });
    if (error)
        throw await failure(error, 'Feedback could not be prepared right now. Your recording is saved; try again later.');
    return data;
}
export async function confirmSpeakingPracticeFeedback(id, note) {
    const { data, error } = await supabase.rpc('rpc_ielts_practice_speaking_feedback_confirm', { p_id: id, p_note: note });
    if (error)
        throw new Error('The confirmation could not be saved. Check your access and retry.');
    return data;
}
export async function downloadOwnRecording(path) {
    const { data, error } = await supabase.storage.from('ielts-recordings').download(path);
    if (error || !data)
        throw new Error('recording_unavailable');
    return data;
}
