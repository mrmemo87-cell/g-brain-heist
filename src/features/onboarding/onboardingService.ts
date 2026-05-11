import { supabase } from '../../../services/supabaseClient';
import type { Profile } from '../../../types';
import { getOnboardingFlags } from './featureFlags';
import { emitOnboardingEvent } from './onboardingAnalytics';
import { resolveOnboarding } from './onboardingResolver';
import type {
  OnboardingResolution,
  OnboardingState,
  OnboardingStatePatch,
  OnboardingStep,
} from './onboardingTypes';

const ONBOARDING_TABLE = 'user_onboarding';

const isMissingTableError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  return error.code === '42P01' || /user_onboarding|does not exist/i.test(error.message ?? '');
};

const normalizeState = (row: Record<string, unknown>): OnboardingState => ({
  user_id: String(row['user_id']),
  segment: (row['segment'] as OnboardingState['segment']) ?? null,
  context_type: (row['context_type'] as OnboardingState['context_type']) ?? null,
  context_id: (row['context_id'] as string | null) ?? null,
  current_step: (row['current_step'] as OnboardingStep | null) ?? null,
  completed_steps: Array.isArray(row['completed_steps']) ? row['completed_steps'] as OnboardingStep[] : [],
  core_completed_at: (row['core_completed_at'] as string | null) ?? null,
  first_value_started_at: (row['first_value_started_at'] as string | null) ?? null,
  first_value_completed_at: (row['first_value_completed_at'] as string | null) ?? null,
  metadata: (row['metadata'] && typeof row['metadata'] === 'object' ? row['metadata'] : {}) as Record<string, unknown>,
  created_at: row['created_at'] as string | undefined,
  updated_at: row['updated_at'] as string | undefined,
});

export const getCurrentOnboardingUserId = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
};

export const getOnboardingState = async (userId?: string): Promise<OnboardingState | null> => {
  const resolvedUserId = userId ?? await getCurrentOnboardingUserId();
  if (!resolvedUserId) return null;

  const { data, error } = await supabase
    .from(ONBOARDING_TABLE)
    .select('*')
    .eq('user_id', resolvedUserId)
    .maybeSingle();

  if (error) {
    if (!isMissingTableError(error)) {
      console.warn('[onboarding] failed to fetch state:', error.message);
    }
    return null;
  }

  return data ? normalizeState(data as Record<string, unknown>) : null;
};

