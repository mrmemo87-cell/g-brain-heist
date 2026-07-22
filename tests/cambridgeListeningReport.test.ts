import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAMBRIDGE_LISTENING_TEST_1_ANSWER_KEY,
  CAMBRIDGE_LISTENING_TEST_1_QUESTIONS,
  CAMBRIDGE_LISTENING_TEST_1_SECTIONS,
  isCambridgeAnswerCorrect,
  parseCambridgeResponses,
} from '../components/cambridgeListeningReview.js';

const samStewartSubmission = {
  responses: {
    1: 'A', 2: 'A', 3: 'B', 4: 'B', 5: 'B',
    6: 'B', 7: 'A', 8: 'C', 9: 'B', 10: 'C',
    11: 'B', 12: 'B', 13: 'A', 14: 'B', 15: 'B',
    16: 'B', 17: 'C', 18: 'A', 19: 'B', 20: 'B',
    21: '', 22: '', 23: '', 24: '', 25: '',
    26: 'A', 27: 'B', 28: 'B', 29: 'B', 30: 'C',
  },
  quiz_version: 'listening-1-stage9-v3',
};

test('Listening Test 1 report reads nested responses and matches the stored 6/30 result', () => {
  const responses = parseCambridgeResponses(samStewartSubmission);
  let correct = 0;
  let unanswered = 0;

  Object.entries(CAMBRIDGE_LISTENING_TEST_1_ANSWER_KEY).forEach(([question, expected]) => {
    const response = responses[Number(question)] ?? '';
    if (!response) unanswered += 1;
    if (isCambridgeAnswerCorrect(response, expected)) correct += 1;
  });

  assert.equal(Object.keys(responses).length, 30);
  assert.equal(correct, 6);
  assert.equal(unanswered, 5);
  assert.equal(30 - correct - unanswered, 19);
});

test('Listening Test 1 teacher sections cover each question exactly once', () => {
  const questions = CAMBRIDGE_LISTENING_TEST_1_SECTIONS.flatMap(section => section.questions);
  assert.deepEqual(questions, Array.from({ length: 30 }, (_, index) => index + 1));
  assert.equal(new Set(questions).size, 30);
  assert.equal(CAMBRIDGE_LISTENING_TEST_1_QUESTIONS.length, 30);
  assert.equal(CAMBRIDGE_LISTENING_TEST_1_QUESTIONS[20].number, 21);
  assert.match(CAMBRIDGE_LISTENING_TEST_1_QUESTIONS[20].prompt, /last bus/i);
});

test('Listening Test 1 released review waits for server state before ExamGuard starts', () => {
  const paper = readFileSync('public/cambridge-tests/English stage 9/cambridge_listening_test_1.html', 'utf8');
  assert.match(paper, /const existingSubmission = await checkPreviousSubmission\(\)/);
  assert.match(paper, /if \(existingSubmission \|\| isReviewMode\(\)\)[\s\S]*closeAntiCheatModal\(\)[\s\S]*return/);
  assert.match(paper, /if \(hasSubmitted \|\| isReviewMode\(\) \|\| typeof window\.ExamGuard === 'undefined'\) return/);
  assert.match(paper, /testRules[\s\S]*style\.display = 'none'/);
  assert.match(paper, /testAudioPanel[\s\S]*style\.display = 'none'/);
});

test('teacher report distinguishes attempted, incorrect, and unanswered evidence', () => {
  const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
  assert.match(portal, /Attempted/);
  assert.match(portal, /Teaching Focus/);
  assert.match(portal, /incorrect responses for misconceptions/);
  assert.match(portal, /completion or time-management evidence/);
  assert.match(portal, /correct ·[\s\S]*attempted/);
});
