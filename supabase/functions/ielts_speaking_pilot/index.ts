import { createClient } from "npm:@supabase/supabase-js@2.78.0";
import {
  checkTranscriptSpeakingDraft,
  inspectSpeakingWav,
  SPEAKING_AI_INSTRUCTIONS,
  SPEAKING_AI_TRANSCRIPT_INSTRUCTIONS,
  SPEAKING_AI_TRANSCRIPT_PROMPT_VERSION,
  speakingAiDraftSchema,
  type SpeakingSegment,
} from "../_shared/ieltsSpeakingAudio.ts";
import { claudeEnabled, claudeText, primaryModel, providerTag, reasonOf } from "../_shared/aiProvider.ts";
import {
  INTERVIEW_ANALYSIS_VERSION,
  INTERVIEW_HIGHLIGHT_INSTRUCTIONS,
  INTERVIEW_TRANSCRIPTION_HINT,
  PRONUNCIATION_PASS_PROMPT_VERSION,
  cleanInterviewHighlights,
  cleanTeacherLines,
  dropPromptEcho,
  studentOnlyText,
  stripLeadingEcho,
  transcriptLooksComplete,
  interviewHighlightSchema,
  pronunciationInstructions,
  validatePronunciationPass,
  withIpa,
  type ClipPronunciation,
} from "../_shared/ieltsSpeakingAnnotations.ts";
// CMU Pronouncing Dictionary (American English): IPA comes from the dictionary, never from the AI.
import { dictionary } from "npm:cmu-pronouncing-dictionary@3.0.0";

// Speech-to-text stays on OpenAI (Claude cannot take audio). whisper-1 returns segment timestamps for the draft.
const transcribeModel = Deno.env.get("IELTS_PILOT_TRANSCRIBE_MODEL")?.trim() || "whisper-1";
async function transcribeSegments(bytes: ArrayBuffer, key: string, hint: string): Promise<SpeakingSegment[]> {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "clip.wav");
  form.append("model", transcribeModel);
  form.append("language", "en");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("prompt", hint.slice(0, 400));
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) throw new Error(`transcribe_${response.status}`);
  const out = await response.json().catch(() => null) as { segments?: Array<{ start?: unknown; end?: unknown; text?: unknown }> } | null;
  if (!Array.isArray(out?.segments)) throw new Error("transcribe_invalid");
  return out.segments
    .filter((s) => typeof s.text === "string" && Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end)))
    .map((s) => ({ start: Math.round(Number(s.start) * 10) / 10, end: Math.round(Number(s.end) * 10) / 10, text: String(s.text).trim().slice(0, 600) }))
    .filter((s) => s.text && s.end > s.start)
    .slice(0, 400);
}
/** Interview transcription: plain hint (never the questions) and echo removal (Bible 2.2.1 section 10.7). */
async function transcribeInterview(bytes: ArrayBuffer, key: string): Promise<SpeakingSegment[]> {
  return dropPromptEcho(await transcribeSegments(bytes, key, INTERVIEW_TRANSCRIPTION_HINT), INTERVIEW_TRANSCRIPTION_HINT);
}
/** Plain-text transcription with the stronger model (no timestamps needed for transcripts and highlights). */
const textTranscribeModel = Deno.env.get("IELTS_SPEAKING_TEXT_TRANSCRIBE_MODEL")?.trim() || "gpt-4o-transcribe";
async function transcribeText(bytes: ArrayBuffer, key: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "clip.wav");
  form.append("model", textTranscribeModel);
  form.append("language", "en");
  form.append("response_format", "json");
  form.append("prompt", INTERVIEW_TRANSCRIPTION_HINT);
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", signal: AbortSignal.timeout(90000), headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  if (!response.ok) throw new Error(`transcribe_text_${response.status}`);
  const out = await response.json().catch(() => null) as { text?: unknown } | null;
  if (typeof out?.text !== "string") throw new Error("transcribe_invalid");
  const echoFree = dropPromptEcho([{ text: out.text }], INTERVIEW_TRANSCRIPTION_HINT).map((s) => s.text).join(" ");
  return stripLeadingEcho(echoFree, INTERVIEW_TRANSCRIPTION_HINT);
}
/**
 * Transcript for the teacher view (Bible 2.2.1 section 10.7): the stronger model first, the segment model as a
 * fallback, and the more complete of the two when neither passes the completeness check (no loops, no lost speech).
 */
