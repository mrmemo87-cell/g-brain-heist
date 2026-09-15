import type {
  CommanderCatalogItem,
  CommanderHeadquarters,
  CommanderMasterySchool,
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

export const commanderUnitEvolutionUnlockLevel = (rules: Record<string, number>) =>
  rules["unitEvolutionUnlockLevel"] ?? 21;

export const commanderUnitEvolutionMaxTier = (rules: Record<string, number>) =>
  rules["unitEvolutionMaxTier"] ?? 3;

export const commanderSchoolMasteryUnlockLevel = (rules: Record<string, number>) =>
  rules["schoolMasteryUnlockLevel"] ?? 31;

export const commanderSchoolMasteryMaxRank = (rules: Record<string, number>) =>
  rules["schoolMasteryMaxRank"] ?? 3;

export const commanderSchoolMasteryRankCap = (
  level: number,
  rules: Record<string, number>,
) => {
  const rank1 = commanderSchoolMasteryUnlockLevel(rules);
  const rank2 = rules["schoolMasteryRank2Level"] ?? 35;
  const rank3 = rules["schoolMasteryRank3Level"] ?? 40;
  if (level < rank1) return 0;
  if (level < rank2) return 1;
  if (level < rank3) return 2;
  return commanderSchoolMasteryMaxRank(rules);
};

export const commanderSchoolMasteryNextLevel = (
  currentRank: number,
  rules: Record<string, number>,
) => {
  if (currentRank <= 0) return commanderSchoolMasteryUnlockLevel(rules);
  if (currentRank === 1) return rules["schoolMasteryRank2Level"] ?? 35;
  if (currentRank === 2) return rules["schoolMasteryRank3Level"] ?? 40;
  return null;
};

export const commanderSchoolMasteryCost = (
  currentRank: number,
  rules: Record<string, number>,
) => Math.round(
  (rules["schoolMasteryBase"] ?? 450)
  * (rules["schoolMasteryGrowth"] ?? 1.55) ** Math.max(0, currentRank),
);

export const commanderSchoolMasteryRank = (
  hq: CommanderHeadquarters,
  school: CommanderMasterySchool,
) => Math.max(0, Math.min(
  commanderSchoolMasteryMaxRank(hq.campaign.rules),
  hq.loadout?.schoolMastery?.[school] ?? 0,
));

export const commanderSchoolMasteryDoctrine = (school: CommanderMasterySchool) => {
  const doctrines = {
    void: {
      name: "Null Vector",
      power: "Death Bolt",
      summary: "Condense the Void strike into a cleaner execution vector.",
      effect: "+3 Death Bolt damage per Mastery rank",
    },
    storm: {
      name: "Overcharge Lattice",
      power: "Chain Surge",
      summary: "Stabilize the first discharge and strengthen the returning arc.",
      effect: "+2 primary and +1 arc damage per Mastery rank",
    },
    rot: {
      name: "Blight Protocol",
      power: "Rot Miasma",
      summary: "Increase the pressure carried by every Miasma pulse on the field.",
      effect: "+1 damage to every Miasma target per Mastery rank",
    },
    grave: {
      name: "Revenant Covenant",
      power: "Raise Dead",
      summary: "Return fallen units with more strength and reinforce emergency mending.",
      effect: "+3% revive health and +2 mend HP per Mastery rank",
    },
  } satisfies Record<CommanderMasterySchool, {
    name: string;
    power: string;
    summary: string;
    effect: string;
  }>;
  return doctrines[school];
};

export const commanderUnitEvolutionTierCap = (
  level: number,
  rules: Record<string, number>,
) => {
  const tier1 = commanderUnitEvolutionUnlockLevel(rules);
  const tier2 = rules["unitEvolutionTier2Level"] ?? 25;
  const tier3 = rules["unitEvolutionTier3Level"] ?? 30;
  if (level < tier1) return 0;
  if (level < tier2) return 1;
  if (level < tier3) return 2;
  return commanderUnitEvolutionMaxTier(rules);
};

export const commanderUnitEvolutionNextLevel = (
  currentTier: number,
  rules: Record<string, number>,
) => {
  if (currentTier <= 0) return commanderUnitEvolutionUnlockLevel(rules);
  if (currentTier === 1) return rules["unitEvolutionTier2Level"] ?? 25;
  if (currentTier === 2) return rules["unitEvolutionTier3Level"] ?? 30;
  return null;
};

export const commanderUnitEvolutionCost = (
  currentTier: number,
  rules: Record<string, number>,
) => Math.round(
  (rules["unitEvolutionBase"] ?? 250)
  * (rules["unitEvolutionGrowth"] ?? 1.6) ** Math.max(0, currentTier),
);

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

export const commanderUnitEvolutionBonus = (
  item: CommanderCatalogItem,
  tier: number,
  rules: Record<string, number>,
): CommanderUnitRankBonus => {
  const steps = Math.max(0, Math.min(commanderUnitEvolutionMaxTier(rules), tier));
  if (item.kind !== "unit" || steps === 0) return { hp: 0, shield: 0, attack: 0 };
  if (item.slot === "guard") {
    return {
      hp: steps * (rules["unitEvolutionGuardHpPerTier"] ?? 8),
      shield: steps * (rules["unitEvolutionGuardShieldPerTier"] ?? 2),
      attack: steps * (rules["unitEvolutionGuardAttackPerTier"] ?? 1),
    };
  }
  if (item.slot === "archer") {
    return {
      hp: steps * (rules["unitEvolutionArcherHpPerTier"] ?? 4),
      shield: 0,
      attack: steps * (rules["unitEvolutionArcherAttackPerTier"] ?? 2),
    };
  }
  return { hp: 0, shield: 0, attack: 0 };
};

export const commanderUnitEvolutionDoctrine = (item: CommanderCatalogItem) =>
  item.slot === "guard"
    ? {
        id: "bulwark_matrix" as const,
        name: "Bulwark Matrix",
        detail: "Permanent reinforced-frame evolution: more HP, shield reserve, and measured attack pressure.",
      }
    : {
        id: "predator_matrix" as const,
        name: "Predator Matrix",
        detail: "Permanent precision-frame evolution: more HP and stronger ranged attack pressure.",
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

export const commanderUnitNextEvolutionGain = (
  item: CommanderCatalogItem,
  currentTier: number,
  rules: Record<string, number>,
): CommanderUnitRankBonus => {
  const current = commanderUnitEvolutionBonus(item, currentTier, rules);
  const next = commanderUnitEvolutionBonus(item, currentTier + 1, rules);
  return {
    hp: next.hp - current.hp,
    shield: next.shield - current.shield,
    attack: next.attack - current.attack,
  };
};
