export const XP_PER_LEVEL = 100;

/**
 * Calculate the level for a given amount of XP.
 * Matches the backend calculation in `update_user_stats`:
 *   GREATEST(1, FLOOR(xp / 100.0) + 1)
 */
export const levelFromXp = (totalXp: number): number => {
  if (!Number.isFinite(totalXp)) {
    return 1;
  }

  return Math.max(1, Math.floor(totalXp / XP_PER_LEVEL) + 1);
};

export interface XpProgress {
  /** Level that should be shown in the UI (never below the XP-derived level). */
  effectiveLevel: number;
  /** Level derived strictly from total XP. */
  calculatedLevel: number;
  /** XP required to advance to the next level (constant today). */
  xpForNextLevel: number;
  /** Total XP needed to reach the next level. */
  nextLevelTotalXp: number;
  /** XP accumulated within the current level. */
  xpIntoLevel: number;
  /** Percent completion of the current level, 0–1. */
  progress: number;
}

/**
 * Normalize XP bar values using the backend leveling curve.
 *
 * @param totalXp Total XP accumulated by the player
 * @param providedLevel Level returned by the backend (may be stale)
 */
export const getXpProgress = (totalXp: number, providedLevel?: number): XpProgress => {
  const calculatedLevel = levelFromXp(totalXp);
  const effectiveLevel = Math.max(calculatedLevel, providedLevel ?? 0);
  const levelStartXp = Math.max(0, (effectiveLevel - 1) * XP_PER_LEVEL);
  const xpIntoLevel = Math.max(0, totalXp - levelStartXp);

  const clampedProgress = Math.min(1, Math.max(0, xpIntoLevel / XP_PER_LEVEL));
  const nextLevelTotalXp = effectiveLevel * XP_PER_LEVEL;

  return {
    effectiveLevel,
    calculatedLevel,
    xpForNextLevel: XP_PER_LEVEL,
    nextLevelTotalXp,
    xpIntoLevel,
    progress: clampedProgress,
  };
};

