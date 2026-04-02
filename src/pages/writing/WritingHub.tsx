import React, { useMemo, useState } from 'react';
import {
  getCurrentWeeklyPlan,
  getMonthlyWritingReport,
  getStudentWritingState,
  getTodayWritingTask,
  getWeeklyWritingReview,
  submitDailyWritingPractice,
  submitInitialWritingAssessment,
} from '../../lib/brains_heist/writingIntegrationService.js';

interface WritingHubProps {
  studentId: string;
  grade: number;
  genre: 'email' | 'article' | 'review' | 'story' | 'essay' | 'report' | 'paragraph';
  month?: string;
}

export interface WritingDashboardSnapshot {
  weekly_plan_summary: {
    primary: string;
    secondary: string;
    maintenance: string;
  } | null;
  todays_task_title: string | null;
  completed_tasks_count: number;
  latest_total_score: number | null;
  monthly_growth_summary: string | null;
}

export const buildWritingDashboardSnapshot = (
  studentId: string,
  month: string
): { ok: boolean; data?: WritingDashboardSnapshot; error?: string } => {
  const stateRes = getStudentWritingState(studentId);
  if (!stateRes.ok || !stateRes.data) return { ok: false, error: stateRes.error ?? 'Unable to load writing state.' };

  const weeklyPlan = getCurrentWeeklyPlan(studentId);
  const today = getTodayWritingTask(studentId);
  const monthly = getMonthlyWritingReport(studentId, month);

  return {
    ok: true,
    data: {
      weekly_plan_summary: weeklyPlan.ok && weeklyPlan.data
        ? {
            primary: weeklyPlan.data.primary_target,
            secondary: weeklyPlan.data.secondary_target,
            maintenance: weeklyPlan.data.maintenance_target,
          }
        : null,
      todays_task_title: today.ok && today.data ? today.data.title : null,
      completed_tasks_count: stateRes.data.completed_daily_tasks.length,
      latest_total_score: stateRes.data.latest_assessment?.total_score ?? null,
      monthly_growth_summary: monthly.ok && monthly.data ? monthly.data.student_facing_monthly_report.score_change : null,
    },
  };
};

const cardStyle = {
  background: '#111827',
  borderRadius: 14,
  padding: 14,
  border: '1px solid #374151',
  color: '#e5e7eb',
};

const primaryButtonStyle = {
  marginTop: 12,
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: 'none',
  background: '#2563eb',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: 16,
  cursor: 'pointer',
};

