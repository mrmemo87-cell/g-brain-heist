import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdmissionReportPartialAttemptNotice, resolveAdmissionReportPartialAttempt } from '../components/admissionReportPartialAttempt.js';

const sci6Report = {
  attempt_id: 'd4e16a44-7de4-4545-94a7-f70b7828ba71',
  candidate_name: 'SCI6 Candidate',
  form_label: 'Grade 6 Science Admission Test',
  form_code: 'SCI6-2026-DC00',
  total_score: 7,
  max_score: 25,
  percentage: 28,
  answers: Array.from({ length: 13 }, (_, index) => ({ question_id: `q-${index + 1}` })),
  placement_recommendation: {
    reasons: ['Science readiness is 28%.'],
  },
};

test('Admission Hub report modal partial-attempt notice renders SCI6 fallback values before placement details', () => {
  const metrics = resolveAdmissionReportPartialAttempt(sci6Report as any);
  const partialMarkup = renderToStaticMarkup(React.createElement(AdmissionReportPartialAttemptNotice, { metrics }));
  const modalOrderMarkup = [
    `<div>Score 7/25</div>`,
    partialMarkup,
    `<section><h4>Placement Recommendation</h4><p>Science readiness is 28%.</p></section>`,
    `<button>📝 Detailed Answers (${sci6Report.answers.length} questions)</button>`,
  ].join('');

  assert.equal(metrics.answeredCount, 13);
  assert.equal(metrics.totalQuestions, 25);
  assert.equal(metrics.totalScore, 7);
  assert.equal(metrics.answeredQuestionAccuracy, 54);
  assert.equal(metrics.partialAttempt, true);

  assert.match(modalOrderMarkup, /Answered 13 of 25 questions/);
  assert.match(modalOrderMarkup, /Unanswered questions were marked incorrect/);
  assert.match(modalOrderMarkup, /This result is based on a partial attempt/);
  assert.match(modalOrderMarkup, /Answered-question accuracy: 54%/);
  assert.match(modalOrderMarkup, /Science readiness is 28%/);
  assert.doesNotMatch(modalOrderMarkup, /Science readiness is 54%/);
  assert.match(modalOrderMarkup, /7\/25/);
  assert.match(modalOrderMarkup, /Detailed Answers \(13 questions\)/);
  assert.ok(modalOrderMarkup.indexOf('Answered 13 of 25 questions') < modalOrderMarkup.indexOf('Placement Recommendation'));
});
