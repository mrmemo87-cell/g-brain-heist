import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessWritingExam,
  createEmptyErrorMemory,
  generateWeeklyImprovementPlan,
  storeAttemptInErrorMemory,
} from '../src/lib/brains_heist/writingAssessment.js';
import { generateDailyWritingTasksForWeek } from '../src/lib/brains_heist/writingTaskGenerator.js';
import { evaluateWritingPracticeTask } from '../src/lib/brains_heist/writingPracticeEvaluator.js';

const prompt = `Write a response that includes:
- describe the event
- explain why it mattered
- give one suggestion`;

const getTask = (grade: number, genre: 'email' | 'article' | 'review' | 'story' | 'essay' | 'report' | 'paragraph', response: string, studentId: string) => {
  let memory = createEmptyErrorMemory();
  const assessment = assessWritingExam({
    promptText: prompt,
    grade,
    genre,
    targetWordCount: grade <= 7 ? 80 : grade <= 9 ? 110 : 150,
    studentResponse: response,
  });
  memory = storeAttemptInErrorMemory(memory, studentId, assessment, '2026-03-10T10:00:00.000Z');
  const plan = generateWeeklyImprovementPlan({
    assessment,
    grade,
    genre,
    repeatedErrorMemory: memory,
    studentId,
  });
  const tasks = generateDailyWritingTasksForWeek({
    weekly_plan: plan,
    latest_assessment: assessment,
    grade,
    target_genre: genre,
    repeated_error_memory: memory,
    student_id: studentId,
  });
  return { tasks, assessment, memory };
};

test('successful rewrite fixes prior language errors', () => {
  const { tasks, assessment, memory } = getTask(9, 'essay', 'I is write event and explain matter and suggest', 'rw');
  const rewriteTask = tasks.find((task) => task.task_type === 'rewrite from feedback');
  assert.ok(rewriteTask);

  const result = evaluateWritingPracticeTask({
    daily_task: { ...rewriteTask!, expected_word_count: 50 },
    student_submission:
      'This essay describes the school event clearly and explains why it mattered for student confidence, teamwork, and responsibility. It also recommends one practical change: schedule structured reflection after each activity so students can review mistakes and improve in the next task.',
    latest_assessment: assessment,
    repeated_error_memory: memory,
    grade: 9,
    genre: 'essay',
    student_id: 'rw',
  });

  assert.ok(result.detected_improvement_tags.length >= 1);
});

test('paragraph task with weak organisation is marked partial or incomplete', () => {
  const { tasks, assessment, memory } = getTask(8, 'article', 'The event mattered and suggestion is continue', 'org');
  const paragraphTask = tasks.find((task) => task.task_type === 'paragraph writing') ?? tasks[3];

  const result = evaluateWritingPracticeTask({
    daily_task: paragraphTask,
    student_submission: 'Event was good it mattered suggestion continue',
    latest_assessment: assessment,
    repeated_error_memory: memory,
    grade: 8,
    genre: 'article',
    student_id: 'org',
  });

  assert.ok(result.detected_weakness_tags.includes('weak_paragraphing') || result.completion_status !== 'complete');
});

test('word-count-control failure is detected', () => {
  let memory = createEmptyErrorMemory();
  const a1 = assessWritingExam({
    promptText: prompt,
    grade: 8,
    genre: 'paragraph',
    targetWordCount: 120,
    studentResponse: 'Too short response.',
  });
  const a2 = assessWritingExam({
    promptText: prompt,
    grade: 8,
    genre: 'paragraph',
    targetWordCount: 120,
    studentResponse: 'Still short response with small detail.',
  });
  memory = storeAttemptInErrorMemory(memory, 'wc2', a1, '2026-02-01T10:00:00.000Z');
  memory = storeAttemptInErrorMemory(memory, 'wc2', a2, '2026-03-01T10:00:00.000Z');

  const plan = generateWeeklyImprovementPlan({
    assessment: a2,
    grade: 8,
    genre: 'paragraph',
    repeatedErrorMemory: memory,
    studentId: 'wc2',
  });
  const tasks = generateDailyWritingTasksForWeek({
    weekly_plan: plan,
    latest_assessment: a2,
    grade: 8,
    target_genre: 'paragraph',
    repeated_error_memory: memory,
    student_id: 'wc2',
  });
  const wcTask = tasks.find((task) => task.task_type === 'word-count control task');
  assert.ok(wcTask);

  const result = evaluateWritingPracticeTask({
    daily_task: wcTask!,
    student_submission: 'Very short text.',
    latest_assessment: a2,
    repeated_error_memory: memory,
    grade: 8,
    genre: 'paragraph',
    student_id: 'wc2',
  });

  assert.strictEqual(result.word_count_result.within_range, false);
});

