import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSchoolAdminNavigationUrl,
  parseSchoolAdminNavigation,
  schoolAdminIeltsUrl,
} from '../src/lib/schoolAdminIeltsNavigation.js';
import { friendlyIeltsAdminError } from '../src/lib/schoolAdminPresentation.js';

test('school admin IELTS location state restores a validated tab and review detail', () => {
  assert.deepEqual(
    parseSchoolAdminNavigation('?adminTab=ielts&ieltsTab=ielts-reviews&reviewSkill=writing&reviewAttempt=attempt-42'),
    {
      adminTab: 'ielts',
      ieltsTab: 'ielts-reviews',
      review: { skill: 'writing', attemptId: 'attempt-42' },
      monitorExamId: null,
    },
  );
});

test('school admin IELTS location state rejects arbitrary tabs, return URLs, and review values', () => {
  const state = parseSchoolAdminNavigation('?adminTab=https://evil.example&ieltsTab=javascript:alert(1)&reviewSkill=admin&reviewAttempt=x&returnTo=https://evil.example');
  assert.deepEqual(state, { adminTab: 'dashboard', ieltsTab: 'ielts-exams', review: null, monitorExamId: null });
});

test('building navigation URLs preserves unrelated safe query state and clears stale IELTS detail', () => {
  assert.equal(
    buildSchoolAdminNavigationUrl(
      { adminTab: 'members', ieltsTab: 'ielts-reviews', review: { skill: 'speaking', attemptId: 'abc' }, monitorExamId: null },
      '/?campaign=school&adminTab=ielts&ieltsTab=ielts-reviews&reviewSkill=speaking&reviewAttempt=abc',
    ),
    '/?campaign=school&adminTab=members&view=school_admin',
  );
});

test('direct IELTS admin destinations are represented by fixed enum state instead of return URLs', () => {
  assert.equal(
    schoolAdminIeltsUrl('ielts-reviews', { skill: 'speaking', attemptId: 'attempt/7' }),
    '/?view=school_admin&adminTab=ielts&ieltsTab=ielts-reviews&reviewSkill=speaking&reviewAttempt=attempt%2F7',
  );
});

test('direct IELTS admin destinations explicitly restore the admin workspace for dual-role users', () => {
  assert.match(schoolAdminIeltsUrl('ielts-exams'), /[?&]view=school_admin(?:&|$)/);
});

test('exam monitoring restores only a validated UUID inside the IELTS admin shell', () => {
  const examId = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(
    parseSchoolAdminNavigation(`?adminTab=ielts&ieltsTab=ielts-exams&monitorExam=${examId}`).monitorExamId,
    examId,
  );
  assert.equal(
    parseSchoolAdminNavigation('?adminTab=ielts&ieltsTab=ielts-exams&monitorExam=javascript:alert(1)').monitorExamId,
    null,
  );
  assert.match(schoolAdminIeltsUrl('ielts-exams', null, examId), new RegExp(`monitorExam=${examId}`));
});

test('administrator-facing IELTS errors redact implementation and authorization details', () => {
  const fallback = 'Unable to load IELTS results. Please try again.';
  assert.equal(friendlyIeltsAdminError(new Error('rpc_ielts_school_results: permission denied for table users'), fallback), 'You do not have permission to make this change for this school.');
  assert.equal(friendlyIeltsAdminError(new Error('rpc_ielts_school_results returned SQLSTATE 42883'), fallback), fallback);
});
