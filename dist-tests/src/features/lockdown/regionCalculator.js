import { getClanColor } from "../../utils/clanColors.js";
const REGION_IDS = [
    "region_1",
    "region_2",
    "region_3",
    "region_4",
    "region_5",
    "region_6",
    "region_7",
    "region_8",
];
const isValidRegionId = (regionId) => Boolean(regionId && REGION_IDS.includes(regionId));
export const REGION_NAMES = REGION_IDS.reduce((acc, regionId, index) => {
    acc[regionId] = `Region ${index + 1}`;
    return acc;
}, {});
// Region mapping based on entry routes or questions
const REGIONS = [...REGION_IDS];
// getClanColor imported from ../../utils/clanColors.js
/**
 * Calculate region statistics based on player answers and clan membership
 * Maps players to regions based on their current activity
 */
export const calculateRegionStats = (state) => {
    const regionStats = {};
    // Initialize all regions
    REGIONS.forEach(regionId => {
        regionStats[regionId] = {
            regionId,
            clanStats: [],
        };
    });
    // Group players by region and clan
    const regionClanData = {};
    Object.values(state.players).forEach(player => {
        // Allow explicit region assignment for UX interactions; otherwise keep deterministic fallback
        const regionId = isValidRegionId(player.currentRegion)
            ? player.currentRegion
            : REGIONS[Math.abs(player.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % REGIONS.length];
        // Skip if no clan
        if (!player.clanId || !player.clanName)
            return;
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
        const clanStatsArray = [];
        let totalCorrectAnswers = 0;
        // Calculate total correct answers in region for fair control distribution
        Object.values(clans).forEach(clanData => {
            totalCorrectAnswers += clanData.correct;
        });
        // Calculate percentages for each clan
        Object.entries(clans).forEach(([clanId, clanData]) => {
            if (clanData.total === 0 || clanData.correct === 0)
                return;
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
export const assignPlayerToRegion = (playerId, questionIndex) => {
    // Map question index to region (8 regions, cycling through them)
    const regionIndex = questionIndex % REGIONS.length;
    return REGIONS[regionIndex];
};
/**
 * Get region color intensity based on control percentage
 */
export const getRegionIntensity = (percentage) => {
    return Math.max(0.3, Math.min(1, percentage / 100));
};
