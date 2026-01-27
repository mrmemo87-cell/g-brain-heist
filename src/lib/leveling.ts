/**
 * Leveling system utilities
 * XP Formula: Level = floor(xp / 100) + 1
 * Each level requires 100 XP
 */

export interface XpProgress {
  /** Level calculated from XP */
  calculatedLevel: number;
  /** Effective level (uses profile level if available, otherwise calculated) */
  effectiveLevel: number;
  /** XP already earned in current level */
  xpIntoLevel: number;
  /** XP needed to reach next level from current level start */
  xpForNextLevel: number;
  /** Progress percentage (0-1) through current level */
  progress: number;
  /** Total XP at start of current level */
  levelXpStart: number;
  /** Total XP needed to reach next level */
  levelXpNext: number;
}

const XP_PER_LEVEL = 100;

/**
 * Calculate level from total XP
 * Formula: floor(xp / 100) + 1
 */
export function calculateLevelFromXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/**
 * Calculate XP required to reach a specific level
 * Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 200 XP, etc.
 */
export function xpRequiredForLevel(level: number): number {
  return (level - 1) * XP_PER_LEVEL;
}

/**
 * Get XP progress information for a player
 * @param totalXp - Player's total XP
 * @param profileLevel - Optional: The level stored in the profile (for mismatch detection)
 */
export function getXpProgress(totalXp: number, profileLevel?: number): XpProgress {
  const xp = totalXp || 0;
  const calculatedLevel = calculateLevelFromXp(xp);
  const effectiveLevel = profileLevel ?? calculatedLevel;
  
  // XP thresholds for current level
  const levelXpStart = xpRequiredForLevel(effectiveLevel);
  const levelXpNext = xpRequiredForLevel(effectiveLevel + 1);
  
  // Progress within current level
  const xpIntoLevel = Math.max(0, xp - levelXpStart);
  const xpForNextLevel = XP_PER_LEVEL;
  const progress = Math.min(1, xpIntoLevel / xpForNextLevel);
  
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
export function shouldLevelUp(currentLevel: number, totalXp: number): boolean {
  const calculatedLevel = calculateLevelFromXp(totalXp);
  return calculatedLevel > currentLevel;
}

/**
 * Get XP needed to reach the next level
 */
export function xpToNextLevel(totalXp: number): number {
  const currentLevel = calculateLevelFromXp(totalXp);
  const nextLevelXp = xpRequiredForLevel(currentLevel + 1);
  return Math.max(0, nextLevelXp - totalXp);
}
