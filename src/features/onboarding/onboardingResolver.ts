import type { UserRole } from '../../../types';
import type {
  FeatureRevealLevel,
  OnboardingContextType,
  OnboardingFeatureKey,
  OnboardingResolution,
  OnboardingResolverInput,
  OnboardingSegment,
  OnboardingStep,
} from './onboardingTypes';

const STUDENT_GATES: OnboardingFeatureKey[] = ['pvp', 'raids', 'clans', 'shop', 'inventory', 'leaderboard', 'upgrade_prompts'];
const SOLO_GATES: OnboardingFeatureKey[] = ['pvp', 'raids', 'clans', 'leaderboard', 'upgrade_prompts'];
const TEACHER_GATES: OnboardingFeatureKey[] = ['pvp', 'raids', 'clans', 'shop', 'inventory', 'leaderboard', 'upgrade_prompts'];
const ADMIN_GATES: OnboardingFeatureKey[] = ['pvp', 'raids', 'clans', 'shop', 'inventory', 'leaderboard'];

const isMissingIdentity = (profile: OnboardingResolverInput['profile']) => !profile?.username;
const isMissingSchoolPlacement = (profile: OnboardingResolverInput['profile']) => {
  if (!profile || profile.role !== 'student' || !profile.school_id) return false;
  return profile.grade === null || profile.grade === undefined || !profile.batch;
};

const hasCompletedState = (input: OnboardingResolverInput): boolean => Boolean(input.onboardingState?.core_completed_at);

const hasLegacyCompletion = (input: OnboardingResolverInput): boolean => {
  const { profile, onboardingState } = input;
  if (!profile || onboardingState) return false;

  // Safety-first migration path: teachers/admins and learners who already
  // completed the legacy tutorial can stay on the old dashboard if their new
  // FTUE state has not been created yet. Learners with tutorial_completed=false
  // remain eligible so Phase 1A can take over instead of letting the legacy
  // tutorial modal become their primary onboarding experience.
  if (profile.needs_setup !== false) return false;
  if (profile.role === 'teacher' || profile.role === 'admin' || profile.role === 'school_admin') return true;
  return Boolean(profile.role && profile.tutorial_completed === true);
};

const resolveSegment = (input: OnboardingResolverInput): { segment: OnboardingSegment; context: OnboardingContextType; reason: string } => {
  const { profile, flags, inviteToken } = input;
  const role = profile?.role as UserRole | undefined;

  if (!profile) return { segment: 'none', context: 'none', reason: 'missing_profile' };
  if (inviteToken) return { segment: 'school_student', context: 'school', reason: 'invite_token_present' };

  if (role === 'school_admin') {
    if (!flags.admin_ftue_enabled) return { segment: 'none', context: 'none', reason: 'admin_ftue_disabled' };
    return { segment: 'school_admin', context: 'admin_school', reason: 'school_admin_role' };
  }

  if (role === 'teacher') {
    if (!flags.teacher_ftue_enabled) return { segment: 'none', context: 'none', reason: 'teacher_ftue_disabled' };
    return { segment: 'teacher', context: profile.school_id ? 'school' : 'teacher_trial', reason: 'teacher_role' };
  }

  if (role === 'student' || !role) {
    if (profile.school_id) return { segment: 'school_student', context: 'school', reason: 'student_with_school' };
    return { segment: 'solo_learner', context: 'solo', reason: role ? 'student_without_school' : 'unknown_role_defaults_to_learner' };
  }

  return { segment: 'none', context: 'none', reason: 'unsupported_role' };
};

const goalSelected = (input: OnboardingResolverInput): boolean => Boolean(input.onboardingState?.metadata?.['goal']);

