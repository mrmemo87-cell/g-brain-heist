import { createClient } from 'npm:@supabase/supabase-js@2.78.0';
import { WRITING_AI_INSTRUCTIONS, WRITING_AI_PROMPT_VERSION, WRITING_AI_SCHEMA, validateWritingAiOutput, type WritingAiContext } from '../_shared/ieltsWritingAiDraft.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const model = Deno.env.get('IELTS_WRITING_DRAFT_MODEL')?.trim() || 'gpt-4.1-2025-04-14';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const auth = req.headers.get('authorization');
  if (!auth?.match(/^Bearer\s+\S+$/i)) return json(401, { error: 'sign_in_required' });
  if (Number(req.headers.get('content-length') || 0) > 2000) return json(413, { error: 'invalid_request' });
  const raw = await req.text();
  if (raw.length > 2000) return json(413, { error: 'invalid_request' });
  const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!body || !uuid.test(String(body.attemptId || '')) || Object.keys(body).some(key => key !== 'attemptId')) return json(400, { error: 'invalid_request' });
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!url || !anon || !secret || !apiKey) return json(503, { error: 'ai_unavailable' });
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await caller.auth.getUser();
  if (authError || !identity.user) return json(401, { error: 'sign_in_required' });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  // This RPC repeats the current teacher/group/school authorization before any AI request.
  const { data: claim, error: claimError } = await caller.rpc('rpc_ielts_claim_writing_ai_draft', { p_attempt_id: body.attemptId, p_prompt_version: WRITING_AI_PROMPT_VERSION, p_model: model });
  if (claimError) {
    const reason = claimError.message;
    return json(reason === 'ai_rate_limit' || reason === 'ai_already_working' ? 429 : 403, { error: reason === 'ai_rate_limit' ? 'ai_rate_limit' : reason === 'ai_already_working' ? 'ai_already_working' : 'review_not_available' });
  }
  const envelope = (fields: unknown) => ({ draft_id: claim.draft_id, attempt_id: body.attemptId, response_sha256: claim.response_sha256, fields, prompt_version: WRITING_AI_PROMPT_VERSION, model, teacher_confirmation_required: true });
  if (!claim.claimed) return json(200, envelope(claim.fields));
  try {
    const context = claim.context as WritingAiContext;
    // Full essay, no silent truncation. Largest supported submission is already bounded by the server.
    const signal = AbortSignal.timeout(45000);
    let fields; let providerId: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, store: false, max_completion_tokens: 2200,
          messages: [{ role: 'system', content: WRITING_AI_INSTRUCTIONS + (attempt ? '\nThe previous output failed validation. Check every quote character-for-character and use clear, simple English. Do not invent evidence.' : '') },
            { role: 'user', content: JSON.stringify({ task: context.prompt, original_essay: context.response_text, response_state: context.response_state, word_count: context.word_count, frozen_rubric: context.rubric_snapshot }) }],
          response_format: { type: 'json_schema', json_schema: { name: 'writing_teacher_draft', strict: true, schema: WRITING_AI_SCHEMA } },
        }),
      });
      if (!response.ok) { if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue; throw new Error('provider_unavailable'); }
      const output = await response.json();
      const choice = output.choices?.[0];
      try {
        if (choice?.finish_reason !== 'stop' || choice.message?.refusal || !choice.message?.content) throw new Error('incomplete_draft');
        fields = validateWritingAiOutput(JSON.parse(choice.message.content), context); providerId = String(output.id || ''); break;
      } catch { if (attempt > 0) throw new Error('draft_validation_failed'); }
    }
    if (!fields) throw new Error('draft_validation_failed');
    const { error: finishError } = await admin.rpc('rpc_ielts_finish_writing_ai_draft', { p_draft_id: claim.draft_id, p_fields: fields, p_provider_response_id: providerId });
    if (finishError) throw new Error('draft_save_failed');
    // Recheck revoked allocation/banned account before returning private feedback.
    const { data: access, error: accessError } = await caller.rpc('rpc_ielts_writing_screener_result', { p_attempt_id: body.attemptId });
    if (accessError || access?.can_review !== true) return json(403, { error: 'review_not_available' });
    return json(200, envelope(fields));
  } catch {
    await admin.rpc('rpc_ielts_finish_writing_ai_draft', { p_draft_id: claim.draft_id, p_fields: null, p_provider_response_id: null });
    // Never log essay text, provider bodies, personal data or credentials.
    console.warn('Writing AI draft unavailable', { draftId: claim.draft_id });
    return json(503, { error: 'ai_unavailable' });
  }
});
