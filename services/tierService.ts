import { supabase } from './supabaseClient';

// ============================================================================
// Tier Service — School subscription plans + free/pro gating
// ============================================================================

// ── Types ──

export type AccountTier = 'free' | 'pro';
export type SchoolPlan = 'none' | 'pilot' | 'core' | 'standard' | 'pro' | 'enterprise';

export interface LockdownLimits {
  tier: AccountTier;
  max_duration_minutes: number | null;  // null = unlimited
  max_students: number | null;
  allowed_maps: string[] | null;        // null = all maps
  custom_questions: boolean;
  save_results: boolean;
  watermark: boolean;
}

export interface SchoolPlanDetails {
  success: boolean;
  plan: SchoolPlan;
  is_active: boolean;
  trial_ends_at: string | null;
  trial_expired: boolean;
  seats: { cambridge: number | null; ielts: number | null; game: number | null };
  current_members: number;
  error?: string;
}

// ── Plan metadata (client-side constants) ──

export interface PlanInfo {
  id: SchoolPlan;
  label: string;
  seats: { cambridge: number; ielts: number; game: number };
  monthly: number;
  yearly: number;
  popular?: boolean;
}

export const PAID_PLANS: PlanInfo[] = [
  {
    id: 'core',
    label: 'Core',
    seats: { cambridge: 120, ielts: 40, game: 120 },
    monthly: 499,
    yearly: 4990,
  },
  {
    id: 'standard',
    label: 'Standard',
    seats: { cambridge: 220, ielts: 80, game: 220 },
    monthly: 649,
    yearly: 6490,
    popular: true,
  },
  {
    id: 'pro',
    label: 'Pro',
    seats: { cambridge: 450, ielts: 150, game: 450 },
    monthly: 1149,
    yearly: 11490,
  },
];

export const PILOT_PLAN = {
  id: 'pilot' as const,
  label: 'Pilot',
  days: 30,
  seats: { cambridge: 60, ielts: 20, game: 60 },
};

// ── Pilot quota types ──

export type PilotFeatureId =
  | 'pvp_battles'
  | 'shop_purchases'
  | 'raid_attempts'
  | 'cambridge_tests'
  | 'ielts_tests'
  | 'tournament_entries'
  | 'questions_created'
  | 'assignments_created'
  | 'lockdown_sessions'
  | 'reports_generated'
  | 'admission_tests';

export interface PilotQuota {
  used: number;
  limit: number;
  remaining: number;
  exhausted: boolean;
}

export interface PilotQuotaStatus {
  success: boolean;
  is_pilot: boolean;
  expired?: boolean;
  trial_ends_at?: string | null;
  quotas?: Record<PilotFeatureId, PilotQuota>;
}

/** Map UI feature names → pilot quota feature_id */
export const FEATURE_TO_QUOTA: Record<string, PilotFeatureId> = {
  'Launch Attack': 'pvp_battles',
  'Visit Shop': 'shop_purchases',
  'Raids': 'raid_attempts',
  'Cambridge Tests': 'cambridge_tests',
  'IELTS Prep': 'ielts_tests',
  'Tournament': 'tournament_entries',
  'Clan': 'pvp_battles',         // clans share pvp quota
  'Inventory': 'shop_purchases',  // inventory shares shop quota
  'Leaderboard': 'pvp_battles',   // leaderboard shares pvp quota
  'Achievements': 'pvp_battles',  // achievements share pvp quota
  // Teacher features
  'Create Question': 'questions_created',
  'Question Bank': 'questions_created',
  'Bulk Upload': 'questions_created',
  'New Assignment': 'assignments_created',
  'Lockdown Mode': 'lockdown_sessions',
  'Performance Reports': 'reports_generated',
  'Cambridge Marking': 'cambridge_tests',
  'Geometry Builder': 'reports_generated',
  'Admission Tests': 'admission_tests',
  'Admissions': 'admission_tests',
};

/** Short display labels for quota badges */
export const QUOTA_LABELS: Record<PilotFeatureId, string> = {
  pvp_battles: 'battles',
  shop_purchases: 'purchases',
  raid_attempts: 'raids',
  cambridge_tests: 'tests',
  ielts_tests: 'tests',
  tournament_entries: 'entries',
  questions_created: 'questions',
  assignments_created: 'assignments',
  lockdown_sessions: 'sessions',
  reports_generated: 'reports',
  admission_tests: 'tests',
};

// ── Fetch effective tier (cached, calls get_effective_tier RPC) ──

let cachedTier: AccountTier | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchEffectiveTier(): Promise<AccountTier> {
  if (cachedTier && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTier;
  }

  try {
    const { data, error } = await supabase.rpc('get_effective_tier');
    if (error) {
      console.warn('[tierService] get_effective_tier error:', error.message);
      return cachedTier || 'free';
    }
    cachedTier = (data as AccountTier) || 'free';
    cacheTimestamp = Date.now();
    return cachedTier;
  } catch (err) {
    console.warn('[tierService] fetchEffectiveTier failed:', err);
    return cachedTier || 'free';
  }
}