const deriveNextStep = (input: OnboardingResolverInput, segment: OnboardingSegment): OnboardingStep => {
  const stateStep = input.onboardingState?.current_step;
  if (stateStep && stateStep !== 'complete') return stateStep;

  switch (segment) {
    case 'school_student':
      if (isMissingIdentity(input.profile)) return 'identity';
      if (isMissingSchoolPlacement(input.profile)) return 'placement';
      return 'mission_brief';
    case 'solo_learner':
      if (isMissingIdentity(input.profile)) return 'identity';
      if (!goalSelected(input)) return 'goal';
      return 'mission_brief';
    case 'teacher':
      return input.profile?.school_id ? 'starter_mission' : 'teacher_context';
    case 'school_admin':
      return 'admin_checklist';
    default:
      return 'intent';
  }
};

const getRequiredData = (step: OnboardingStep): string[] => {
  switch (step) {
    case 'identity':
      return ['username'];
    case 'placement':
      return ['grade', 'batch'];
    case 'goal':
      return ['goal'];
    case 'school_confirm':
      return ['school_id'];
    case 'teacher_context':
      return ['teacher_context'];
    case 'class_setup':
      return ['class_name'];
    case 'admin_checklist':
      return ['school_id'];
    default:
      return [];
  }
};

const getGates = (segment: OnboardingSegment, revealLevel: FeatureRevealLevel): OnboardingFeatureKey[] => {
  if (revealLevel === 'normal_dashboard' || revealLevel === 'disabled') return [];
  switch (segment) {
    case 'school_student':
      return STUDENT_GATES;
    case 'solo_learner':
      return SOLO_GATES;
    case 'teacher':
      return TEACHER_GATES;
    case 'school_admin':
      return ADMIN_GATES;
    default:
      return [];
  }
};

const getPrimaryCta = (step: OnboardingStep): string => {
  switch (step) {
    case 'identity':
      return 'Confirm identity';
    case 'placement':
      return 'Confirm class';
    case 'goal':
      return 'Choose goal';
    case 'mission_brief':
      return 'Start mission';
    case 'teacher_context':
      return 'Set up teaching context';
    case 'starter_mission':
      return 'Prepare starter mission';
    case 'admin_checklist':
      return 'Review setup checklist';
    case 'dashboard_reveal':
      return 'Continue to dashboard';
    default:
      return 'Continue';
  }
};

const getFallbackRoute = (segment: OnboardingSegment): string => {
  switch (segment) {
    case 'teacher':
      return '/?view=teacher';
    case 'school_admin':
      return '/?view=school_admin';
    default:
      return '/';
  }
};

/**
 * Minimal Phase 1 resolver. It deliberately avoids a generic workflow engine:
 * the output is a small routing/gating decision that future FTUE screens can use
 * while existing dashboards continue to run unchanged behind feature flags.
 */
export const resolveOnboarding = (input: OnboardingResolverInput): OnboardingResolution => {
  if (!input.flags.ftue_enabled) {
    return {
      eligible: false,
      isComplete: true,
      segment: 'none',
      context: 'none',
      state: input.onboardingState,
      nextStep: 'complete',
      featureRevealLevel: 'disabled',
      requiredData: [],
      gates: [],
      primaryCta: 'Continue',
      fallbackRoute: '/',
      reason: 'ftue_disabled',
    };
  }

  const segmentResult = resolveSegment(input);
  const complete = hasCompletedState(input) || hasLegacyCompletion(input);
  const nextStep = complete ? 'complete' : deriveNextStep(input, segmentResult.segment);
  const revealLevel: FeatureRevealLevel = complete
    ? 'normal_dashboard'
    : nextStep === 'dashboard_reveal'
      ? 'first_run_dashboard'
      : 'ftue_active';

  return {
    eligible: segmentResult.segment !== 'none',
    isComplete: complete,
    segment: segmentResult.segment,
    context: segmentResult.context,
    state: input.onboardingState,
    nextStep,
    featureRevealLevel: revealLevel,
    requiredData: getRequiredData(nextStep),
    gates: input.flags.progressive_reveal_enabled ? getGates(segmentResult.segment, revealLevel) : [],
    primaryCta: getPrimaryCta(nextStep),
    fallbackRoute: getFallbackRoute(segmentResult.segment),
    reason: complete ? 'complete' : segmentResult.reason,
  };
};
