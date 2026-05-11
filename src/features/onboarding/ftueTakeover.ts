import type { OnboardingResolution } from './onboardingTypes';

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
