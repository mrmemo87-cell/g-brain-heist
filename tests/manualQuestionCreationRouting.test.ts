import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const portal = readFileSync('components/TeacherPortal.tsx', 'utf8');
const questionBank = readFileSync('components/teacher/QuestionBank.tsx', 'utf8');

test('manual question creation remains distinct from PDF batch creation', () => {
  assert.match(portal, /const openMyPoolQuestionForm[\s\S]*setView\('create-question'\)/);
  assert.match(portal, /const openQuestionBatchWorkspace[\s\S]*setView\('question-batch'\)/);
  assert.match(portal, /onCreateQuestion=\{openMyPoolQuestionForm\}/);
  assert.match(portal, /onCreateQuestionBatch=\{openQuestionBatchWorkspace\}/);
  assert.match(questionBank, />Add Question<\/button>/);
  assert.match(questionBank, />Add Question Batch<\/button>/);
  assert.match(questionBank, />Upload question PDF<\/button>/);
});

test('geometry Use in Question continues into the manual question builder', () => {
  assert.match(portal, /onUseInQuestion=\{\(asset\) => \{[\s\S]*openMyPoolQuestionForm\('Maths', asset\.topic \|\| 'Geometry'\)/);
});
