import React from 'react';
import { useOnboardingResolution } from '../../src/features/onboarding/useOnboardingResolution';
import { getOnboardingFlags } from '../../src/features/onboarding/featureFlags';
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

const DefaultOnboardingFallback: React.FC<{ onContinue: () => void; loading?: boolean }> = ({ onContinue, loading }) => (
  <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6 text-white">
    <div className="w-full max-w-lg rounded-2xl border border-cyan-500/25 bg-slate-900/85 p-6 shadow-2xl shadow-cyan-950/30">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">FTUE foundation</div>
      <h1 className="mt-3 text-2xl font-bold">Onboarding is preparing your next step</h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        The Phase 1 onboarding resolver has detected an unfinished setup state. Full onboarding screens are not enabled yet, so you can safely continue to the existing Brains Heist experience.
      </p>
      <button
        type="button"
        className="mt-6 w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-70"
        onClick={onContinue}
        disabled={loading}
      >
        Continue to Brains Heist
      </button>
    </div>
  </div>
);

const isLearnerSegment = (segment?: string) => segment === 'school_student' || segment === 'solo_learner';

/**
 * Lightweight route protection shell. It now renders only the Phase 1A learner
 * FTUE when explicitly enabled; non-learner segments stay on existing routes.
 */
const OnboardingRouteGate: React.FC<OnboardingRouteGateProps> = ({
  children,
  profile,
  observeOnly = true,
  fallback,
}) => {
  const flags = getOnboardingFlags();
  const [bypass, setBypass] = React.useState(false);
  const { loading, resolution } = useOnboardingResolution({ profile, observeOnly });

  if (!flags.ftue_enabled || bypass || observeOnly || !resolution?.eligible || resolution.isComplete) {
    return <>{children}</>;
  }

  if (isLearnerSegment(resolution.segment)) {
    return <LearnerOnboardingShell resolution={resolution} profile={profile} onComplete={() => setBypass(true)} />;
  }

  // Teacher/admin FTUE is intentionally not implemented in Phase 1A. Preserve existing routes.
  return <>{fallback ?? children}</>;
};

export default OnboardingRouteGate;