test('communicative task with wrong tone recommends retry_same_genre', () => {
  const { tasks, assessment, memory } = getTask(
    10,
    'report',
    'Hey guys this report was cool. I describe event and explain why it mattered and suggest doing it again.',
    'ca'
  );
  const task = tasks.find((item) => ['genre convention task', 'guided writing', 'full exam-style response'].includes(item.task_type)) ?? tasks[0];

  const result = evaluateWritingPracticeTask({
    daily_task: task,
    student_submission:
      'Hey guys, this report is awesome and super cool. We should totally do this again because it was fun.',
    latest_assessment: assessment,
    repeated_error_memory: memory,
    grade: 10,
    genre: 'report',
    student_id: 'ca',
  });

  assert.strictEqual(result.recommended_next_action, 'retry_same_genre');
});

test('repeated success can trigger increase_difficulty recommendation', () => {
  let memory = createEmptyErrorMemory();
  const a1 = assessWritingExam({
    promptText: prompt,
    grade: 9,
    genre: 'essay',
    targetWordCount: 120,
    studentResponse: 'This essay describes the event, explains why it mattered, and gives a suggestion for improvement.',
  });
  const a2 = assessWritingExam({
    promptText: prompt,
    grade: 9,
    genre: 'essay',
    targetWordCount: 120,
    studentResponse: 'This essay clearly describes the event, explains the impact, and proposes one recommendation.',
  });
  const a3 = assessWritingExam({
    promptText: prompt,
    grade: 9,
    genre: 'essay',
    targetWordCount: 120,
    studentResponse: 'This essay outlines the event, explains why it mattered, and provides one clear suggestion.',
  });
  memory = storeAttemptInErrorMemory(memory, 'up', a1, '2026-01-01T10:00:00.000Z');
  memory = storeAttemptInErrorMemory(memory, 'up', a2, '2026-02-01T10:00:00.000Z');
  memory = storeAttemptInErrorMemory(memory, 'up', a3, '2026-03-01T10:00:00.000Z');

  const plan = generateWeeklyImprovementPlan({
    assessment: a3,
    grade: 9,
    genre: 'essay',
    repeatedErrorMemory: memory,
    studentId: 'up',
  });
  const tasks = generateDailyWritingTasksForWeek({
    weekly_plan: plan,
    latest_assessment: a3,
    grade: 9,
    target_genre: 'essay',
    repeated_error_memory: memory,
    student_id: 'up',
  });

  const result = evaluateWritingPracticeTask({
    daily_task: {
      ...tasks[6],
      target_tags: [],
      expected_word_count: 60,
      success_criteria: ['Addresses the task clearly and directly.'],
    },
    student_submission:
      'This essay describes the event in detail, explains why it mattered for the school community, and offers one practical suggestion for future planning. The argument is clear, the points are connected logically, and the conclusion reinforces the recommendation with a focused final statement.',
    latest_assessment: a3,
    repeated_error_memory: memory,
    grade: 9,
    genre: 'essay',
    student_id: 'up',
  });

  assert.strictEqual(result.recommended_next_action, 'increase_difficulty');
});

test('repeated failure can trigger repeat_skill recommendation', () => {
  const { tasks, assessment, memory } = getTask(8, 'paragraph', 'Event mattered.', 'fail');

  const result = evaluateWritingPracticeTask({
    daily_task: tasks[0],
    student_submission: 'bad',
    latest_assessment: assessment,
    repeated_error_memory: memory,
    grade: 8,
    genre: 'paragraph',
    student_id: 'fail',
  });

  assert.strictEqual(result.recommended_next_action, 'repeat_skill');
});
