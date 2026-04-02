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
      weekly_plan_summary:
        weeklyPlan.ok && weeklyPlan.data
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

const pageStyle = {
  padding: 12,
  display: 'grid',
  gap: 12,
  maxWidth: 860,
  margin: '0 auto',
  color: '#e5e7eb',
};

const shellCardStyle = {
  borderRadius: 20,
  border: '1px solid rgba(59, 130, 246, 0.25)',
  background: 'linear-gradient(180deg, #0f172a 0%, #0b1224 100%)',
  padding: 18,
  boxShadow: '0 10px 30px rgba(2, 6, 23, 0.45)',
};

const missionCardStyle = {
  ...shellCardStyle,
  background: 'linear-gradient(155deg, #1d4ed8 0%, #312e81 55%, #0f172a 100%)',
  border: '1px solid rgba(147, 197, 253, 0.45)',
};

const progressTrackStyle = {
  height: 10,
  background: 'rgba(148, 163, 184, 0.24)',
  borderRadius: 999,
  overflow: 'hidden',
};

const fieldStyle = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(148, 163, 184, 0.4)',
  background: 'rgba(15, 23, 42, 0.88)',
  color: '#f8fafc',
  padding: '12px 14px',
  fontSize: 15,
  lineHeight: 1.5,
};

