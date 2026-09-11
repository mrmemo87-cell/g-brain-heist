import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import {
  applyPracticeTurn,
  startPracticeBattle,
  type PracticeBattleState,
  type PracticeMove,
} from "./engine.ts";

const FUNCTION_VERSION = "commander_practice_v1";
const TOKEN_VERSION = 1 as const;
const TRANSCRIPT_TTL_MS = 15 * 60 * 1000;
const MAX_TOKEN_LENGTH = 24_000;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const signingSecret = Deno.env.get("COMMANDER_PREVIEW_SIGNING_SECRET") ?? "";

const admin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const parseAllowlist = (name: string) =>
  new Set(
    (Deno.env.get(name) ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

const testerIds = parseAllowlist("COMMANDER_PREVIEW_TESTER_IDS");
const testerEmails = parseAllowlist("COMMANDER_PREVIEW_TESTER_EMAILS");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
let signingKeyPromise: Promise<CryptoKey> | null = null;

const getSigningKey = () => {
  if (signingSecret.length < 32) {
    throw new Error("preview_signing_secret_not_configured");
  }
  signingKeyPromise ??= crypto.subtle.importKey(
    "raw",
    textEncoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return signingKeyPromise;
};

type PracticeTranscript = {
  v: typeof TOKEN_VERSION;
  sub: string;
  exp: number;
  state: PracticeBattleState;
};

const signTranscript = async (payload: PracticeTranscript) => {
  const bodyBytes = textEncoder.encode(JSON.stringify(payload));
  const body = base64UrlEncode(bodyBytes);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getSigningKey(),
    textEncoder.encode(body),
  );
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
};

const verifyTranscript = async (token: string, userId: string): Promise<PracticeTranscript> => {
  if (!token || token.length > MAX_TOKEN_LENGTH) throw new Error("invalid_transcript");
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("invalid_transcript");

  let signature: Uint8Array;
  try {
    signature = base64UrlDecode(parts[1]);
  } catch {
    throw new Error("invalid_transcript");
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await getSigningKey(),
    signature,
    textEncoder.encode(parts[0]),
  );
  if (!valid) throw new Error("invalid_transcript_signature");

  let payload: PracticeTranscript;
  try {
    payload = JSON.parse(textDecoder.decode(base64UrlDecode(parts[0]))) as PracticeTranscript;
  } catch {
    throw new Error("invalid_transcript");
  }

  if (payload.v !== TOKEN_VERSION || payload.sub !== userId || payload.state?.version !== 1) {
    throw new Error("invalid_transcript");
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
    throw new Error("transcript_expired");
  }

  return payload;
};

const isAllowedTester = (user: { id: string; email?: string | null }) => {
  const email = String(user.email ?? "").trim().toLowerCase();
  return testerIds.has(user.id.toLowerCase()) || (Boolean(email) && testerEmails.has(email));
};

const randomSeed = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] >>> 0;
};

const allowedMoves = new Set<PracticeMove>(["focus_target", "death_bolt", "guard"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") {
    return json(405, { ok: false, version: FUNCTION_VERSION, error: "method_not_allowed" });
  }

  if (!admin || !supabaseUrl || !serviceRoleKey) {
    return json(503, { ok: false, version: FUNCTION_VERSION, error: "preview_auth_not_configured" });
  }
  if (signingSecret.length < 32) {
    return json(503, { ok: false, version: FUNCTION_VERSION, error: "preview_signing_secret_not_configured" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { ok: false, version: FUNCTION_VERSION, error: "missing_bearer_token" });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) {
    return json(401, { ok: false, version: FUNCTION_VERSION, error: "invalid_auth_token" });
  }

  if (!isAllowedTester(user)) {
    return json(403, { ok: false, version: FUNCTION_VERSION, error: "commander_preview_not_enabled" });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, version: FUNCTION_VERSION, error: "invalid_json_body" });
  }

  const action = String(body.action ?? "");

  try {
    if (action === "start") {
      const exp = Date.now() + TRANSCRIPT_TTL_MS;
      const state = startPracticeBattle(randomSeed());
      const transcript = await signTranscript({ v: TOKEN_VERSION, sub: user.id, exp, state });
      return json(200, {
        ok: true,
        version: FUNCTION_VERSION,
        practice: true,
        persistentWrites: false,
        ruleset: "commander-practice-v1",
        expiresAt: new Date(exp).toISOString(),
        transcript,
        battle: state,
      });
    }

    if (action === "turn") {
      const transcriptToken = typeof body.transcript === "string" ? body.transcript : "";
      const move = typeof body.move === "string" ? body.move as PracticeMove : null;
      const targetId = typeof body.targetId === "string" ? body.targetId : null;
      if (!move || !allowedMoves.has(move)) {
        return json(400, { ok: false, version: FUNCTION_VERSION, error: "invalid_move" });
      }

      const payload = await verifyTranscript(transcriptToken, user.id);
      const state = applyPracticeTurn(payload.state, { move, targetId });
      const transcript = await signTranscript({ ...payload, state });
      return json(200, {
        ok: true,
        version: FUNCTION_VERSION,
        practice: true,
        persistentWrites: false,
        ruleset: "commander-practice-v1",
        expiresAt: new Date(payload.exp).toISOString(),
        transcript,
        battle: state,
      });
    }

    return json(400, { ok: false, version: FUNCTION_VERSION, error: "invalid_action" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "practice_error";
    const status = code === "transcript_expired" ? 401
      : code === "battle_finished" ? 409
      : code.startsWith("preview_") ? 503
      : 400;
    return json(status, { ok: false, version: FUNCTION_VERSION, error: code });
  }
});