async function transcribeForAnalysis(bytes: ArrayBuffer, key: string, seconds: number): Promise<string> {
  const attempts: Array<() => Promise<string>> = [
    () => transcribeText(bytes, key),
    async () => (await transcribeInterview(bytes, key)).map((s) => s.text).join(" "),
  ];
  let best = "";
  for (const attempt of attempts) {
    try {
      const text = (await attempt()).replace(/\s+/g, " ").trim().slice(0, 20000);
      if (transcriptLooksComplete(text, seconds)) return text;
      why("transcript_incomplete", `${text.split(/\s+/).length} words in ${Math.round(seconds)}s`);
      if (text.length > best.length) best = text;
    } catch (e) {
      why("transcript_attempt", reasonOf(e));
    }
  }
  return best;
}
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const sha = async (b: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const base64 = (b: ArrayBuffer) => {
  let s = "";
  const a = new Uint8Array(b);
  for (let i = 0; i < a.length; i += 8192)
    s += String.fromCharCode(...a.subarray(i, i + 8192));
  return btoa(s);
};
function validateSimple(f: any) {
  const texts = [
    f?.next_step,
    f?.delivery_comment,
    ...Object.values(f?.observations ?? {}).map((o: any) => o.comment),
  ];
  for (const text of texts) {
    if (
      typeof text !== "string" ||
      /\b(band|IELTS score|official examiner|persistent weakness|syntactic complexity|lexical sophistication|cohesive devices|leverage|enhance)\b/i.test(
        text,
      )
    )
      throw new Error("invalid_draft");
    const sentences = text.match(/[^.!?]+[.!?]?/g) ?? [];
    if (sentences.some((s) => s.trim().split(/\s+/).length > 40))
      throw new Error("invalid_draft");
  }
}
// Failure reasons are logged as short codes only (never audio, transcripts or feedback text) so teachers' failed
// drafts can be diagnosed.
const why = (stage: string, detail: unknown) =>
  console.error(JSON.stringify({ fn: "ielts_speaking_pilot", stage, detail: String(detail).slice(0, 300) }));
/**
 * Diagnostic Bible 2.2.0 section 10.7: transcript, colour highlights and pronunciation words for every saved clip of a
 * submitted interview. Each clip is analysed once (insert-once rows); a repeat call fills only missing clips.
 * Speech-to-text and the pronunciation listening pass stay on OpenAI; Claude writes the highlights from the text.
 */
const analyseModel = Deno.env.get("IELTS_SPEAKING_PRONUNCIATION_MODEL")?.trim() || Deno.env.get("IELTS_SPEAKING_DRAFT_MODEL")?.trim() || "gpt-audio-1.5";
async function listenForPronunciation(bytes: ArrayBuffer, key: string, part: number, transcript: string, studentText: string): Promise<ClipPronunciation> {
  const none: ClipPronunciation = { assessed: false, words: [], prompt_version: PRONUNCIATION_PASS_PROMPT_VERSION };
  if (!studentText.replace(/[|\s]/g, "")) return none;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(70000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: analyseModel, modalities: ["text"], store: false, max_completion_tokens: 2000,
          messages: [
            { role: "system", content: pronunciationInstructions(true) + (attempt ? "\nThe previous output failed validation. Return only the JSON keys requested and copy words exactly from the transcript." : "") },
            { role: "user", content: [
              { type: "text", text: JSON.stringify({ task: { part }, transcript }) },
              { type: "input_audio", input_audio: { data: base64(bytes), format: "wav" } },
            ] },
          ],
        }),
      });
      if (!response.ok) {
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
        why("pronunciation_http", response.status);
        return none;
      }
      const out = await response.json();
      const choice = out.choices?.[0];
      if (choice?.finish_reason !== "stop" || !choice.message?.content) throw new Error("incomplete");
      const raw = String(choice.message.content).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      // Words must come from the STUDENT's speech: teacher lines and speech-to-text echoes never count.
      const pass = validatePronunciationPass(JSON.parse(raw), studentText);
      return { assessed: pass.assessed, words: pass.assessed ? withIpa(pass.words, dictionary as Record<string, string>, true) : [], prompt_version: PRONUNCIATION_PASS_PROMPT_VERSION };
    } catch (e) {
      if (attempt > 0) { why("pronunciation", reasonOf(e)); return none; }
    }
  }
  return none;
}

