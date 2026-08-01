import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdmissionReportPartialAttemptNotice, resolveAdmissionReportPartialAttempt, resolveAdmissionReportVisiblePartialAttempt, } from '../components/admissionReportPartialAttempt.js';
const sci6Report = {
    attempt_id: 'd4e16a44-7de4-4545-94a7-f70b7828ba71',
    candidate_name: 'SCI6 Candidate',
    form_label: 'Grade 6 Science Admission Test',
    form_code: 'SCI6-2026-DC00',
    total_score: 7,
    max_score: 25,
    total_questions: 13,
    answered_count: undefined,
    percentage: 28,
    answers: Array.from({ length: 13 }, (_, index) => ({ question_id: `q-${index + 1}` })),
    placement_recommendation: {
        currentSubject: 'science',
        sciencePercentage: 28,
        reasons: ['Science readiness is 28%.'],
    },
};
test('Admission Hub report modal path derives SCI6 partial notice from the visible score and answer-count values', () => {
    const hub = fs.readFileSync('components/AdmissionHub.tsx', 'utf8');
    assert.match(hub, /const visibleReportScoreTotal = reportData\?\.total_score \?\? 0;/);
    assert.match(hub, /const visibleReportQuestionTotal = reportData\?\.max_score \?\? 0;/);
    assert.match(hub, /const visibleReportAnsweredCount = \(reportData\?\.answers \?\? \[\]\)\.length;/);
    assert.match(hub, /statCard\('Score', `\$\{visibleReportScoreTotal\}\/\$\{visibleReportQuestionTotal\}`/);
    assert.match(hub, /Detailed Answers \(\{visibleReportAnsweredCount\} questions\)/);
    assert.match(hub, /<AdmissionReportPartialAttemptNotice metrics=\{visibleReportPartialAttemptMetrics\.partialAttempt \? visibleReportPartialAttemptMetrics : reportPartialAttemptMetrics\} \/>/);
    assert.ok(hub.indexOf('<AdmissionReportPartialAttemptNotice') < hub.indexOf('Placement Recommendation'), 'partial-attempt notice must render before Placement Recommendation in the report modal');
});
test('Admission Hub report modal partial-attempt notice renders SCI6 visible fallback values before placement details', () => {
    const previousMetrics = resolveAdmissionReportPartialAttempt(sci6Report);
    const visibleMetrics = resolveAdmissionReportVisiblePartialAttempt({
        totalScore: sci6Report.total_score,
        totalQuestions: sci6Report.max_score,
        answeredCount: sci6Report.answers.length,
    });
    const partialMarkup = renderToStaticMarkup(React.createElement(AdmissionReportPartialAttemptNotice, { metrics: visibleMetrics }));
    const modalOrderMarkup = [
        `<div>Score ${sci6Report.total_score}/${sci6Report.max_score}</div>`,
        partialMarkup,
        `<section><h4>Placement Recommendation</h4><div>Science readiness</div><p>${sci6Report.placement_recommendation.sciencePercentage}%</p></section>`,
        `<button>📝 Detailed Answers (${sci6Report.answers.length} questions)</button>`,
    ].join('');
    assert.equal(previousMetrics.partialAttempt, false, 'documents why the previous report-field-only notice did not render');
    assert.equal(visibleMetrics.answeredCount, 13);
    assert.equal(visibleMetrics.totalQuestions, 25);
    assert.equal(visibleMetrics.totalScore, 7);
    assert.equal(visibleMetrics.answeredQuestionAccuracy, 54);
    assert.equal(visibleMetrics.partialAttempt, true);
    assert.match(modalOrderMarkup, /Score 7\/25/);
    assert.match(modalOrderMarkup, /Detailed Answers \(13 questions\)/);
    assert.match(modalOrderMarkup, /Answered 13 of 25 questions/);
    assert.match(modalOrderMarkup, /Unanswered questions were marked incorrect/);
    assert.match(modalOrderMarkup, /This result is based on a partial attempt/);
    assert.match(modalOrderMarkup, /Answered-question accuracy: 54%/);
    assert.match(modalOrderMarkup, /Science readiness/);
    assert.match(modalOrderMarkup, />28%</);
    assert.doesNotMatch(modalOrderMarkup, /Science readiness[\s\S]*54%/);
    assert.ok(modalOrderMarkup.indexOf('Answered 13 of 25 questions') < modalOrderMarkup.indexOf('Placement Recommendation'));
});
