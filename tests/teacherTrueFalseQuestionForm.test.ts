import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const teacherPortal = fs.readFileSync(path.resolve(process.cwd(), 'components/TeacherPortal.tsx'), 'utf8');

test('true/false questions use fixed answer choices instead of free text', () => {
  assert.match(teacherPortal, /questionType === 'true_false'/);
  assert.match(teacherPortal, /\(\['True', 'False'\] as const\)\.map/);
  assert.match(teacherPortal, /name="true-false-correct-answer"/);
  assert.match(teacherPortal, /type="radio"/);
  assert.doesNotMatch(teacherPortal, /placeholder="Enter correct answer"/);
});

test('selecting the true/false question type initializes a valid answer', () => {
  assert.match(teacherPortal, /setCorrectAnswer\(nextQuestionType === 'true_false' \? 'True' : ''\)/);
  assert.match(teacherPortal, /setQuestionType\('true_false'\);[\s\S]*?setCorrectAnswer\('True'\)/);
});