export const updateOnboardingState = async (
  patch: OnboardingStatePatch,
  userId?: string,
): Promise<OnboardingState | null> => {
  const resolvedUserId = userId ?? await getCurrentOnboardingUserId();
  if (!resolvedUserId) return null;

  const existing = await getOnboardingState(resolvedUserId);
  const now = new Date().toISOString();
  const nextCompletedSteps = patch.completed_steps ?? existing?.completed_steps ?? [];
  const nextMetadata = {
    ...(existing?.metadata ?? {}),
    ...(patch.metadata ?? {}),
  };

  const payload = {
    user_id: resolvedUserId,
    segment: patch.segment ?? existing?.segment ?? null,
    context_type: patch.context_type ?? existing?.context_type ?? null,
    context_id: patch.context_id ?? existing?.context_id ?? null,
    current_step: patch.current_step ?? existing?.current_step ?? null,
    completed_steps: nextCompletedSteps,
    core_completed_at: patch.core_completed_at ?? existing?.core_completed_at ?? null,
    first_value_started_at: patch.first_value_started_at ?? existing?.first_value_started_at ?? null,
    first_value_completed_at: patch.first_value_completed_at ?? existing?.first_value_completed_at ?? null,
    metadata: nextMetadata,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(ONBOARDING_TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    if (!isMissingTableError(error)) {
      console.warn('[onboarding] failed to update state:', error.message);
    }
    return null;
  }

  return data ? normalizeState(data as Record<string, unknown>) : null;
};

export const markOnboardingStepComplete = async (
  step: OnboardingStep,
  options: {
    nextStep?: OnboardingStep;
    metadata?: Record<string, unknown>;
    firstValueStarted?: boolean;
    firstValueCompleted?: boolean;
    completeCoreFtue?: boolean;
  } = {},
  userId?: string,
): Promise<OnboardingState | null> => {
  const resolvedUserId = userId ?? await getCurrentOnboardingUserId();
  if (!resolvedUserId) return null;

  const existing = await getOnboardingState(resolvedUserId);
  const completedSteps = Array.from(new Set([...(existing?.completed_steps ?? []), step]));
  const now = new Date().toISOString();

  const nextState = await updateOnboardingState({
    completed_steps: completedSteps,
    current_step: options.completeCoreFtue ? 'complete' : options.nextStep ?? existing?.current_step ?? null,
    first_value_started_at: options.firstValueStarted
      ? existing?.first_value_started_at ?? now
      : existing?.first_value_started_at ?? null,
    first_value_completed_at: options.firstValueCompleted
      ? existing?.first_value_completed_at ?? now
      : existing?.first_value_completed_at ?? null,
    core_completed_at: options.completeCoreFtue ? existing?.core_completed_at ?? now : existing?.core_completed_at ?? null,
    metadata: options.metadata,
  }, resolvedUserId);

  await emitOnboardingEvent({
    event: 'ftue_step_completed',
    user_id: resolvedUserId,
    segment: nextState?.segment ?? undefined,
    context_type: nextState?.context_type ?? undefined,
    step,
    metadata: options.metadata,
  });

  return nextState;
};

export const resetOnboarding = async (userId?: string): Promise<void> => {
  const resolvedUserId = userId ?? await getCurrentOnboardingUserId();
  if (!resolvedUserId) return;

  const { error } = await supabase
    .from(ONBOARDING_TABLE)
    .delete()
    .eq('user_id', resolvedUserId);

  if (error && !isMissingTableError(error)) {
    console.warn('[onboarding] failed to reset state:', error.message);
  }

  await emitOnboardingEvent({ event: 'ftue_reset', user_id: resolvedUserId });
};

export const fetchOnboardingProfile = async (userId?: string): Promise<Partial<Profile> | null> => {
  const resolvedUserId = userId ?? await getCurrentOnboardingUserId();
  if (!resolvedUserId) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id, username, grade, batch, role, school_id, school_name, needs_setup, tutorial_completed, account_tier')
    .eq('id', resolvedUserId)
    .maybeSingle();

  if (error) {
    console.warn('[onboarding] failed to fetch profile:', error.message);
    return null;
  }

  return data as Partial<Profile> | null;
};

export const resolveNextOnboardingStep = async (options: {
  userId?: string;
  profile?: Partial<Profile> | null;
  inviteToken?: string | null;
  hasActiveAssignment?: boolean;
} = {}): Promise<OnboardingResolution> => {
  const userId = options.userId ?? await getCurrentOnboardingUserId();
  const [profile, onboardingState] = await Promise.all([
    options.profile !== undefined ? Promise.resolve(options.profile) : fetchOnboardingProfile(userId ?? undefined),
    getOnboardingState(userId ?? undefined),
  ]);

  const resolution = resolveOnboarding({
    profile,
    onboardingState,
    flags: getOnboardingFlags(),
    inviteToken: options.inviteToken,
    hasActiveAssignment: options.hasActiveAssignment,
  });

  if (resolution.eligible && !resolution.isComplete && userId) {
    const savedState = await updateOnboardingState({
      segment: resolution.segment === 'none' ? null : resolution.segment,
      context_type: resolution.context === 'none' ? null : resolution.context,
      context_id: profile?.school_id ?? null,
      current_step: resolution.nextStep,
    }, userId);

    await emitOnboardingEvent({
      event: 'ftue_resolution_created',
      user_id: userId,
      segment: resolution.segment,
      context_type: resolution.context,
      step: resolution.nextStep,
      metadata: { reason: resolution.reason },
    });

    return { ...resolution, state: savedState ?? resolution.state };
  }

  return resolution;
};
