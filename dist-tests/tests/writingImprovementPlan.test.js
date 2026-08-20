import test from 'node:test';
import assert from 'node:assert/strict';
import { assessWritingExam, buildStudentFacingFeedback, createEmptyErrorMemory, formatMonthlyGrowthReport, generateMonthlyComparison, generateWeeklyImprovementPlan, storeAttemptInErrorMemory, } from '../src/lib/brains_heist/writingAssessment.js';
const prompt = `Write a response that includes:
- describe the event
- explain why it mattered
- give one suggestion`;
test('language weakness plan selects language-focused primary target', () => {
    let memory = createEmptyErrorMemory();
    const result = assessWritingExam({
        promptText: prompt,
        grade: 9,
        genre: 'email',
        targetWordCount: 80,
        studentResponse: 'Dear teacher, I describe the event from last week and explain why it mattered for students, but i is go yesterday and they was very happy. I give one suggestion: the school should add more team activities next time.',
    });
    memory = storeAttemptInErrorMemory(memory, 's1', result, '2026-03-03T10:00:00.000Z');
    const plan = generateWeeklyImprovementPlan({
        assessment: result,
        grade: 9,
        genre: 'email',
        repeatedErrorMemory: memory,
        studentId: 's1',
    });
    assert.ok(plan.primary_target.includes('agreement') || plan.primary_target.includes('tense') || plan.primary_target.includes('language') || plan.primary_target.includes('under length'));
    assert.strictEqual(plan.daily_tasks.length, 7);
});
test('organisation weakness plan selects organisation-like target', () => {
    let memory = createEmptyErrorMemory();
    const result = assessWritingExam({
        promptText: prompt,
        grade: 10,
        genre: 'report',
        targetWordCount: 140,
        studentResponse: 'The event was a science day and it mattered because students learned and my suggestion is to add more labs because it helps students and teachers improve learning and everyone liked it',
    });
    memory = storeAttemptInErrorMemory(memory, 's2', result, '2026-03-04T10:00:00.000Z');
    const plan = generateWeeklyImprovementPlan({ assessment: result, grade: 10, genre: 'report', repeatedErrorMemory: memory, studentId: 's2' });
    assert.ok(plan.primary_target.includes('paragraph') || plan.primary_target.includes('sequencing') || plan.primary_target.includes('organisation'));
});
test('content weakness plan selects content target', () => {
    let memory = createEmptyErrorMemory();
    const result = assessWritingExam({
        promptText: prompt,
        grade: 8,
        genre: 'article',
        targetWordCount: 110,
        studentResponse: 'The event was fun for students.',
    });
    memory = storeAttemptInErrorMemory(memory, 's3', result, '2026-03-05T10:00:00.000Z');
    const plan = generateWeeklyImprovementPlan({ assessment: result, grade: 8, genre: 'article', repeatedErrorMemory: memory, studentId: 's3' });
    assert.ok(plan.primary_target.includes('content') || plan.primary_target.includes('missed content') || plan.primary_target.includes('partial'));
});
test('upper-grade communicative weakness plan prioritizes tone/register issues', () => {
    let memory = createEmptyErrorMemory();
    const result = assessWritingExam({
        promptText: prompt,
        grade: 12,
        genre: 'report',
        targetWordCount: 150,
        studentResponse: 'Hey guys, the event was super cool. I described it, explained why it mattered, and suggested doing it again. It was awesome and everyone should totally join next time!',
    });
    memory = storeAttemptInErrorMemory(memory, 's4', result, '2026-03-06T10:00:00.000Z');
    const plan = generateWeeklyImprovementPlan({ assessment: result, grade: 12, genre: 'report', repeatedErrorMemory: memory, studentId: 's4' });
    assert.ok(plan.primary_target.includes('tone') || plan.primary_target.includes('register') || plan.primary_target.includes('communicative'));
});
test('improvement across attempts can shift maintenance target and produces learner feedback/monthly report', () => {
    let memory = createEmptyErrorMemory();
    const old1 = assessWritingExam({
        promptText: prompt,
        grade: 9,
        genre: 'essay',
        targetWordCount: 130,
        studentResponse: 'I is write short text about event and matter and suggest',
    });
    const old2 = assessWritingExam({
        promptText: prompt,
        grade: 9,
        genre: 'essay',
        targetWordCount: 130,
        studentResponse: 'I is writing about event and why it matters and suggestion.',
    });
    const old3 = assessWritingExam({
        promptText: prompt,
        grade: 9,
        genre: 'essay',
        targetWordCount: 130,
        studentResponse: 'This essay describes the event, explains why it mattered, and gives one clear suggestion for future improvement in school activities.',
    });
    const latest = assessWritingExam({
        promptText: prompt,
        grade: 9,
        genre: 'essay',
        targetWordCount: 130,
        studentResponse: 'This essay describes the school charity event, explains why it mattered for teamwork, and gives one suggestion to improve planning and student participation.',
    });
    memory = storeAttemptInErrorMemory(memory, 's5', old1, '2026-01-10T10:00:00.000Z');
    memory = storeAttemptInErrorMemory(memory, 's5', old2, '2026-02-10T10:00:00.000Z');
    memory = storeAttemptInErrorMemory(memory, 's5', old3, '2026-03-10T10:00:00.000Z');
    memory = storeAttemptInErrorMemory(memory, 's5', latest, '2026-03-22T10:00:00.000Z');
    const plan = generateWeeklyImprovementPlan({ assessment: latest, grade: 9, genre: 'essay', repeatedErrorMemory: memory, studentId: 's5' });
    const feedback = buildStudentFacingFeedback(latest);
    const monthly = generateMonthlyComparison(memory, 's5', '2026-03');
    const report = formatMonthlyGrowthReport(monthly, memory);
    assert.ok(plan.maintenance_target.length > 0);
    assert.ok(feedback.top_3_weaknesses.length <= 3);
    assert.ok(report.score_change.length > 0);
    assert.ok(report.next_month_priorities.length > 0);
});