export function isPro(tier: AccountTier | null | undefined): boolean {
  return tier === 'pro';
}

export function invalidateTierCache(): void {
  cachedTier = null;
  cacheTimestamp = 0;
}

// ── Fetch school plan details ──

export async function fetchSchoolPlanDetails(): Promise<SchoolPlanDetails> {
  try {
    const { data, error } = await supabase.rpc('get_school_plan_details');
    if (error || !data?.success) {
      return {
        success: false,
        plan: 'none',
        is_active: false,
        trial_ends_at: null,
        trial_expired: false,
        seats: { cambridge: 0, ielts: 0, game: 0 },
        current_members: 0,
        error: error?.message || data?.error,
      };
    }
    return data as SchoolPlanDetails;
  } catch {
    return {
      success: false,
      plan: 'none',
      is_active: false,
      trial_ends_at: null,
      trial_expired: false,
      seats: { cambridge: 0, ielts: 0, game: 0 },
      current_members: 0,
      error: 'Network error',
    };
  }
}

// ── Lockdown limits ──

export async function fetchLockdownLimits(): Promise<LockdownLimits> {
  try {
    const { data, error } = await supabase.rpc('check_lockdown_limits');
    if (error || !data?.success) {
      return FREE_LOCKDOWN_LIMITS;
    }
    return {
      tier: data.tier || 'free',
      max_duration_minutes: data.max_duration_minutes,
      max_students: data.max_students,
      allowed_maps: data.allowed_maps,
      custom_questions: data.custom_questions ?? false,
      save_results: data.save_results ?? false,
      watermark: data.watermark ?? true,
    };
  } catch {
    return FREE_LOCKDOWN_LIMITS;
  }
}

export const FREE_LOCKDOWN_LIMITS: LockdownLimits = {
  tier: 'free',
  max_duration_minutes: 15,
  max_students: 20,
  allowed_maps: ['default', 'city', 'downtown'],
  custom_questions: false,
  save_results: false,
  watermark: true,
};

export const PRO_LOCKDOWN_LIMITS: LockdownLimits = {
  tier: 'pro',
  max_duration_minutes: null,
  max_students: null,
  allowed_maps: null,
  custom_questions: true,
  save_results: true,
  watermark: false,
};

// ── Start pilot (30-day free trial) ──

