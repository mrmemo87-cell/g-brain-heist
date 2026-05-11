import type { OnboardingStatePatch } from './onboardingTypes';

export type SetupCompletionPath = 'school' | 'individual' | null;
export type SetupCompletionRole = 'student' | 'teacher';

export interface SetupCompletionSeedInput {
  role: SetupCompletionRole;
  path: SetupCompletionPath;
  schoolId?: string | null;
  schoolName?: string | null;
}

/**
 * Returns the exact Phase 1A learner onboarding seed that should be written when
 * SetupWizard completes. Non-learner roles intentionally return null so teacher
 * and admin routes cannot be accidentally forced into the learner FTUE.
 */
export const buildSetupCompletionOnboardingSeed = ({
  role,
  path,
  schoolId = null,
  schoolName = null,
}: SetupCompletionSeedInput): OnboardingStatePatch | null => {
  if (role !== 'student') return null;

  const isSchoolPath = path === 'school';

  return {
    segment: isSchoolPath ? 'school_student' : 'solo_learner',
    context_type: isSchoolPath ? 'school' : 'solo',
    context_id: isSchoolPath ? schoolId : null,
    current_step: 'intent',
    completed_steps: [],
    core_completed_at: null,
    metadata: {
      setup_path: path,
      school_name: isSchoolPath ? schoolName ?? undefined : undefined,
    },
  };
};
