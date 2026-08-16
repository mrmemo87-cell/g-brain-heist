import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const learnerShellSource = readFileSync(
  'components/onboarding/LearnerOnboardingShell.tsx',
  'utf8',
);
const dashboardTourSource = readFileSync(
  'components/onboarding/DashboardTourOverlay.tsx',
  'utf8',
);

test('learner introduction is a short dashboard-led experience', () => {
  assert.match(learnerShellSource, /premium_dashboard_intro_v2/);
  assert.match(learnerShellSource, /\['intent', 'dashboard_reveal'\]/);
  assert.match(learnerShellSource, /Open my dashboard/);
  assert.match(learnerShellSource, /School connection/);
  assert.doesNotMatch(learnerShellSource, /Brains Heist FTUE|Reset onboarding state|Reward unlocked/);
});

test('dashboard tour is accessible and ends with a clear first action', () => {
  assert.match(dashboardTourSource, /role="dialog"/);
  assert.match(dashboardTourSource, /aria-modal="true"/);
  assert.match(dashboardTourSource, /Welcome to your dashboard/);
  assert.match(dashboardTourSource, /Start my first mission/);
});
