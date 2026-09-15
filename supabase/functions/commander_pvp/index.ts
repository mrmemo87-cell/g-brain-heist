import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";
import {
  applyCommanderPvpTurn,
  buildCommanderPvpBattle,
  type CommanderPvpBattleState,
} from "./engine.ts";
import type { PracticeMove } from "../commander_practice/engine.ts";

const FUNCTION_VERSION = "commander_pvp_v1";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders,
    },
  });

const allowedMoves = new Set<PracticeMove>([
  "focus_target",
  "death_bolt",
  "guard",
  "chain_surge",
  "rot_miasma",
  "raise_dead",
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const randomSeed = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] >>> 0;
};

const numberRule = (rules: unknown, key: string, fallback: number) => {
  if (!rules || typeof rules !== "object") return fallback;
  const value = Number((rules as Record<string, unknown>)[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const isStudentAccount = async (userId: string) => {
  if (!admin) throw new Error("commander_pvp_not_configured");
  const { data, error } = await admin
    .from("users")
    .select("role,is_banned,banned_until")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("commander_pvp_student_lookup_failed");
  return data?.role === "student"
    && !data.is_banned
    && (!data.banned_until || new Date(data.banned_until).getTime() <= Date.now());
};

const loadOpponent = async (userId: string) => {
  if (!admin) throw new Error("commander_pvp_not_configured");
  const { data, error } = await admin
    .from("users")
    .select("id,username,avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("commander_pvp_target_unavailable");
  return {
    userId: data.id as string,
    username: typeof data.username === "string" && data.username.trim() ? data.username.trim() : "Commander",
    avatarUrl: typeof data.avatar_url === "string" ? data.avatar_url : null,
  };
};

type BattleRow = {
  id: string;
  campaign_id: string;
  attacker_id: string;
  defender_id: string;
  battle_state: CommanderPvpBattleState;
  status: "active" | "victory" | "defeat" | "draw" | "expired" | "cancelled";
  state_version: number;
  created_at: string;
  expires_at: string;
};

const battleResponse = async (row: BattleRow) => ({
  ok: true,
  version: FUNCTION_VERSION,
  mode: "pvp",
  persistentWrites: true,
  ruleset: "commander-pvp-v1",
  battleId: row.id,
  expiresAt: row.expires_at,
  opponent: await loadOpponent(row.defender_id),
  battle: row.battle_state,
});

const loadBattle = async (battleId: string) => {
  if (!admin) throw new Error("commander_pvp_not_configured");
  const { data, error } = await admin
    .from("commander_pvp_battles")
    .select("id,campaign_id,attacker_id,defender_id,battle_state,status,state_version,created_at,expires_at")
    .eq("id", battleId)
    .maybeSingle();
  if (error) throw new Error("commander_pvp_battle_lookup_failed");
  return data as BattleRow | null;
};

const loadActiveBattle = async (attackerId: string) => {
  if (!admin) throw new Error("commander_pvp_not_configured");
  const { data, error } = await admin
    .from("commander_pvp_battles")
    .select("id,campaign_id,attacker_id,defender_id,battle_state,status,state_version,created_at,expires_at")
    .eq("attacker_id", attackerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("commander_pvp_battle_lookup_failed");
  return data as BattleRow | null;
};

const expireIfNeeded = async (row: BattleRow) => {
  if (!admin || row.status !== "active" || new Date(row.expires_at).getTime() > Date.now()) return row;
  await admin
    .from("commander_pvp_battles")
    .update({ status: "expired", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "active");
  return { ...row, status: "expired" as const };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, version: FUNCTION_VERSION, error: "method_not_allowed" });
  if (!admin || !supabaseUrl || !serviceRoleKey) {
    return json(503, { ok: false, version: FUNCTION_VERSION, error: "commander_pvp_not_configured" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { ok: false, version: FUNCTION_VERSION, error: "missing_bearer_token" });

  const { data: authData, error: authError } = await admin.auth.getUser(token)
    .catch(() => ({ data: { user: null }, error: new Error("auth_unavailable") }));
  const user = authData?.user;
  if (authError || !user) return json(401, { ok: false, version: FUNCTION_VERSION, error: "invalid_auth_token" });

  try {
    if (!(await isStudentAccount(user.id))) {
      return json(403, { ok: false, version: FUNCTION_VERSION, error: "commander_pvp_students_only" });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "commander_pvp_student_lookup_failed";
    return json(503, { ok: false, version: FUNCTION_VERSION, error: code });
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
      const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
      if (!uuidPattern.test(targetUserId)) throw new Error("commander_pvp_invalid_target");
      if (targetUserId === user.id) throw new Error("commander_pvp_self_target");

      const { data: campaign, error: campaignError } = await admin
        .from("commander_campaigns")
        .select("id,rules")
        .eq("active", true)
        .maybeSingle();
      if (campaignError || !campaign) throw new Error("commander_unavailable");

      const ttlMinutes = numberRule(campaign.rules, "pvpBattleTtlMinutes", 30);
      const cooldownSeconds = numberRule(campaign.rules, "pvpCooldownSeconds", 300);

      let active = await loadActiveBattle(user.id);
      if (active) active = await expireIfNeeded(active);
      if (active?.status === "active") {
        if (active.defender_id !== targetUserId) throw new Error("commander_pvp_active_battle");
        return json(200, await battleResponse(active));
      }

      const since = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
      const { data: recent, error: recentError } = await admin
        .from("commander_pvp_battles")
        .select("created_at")
        .eq("attacker_id", user.id)
        .eq("defender_id", targetUserId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentError) throw new Error("commander_pvp_battle_lookup_failed");
      if (recent) throw new Error("commander_pvp_target_cooldown");

      const [attackerResult, defenderResult, opponent] = await Promise.all([
        admin.rpc("rpc_commander_owned_loadout", { p_user_id: user.id }),
        admin.rpc("rpc_commander_owned_loadout", { p_user_id: targetUserId }),
        loadOpponent(targetUserId),
      ]);
      if (attackerResult.error || !attackerResult.data) throw new Error("commander_enroll_first");
      if (defenderResult.error || !defenderResult.data) throw new Error("commander_pvp_target_unavailable");

      const state = buildCommanderPvpBattle(
        randomSeed(),
        attackerResult.data,
        defenderResult.data,
        opponent.username,
      );
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();

      const { data: inserted, error: insertError } = await admin
        .from("commander_pvp_battles")
        .insert({
          campaign_id: campaign.id,
          attacker_id: user.id,
          defender_id: targetUserId,
          attacker_snapshot: attackerResult.data,
          defender_snapshot: defenderResult.data,
          battle_state: state,
          status: "active",
          state_version: 1,
          expires_at: expiresAt,
        })
        .select("id,campaign_id,attacker_id,defender_id,battle_state,status,state_version,created_at,expires_at")
        .single();

      if (insertError || !inserted) {
        if (insertError?.code === "23505") {
          const raced = await loadActiveBattle(user.id);
          if (raced?.defender_id === targetUserId) return json(200, await battleResponse(raced));
          throw new Error("commander_pvp_active_battle");
        }
        throw new Error("commander_pvp_start_failed");
      }

      return json(200, await battleResponse(inserted as BattleRow));
    }

    if (action === "resume") {
      const requested = typeof body.battleId === "string" ? body.battleId : "";
      let row = requested && uuidPattern.test(requested) ? await loadBattle(requested) : await loadActiveBattle(user.id);
      if (!row || row.attacker_id !== user.id) throw new Error("commander_pvp_battle_not_found");
      row = await expireIfNeeded(row);
      if (row.status !== "active") throw new Error("commander_pvp_battle_finished");
      return json(200, await battleResponse(row));
    }

    if (action === "turn") {
      const battleId = typeof body.battleId === "string" ? body.battleId : "";
      const move = typeof body.move === "string" ? body.move as PracticeMove : null;
      const targetId = typeof body.targetId === "string" ? body.targetId : null;
      if (!uuidPattern.test(battleId)) throw new Error("commander_pvp_battle_not_found");
      if (!move || !allowedMoves.has(move)) throw new Error("invalid_move");

      let row = await loadBattle(battleId);
      if (!row || row.attacker_id !== user.id) throw new Error("commander_pvp_battle_not_found");
      row = await expireIfNeeded(row);
      if (row.status !== "active") throw new Error("commander_pvp_battle_finished");

      const next = applyCommanderPvpTurn(row.battle_state, { move, targetId });
      const finished = next.status !== "active";
      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await admin
        .from("commander_pvp_battles")
        .update({
          battle_state: next,
          state_version: row.state_version + 1,
          status: next.status,
          updated_at: now,
          finished_at: finished ? now : null,
        })
        .eq("id", row.id)
        .eq("attacker_id", user.id)
        .eq("status", "active")
        .eq("state_version", row.state_version)
        .select("id,campaign_id,attacker_id,defender_id,battle_state,status,state_version,created_at,expires_at")
        .maybeSingle();
      if (updateError) throw new Error("commander_pvp_turn_failed");
      if (!updated) throw new Error("commander_pvp_stale_turn");
      return json(200, await battleResponse(updated as BattleRow));
    }

    if (action === "cancel") {
      const battleId = typeof body.battleId === "string" ? body.battleId : "";
      if (!uuidPattern.test(battleId)) throw new Error("commander_pvp_battle_not_found");
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("commander_pvp_battles")
        .update({ status: "cancelled", finished_at: now, updated_at: now })
        .eq("id", battleId)
        .eq("attacker_id", user.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle();
      if (error) throw new Error("commander_pvp_cancel_failed");
      if (!data) throw new Error("commander_pvp_battle_not_found");
      return json(200, { ok: true, version: FUNCTION_VERSION, cancelled: true, battleId });
    }

    return json(400, { ok: false, version: FUNCTION_VERSION, error: "invalid_action" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "commander_pvp_error";
    const status = code === "commander_pvp_battle_not_found" ? 404
      : code === "commander_pvp_active_battle" || code === "commander_pvp_stale_turn" || code === "commander_pvp_battle_finished" ? 409
      : code === "commander_pvp_target_cooldown" ? 429
      : code === "commander_pvp_students_only" ? 403
      : code.includes("not_configured") || code.includes("lookup_failed") ? 503
      : 400;
    return json(status, { ok: false, version: FUNCTION_VERSION, error: code });
  }
});
