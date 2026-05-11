import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOnboarding } from '../src/features/onboarding/onboardingResolver.js';
import type { OnboardingFlags, OnboardingResolverInput } from '../src/features/onboarding/onboardingTypes.js';

const flags: OnboardingFlags = {
  ftue_enabled: true,
  progressive_reveal_enabled: true,
  byte_ftue_enabled: true,
  teacher_ftue_enabled: true,
  admin_ftue_enabled: true,
};

const resolve = (input: Partial<OnboardingResolverInput>) => resolveOnboarding({
  profile: null,
  onboardingState: null,
  flags,
  ...input,
});

test('resolver is disabled and complete when ftue flag is off', () => {
  const resolution = resolve({ flags: { ...flags, ftue_enabled: false } });
  assert.equal(resolution.eligible, false);
  assert.equal(resolution.isComplete, true);
  assert.equal(resolution.featureRevealLevel, 'disabled');
  assert.deepEqual(resolution.gates, []);
});

test('school student with missing placement routes to placement and gates advanced features', () => {
  const resolution = resolve({
    profile: {
      id: 'u1',
      username: 'student',
      role: 'student',
      school_id: 'school-1',
      grade: null,
      batch: null,
      needs_setup: true,
    },
  });

  assert.equal(resolution.segment, 'school_student');
  assert.equal(resolution.context, 'school');
  assert.equal(resolution.nextStep, 'placement');
  assert.equal(resolution.featureRevealLevel, 'ftue_active');
  assert.ok(resolution.gates.includes('pvp'));
  assert.ok(resolution.gates.includes('upgrade_prompts'));
});

test('solo learner without selected goal routes to goal step', () => {
  const resolution = resolve({
    profile: {
      id: 'u2',
      username: 'solo',
      role: 'student',
      school_id: null,
      needs_setup: true,
    },
  });

  assert.equal(resolution.segment, 'solo_learner');
  assert.equal(resolution.context, 'solo');
  assert.equal(resolution.nextStep, 'goal');
  assert.deepEqual(resolution.requiredData, ['goal']);
});

test('teacher ftue respects teacher feature flag', () => {
  const disabled = resolve({
    flags: { ...flags, teacher_ftue_enabled: false },
    profile: { id: 't1', username: 'teacher', role: 'teacher', school_id: null, needs_setup: true },
  });
  assert.equal(disabled.eligible, false);
  assert.equal(disabled.reason, 'teacher_ftue_disabled');

  const enabled = resolve({
    profile: { id: 't1', username: 'teacher', role: 'teacher', school_id: null, needs_setup: true },
  });
  assert.equal(enabled.segment, 'teacher');
  assert.equal(enabled.context, 'teacher_trial');
  assert.equal(enabled.nextStep, 'teacher_context');
});

test('legacy settled profiles are treated as complete to avoid onboarding loops', () => {
  const resolution = resolve({
    profile: {
      id: 'existing',
      username: 'existing-user',
      role: 'student',
      school_id: null,
      needs_setup: false,
    },
  });

  assert.equal(resolution.isComplete, true);
  assert.equal(resolution.nextStep, 'complete');
  assert.equal(resolution.featureRevealLevel, 'normal_dashboard');
});