export async function startPilot(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('start_school_pilot');
    if (error) {
      return { success: false, error: error.message };
    }
    if (!data?.success) {
      return { success: false, error: data?.error || 'Unknown error' };
    }
    invalidateTierCache();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ── Stripe Checkout (school subscription) ──

export async function createCheckoutSession(options: {
  plan: 'core' | 'standard' | 'pro';
  interval: 'monthly' | 'yearly';
}): Promise<{ checkout_url: string } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe', {
      body: {
        plan: options.plan,
        interval: options.interval,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (error) {
      return { error: error.message || 'Failed to create checkout session' };
    }
    if (data?.checkout_url) {
      return { checkout_url: data.checkout_url };
    }
    return { error: data?.error || 'Unknown error' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ── Feature gating list ──

export const PRO_FEATURES = [
  { id: 'pvp', label: 'PvP Attacks', description: 'Hacking battles against other players' },
  { id: 'clan', label: 'Clans', description: 'Create or join syndicates' },
  { id: 'shop', label: 'Shop', description: 'Weapons, shields & cosmetics' },
  { id: 'inventory', label: 'Inventory', description: 'Manage your arsenal' },
  { id: 'leaderboard', label: 'Leaderboard', description: 'School rankings' },
  { id: 'achievements', label: 'Achievements', description: 'Badges & milestones' },
  { id: 'raids', label: 'Raids', description: 'Boss battles with your clan' },
  { id: 'tournament', label: 'Tournaments', description: 'Inter-school competitions' },
  { id: 'cambridge', label: 'Cambridge Tests', description: 'Full exam practice library' },
  { id: 'ielts', label: 'IELTS Prep', description: 'Complete IELTS suite' },
] as const;

export type ProFeatureId = typeof PRO_FEATURES[number]['id'];

const FREE_FEATURES = new Set(['lockdown', 'quest_basic', 'dashboard']);

export function featureRequiresPro(featureId: string): boolean {
  return !FREE_FEATURES.has(featureId);
}

// ── Pilot quota functions ──

let cachedPilotQuotas: PilotQuotaStatus | null = null;
let pilotQuotaCacheTimestamp = 0;
const PILOT_QUOTA_CACHE_TTL = 2 * 60 * 1000; // 2 min cache (shorter since quotas change)

/**
 * Fetch all pilot quotas for the current user's school.
 * Returns null if not on a pilot plan.
 */
export async function fetchPilotQuotas(force = false): Promise<PilotQuotaStatus | null> {
  if (!force && cachedPilotQuotas && Date.now() - pilotQuotaCacheTimestamp < PILOT_QUOTA_CACHE_TTL) {
    return cachedPilotQuotas;
  }

  try {
    const { data, error } = await supabase.rpc('get_school_pilot_quotas');
    if (error) {
      console.warn('[tierService] get_school_pilot_quotas error:', error.message);
      return cachedPilotQuotas;
    }
    const result = data as PilotQuotaStatus;
    if (!result?.is_pilot) {
      cachedPilotQuotas = null;
      pilotQuotaCacheTimestamp = Date.now();
      return null;
    }
    cachedPilotQuotas = result;
    pilotQuotaCacheTimestamp = Date.now();
    return result;
  } catch (err) {
    console.warn('[tierService] fetchPilotQuotas failed:', err);
    return cachedPilotQuotas;
  }
}

/**
 * Check if a specific feature can be used (read-only).
 */
export async function checkPilotQuota(featureId: PilotFeatureId): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  reason: string;
}> {
  try {
    const { data, error } = await supabase.rpc('check_pilot_quota', { p_feature_id: featureId });
    if (error) {
      console.warn('[tierService] check_pilot_quota error:', error.message);
      return { allowed: false, remaining: 0, limit: 0, reason: 'error_checking_quota' };
    }
    return {
      allowed: data?.allowed ?? false,
      remaining: data?.remaining ?? 0,
      limit: data?.limit ?? 0,
      reason: data?.reason ?? 'unknown',
    };
  } catch {
    return { allowed: false, remaining: 0, limit: 0, reason: 'error_checking_quota' };
  }
}

/**
 * Consume quota units for a feature. Call this when the user actually
 * uses the feature (starts a PvP, buys from shop, etc.).
 * Returns the updated state. Invalidates the cache.
 */
export async function consumePilotQuota(
  featureId: PilotFeatureId,
  amount = 1
): Promise<{
  success: boolean;
  remaining: number;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('consume_pilot_quota', {
      p_feature_id: featureId,
      p_amount: amount,
    });
    if (error) {
      console.warn('[tierService] consume_pilot_quota error:', error.message);
      return { success: false, remaining: 0, error: error.message };
    }
    // Invalidate cache so next fetch gets fresh data
    cachedPilotQuotas = null;
    pilotQuotaCacheTimestamp = 0;

    if (!data?.success) {
      return { success: false, remaining: data?.remaining ?? 0, error: data?.error };
    }
    return { success: true, remaining: data?.remaining ?? 0 };
  } catch (err) {
    return { success: false, remaining: 0, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Invalidate the pilot quota cache (call after consuming).
 */
export function invalidatePilotQuotaCache(): void {
  cachedPilotQuotas = null;
  pilotQuotaCacheTimestamp = 0;
}

/**
 * Get the quota info for a UI feature label from the cached quotas.
 * Returns null if not on pilot or feature has no quota mapping.
 */
export function getQuotaForFeature(
  featureLabel: string,
  quotas: PilotQuotaStatus | null
): PilotQuota | null {
  if (!quotas?.is_pilot || quotas.expired || !quotas.quotas) return null;
  const featureId = FEATURE_TO_QUOTA[featureLabel];
  if (!featureId) return null;
  return quotas.quotas[featureId] ?? null;
}

/**
 * Try to consume a pilot quota unit for the given feature.
 * - If NOT on a pilot plan, returns { proceed: true } (no quota to track).
 * - If on pilot and quota available, consumes 1 unit and returns { proceed: true }.
 * - If on pilot and quota exhausted, returns { proceed: false }.
 *
 * Call this at the moment the user performs the action (starts PvP, buys item, etc.).
 */
export async function tryConsumePilotQuota(
  featureId: PilotFeatureId
): Promise<{ proceed: boolean; remaining?: number; error?: string }> {
  try {
    // Refresh pilot status
    const status = await fetchPilotQuotas(true);

    // Not on pilot — no quota tracking needed, proceed freely
    if (!status || !status.is_pilot) {
      return { proceed: true };
    }

    // Pilot expired — block (tier should already be 'free')
    if (status.expired) {
      return { proceed: false, error: 'Your pilot trial has ended. Subscribe to a plan to continue using this feature.' };
    }

    // Check if quota exists for this feature
    const quota = status.quotas?.[featureId];
    if (!quota) {
      // Feature not tracked → allow (shouldn't happen if DB is synced)
      return { proceed: true };
    }

    // Already exhausted — block
    if (quota.exhausted) {
      return { proceed: false, remaining: 0, error: 'You\'ve reached the usage limit for this feature on the Pilot plan. Upgrade to a paid plan to continue.' };
    }

    // Consume 1 unit
    const result = await consumePilotQuota(featureId, 1);
    if (!result.success) {
      return { proceed: false, remaining: result.remaining, error: result.error };
    }

    return { proceed: true, remaining: result.remaining };
  } catch (err) {
    console.warn('[tierService] tryConsumePilotQuota error:', err);
    // Fail closed — don't let errors bypass quotas
    return { proceed: false, error: 'Unable to verify your plan usage at this time. Please try again shortly.' };
  }
}
