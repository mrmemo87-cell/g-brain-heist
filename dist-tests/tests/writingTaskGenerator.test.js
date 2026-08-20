import test from 'node:test';
import assert from 'node:assert/strict';
import { assessWritingExam, createEmptyErrorMemory, generateWeeklyImprovementPlan, storeAttemptInErrorMemory, } from '../src/lib/brains_heist/writingAssessment.js';
import { generateDailyWritingTasksForWeek } from '../src/lib/brains_heist/writingTaskGenerator.js';
const prompt = `Write a response that includes:
- describe the event
- explain why it mattered
- give one suggestion`;
const buildPlanInput = (grade, genre, response, studentId, memoryDate = '2026-03-01T10:00:00.000Z') => {
    let memory = createEmptyErrorMemory();
    const assessment = assessWritingExam({
        promptText: prompt,
        grade,
        genre,
        targetWordCount: grade <= 7 ? 80 : grade <= 9 ? 110 : 150,
        studentResponse: response,
    });
    memory = storeAttemptInErrorMemory(memory, studentId, assessment, memoryDate);
    const plan = generateWeeklyImprovementPlan({
        assessment,
        grade,
        genre,
        repeatedErrorMemory: memory,
        studentId,
    });
    return { memory, assessment, plan };
};
test('Grade 6 language-focused week uses high support and language drills early', () => {
    const { memory, assessment, plan } = buildPlanInput(6, 'email', 'Dear teacher i is go yesterday to event. it mattered because teamwork. i recommend do again', 'g6');
    const tasks = generateDailyWritingTasksForWeek({
        weekly_plan: { ...plan, primary_target: 'agreement error' },
        latest_assessment: assessment,
        grade: 6,
        target_genre: 'email',
        repeated_error_memory: memory,
        student_id: 'g6',
    });
    assert.strictEqual(tasks.length, 7);
    assert.strictEqual(tasks[0].support_level, 'high');
    assert.ok(tasks.slice(0, 3).some((task) => ['sentence correction', 'error spotting', 'sentence combining'].includes(task.task_type)));
});
test('Grade 8 organisation-focused week includes sequencing/linking tasks', () => {
    const { memory, assessment, plan } = buildPlanInput(8, 'article', 'The event was a school clean-up and it mattered because students helped and suggestion is continue', 'g8');
    const tasks = generateDailyWritingTasksForWeek({
        weekly_plan: { ...plan, primary_target: 'poor sequencing' },
        latest_assessment: assessment,
        grade: 8,
        target_genre: 'article',
        repeated_error_memory: memory,
        student_id: 'g8',
    });
    assert.ok(tasks.some((task) => task.task_type === 'paragraph ordering' || task.task_type === 'linking words insertion'));
});
test('Grade 10 communicative-focused week includes genre convention work', () => {
    const { memory, assessment, plan } = buildPlanInput(10, 'report', 'Hey guys this report was awesome and cool. I describe event, explain it mattered and suggest to do again.', 'g10');
    const tasks = generateDailyWritingTasksForWeek({
        weekly_plan: { ...plan, primary_target: 'weak register control' },
        latest_assessment: assessment,
        grade: 10,
        target_genre: 'report',
        repeated_error_memory: memory,
        student_id: 'g10',
    });
    assert.ok(tasks.some((task) => task.task_type === 'genre convention task'));
    assert.strictEqual(tasks[0].support_level, 'low');
});
test('repeated errors trigger rewrite assignment', () => {
    let memory = createEmptyErrorMemory();
    const assessment1 = assessWritingExam({
        promptText: prompt,
        grade: 9,
        genre: 'essay',
        targetWordCount: 120,
        studentResponse: 'I is write event and matter and suggest',
    });
    const assessment2 = assessWritingExam({
        promptText: prompt,
        grade: 9,
        genre: 'essay',
        targetWordCount: 120,
        studentResponse: 'I is writing event and explain matter and suggest now',
    });
    memory = storeAttemptInErrorMemory(memory, 'repeat', assessment1, '2026-02-10T10:00:00.000Z');
    memory = storeAttemptInErrorMemory(memory, 'repeat', assessment2, '2026-03-10T10:00:00.000Z');
    const plan = generateWeeklyImprovementPlan({
        assessment: assessment2,
        grade: 9,
        genre: 'essay',
        repeatedErrorMemory: memory,
        studentId: 'repeat',
    });
    const tasks = generateDailyWritingTasksForWeek({
        weekly_plan: plan,
        latest_assessment: assessment2,
        grade: 9,
        target_genre: 'essay',
        repeated_error_memory: memory,
        student_id: 'repeat',
    });
    assert.ok(tasks.some((task) => task.task_type === 'rewrite from feedback'));
});
test('word-count-control assignment appears when under_length is repeated', () => {
    let memory = createEmptyErrorMemory();
    const a1 = assessWritingExam({
        promptText: prompt,
        grade: 8,
        genre: 'paragraph',
        targetWordCount: 120,
        studentResponse: 'The event mattered.',
    });
    const a2 = assessWritingExam({
        promptText: prompt,
        grade: 8,
        genre: 'paragraph',
        targetWordCount: 120,
        studentResponse: 'Event mattered and suggestion is do again.',
    });
    memory = storeAttemptInErrorMemory(memory, 'wc', a1, '2026-02-01T10:00:00.000Z');
    memory = storeAttemptInErrorMemory(memory, 'wc', a2, '2026-03-01T10:00:00.000Z');
    const plan = generateWeeklyImprovementPlan({
        assessment: a2,
        grade: 8,
        genre: 'paragraph',
        repeatedErrorMemory: memory,
        studentId: 'wc',
    });
    const tasks = generateDailyWritingTasksForWeek({
        weekly_plan: plan,
        latest_assessment: a2,
        grade: 8,
        target_genre: 'paragraph',
        repeated_error_memory: memory,
        student_id: 'wc',
    });
    assert.ok(tasks.some((task) => task.task_type === 'word-count control task'));
});
test('end-of-week task is exam-style', () => {
    const { memory, assessment, plan } = buildPlanInput(11, 'essay', 'This essay describes the event, explains why it mattered, and gives one suggestion for future improvement.', 'g11');
    const tasks = generateDailyWritingTasksForWeek({
        weekly_plan: plan,
        latest_assessment: assessment,
        grade: 11,
        target_genre: 'essay',
        repeated_error_memory: memory,
        student_id: 'g11',
    });
    assert.strictEqual(tasks[6].task_type, 'full exam-style response');
    assert.strictEqual(tasks[6].task_mode, 'exam_style');
});
