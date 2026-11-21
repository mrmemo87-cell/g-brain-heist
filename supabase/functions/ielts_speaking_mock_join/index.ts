// Diagnostic Bible 2.7.0 section 10.12: joins a recorded-examiner Speaking mock.
// For each part in order: verify every uploaded answer, join them into one 16 kHz WAV, store it
// where interview clips live, attach it through the mock attach call (same receipt and clip rows
// as an interview), then delete the single-answer working copies. Submits when all three parts
// are joined and the student has finished. Safe to call again: every step is idempotent.
// The student calls this after each part and at the end; a reviewing teacher may call it to retry.
import { createClient } from "npm:@supabase/supabase-js@2.78.0";
import {
  answerPcm,
  joinAnswers,
  partClipId,
  partPlan,
  sha256Hex,
  type MockAnswer,
  type MockLine,
} from "../_shared/ieltsSpeakingMockJoin.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const ANSWERS = "ielts-speaking-mock-answers";
const CLIPS = "ielts-speaking-pilot";

type State = {
  session_id: string;
  status: string;
  finished: boolean;
  lines: MockLine[];
  answers: (MockAnswer & { interrupted: boolean })[];
  parts: { part: number; clip_id: string }[];
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"),
    anon = Deno.env.get("SUPABASE_ANON_KEY"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !secret) return reply({ error: "unavailable" }, 503);
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  try {
    const { data: user, error: authError } = await caller.auth.getUser();
    if (authError || !user.user) return reply({ error: "sign_in_required" }, 401);
    const raw = await req.text();
    if (raw.length > 200) return reply({ error: "invalid_request" }, 400);
    const body = JSON.parse(raw);
    if (!uuid(body.sessionId) || Object.keys(body).some((k) => k !== "sessionId"))
      return reply({ error: "invalid_request" }, 400);
    // The student who owns the sitting, or a teacher who may review it. Same check as an interview.
    const { error: accessError } = await caller.rpc("rpc_ielts_speaking_session", { p_session_id: body.sessionId });
    if (accessError) return reply({ error: "not_authorized" }, 403);
    const result = await join(admin, body.sessionId);
    return reply(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    console.error("ielts_speaking_mock_join", message);
    return reply({ error: "join_failed", reason: message.slice(0, 80) }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function state(admin: any, sessionId: string): Promise<State> {
  const { data, error } = await admin.rpc("rpc_ielts_speaking_mock_server_state", { p_session_id: sessionId });
  if (error || !data) throw new Error("not_a_mock");
  return data as State;
}

// deno-lint-ignore no-explicit-any
async function join(admin: any, sessionId: string) {
  let s = await state(admin, sessionId);
  const joined: number[] = [];
  const waiting: Record<number, string[]> = {};
  let blocked: string | null = null;
  for (const part of [1, 2, 3]) {
    if (!s.parts.some((p) => p.part === part)) {
      const plan = partPlan(s.lines, s.answers, part);
      if (plan.noAudio) {
        blocked = `part_${part}_has_no_audio`;
        break;
      }
      if (!plan.ready) {
        waiting[part] = plan.waiting;
        break;
      }
      const pieces: { line_key: string; pcm: Uint8Array }[] = [];
      for (const { line, answer } of plan.withAudio) {
        const { data: blob, error } = await admin.storage.from(ANSWERS).download(`${sessionId}/${answer.id}.wav`);
        if (error || !blob) throw new Error("answer_audio_missing");
        const bytes = await blob.arrayBuffer();
        const audio = answerPcm(bytes, line.answer_seconds ?? 0);
        const { error: verifyError } = await admin.rpc("rpc_ielts_speaking_mock_verify_answer", {
          p_answer_id: answer.id,
          p_sha256: await sha256Hex(bytes),
          p_duration: audio.duration,
        });
        if (verifyError) throw new Error("answer_verify_failed");
        pieces.push({ line_key: line.key, pcm: audio.pcm });
      }
      const clip = joinAnswers(pieces);
      const clipId = await partClipId(sessionId, part);
      const { error: uploadError } = await admin.storage
        .from(CLIPS)
        .upload(`${sessionId}/${part}/${clipId}.wav`, new Blob([clip.bytes], { type: "audio/wav" }), {
          contentType: "audio/wav",
          upsert: true,
        });
      if (uploadError) throw new Error("clip_upload_failed");
      const { error: attachError } = await admin.rpc("rpc_ielts_speaking_mock_attach_part", {
        p_session_id: sessionId,
        p_part: part,
        p_clip_id: clipId,
        p_sha256: await sha256Hex(clip.bytes),
        p_duration: clip.duration,
        p_segments: clip.segments,
      });
      if (attachError) throw new Error("attach_failed");
      joined.push(part);
      s = await state(admin, sessionId);
    }
    // Working copies go once their part is joined, so fewer copies of a child's voice are kept.
    for (const a of s.answers.filter((x) => x.part === part && x.verified && !x.file_deleted)) {
      const { error: removeError } = await admin.storage.from(ANSWERS).remove([`${sessionId}/${a.id}.wav`]);
      if (removeError) throw new Error("working_copy_delete_failed");
      const { error: markError } = await admin.rpc("rpc_ielts_speaking_mock_answer_file_deleted", { p_answer_id: a.id });
      if (markError) throw new Error("working_copy_mark_failed");
    }
  }
  s = await state(admin, sessionId);
  let submitted = s.status === "submitted";
  if (!submitted && s.finished && s.parts.length === 3) {
    const { error } = await admin.rpc("rpc_ielts_speaking_mock_submit", { p_session_id: sessionId });
    if (error) throw new Error("submit_failed");
    submitted = true;
  }
  return { joined, parts: s.parts.map((p) => p.part), waiting, blocked, submitted };
}
