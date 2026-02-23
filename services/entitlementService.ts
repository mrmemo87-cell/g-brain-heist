import { supabase } from './supabaseClient';

// ============================================================================
// Entitlement Service — centralized feature gating
// ============================================================================
// Single reusable layer for checking what the current user/school can access.
// Queries billing_entitlements table seeded in PADDLE_BILLING_MIGRATION.sql.
//
// Usage:
//   const ent = await getEntitlements();
//   if (ent.canUse('pvp_battles')) { /* allow */ }
//   const limit = ent.getLimit('cambridge_tests'); // number | null (null=unlimited)
// ============================================================================

export interface Entitlement {
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
}

export interface EntitlementSet {
  plan: string;
  entitlements: Record<string, Entitlement>;
  /** Check if a feature is enabled for the current plan */
  canUse: (featureKey: string) => boolean;
  /** Get the limit for a feature (null = unlimited, 0 = disabled) */
  getLimit: (featureKey: string) => number | null;
}

// ── Cache ──
let cachedEntitlements: EntitlementSet | null = null;
let entitlementsCacheTs = 0;
const ENTITLEMENTS_CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Fetch entitlements for the current user's effective plan.
 * Cached for 5 minutes. Pass `force = true` to bypass cache.
 */
export async function getEntitlements(force = false): Promise<EntitlementSet> {
  if (!force && cachedEntitlements && Date.now() - entitlementsCacheTs < ENTITLEMENTS_CACHE_TTL) {
    return cachedEntitlements;
  }

  // Get effective tier — now returns the actual plan name (free|core|standard|pro|…)
  let effectivePlan = 'free';
  try {
    const { data: tierData } = await supabase.rpc('get_effective_tier');
    effectivePlan = (tierData as string) || 'free';
  } catch {
    effectivePlan = 'free';
  }

  // Fetch entitlements for this plan
  const { data: rows, error } = await supabase
    .from('billing_entitlements')
    .select('feature_key, enabled, limit_value')
    .eq('plan', effectivePlan);

  const entitlements: Record<string, Entitlement> = {};

  if (!error && rows) {
    for (const row of rows) {
      entitlements[row.feature_key] = {
        feature_key: row.feature_key,
        enabled: row.enabled,
        limit_value: row.limit_value,
      };
    }
  }

  const result: EntitlementSet = {
    plan: effectivePlan,
    entitlements,
    canUse: (featureKey: string) => {
      const ent = entitlements[featureKey];
      if (!ent) return false; // unknown feature = deny
      return ent.enabled;
    },
    getLimit: (featureKey: string) => {
      const ent = entitlements[featureKey];
      if (!ent || !ent.enabled) return 0;
      return ent.limit_value; // null = unlimited
    },
  };

  cachedEntitlements = result;
  entitlementsCacheTs = Date.now();
  return result;
}

/**
 * Quick check: can the current user use a specific feature?
 * Shortcut that doesn't require holding the EntitlementSet reference.
 */
export async function canUseFeature(featureKey: string): Promise<boolean> {
  const ent = await getEntitlements();
  return ent.canUse(featureKey);
}

/**
 * Get the limit value for a feature.
 * Returns null if unlimited, 0 if disabled.
 */
export async function getFeatureLimit(featureKey: string): Promise<number | null> {
  const ent = await getEntitlements();
  return ent.getLimit(featureKey);
}

/**
 * Invalidate entitlement cache (call after plan changes).
 */
export function invalidateEntitlementCache(): void {
  cachedEntitlements = null;
  entitlementsCacheTs = 0;
}

// ── Feature key constants (matches billing_entitlements seeded data) ──

export const FEATURE_KEYS = {
  LOCKDOWN_MODE: 'lockdown_mode',
  LOCKDOWN_DURATION: 'lockdown_duration',
  LOCKDOWN_STUDENTS: 'lockdown_students',
  LOCKDOWN_MAPS: 'lockdown_maps',
  PVP_BATTLES: 'pvp_battles',
  SHOP: 'shop',
  CLANS: 'clans',
  RAIDS: 'raids',
  TOURNAMENTS: 'tournaments',
  CAMBRIDGE_TESTS: 'cambridge_tests',
  IELTS_TESTS: 'ielts_tests',
  ASSIGNMENTS: 'assignments',
  QUESTION_BANK: 'question_bank',
  REPORTS: 'reports',
  ADMISSION_TESTS: 'admission_tests',
  CUSTOM_QUESTIONS: 'custom_questions',
} as const;

export type FeatureKey = typeof FEATURE_KEYS[keyof typeof FEATURE_KEYS];
