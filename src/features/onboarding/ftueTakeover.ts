import { resolveOnboarding } from './onboardingResolver.js';
import type { OnboardingFlags, OnboardingResolution, OnboardingState } from './onboardingTypes.js';
import type { Profile } from '../../../types';

/**
 * Phase 1A learner FTUE is the render owner only for active, incomplete learner
 * resolutions. Keeping this predicate centralized prevents legacy tutorial and
 * broadcast surfaces from drifting back into the same onboarding window.
 */
export const isLearnerSegment = (segment?: string): boolean => segment === 'school_student' || segment === 'solo_learner';

export const isActiveLearnerFtue = (resolution: OnboardingResolution | null | undefined): boolean => (
  Boolean(resolution?.eligible)
  && !resolution?.isComplete
  && isLearnerSegment(resolution?.segment)
);

interface LegacyTutorialSuppressionInput {
  flags: OnboardingFlags;
  profile: Partial<Profile> | null;
  onboardingState?: OnboardingState | null;
  inviteToken?: string | null;
  hasActiveAssignment?: boolean;
}

/**
 * Returns true when the new learner FTUE should own onboarding and the legacy
 * tutorial must stay unmounted. This intentionally uses the same resolver and
 * active-learner predicate as OnboardingRouteGate so rollback stays controlled
 * by ftue_enabled=false and non-eligible segments keep legacy behavior.
 */
export const shouldSuppressLegacyTutorialForFtue = ({
  flags,
  profile,
  onboardingState = null,
  inviteToken,
  hasActiveAssignment,
}: LegacyTutorialSuppressionInput): boolean => isActiveLearnerFtue(resolveOnboarding({
  profile,
  onboardingState,
  flags,
  inviteToken,
  hasActiveAssignment,
}));
