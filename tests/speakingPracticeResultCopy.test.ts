import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('speaking submit button and completion path require minimum duration', () => {
  const speakingPractice = read('src/pages/ielts/SpeakingPractice.tsx');

  assert.match(speakingPractice, /const isSubmissionEligible = Boolean\(audioBlob\) && recordingDuration >= MIN_RECORDING_SECONDS;/, 'submit eligibility must require recording + minimum duration');
  assert.match(speakingPractice, /disabled=\{submitMutation\.isPending \|\| !isSubmissionEligible\}/, 'submit button must stay disabled below minimum');
  assert.match(speakingPractice, /if \(recordingDuration >= MIN_RECORDING_SECONDS\) \{[\s\S]*rpcIeltsPracticeMarkItemCompleted/, 'assignment completion must be gated by minimum duration');
});

test('speaking result copy is student-safe and avoids unsupported notification claims', () => {
  const speakingPractice = read('src/pages/ielts/SpeakingPractice.tsx');

  assert.match(speakingPractice, /Speaking submitted/, 'result heading must use neutral speaking submitted copy');
  assert.match(speakingPractice, /Your recording was saved\./, 'result copy must confirm save only');
  assert.match(speakingPractice, /Teacher feedback will appear here after finalization\./, 'result copy must show finalized-only feedback message');
  assert.doesNotMatch(speakingPractice, /certified IELTS examiner/i, 'must not claim certified examiner review');
  assert.doesNotMatch(speakingPractice, /24 hours/i, 'must not promise 24-hour turnaround');
  assert.doesNotMatch(speakingPractice, /Notification Preferences/i, 'must not include notification preferences block');
  assert.doesNotMatch(speakingPractice, /SMS updates|Send SMS notification|alternate email/i, 'must not include email/sms claims in speaking result path');
});

test('speaking review link is hidden until finalized and preview errors are graceful', () => {
  const speakingPractice = read('src/pages/ielts/SpeakingPractice.tsx');

  assert.match(speakingPractice, /lastAttemptId && hasFinalizedReview/, 'review link must require finalized review');
  assert.match(speakingPractice, /Your recording was saved, but this browser could not preview it here\. You can still submit\./, 'preview error message must be explicit and non-blocking');
  assert.match(speakingPractice, /onError=\{\(\) => \{[\s\S]*setCanPreviewAudio\(false\);/, 'audio playback errors must be handled without crashing');
});
