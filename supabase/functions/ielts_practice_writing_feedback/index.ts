import { createClient } from 'npm:@supabase/supabase-js@2.78.0';
import { PRACTICE_FEEDBACK_INSTRUCTIONS, practiceFeedbackSchema, validatePracticeFeedback, type PracticeContext } from '../_shared/ieltsPracticeFeedback.ts';

// Diagnostic Bible 2.0.0 section 10.5: the student's own practice writing only; authorization, limits and context
// come from rpc_ielts_practice_feedback_claim. The browser never supplies the essay or the task.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const model = Deno.env.get('IELTS_PRACTICE_FEEDBACK_MODEL')?.trim() || Deno.env.get('IELTS_LEARNING_DRAFT_MODEL')?.trim() || 'gpt-4.1-2025-04-14';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const { data: claim, error: claimError } = await caller.rpc('rpc_ielts_practice_feedback_claim', { p_attempt: body.attemptId, p_model: model });
  if (claimError) {
    const known = ['ai_rate_limit', 'ai_already_working', 'too_short'].find(k => claimError.message.includes(k));
    return json(known === 'too_short' ? 422 : known ? 429 : 403, { error: known ?? 'not_available' });
  }
  if (claim.ready) return json(200, claim.feedback);
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const context = claim.context as PracticeContext;
  try {
    const signal = AbortSignal.timeout(50000);
    let fields; let providerId: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, store: false, max_completion_tokens: 2200,
          messages: [{ role: 'system', content: PRACTICE_FEEDBACK_INSTRUCTIONS + (attempt ? '\nThe previous output failed validation. Copy every quote character-for-character from the student writing, keep high = low + 1, and use short simple sentences.' : '') },
            { role: 'user', content: JSON.stringify({ task_number: context.task_number, task: context.prompt, student_writing: context.essay, word_count: context.word_count }) }],
          response_format: { type: 'json_schema', json_schema: { name: 'practice_feedback', strict: true, schema: practiceFeedbackSchema(context.task_number) } },
        }),
      });
      if (!response.ok) { if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue; throw new Error('provider_unavailable'); }
      const output = await response.json();
      const choice = output.choices?.[0];
      try {
        if (choice?.finish_reason !== 'stop' || choice.message?.refusal || !choice.message?.content) throw new Error('incomplete');
        fields = validatePracticeFeedback(JSON.parse(choice.message.content), context); providerId = String(output.id || ''); break;
      } catch { if (attempt > 0) throw new Error('validation_failed'); }
    }
    if (!fields) throw new Error('validation_failed');
    const { error: finishError } = await admin.rpc('rpc_ielts_practice_feedback_finish', { p_id: claim.id, p_fields: fields, p_provider: providerId });
    if (finishError) throw new Error('save_failed');
    const { data: view, error: viewError } = await caller.rpc('rpc_ielts_practice_feedback', { p_attempt: body.attemptId });
    if (viewError || !view) return json(403, { error: 'not_available' });
    return json(200, view);
  } catch {
    await admin.rpc('rpc_ielts_practice_feedback_finish', { p_id: claim.id, p_fields: null, p_provider: null });
    // Never log student text, provider bodies, personal data or credentials.
    console.warn('Practice feedback unavailable', { feedbackId: claim.id });
    return json(503, { error: 'ai_unavailable' });
  }
});
