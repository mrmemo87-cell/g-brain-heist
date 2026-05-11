import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSetupCompletionOnboardingSeed } from '../src/features/onboarding/setupCompletion.js';
import { resolveOnboarding } from '../src/features/onboarding/onboardingResolver.js';
import { isActiveLearnerFtue } from '../src/features/onboarding/ftueTakeover.js';
import type { OnboardingFlags } from '../src/features/onboarding/onboardingTypes.js';

const flags: OnboardingFlags = {
  ftue_enabled: true,
  progressive_reveal_enabled: true,
  byte_ftue_enabled: true,
  teacher_ftue_enabled: false,
  admin_ftue_enabled: false,
};

test('student selection seeds incomplete learner onboarding', () => {
  const seed = buildSetupCompletionOnboardingSeed({
    role: 'student',
    path: 'school',
    schoolId: 'school-1',
    schoolName: 'Cipher School',
  });

  assert.deepEqual(seed, {
    segment: 'school_student',
    context_type: 'school',
    context_id: 'school-1',
    current_step: 'intent',
    completed_steps: [],
    core_completed_at: null,
    metadata: {
      setup_path: 'school',
      school_name: 'Cipher School',
    },
  });
  assert.equal(seed?.completed_steps?.includes('complete'), false);
});

test('student setup completion routes to learner FTUE', () => {
  const seed = buildSetupCompletionOnboardingSeed({
    role: 'student',
    path: 'individual',
  });

  const resolution = resolveOnboarding({
    flags,
    profile: {
      id: 'student-setup',
      username: 'student-setup',
      role: 'student',
      school_id: null,
      needs_setup: false,
      tutorial_completed: false,
    },
    onboardingState: {
      user_id: 'student-setup',
      segment: seed?.segment ?? null,
      context_type: seed?.context_type ?? null,
      context_id: seed?.context_id ?? null,
      current_step: seed?.current_step ?? null,
      completed_steps: seed?.completed_steps ?? [],
      core_completed_at: seed?.core_completed_at ?? null,
      first_value_started_at: null,
      first_value_completed_at: null,
      metadata: seed?.metadata ?? {},
    },
  });

  assert.equal(resolution.segment, 'solo_learner');
  assert.equal(resolution.eligible, true);
  assert.equal(resolution.isComplete, false);
  assert.equal(resolution.nextStep, 'intent');
  assert.equal(isActiveLearnerFtue(resolution), true);
});

test('teacher selection bypasses learner FTUE', () => {
  const seed = buildSetupCompletionOnboardingSeed({
    role: 'teacher',
    path: 'school',
    schoolId: 'school-1',
  });

  const resolution = resolveOnboarding({
    flags,
    profile: {
      id: 'teacher-setup',
      username: 'teacher-setup',
      role: 'teacher',
      school_id: 'school-1',
      needs_setup: false,
      tutorial_completed: false,
    },
    onboardingState: null,
  });

  assert.equal(seed, null);
  assert.equal(isActiveLearnerFtue(resolution), false);
  assert.equal(resolution.eligible, false);
});
