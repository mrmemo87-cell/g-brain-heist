import React, { useEffect, useMemo, useState } from 'react';
import {
  getCurrentWeeklyPlan,
  getMonthlyWritingReport,
  requestWritingAiAssist,
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

interface WritingAiPlanAssist {
  focus?: string;
  coaching_points?: string[];
  rewritten_prompt?: string;
  daily_task?: string;
}

interface WritingAiFeedbackAssist {
  strengths?: string[];
  weaknesses?: string[];
  next_steps?: string[];
  monthly_report_summary?: string;
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

const computeWordCountRange = (targetWords: number): { min: number; max: number } => ({
  min: Math.max(1, Math.floor(targetWords * 0.9)),
  max: Math.ceil(targetWords * 1.1),
});

const simplifyStudentLanguage = (text: string): string => {
  const replacements: Array<[RegExp, string]> = [
    [/genre convention task/gi, 'writing style task'],
    [/missed content point/gi, 'missed part of the question'],
    [/partial content coverage/gi, 'only answered part of the question'],
    [/viewpoint \+ support \+ progression/gi, 'clear opinion, good reasons, and clear structure'],
    [/genre focus:/gi, 'remember to:'],
    [/focus on/gi, 'work on'],
  ];
  return replacements.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
};

const taskTypeToFriendlyTitle = (taskType: string, day: number): string => {
  const map: Record<string, string> = {
    'sentence correction': 'Fix and improve sentences',
    'error spotting': 'Find and fix mistakes',
    'sentence combining': 'Join ideas clearly',
    'paragraph ordering': 'Put paragraphs in order',
    'linking words insertion': 'Add linking words',
    'paragraph writing': 'Build a strong paragraph',
    'guided writing': 'Guided writing practice',
    'rewrite from feedback': 'Improve using feedback',
    'full exam-style response': 'Full writing practice',
    'genre convention task': 'Write in the right style',
    'word-count control task': 'Stay close to word target',
  };
  return `Day ${day}: ${map[taskType] ?? 'Writing practice'}`;
};

const taskTypeToFriendlyInstruction = (taskType: string): string => {
  const map: Record<string, string> = {
    'sentence correction': 'Today, fix grammar and wording so each sentence is clear.',
    'error spotting': 'Today, find small mistakes and correct them carefully.',
    'sentence combining': 'Today, connect short ideas into smoother sentences.',
    'paragraph ordering': 'Today, put ideas in a clear order from start to finish.',
    'linking words insertion': 'Today, add linking words to guide your reader.',
    'paragraph writing': 'Today, write one paragraph with a clear main idea and detail.',
    'guided writing': 'Today, follow the steps and answer every part of the question.',
    'rewrite from feedback': 'Today, improve your last response using feedback.',
    'full exam-style response': 'Today, complete a full response like your real writing task.',
    'genre convention task': 'Today, write in the correct style for this task.',
    'word-count control task': 'Today, keep your writing close to the word target.',
  };
  return map[taskType] ?? 'Today, focus on clear and complete writing.';
};

const weaknessTagToStudentTip = (tag: string): string => {
  const tipMap: Record<string, string> = {
    missed_content_point: 'Answer every part of the task question.',
    partial_content_coverage: 'Check that all key points are included.',
    tense_error: 'Check your verb tense so time is clear and consistent.',
    agreement_error: 'Match subjects and verbs (for example: “they were”, not “they was”).',
    weak_paragraphing: 'Split ideas into clear paragraphs so each paragraph has one main point.',
    poor_sequencing: 'Use linking words (first, next, however, finally) to guide your reader.',
    wrong_tone: 'Use the right tone for the task (formal for reports/essays, natural for stories).',
    weak_register_control: 'Choose words that fit the task style and audience.',
    under_length: 'Add enough detail so your answer reaches the expected length.',
  };
  return tipMap[tag] ?? `Focus on clearer ${tag.replaceAll('_', ' ')} in your next response.`;
};

export const WritingHub: React.FC<WritingHubProps> = ({ studentId, grade, genre, month = new Date().toISOString().slice(0, 7) }) => {
  const [promptText, setPromptText] = useState('Write a response that includes:\n- describe the event\n- explain why it mattered\n- give one suggestion');
  const [targetWordCount] = useState(grade <= 7 ? 80 : grade <= 9 ? 120 : 160);
  const [initialResponse, setInitialResponse] = useState('');
  const [practiceResponse, setPracticeResponse] = useState('');
  const [feedback, setFeedback] = useState<string>('');
  const [aiWeeklyFocus, setAiWeeklyFocus] = useState<string>('');
  const [aiCoachingPoints, setAiCoachingPoints] = useState<string[]>([]);
  const [aiTaskWording, setAiTaskWording] = useState<string>('');
  const [aiMonthlyWording, setAiMonthlyWording] = useState<string>('');
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const dashboard = useMemo(() => buildWritingDashboardSnapshot(studentId, month), [studentId, month, feedback]);
  const stateRes = getStudentWritingState(studentId);
  const todayTask = getTodayWritingTask(studentId);
  const weeklyReview = getWeeklyWritingReview(studentId);
  const monthlyReport = getMonthlyWritingReport(studentId, month);
  const totalPlannedTasks = stateRes.ok && stateRes.data ? stateRes.data.active_daily_tasks.length : 0;
  const completedTasksCount = stateRes.ok && stateRes.data ? stateRes.data.completed_daily_tasks.length : 0;
  const isEmptyWritingState = Boolean(
    stateRes.ok &&
      stateRes.data &&
      !stateRes.data.latest_assessment &&
      stateRes.data.active_daily_tasks.length === 0 &&
      stateRes.data.completed_daily_tasks.length === 0
  );
  const showNoWritingState = !stateRes.ok || isEmptyWritingState;
  const hasActiveWeek = totalPlannedTasks > 0;
  const isWeekComplete = hasActiveWeek && completedTasksCount >= totalPlannedTasks && (!todayTask.ok || !todayTask.data);
  const canStartOrResetWeek = !hasActiveWeek || isWeekComplete;
  const hasStartedAnyWeek = Boolean(stateRes.ok && stateRes.data && (stateRes.data.latest_assessment || completedTasksCount > 0));
  const isPreWeek = !hasActiveWeek && !hasStartedAnyWeek;
  const isActiveWeek = hasActiveWeek && !isWeekComplete;
  const hasTaskToday = Boolean(todayTask.ok && todayTask.data);
  const latestWeaknessTags = stateRes.ok && stateRes.data?.latest_assessment
    ? stateRes.data.latest_assessment.weakness_tags.slice(0, 3)
    : [];
  const latestWeaknesses = latestWeaknessTags.map((tag) => tag.replaceAll('_', ' '));
  const focusCoachingPoints = (aiCoachingPoints.length > 0
    ? aiCoachingPoints.slice(0, 3)
    : latestWeaknessTags.slice(0, 3).map((tag) => weaknessTagToStudentTip(tag))).slice(0, 3);
  const wordCountRange = computeWordCountRange(targetWordCount);

  const completionRatio =
    stateRes.ok && stateRes.data && stateRes.data.active_daily_tasks.length > 0
      ? stateRes.data.completed_daily_tasks.length / stateRes.data.active_daily_tasks.length
      : 0;
  const weeklyPlanStages = [
    { key: 'start', label: 'Start week' },
    { key: 'practice', label: 'Daily practice' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'complete', label: 'Week complete' },
  ];
  const currentStageIndex = isWeekComplete ? 3 : isActiveWeek ? (hasTaskToday ? 1 : 2) : 0;
  const motivationalLine = isWeekComplete
    ? 'Excellent work — you finished this week.'
    : completedTasksCount > 0
      ? `You’re getting closer to finishing this week. ${completedTasksCount} task${completedTasksCount === 1 ? '' : 's'} completed.`
      : 'Great start — your progress will grow with each task you submit.';
  const weeklyGoals = [
    ...focusCoachingPoints.map((item) => simplifyStudentLanguage(item)),
    simplifyStudentLanguage(dashboard.data?.weekly_plan_summary?.primary ?? ''),
  ]
    .filter(Boolean)
    .slice(0, 3);

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

  useEffect(() => {
    let cancelled = false;
    const loadAiPlanAssist = async () => {
      if (!stateRes.ok || !stateRes.data?.latest_assessment || aiBusy) return;
      setAiBusy(true);
      const planAssist = await requestWritingAiAssist({
        mode: 'plan_assist',
        prompt_text: promptText,
        weaknesses: latestWeaknesses,
        grade,
        genre,
      });
      if (!cancelled && planAssist.ok && planAssist.data) {
        const ai = (planAssist.data.result ?? {}) as WritingAiPlanAssist;
        if (ai.focus?.trim()) setAiWeeklyFocus(ai.focus.trim());
        if (Array.isArray(ai.coaching_points) && ai.coaching_points.length > 0) {
          setAiCoachingPoints(ai.coaching_points.slice(0, 3));
        }
        if (ai.daily_task?.trim()) setAiTaskWording(ai.daily_task.trim());
      }
      if (!cancelled) setAiBusy(false);
    };
    void loadAiPlanAssist();
    return () => {
      cancelled = true;
    };
  }, [studentId, month, stateRes.ok, stateRes.data?.latest_assessment?.total_score]);

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

  const handleEnhancePrompt = async () => {
    setAiBusy(true);
    const response = await requestWritingAiAssist({
      mode: 'prompt_rewrite',
      prompt_text: promptText,
      weaknesses: latestWeaknesses,
      grade,
      genre,
    });
    if (response.ok && response.data) {
      const ai = (response.data.result ?? {}) as WritingAiPlanAssist;
      if (ai.rewritten_prompt?.trim()) setPromptText(ai.rewritten_prompt.trim());
      if (ai.daily_task?.trim()) setAiTaskWording(ai.daily_task.trim());
      if (ai.focus?.trim()) setAiWeeklyFocus(ai.focus.trim());
      if (Array.isArray(ai.coaching_points) && ai.coaching_points.length > 0) {
        setAiCoachingPoints(ai.coaching_points.slice(0, 3));
      }
    }
    setAiBusy(false);
  };

  const handleSubmitPractice = async () => {
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
      const deterministicFeedback = `Great job! ${result.data.evaluation.completion_status}. Skill score: ${result.data.evaluation.target_skill_score}/5. Next: ${result.data.evaluation.recommended_next_action}.`;
      setFeedback(deterministicFeedback);
      const aiFeedback = await requestWritingAiAssist({
        mode: 'feedback',
        prompt_text: promptText,
        student_response: practiceResponse,
        grade,
        genre,
      });
      if (aiFeedback.ok && aiFeedback.data) {
        const ai = (aiFeedback.data.result ?? {}) as WritingAiFeedbackAssist;
        const refined = [
          ...(ai.strengths ?? []).slice(0, 2).map((item) => `✅ ${item}`),
          ...(ai.weaknesses ?? []).slice(0, 2).map((item) => `⚠️ ${item}`),
          ...(ai.next_steps ?? []).slice(0, 2).map((item) => `➡️ ${item}`),
        ].join(' ');
        if (refined) setFeedback(refined);
        if (ai.monthly_report_summary?.trim()) setAiMonthlyWording(ai.monthly_report_summary.trim());
      }
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
    void handleSubmitPractice();
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
        <p style={{ margin: '0 0 4px', color: '#cbd5e1', fontSize: 13 }}>Dashboard</p>
        <h2 style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: 22, lineHeight: 1.2 }}>{missionStateMeta.title}</h2>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 15 }}>{missionStateMeta.subtitle}</p>
        {showNoWritingState && <p style={{ margin: '8px 0 0', color: '#bfdbfe', fontSize: 13 }}>No writing state yet</p>}
        {!isWeekComplete && (
          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: '#dbeafe', fontSize: 13, fontWeight: 700 }}>
              {hasTaskToday ? 'Current step: Today’s task' : 'Current step: Start your writing week'}
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
        )}
      </section>

      {isPreWeek && (
        <section className="writing-hub-card" style={shellCardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 20, color: '#f8fafc' }}>Start Writing Week</h3>
          <label style={{ display: 'block', fontSize: 13, color: '#bfdbfe', marginBottom: 6 }}>Task prompt</label>
          <div style={{ ...fieldStyle, minHeight: 92, whiteSpace: 'pre-wrap' }}>{promptText}</div>
          <button
            type="button"
            onClick={() => void handleEnhancePrompt()}
            disabled={aiBusy || !promptText.trim()}
            style={{
              marginTop: 8,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(147, 197, 253, 0.65)',
              background: 'rgba(30, 41, 59, 0.95)',
              color: '#dbeafe',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {aiBusy ? 'Clarifying task…' : 'Make this task clearer'}
          </button>
          <p style={{ margin: '6px 0 0', color: '#93c5fd', fontSize: 12 }}>
            This only rewrites the instructions to be easier to understand. It does not change what you need to do.
          </p>

          <p style={{ margin: '10px 0 6px', fontSize: 13, color: '#bfdbfe' }}>
            Word count: {wordCountRange.min}–{wordCountRange.max} words
          </p>

          <label style={{ display: 'block', fontSize: 13, color: '#bfdbfe', margin: '10px 0 6px' }}>Initial response</label>
          <textarea
            value={initialResponse}
            onChange={(e: { target: { value: string } }) => setInitialResponse(e.target.value)}
            placeholder="Paste your first writing response"
            style={{ ...fieldStyle, minHeight: 100 }}
          />
        </section>
      )}

      {(isActiveWeek || isWeekComplete) && (
        <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(147, 197, 253, 0.45)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 20, color: '#f8fafc' }}>Your weekly path</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            {weeklyPlanStages.map((stage, index) => {
              const isCurrent = index === currentStageIndex;
              const isDone = index < currentStageIndex || (isWeekComplete && index === 3);
              return (
                <div
                  key={stage.key}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 12,
                    textAlign: 'center',
                    border: `1px solid ${isCurrent ? 'rgba(125, 211, 252, 0.95)' : 'rgba(148, 163, 184, 0.35)'}`,
                    background: isCurrent
                      ? 'linear-gradient(145deg, rgba(30, 64, 175, 0.6), rgba(15, 23, 42, 0.85))'
                      : isDone
                        ? 'rgba(16, 185, 129, 0.16)'
                        : 'rgba(15, 23, 42, 0.7)',
                    color: isCurrent ? '#dbeafe' : '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{isDone ? '✅' : isCurrent ? '👉' : '•'}</div>
                  <div>{stage.label}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isActiveWeek && (
        <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(125, 211, 252, 0.7)', background: 'linear-gradient(160deg, #0f172a 0%, #0b1737 55%, #0b1224 100%)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 20, color: '#f8fafc' }}>Your focus this week</h3>
          <p style={{ margin: '0 0 10px', color: '#bfdbfe', fontSize: 15 }}>
            {aiWeeklyFocus || 'You’re improving your idea development and writing control this week.'}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 14 }}>
            {(weeklyGoals.length > 0 ? weeklyGoals : ['Answer all parts of the task.', 'Add clear support for your ideas.', 'Check small grammar mistakes before submitting.']).map((item) => (
              <li key={item} style={{ marginBottom: 4 }}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {!canStartOrResetWeek && (
        <section className="writing-hub-card" style={shellCardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 20, color: '#f8fafc' }}>Today’s Task</h3>
          {!todayTask.ok || !todayTask.data ? (
            <p style={{ margin: 0, color: '#cbd5e1' }}>No task to submit right now. Check back tomorrow.</p>
          ) : (
            <>
              <h4 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: 19 }}>{taskTypeToFriendlyTitle(todayTask.data.task_type, todayTask.data.day_number)}</h4>
              <p style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: 15 }}>
                {simplifyStudentLanguage(aiTaskWording || taskTypeToFriendlyInstruction(todayTask.data.task_type))}
              </p>
              <p style={{ margin: '0 0 8px', color: '#94a3b8', fontSize: 13 }}>
                Expected word count: {computeWordCountRange(todayTask.data.expected_word_count).min}–{computeWordCountRange(todayTask.data.expected_word_count).max} words
              </p>
              <ul style={{ margin: '0 0 10px', paddingLeft: 18, color: '#cbd5e1', fontSize: 14 }}>
                {todayTask.data.success_criteria.map((item) => (
                  <li key={item} style={{ marginBottom: 4 }}>{simplifyStudentLanguage(item)}</li>
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
      )}

      {!isWeekComplete && (
        <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(16, 185, 129, 0.32)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 19, color: '#f8fafc' }}>Feedback & Momentum</h3>
          <p style={{ margin: 0, color: feedback ? '#a7f3d0' : '#94a3b8', fontSize: 15 }}>
            {feedback || motivationalLine}
          </p>
        </section>
      )}

      {isWeekComplete && (
        <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(250, 204, 21, 0.45)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 22, color: '#fde68a' }}>Week complete</h3>
          <p style={{ margin: 0, color: '#fef3c7', fontSize: 15 }}>
            Great work — you finished every task this week. All tasks submitted for now. Start a new week when you are ready for the next challenge.
          </p>
        </section>
      )}

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
          <p style={{ margin: 0, color: '#bfdbfe' }}>Primary: {dashboard.data?.weekly_plan_summary?.primary ?? 'N/A'}</p>
          {!weeklyReview.ok || !weeklyReview.data ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Weekly summary appears after more task submissions.</p>
          ) : (
            <>
              <p style={{ margin: 0, color: '#bfdbfe' }}>Weekly Review</p>
              <p style={{ margin: 0 }}>Weekly completed tasks: {weeklyReview.data.weekly_review_summary.completed_tasks}</p>
              <p style={{ margin: 0, color: '#94a3b8' }}>
                Keep improving: {weeklyReview.data.weekly_review_summary.top_remaining_weaknesses.map((item) => simplifyStudentLanguage(item)).join(', ') || 'None'}
              </p>
              <p style={{ margin: 0, color: '#93c5fd' }}>Carry-forward primary: {weeklyReview.data.next_week_planning_inputs.carry_forward_primary_target}</p>
              <p style={{ margin: 0, color: '#93c5fd' }}>Next focus 2: {weeklyReview.data.next_week_planning_inputs.carry_forward_secondary_target}</p>
            </>
          )}

          {!monthlyReport.ok || !monthlyReport.data ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>Monthly growth details will appear after enough attempts.</p>
          ) : (
            <>
              <p style={{ margin: 0, color: '#bfdbfe' }}>Monthly Growth</p>
              <p style={{ margin: 0 }}>Score change: {monthlyReport.data.student_facing_monthly_report.score_change}</p>
              {aiMonthlyWording && <p style={{ margin: 0, color: '#bfdbfe' }}>{aiMonthlyWording}</p>}
              <p style={{ margin: 0, color: '#94a3b8' }}>Subscale progress: {monthlyReport.data.student_facing_monthly_report.subscale_progress.join(' | ')}</p>
              <p style={{ margin: 0, color: '#86efac' }}>Strongest gains: {monthlyReport.data.student_facing_monthly_report.strongest_gains.join(', ')}</p>
              <p style={{ margin: 0, color: '#fca5a5' }}>
                Biggest blocker: {monthlyReport.data.student_facing_monthly_report.remaining_blockers[0] ?? 'None'}
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
