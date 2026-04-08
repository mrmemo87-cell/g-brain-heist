import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTextFingerprint, evaluateAnchorTrust } from '../src/pages/writing/WritingHub.js';
import {
  __resetWritingIntegrationStoreForTests,
  getStudentWritingHubSnapshot,
  persistInitialWritingRichFeedback,
  submitInitialWritingAssessment,
} from '../src/lib/brains_heist/writingIntegrationService.js';

const prompt = `Write a response that includes:\n- describe the event\n- explain why it mattered\n- give one suggestion`;

const submissionText = 'The event was sports day. It mattered because teamwork improved. I suggest more team rounds.';
const matchingFingerprint = buildTextFingerprint(submissionText);

test('fingerprint helper matches evaluateAnchorTrust local fingerprint output', () => {
  const trust = evaluateAnchorTrust(submissionText, null);
  assert.strictEqual(trust.localFingerprint, matchingFingerprint);
});

test('matching fingerprint with valid anchors is trusted', () => {
  assert.ok(matchingFingerprint);
  const trust = evaluateAnchorTrust(submissionText, {
    text_fingerprint: matchingFingerprint!,
    highlights: [{ start_char: 0, end_char: 9, polarity: 'strong' }],
  });
  assert.strictEqual(trust.mode, 'trusted');
});

test('missing fingerprint always falls back even when anchors exist', () => {
  const trust = evaluateAnchorTrust(submissionText, {
    highlights: [{ start_char: 0, end_char: 9, polarity: 'strong' }],
  });
  assert.strictEqual(trust.mode, 'missing_fingerprint');
});

test('mismatched fingerprint blocks anchors', () => {
  const trust = evaluateAnchorTrust(submissionText, {
    text_fingerprint: 'fp_deadbeef',
    highlights: [{ start_char: 0, end_char: 9, polarity: 'strong' }],
  });
  assert.strictEqual(trust.mode, 'stale_feedback');
});

test('malformed highlights are ignored safely', () => {
  assert.ok(matchingFingerprint);
  const trust = evaluateAnchorTrust(submissionText, {
    text_fingerprint: matchingFingerprint!,
    highlights: [{ start_char: -1, end_char: 9999, polarity: 'strong' }],
  });
  assert.strictEqual(trust.mode, 'no_anchors');
});

test('legacy rich feedback without fingerprint is persisted in guidance-only compatibility mode', () => {
  __resetWritingIntegrationStoreForTests();
  submitInitialWritingAssessment({
    student_id: 'anchor-legacy',
    grade: 8,
    genre: 'article',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: submissionText,
  });

  const persist = persistInitialWritingRichFeedback({
    student_id: 'anchor-legacy',
    genre: 'article',
    rich_feedback: {
      what_is_missing: ['Add one detail.'],
      highlights: [{ start_char: 0, end_char: 10, polarity: 'strong' }],
      repair_steps: [{ title: 'Fix intro' }],
    },
  });

  assert.strictEqual(persist.ok, true);
  const snapshot = getStudentWritingHubSnapshot('anchor-legacy', 'article');
  assert.strictEqual(snapshot.ok, true);
  const feedback = snapshot.data!.first_attempt_rich_feedback as Record<string, unknown>;
  assert.ok(feedback);
  assert.strictEqual('text_fingerprint' in feedback, false);
  assert.strictEqual('highlights' in feedback, false);
  assert.strictEqual('repair_steps' in feedback, false);
  assert.deepStrictEqual(feedback['what_is_missing'], ['Add one detail.']);
});
