import type {
  CommanderCatalogItem,
  CommanderEvolutionPassive,
  CommanderHeadquarters,
  CommanderStat,
  CommanderUnitProgress,
} from "../../../services/commanderHeadquartersService";

export const commanderLevelXp = (level: number) =>
  (level - 1) * (10 * level + 80);
export const commanderTrainingCost = (
  rank: number,
  rules: Record<string, number>,
) => Math.round(rules["trainingBase"] * rules["trainingGrowth"] ** (rank - 1));
export const commanderItemEquipped = (
  hq: CommanderHeadquarters,
  item: CommanderCatalogItem,
) => hq.profile?.[item.slot] === item.id;
export const commanderStatRank = (
  hq: CommanderHeadquarters,
  stat: CommanderStat,
) => hq.profile?.[`${stat}_rank`] ?? 1;
export const commanderMissingCoins = (price: number, balance: number) =>
  Math.max(0, price - balance);

export const commanderUnitTrainingUnlockLevel = (rules: Record<string, number>) =>
  rules["unitTrainingUnlockLevel"] ?? 11;

export const commanderUnitTrainingMaxRank = (rules: Record<string, number>) =>
  rules["unitTrainingMaxRank"] ?? 10;

export const commanderUnitRankCap = (
  level: number,
  rules: Record<string, number>,
) => {
  const unlock = commanderUnitTrainingUnlockLevel(rules);
  if (level < unlock) return 1;
  return Math.min(commanderUnitTrainingMaxRank(rules), 2 + level - unlock);
};

export const commanderUnitTrainingCost = (
  currentRank: number,
  rules: Record<string, number>,
) => Math.round(
  (rules["unitTrainingBase"] ?? 50)
  * (rules["unitTrainingGrowth"] ?? 1.2) ** Math.max(0, currentRank - 1),
);

export const commanderUnitProgressFor = (
  hq: CommanderHeadquarters,
  itemId: string,
): CommanderUnitProgress => {
  const existing = hq.unitProgress?.find((progress) => progress.itemId === itemId);
  const level = hq.profile?.level ?? 1;
  const rankCap = hq.profile?.unitRankCap
    ?? commanderUnitRankCap(level, hq.campaign.rules);
  const maxRank = commanderUnitTrainingMaxRank(hq.campaign.rules);
  if (existing) return existing;
  return {
    itemId,
    unitRank: 1,
    evolutionTier: 0,
    trainingPoints: 0,
    version: 1,
    rankCap,
    maxRank,
    nextCost: commanderUnitTrainingCost(1, hq.campaign.rules),
    veteran: false,
  };
};

export type CommanderUnitRankBonus = {
  hp: number;
  shield: number;
  attack: number;
};

export const commanderUnitRankBonus = (
  item: CommanderCatalogItem,
  rank: number,
  rules: Record<string, number>,
): CommanderUnitRankBonus => {
  if (item.kind !== "unit") return { hp: 0, shield: 0, attack: 0 };
  const steps = Math.max(0, rank - 1);
  if (item.slot === "guard") {
    const shieldEvery = Math.max(1, rules["unitGuardShieldEvery"] ?? 3);
    const attackEvery = Math.max(1, rules["unitGuardAttackEvery"] ?? 3);
    return {
      hp: steps * (rules["unitGuardHpPerRank"] ?? 2),
      shield: Math.floor(steps / shieldEvery),
      attack: Math.floor(steps / attackEvery),
    };
  }
  if (item.slot === "archer") {
    const attackEvery = Math.max(1, rules["unitArcherAttackEvery"] ?? 2);
    return {
      hp: steps * (rules["unitArcherHpPerRank"] ?? 1),
      shield: 0,
      attack: Math.floor(steps / attackEvery),
    };
  }
  return { hp: 0, shield: 0, attack: 0 };
};

export const commanderUnitNextRankGain = (
  item: CommanderCatalogItem,
  currentRank: number,
  rules: Record<string, number>,
): CommanderUnitRankBonus => {
  const current = commanderUnitRankBonus(item, currentRank, rules);
  const next = commanderUnitRankBonus(item, currentRank + 1, rules);
  return {
    hp: next.hp - current.hp,
    shield: next.shield - current.shield,
    attack: next.attack - current.attack,
  };
};

export const commanderUnitEvolutionUnlockLevel = (rules: Record<string, number>) =>
  rules["unitEvolutionUnlockLevel"] ?? 21;

export const commanderUnitEvolutionMaxTier = (rules: Record<string, number>) =>
  rules["unitEvolutionMaxTier"] ?? 3;

export const commanderUnitEvolutionRequiredLevel = (
  targetTier: number,
  rules: Record<string, number>,
) => {
  if (targetTier <= 1) return commanderUnitEvolutionUnlockLevel(rules);
  if (targetTier === 2) return rules["unitEvolutionTier2Level"] ?? 25;
  return rules["unitEvolutionTier3Level"] ?? 30;
};

