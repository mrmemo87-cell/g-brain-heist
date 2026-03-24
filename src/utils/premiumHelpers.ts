/**
 * premiumHelpers.ts
 *
 * Centralized helpers for:
 *   - Individuals mode detection (no school_id)
 *   - Brains Master active status
 *   - Effective cap computation with premium boost
 *   - Feature access rules for Individuals
 */

import type { Profile, Caps } from '../../types';

// ─── Configuration Constants ────────────────────────────────
export const BM_GEM_PRICE = 150;
export const BM_INSTANT_GEMS = 25;
export const BM_COIN_CAP_MULTIPLIER = 5;
export const BM_DURATION_DAYS = 7;
export const BM_CAP_BOOST_FACTOR = 1.5;

// ─── Individuals Mode ───────────────────────────────────────

/** Returns true if the user has no school membership (Individual). */
export function isIndividualUser(profile: Pick<Profile, 'school_id'> | null | undefined): boolean {
  if (!profile) return false;
  return !profile.school_id;
}

/**
 * Feature access map for Individual users.
 * true = allowed, false = blocked.
 */
const INDIVIDUAL_FEATURE_ACCESS: Record<string, boolean> = {
  leaderboard: true,
  pvp: true,
  clan: true,
  shop: true,
  inventory: true,
  achievements: true,
  quest: true,
  tournament: true,
  raids: true,
  lockdown: true,
  rivalry: true,
  cambridge: false,
  ielts: false,
};

/** Check whether a feature is accessible for Individual users. */
export function isFeatureAllowedForIndividual(featureKey: string): boolean {
  return INDIVIDUAL_FEATURE_ACCESS[featureKey] ?? true;
}

/**
 * Views that require school membership and are blocked for Individuals.
 * Used in App.tsx handleViewChange gating.
 */
export const SCHOOL_ONLY_VIEWS = ['cambridge', 'ielts', 'school_admin', 'admissions'] as const;

/**
 * Views that were previously blocked for no-school users but should
 * now be open for Individuals mode.
 */
export const INDIVIDUAL_OPEN_VIEWS = ['leaderboard', 'clan', 'pvp', 'rivalry'] as const;

// ─── Brains Master ──────────────────────────────────────────

/** Returns true if the user's Brains Master subscription is currently active. */
export function isBrainsMasterActive(
  profile: Pick<Profile, 'brains_master_until'> | null | undefined
): boolean {
  if (!profile?.brains_master_until) return false;
  return new Date(profile.brains_master_until) > new Date();
}

/** Returns remaining time in ms until Brains Master expires. 0 if not active. */
export function brainsMasterRemainingMs(
  profile: Pick<Profile, 'brains_master_until'> | null | undefined
): number {
  if (!profile?.brains_master_until) return 0;
  const remaining = new Date(profile.brains_master_until).getTime() - Date.now();
  return Math.max(remaining, 0);
}

/** Human-readable duration string for remaining Brains Master time. */
export function formatBrainsMasterRemaining(
  profile: Pick<Profile, 'brains_master_until'> | null | undefined
): string {
  const ms = brainsMasterRemainingMs(profile);
  if (ms <= 0) return 'Inactive';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);

  if (days > 0) return `${days}d ${hours}h remaining`;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

/**
 * Whether the Brains Master badge should be shown publicly for this user.
 * Active + show_badge ON → true. Everything else → false.
 */
export function shouldShowBrainsMasterBadge(
  profile: Pick<Profile, 'brains_master_until' | 'brains_master_show_badge'> | null | undefined
): boolean {
  if (!profile) return false;
  return isBrainsMasterActive(profile) && profile.brains_master_show_badge !== false;
}

// ─── Effective Caps ─────────────────────────────────────────

/** Base daily coin cap for a given level. */
export function baseDailyCoinCap(level: number): number {
  return 2000 + Math.max(level - 1, 0) * 200;
}

/** Base weekly coin cap for a given level. */
export function baseWeeklyCoinCap(level: number): number {
  return 10000 + Math.max(level - 1, 0) * 500;
}

/** Base daily XP cap. */
export const BASE_DAILY_XP_CAP = 1000;
/** Base weekly XP cap. */
export const BASE_WEEKLY_XP_CAP = 6500;

/**
 * Compute effective caps with Brains Master boost applied.
 * If Brains Master is active, all caps are multiplied by BM_CAP_BOOST_FACTOR.
 */
export function getEffectiveCaps(
  profile: Pick<Profile, 'level' | 'brains_master_until'>,
  baseCaps?: Partial<Caps>
): Caps {
  const bmActive = isBrainsMasterActive(profile);
  const boost = bmActive ? BM_CAP_BOOST_FACTOR : 1.0;
  const level = profile.level ?? 1;

  const daily_xp_cap = Math.floor(BASE_DAILY_XP_CAP * boost);
  const daily_coins_cap = Math.floor(baseDailyCoinCap(level) * boost);
  const weekly_xp_cap = Math.floor(BASE_WEEKLY_XP_CAP * boost);
  const weekly_coins_cap = Math.floor(baseWeeklyCoinCap(level) * boost);

  return {
    daily_xp_cap,
    daily_coins_cap,
    weekly_xp_cap,
    weekly_coins_cap,
    xp_daily_remaining: baseCaps?.xp_daily_remaining ?? daily_xp_cap,
    coins_daily_remaining: baseCaps?.coins_daily_remaining ?? daily_coins_cap,
    xp_weekly_remaining: baseCaps?.xp_weekly_remaining ?? weekly_xp_cap,
    coins_weekly_remaining: baseCaps?.coins_weekly_remaining ?? weekly_coins_cap,
  };
}
