import { getEnvVar } from '../../../services/env.js';
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);
const readFlagOverride = (flagName) => {
    if (typeof window === 'undefined')
        return undefined;
    return window.localStorage.getItem(`brains_heist_${flagName}`) ?? undefined;
};
const parseBooleanFlag = (raw, fallback) => {
    if (!raw)
        return fallback;
    const normalized = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized))
        return true;
    if (FALSE_VALUES.has(normalized))
        return false;
    return fallback;
};
const readBooleanFlag = (flagName, envName, fallback = false) => {
    const override = readFlagOverride(flagName);
    return parseBooleanFlag(override ?? getEnvVar(envName), fallback);
};
const readDebugFlagOverride = () => {
    if (typeof window === 'undefined')
        return undefined;
    return window.localStorage.getItem('brains_heist_onboarding_debug')
        ?? window.localStorage.getItem('brains_heist_ftue_debug')
        ?? undefined;
};
export const isOnboardingDebugEnabled = () => (parseBooleanFlag(readDebugFlagOverride() ?? getEnvVar('VITE_ONBOARDING_DEBUG') ?? getEnvVar('VITE_FTUE_DEBUG'), false));
export const logOnboardingDebug = (label, payload) => {
    if (!isOnboardingDebugEnabled() || typeof console === 'undefined')
        return;
    if (payload === undefined) {
        console.debug(label);
        return;
    }
    console.debug(label, payload);
};
/**
 * Feature flags for the Phase 1 FTUE foundation. Phase 1A learner FTUE is
 * enabled by default so brand-new learner accounts are owned by the new shell.
 * Rollback remains one flag away with VITE_FTUE_ENABLED=false or a local QA
 * override such as `brains_heist_ftue_enabled=false`.
 */
export const getOnboardingFlags = () => ({
    ftue_enabled: readBooleanFlag('ftue_enabled', 'VITE_FTUE_ENABLED', true),
    progressive_reveal_enabled: readBooleanFlag('progressive_reveal_enabled', 'VITE_PROGRESSIVE_REVEAL_ENABLED', false),
    byte_ftue_enabled: readBooleanFlag('byte_ftue_enabled', 'VITE_BYTE_FTUE_ENABLED', false),
    teacher_ftue_enabled: readBooleanFlag('teacher_ftue_enabled', 'VITE_TEACHER_FTUE_ENABLED', false),
    admin_ftue_enabled: readBooleanFlag('admin_ftue_enabled', 'VITE_ADMIN_FTUE_ENABLED', false),
});
export const isOnboardingFlagEnabled = (flagName) => getOnboardingFlags()[flagName];
