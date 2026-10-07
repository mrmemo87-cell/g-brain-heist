import { createClient } from "npm:@supabase/supabase-js@2.78.0";
import {
  inspectSpeakingWav,
  SPEAKING_AI_INSTRUCTIONS,
} from "../_shared/ieltsSpeakingAudio.ts";
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
    if (!uuid(body.sessionId) || !["attach", "draft"].includes(body.action))
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
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return reply({ error: "unavailable" }, 503);
    const model = Deno.env.get("IELTS_SPEAKING_DRAFT_MODEL") ?? "gpt-audio-1.5";
    const { data: claim, error: claimError } = await caller.rpc(
      "rpc_ielts_claim_speaking_ai",
      { p_session_id: body.sessionId, p_model: model },
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
    for (const clip of context.clips) {
      const { data: audio, error } = await admin.storage
        .from("ielts-speaking-pilot")
        .download(clip.path);
      if (error || !audio) throw new Error("missing_audio");
      const bytes = await audio.arrayBuffer();
      inspectSpeakingWav(bytes);
      if ((await sha(bytes)) !== clip.sha256)
        throw new Error("source_mismatch");
      content.push(
        { type: "text", text: `Recording ${clip.id}, Part ${clip.part}.` },
        {
          type: "input_audio",
          input_audio: { data: base64(bytes), format: "wav" },
        },
      );
    }
    let fields: any, providerId: string | undefined;
    const signal = AbortSignal.timeout(85000);
    for (let attempt = 0; attempt < 2; attempt++) {
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
            max_completion_tokens: 2300,
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
          throw new Error("incomplete_draft");
        fields = JSON.parse(result.choices[0].message.content);
        validateSimple(fields);
        // Database validation is authoritative and atomic; an invalid draft stays pending for one retry.
        const { error } = await admin.rpc("rpc_ielts_finish_speaking_ai", {
          p_draft_id: draftId,
          p_fields: fields,
            p_provider_id: result.id,
            p_provider_model: result.model,
        });
        if (error) throw new Error("invalid_draft");
        providerId = result.id;
        break;
      } catch {
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
  } catch {
    if (draftId)
      await admin.rpc("rpc_ielts_finish_speaking_ai", {
        p_draft_id: draftId,
        p_fields: null,
        p_provider_id: null,
      });
    return reply({ error: "unavailable" }, 503);
  }
});
