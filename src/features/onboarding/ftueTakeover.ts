import { resolveOnboarding } from './onboardingResolver.js';
import type { OnboardingFlags, OnboardingResolution, OnboardingState } from './onboardingTypes.js';
import type { Profile } from '../../../types';
import { logOnboardingDebug } from './featureFlags.js';

/**
 * Phase 1A learner FTUE is the render owner only for active, incomplete learner
 * resolutions. Keeping this predicate centralized prevents legacy tutorial and
 * broadcast surfaces from drifting back into the same onboarding window.
 */

export interface LegacyTutorialSuppressionDebugSnapshot {
  source: string;
  suppress: boolean;
  flags: OnboardingFlags;
  profile: {
    id?: string | null;
    role?: string | null;
    school_id?: string | null;
    needs_setup?: boolean | null;
    tutorial_completed?: boolean | null;
  } | null;
  onboardingState: {
    segment?: string | null;
    current_step?: string | null;
    core_completed_at?: string | null;
    completed_steps?: string[];
  } | null;
  resolution: {
    eligible: boolean;
    isComplete: boolean;
    segment: string;
    context: string;
    nextStep: string;
    reason: string;
    featureRevealLevel: string;
  };
  inviteToken?: string | null;
  hasActiveAssignment?: boolean;
}

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
export const getLegacyTutorialSuppressionDebugSnapshot = (
  source: string,
  {
    flags,
    profile,
    onboardingState = null,
    inviteToken,
    hasActiveAssignment,
  }: LegacyTutorialSuppressionInput,
): LegacyTutorialSuppressionDebugSnapshot => {
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

export const logLegacyTutorialSuppressionDebug = (
  source: string,
  input: LegacyTutorialSuppressionInput,
): LegacyTutorialSuppressionDebugSnapshot => {
  const snapshot = getLegacyTutorialSuppressionDebugSnapshot(source, input);
  logOnboardingDebug('[ftue:legacy-tutorial]', snapshot);
  return snapshot;
};

export const shouldSuppressLegacyTutorialForFtue = (input: LegacyTutorialSuppressionInput): boolean => (
  getLegacyTutorialSuppressionDebugSnapshot('shouldSuppressLegacyTutorialForFtue', input).suppress
);
