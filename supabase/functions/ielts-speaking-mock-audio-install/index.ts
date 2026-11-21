// Diagnostic Bible 2.7.1 section 10.12: one-off installer for the Speaking practice mock examiner audio.
// It accepts only the exact files pinned in manifest.ts (same SHA-256 and size), stores each as
// ielts-speaking-examiner/{audio_id}.mp3 and registers it through the service-only register call.
// Registration records provenance only; a named person still listens and approves every file.
// Safe to call again (idempotent). Retire this endpoint (410) as soon as all files are installed.
import { createClient } from "npm:@supabase/supabase-js@2.78.0";
import { MANIFEST } from "./manifest.ts";

const BUCKET = "ielts-speaking-examiner";
const RIGHTS = "Generated for Brains Heist with Runway text-to-speech (paid workspace plan), 2026-11-21; owner-approved script.";
const byKey = new Map(MANIFEST.map((m) => [m[1], m]));
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "method" }, 405);
  const key = new URL(req.url).searchParams.get("audio_key") ?? "";
  const m = byKey.get(key);
  if (!m) return reply({ error: "unknown_audio_key" }, 404);
  const [audioId, audioKey, taskId, sha, bytes, duration] = m;
  const body = await req.arrayBuffer();
  if (body.byteLength !== bytes) return reply({ error: "size_mismatch" }, 422);
  if (hex(await crypto.subtle.digest("SHA-256", body)) !== sha) return reply({ error: "sha256_mismatch" }, 422);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const path = `${audioId}.mp3`;
  const up = await db.storage.from(BUCKET).upload(path, new Blob([body], { type: "audio/mpeg" }), { contentType: "audio/mpeg", upsert: false });
  if (up.error && !/exists|duplicate/i.test(up.error.message)) return reply({ error: "upload", detail: up.error.message }, 500);
  const reg = await db.rpc("rpc_ielts_register_speaking_mock_audio", {
    p_audio_id: audioId, p_audio_key: audioKey, p_path: path, p_sha256: sha, p_duration: duration, p_bytes: bytes,
    p_provider: "runway", p_provider_task_id: taskId, p_rights_basis: RIGHTS,
  });
  if (reg.error) return reply({ error: "register", detail: reg.error.message }, 500);
  return reply({ installed: audioId });
});
