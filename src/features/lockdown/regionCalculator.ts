import { GameState, RegionStats, ClanStats, PlayerState } from "./lockdownTypes";

// Region mapping based on entry routes or questions
const REGIONS = [
  "region_1", "region_2", "region_3", "region_4", 
  "region_5", "region_6", "region_7", "region_8"
];

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
    // Assign region based on entry route or round-robin
    const regionIndex = Math.abs(player.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % REGIONS.length;
    const regionId = REGIONS[regionIndex];

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
    let totalAnswers = 0;

    // Calculate total answers in region
    Object.values(clans).forEach(clanData => {
      totalAnswers += clanData.total;
    });

    // Calculate percentages for each clan
    Object.entries(clans).forEach(([clanId, clanData]) => {
      if (clanData.total === 0) return;

      const percentage = totalAnswers > 0 ? (clanData.total / totalAnswers) * 100 : 0;
      const accuracy = (clanData.correct / clanData.total) * 100;

      // Get clan name from first player
      const clanName = clanData.players[0]?.clanName || "Unknown";

      clanStatsArray.push({
        clanId,
        clanName,
        correctAnswers: clanData.correct,
        totalAnswers: clanData.total,
        percentage,
      });
    });

    // Sort by percentage (descending)
    clanStatsArray.sort((a, b) => b.percentage - a.percentage);

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
