import { supabase } from "./supabaseClient";

export type CommanderElixirStat = "force" | "defense" | "dexterity" | "stamina" | "omni";
export type CommanderElixirRarity = "common" | "rare" | "epic";

export type CommanderElixirCatalogItem = {
  id: string;
  name: string;
  statKey: CommanderElixirStat;
  boostRanks: number;
  durationMinutes: number;
  gemstonePrice: number;
  rarity: CommanderElixirRarity;
  description: string;
};

export type CommanderActiveElixir = {
  id: string;
  name: string;
  statKey: CommanderElixirStat;
  boostRanks: number;
  durationMinutes: number;
  activatedAt: string;
  expiresAt: string;
};

export type CommanderElixirSnapshot = {
  wallet: { gemstones: number };
  catalog: CommanderElixirCatalogItem[];
  inventory: Record<string, number>;
  active: CommanderActiveElixir | null;
  serverTime: string;
};

const normalize = (data: unknown): CommanderElixirSnapshot => {
  if (!data || typeof data !== "object") throw new Error("commander_elixir_unavailable");
  const raw = data as Partial<CommanderElixirSnapshot>;
  return {
    wallet: { gemstones: Math.max(0, Number(raw.wallet?.gemstones ?? 0)) },
    catalog: Array.isArray(raw.catalog) ? raw.catalog : [],
    inventory: raw.inventory && typeof raw.inventory === "object" ? raw.inventory : {},
    active: raw.active && typeof raw.active === "object" ? raw.active : null,
    serverTime: String(raw.serverTime ?? new Date().toISOString()),
  };
};

export async function getCommanderElixirs(signal?: AbortSignal): Promise<CommanderElixirSnapshot> {
  let request = supabase.rpc("rpc_commander_elixirs");
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return normalize(data);
}

export async function purchaseCommanderElixir(
  elixirId: string,
  requestId: string,
  quantity = 1,
  signal?: AbortSignal,
): Promise<CommanderElixirSnapshot> {
  let request = supabase.rpc("rpc_commander_elixir_purchase", {
    p_request_id: requestId,
    p_elixir_id: elixirId,
    p_quantity: quantity,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return normalize(data);
}

export async function activateCommanderElixir(
  elixirId: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<CommanderElixirSnapshot> {
  let request = supabase.rpc("rpc_commander_elixir_activate", {
    p_request_id: requestId,
    p_elixir_id: elixirId,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return normalize(data);
}

export const commanderElixirError = (cause: unknown) => {
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "object" && cause && "message" in cause
        ? String(cause.message)
        : String(cause ?? "");

  if (message.includes("commander_elixir_not_enough_gemstones")) return "You need more Gemstones for this elixir.";
  if (message.includes("commander_elixir_none_owned")) return "Buy this elixir before activating it.";
  if (message.includes("commander_elixir_other_active")) return "Another combat elixir is still active. Wait for it to expire before switching types.";
  if (message.includes("commander_elixir_request_conflict")) return "That elixir action could not be confirmed safely. Refresh Supplies and retry.";
  if (message.includes("commander_elixir_not_found")) return "That elixir is no longer available.";
  if (message.includes("commander_enroll_first")) return "Claim your Commander starter squad before using Supplies.";
  if (message.includes("commander_students_only")) return "Commander Supplies are available to student accounts.";
  return "Commander Supplies are temporarily unavailable. No Gemstones were intentionally spent by this screen.";
};
