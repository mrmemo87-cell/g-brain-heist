import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldLaunchFtueTrainingMission } from '../src/features/onboarding/trainingMission.js';
import type { OnboardingState } from '../src/features/onboarding/onboardingTypes.js';

const learnerState = (metadata: Record<string, unknown> = {}): OnboardingState => ({
  user_id: 'learner-1',
  segment: 'solo_learner',
  context_type: 'solo',
  context_id: null,
  current_step: 'complete',
  completed_steps: ['intent', 'school_confirm', 'goal', 'mission_brief', 'reward_reveal'],
  core_completed_at: '2026-05-12T00:00:00.000Z',
  first_value_started_at: null,
  first_value_completed_at: null,
  metadata,
});

test('FTUE training launches after the dashboard first mission CTA', () => {
  assert.equal(shouldLaunchFtueTrainingMission(learnerState({
    dashboard_tour: {
      status: 'completed',
      current_step: 'first_mission',
      first_mission_cta_clicked: true,
    },
  })), true);
});

test('FTUE training resumes when it was already started', () => {
  assert.equal(shouldLaunchFtueTrainingMission(learnerState({
    ftue_training_mission: {
      id: 'first_signal',
      status: 'started',
      started_at: '2026-05-12T00:00:00.000Z',
      last_question_index: 1,
    },
  })), true);
});

test('FTUE training does not relaunch after completion or skip', () => {
  assert.equal(shouldLaunchFtueTrainingMission(learnerState({
    dashboard_tour: { first_mission_cta_clicked: true },
    ftue_training_mission: { id: 'first_signal', status: 'completed' },
  })), false);

  assert.equal(shouldLaunchFtueTrainingMission(learnerState({
    dashboard_tour: { first_mission_cta_clicked: true },
    ftue_training_mission: { id: 'first_signal', status: 'skipped' },
  })), false);
});
