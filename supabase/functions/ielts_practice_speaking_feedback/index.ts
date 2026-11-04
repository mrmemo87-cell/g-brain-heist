import { createClient } from 'npm:@supabase/supabase-js@2.78.0';
import { inspectSpeakingWav } from '../_shared/ieltsSpeakingAudio.ts';
import {
  SPEAKING_PRACTICE_FEEDBACK_INSTRUCTIONS,
  parseSpeakingJson,
  speakingTranscriptionHint,
  validateSpeakingPracticeFeedback,
  type SpeakingPracticeContext,
} from '../_shared/ieltsPracticeSpeakingFeedback.ts';

// Diagnostic Bible 2.1.0 sections 10.3, 10.5-10.6: Brains Heist feedback on the learner's own Speaking PRACTICE.
// Authorization, limits, task text and the audio path come from rpc_ielts_practice_speaking_feedback_claim; the
// browser only names the attempt. The audio is the learner's own 16 kHz mono WAV copy in their storage folder.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const model = Deno.env.get('IELTS_PRACTICE_SPEAKING_MODEL')?.trim() || Deno.env.get('IELTS_SPEAKING_DRAFT_MODEL')?.trim() || 'gpt-audio-1.5';
const transcribeModel = Deno.env.get('IELTS_PRACTICE_TRANSCRIBE_MODEL')?.trim() || 'gpt-4o-transcribe';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Provider refusals keep only status, code/type and param: never the provider message, which may echo input. */
async function providerError(response: Response, stage: string): Promise<Error> {
  const detail = await response.json().catch(() => null) as { error?: { code?: string; type?: string; param?: string } } | null;
  const err = detail?.error;
  return new Error(`${stage}_${response.status}:${err?.code || err?.type || 'unknown'}${err?.param ? `:${err.param}` : ''}`);
}

/** Pass 1: a speech-to-text model writes down the learner's words. */
async function transcribe(bytes: ArrayBuffer, apiKey: string, hint: string, signal: AbortSignal): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'answer.wav');
    form.append('model', transcribeModel);
    form.append('language', 'en');
    form.append('response_format', 'json');
    form.append('prompt', hint);
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', signal, headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    });
    if (response.ok) {
      const out = await response.json().catch(() => null) as { text?: unknown } | null;
      if (typeof out?.text !== 'string') throw new Error('transcribe_invalid');
      return out.text.trim().slice(0, 6000);
    }
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      const retryable = await response.clone().json().catch(() => null) as { error?: { code?: string } } | null;
      if (retryable?.error?.code !== 'credit_balance_exhausted' && retryable?.error?.code !== 'insufficient_quota') continue;
    }
    throw await providerError(response, 'transcribe');
  }
  throw new Error('transcribe_unavailable');
}

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < view.length; i += 0x8000) out += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(out);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const auth = req.headers.get('authorization');
  if (!auth?.match(/^Bearer\s+\S+$/i)) return json(401, { error: 'sign_in_required' });
  const raw = await req.text();
  if (raw.length > 500) return json(413, { error: 'invalid_request' });
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!body || !uuid.test(String(body.attemptId || '')) || Object.keys(body).some(k => k !== 'attemptId')) return json(400, { error: 'invalid_request' });
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!url || !anon || !secret || !apiKey) return json(503, { error: 'ai_unavailable' });
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await caller.auth.getUser();
  if (authError || !identity.user) return json(401, { error: 'sign_in_required' });
  const { data: claim, error: claimError } = await caller.rpc('rpc_ielts_practice_speaking_feedback_claim', { p_attempt: body.attemptId, p_model: model });
  if (claimError) {
    const known = ['ai_rate_limit', 'ai_already_working', 'too_short'].find(k => claimError.message.includes(k));
    return json(known === 'too_short' ? 422 : known ? 429 : 403, { error: known ?? 'not_available' });
  }
  if (claim.ready) return json(200, claim.feedback);
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const context = claim.context as SpeakingPracticeContext;
  try {
    if (!context.audio_path.startsWith(`speaking/${identity.user.id}/feedback/`)) throw new Error('audio_path');
    const { data: audio, error: audioError } = await admin.storage.from('ielts-recordings').download(context.audio_path);
    if (audioError || !audio) {
      await admin.rpc('rpc_ielts_practice_speaking_feedback_finish', { p_id: claim.id, p_fields: null, p_provider: null });
      return json(409, { error: 'audio_missing' });
    }
    const bytes = await audio.arrayBuffer();
    inspectSpeakingWav(bytes);
    const task = { part: context.part, question: context.prompt, follow_ups: context.follow_ups };
    const signal = AbortSignal.timeout(110000);
    // Two passes: write down the words first, then judge with both the transcript and the audio.
    const transcript = await transcribe(bytes, apiKey, speakingTranscriptionHint(task), signal);
    let fields; let providerId: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, modalities: ['text'], store: false, max_completion_tokens: 2600,
          messages: [
            { role: 'system', content: SPEAKING_PRACTICE_FEEDBACK_INSTRUCTIONS + (attempt ? '\nThe previous output failed validation. Return only the JSON keys requested, copy every quote exactly from the supplied transcript, keep high = low + 1, and use short simple sentences.' : '') },
            { role: 'user', content: [
              { type: 'text', text: JSON.stringify({ task, transcript }) },
              { type: 'input_audio', input_audio: { data: base64(bytes), format: 'wav' } },
            ] },
          ],
        }),
      });
      if (!response.ok) {
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
        throw await providerError(response, 'provider');
      }
      const output = await response.json();
      const choice = output.choices?.[0];
      try {
        if (choice?.finish_reason !== 'stop' || choice.message?.refusal || !choice.message?.content) throw new Error('incomplete');
        fields = validateSpeakingPracticeFeedback(parseSpeakingJson(choice.message.content), { part: context.part, transcript });
        providerId = String(output.id || '');
        break;
      } catch { if (attempt > 0) throw new Error('validation_failed'); }
    }
    if (!fields) throw new Error('validation_failed');
    const { error: finishError } = await admin.rpc('rpc_ielts_practice_speaking_feedback_finish', { p_id: claim.id, p_fields: fields, p_provider: providerId });
    if (finishError) throw new Error('save_failed');
    const { data: view, error: viewError } = await caller.rpc('rpc_ielts_practice_speaking_feedback', { p_attempt: body.attemptId });
    if (viewError || !view) return json(403, { error: 'not_available' });
    return json(200, view);
  } catch (e) {
    await admin.rpc('rpc_ielts_practice_speaking_feedback_finish', { p_id: claim.id, p_fields: null, p_provider: null });
    // Never log audio, transcripts, provider bodies, personal data or credentials.
    console.warn('Speaking practice feedback unavailable', { feedbackId: claim.id, reason: e instanceof Error ? e.message.slice(0, 120) : 'unknown' });
    return json(503, { error: 'ai_unavailable' });
  }
});
