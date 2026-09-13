import type {
  CommanderCatalogItem,
  CommanderHeadquarters,
  CommanderStat,
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
