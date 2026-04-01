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

  const completionRatio =
    stateRes.ok && stateRes.data && stateRes.data.active_daily_tasks.length > 0
      ? stateRes.data.completed_daily_tasks.length / stateRes.data.active_daily_tasks.length
      : 0;

  const handleStart = () => {
    setLoading(true);
    setError('');
    if (!promptText.trim() || !initialResponse.trim() || targetWordCount < 20) {
      setError('Please provide prompt text, target word count (20+), and an initial response.');
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
    if (!result.ok) setError(result.error ?? 'Unable to start writing plan.');
    setLoading(false);
  };

  const handleSubmitPractice = () => {
    if (!todayTask.ok || !todayTask.data) {
      setError('No task available to submit.');
      return;
    }
    setLoading(true);
    const result = submitDailyWritingPractice({
      student_id: studentId,
      day_number: todayTask.data.day_number,
      submission_text: practiceResponse,
    });
    if (!result.ok || !result.data) {
      setError(result.error ?? 'Failed to submit practice.');
    } else {
      setFeedback(
        `Status: ${result.data.evaluation.completion_status} • Skill: ${result.data.evaluation.target_skill_score}/5 • Next: ${result.data.evaluation.recommended_next_action}`
      );
      setPracticeResponse('');
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 12, display: 'grid', gap: 12, maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ color: '#f9fafb', margin: 0 }}>🧠 Writing Hub</h1>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        {!stateRes.ok ? (
          <p>No writing state yet. Start your first writing mission below.</p>
        ) : !dashboard.ok || !dashboard.data ? (
          <p>Loading dashboard signals…</p>
        ) : (
          <>
            <p>Primary: {dashboard.data.weekly_plan_summary?.primary ?? '—'}</p>
            <p>Secondary: {dashboard.data.weekly_plan_summary?.secondary ?? '—'}</p>
            <p>Maintenance: {dashboard.data.weekly_plan_summary?.maintenance ?? '—'}</p>
            <p>Today: {dashboard.data.todays_task_title ?? 'No task yet'}</p>
            <p>Completed tasks: {dashboard.data.completed_tasks_count}</p>
            <p>Latest score: {dashboard.data.latest_total_score ?? '—'}</p>
            <p>Monthly growth: {dashboard.data.monthly_growth_summary ?? 'Not available yet'}</p>
            {stateRes.data?.latest_assessment && (
              <>
                <p style={{ marginBottom: 4 }}><strong>Subscale progress</strong></p>
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
                <p style={{ marginBottom: 4 }}><strong>Weekly completion tracker</strong></p>
                <div style={{ height: 8, background: '#374151', borderRadius: 999 }}>
                  <div style={{ width: `${Math.min(100, completionRatio * 100)}%`, height: '100%', background: '#60a5fa', borderRadius: 999 }} />
                </div>
                <p style={{ fontSize: 12 }}>
                  {Math.round(completionRatio * 100)}% complete • End-of-week exam task is highlighted as your final mission.
                </p>
              </>
            )}
          </>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Start / Reset Week</h2>
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
          placeholder="Paste your initial writing response"
          style={{ width: '100%', minHeight: 80, marginTop: 8 }}
        />
        <button onClick={handleStart} disabled={loading} style={{ marginTop: 8 }}>
          {loading ? 'Loading…' : 'Start Writing Week'}
        </button>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Today’s Task</h2>
        {!todayTask.ok || !todayTask.data ? (
          <p>{stateRes.ok && stateRes.data?.active_daily_tasks.length ? 'All tasks submitted for now. Great work, agent!' : 'No active task yet.'}</p>
        ) : (
          <>
            <h3>{todayTask.data.title}</h3>
            <p>{todayTask.data.instructions}</p>
            <p>Target skill: {todayTask.data.target_skill}</p>
            <p>Target tags: {todayTask.data.target_tags.join(', ') || 'None'}</p>
            <p>Expected word count: {todayTask.data.expected_word_count}</p>
            <p>Task mode: {todayTask.data.task_mode}</p>
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
            <button onClick={handleSubmitPractice} disabled={loading || !practiceResponse.trim()} style={{ marginTop: 8 }}>
              Submit Practice
            </button>
          </>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Feedback Panel</h2>
        <p>{feedback || 'Submit a task to view feedback.'}</p>
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Weekly Review</h2>
        {!weeklyReview.ok || !weeklyReview.data ? (
          <p>Complete tasks to unlock weekly review.</p>
        ) : (
          <>
            <p>Completed tasks: {weeklyReview.data.weekly_review_summary.completed_tasks}</p>
            <p>Repeated blockers: {weeklyReview.data.weekly_review_summary.top_remaining_weaknesses.join(', ') || 'None'}</p>
            <p>Carry-forward primary: {weeklyReview.data.next_week_planning_inputs.carry_forward_primary_target}</p>
            <p>Carry-forward secondary: {weeklyReview.data.next_week_planning_inputs.carry_forward_secondary_target}</p>
          </>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Monthly Growth</h2>
        {!monthlyReport.ok || !monthlyReport.data ? (
          <p>Monthly report will appear after enough attempts.</p>
        ) : (
          <>
            <p>Score change: {monthlyReport.data.student_facing_monthly_report.score_change}</p>
            <p>Subscale progress: {monthlyReport.data.student_facing_monthly_report.subscale_progress.join(' | ')}</p>
            <p>Strongest gains: {monthlyReport.data.student_facing_monthly_report.strongest_gains.join(', ')}</p>
            <p>Mistakes reduced: {monthlyReport.data.student_facing_monthly_report.repeated_mistakes_reduced.join(', ')}</p>
            <p>Biggest blocker: {monthlyReport.data.student_facing_monthly_report.remaining_blockers[0] ?? 'None'}</p>
            <p>Next month priorities: {monthlyReport.data.student_facing_monthly_report.next_month_priorities.join(', ')}</p>
          </>
        )}
      </section>

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
