import { useCallback, useEffect, useState } from 'react';
import { getOnboardingFlags, logOnboardingDebug } from './featureFlags.js';
import { emitOnboardingEvent } from './onboardingAnalytics.js';
import { resolveNextOnboardingStep } from './onboardingService.js';
import { isActiveLearnerFtue } from './ftueTakeover.js';
/**
 * Route-level hook for the Phase 1 FTUE foundation. It resolves onboarding state
 * without owning any screen flow, so future onboarding UI can be added without
 * changing auth or dashboard boot logic.
 */
export const useOnboardingResolution = ({ profile, inviteToken, hasActiveAssignment, observeOnly = true, } = {}) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [resolution, setResolution] = useState(null);
    const refresh = useCallback(async () => {
        const flags = getOnboardingFlags();
        if (!flags.ftue_enabled) {
            setResolution(null);
            setLoading(false);
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const nextResolution = await resolveNextOnboardingStep({ profile, inviteToken, hasActiveAssignment });
            logOnboardingDebug('[ftue:route-resolution]', {
                source: observeOnly ? 'useOnboardingResolution.observeOnly' : 'useOnboardingResolution.enforced',
                activeLearnerFtue: isActiveLearnerFtue(nextResolution),
                profileSource: profile ? 'prop' : 'service.fetchOnboardingProfile',
                resolution: {
                    eligible: nextResolution.eligible,
                    isComplete: nextResolution.isComplete,
                    segment: nextResolution.segment,
                    context: nextResolution.context,
                    nextStep: nextResolution.nextStep,
                    reason: nextResolution.reason,
                    featureRevealLevel: nextResolution.featureRevealLevel,
                },
                state: nextResolution.state ? {
                    segment: nextResolution.state.segment,
                    current_step: nextResolution.state.current_step,
                    core_completed_at: nextResolution.state.core_completed_at,
                    completed_steps: nextResolution.state.completed_steps,
                } : null,
            });
            setResolution(nextResolution);
            if (nextResolution.eligible && !nextResolution.isComplete) {
                await emitOnboardingEvent({
                    event: observeOnly ? 'ftue_route_observed' : 'ftue_route_protected',
                    user_id: nextResolution.state?.user_id,
                    segment: nextResolution.segment,
                    context_type: nextResolution.context,
                    step: nextResolution.nextStep,
                    metadata: { reason: nextResolution.reason },
                });
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
        }
        finally {
            setLoading(false);
        }
    }, [hasActiveAssignment, inviteToken, observeOnly, profile]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    return { loading, error, resolution, refresh };
};