type Highlighted = { highlights: ReturnType<typeof cleanInterviewHighlights>; teacher: Record<string, string[]>; provider: string };
async function interviewHighlights(key: string, clips: Array<{ id: string; part: number; transcript: string }>): Promise<Highlighted> {
  const user = JSON.stringify({ clips: clips.map((c) => ({ id: c.id, part: c.part, transcript: c.transcript })) });
  const read = (value: unknown, provider: string): Highlighted => {
    const teacher = cleanTeacherLines(value, clips);
    return { teacher, highlights: cleanInterviewHighlights(value, clips.map((c) => ({ ...c, teacherLines: teacher[c.id] ?? [] }))), provider };
  };
  if (claudeEnabled()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await claudeText({ system: INTERVIEW_HIGHLIGHT_INSTRUCTIONS, user, maxTokens: 12000, schema: interviewHighlightSchema, timeoutMs: 90000 });
        return read(JSON.parse(result.text), providerTag("anthropic", result.model, result.id));
      } catch (e) {
        why(`highlights_claude_${attempt}`, reasonOf(e));
        if (!(e instanceof Error && e.name === "SyntaxError")) break;
      }
    }
  }
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(90000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("IELTS_SPEAKING_HIGHLIGHT_FALLBACK_MODEL")?.trim() || "gpt-4.1", store: false, response_format: { type: "json_object" },
        messages: [{ role: "system", content: INTERVIEW_HIGHLIGHT_INSTRUCTIONS }, { role: "user", content: user }] }),
    });
    if (!response.ok) throw new Error(`highlights_${response.status}`);
    const out = await response.json();
    return read(JSON.parse(out.choices?.[0]?.message?.content ?? "{}"), providerTag("openai", String(out.model ?? "gpt-4.1"), out.id));
  } catch (e) {
    why("highlights_openai", reasonOf(e));
    return { highlights: Object.fromEntries(clips.map((c) => [c.id, []])), teacher: Object.fromEntries(clips.map((c) => [c.id, []])), provider: "none" };
  }
}

