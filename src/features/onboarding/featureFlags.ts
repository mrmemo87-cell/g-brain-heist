import { getEnvVar } from '../../../services/env';
import type { OnboardingFlags } from './onboardingTypes';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

const readFlagOverride = (flagName: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(`brains_heist_${flagName}`) ?? undefined;
};

const parseBooleanFlag = (raw: string | undefined, fallback: boolean): boolean => {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
};

const readBooleanFlag = (flagName: keyof OnboardingFlags, envName: string, fallback = false): boolean => {
  const override = readFlagOverride(flagName);
  return parseBooleanFlag(override ?? getEnvVar(envName), fallback);
};

/**
 * Feature flags for the Phase 1 FTUE foundation. Defaults are intentionally off
 * so deploying the infrastructure cannot interrupt existing auth/setup flows.
 * Local QA can enable a flag with localStorage, e.g.
 * `brains_heist_ftue_enabled=true`.
 */
export const getOnboardingFlags = (): OnboardingFlags => ({
  ftue_enabled: readBooleanFlag('ftue_enabled', 'VITE_FTUE_ENABLED', false),
  progressive_reveal_enabled: readBooleanFlag('progressive_reveal_enabled', 'VITE_PROGRESSIVE_REVEAL_ENABLED', false),
  byte_ftue_enabled: readBooleanFlag('byte_ftue_enabled', 'VITE_BYTE_FTUE_ENABLED', false),
  teacher_ftue_enabled: readBooleanFlag('teacher_ftue_enabled', 'VITE_TEACHER_FTUE_ENABLED', false),
  admin_ftue_enabled: readBooleanFlag('admin_ftue_enabled', 'VITE_ADMIN_FTUE_ENABLED', false),
});

export const isOnboardingFlagEnabled = (flagName: keyof OnboardingFlags): boolean => getOnboardingFlags()[flagName];
