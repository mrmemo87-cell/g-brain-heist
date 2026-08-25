import test from 'node:test';
import assert from 'node:assert/strict';
import type { TeacherQuestion } from '../types';
import { isBrainsHeistPoolQuestion, isMyPoolQuestion, isSchoolPoolQuestion } from '../components/teacher/questionPool.js';

const question = (values: Partial<TeacherQuestion>): TeacherQuestion => ({
  id: 'question-1',
  teacher_id: null,
  subject: 'English',
  difficulty: 'easy',
  question_text: 'Question?',
  question_type: 'short_answer',
  correct_answer: 'Answer',
  time_limit: 30,
  points: 10,
  is_public: true,
  is_active: true,
  times_answered: 0,
  times_correct: 0,
  created_at: '',
  updated_at: '',
  ...values,
});

test('a verified official question remains in Brains Heist Verified when it has a content teacher id', () => {
  const imported = question({
    teacher_id: 'platform-content-teacher', is_mine: false,
    content_origin: 'brain_heist', verification_status: 'verified', analytics_eligible: true,
  });
  assert.equal(isBrainsHeistPoolQuestion(imported, 'signed-in-teacher'), true);
  assert.equal(isMyPoolQuestion(imported, 'signed-in-teacher'), false);
});

test('the RPC ownership flag puts the signed-in teacher question in My Pool', () => {
  const mine = question({ teacher_id: 'signed-in-teacher', is_mine: true, content_origin: 'teacher', pool_scope: 'teacher' });
  assert.equal(isMyPoolQuestion(mine, 'signed-in-teacher'), true);
  assert.equal(isBrainsHeistPoolQuestion(mine, 'signed-in-teacher'), false);
});

test('a school-verified teacher-authored question is official but never treated as My Pool', () => {
  const schoolVerified = question({
    teacher_id: 'signed-in-teacher', is_mine: false, content_origin: 'teacher',
    pool_scope: 'school', owner_school_id: 'school-1',
    verification_status: 'verified', analytics_eligible: true, is_public: false,
  });
  assert.equal(isSchoolPoolQuestion(schoolVerified, 'signed-in-teacher'), true);
  assert.equal(isMyPoolQuestion(schoolVerified, 'signed-in-teacher'), false);
  assert.equal(isBrainsHeistPoolQuestion(schoolVerified, 'signed-in-teacher'), false);
});

test('legacy results fail closed instead of being guessed official', () => {
  assert.equal(isMyPoolQuestion(question({ teacher_id: 'signed-in-teacher', content_origin: 'teacher' }), 'signed-in-teacher'), true);
  assert.equal(isBrainsHeistPoolQuestion(question({ teacher_id: null }), 'signed-in-teacher'), false);
  assert.equal(isBrainsHeistPoolQuestion(question({ content_origin: 'brain_heist', verification_status: 'verified', analytics_eligible: false }), 'signed-in-teacher'), false);
  assert.equal(isSchoolPoolQuestion(question({ content_origin: 'teacher', pool_scope: 'school', verification_status: 'verified', analytics_eligible: false }), 'signed-in-teacher'), false);
});