export const commanderUnitEvolutionTierCap = (
  level: number,
  rules: Record<string, number>,
) => {
  if (level < commanderUnitEvolutionUnlockLevel(rules)) return 0;
  if (level < (rules["unitEvolutionTier2Level"] ?? 25)) return 1;
  if (level < (rules["unitEvolutionTier3Level"] ?? 30)) return 2;
  return commanderUnitEvolutionMaxTier(rules);
};

export const commanderUnitEvolutionStage = (tier: number) => {
  if (tier >= 3) return "Mythic";
  if (tier === 2) return "Exalted";
  if (tier === 1) return "Ascended";
  return "Base";
};

export const commanderUnitEvolutionCost = (
  item: CommanderCatalogItem,
  targetTier: number,
  rules: Record<string, number>,
) => {
  const tier = Math.max(1, Math.min(3, Math.floor(targetTier)));
  const base = tier === 1
    ? (rules["unitEvolutionTier1Cost"] ?? 200)
    : tier === 2
      ? (rules["unitEvolutionTier2Cost"] ?? 350)
      : (rules["unitEvolutionTier3Cost"] ?? 550);
  const rarityMultiplier = item.rarity === "legendary"
    ? (rules["unitEvolutionLegendaryMultiplier"] ?? 1.5)
    : item.rarity === "epic"
      ? (rules["unitEvolutionEpicMultiplier"] ?? 1.3)
      : item.rarity === "rare"
        ? (rules["unitEvolutionRareMultiplier"] ?? 1.15)
        : 1;
  return Math.round(base * rarityMultiplier);
};

export const commanderUnitEvolutionBonus = (
  item: CommanderCatalogItem,
  tier: number,
): CommanderUnitRankBonus => {
  const safeTier = Math.max(0, Math.min(3, Math.floor(tier)));
  if (item.kind !== "unit" || (item.slot !== "guard" && item.slot !== "archer"))
    return { hp: 0, shield: 0, attack: 0 };

  let hp = item.slot === "guard" ? 4 * safeTier : 2 * safeTier;
  let shield = item.slot === "guard" ? safeTier : 0;
  let attack = item.slot === "guard" ? Math.floor(safeTier / 2) : safeTier;

  if (item.school === "storm") {
    if (item.slot === "guard") shield += Math.ceil(safeTier / 2);
    else attack += Math.floor(safeTier / 2);
  } else if (item.school === "grave") {
    hp += item.slot === "guard" ? 2 * safeTier : safeTier;
  } else if (item.school === "void") {
    attack += Math.ceil(safeTier / 2);
  } else if (item.school === "rot") {
    hp += safeTier;
  }

  return { hp, shield, attack };
};

export const commanderUnitNextEvolutionGain = (
  item: CommanderCatalogItem,
  currentTier: number,
): CommanderUnitRankBonus => {
  const current = commanderUnitEvolutionBonus(item, currentTier);
  const next = commanderUnitEvolutionBonus(item, currentTier + 1);
  return {
    hp: next.hp - current.hp,
    shield: next.shield - current.shield,
    attack: next.attack - current.attack,
  };
};

export const commanderUnitEvolutionPassive = (
  item: CommanderCatalogItem,
  tier: number,
): CommanderEvolutionPassive | null => {
  const safeTier = Math.max(0, Math.min(3, Math.floor(tier)));
  if (safeTier === 0 || item.kind !== "unit") return null;

  const school = item.school ?? "neutral";
  const key = `${item.slot}:${school}`;
  const passives: Record<string, Omit<CommanderEvolutionPassive, "tier">> = {
    "guard:storm": {
      id: "overcharge_plating",
      label: "Overcharge Plating",
      description: "Storm evolution reinforces shield reserve with every evolution tier.",
    },
    "archer:storm": {
      id: "arc_sight",
      label: "Arc Sight",
      description: "Storm evolution sharpens ranged pressure at higher evolution tiers.",
    },
    "guard:void": {
      id: "phase_guard",
      label: "Phase Guard",
      description: "Void evolution adds a sharper counter-strike profile to the frontline.",
    },
    "archer:void": {
      id: "execution_mark",
      label: "Execution Mark",
      description: "Void evolution intensifies precision attack gains.",
    },
    "guard:grave": {
      id: "gravewall",
      label: "Gravewall",
      description: "Grave evolution adds extra maximum health to the frontline.",
    },
    "archer:grave": {
      id: "gravesight",
      label: "Gravesight",
      description: "Grave evolution adds survivability without giving up ranged pressure.",
    },
    "guard:rot": {
      id: "blight_ward",
      label: "Blight Ward",
      description: "Rot evolution hardens the frontline with additional health.",
    },
    "archer:rot": {
      id: "virulent_focus",
      label: "Virulent Focus",
      description: "Rot evolution adds resilient pressure to the ranged line.",
    },
  };
  const passive = passives[key] ?? {
    id: "adaptive_doctrine",
    label: "Adaptive Doctrine",
    description: "Evolution reinforces this unit while preserving its battlefield role.",
  };
  return { ...passive, tier: safeTier };
};