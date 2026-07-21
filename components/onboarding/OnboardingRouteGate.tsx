import React from 'react';
import { useOnboardingResolution } from '../../src/features/onboarding/useOnboardingResolution';
import { getOnboardingFlags, logOnboardingDebug } from '../../src/features/onboarding/featureFlags';
import { isActiveLearnerFtue } from '../../src/features/onboarding/ftueTakeover';
import type { Profile } from '../../types';
import LearnerOnboardingShell from './LearnerOnboardingShell';

interface OnboardingRouteGateProps {
  children: React.ReactNode;
  profile?: Partial<Profile> | null;
  /**
   * Observe-only lets the resolver persist/resume state and emit analytics while
   * existing dashboards remain accessible. Phase 1A uses enforcement only for
   * learner segments; teachers/admins still pass through until their flows exist.
   */
  observeOnly?: boolean;
  fallback?: React.ReactNode;
}

/**
 * Lightweight route protection shell. It now renders only the Phase 1A learner
 * FTUE when explicitly enabled; non-learner segments stay on existing routes.
 *
 * Coexistence note: while the resolver is loading in enforced mode, we keep the
 * dashboard tree unmounted. That makes the Phase 1A shell the sole render owner
 * for eligible learners and prevents legacy tutorial modals, broadcast banners,
 * and old onboarding overlays from flashing over the new FTUE. Turning the FTUE
 * flag off (or resolving a teacher/admin/non-eligible segment) immediately rolls
 * back to the existing dashboard and legacy tutorial system.
 */
const OnboardingRouteGate: React.FC<OnboardingRouteGateProps> = ({
  children,
  profile,
  observeOnly = true,
  fallback,
}) => {
  const flags = getOnboardingFlags();
  const [bypass, setBypass] = React.useState(false);
  const { loading, error, resolution } = useOnboardingResolution({ profile, observeOnly });
  const activeLearnerFtue = isActiveLearnerFtue(resolution);
  const shouldRenderLearnerShell = Boolean(
    flags.ftue_enabled
    && !bypass
    && !observeOnly
    && !loading
    && !error
    && activeLearnerFtue,
  );
  const shouldSuppressLegacyTutorial = activeLearnerFtue;

  React.useEffect(() => {
    logOnboardingDebug('[ftue:route-gate]', {
      ftue_enabled: flags.ftue_enabled,
      segment: resolution?.segment ?? 'unresolved',
      eligible: resolution?.eligible ?? false,
      completed: resolution?.isComplete ?? false,
      current_step: resolution?.state?.current_step ?? resolution?.nextStep ?? null,
      shouldRenderLearnerShell,
      shouldSuppressLegacyTutorial,
      falseCondition: !flags.ftue_enabled
        ? 'ftue_enabled=false'
        : bypass
          ? 'route_gate_bypass=true'
          : observeOnly
            ? 'observeOnly=true'
            : loading
              ? 'resolver_loading=true'
              : error
                ? 'resolver_error'
                : !resolution
                  ? 'resolution=missing'
                  : !resolution.eligible
                    ? 'eligible=false'
                    : resolution.isComplete
                      ? 'completed=true'
                      : !activeLearnerFtue
                        ? `segment=${resolution.segment}`
                        : null,
      reason: resolution?.reason ?? null,
      profileProvided: Boolean(profile),
      loading,
      error,
    });
  }, [activeLearnerFtue, bypass, error, flags.ftue_enabled, loading, observeOnly, profile, resolution, shouldRenderLearnerShell, shouldSuppressLegacyTutorial]);

  if (!flags.ftue_enabled || bypass || observeOnly) {
    return <>{children}</>;
  }

  if (loading || (!resolution && !error)) {
    return <>{children}</>;
  }

  // Resolver errors roll forward to the legacy dashboard to preserve rollback
  // safety. This keeps auth/setup usable if the new onboarding tables or network
  // are unavailable, but active learner resolutions below still take over fully.
  if (error || !resolution?.eligible || resolution.isComplete) {
    return <>{children}</>;
  }

  if (shouldRenderLearnerShell) {
    return <LearnerOnboardingShell resolution={resolution} profile={profile} onComplete={() => setBypass(true)} />;
  }

  // Teacher/admin FTUE is intentionally not implemented in Phase 1A. Preserve existing routes.
  return <>{children}</>;
};

export default OnboardingRouteGate;
