import { supabase } from "./supabaseClient";

export type CommanderSlot = "guard" | "archer" | "weapon" | "shield";
export type CommanderStat = "force" | "defense" | "dexterity" | "stamina";
export type CommanderFormationId = "command_line" | "bastion_wedge" | "spearhead" | "arc_lattice";
export type CommanderOperation =
  | "enroll"
  | "buy"
  | "equip"
  | "train"
  | "unit_train"
  | "formation_train"
  | "formation_set"
  | "goal";
export type CommanderSchool = "neutral" | "void" | "storm" | "rot" | "grave";
export type CommanderMasterySchool = Exclude<CommanderSchool, "neutral">;
export type CommanderRarity = "common" | "rare" | "epic" | "legendary";
export type CommanderCatalogItem = {
  id: string;
  name: string;
  kind: "unit" | "weapon" | "shield";
  slot: CommanderSlot;
  price: number;
  description: string;
  stats: Record<string, number>;
  /** Additive metadata: older deployments may omit these until the catalog migration lands. */
  school?: CommanderSchool;
  rarity?: CommanderRarity;
  /** Minimum Commander level required for a new purchase. Existing owners are grandfathered. */
  unlock_level?: number;
};
export type CommanderUnitProgress = {
  itemId: string;
  unitRank: number;
  evolutionTier: number;
  trainingPoints: number;
  version: number;
  rankCap: number;
  maxRank: number;
  nextCost: number | null;
  veteran: boolean;
};
export type CommanderFormationModifiers = {
  commanderHp: number;
  commanderShield: number;
  bolt: number;
  focus: number;
  guard: number;
  shieldCap: number;
  guardHp: number;
  guardShield: number;
  guardAttack: number;
  archerHp: number;
  archerShield: number;
  archerAttack: number;
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
  /** Permanent school mastery is trusted server state. Combat only applies a rank when its power is available. */
  schoolMastery?: Partial<Record<CommanderMasterySchool, number>>;
  /** Formation state is composed by the trusted DB loadout. Browsers never submit these combat modifiers. */
  formation?: {
    activeId: CommanderFormationId;
    rank: number;
    ranks: Record<CommanderFormationId, number>;
    modifiers?: CommanderFormationModifiers;
  };
  units: Array<{
    id: "player_guard" | "player_archer";
    /** Trusted catalog identity is returned by newer Commander loadout snapshots. */
    catalogId?: string;
    school?: CommanderSchool;
    unitRank?: number;
    evolutionTier?: number;
    evolutionPassive?: "bulwark_matrix" | "predator_matrix";
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
    unitRankCap?: number;
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
  unitProgress?: CommanderUnitProgress[];
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
    commander_item_level_locked:
      "Reach the required Commander level before purchasing this item.",
    commander_rank_cap:
      "Reach the next required Commander level to train further.",
    commander_unit_rank_cap:
      "This unit has reached the training limit for your current Commander level.",
    commander_unit_training_locked:
      "Unit Training unlocks at Commander Level 11.",
    commander_unit_evolution_locked:
      "Unit Evolution unlocks at Commander Level 21 after the unit reaches Rank 10.",
    commander_unit_evolution_rank:
      "This unit must reach Rank 10 before it can evolve.",
    commander_unit_evolution_cap:
      "Reach the next Evolution milestone before evolving this unit again.",
    commander_school_mastery_locked:
      "School Mastery unlocks at Commander Level 31 after a unit reaches Evolution Tier III.",
    commander_school_mastery_cap:
      "Reach the next School Mastery milestone before advancing this school again.",
    commander_school_mastery_unavailable:
      "This unit does not provide a School Mastery path.",
    commander_formation_locked:
      "Reach the required Commander level to unlock this formation.",
    commander_formation_rank_cap:
      "This formation has reached the doctrine limit for your current Commander level.",
    commander_formation_maxed:
      "This formation has reached Legendary Doctrine Rank 7.",
    commander_formation_not_unlocked:
      "Advance this formation to Doctrine Rank 1 before activating it.",
    commander_formation_already_active:
      "This formation is already active.",
    commander_invalid_formation:
      "That formation is not available in this Commander campaign.",
    commander_unit_not_owned:
      "Recruit this unit before developing it.",
    commander_invalid_unit:
      "This unit cannot be developed.",
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
  const formationAction = operation === "formation_train"
    ? "train"
    : operation === "formation_set"
      ? "set"
      : null;

  let request = formationAction
    ? supabase.rpc("rpc_commander_formation_command", {
        p_request_id: requestId,
        p_action: formationAction,
        p_formation: target,
        p_expected_version: version,
      })
    : supabase.rpc("rpc_commander_command", {
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
