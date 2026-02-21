/**
 * Leveling system utilities
 * Hard Curve Formula: Each level requires increasingly more XP
 * Level 1: 0 XP, Level 2: 100 XP, Level 3: 250 XP, Level 4: 450 XP, etc.
 * Formula: XP for level N = 50 * N * (N - 1)
 * This creates a quadratic growth curve that slows down leveling at higher levels
 */
/**
 * Calculate XP required to reach a specific level (hard curve)
 * Formula: 50 * level * (level - 1)
 * Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 300 XP, Level 4 = 600 XP, etc.
 */
export function xpRequiredForLevel(level) {
    if (level <= 1)
        return 0;
    return 50 * level * (level - 1);
}
/**
 * Calculate level from total XP (hard curve)
 * Inverse of: xp = 50 * level * (level - 1)
 * Solving: level = (1 + sqrt(1 + xp/12.5)) / 2
 */
export function calculateLevelFromXp(xp) {
    if (xp <= 0)
        return 1;
    // Solve quadratic: 50L^2 - 50L - xp = 0
    // L = (50 + sqrt(2500 + 200*xp)) / 100 = (1 + sqrt(1 + xp/12.5)) / 2
    const level = Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
    return Math.max(1, level);
}
/**
 * Get XP progress information for a player
 * @param totalXp - Player's total XP
 * @param profileLevel - Optional: The level stored in the profile (for mismatch detection)
 */
export function getXpProgress(totalXp, profileLevel) {
    const xp = totalXp || 0;
    const calculatedLevel = calculateLevelFromXp(xp);
    // Always use the higher of calculated vs stored level so the bar
    // never overflows when the DB trigger hasn't synced yet.
    const effectiveLevel = Math.max(calculatedLevel, profileLevel ?? calculatedLevel);
    // XP thresholds for current level (hard curve)
    const levelXpStart = xpRequiredForLevel(effectiveLevel);
    const levelXpNext = xpRequiredForLevel(effectiveLevel + 1);
    // Progress within current level
    const xpIntoLevel = Math.max(0, xp - levelXpStart);
    const xpForNextLevel = levelXpNext - levelXpStart; // Variable XP per level with hard curve
    const progress = xpForNextLevel > 0 ? Math.min(1, xpIntoLevel / xpForNextLevel) : 0;
    return {
        calculatedLevel,
        effectiveLevel,
        xpIntoLevel,
        xpForNextLevel,
        progress,
        levelXpStart,
        levelXpNext,
    };
}
/**
 * Check if player should level up
 */
export function shouldLevelUp(currentLevel, totalXp) {
    const calculatedLevel = calculateLevelFromXp(totalXp);
    return calculatedLevel > currentLevel;
}
/**
 * Get XP needed to reach the next level
 */
export function xpToNextLevel(totalXp) {
    const currentLevel = calculateLevelFromXp(totalXp);
    const nextLevelXp = xpRequiredForLevel(currentLevel + 1);
    return Math.max(0, nextLevelXp - totalXp);
}
