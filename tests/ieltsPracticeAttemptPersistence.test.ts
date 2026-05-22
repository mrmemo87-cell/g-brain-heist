import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildListeningAttemptPayload,
  buildReadingAttemptPayload,
  buildSpeakingAttemptPayload,
  buildWritingAttemptPayload,
  estimateIeltsBandFromPercent,
  normalizeIeltsRawScore,
} from '../src/lib/ieltsPracticeScoring.js';

test('reading attempt persistence payload includes normalized score fields', () => {
  const payload = buildReadingAttemptPayload(
    {
      user_id: 'student-1',
      set_id: 42,
      answers: { 1: 'A', 2: 'B' },
      time_spent_seconds: 600,
      completed_at: '2026-05-18T00:00:00.000Z',
    },
    { rawScore: 3, totalQuestions: 4 },
  );

  assert.deepEqual(payload, {
    user_id: 'student-1',
    set_id: 42,
    answers: { 1: 'A', 2: 'B' },
    time_spent_seconds: 600,
    completed_at: '2026-05-18T00:00:00.000Z',
    raw_score: 3,
    total_questions: 4,
    percent: 75,
    est_band: 6.5,
  });
});

test('listening attempt persistence payload derives numeric percent and displayed estimate defensively', () => {
  const payload = buildListeningAttemptPayload(
    {
      user_id: 'student-1',
      set_id: 7,
      answers: { 10: 'coffee' },
      time_spent_seconds: 1200,
      completed_at: '2026-05-18T00:00:00.000Z',
    },
    { rawScore: 8, totalQuestions: 10, percent: Number.NaN, estBand: null },
  );

  assert.equal(payload['raw_score'], 8);
  assert.equal(payload['total_questions'], 10);
  assert.equal(payload['percent'], 80);
  assert.equal(payload['est_band'], estimateIeltsBandFromPercent(80));
});

test('writing and speaking payload builders persist available rubric bands without inventing grades', () => {
  assert.deepEqual(
    buildWritingAttemptPayload({ user_id: 'student-1', task_id: 1, answer_text: 'Essay', word_count: 250 }, { bandOverall: 6.74 }),
    { review_status: 'pending', user_id: 'student-1', task_id: 1, answer_text: 'Essay', word_count: 250, band_overall: 6.5 },
  );
  assert.deepEqual(
    buildSpeakingAttemptPayload({ user_id: 'student-1', task_id: 2, audio_url: 'speaking/student-1/2.webm', duration_seconds: 85 }, { bandOverall: 7.26 }),
    { user_id: 'student-1', task_id: 2, audio_url: 'speaking/student-1/2.webm', duration_seconds: 85, band_overall: 7.5 },
  );
  assert.equal(buildWritingAttemptPayload({ user_id: 'student-1', task_id: 1 }, { bandOverall: Number.NaN })['review_status'], 'pending');
  assert.equal('band_overall' in buildWritingAttemptPayload({ user_id: 'student-1', task_id: 1 }, { bandOverall: Number.NaN }), false);
  assert.equal('band_overall' in buildSpeakingAttemptPayload({ user_id: 'student-1', task_id: 2 }), false);
});

test('readiness engine compatibility fields are populated from raw-score normalization', () => {
  const normalized = normalizeIeltsRawScore({ rawScore: 27, totalQuestions: 40 });

  assert.deepEqual(normalized, {
    raw_score: 27,
    total_questions: 40,
    percent: 67.5,
    est_band: 5.5,
  });
});


test('listening practice renders optional set-level instructions and example metadata without answer-key coupling', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/ListeningPractice.tsx'), 'utf8');

  assert.match(source, /listeningSet\.instructions\?\.trim\(\)/, 'listening flow should read set-level instructions when present');
  assert.match(source, /listeningSet\.example_prompt\?\.trim\(\)/, 'listening flow should read optional example prompt metadata');
  assert.match(source, /listeningSet\.example_answer\?\.trim\(\)/, 'listening flow should read optional example answer metadata');
  assert.match(source, /listeningSet\.section_label\?\.trim\(\)/, 'listening flow should read optional section labels');
  assert.match(source, /listeningSet\.question_range_label\?\.trim\(\)/, 'listening flow should read optional question range labels');
  assert.doesNotMatch(source, /questionNumber\s*=\s*0|Example\s*\d+/, 'example metadata must not be treated as a numbered question');
});

test('practice attempt persistence does not expose answer_key or depend on legacy IELTS admin checks', () => {
  const files = [
    'src/lib/ieltsPracticeScoring.ts',
    'services/ieltsService.ts',
    'src/pages/ielts/ReadingPractice.tsx',
    'src/pages/ielts/ListeningPractice.tsx',
    'src/pages/ielts/WritingPractice.tsx',
    'src/pages/ielts/SpeakingPractice.tsx',
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.doesNotMatch(source, /answer_key/i, `${file} must not expose answer_key`);
    assert.doesNotMatch(source, /rpc_is_ielts_admin|ielts_teachers|is_ielts_admin/i, `${file} must not use legacy IELTS admin permissions`);
  }
});

test('assignment-mode completion remains after attempt insert succeeds', () => {
  const flows = [
    { file: 'src/pages/ielts/ReadingPractice.tsx', skill: 'reading' },
    { file: 'src/pages/ielts/ListeningPractice.tsx', skill: 'listening' },
    { file: 'src/pages/ielts/WritingPractice.tsx', skill: 'writing' },
    { file: 'src/pages/ielts/SpeakingPractice.tsx', skill: 'speaking' },
  ];

  for (const flow of flows) {
    const source = fs.readFileSync(path.join(process.cwd(), flow.file), 'utf8');
    assert.match(source, /rpcIeltsPracticeMarkItemCompleted/, `${flow.skill} flow must still mark assignment items complete`);
    assert.match(source, new RegExp(`practiceAttemptType:\\s*'${flow.skill}'`), `${flow.skill} completion must use the correct attempt type`);
    assert.match(source, /practiceAttemptId:\s*[^\n]+\?\.id \?\? null/, `${flow.skill} completion must still pass the persisted attempt id`);
  }
});

test('speaking submit upload preserves mime/content type and persists duration_seconds', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/pages/ielts/SpeakingPractice.tsx'), 'utf8');

  assert.match(source, /contentType:\s*blobType/, 'speaking upload must preserve blob MIME type');
  assert.match(source, /duration_seconds:\s*recordingDuration > 0 \? recordingDuration : null/, 'speaking submit must persist measured duration_seconds when available');
});
