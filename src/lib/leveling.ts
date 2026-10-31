/**
 * Leveling system utilities
 * One curve everywhere: XP for level N = 150 · (N − 1)^1.7, the same as
 * public.xp_threshold_for_level / public.level_from_xp in the database.
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

/**
 * Total XP needed to reach a level. Mirrors public.xp_threshold_for_level in
 * the database (the single source of truth): 150 · (level − 1)^1.7.
 * Level 1 = 0, 2 = 150, 3 = 488, 4 = 975, 5 = 1,580 …
 */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.ceil(150 * Math.pow(level - 1, 1.7));
}

/**
 * Level for a total XP. Mirrors public.level_from_xp in the database.
 */
export function calculateLevelFromXp(xp: number): number {
  const total = Math.max(0, xp || 0);
  let level = Math.max(1, Math.floor(Math.pow(total / 150, 1 / 1.7) + 1));
  while (level > 1 && xpRequiredForLevel(level) > total) level -= 1;
  while (xpRequiredForLevel(level + 1) <= total) level += 1;
  return level;
}

/**
 * Get XP progress information for a player
 * @param totalXp - Player's total XP
 * @param profileLevel - Optional: The level stored in the profile (for mismatch detection)
 */
export function getXpProgress(totalXp: number, profileLevel?: number): XpProgress {
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
