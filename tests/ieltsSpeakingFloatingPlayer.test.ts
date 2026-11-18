import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  SPEAKING_PRONUNCIATION_PLACEHOLDER,
  pronunciationDraftFromListening,
  validateSpeakingFeedback,
  emptySpeakingFeedback,
  type SpeakingClip,
} from '../services/ieltsSpeakingPilot';

const page = readFileSync('src/pages/ielts/IeltsSpeakingPilot.tsx', 'utf8');
const dock = readFileSync('src/components/ielts/SpeakingAudioDock.tsx', 'utf8');
const css = readFileSync('src/styles/ielts-speaking-pilot.css', 'utf8');
const visualBible = readFileSync('docs/ielts/IELTS_VISUAL_UX_BIBLE.md', 'utf8');

const clip = (id: string, part: number, duration = 120): SpeakingClip => ({
  id, part, path: `${id}.wav`, sha256: 'x', duration_seconds: duration, interrupted: false, mime_type: 'audio/wav',
});
const clips = [clip('c1', 1), clip('c2', 2, 150), clip('c3', 3)];

test('pronunciation draft uses only words the listening pass heard', () => {
  const draft = pronunciationDraftFromListening([
    { clip_id: 'c3', part: 3, pronunciation: { assessed: true, words: [{ word: 'researches', tip: "Say 'ree-SER-ches'." }] } },
    { clip_id: 'c2', part: 2, pronunciation: { assessed: true, words: [{ word: 'education', tip: 'Stress the third syllable: ed-u-CA-tion.' }, { word: 'Education', tip: 'duplicate' }] } },
    { clip_id: 'c1', part: 1, pronunciation: { assessed: false, words: [{ word: 'ignored', tip: 'not assessed clips never count' }] } },
  ], clips);
  assert.ok(draft);
  assert.equal(draft.status, 'developing');
  assert.match(draft.comment, /^In your recording, these words were not pronounced clearly: “education” — Stress the third syllable: ed-u-CA-tion\. “researches” — Say 'ree-SER-ches'\./);
  assert.doesNotMatch(draft.comment, /ignored|duplicate|band/i);
  // The audio span is the whole recording the first word was heard in, for the teacher to verify.
  assert.deepEqual(draft.evidence, [{ clip_id: 'c2', start_seconds: 0, end_seconds: 150 }]);
  const feedback = emptySpeakingFeedback();
  feedback.next_step = 'Practise the listed words aloud every day.';
  for (const key of Object.keys(feedback.observations) as Array<keyof typeof feedback.observations>) {
    feedback.observations[key] = { status: 'insufficient_evidence', comment: 'Not enough speech was recorded to judge this.', evidence: [] };
  }
  feedback.observations.pronunciation = draft;
  assert.doesNotThrow(() => validateSpeakingFeedback(feedback, clips));
  assert.equal(SPEAKING_PRONUNCIATION_PLACEHOLDER.test(draft.comment), false);
});

test('no draft is invented when the listening pass heard nothing or did not run', () => {
  assert.equal(pronunciationDraftFromListening([], clips), null);
  assert.equal(pronunciationDraftFromListening([{ clip_id: 'c2', part: 2, pronunciation: { assessed: true, words: [] } }], clips), null);
  assert.equal(pronunciationDraftFromListening([{ clip_id: 'c2', part: 2, pronunciation: { assessed: false, words: [{ word: 'x', tip: 'y' }] } }], clips), null);
  assert.equal(pronunciationDraftFromListening([{ clip_id: 'gone', part: 2, pronunciation: { assessed: true, words: [{ word: 'x', tip: 'y' }] } }], clips), null);
});

test('one long comment stays inside the 900-character limit and lists at most five words', () => {
  const words = Array.from({ length: 9 }, (_, i) => ({ word: `word${i}`, tip: 'Say it slowly and stress the first part clearly. '.repeat(4) }));
  const draft = pronunciationDraftFromListening([{ clip_id: 'c2', part: 2, pronunciation: { assessed: true, words } }], clips);
  assert.ok(draft);
  assert.ok(draft.comment.length <= 900);
  assert.doesNotMatch(draft.comment, /word5/);
});

test('the placeholder still cannot be shared and the teacher still confirms', () => {
  assert.match(page, /SPEAKING_PRONUNCIATION_PLACEHOLDER\.test\(o\.comment\)\)\s+gaps\.push\(/);
  assert.match(page, /the AI listening check found no words to report, so this comment is yours/);
  assert.match(page, /pronunciationDraftFromListening\(extras\.analysis, session\.clips\)/);
  // Filling the draft un-ticks the teacher's confirmation, exactly like the AI draft does.
  assert.match(page, /observations: \{ \.\.\.current\.observations, pronunciation: heard \} \}[\s\S]{0,120}setConfirmed\(false\);/);
});

test('floating player controls the clip audio, never autoplays and stays accessible', () => {
  assert.match(page, /registerSpeakingAudio\(audio\.current, `Part \$\{clip\.part\}`\)/);
  assert.match(page, /<SpeakingAudioDock \/>/);
  assert.match(dock, /element\.addEventListener\('play', onPlay\)/);
  assert.match(dock, /if \(active && active\.element !== element\) active\.element\.pause\(\)/);
  assert.doesNotMatch(dock, /autoplay|autoPlay/);
  assert.doesNotMatch(dock, /new Audio\(/);
  for (const label of ['Back 5 seconds', 'Forward 5 seconds', 'Close player', 'Change speed']) assert.match(dock, new RegExp(label));
  assert.match(css, /\.sp-dock button \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
  assert.match(css, /\.sp-page:has\(\.sp-dock\) \{\s*padding-bottom:/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(visualBible, /\*\*Version:\*\* 1\.13\.0/);
  assert.match(visualBible, /Floating player and listening-based Pronunciation draft \(1\.13\.0/);
});
