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
  schoolId: string | null;
  modules: Record<SchoolModuleKey, boolean>;
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

  const { data, error } = await supabase.rpc('get_my_effective_entitlements');
  const payload = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const effectivePlan = !error && payload['success'] === true && typeof payload['plan'] === 'string'
    ? payload['plan']
    : 'free';
  const rawEntitlements = !error && payload['entitlements'] && typeof payload['entitlements'] === 'object'
    ? payload['entitlements'] as Record<string, unknown>
    : {};
  const rawModules = !error && payload['modules'] && typeof payload['modules'] === 'object'
    ? payload['modules'] as Record<string, unknown>
    : {};
  const entitlements: Record<string, Entitlement> = {};
  for (const [featureKey, value] of Object.entries(rawEntitlements)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    entitlements[featureKey] = {
      feature_key: featureKey,
      enabled: row['enabled'] === true,
      limit_value: typeof row['limit_value'] === 'number' ? row['limit_value'] : null,
    };
  }

  const modules: Record<SchoolModuleKey, boolean> = {
    core: rawModules['core'] === true,
    cambridge: rawModules['cambridge'] === true,
    ielts: rawModules['ielts'] === true,
    writing: rawModules['writing'] === true,
    admissions: rawModules['admissions'] === true,
  };

  const result: EntitlementSet = {
    plan: effectivePlan,
    schoolId: typeof payload['school_id'] === 'string' ? payload['school_id'] : null,
    modules,
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
  WRITING_HUB: 'writing_hub',
  CUSTOM_QUESTIONS: 'custom_questions',
} as const;

export type FeatureKey = typeof FEATURE_KEYS[keyof typeof FEATURE_KEYS];

export const MODULE_KEYS = {
  CORE: 'core',
  CAMBRIDGE: 'cambridge',
  IELTS: 'ielts',
  WRITING: 'writing',
  ADMISSIONS: 'admissions',
} as const;

export type SchoolModuleKey = typeof MODULE_KEYS[keyof typeof MODULE_KEYS];
