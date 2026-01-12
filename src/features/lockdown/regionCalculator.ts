import { GameState, RegionStats, ClanStats, PlayerState } from "./lockdownTypes.js";

const REGION_IDS = [
  "region_1",
  "region_2",
  "region_3",
  "region_4",
  "region_5",
  "region_6",
  "region_7",
  "region_8",
] as const;

const isValidRegionId = (regionId?: string): regionId is (typeof REGION_IDS)[number] =>
  Boolean(regionId && REGION_IDS.includes(regionId as (typeof REGION_IDS)[number]));

export const REGION_NAMES: Record<string, string> = REGION_IDS.reduce(
  (acc, regionId, index) => {
    acc[regionId] = `Region ${index + 1}`;
    return acc;
  },
  {} as Record<string, string>
);

// Region mapping based on entry routes or questions
const REGIONS = [...REGION_IDS];

// Color palette for clans (consistent hashing)
const CLAN_COLOR_PALETTE = [
  "#f97316",  // orange
  "#0ea5e9",  // sky blue
  "#10b981",  // emerald
  "#a855f7",  // purple
  "#f43f5e",  // rose
  "#14b8a6",  // teal
  "#6366f1",  // indigo
  "#eab308",  // yellow
];

const getClanColor = (clanId: string): string => {
  let hash = 0;
  for (let i = 0; i < clanId.length; i += 1) {
    hash = (hash << 5) - hash + clanId.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % CLAN_COLOR_PALETTE.length;
  return CLAN_COLOR_PALETTE[index];
};

/**
 * Calculate region statistics based on player answers and clan membership
 * Maps players to regions based on their current activity
 */
export const calculateRegionStats = (state: GameState): Record<string, RegionStats> => {
  const regionStats: Record<string, RegionStats> = {};

  // Initialize all regions
  REGIONS.forEach(regionId => {
    regionStats[regionId] = {
      regionId,
      clanStats: [],
    };
  });

  // Group players by region and clan
  const regionClanData: Record<string, Record<string, { correct: number; total: number; players: PlayerState[] }>> = {};

  Object.values(state.players).forEach(player => {
    // Allow explicit region assignment for UX interactions; otherwise keep deterministic fallback
    const regionId = isValidRegionId(player.currentRegion)
      ? player.currentRegion
      : REGIONS[Math.abs(player.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % REGIONS.length];

    // Skip if no clan
    if (!player.clanId || !player.clanName) return;

    if (!regionClanData[regionId]) {
      regionClanData[regionId] = {};
    }

    if (!regionClanData[regionId][player.clanId]) {
      regionClanData[regionId][player.clanId] = {
        correct: 0,
        total: 0,
        players: [],
      };
    }

    const clanData = regionClanData[regionId][player.clanId];
    clanData.correct += player.accuracy.correct;
    clanData.total += player.accuracy.total;
    clanData.players.push(player);
  });

  // Calculate percentages for each region
  Object.entries(regionClanData).forEach(([regionId, clans]) => {
    const clanStatsArray: ClanStats[] = [];
    let totalCorrectAnswers = 0;

    // Calculate total correct answers in region for fair control distribution
    Object.values(clans).forEach(clanData => {
      totalCorrectAnswers += clanData.correct;
    });

    // Calculate percentages for each clan
    Object.entries(clans).forEach(([clanId, clanData]) => {
      if (clanData.total === 0 || clanData.correct === 0) return;

      // Control is based on contribution of correct answers, not just volume of attempts
      const percentage = totalCorrectAnswers > 0 ? (clanData.correct / totalCorrectAnswers) * 100 : 0;
      const accuracy = (clanData.correct / clanData.total) * 100;

      // Get clan name from first player
      const clanName = clanData.players[0]?.clanName || "Unknown";
      const avatarUrl = clanData.players[0]?.clanAvatarUrl;
      const color = clanData.players.find((player) => player.color)?.color ?? getClanColor(clanId);

      clanStatsArray.push({
        clanId,
        clanName,
        color,
        avatarUrl,
        correctAnswers: clanData.correct,
        totalAnswers: clanData.total,
        percentage,
      });
    });

    // Sort by percentage (descending) then accuracy to break ties consistently
    clanStatsArray.sort((a, b) => {
      if (b.percentage === a.percentage) {
        const aAccuracy = a.totalAnswers === 0 ? 0 : (a.correctAnswers / a.totalAnswers) * 100;
        const bAccuracy = b.totalAnswers === 0 ? 0 : (b.correctAnswers / b.totalAnswers) * 100;
        return bAccuracy - aAccuracy;
      }
      return b.percentage - a.percentage;
    });

    regionStats[regionId] = {
      regionId,
      clanStats: clanStatsArray,
      topClan: clanStatsArray[0],
    };
  });

  return regionStats;
};

/**
 * Update region assignment for a player based on their answer
 * This can be called when a player submits an answer to assign them to a region
 */
export const assignPlayerToRegion = (playerId: string, questionIndex: number): string => {
  // Map question index to region (8 regions, cycling through them)
  const regionIndex = questionIndex % REGIONS.length;
  return REGIONS[regionIndex];
};

/**
 * Get region color intensity based on control percentage
 */
export const getRegionIntensity = (percentage: number): number => {
  return Math.max(0.3, Math.min(1, percentage / 100));
};
