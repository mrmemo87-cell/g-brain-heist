import type { Profile } from '../../../types';

/**
 * Phase 1 FTUE intentionally models only the minimum set of segments and steps
 * needed to route users safely. Keep these unions small until real onboarding
 * flows prove that more states are required.
 */
export type OnboardingSegment =
  | 'school_student'
  | 'solo_learner'
  | 'teacher'
  | 'school_admin'
  | 'none';

export type OnboardingContextType =
  | 'school'
  | 'solo'
  | 'teacher_trial'
  | 'admin_school'
  | 'none';

export type OnboardingStep =
  | 'intent'
  | 'school_confirm'
  | 'identity'
  | 'placement'
  | 'goal'
  | 'mission_brief'
  | 'mission_started'
  | 'reward_reveal'
  | 'teacher_context'
  | 'class_setup'
  | 'starter_mission'
  | 'invite_share'
  | 'admin_checklist'
  | 'admin_action'
  | 'dashboard_reveal'
  | 'complete';

export type FeatureRevealLevel = 'disabled' | 'ftue_active' | 'first_run_dashboard' | 'normal_dashboard';

export type OnboardingFeatureKey =
  | 'dashboard'
  | 'missions'
  | 'xp_streak'
  | 'leaderboard'
  | 'pvp'
  | 'raids'
  | 'clans'
  | 'shop'
  | 'inventory'
  | 'cambridge'
  | 'ielts'
  | 'reports'
  | 'upgrade_prompts'
  | 'teacher_portal'
  | 'school_admin_portal';

export interface OnboardingState {
  user_id: string;
  segment: Exclude<OnboardingSegment, 'none'> | null;
  context_type: Exclude<OnboardingContextType, 'none'> | null;
  context_id: string | null;
  current_step: OnboardingStep | null;
  completed_steps: OnboardingStep[];
  core_completed_at: string | null;
  first_value_started_at: string | null;
  first_value_completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface OnboardingStatePatch {
  segment?: Exclude<OnboardingSegment, 'none'> | null;
  context_type?: Exclude<OnboardingContextType, 'none'> | null;
  context_id?: string | null;
  current_step?: OnboardingStep | null;
  completed_steps?: OnboardingStep[];
  core_completed_at?: string | null;
  first_value_started_at?: string | null;
  first_value_completed_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OnboardingFlags {
  ftue_enabled: boolean;
  progressive_reveal_enabled: boolean;
  byte_ftue_enabled: boolean;
  teacher_ftue_enabled: boolean;
  admin_ftue_enabled: boolean;
}

export interface OnboardingResolverInput {
  profile: Partial<Profile> | null;
  onboardingState: OnboardingState | null;
  flags: OnboardingFlags;
  inviteToken?: string | null;
  hasActiveAssignment?: boolean;
}

export interface OnboardingResolution {
  eligible: boolean;
  isComplete: boolean;
  segment: OnboardingSegment;
  context: OnboardingContextType;
  state: OnboardingState | null;
  nextStep: OnboardingStep;
  featureRevealLevel: FeatureRevealLevel;
  requiredData: string[];
  gates: OnboardingFeatureKey[];
  primaryCta: string;
  fallbackRoute: string;
  reason: string;
}

export interface OnboardingAnalyticsEvent {
  event: string;
  user_id?: string | null;
  segment?: OnboardingSegment;
  context_type?: OnboardingContextType;
  step?: OnboardingStep;
  metadata?: Record<string, unknown>;
}
