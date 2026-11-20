import { createClient } from "npm:@supabase/supabase-js@2.78.0";
import { SCRIBE_DEFAULT_MODEL, scribeTranscribe, timedWords } from "../_shared/ieltsSpeechToText.ts";

/**
 * Word times for saved IELTS Speaking interview recordings (Visual & UX Bible 1.14.0, section 13.9).
 *
 * The interview review marks the word being spoken while a recording plays and lets the reader start playback from
 * any word. New interviews get their word times from the transcription the AI draft already makes
 * (ielts_speaking_pilot). This function times recordings that have none yet: one extra speech-to-text request per
 * recording, run only when the reviewing teacher asks for it.
 *
 * The timed words are used only to place times on the transcript that is already shown. They are never displayed,
 * scored or used as evidence (Diagnostic Bible 10.7: the transcript carries no score), and the questions are never
 * sent as a hint. Only a teacher who may review the session can call this; the recording is checked against its
 * verified hash before it is sent anywhere.
 */
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const sha = async (b: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
// Short codes only: never audio, words or names.
const why = (stage: string, detail: unknown) =>
  console.error(JSON.stringify({ fn: "ielts_speaking_word_times", stage, detail: String(detail).slice(0, 200) }));

const MODEL = Deno.env.get("IELTS_PILOT_TRANSCRIBE_MODEL")?.trim() || "whisper-1";
// Plain context only; the interview questions are never used as a hint.
const HINT = "An English-language school interview. Write exactly what is said, including the student's mistakes.";
const MAX_CLIPS = 12;
const MAX_SECONDS = 1800;

type TimedWord = [string, number];
// ElevenLabs Scribe returns word times with its transcript; whisper-1 stays as the fallback.
const SCRIBE_KEY = Deno.env.get("ELEVENLABS_API_KEY")?.trim() || "";
const SCRIBE_MODEL = Deno.env.get("IELTS_SPEAKING_SCRIBE_MODEL")?.trim() || SCRIBE_DEFAULT_MODEL;
async function timeWordsAnyModel(bytes: ArrayBuffer, key: string): Promise<{ words: TimedWord[]; model: string }> {
  if (SCRIBE_KEY) {
    try {
      const heard = await scribeTranscribe(bytes, { apiKey: SCRIBE_KEY, model: SCRIBE_MODEL, timeoutMs: 90000 });
      const words = timedWords(heard.words);
      if (words.length) return { words, model: `elevenlabs/${heard.model}` };
    } catch (e) {
      why("scribe", e instanceof Error ? e.message : e);
    }
  }
  return { words: await timeWords(bytes, key), model: MODEL };
}

async function timeWords(bytes: ArrayBuffer, key: string): Promise<TimedWord[]> {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "clip.wav");
  form.append("model", MODEL);
  form.append("language", "en");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("prompt", HINT);
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    signal: AbortSignal.timeout(90000),
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!response.ok) throw new Error(`transcribe_${response.status}`);
  const out = await response.json().catch(() => null) as { words?: Array<{ word?: unknown; start?: unknown }> } | null;
  if (!Array.isArray(out?.words)) throw new Error("transcribe_invalid");
  return out.words
    .filter((w) => typeof w.word === "string" && w.word.trim() && Number.isFinite(Number(w.start)))
    .map((w): TimedWord => [String(w.word).trim().slice(0, 60), Math.round(Number(w.start) * 100) / 100])
    .slice(0, 8000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"),
    anon = Deno.env.get("SUPABASE_ANON_KEY"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    key = Deno.env.get("OPENAI_API_KEY");
  if (!url || !anon || !secret || !key) return reply({ error: "unavailable" }, 503);
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  try {
    const { data: user, error: authError } = await caller.auth.getUser();
    if (authError || !user.user) return reply({ error: "sign_in_required" }, 401);
    const raw = await req.text();
    if (raw.length > 500) return reply({ error: "invalid_request" }, 400);
    const body = JSON.parse(raw);
    if (!uuid(body.sessionId) || Object.keys(body).some((k) => k !== "sessionId"))
      return reply({ error: "invalid_request" }, 400);

    // The same server-side check the review screen uses: only a teacher who may review this session.
    const { data: session, error: sessionError } = await caller.rpc("rpc_ielts_speaking_session", { p_session_id: body.sessionId });
    if (sessionError || !session?.can_review) return reply({ error: "not_authorized" }, 403);
    if (session.status !== "submitted") return reply({ error: "not_submitted" }, 409);

    const read = async () => {
      const { data, error } = await caller.rpc("rpc_ielts_speaking_clip_words", { p_session_id: body.sessionId });
      if (error) throw new Error("words_failed");
      return (data ?? []) as Array<{ clip_id: string }>;
    };
    const have = new Set((await read()).map((w) => w.clip_id));
    const todo = ((session.clips ?? []) as Array<{ id: string; path: string; sha256: string; duration_seconds: number }>)
      .filter((c) => !have.has(c.id))
      .slice(0, MAX_CLIPS);
    if (todo.reduce((sum, c) => sum + Number(c.duration_seconds || 0), 0) > MAX_SECONDS)
      return reply({ error: "audio_limit" }, 413);

    await Promise.all(todo.map(async (clip) => {
      try {
        const { data: audio, error } = await admin.storage.from("ielts-speaking-pilot").download(clip.path);
        if (error || !audio) throw new Error("missing_audio");
        const bytes = await audio.arrayBuffer();
        if ((await sha(bytes)) !== clip.sha256) throw new Error("source_mismatch");
        const { words, model } = await timeWordsAnyModel(bytes, key);
        if (!words.length) return;
        const { error: saveError } = await admin.rpc("rpc_ielts_save_speaking_clip_words", {
          p_session_id: body.sessionId,
          p_clip_id: clip.id,
          p_words: words,
          p_model: model,
        });
        if (saveError) throw new Error("save_failed");
      } catch (e) {
        // One recording failing never blocks the others; the teacher can try again.
        why("clip", e instanceof Error ? e.message : e);
      }
    }));

    // Re-check access before returning anything, in case it was withdrawn while the audio was processed.
    const { data: checked, error: revoked } = await caller.rpc("rpc_ielts_speaking_session", { p_session_id: body.sessionId });
    if (revoked || !checked?.can_review) return reply({ error: "not_authorized" }, 403);
    return reply({ words: await read() });
  } catch (e) {
    why("request", e instanceof Error ? e.message : e);
    return reply({ error: "unavailable" }, 503);
  }
});
