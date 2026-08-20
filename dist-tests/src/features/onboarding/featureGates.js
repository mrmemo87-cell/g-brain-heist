/**
 * Feature visibility is intentionally client-side and advisory in Phase 1.
 * Server-side authorization and existing role/school checks remain the source of
 * truth for sensitive actions. These helpers only support progressive reveal UI.
 */
export const isOnboardingMilestoneComplete = (resolution, step) => {
    if (!resolution)
        return false;
    if (resolution.isComplete)
        return true;
    return Boolean(resolution.state?.completed_steps?.includes(step));
};
export const isFeatureVisibleForOnboarding = (feature, resolution) => {
    if (!resolution || !resolution.eligible || resolution.isComplete)
        return true;
    return !resolution.gates.includes(feature);
};
export const getHiddenOnboardingFeatures = (resolution) => {
    if (!resolution || resolution.isComplete)
        return [];
    return resolution.gates;
};
