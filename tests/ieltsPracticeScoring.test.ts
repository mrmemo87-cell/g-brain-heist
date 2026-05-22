import test from 'node:test';
import assert from 'node:assert/strict';
import { doesAnswerMatchCorrectAnswer } from '../src/lib/ieltsPracticeScoring.js';

test('listening grading matches lowercase typed answer against JSON array string', () => {
  assert.equal(doesAnswerMatchCorrectAnswer('september', '["September","september"]'), true);
});

test('listening grading trims whitespace around student answer', () => {
  assert.equal(doesAnswerMatchCorrectAnswer(' September ', '["September"]'), true);
});

test('listening grading rejects wrong answer', () => {
  assert.equal(doesAnswerMatchCorrectAnswer('october', '["September","september"]'), false);
});

test('listening grading rejects empty answer', () => {
  assert.equal(doesAnswerMatchCorrectAnswer('   ', '["September","september"]'), false);
});