export const WritingHub: React.FC<WritingHubProps> = ({ studentId, grade, genre, month = new Date().toISOString().slice(0, 7) }) => {
  const [promptText, setPromptText] = useState('Write a response that includes:\n- describe the event\n- explain why it mattered\n- give one suggestion');
  const [targetWordCount, setTargetWordCount] = useState(grade <= 7 ? 80 : grade <= 9 ? 120 : 160);
  const [initialResponse, setInitialResponse] = useState('');
  const [practiceResponse, setPracticeResponse] = useState('');
  const [feedback, setFeedback] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const dashboard = useMemo(() => buildWritingDashboardSnapshot(studentId, month), [studentId, month, feedback]);
  const stateRes = getStudentWritingState(studentId);
  const todayTask = getTodayWritingTask(studentId);
  const weeklyReview = getWeeklyWritingReview(studentId);
  const monthlyReport = getMonthlyWritingReport(studentId, month);
  const totalPlannedTasks = stateRes.ok && stateRes.data ? stateRes.data.active_daily_tasks.length : 0;
  const completedTasksCount = stateRes.ok && stateRes.data ? stateRes.data.completed_daily_tasks.length : 0;
  const hasActiveWeek = totalPlannedTasks > 0;
  const isWeekComplete = hasActiveWeek && completedTasksCount >= totalPlannedTasks && (!todayTask.ok || !todayTask.data);
  const canStartOrResetWeek = !hasActiveWeek || isWeekComplete;
  const hasTaskToday = Boolean(todayTask.ok && todayTask.data);

  const completionRatio =
    stateRes.ok && stateRes.data && stateRes.data.active_daily_tasks.length > 0
      ? stateRes.data.completed_daily_tasks.length / stateRes.data.active_daily_tasks.length
      : 0;

  const currentStep = canStartOrResetWeek ? 1 : hasTaskToday ? 2 : 3;

  const handleStart = () => {
    setLoading(true);
    setError('');
    if (!promptText.trim() || !initialResponse.trim() || targetWordCount < 20) {
      setError('Please add a prompt, a target word count (20+), and your first writing response.');
      setLoading(false);
      return;
    }
    const result = submitInitialWritingAssessment({
      student_id: studentId,
      grade,
      genre,
      prompt_text: promptText,
      target_word_count: targetWordCount,
      student_response: initialResponse,
    });
    if (!result.ok) setError(result.error ?? 'Unable to start writing week.');
    setLoading(false);
  };

  const handleSubmitPractice = () => {
    if (!todayTask.ok || !todayTask.data) {
      setError('No task available to submit right now.');
      return;
    }
    setLoading(true);
    const result = submitDailyWritingPractice({
      student_id: studentId,
      day_number: todayTask.data.day_number,
      submission_text: practiceResponse,
    });
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Could not submit today’s task.');
    } else {
      setFeedback(
        `Great job! ${result.data.evaluation.completion_status}. Skill score: ${result.data.evaluation.target_skill_score}/5. Next: ${result.data.evaluation.recommended_next_action}`
      );
      setPracticeResponse('');
    }
    setLoading(false);
  };

  const primaryActionLabel = canStartOrResetWeek
    ? isWeekComplete
      ? 'Start New Week'
      : 'Start Writing Week'
    : 'Submit Today’s Task';

  const handlePrimaryAction = () => {
    if (canStartOrResetWeek) {
      handleStart();
      return;
    }
    handleSubmitPractice();
  };

  return (
    <div style={{ padding: 12, display: 'grid', gap: 12, maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ color: '#f9fafb', margin: 0 }}>🧠 Writing Hub</h1>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Your writing steps</h2>
        <p style={{ marginTop: 0, color: '#93c5fd' }}>
          Step {currentStep} of 4:{' '}
          {currentStep === 1 ? 'Start Writing Week' : currentStep === 2 ? 'Complete Today’s Task' : 'Review Feedback'}
        </p>
        {!stateRes.ok || !dashboard.ok || !dashboard.data ? (
          <p>Let’s get started. Begin your writing week to unlock today’s task.</p>
        ) : (
          <>
            <p style={{ margin: '0 0 8px 0' }}>
              {isWeekComplete
                ? 'You finished this week. Nice work! Tap “Start New Week” when you are ready.'
                : hasTaskToday
                  ? 'You have a task ready now. Complete it and submit your writing.'
                  : 'You’re on track. Check your latest feedback and come back for your next task.'}
            </p>
            <div style={{ height: 10, background: '#374151', borderRadius: 999 }}>
              <div style={{ width: `${Math.min(100, completionRatio * 100)}%`, height: '100%', background: '#60a5fa', borderRadius: 999 }} />
            </div>
            <p style={{ fontSize: 12, marginBottom: 0 }}>{Math.round(completionRatio * 100)}% of this week completed</p>
          </>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Step 1: Start Writing Week</h2>
        {!canStartOrResetWeek && <p style={{ marginTop: 0 }}>You already started this week. Finish today’s task first.</p>}
        <textarea value={promptText} onChange={(e: { target: { value: string } }) => setPromptText(e.target.value)} style={{ width: '100%', minHeight: 80 }} />
        <input
          type="number"
          value={targetWordCount}
          onChange={(e: { target: { value: string } }) => setTargetWordCount(Number(e.target.value) || 0)}
          style={{ width: '100%', marginTop: 8 }}
        />
        <textarea
          value={initialResponse}
          onChange={(e: { target: { value: string } }) => setInitialResponse(e.target.value)}
          placeholder="Paste your first writing response"
          style={{ width: '100%', minHeight: 80, marginTop: 8 }}
        />
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Step 2: Complete Today’s Task</h2>
        {!todayTask.ok || !todayTask.data ? (
          <p>{isWeekComplete ? 'Week complete. Start a new week when you are ready.' : stateRes.ok && stateRes.data?.active_daily_tasks.length ? 'No task to submit right now. Check back tomorrow.' : 'Start your writing week to get today’s task.'}</p>
        ) : (
          <>
            <h3>{todayTask.data.title}</h3>
            <p>{todayTask.data.instructions}</p>
            <p>Aim for about {todayTask.data.expected_word_count} words.</p>
            <ul>
              {todayTask.data.success_criteria.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <textarea
              value={practiceResponse}
              onChange={(e: { target: { value: string } }) => setPracticeResponse(e.target.value)}
              placeholder="Write your submission here"
              style={{ width: '100%', minHeight: 90 }}
            />
          </>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Step 3: Review Feedback</h2>
        <p>{feedback || 'Submit today’s task to see feedback and your next step.'}</p>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Step 4: Start New Week</h2>
        <p style={{ marginBottom: 0 }}>
          {isWeekComplete ? 'Your week is complete. Tap the button below to start a fresh week.' : 'Finish all tasks this week to unlock “Start New Week”.'}
        </p>
      </section>

      <section style={cardStyle}>
        <button
          onClick={handlePrimaryAction}
          disabled={
            loading ||
            (canStartOrResetWeek
              ? !promptText.trim() || !initialResponse.trim() || targetWordCount < 20
              : !hasTaskToday || !practiceResponse.trim())
          }
          style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }}
          aria-label={primaryActionLabel}
        >
          {loading ? 'Please wait…' : primaryActionLabel}
        </button>
      </section>

      <details style={cardStyle}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>See details</summary>
        {!weeklyReview.ok || !weeklyReview.data ? (
          <p>Weekly summary appears after more task submissions.</p>
        ) : (
          <>
            <p>Weekly completed tasks: {weeklyReview.data.weekly_review_summary.completed_tasks}</p>
            <p>Stuck areas: {weeklyReview.data.weekly_review_summary.top_remaining_weaknesses.join(', ') || 'None'}</p>
            <p>Next focus 1: {weeklyReview.data.next_week_planning_inputs.carry_forward_primary_target}</p>
            <p>Next focus 2: {weeklyReview.data.next_week_planning_inputs.carry_forward_secondary_target}</p>
          </>
        )}

        {!monthlyReport.ok || !monthlyReport.data ? (
          <p>Monthly growth details will appear after enough attempts.</p>
        ) : (
          <>
            <p>Monthly score change: {monthlyReport.data.student_facing_monthly_report.score_change}</p>
            <p>Skills improving: {monthlyReport.data.student_facing_monthly_report.subscale_progress.join(' | ')}</p>
            <p>Strongest gains: {monthlyReport.data.student_facing_monthly_report.strongest_gains.join(', ')}</p>
            <p>Mistakes reduced: {monthlyReport.data.student_facing_monthly_report.repeated_mistakes_reduced.join(', ')}</p>
            <p>Main blocker: {monthlyReport.data.student_facing_monthly_report.remaining_blockers[0] ?? 'None'}</p>
            <p>Next month priorities: {monthlyReport.data.student_facing_monthly_report.next_month_priorities.join(', ')}</p>
          </>
        )}

        {stateRes.ok && stateRes.data?.latest_assessment && (
          <>
            <p style={{ marginBottom: 4 }}><strong>Score breakdown</strong></p>
            {[
              ['Content', stateRes.data.latest_assessment.subscores.content],
              ['Organisation', stateRes.data.latest_assessment.subscores.organisation],
              ['Language', stateRes.data.latest_assessment.subscores.language],
              ['Communicative', stateRes.data.latest_assessment.subscores.communicative_achievement ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 12 }}>{label}: {value}/5</div>
                <div style={{ height: 8, background: '#374151', borderRadius: 999 }}>
                  <div style={{ width: `${(Number(value) / 5) * 100}%`, height: '100%', background: '#22c55e', borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </>
        )}
      </details>

      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}
    </div>
  );
};

export const seedWritingHubForDemo = (studentId: string, grade: number, genre: WritingHubProps['genre']): void => {
  submitInitialWritingAssessment({
    student_id: studentId,
    grade,
    genre,
    prompt_text: 'Write a response that includes:\n- describe the event\n- explain why it mattered\n- give one suggestion',
    target_word_count: grade <= 7 ? 80 : grade <= 9 ? 120 : 160,
    student_response:
      'This response describes the event, explains why it mattered, and gives one practical suggestion for next time.',
  });
};

export default WritingHub;
