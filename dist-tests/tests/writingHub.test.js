import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __resetWritingIntegrationStoreForTests, getMonthlyWritingReport, getTodayWritingTask, getWeeklyWritingReview, submitDailyWritingPractice, submitInitialWritingAssessment, } from '../src/lib/brains_heist/writingIntegrationService.js';
import { WritingHub } from '../src/pages/writing/WritingHub.js';
const prompt = `Write a response that includes:
- describe the event
- explain why it mattered
- give one suggestion`;
test('dashboard render after initial assessment', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'ui-1',
        grade: 8,
        genre: 'article',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'The event was sports day. It mattered because teamwork improved. I suggest more team rounds.',
        attempted_at: '2026-03-01T10:00:00.000Z',
    });
    const html = renderToStaticMarkup(React.createElement(WritingHub, { studentId: 'ui-1', grade: 8, genre: 'article', month: '2026-03' }));
    assert.ok(html.includes('Your Writing Space'));
    assert.ok(html.includes('Today'));
});
test('today task render', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'ui-2',
        grade: 7,
        genre: 'email',
        prompt_text: prompt,
        target_word_count: 80,
        student_response: 'Dear teacher, event was helpful because teamwork. I suggest reflection. Regards.',
    });
    const html = renderToStaticMarkup(React.createElement(WritingHub, { studentId: 'ui-2', grade: 7, genre: 'email', month: '2026-03' }));
    assert.ok(html.includes('Your Response'));
    assert.ok(html.includes('Submit for Feedback'));
});
test('successful daily practice submission feedback flow', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'ui-3',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'I is write event and explain matter and suggest',
    });
    const today = getTodayWritingTask('ui-3');
    assert.strictEqual(today.ok, true);
    const submit = submitDailyWritingPractice({
        student_id: 'ui-3',
        day_number: today.data.day_number,
        submission_text: 'This essay describes the event, explains why it mattered for students, and gives one practical suggestion for next term.',
    });
    assert.strictEqual(submit.ok, true);
    assert.ok(submit.data.evaluation.student_friendly_feedback.length > 0);
});
test('weekly review render', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'ui-4',
        grade: 8,
        genre: 'paragraph',
        prompt_text: prompt,
        target_word_count: 100,
        student_response: 'Event was good.',
    });
    for (const day of [1, 2, 3]) {
        submitDailyWritingPractice({ student_id: 'ui-4', day_number: day, submission_text: 'bad' });
    }
    const weekly = getWeeklyWritingReview('ui-4');
    assert.strictEqual(weekly.ok, true);
    const html = renderToStaticMarkup(React.createElement(WritingHub, { studentId: 'ui-4', grade: 8, genre: 'paragraph', month: '2026-03' }));
    assert.ok(html.includes('Your Writing Space'));
    assert.ok(html.includes('Submit for Feedback'));
});
test('monthly report render', () => {
    __resetWritingIntegrationStoreForTests();
    submitInitialWritingAssessment({
        student_id: 'ui-5',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'I is write event and suggest',
        attempted_at: '2026-02-02T10:00:00.000Z',
    });
    submitInitialWritingAssessment({
        student_id: 'ui-5',
        grade: 9,
        genre: 'essay',
        prompt_text: prompt,
        target_word_count: 120,
        student_response: 'This essay describes the event, explains why it mattered, and gives one practical suggestion.',
        attempted_at: '2026-03-02T10:00:00.000Z',
    });
    const monthly = getMonthlyWritingReport('ui-5', '2026-03');
    assert.strictEqual(monthly.ok, true);
    const html = renderToStaticMarkup(React.createElement(WritingHub, { studentId: 'ui-5', grade: 9, genre: 'essay', month: '2026-03' }));
    assert.ok(html.includes('Today'));
    assert.ok(html.includes('Your Response'));
});
