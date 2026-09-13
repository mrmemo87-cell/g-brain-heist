import { supabase } from "./supabaseClient";

export type CommanderSlot = "guard" | "archer" | "weapon" | "shield";
export type CommanderStat = "force" | "defense" | "dexterity" | "stamina";
export type CommanderOperation = "enroll" | "buy" | "equip" | "train" | "goal";
export type CommanderCatalogItem = {
  id: string;
  name: string;
  kind: "unit" | "weapon" | "shield";
  slot: CommanderSlot;
  price: number;
  description: string;
  stats: Record<string, number>;
};
export type CommanderOwnedLoadout = {
  version: 1;
  profileVersion: number;
  hp: number;
  shield: number;
  bolt: number;
  focus: number;
  guard: number;
  shieldCap: number;
  weaponName: string;
  shieldName: string;
  units: Array<{
    id: "player_guard" | "player_archer";
    name: string;
    hp: number;
    shield: number;
    attack: number;
  }>;
};
export type CommanderHeadquarters = {
  wallet?: { coins: number; currency: "brains_heist_coins" };
  campaign: { id: string; title: string; rules: Record<string, number> };
  profile: null | {
    coins: number;
    xp: number;
    level: number;
    rankCap: number;
    version: number;
    force_rank: number;
    defense_rank: number;
    dexterity_rank: number;
    stamina_rank: number;
    weapon: string;
    shield: string;
    guard: string;
    archer: string;
    goal: string | null;
  };
  catalog: CommanderCatalogItem[];
  owned: string[];
  loadout: CommanderOwnedLoadout | null;
  history: Array<{
    operation: string;
    payload: { target?: string | null };
    coins_delta: number;
    xp_delta: number;
    created_at: string;
  }>;
};

export const commanderHeadquartersError = (cause: unknown) => {
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "object" && cause && "message" in cause
        ? String(cause.message)
        : "";
  const known: Record<string, string> = {
    commander_students_only: "Commander is available to student accounts.",
    commander_insufficient_coins: "You need more Coins for this upgrade.",
    commander_stale_profile:
      "Your army changed in another session. Refresh to see the latest version.",
    commander_already_owned: "This item is already in your collection.",
    commander_rank_cap:
      "Reach the next required Commander level to train further.",
    commander_not_owned:
      "Add this item to your collection before equipping it.",
    commander_enroll_first: "Claim your starter squad first.",
    commander_request_conflict:
      "This action could not be confirmed. Refresh before trying again.",
  };
  return (
    Object.entries(known).find(([key]) => message.includes(key))?.[1] ??
    "Headquarters is unavailable right now. Your army and balance have not been reset. Please retry."
  );
};

export async function getCommanderHeadquarters(
  signal?: AbortSignal,
): Promise<CommanderHeadquarters> {
  let request = supabase.rpc("rpc_commander_headquarters");
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error || !data?.campaign || !Array.isArray(data.catalog))
    throw error ?? new Error("commander_unavailable");
  return data as CommanderHeadquarters;
}
export async function sendCommanderCommand(
  operation: CommanderOperation,
  target: string | null,
  version: number | null,
  requestId: string,
  signal?: AbortSignal,
): Promise<CommanderHeadquarters> {
  let request = supabase.rpc("rpc_commander_command", {
    p_request_id: requestId,
    p_operation: operation,
    p_target: target,
    p_expected_version: version,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error || !data?.campaign || !Array.isArray(data.catalog))
    throw error ?? new Error("commander_unavailable");
  return data as CommanderHeadquarters;
}
