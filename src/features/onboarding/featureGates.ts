import type { OnboardingFeatureKey, OnboardingResolution, OnboardingStep } from './onboardingTypes';

/**
 * Feature visibility is intentionally client-side and advisory in Phase 1.
 * Server-side authorization and existing role/school checks remain the source of
 * truth for sensitive actions. These helpers only support progressive reveal UI.
 */
export const isOnboardingMilestoneComplete = (
  resolution: OnboardingResolution | null | undefined,
  step: OnboardingStep,
): boolean => {
  if (!resolution) return false;
  if (resolution.isComplete) return true;
  return Boolean(resolution.state?.completed_steps?.includes(step));
};

export const isFeatureVisibleForOnboarding = (
  feature: OnboardingFeatureKey,
  resolution: OnboardingResolution | null | undefined,
): boolean => {
  if (!resolution || !resolution.eligible || resolution.isComplete) return true;
  return !resolution.gates.includes(feature);
};

export const getHiddenOnboardingFeatures = (
  resolution: OnboardingResolution | null | undefined,
): OnboardingFeatureKey[] => {
  if (!resolution || resolution.isComplete) return [];
  return resolution.gates;
};
