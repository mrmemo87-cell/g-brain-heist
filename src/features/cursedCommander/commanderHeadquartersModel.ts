import type {
  CommanderCatalogItem,
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
