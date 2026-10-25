import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOnboarding } from '../src/features/onboarding/onboardingResolver.js';
import { isActiveLearnerFtue, shouldSuppressLegacyTutorialForFtue } from '../src/features/onboarding/ftueTakeover.js';
import { shouldShowDashboardTour } from '../src/features/onboarding/dashboardTour.js';
import type { OnboardingFlags, OnboardingState } from '../src/features/onboarding/onboardingTypes.js';

const flags: OnboardingFlags = {
  ftue_enabled: true, progressive_reveal_enabled: true, byte_ftue_enabled: true,
  teacher_ftue_enabled: false, admin_ftue_enabled: false,
};

// Exercise all three UI gates together, including returning students whose
// intro/tour state was saved before direct dashboard entry was introduced.
for (const schoolId of [null, 'school-1']) {
  for (const savedStep of ['intent', 'dashboard_reveal', 'complete'] as const) {
    for (const ftueEnabled of [true, false]) {
      test(`registered ${schoolId ? 'school' : 'solo'} student bypasses ${savedStep} and tours (FTUE ${ftueEnabled})`, () => {
        const profile = { id: 'student-1', role: 'student' as const, school_id: schoolId,
          needs_setup: false, tutorial_completed: false };
        const state: OnboardingState = {
          user_id: profile.id, segment: schoolId ? 'school_student' : 'solo_learner',
          context_type: schoolId ? 'school' : 'solo', context_id: schoolId,
          current_step: savedStep, completed_steps: [],
          core_completed_at: savedStep === 'complete' ? '2026-10-25T00:00:00Z' : null,
          first_value_started_at: null, first_value_completed_at: null,
          metadata: { dashboard_tour: { status: 'active' } },
        };
        const input = { profile, onboardingState: state, flags: { ...flags, ftue_enabled: ftueEnabled } };
        const resolution = resolveOnboarding(input);
        assert.equal(resolution.isComplete, true);
        assert.equal(resolution.nextStep, 'complete');
        assert.equal(isActiveLearnerFtue(resolution), false);
        assert.deepEqual(resolution.gates, []);
        assert.equal(shouldShowDashboardTour({ profile, state, ftueEnabled }), false);
        assert.equal(shouldSuppressLegacyTutorialForFtue(input), true);
        // Entry policy does not invent completed learning or tour evidence.
        assert.deepEqual(state.completed_steps, []);
        assert.equal(state.first_value_completed_at, null);
      });
    }
  }
}

test('required student registration still needs completion', () => {
  const resolution = resolveOnboarding({
    flags, onboardingState: null,
    profile: { id: 'new-student', role: 'student', school_id: 'school-1', needs_setup: true },
  });
  assert.equal(resolution.isComplete, false);
});
