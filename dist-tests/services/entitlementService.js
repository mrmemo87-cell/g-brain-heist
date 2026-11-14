import { supabase } from './supabaseClient.js';
import { createScopedReadCache } from './scopedReadCache.js';
// ── Cache ──
const entitlementsCache = createScopedReadCache(5 * 60 * 1000, value => value.authoritative);
/**
 * Fetch entitlements for the current user's effective plan.
 * Cached for 5 minutes. Pass `force = true` to bypass cache.
 */
export async function getEntitlements(force = false) {
    const { data: sessionData } = await supabase.auth.getSession();
    return entitlementsCache.read(sessionData.session?.access_token ?? 'signed-out', loadEntitlements, force);
}
async function loadEntitlements() {
    const { data, error } = await supabase.rpc('get_my_effective_entitlements');
    const payload = data && typeof data === 'object' && !Array.isArray(data)
        ? data
        : {};
    const effectivePlan = !error && payload['success'] === true && typeof payload['plan'] === 'string'
        ? payload['plan']
        : 'free';
    const rawEntitlements = !error && payload['entitlements'] && typeof payload['entitlements'] === 'object'
        ? payload['entitlements']
        : {};
    const rawModules = !error && payload['modules'] && typeof payload['modules'] === 'object'
        ? payload['modules']
        : {};
    const rawProgrammeCatalogue = !error && payload['programme_catalogue'] && typeof payload['programme_catalogue'] === 'object'
        ? payload['programme_catalogue']
        : {};
    const entitlements = {};
    for (const [featureKey, value] of Object.entries(rawEntitlements)) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            continue;
        const row = value;
        entitlements[featureKey] = {
            feature_key: featureKey,
            enabled: row['enabled'] === true,
            limit_value: typeof row['limit_value'] === 'number' ? row['limit_value'] : null,
        };
    }
    const modules = {
        core: rawModules['core'] === true,
        cambridge: rawModules['cambridge'] === true,
        ielts: rawModules['ielts'] === true,
        writing: rawModules['writing'] === true,
        admissions: rawModules['admissions'] === true,
    };
    const parseProgrammeAccess = (key) => {
        const raw = rawProgrammeCatalogue[key];
        const row = raw && typeof raw === 'object' && !Array.isArray(raw)
            ? raw
            : {};
        const available = row['available'] === true && modules[key];
        const rawReason = row['reason'];
        const reason = available
            ? 'available'
            : rawReason === 'seat_not_allocated'
                ? 'seat_not_allocated'
                : 'not_purchased';
        return {
            purchased: row['purchased'] === true,
            seatAllocated: row['seat_allocated'] === true,
            available,
            reason,
        };
    };
    const programmeAccess = {
        cambridge: parseProgrammeAccess('cambridge'),
        ielts: parseProgrammeAccess('ielts'),
        writing: parseProgrammeAccess('writing'),
    };
    const result = {
        authoritative: !error && payload['success'] === true,
        plan: effectivePlan,
        schoolId: typeof payload['school_id'] === 'string' ? payload['school_id'] : null,
        modules,
        programmeAccess,
        entitlements,
        canUse: (featureKey) => {
            const ent = entitlements[featureKey];
            if (!ent)
                return false; // unknown feature = deny
            return ent.enabled;
        },
        getLimit: (featureKey) => {
            const ent = entitlements[featureKey];
            if (!ent || !ent.enabled)
                return 0;
            return ent.limit_value; // null = unlimited
        },
    };
    return result;
}
/**
 * Quick check: can the current user use a specific feature?
 * Shortcut that doesn't require holding the EntitlementSet reference.
 */
export async function canUseFeature(featureKey) {
    const ent = await getEntitlements();
    return ent.canUse(featureKey);
}
/**
 * Get the limit value for a feature.
 * Returns null if unlimited, 0 if disabled.
 */
export async function getFeatureLimit(featureKey) {
    const ent = await getEntitlements();
    return ent.getLimit(featureKey);
}
/**
 * Invalidate entitlement cache (call after plan changes).
 */
export function invalidateEntitlementCache() {
    entitlementsCache.clear();
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
};
export const MODULE_KEYS = {
    CORE: 'core',
    CAMBRIDGE: 'cambridge',
    IELTS: 'ielts',
    WRITING: 'writing',
    ADMISSIONS: 'admissions',
};
