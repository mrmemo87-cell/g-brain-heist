import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatIeltsCountdown,
  getIeltsAttemptOperationalLabel,
  resolveIeltsExamLifecycleMeta,
  resolveIeltsExamLifecycleState,
} from '../services/ieltsExamModeUx.js';

test('IELTS exam lifecycle labels cover pilot states with human-friendly labels', () => {
  const now = Date.parse('2026-05-18T10:00:00.000Z');
  assert.equal(resolveIeltsExamLifecycleMeta('draft', null, null, now).label, 'Draft');
  assert.equal(resolveIeltsExamLifecycleMeta('scheduled', '2026-05-18T11:00:00.000Z', '2026-05-18T13:00:00.000Z', now).label, 'Scheduled');
  assert.equal(resolveIeltsExamLifecycleMeta('live', '2026-05-18T09:00:00.000Z', '2026-05-18T13:00:00.000Z', now).label, 'Live now');
  assert.equal(resolveIeltsExamLifecycleMeta('paused', '2026-05-18T09:00:00.000Z', '2026-05-18T13:00:00.000Z', now).label, 'Paused');
  assert.equal(resolveIeltsExamLifecycleMeta('ended', '2026-05-18T08:00:00.000Z', '2026-05-18T09:00:00.000Z', now).label, 'Ended');
  assert.equal(resolveIeltsExamLifecycleMeta('archived', null, null, now).label, 'Archived');
});

test('IELTS lifecycle resolves live, paused, scheduled and ended states from time window', () => {
  const now = Date.parse('2026-05-18T10:00:00.000Z');
  assert.equal(resolveIeltsExamLifecycleState('scheduled', '2026-05-18T09:00:00.000Z', '2026-05-18T11:00:00.000Z', now), 'live_now');
  assert.equal(resolveIeltsExamLifecycleState('paused', '2026-05-18T09:00:00.000Z', '2026-05-18T11:00:00.000Z', now), 'paused');
  assert.equal(resolveIeltsExamLifecycleState('scheduled', '2026-05-18T11:00:00.000Z', '2026-05-18T12:00:00.000Z', now), 'scheduled');
  assert.equal(resolveIeltsExamLifecycleState('live', '2026-05-18T08:00:00.000Z', '2026-05-18T09:59:59.000Z', now), 'ended');
});

test('IELTS waiting countdown renders locally understandable durations', () => {
  assert.equal(formatIeltsCountdown(65), '1:05');
  assert.equal(formatIeltsCountdown(3661), '1:01:01');
  assert.equal(formatIeltsCountdown(90061), '1d 1h 1m');
});

test('IELTS monitor labels emphasize not started, active, submitted and connection issue', () => {
  assert.equal(getIeltsAttemptOperationalLabel('assigned'), 'Not started');
  assert.equal(getIeltsAttemptOperationalLabel('in_progress'), 'Active');
  assert.equal(getIeltsAttemptOperationalLabel('submitted'), 'Submitted');
  assert.equal(getIeltsAttemptOperationalLabel('in_progress', true), 'Possible connection issue');
});

test('IELTS Exam Mode UI surfaces start-exam backend errors instead of silently resetting', () => {
  const source = readFileSync('src/pages/ielts/IeltsExamMode.tsx', 'utf8');
  assert.match(source, /Start exam failed:/, 'start failure must include backend reason prefix');
  assert.match(source, /alert=\{error\}/, 'start card must render the captured failure message');
  assert.match(source, /if \(isStarting \|\| !whoami\?\.assignment_id\) return;/, 'start action must be retry-safe against double clicks');
});

test('IELTS Exam Mode pilot UI does not expose answer_key or depend on legacy IELTS admin checks', () => {
  const files = [
    'src/pages/ielts/IeltsExamMode.tsx',
    'src/pages/ielts/IeltsExamMonitor.tsx',
    'src/pages/ielts/IeltsExamManager.tsx',
    'services/ieltsExamModeUx.ts',
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (file !== 'src/pages/ielts/IeltsExamManager.tsx') {
      assert.doesNotMatch(source, /answer_key/i, `${file} must not expose answer_key in student or monitor UI`);
    }
    assert.doesNotMatch(source, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, `${file} must not use legacy IELTS admin permissions`);
  }
});
