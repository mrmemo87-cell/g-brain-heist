import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../../../types';
import { getOnboardingFlags } from './featureFlags';
import { emitOnboardingEvent } from './onboardingAnalytics';
import { resolveNextOnboardingStep } from './onboardingService';
import type { OnboardingResolution } from './onboardingTypes';

interface UseOnboardingResolutionOptions {
  profile?: Partial<Profile> | null;
  inviteToken?: string | null;
  hasActiveAssignment?: boolean;
  observeOnly?: boolean;
}

interface UseOnboardingResolutionResult {
  loading: boolean;
  error: string | null;
  resolution: OnboardingResolution | null;
  refresh: () => Promise<void>;
}

/**
 * Route-level hook for the Phase 1 FTUE foundation. It resolves onboarding state
 * without owning any screen flow, so future onboarding UI can be added without
 * changing auth or dashboard boot logic.
 */
export const useOnboardingResolution = ({
  profile,
  inviteToken,
  hasActiveAssignment,
  observeOnly = true,
}: UseOnboardingResolutionOptions = {}): UseOnboardingResolutionResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<OnboardingResolution | null>(null);

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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [hasActiveAssignment, inviteToken, observeOnly, profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, error, resolution, refresh };
};
