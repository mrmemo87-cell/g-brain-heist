import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import { inspectSpeakingWav } from "../_shared/ieltsSpeakingAudio.ts";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Content-Type": "application/json",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers,
    });
  try {
    const token = req.headers.get("Authorization") ?? "";
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: token } },
        auth: { persistSession: false },
      },
    );
    const { data: user, error: authError } = await caller.auth.getUser();
    if (authError || !user.user)
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers,
      });
    const text = await req.text();
    if (text.length > 2000) throw new Error("invalid_request");
    const body = JSON.parse(text);
    if (
      !uuid.test(body.allocationId) ||
      !uuid.test(body.clipId) ||
      typeof body.interrupted !== "boolean" ||
      Object.keys(body).some(
        (k) => !["allocationId", "clipId", "interrupted"].includes(k),
      )
    )
      throw new Error("invalid_request");
    const { data: context, error: contextError } = await caller.rpc(
      "rpc_ielts_learning_recording_context",
      { p_id: body.allocationId, p_clip: body.clipId },
    );
    if (contextError || !context?.path) throw new Error("not_authorized");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: blob, error: downloadError } = await admin.storage
      .from("ielts-learning-recordings")
      .download(context.path);
    if (downloadError || !blob) throw new Error("recording_unavailable");
    const bytes = await blob.arrayBuffer(),
      { duration } = inspectSpeakingWav(bytes);
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { error: verifyError } = await admin.rpc(
      "service_ielts_learning_verify_recording",
      {
        p_id: body.allocationId,
        p_clip: body.clipId,
        p_actor: user.user.id,
        p_hash: hash,
        p_duration: duration,
        p_interrupted: body.interrupted,
      },
    );
    if (verifyError) throw new Error("recording_not_confirmed");
    const { data: detail, error: detailError } = await caller.rpc(
      "rpc_ielts_learning_detail",
      { p_id: body.allocationId },
    );
    if (detailError) throw new Error("not_authorized");
    return new Response(JSON.stringify({ detail }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "recording_not_confirmed" }), {
      status: 400,
      headers,
    });
  }
});
