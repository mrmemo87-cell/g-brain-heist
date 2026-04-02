import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialStudentWritingState,
  runDailyWritingPracticeFlow,
  runInitialWritingAssessmentFlow,
  runMonthlyWritingReviewFlow,
  runWeeklyWritingReviewFlow,
} from '../src/lib/brains_heist/writingWorkflowOrchestrator.js';

const prompt = `Write a response that includes:
- describe the event
- explain why it mattered
- give one suggestion`;

test('initial assessment -> week plan -> daily tasks flow', () => {
  const output = runInitialWritingAssessmentFlow({
    student_id: 'stu-1',
    grade: 8,
    genre: 'article',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'The event was sports day. It mattered because students worked together. I suggest adding more team rounds.',
    attempted_at: '2026-03-01T09:00:00.000Z',
  });

  assert.ok(output.assessment_result.total_score >= 0);
  assert.strictEqual(output.daily_tasks.length, 7);
  assert.ok(output.weekly_plan.primary_target.length > 0);
  assert.strictEqual(output.updated_writing_state.student_id, 'stu-1');
});

test('daily task submission updates state correctly', () => {
  const initial = runInitialWritingAssessmentFlow({
    student_id: 'stu-2',
    grade: 9,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'I is write about event and explain matter and suggest',
  });

  const task = initial.daily_tasks[0];
  const daily = runDailyWritingPracticeFlow({
    student_id: 'stu-2',
    daily_task: task,
    student_submission:
      'This essay describes the event, explains why it mattered for students, and gives one suggestion for the next term.',
    writing_state: initial.updated_writing_state,
  });

  assert.strictEqual(daily.updated_writing_state.completed_daily_tasks.length, 1);
  assert.ok(daily.practice_evaluation_result.recommended_next_action.length > 0);
});

test('repeated failures persist into next-week signals', () => {
  const initial = runInitialWritingAssessmentFlow({
    student_id: 'stu-3',
    grade: 8,
    genre: 'paragraph',
    prompt_text: prompt,
    target_word_count: 100,
    student_response: 'Event was good.',
  });

  let state = initial.updated_writing_state;
  for (let i = 0; i < 3; i += 1) {
    const result = runDailyWritingPracticeFlow({
      student_id: 'stu-3',
      daily_task: state.active_daily_tasks[i],
      student_submission: 'bad',
      writing_state: state,
      completed_at: `2026-03-0${i + 2}T10:00:00.000Z`,
    });
    state = result.updated_writing_state;
  }

  const weekly = runWeeklyWritingReviewFlow({ student_id: 'stu-3', completed_week_state: state });
  assert.strictEqual(weekly.next_week_planning_inputs.adaptation_signal, 'reduce_difficulty');
});

test('repeated success changes adaptation trend', () => {
  const initial = runInitialWritingAssessmentFlow({
    student_id: 'stu-4',
    grade: 10,
    genre: 'report',
    prompt_text: prompt,
    target_word_count: 150,
    student_response:
      'This report describes the event, explains why it mattered, and provides one recommendation for future improvement.',
  });

  let state = initial.updated_writing_state;
  for (let i = 0; i < 3; i += 1) {
    const task = {
      ...state.active_daily_tasks[6],
      target_tags: [],
      success_criteria: ['Addresses the task clearly and directly.'],
      expected_word_count: 20,
      support_level: 'low' as const,
    };
    const result = runDailyWritingPracticeFlow({
      student_id: 'stu-4',
      daily_task: task,
      student_submission:
        'This report describes the event clearly, explains why it mattered, and gives one practical recommendation.',
      writing_state: state,
      completed_at: `2026-03-1${i}T10:00:00.000Z`,
    });
    state = result.updated_writing_state;
  }

  assert.ok(state.adaptation_trend.success_streak + state.adaptation_trend.failure_streak >= 1);
  assert.ok(state.adaptation_trend.last_recommended_action.length > 0);
  assert.ok(['increased', 'baseline', 'reduced'].includes(state.current_difficulty_state));
});

test('monthly review builds proper report from accumulated history', () => {
  let state = createInitialStudentWritingState('stu-5', 9, 'essay');

  const feb = runInitialWritingAssessmentFlow({
    student_id: 'stu-5',
    grade: 9,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response: 'I is write event and suggest',
    current_state: state,
    attempted_at: '2026-02-05T10:00:00.000Z',
  });
  state = feb.updated_writing_state;

  const mar = runInitialWritingAssessmentFlow({
    student_id: 'stu-5',
    grade: 9,
    genre: 'essay',
    prompt_text: prompt,
    target_word_count: 120,
    student_response:
      'This essay describes the event, explains why it mattered, and gives one clear suggestion for next time.',
    current_state: state,
    attempted_at: '2026-03-06T10:00:00.000Z',
  });
  state = mar.updated_writing_state;

  const monthly = runMonthlyWritingReviewFlow({
    student_id: 'stu-5',
    month: '2026-03',
    writing_state: state,
  });

  assert.ok(monthly.monthly_comparison_summary.currentMonth);
  assert.ok(monthly.student_facing_monthly_report.score_change.length > 0);
  assert.ok(monthly.next_month_target_recommendations.length > 0);
});
