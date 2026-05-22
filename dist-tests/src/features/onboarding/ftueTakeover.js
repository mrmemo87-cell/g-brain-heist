import { resolveOnboarding } from './onboardingResolver.js';
import { logOnboardingDebug } from './featureFlags.js';
export const isLearnerSegment = (segment) => segment === 'school_student' || segment === 'solo_learner';
export const isActiveLearnerFtue = (resolution) => (Boolean(resolution?.eligible)
    && !resolution?.isComplete
    && isLearnerSegment(resolution?.segment));
/**
 * Returns true when the new learner FTUE should own onboarding and the legacy
 * tutorial must stay unmounted. This intentionally uses the same resolver and
 * active-learner predicate as OnboardingRouteGate so rollback stays controlled
 * by ftue_enabled=false and non-eligible segments keep legacy behavior.
 */
export const getLegacyTutorialSuppressionDebugSnapshot = (source, { flags, profile, onboardingState = null, inviteToken, hasActiveAssignment, }) => {
    const resolution = resolveOnboarding({
        profile,
        onboardingState,
        flags,
        inviteToken,
        hasActiveAssignment,
    });
    const suppress = isActiveLearnerFtue(resolution);
    return {
        source,
        suppress,
        flags,
        profile: profile ? {
            id: profile.id ?? null,
            role: profile.role ?? null,
            school_id: profile.school_id ?? null,
            needs_setup: profile.needs_setup ?? null,
            tutorial_completed: profile.tutorial_completed ?? null,
        } : null,
        onboardingState: onboardingState ? {
            segment: onboardingState.segment,
            current_step: onboardingState.current_step,
            core_completed_at: onboardingState.core_completed_at,
            completed_steps: onboardingState.completed_steps,
        } : null,
        resolution: {
            eligible: resolution.eligible,
            isComplete: resolution.isComplete,
            segment: resolution.segment,
            context: resolution.context,
            nextStep: resolution.nextStep,
            reason: resolution.reason,
            featureRevealLevel: resolution.featureRevealLevel,
        },
        inviteToken,
        hasActiveAssignment,
    };
};
export const logLegacyTutorialSuppressionDebug = (source, input) => {
    const snapshot = getLegacyTutorialSuppressionDebugSnapshot(source, input);
    logOnboardingDebug('[ftue:legacy-tutorial]', snapshot);
    return snapshot;
};
export const shouldSuppressLegacyTutorialForFtue = (input) => (getLegacyTutorialSuppressionDebugSnapshot('shouldSuppressLegacyTutorialForFtue', input).suppress);