// deno-lint-ignore no-explicit-any
async function analyse(sessionId: string, session: any, caller: any, admin: any): Promise<unknown> {
  if (session.status !== "submitted") throw new Error("not_submitted");
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("unavailable");
  const { data: extras, error: extrasError } = await caller.rpc("rpc_ielts_speaking_session_extras", { p_session_id: sessionId });
  if (extrasError) throw new Error("extras_failed");
  // Re-analyse clips with no analysis at the current version; older versions are kept as history.
  const done = new Set((extras?.analysis ?? []).filter((a: { prompt_version?: string }) => a.prompt_version === INTERVIEW_ANALYSIS_VERSION).map((a: { clip_id: string }) => a.clip_id));
  const todo = (session.clips ?? []).filter((c: { id: string }) => !done.has(c.id));
  if (!todo.length) return extras;
  const transcribed = await Promise.all(todo.map(async (clip: { id: string; part: number; path: string; sha256: string; duration_seconds: number }) => {
    const { data: audio, error } = await admin.storage.from("ielts-speaking-pilot").download(clip.path);
    if (error || !audio) throw new Error("missing_audio");
    const bytes = await audio.arrayBuffer();
    inspectSpeakingWav(bytes);
    if ((await sha(bytes)) !== clip.sha256) throw new Error("source_mismatch");
    const transcript = await transcribeForAnalysis(bytes, key, Number(clip.duration_seconds) || 0);
    return { id: clip.id, part: clip.part, transcript, bytes };
  }));
  // Who said what first, so highlights and pronunciation words use only the student's speech.
  const { highlights, teacher, provider } = await interviewHighlights(key, transcribed);
  const prepared = await Promise.all(transcribed.map(async (clip) => ({
    ...clip,
    teacherLines: teacher[clip.id] ?? [],
    pronunciation: await listenForPronunciation(clip.bytes, key, clip.part, clip.transcript, studentOnlyText(clip.transcript, teacher[clip.id] ?? [])),
  })));
  for (const clip of prepared) {
    const { error } = await admin.rpc("rpc_ielts_save_speaking_clip_analysis", {
      p_session_id: sessionId,
      p_clip_id: clip.id,
      p_transcript: clip.transcript,
      p_highlights: highlights[clip.id] ?? [],
      p_pronunciation: clip.pronunciation,
      p_prompt_version: INTERVIEW_ANALYSIS_VERSION,
      p_provider: `${provider}+openai/${analyseModel}`.slice(0, 200),
      p_speaker_turns: { teacher: clip.teacherLines },
    });
    if (error) throw new Error("save_failed");
  }
  const { data: fresh, error: freshError } = await caller.rpc("rpc_ielts_speaking_session_extras", { p_session_id: sessionId });
  if (freshError) throw new Error("extras_failed");
  return fresh;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"),
    anon = Deno.env.get("SUPABASE_ANON_KEY"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !secret) return reply({ error: "unavailable" }, 503);
  const authorization = req.headers.get("Authorization") ?? "";
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  let draftId: string | undefined;
  try {
    const { data: user, error: authError } = await caller.auth.getUser();
    if (authError || !user.user)
      return reply({ error: "sign_in_required" }, 401);
    const raw = await req.text();
    if (raw.length > 1500) return reply({ error: "invalid_request" }, 400);
    const body = JSON.parse(raw);
    if (!uuid(body.sessionId) || !["attach", "draft", "analyse"].includes(body.action))
      return reply({ error: "invalid_request" }, 400);
    const { data: session, error: sessionError } = await caller.rpc(
      "rpc_ielts_speaking_session",
      { p_session_id: body.sessionId },
    );
    if (sessionError || !session?.can_review)
      return reply({ error: "not_authorized" }, 403);
    if (body.action === "attach") {
      if (
        !session.can_record ||
        session.status !== "in_progress" ||
        !uuid(body.clipId) ||
        ![1, 2, 3].includes(body.part) ||
        typeof body.interrupted !== "boolean" ||
        Object.keys(body).some(
          (k) =>
            !["action", "sessionId", "clipId", "part", "interrupted"].includes(
              k,
            ),
        )
      )
        return reply({ error: "invalid_request" }, 400);
      const path = `${body.sessionId}/${body.part}/${body.clipId}.wav`;
      const { data: blob, error } = await admin.storage
        .from("ielts-speaking-pilot")
        .download(path);
      if (error || !blob) throw new Error("missing_audio");
      const bytes = await blob.arrayBuffer();
      const { duration } = inspectSpeakingWav(bytes);
      const hash = await sha(bytes);
      const { error: receipt } = await admin.rpc(
        "rpc_ielts_verify_speaking_audio",
        {
          p_session_id: body.sessionId,
          p_clip_id: body.clipId,
          p_part: body.part,
          p_sha256: hash,
          p_duration: duration,
        },
      );
      if (receipt) throw new Error("receipt_failed");
      const { data: updated, error: attach } = await caller.rpc(
        "rpc_ielts_attach_speaking_clip",
        {
          p_session_id: body.sessionId,
          p_clip_id: body.clipId,
          p_part: body.part,
          p_sha256: hash,
          p_duration: duration,
          p_interrupted: body.interrupted,
        },
      );
      if (attach) throw new Error("attach_failed");
      return reply({ session: updated });
    }
    if (Object.keys(body).some((k) => !["action", "sessionId"].includes(k)))
      return reply({ error: "invalid_request" }, 400);
    if (body.action === "analyse") return reply(await analyse(body.sessionId, session, caller, admin));
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return reply({ error: "unavailable" }, 503);
    const model = Deno.env.get("IELTS_SPEAKING_DRAFT_MODEL") ?? "gpt-audio-1.5";
    const { data: claim, error: claimError } = await caller.rpc(
      "rpc_ielts_claim_speaking_ai",
      { p_session_id: body.sessionId, p_model: primaryModel(model) },
    );
    if (claimError)
      return reply(
        {
          error: claimError.message.includes("rate_limit")
            ? "rate_limit"
            : "draft_unavailable",
        },
        429,
      );
    if (claim.fields) return reply(claim);
    draftId = claim.id;
    const context = claim.context;
    if (
      context.clips.reduce(
        (sum: number, c: any) => sum + c.duration_seconds,
        0,
      ) > 1200
    )
      throw new Error("audio_limit");
    const content: any[] = [
      {
        type: "text",
        text: JSON.stringify({
          task: context.package,
          incidents: context.incidents,
          clips: context.clips.map((c: any) => ({
            id: c.id,
            part: c.part,
            duration_seconds: c.duration_seconds,
            interrupted: c.interrupted,
          })),
        }),
      },
    ];
    const clipAudio: Array<{ id: string; part: number; duration_seconds: number; interrupted: boolean; bytes: ArrayBuffer }> = [];
    for (const clip of context.clips) {
      const { data: audio, error } = await admin.storage
        .from("ielts-speaking-pilot")
        .download(clip.path);
      if (error || !audio) throw new Error("missing_audio");
      const bytes = await audio.arrayBuffer();
      inspectSpeakingWav(bytes);
      if ((await sha(bytes)) !== clip.sha256)
        throw new Error("source_mismatch");
      clipAudio.push({ id: clip.id, part: clip.part, duration_seconds: clip.duration_seconds, interrupted: clip.interrupted, bytes });
      content.push(
        { type: "text", text: `Recording ${clip.id}, Part ${clip.part}.` },
        {
          type: "input_audio",
          input_audio: { data: base64(bytes), format: "wav" },
        },
      );
    }
    let fields: any, providerId: string | undefined;
    // Claude first (Max plan API credit): OpenAI writes timestamped transcripts, Claude drafts from them, and
    // pronunciation is recorded as not assessed (Bible 10.3). The original audio model below is the fallback.
    if (claudeEnabled()) {
      try {
        const transcripts = await Promise.all(clipAudio.map(async (clip) => ({
          id: clip.id,
          part: clip.part,
          duration_seconds: clip.duration_seconds,
          interrupted: clip.interrupted,
          segments: await transcribeInterview(clip.bytes, key),
        })));
        const user = JSON.stringify({ task: context.package, incidents: context.incidents, clips: transcripts });
        for (let attempt = 0; attempt < 2 && !fields; attempt++) {
          try {
            const result = await claudeText({
              system: SPEAKING_AI_TRANSCRIPT_INSTRUCTIONS + (attempt ? " Your last draft was invalid. Check the JSON fields, segment timestamps and simple wording carefully." : ""),
              user,
              maxTokens: 6000,
              schema: speakingAiDraftSchema,
              timeoutMs: 60000,
            });
            const draft = checkTranscriptSpeakingDraft(JSON.parse(result.text), transcripts);
            validateSimple(draft);
            const { error } = await admin.rpc("rpc_ielts_finish_speaking_ai", {
              p_draft_id: draftId,
              p_fields: draft,
              p_provider_id: providerTag("anthropic", result.model, result.id),
              p_provider_model: `${result.model}+${SPEAKING_AI_TRANSCRIPT_PROMPT_VERSION}`.slice(0, 200),
            });
            if (error) throw new Error("db_rejected");
            fields = draft;
            providerId = result.id;
          } catch (e) {
            why(`claude_attempt_${attempt}`, reasonOf(e));
            // Only output problems earn a second Claude try; provider/timeout failures go straight to the fallback.
            const retryable = e instanceof Error && (e.name === "SyntaxError" || /^(invalid_|db_rejected)/.test(e.message));
            if (!retryable) break;
          }
        }
      } catch (e) {
        why("claude_transcribe", reasonOf(e));
      }
    }
    const signal = AbortSignal.timeout(85000);
    for (let attempt = 0; !fields && attempt < 2; attempt++) {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          signal,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            modalities: ["text"],
            store: false,
            max_completion_tokens: 4000,
            messages: [
              {
                role: "system",
                content:
                  SPEAKING_AI_INSTRUCTIONS +
                  (attempt
                    ? " Your last draft was invalid. Check the JSON fields, audio timestamps and simple wording carefully."
                    : ""),
              },
              { role: "user", content },
            ],
          }),
        },
      );
      if (!response.ok) {
        why("provider_http", `${response.status} ${(await response.text().catch(() => "")).slice(0, 200)}`);
        if (
          attempt === 0 &&
          (response.status === 429 || response.status >= 500)
        )
          continue;
        throw new Error("provider_failed");
      }
      const result = await response.json();
      try {
        if (result.choices?.[0]?.finish_reason !== "stop")
          throw new Error("incomplete_draft: " + result.choices?.[0]?.finish_reason);
        fields = JSON.parse(result.choices[0].message.content);
        try { validateSimple(fields); } catch { throw new Error("wording_check_failed"); }
        // Database validation is authoritative and atomic; an invalid draft stays pending for one retry.
        const { error } = await admin.rpc("rpc_ielts_finish_speaking_ai", {
          p_draft_id: draftId,
          p_fields: fields,
            p_provider_id: providerTag("openai", String(result.model ?? model), result.id),
            p_provider_model: result.model,
        });
        if (error) throw new Error("db_rejected: " + error.message);
        providerId = result.id;
        break;
      } catch (e) {
        why(`draft_attempt_${attempt}`, e instanceof Error ? e.message : e);
        fields = undefined;
        if (attempt === 1) throw new Error("invalid_draft");
      }
    }
    if (!providerId || !fields) throw new Error("invalid_draft");
    const { data: checked, error: revoked } = await caller.rpc(
      "rpc_ielts_speaking_session",
      { p_session_id: body.sessionId },
    );
    if (revoked || !checked?.can_review)
      return reply({ error: "not_authorized" }, 403);
    return reply({
      id: draftId,
      source_hash: claim.source_hash,
      fields,
      teacher_confirmation_required: true,
    });
  } catch (e) {
    why("request", e instanceof Error ? e.message : e);
    if (draftId)
      await admin.rpc("rpc_ielts_finish_speaking_ai", {
        p_draft_id: draftId,
        p_fields: null,
        p_provider_id: null,
      });
    return reply({ error: "unavailable" }, 503);
  }
});