const primaryButtonStyle = {
  marginTop: 14,
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid rgba(191, 219, 254, 0.5)',
  background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
  color: '#ffffff',
  fontWeight: 800,
  fontSize: 16,
  cursor: 'pointer',
  transition: 'transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
  boxShadow: '0 10px 22px rgba(59, 130, 246, 0.38)',
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

  const missionStateMeta = canStartOrResetWeek
    ? {
        badge: isWeekComplete ? 'Week Complete' : 'Mission Brief',
        title: isWeekComplete ? 'Ready for Your Next Writing Quest?' : 'Launch Your Writing Mission',
        subtitle: isWeekComplete
          ? 'You completed this week. Lock in the momentum with a fresh challenge.'
          : 'Set your prompt, target, and opening response to unlock your week.',
        toneColor: '#bbf7d0',
      }
    : hasTaskToday
      ? {
          badge: 'Live Mission',
          title: 'Today’s Writing Challenge is Active',
          subtitle: 'Stay focused. Submit one clear, high-quality response for today’s objective.',
          toneColor: '#bfdbfe',
        }
      : {
          badge: 'Review Window',
          title: 'Mission in Progress — Review & Recharge',
          subtitle: 'No task due right now. Use feedback and progress insights to prep your next win.',
          toneColor: '#ddd6fe',
        };

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
    <div style={pageStyle}>
      <style>{`
        .writing-hub-card {
          animation: cardIn 380ms ease both;
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .writing-hub-card:hover {
          transform: translateY(-2px);
          border-color: rgba(125, 211, 252, 0.45);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.42);
        }
        .writing-primary-button:hover:enabled {
          transform: translateY(-1px) scale(1.01);
          box-shadow: 0 14px 26px rgba(99, 102, 241, 0.35);
        }
        .writing-primary-button:active:enabled {
          transform: translateY(1px) scale(0.99);
        }
        .progress-fill {
          transition: width 560ms cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <section className="writing-hub-card" style={missionCardStyle}>
        <p style={{ margin: 0, color: missionStateMeta.toneColor, fontWeight: 700, letterSpacing: 0.3, fontSize: 13 }}>{missionStateMeta.badge}</p>
        <h1 style={{ margin: '6px 0 8px', color: '#f8fafc', fontSize: 30, lineHeight: 1.1 }}>Writing Hub</h1>
        <h2 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: 22, lineHeight: 1.2 }}>{missionStateMeta.title}</h2>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 15 }}>{missionStateMeta.subtitle}</p>

        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, color: '#dbeafe', fontSize: 13, fontWeight: 700 }}>
            Step {currentStep} of 4 · {Math.round(completionRatio * 100)}% complete
          </p>
          <div style={progressTrackStyle}>
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, completionRatio * 100)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8 0%, #22d3ee 55%, #34d399 100%)',
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      </section>

      <section className="writing-hub-card" style={shellCardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 20, color: '#f8fafc' }}>1) Start Writing Week</h3>
        {!canStartOrResetWeek && <p style={{ marginTop: 0, color: '#94a3b8' }}>Week already active. Finish today’s task before starting a new week.</p>}
        <label style={{ display: 'block', fontSize: 13, color: '#bfdbfe', marginBottom: 6 }}>Prompt</label>
        <textarea value={promptText} onChange={(e: { target: { value: string } }) => setPromptText(e.target.value)} style={{ ...fieldStyle, minHeight: 92 }} />

        <label style={{ display: 'block', fontSize: 13, color: '#bfdbfe', margin: '10px 0 6px' }}>Target words</label>
        <input
          type="number"
          value={targetWordCount}
          onChange={(e: { target: { value: string } }) => setTargetWordCount(Number(e.target.value) || 0)}
          style={fieldStyle}
        />

        <label style={{ display: 'block', fontSize: 13, color: '#bfdbfe', margin: '10px 0 6px' }}>Initial response</label>
        <textarea
          value={initialResponse}
          onChange={(e: { target: { value: string } }) => setInitialResponse(e.target.value)}
          placeholder="Paste your first writing response"
          style={{ ...fieldStyle, minHeight: 100 }}
        />
      </section>

      <section className="writing-hub-card" style={shellCardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 20, color: '#f8fafc' }}>2) Complete Today’s Task</h3>
        {!todayTask.ok || !todayTask.data ? (
          <p style={{ margin: 0, color: '#cbd5e1' }}>
            {isWeekComplete
              ? 'Week complete. Start a new week when you are ready.'
              : stateRes.ok && stateRes.data?.active_daily_tasks.length
                ? 'No task to submit right now. Check back tomorrow.'
                : 'Start your writing week to get today’s task.'}
          </p>
        ) : (
          <>
            <p style={{ margin: 0, color: '#7dd3fc', fontWeight: 700, fontSize: 13 }}>Active objective</p>
            <h4 style={{ margin: '6px 0 8px', color: '#f8fafc', fontSize: 19 }}>{todayTask.data.title}</h4>
            <p style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: 15 }}>{todayTask.data.instructions}</p>
            <p style={{ margin: '0 0 8px', color: '#94a3b8', fontSize: 13 }}>Target length: about {todayTask.data.expected_word_count} words.</p>
            <ul style={{ margin: '0 0 10px', paddingLeft: 18, color: '#cbd5e1', fontSize: 14 }}>
              {todayTask.data.success_criteria.map((item) => (
                <li key={item} style={{ marginBottom: 4 }}>{item}</li>
              ))}
            </ul>
            <textarea
              value={practiceResponse}
              onChange={(e: { target: { value: string } }) => setPracticeResponse(e.target.value)}
              placeholder="Write your submission here"
              style={{ ...fieldStyle, minHeight: 120 }}
            />
          </>
        )}
      </section>

      <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(16, 185, 129, 0.32)' }}>
        <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 19, color: '#f8fafc' }}>3) Feedback & Momentum</h3>
        <p style={{ margin: 0, color: feedback ? '#a7f3d0' : '#94a3b8', fontSize: 15 }}>
          {feedback || 'Submit today’s task to reveal your feedback and next coaching step.'}
        </p>
      </section>

      <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: isWeekComplete ? 'rgba(250, 204, 21, 0.45)' : 'rgba(148, 163, 184, 0.3)' }}>
        <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 19, color: '#f8fafc' }}>4) Week Completion</h3>
        <p style={{ margin: 0, color: isWeekComplete ? '#fde68a' : '#94a3b8', fontSize: 15 }}>
          {isWeekComplete ? 'Mission complete. Celebrate the streak and launch your next week.' : 'Finish all weekly tasks to unlock your next mission launch.'}
        </p>
      </section>

      <section className="writing-hub-card" style={shellCardStyle}>
        <button
          onClick={handlePrimaryAction}
          disabled={
            loading ||
            (canStartOrResetWeek
              ? !promptText.trim() || !initialResponse.trim() || targetWordCount < 20
              : !hasTaskToday || !practiceResponse.trim())
          }
          className="writing-primary-button"
          style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }}
          aria-label={primaryActionLabel}
        >
          {loading ? 'Please wait…' : primaryActionLabel}
        </button>
      </section>

      <details className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(148, 163, 184, 0.28)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#e2e8f0' }}>View progress details</summary>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {!weeklyReview.ok || !weeklyReview.data ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Weekly summary appears after more task submissions.</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>Weekly completed tasks: {weeklyReview.data.weekly_review_summary.completed_tasks}</p>
              <p style={{ margin: 0, color: '#94a3b8' }}>
                Stuck areas: {weeklyReview.data.weekly_review_summary.top_remaining_weaknesses.join(', ') || 'None'}
              </p>
              <p style={{ margin: 0, color: '#93c5fd' }}>Next focus 1: {weeklyReview.data.next_week_planning_inputs.carry_forward_primary_target}</p>
              <p style={{ margin: 0, color: '#93c5fd' }}>Next focus 2: {weeklyReview.data.next_week_planning_inputs.carry_forward_secondary_target}</p>
            </>
          )}

          {!monthlyReport.ok || !monthlyReport.data ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Monthly growth details will appear after enough attempts.</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>Monthly score change: {monthlyReport.data.student_facing_monthly_report.score_change}</p>
              <p style={{ margin: 0, color: '#94a3b8' }}>Skills improving: {monthlyReport.data.student_facing_monthly_report.subscale_progress.join(' | ')}</p>
              <p style={{ margin: 0, color: '#86efac' }}>Strongest gains: {monthlyReport.data.student_facing_monthly_report.strongest_gains.join(', ')}</p>
              <p style={{ margin: 0, color: '#fca5a5' }}>
                Main blocker: {monthlyReport.data.student_facing_monthly_report.remaining_blockers[0] ?? 'None'}
              </p>
            </>
          )}

          {stateRes.ok && stateRes.data?.latest_assessment && (
            <>
              <p style={{ marginBottom: 4, marginTop: 4, color: '#e2e8f0' }}><strong>Score breakdown</strong></p>
              {[
                ['Content', stateRes.data.latest_assessment.subscores.content],
                ['Organisation', stateRes.data.latest_assessment.subscores.organisation],
                ['Language', stateRes.data.latest_assessment.subscores.language],
                ['Communicative', stateRes.data.latest_assessment.subscores.communicative_achievement ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>
                    {label}: {value}/5
                  </div>
                  <div style={progressTrackStyle}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${(Number(value) / 5) * 100}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #22c55e 0%, #4ade80 100%)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </details>

      {error && (
        <p style={{ ...shellCardStyle, margin: 0, color: '#fecaca', borderColor: 'rgba(248, 113, 113, 0.45)' }}>
          {error}
        </p>
      )}

      {dashboard.ok && dashboard.data && (
        <p style={{ margin: 0, color: '#64748b', fontSize: 12, textAlign: 'center' }}>
          Completed tasks: {dashboard.data.completed_tasks_count} · Latest total score: {dashboard.data.latest_total_score ?? 'N/A'}
        </p>
      )}
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
