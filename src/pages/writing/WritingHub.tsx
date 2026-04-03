import React, { useEffect, useMemo, useState } from 'react';
import {
  getCurrentWeeklyPlan,
  getStudentGenrePathStatuses,
  getWritingHydrationStatus,
  getMonthlyWritingReport,
  requestWritingAiAssist,
  retryWritingHydration,
  subscribeToWritingHydrationStatus,
  getStudentWritingState,
  getStudentWritingHubSnapshot,
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
type SupportedGenre = WritingHubProps['genre'];

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
  month: string,
  genre: SupportedGenre
): { ok: boolean; data?: WritingDashboardSnapshot; error?: string } => {
  const stateRes = getStudentWritingState(studentId, genre);
  if (!stateRes.ok || !stateRes.data) return { ok: false, error: stateRes.error ?? 'Unable to load writing state.' };

  const weeklyPlan = getCurrentWeeklyPlan(studentId, genre);
  const today = getTodayWritingTask(studentId, genre);
  const monthly = getMonthlyWritingReport(studentId, month, genre);

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
  maxWidth: 920,
  margin: '0 auto',
  color: '#e5e7eb',
};

const shellCardStyle = {
  borderRadius: 20,
  border: '1px solid rgba(59, 130, 246, 0.25)',
  background: 'linear-gradient(180deg, #0f172a 0%, #0b1224 100%)',
  padding: 16,
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
  marginTop: 10,
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

const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 999,
  padding: '6px 10px',
  border: '1px solid rgba(191, 219, 254, 0.35)',
  background: 'rgba(15, 23, 42, 0.4)',
  fontSize: 12,
  color: '#dbeafe',
  fontWeight: 700,
};

const computeWordCountRange = (targetWords: number): { min: number; max: number } => ({
  min: Math.max(1, Math.floor(targetWords * 0.9)),
  max: Math.ceil(targetWords * 1.1),
});

const simplifyStudentLanguage = (text: string): string => {
  const replacements: Array<[RegExp, string]> = [
    [/genre convention task/gi, 'style and format practice'],
    [/missed content point/gi, 'you missed one part of the question'],
    [/partial content coverage/gi, 'you only answered part of the question'],
    [/viewpoint \+ support \+ progression/gi, 'clear opinion, useful detail, and clear flow'],
    [/genre focus:/gi, 'remember to:'],
    [/focus on/gi, 'work on'],
    [/reshelloponse/gi, 'response'],
  ];
  return replacements.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
};

const toWordCountLabel = (targetWords: number): string => {
  const range = computeWordCountRange(targetWords);
  return `${range.min}–${range.max} words`;
};

const SUPPORTED_GENRES: SupportedGenre[] = ['essay', 'story', 'article', 'review', 'report', 'email', 'paragraph'];

const defaultPromptByGenre: Record<SupportedGenre, string> = {
  essay: 'Write about an event, explain why it mattered, and say how it could be better.',
  story: 'Write a short story about an event, explain why it mattered to the character, and suggest how it could be better.',
  article: 'Write an article about an event, explain why it mattered, and suggest one improvement.',
  review: 'Write a review of an event, explain why it mattered, and suggest how it could be better next time.',
  report: 'Write a report about an event, explain why it mattered, and recommend one improvement.',
  email: 'Write an email about an event, explain why it mattered, and suggest how it could be better.',
  paragraph: 'Write one clear paragraph about an event, explain why it mattered, and suggest one improvement.',
};

const toGenreLabel = (genre: SupportedGenre): string => genre.charAt(0).toUpperCase() + genre.slice(1);
const toGenreStateCopy = (
  status: 'not_started' | 'week_active' | 'week_complete',
  day: number | null,
  completed: number,
  total: number
): string => {
  if (status === 'not_started') return 'Not started yet';
  if (status === 'week_complete') return 'Week complete';
  if (day) return `Day ${day} ready`;
  if (total > 0) return `Week active • ${completed}/${total} tasks`;
  return 'Week active';
};

const buildReadableTaskSummary = (promptText: string): string => {
  const normalized = simplifyStudentLanguage(promptText).replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Write about an event, explain why it mattered, and say how it could be better.';
  const hasEvent = /event|experience|situation|story/i.test(normalized);
  const hasImportance = /mattered|important|why it mattered|why it was important/i.test(normalized);
  const hasImprove = /better|improve|suggestion|recommend|how it could be better/i.test(normalized);
  if (hasEvent && hasImportance && hasImprove) {
    return 'Write about an event, explain why it mattered, and say how it could be better.';
  }
  return normalized;
};

const toStudentLabel = (text: string): string => {
  return simplifyStudentLanguage(text)
    .replace(/carry-forward primary/gi, 'next focus')
    .replace(/primary/gi, 'main focus')
    .replace(/maintain balanced writing control/gi, 'keep your writing clear and balanced')
    .replace(/raw delta-heavy technical phrasing/gi, 'technical progress notes')
    .replace(/\s+/g, ' ')
    .trim();
};

const getProgressTone = (score: number | null): { color: string; glow: string; label: string } => {
  if (score == null) return { color: '#64748b', glow: 'rgba(100, 116, 139, 0.35)', label: 'No score yet' };
  if (score >= 4) return { color: '#22c55e', glow: 'rgba(34, 197, 94, 0.45)', label: 'Strong' };
  if (score >= 3) return { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)', label: 'Building' };
  if (score >= 2) return { color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)', label: 'In progress' };
  return { color: '#f97316', glow: 'rgba(249, 115, 22, 0.45)', label: 'Needs attention' };
};

const parseSubscaleProgress = (entries: string[]): Record<string, number | null> => {
  const values: Record<string, number | null> = {
    content: null,
    organisation: null,
    language: null,
    communicative_achievement: null,
  };
  entries.forEach((entry) => {
    const contentMatch = entry.match(/content[:\s]*([+\-]?\d+(\.\d+)?)/i);
    if (contentMatch) values['content'] = Number(contentMatch[1]);
    const organisationMatch = entry.match(/organisation[:\s]*([+\-]?\d+(\.\d+)?)/i);
    if (organisationMatch) values['organisation'] = Number(organisationMatch[1]);
    const languageMatch = entry.match(/language[:\s]*([+\-]?\d+(\.\d+)?)/i);
    if (languageMatch) values['language'] = Number(languageMatch[1]);
    const achievementMatch = entry.match(/communicative achievement[:\s]*([+\-]?\d+(\.\d+)?)/i);
    if (achievementMatch) values['communicative_achievement'] = Number(achievementMatch[1]);
  });
  return values;
};

const taskTypeToFriendlyTitle = (taskType: string, day: number): string => {
  const map: Record<string, string> = {
    'sentence correction': 'Fix and improve sentences',
    'error spotting': 'Find and fix mistakes',
    'sentence combining': 'Connect ideas clearly',
    'paragraph ordering': 'Build better paragraph order',
    'linking words insertion': 'Add linking words',
    'paragraph writing': 'Write a stronger paragraph',
    'guided writing': 'Guided writing practice',
    'rewrite from feedback': 'Improve using feedback',
    'full exam-style response': 'Full writing practice',
    'genre convention task': 'Use the right writing style',
    'word-count control task': 'Stay close to word range',
  };
  return `Day ${day}: ${map[taskType] ?? 'Writing practice'}`;
};

const taskTypeToFriendlyInstruction = (taskType: string): string => {
  const map: Record<string, string> = {
    'sentence correction': 'Fix grammar and wording so each sentence is clear.',
    'error spotting': 'Find small mistakes and correct them carefully.',
    'sentence combining': 'Connect short ideas into smoother sentences.',
    'paragraph ordering': 'Put ideas in a clear order from start to finish.',
    'linking words insertion': 'Add linking words to guide your reader.',
    'paragraph writing': 'Write one paragraph with a clear main idea and detail.',
    'guided writing': 'Follow the steps and answer every part of the question.',
    'rewrite from feedback': 'Improve your last response using feedback.',
    'full exam-style response': 'Complete a full response like your real writing task.',
    'genre convention task': 'Use the right style for this type of writing.',
    'word-count control task': 'Keep your writing close to the word range.',
  };
  return map[taskType] ?? 'Focus on clear and complete writing.';
};

const weaknessTagToStudentTip = (tag: string): string => {
  const tipMap: Record<string, string> = {
    missed_content_point: 'Answer every part of the question.',
    partial_content_coverage: 'Include all key points so your response feels complete.',
    tense_error: 'Keep verb tense clear and consistent.',
    agreement_error: 'Check subject + verb agreement carefully.',
    weak_paragraphing: 'Split ideas into clear paragraphs with one main point each.',
    poor_sequencing: 'Use linking words so your ideas flow clearly.',
    wrong_tone: 'Use the right tone for the task type.',
    weak_register_control: 'Choose words that match your audience and task.',
    under_length: 'Add useful detail so you stay near the word range.',
  };
  return tipMap[tag] ?? `Focus on clearer ${tag.replaceAll('_', ' ')} in your next response.`;
};

const estimateWeeklyTargetScoreRange = (
  baselineScore: number | null,
  supportLevel: 'high' | 'medium' | 'low' | null
): { low: number; high: number } | null => {
  if (baselineScore == null) return null;
  const growthBySupport: Record<'high' | 'medium' | 'low', { min: number; max: number }> = {
    high: { min: 0.5, max: 1.2 },
    medium: { min: 0.8, max: 1.8 },
    low: { min: 1.0, max: 2.2 },
  };
  const growth = growthBySupport[supportLevel ?? 'medium'];
  return {
    low: Math.round(baselineScore + growth.min),
    high: Math.round(baselineScore + growth.max),
  };
};

export const WritingHub: React.FC<WritingHubProps> = ({ studentId, grade, genre, month = new Date().toISOString().slice(0, 7) }) => {
  const [activeGenre, setActiveGenre] = useState<SupportedGenre>(genre);
  const [promptText, setPromptText] = useState(defaultPromptByGenre[genre]);
  const [targetWordCount] = useState(grade <= 7 ? 80 : grade <= 9 ? 120 : 160);
  const [initialResponse, setInitialResponse] = useState('');
  const [practiceResponse, setPracticeResponse] = useState('');
  const [feedback, setFeedback] = useState<string>('');
  const [uiNotice, setUiNotice] = useState<string>('');
  const [aiWeeklyFocus, setAiWeeklyFocus] = useState<string>('');
  const [aiCoachingPoints, setAiCoachingPoints] = useState<string[]>([]);
  const [aiTaskWording, setAiTaskWording] = useState<string>('');
  const [aiMonthlyWording, setAiMonthlyWording] = useState<string>('');
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [hydrationStatus, setHydrationStatus] = useState(getWritingHydrationStatus());
  const [isRefreshingProgress, setIsRefreshingProgress] = useState(false);
  const [isGenreSwitching, setIsGenreSwitching] = useState(false);
  const initializing = hydrationStatus === 'idle' || hydrationStatus === 'loading';

  const dashboard = useMemo(() => buildWritingDashboardSnapshot(studentId, month, activeGenre), [studentId, month, activeGenre, feedback]);
  const stateRes = getStudentWritingState(studentId, activeGenre);
  const todayTask = getTodayWritingTask(studentId, activeGenre);
  const weeklyReview = getWeeklyWritingReview(studentId, activeGenre);
  const monthlyReport = getMonthlyWritingReport(studentId, month, activeGenre);
  const hubSnapshot = getStudentWritingHubSnapshot(studentId, activeGenre);
  const genreStatuses = getStudentGenrePathStatuses(studentId, SUPPORTED_GENRES);

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
  const hasStartedAnyWeek = Boolean(stateRes.ok && stateRes.data && (stateRes.data.latest_assessment || completedTasksCount > 0));
  const isPreWeek = !hasActiveWeek && !hasStartedAnyWeek;
  const isActiveWeek = hasActiveWeek && !isWeekComplete;
  const hasTaskToday = Boolean(todayTask.ok && todayTask.data);

  const latestWeaknessTags = stateRes.ok && stateRes.data?.latest_assessment
    ? stateRes.data.latest_assessment.weakness_tags.slice(0, 3)
    : [];
  const latestWeaknesses = latestWeaknessTags.map((tag) => tag.replaceAll('_', ' '));
  const firstAttemptAssessment = hubSnapshot.ok ? hubSnapshot.data?.first_attempt_assessment ?? null : null;
  const originalPromptText = hubSnapshot.ok ? hubSnapshot.data?.original_prompt_text ?? null : null;
  const firstAttemptSubmission = hubSnapshot.ok ? hubSnapshot.data?.first_attempt_submission ?? null : null;
  const firstAttemptWeaknesses = firstAttemptAssessment?.weakness_tags.slice(0, 3) ?? [];
  const studentFriendlyWeaknesses = (firstAttemptWeaknesses.length > 0 ? firstAttemptWeaknesses : latestWeaknessTags)
    .slice(0, 3)
    .map((tag) => weaknessTagToStudentTip(tag));
  const primarySupportLevel = stateRes.ok && stateRes.data?.active_daily_tasks.length
    ? stateRes.data.active_daily_tasks[0].support_level
    : null;
  const estimatedTargetRange = estimateWeeklyTargetScoreRange(firstAttemptAssessment?.total_score ?? null, primarySupportLevel);
  const focusCoachingPoints = (aiCoachingPoints.length > 0
    ? aiCoachingPoints.slice(0, 3)
    : latestWeaknessTags.slice(0, 3).map((tag) => weaknessTagToStudentTip(tag))).slice(0, 3);
  const monthlySubscaleDeltas = parseSubscaleProgress(monthlyReport.data?.student_facing_monthly_report.subscale_progress ?? []);
  const subscaleCards = [
    { key: 'content', label: 'Content', score: firstAttemptAssessment?.subscores.content ?? null, delta: monthlySubscaleDeltas['content'] },
    { key: 'organisation', label: 'Organisation', score: firstAttemptAssessment?.subscores.organisation ?? null, delta: monthlySubscaleDeltas['organisation'] },
    { key: 'language', label: 'Language', score: firstAttemptAssessment?.subscores.language ?? null, delta: monthlySubscaleDeltas['language'] },
    {
      key: 'communicative_achievement',
      label: 'Communicative Achievement',
      score: firstAttemptAssessment?.subscores.communicative_achievement ?? null,
      delta: monthlySubscaleDeltas['communicative_achievement'],
    },
  ];

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

  const weeklyGoals = [
    ...focusCoachingPoints.map((item) => simplifyStudentLanguage(item)),
    simplifyStudentLanguage(dashboard.data?.weekly_plan_summary?.primary ?? ''),
  ]
    .filter(Boolean)
    .slice(0, 3);
  const showWeeklyEvidence = Boolean(weeklyReview.ok && weeklyReview.data && weeklyReview.data.weekly_review_summary.completed_tasks > 0);
  const showMonthlyEvidence = Boolean(
    monthlyReport.ok &&
      monthlyReport.data &&
      (monthlyReport.data.monthly_comparison_summary.currentMonth?.attempts ?? 0) > 0 &&
      monthlyReport.data.monthly_comparison_summary.scoreDelta !== null
  );
  const weeklySummary = weeklyReview.ok && weeklyReview.data ? weeklyReview.data.weekly_review_summary : null;
  const nextWeekInputs = weeklyReview.ok && weeklyReview.data ? weeklyReview.data.next_week_planning_inputs : null;
  const monthlyFacingReport = monthlyReport.ok && monthlyReport.data ? monthlyReport.data.student_facing_monthly_report : null;

  const handleRetryLoad = () => {
    setUiNotice('Refreshing your Writing Hub…');
    setError('');
    setIsRefreshingProgress(true);
    void retryWritingHydration().finally(() => {
      window.setTimeout(() => setIsRefreshingProgress(false), 320);
    });
  };

  useEffect(() => {
    setActiveGenre(genre);
    setPromptText(defaultPromptByGenre[genre]);
  }, [genre]);

  useEffect(() => {
    const unsubscribe = subscribeToWritingHydrationStatus((status) => setHydrationStatus(status));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isGenreSwitching) return;
    if (initializing) return;
    if (genreStatuses.ok) {
      setIsGenreSwitching(false);
    }
  }, [isGenreSwitching, initializing, genreStatuses.ok, activeGenre]);

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
        genre: activeGenre,
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
  }, [studentId, month, stateRes.ok, stateRes.data?.latest_assessment?.total_score, activeGenre, promptText]);

  const handleStart = (options?: { fromWeekComplete?: boolean }) => {
    const fromWeekComplete = Boolean(options?.fromWeekComplete);
    setLoading(true);
    setError('');
    setUiNotice('Checking your writing…');
    const safeInitialResponse = initialResponse.trim() || (fromWeekComplete
      ? 'I am ready to start a new writing week and improve my focus skills with clear writing.'
      : '');
    if (!promptText.trim() || !safeInitialResponse.trim() || targetWordCount < 20) {
      setError('Please add your first writing response so we can build your weekly plan.');
      setLoading(false);
      return;
    }
    const result = submitInitialWritingAssessment({
      student_id: studentId,
      grade,
      genre: activeGenre,
      prompt_text: promptText,
      target_word_count: targetWordCount,
      student_response: safeInitialResponse,
    });

    if (!result.ok) {
      setError('We could not start your week yet. Please try again.');
      setLoading(false);
      return;
    }

    setUiNotice('Building your weekly plan…');
    window.setTimeout(() => {
      setLoading(false);
      setUiNotice('Your writing week is ready. Let’s go!');
    }, 450);
  };

  const handleEnhancePrompt = async () => {
    setError('');
    setAiBusy(true);
    setUiNotice('Making this task clearer…');
    try {
      const response = await requestWritingAiAssist({
        mode: 'prompt_rewrite',
        prompt_text: promptText,
        weaknesses: latestWeaknesses,
        grade,
        genre: activeGenre,
      });
      if (response.ok && response.data) {
        const ai = (response.data.result ?? {}) as WritingAiPlanAssist;
        if (ai.rewritten_prompt?.trim()) setPromptText(ai.rewritten_prompt.trim());
        if (ai.daily_task?.trim()) setAiTaskWording(ai.daily_task.trim());
        if (ai.focus?.trim()) setAiWeeklyFocus(ai.focus.trim());
        if (Array.isArray(ai.coaching_points) && ai.coaching_points.length > 0) {
          setAiCoachingPoints(ai.coaching_points.slice(0, 3));
        }
        setUiNotice('Task wording updated.');
      } else {
        setError('Could not improve the task wording right now. Please try again.');
      }
    } catch (aiError) {
      console.error('Writing task wording assist failed:', aiError);
      setError('Could not improve the task wording right now. Please try again.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSubmitPractice = async () => {
    if (loading) return;
    if (!todayTask.ok || !todayTask.data) {
      setError('Today’s task is not ready yet. Please refresh in a moment.');
      return;
    }
    setLoading(true);
    setError('');
    setUiNotice('Checking your writing…');

    const result = submitDailyWritingPractice({
      student_id: studentId,
      genre: activeGenre,
      day_number: todayTask.data.day_number,
      submission_text: practiceResponse,
    });
    if (!result.ok || !result.data) {
      setError('We could not submit your writing. Please retry.');
      setLoading(false);
      return;
    }

    const deterministicFeedback = `Great work. ${result.data.evaluation.completion_status}. Skill score: ${result.data.evaluation.target_skill_score}/5.`;
    setFeedback(deterministicFeedback);
    setUiNotice('Nice submit! Preparing your coaching feedback…');

    try {
      const aiFeedback = await requestWritingAiAssist({
        mode: 'feedback',
        prompt_text: promptText,
        student_response: practiceResponse,
        grade,
        genre: activeGenre,
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
    } catch (aiError) {
      console.error('Writing feedback assist failed:', aiError);
      setError('Your submission was saved, but feedback could not load. Please try again.');
    }

    setPracticeResponse('');
    setLoading(false);
    setIsRefreshingProgress(true);
    setUiNotice('Progress updated. Keep going!');
    window.setTimeout(() => setIsRefreshingProgress(false), 350);
  };

  const handleChangeWritingType = (nextGenre: SupportedGenre) => {
    if (nextGenre === activeGenre) return;
    setIsGenreSwitching(true);
    setActiveGenre(nextGenre);
    setPromptText(defaultPromptByGenre[nextGenre]);
    setInitialResponse('');
    setPracticeResponse('');
    setFeedback('');
    setAiWeeklyFocus('');
    setAiCoachingPoints([]);
    setAiTaskWording('');
    setUiNotice(`${toGenreLabel(nextGenre)} path selected. Loading your progress for this writing path…`);
  };

  const renderLoadingSkeleton = () => (
    <>
      <section className="writing-hub-card" style={missionCardStyle}>
        <p style={{ ...pillStyle, margin: 0 }}>Loading Writing Hub…</p>
        <div style={{ marginTop: 12, height: 18, borderRadius: 10, background: 'rgba(148,163,184,0.35)' }} />
        <div style={{ marginTop: 8, height: 12, borderRadius: 10, background: 'rgba(148,163,184,0.25)' }} />
      </section>
      <section className="writing-hub-card" style={shellCardStyle}>
        <div style={{ height: 12, borderRadius: 10, background: 'rgba(148,163,184,0.3)' }} />
        <div style={{ marginTop: 8, height: 100, borderRadius: 12, background: 'rgba(148,163,184,0.2)' }} />
      </section>
    </>
  );

  return (
    <div style={pageStyle}>
      <style>{`
        .writing-hub-card {
          animation: cardIn 340ms ease both;
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .writing-hub-card:hover {
          transform: translateY(-2px);
          border-color: rgba(125, 211, 252, 0.45);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.42);
        }
        .writing-primary-button:hover:enabled { transform: translateY(-1px) scale(1.01); }
        .writing-primary-button:active:enabled { transform: translateY(1px) scale(0.99); }
        .progress-fill { transition: width 560ms cubic-bezier(.34,1.56,.64,1); }
        .focus-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .mini-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
        @media (min-width: 760px) {
          .focus-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .mini-grid { grid-template-columns: repeat(4,minmax(0,1fr)); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {initializing || isGenreSwitching ? renderLoadingSkeleton() : (
        <>
          <section className="writing-hub-card" style={missionCardStyle}>
            <p style={{ margin: 0, color: '#dbeafe', fontWeight: 700, fontSize: 13 }}>
              {isWeekComplete ? 'Week complete' : isActiveWeek ? 'Week active' : 'First step'}
            </p>
            <h1 style={{ margin: '6px 0 10px', color: '#f8fafc', fontSize: 30, lineHeight: 1.1 }}>
              {isPreWeek ? 'Welcome to your Writing Hub' : isWeekComplete ? 'Great work — week finished' : 'Your Writing Hub'}
            </h1>
            <div style={{ margin: '0 0 10px', display: 'grid', gap: 8 }}>
              <label style={{ color: '#bfdbfe', fontSize: 13, fontWeight: 700 }}>
                Choose your writing path
              </label>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                {SUPPORTED_GENRES.map((item) => {
                  const status = genreStatuses.ok ? genreStatuses.data?.find((row) => row.genre === item) : null;
                  const isSelected = item === activeGenre;
                  const progress = status && status.total_tasks_count > 0
                    ? Math.min(100, Math.round((status.completed_tasks_count / status.total_tasks_count) * 100))
                    : 0;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleChangeWritingType(item)}
                      aria-pressed={isSelected}
                      aria-label={`${toGenreLabel(item)} writing path`}
                      style={{
                        textAlign: 'left',
                        borderRadius: 12,
                        border: `1px solid ${isSelected ? 'rgba(125, 211, 252, 0.95)' : 'rgba(148, 163, 184, 0.35)'}`,
                        background: isSelected ? 'rgba(30, 64, 175, 0.35)' : 'rgba(15, 23, 42, 0.75)',
                        padding: 10,
                        color: '#e2e8f0',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: 14 }}>{toGenreLabel(item)} path</div>
                      <div style={{ fontSize: 12, color: '#bfdbfe', marginTop: 4 }}>
                        {status ? toGenreStateCopy(status.status, status.current_day, status.completed_tasks_count, status.total_tasks_count) : 'Not started yet'}
                      </div>
                      {status && status.latest_score != null && (
                        <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 2 }}>Latest score: {status.latest_score}/20</div>
                      )}
                      <div
                        style={{ marginTop: 6, ...progressTrackStyle, height: 6 }}
                        role="progressbar"
                        aria-label={`${toGenreLabel(item)} path progress ${progress}%`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                      >
                        <div className="progress-fill" style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #38bdf8 0%, #22d3ee 100%)' }} />
                      </div>
                    </button>
                  );
                })}
              </div>
              {isWeekComplete && (
                <button
                  type="button"
                  onClick={() => handleStart({ fromWeekComplete: true })}
                  disabled={loading || !promptText.trim() || targetWordCount < 20}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(147, 197, 253, 0.65)',
                    background: 'rgba(30, 41, 59, 0.95)',
                    color: '#dbeafe',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Starting new week…' : `Start new ${toGenreLabel(activeGenre)} week`}
                </button>
              )}
            </div>
            <p style={{ margin: 0, color: '#e2e8f0', fontSize: 15 }}>
              {isPreWeek
                ? 'Write one first response. We will find your weak areas and build your weekly writing plan.'
                : isWeekComplete
                  ? 'You completed your plan. Review what improved, then start a new week when you are ready.'
                  : 'Your weekly plan is active. Follow your focus goals and complete today’s task.'}
            </p>
            {showNoWritingState && <p style={{ margin: '8px 0 0', color: '#bfdbfe', fontSize: 13 }}>No writing state yet</p>}
            {!isWeekComplete && (
              <div style={{ marginTop: 12 }}>
                <div className="mini-grid">
                  {weeklyPlanStages.map((stage, index) => {
                    const isCurrent = index === currentStageIndex;
                    const isDone = index < currentStageIndex;
                    return (
                      <div
                        key={stage.key}
                        style={{
                          borderRadius: 12,
                          border: `1px solid ${isCurrent ? 'rgba(125,211,252,0.95)' : 'rgba(148,163,184,0.35)'}`,
                          background: isDone ? 'rgba(16,185,129,0.16)' : isCurrent ? 'rgba(30,64,175,0.35)' : 'rgba(15,23,42,0.65)',
                          padding: '10px 8px',
                          textAlign: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#dbeafe',
                        }}
                      >
                        <div>{isDone ? 'Done' : isCurrent ? 'Now' : 'Next'}</div>
                        <div style={{ opacity: 0.9 }}>{stage.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, ...progressTrackStyle }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, completionRatio * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #38bdf8 0%, #22d3ee 55%, #34d399 100%)',
                    }}
                  />
                </div>
              </div>
            )}
          </section>

          {isPreWeek && (
            <>
              <section className="writing-hub-card" style={shellCardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20, color: '#f8fafc' }}>What happens next</h3>
                <div className="mini-grid">
                  {['Write once', 'We find weak areas', 'You get your weekly plan', 'You improve day by day'].map((step, index) => (
                    <div key={step} style={{ borderRadius: 12, border: '1px solid rgba(147,197,253,0.45)', background: 'rgba(15,23,42,0.6)', padding: 10 }}>
                      <p style={{ margin: 0, fontSize: 11, color: '#93c5fd' }}>Step {index + 1}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 14, color: '#e2e8f0', fontWeight: 700 }}>{step}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="writing-hub-card" style={shellCardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20, color: '#f8fafc' }}>Your writing task</h3>
                <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Task summary</p>
                <p style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: 15 }}>{buildReadableTaskSummary(promptText)}</p>
                <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Original prompt</p>
                <div style={{ ...fieldStyle, minHeight: 88, whiteSpace: 'pre-wrap' }}>{promptText}</div>
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
                    cursor: aiBusy ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    opacity: aiBusy ? 0.7 : 1,
                  }}
                >
                  {aiBusy ? 'Making this task clearer…' : 'Make this task clearer'}
                </button>
                <p style={{ margin: '6px 0 0', color: '#93c5fd', fontSize: 12 }}>
                  This explains the task more clearly. It does not change what you need to do.
                </p>
              </section>

              <section className="writing-hub-card" style={shellCardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 20, color: '#f8fafc' }}>Write your first response</h3>
                <p style={{ margin: '0 0 8px', color: '#bfdbfe', fontSize: 14 }}>
                  Word count: {toWordCountLabel(targetWordCount)}
                </p>
                <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12 }}>Try to stay close to this range.</p>
                <textarea
                  value={initialResponse}
                  onChange={(e: { target: { value: string } }) => setInitialResponse(e.target.value)}
                  placeholder="Write your first response here. This helps us understand your starting point and build your weekly coaching plan."
                  style={{ ...fieldStyle, minHeight: 130 }}
                />
                <button
                  onClick={() => handleStart()}
                  disabled={loading || !promptText.trim() || !initialResponse.trim() || targetWordCount < 20}
                  className="writing-primary-button"
                  style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                  aria-label="Start Writing Week"
                >
                  {loading ? 'Building your weekly plan…' : 'Submit and build my plan'}
                </button>
              </section>
            </>
          )}

          {isActiveWeek && (
            <>
              <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(147, 197, 253, 0.45)' }}>
                <div className="focus-grid">
                  <div style={{ ...fieldStyle, background: 'rgba(15, 23, 42, 0.4)', minHeight: 80, whiteSpace: 'pre-wrap' }}>
                    <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Your writing task</p>
                    <p style={{ margin: '0 0 8px', fontSize: 14 }}>{buildReadableTaskSummary(originalPromptText ?? promptText)}</p>
                    <p style={{ margin: '0 0 6px', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Original prompt</p>
                    <p style={{ margin: 0, fontSize: 13 }}>{originalPromptText ?? promptText}</p>
                  </div>
                  <div style={{ ...fieldStyle, background: 'rgba(15, 23, 42, 0.4)', minHeight: 80 }}>
                    <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Your first attempt</p>
                    <p style={{ margin: 0, fontSize: 14, color: '#e2e8f0' }}>
                      {firstAttemptSubmission
                        ? `${firstAttemptSubmission.slice(0, 170)}${firstAttemptSubmission.length > 170 ? '…' : ''}`
                        : 'Your first response is saved and used as your starting point.'}
                    </p>
                  </div>
                  <div style={{ ...fieldStyle, background: 'rgba(15, 23, 42, 0.4)' }}>
                    <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Your starting score</p>
                    <p style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#f8fafc' }}>
                      {firstAttemptAssessment ? `${firstAttemptAssessment.total_score}/20` : 'Waiting for first score'}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#bfdbfe' }}>This is your starting point for this week.</p>
                  </div>
                </div>
              </section>

              <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(125, 211, 252, 0.72)', background: 'linear-gradient(160deg, #0f172a 0%, #0b1737 55%, #0b1224 100%)' }}>
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 22, color: '#f8fafc' }}>Your focus this week</h3>
                <p style={{ margin: '0 0 10px', color: '#bfdbfe', fontSize: 15 }}>
                  {aiWeeklyFocus || 'We picked your focus areas based on your first writing.'}
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#e2e8f0', fontSize: 14 }}>
                  {(weeklyGoals.length > 0 ? weeklyGoals : ['Answer every part of the question.', 'Add stronger detail to your ideas.', 'Use the right style for this writing type.']).map((item) => (
                    <li key={item} style={{ marginBottom: 6 }}>{simplifyStudentLanguage(item)}</li>
                  ))}
                </ul>
              </section>

              <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(96, 165, 250, 0.6)' }}>
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 19, color: '#f8fafc' }}>Your goal this week</h3>
                <p style={{ margin: '0 0 4px', color: '#bfdbfe' }}>Build stronger control in your focus skills through daily writing practice.</p>
                <p style={{ margin: 0, color: '#e2e8f0', fontSize: 14 }}>
                  Target score range: {estimatedTargetRange ? `${estimatedTargetRange.low}–${estimatedTargetRange.high} / 20` : 'Will appear after first scoring'}
                </p>
                <p style={{ margin: '8px 0 0', color: '#93c5fd', fontSize: 12 }}>This is an estimate, not a guaranteed score.</p>
              </section>

              <section className="writing-hub-card" style={shellCardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 20, color: '#f8fafc' }}>Today’s Task</h3>
                {!todayTask.ok || !todayTask.data ? (
                  <div>
                    <p style={{ margin: 0, color: '#cbd5e1' }}>Preparing today’s task…</p>
                    <p style={{ margin: '6px 0 0', color: '#93c5fd', fontSize: 12 }}>If this takes longer, refresh and try again.</p>
                  </div>
                ) : (
                  <>
                    <h4 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: 18 }}>{taskTypeToFriendlyTitle(todayTask.data.task_type, todayTask.data.day_number)}</h4>
                    <p style={{ margin: '0 0 6px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Today’s goal</p>
                    <p style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: 15 }}>{simplifyStudentLanguage(aiTaskWording || taskTypeToFriendlyInstruction(todayTask.data.task_type))}</p>
                    <p style={{ margin: '0 0 6px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Focus on this</p>
                    <p style={{ margin: '0 0 8px', color: '#cbd5e1', fontSize: 14 }}>
                      This helps you improve your weekly focus areas and raise your writing score step by step.
                    </p>
                    <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 13 }}>Word count: {toWordCountLabel(todayTask.data.expected_word_count)}</p>
                    <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12 }}>Try to stay close to this range.</p>
                    <p style={{ margin: '0 0 6px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Try to do these 2 things</p>
                    <ul style={{ margin: '0 0 10px', paddingLeft: 18, color: '#cbd5e1', fontSize: 14 }}>
                      {todayTask.data.success_criteria.slice(0, 2).map((item) => (
                        <li key={item} style={{ marginBottom: 4 }}>{simplifyStudentLanguage(item)}</li>
                      ))}
                    </ul>
                    <textarea
                      value={practiceResponse}
                      onChange={(e: { target: { value: string } }) => setPracticeResponse(e.target.value)}
                      placeholder="Write today’s response here. Focus on today’s goal and your weekly coaching points."
                      style={{ ...fieldStyle, minHeight: 120 }}
                    />
                    <button
                      onClick={() => void handleSubmitPractice()}
                      disabled={loading || !practiceResponse.trim()}
                      className="writing-primary-button"
                      style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                      aria-label="Submit Today’s Task"
                    >
                      {loading ? 'Submitting today’s writing…' : 'Submit Today’s Task'}
                    </button>
                  </>
                )}
              </section>

              <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(16, 185, 129, 0.32)' }}>
                <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 19, color: '#f8fafc' }}>Feedback & momentum</h3>
                <p style={{ margin: 0, color: feedback ? '#a7f3d0' : '#94a3b8', fontSize: 15 }}>
                  {feedback || (completedTasksCount > 0 ? `Great consistency. You completed ${completedTasksCount} task${completedTasksCount === 1 ? '' : 's'} this week.` : 'Great start. Your progress grows every day you submit.')}
                </p>
              </section>
            </>
          )}

          {isWeekComplete && (
            <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(250, 204, 21, 0.45)', background: 'linear-gradient(175deg,#1f2937 0%, #0b1224 80%)' }}>
              <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 22, color: '#fde68a' }}>Week complete 🎯</h3>
              <p style={{ margin: '0 0 8px', color: '#fef3c7', fontSize: 15 }}>You finished your writing mission. Nice consistency and progress. All tasks submitted for now.</p>
              <p style={{ margin: '0 0 8px', color: '#dbeafe', fontSize: 14 }}>Tasks completed: {completedTasksCount}/{totalPlannedTasks}</p>
              <p style={{ margin: '0 0 8px', color: '#bfdbfe', fontSize: 14 }}>
                What improved: {studentFriendlyWeaknesses.length > 0 ? studentFriendlyWeaknesses.slice(0, 2).join(' · ') : 'Your writing control and task focus improved.'}
              </p>
              <button
                onClick={() => handleStart({ fromWeekComplete: true })}
                disabled={loading || !promptText.trim() || targetWordCount < 20}
                className="writing-primary-button"
                style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                aria-label="Start New Week"
              >
                {loading ? 'Starting new week…' : 'Start New Week'}
              </button>
            </section>
          )}

          <details className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(148, 163, 184, 0.28)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#e2e8f0' }}>View your progress details</summary>
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <div className="focus-grid">
                {subscaleCards.map((item) => {
                  const tone = getProgressTone(item.score);
                  const scorePercent = item.score == null ? 0 : Math.max(0, Math.min(100, (item.score / 5) * 100));
                  return (
                    <div
                      key={item.key}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${tone.glow}`,
                        background: 'rgba(15, 23, 42, 0.55)',
                        padding: 10,
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <p style={{ margin: 0, color: '#dbeafe', fontSize: 13, fontWeight: 700 }}>{item.label}</p>
                        <p style={{ margin: 0, color: '#f8fafc', fontSize: 13, fontWeight: 800 }}>
                          {item.score == null ? '— / 5' : `${item.score}/5`}
                        </p>
                      </div>
                      <div style={{ ...progressTrackStyle, height: 8 }}>
                        <div className="progress-fill" style={{ width: `${scorePercent}%`, height: '100%', background: tone.color }} />
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#93c5fd' }}>
                        {tone.label}
                        {item.delta != null ? ` · ${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)} this month` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>

              <p style={{ margin: 0, color: '#bfdbfe' }}>Main focus: {toStudentLabel(dashboard.data?.weekly_plan_summary?.primary ?? 'Not set yet')}</p>
              {!showWeeklyEvidence ? (
                <>
                  <p style={{ margin: 0, color: '#94a3b8' }}>You’re just getting started this week.</p>
                  <p style={{ margin: 0, color: '#94a3b8' }}>Complete today’s task to unlock clearer progress feedback.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, color: '#bfdbfe' }}>What’s improving: You completed {weeklySummary?.completed_tasks} task{weeklySummary?.completed_tasks === 1 ? '' : 's'} this week.</p>
                  <p style={{ margin: 0, color: '#94a3b8' }}>
                    What to work on today: {weeklySummary?.top_remaining_weaknesses.map((item) => toStudentLabel(item)).join(', ') || 'Keep practising your weekly goals.'}
                  </p>
                  <p style={{ margin: 0, color: '#86efac' }}>
                    Next step: {toStudentLabel(nextWeekInputs?.carry_forward_primary_target ?? 'Keep building your weekly focus skills.')}
                  </p>
                </>
              )}

              {!showMonthlyEvidence ? (
                <p style={{ margin: 0, color: '#94a3b8' }}>Complete more writing this month to unlock your growth view.</p>
              ) : (
                <>
                  <p style={{ margin: 0, color: '#bfdbfe' }}>Monthly growth</p>
                  <p style={{ margin: 0 }}>{toStudentLabel(monthlyFacingReport?.score_change ?? '')}</p>
                  {aiMonthlyWording && <p style={{ margin: 0, color: '#bfdbfe' }}>{aiMonthlyWording}</p>}
                  <p style={{ margin: 0, color: '#94a3b8' }}>{monthlyFacingReport?.subscale_progress.join(' ')}</p>
                  <p style={{ margin: 0, color: '#86efac' }}>Strongest gains: {monthlyFacingReport?.strongest_gains.map((item) => toStudentLabel(item)).join(', ')}</p>
                  <p style={{ margin: 0, color: '#fca5a5' }}>Main blocker: {toStudentLabel(monthlyFacingReport?.remaining_blockers[0] ?? 'None right now')}</p>
                  <p style={{ margin: 0, color: '#93c5fd' }}>Next step: {toStudentLabel(monthlyFacingReport?.next_month_priorities[0] ?? 'Keep completing your weekly writing tasks.')}</p>
                </>
              )}
            </div>
          </details>

          {(uiNotice || isRefreshingProgress) && (
            <p style={{ ...shellCardStyle, margin: 0, color: '#bfdbfe', borderColor: 'rgba(96, 165, 250, 0.45)' }}>
              {isRefreshingProgress ? 'Loading progress updates…' : uiNotice}
            </p>
          )}

          {error && (
            <section style={{ ...shellCardStyle, margin: 0, color: '#fecaca', borderColor: 'rgba(248, 113, 113, 0.45)' }}>
              <p style={{ margin: 0 }}>{error}</p>
              <button
                type="button"
                onClick={handleRetryLoad}
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(248, 113, 113, 0.6)',
                  background: 'rgba(127, 29, 29, 0.4)',
                  color: '#fecaca',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </section>
          )}

          {dashboard.ok && dashboard.data && (
            <p style={{ margin: 0, color: '#64748b', fontSize: 12, textAlign: 'center' }}>
              Mission progress: {dashboard.data.completed_tasks_count} completed · latest score {dashboard.data.latest_total_score ?? '--'}
            </p>
          )}

          {!stateRes.ok && (
            <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(248,113,113,0.5)' }}>
              <h3 style={{ marginTop: 0, marginBottom: 8, color: '#fecaca' }}>We’re having trouble loading your writing data.</h3>
              <p style={{ margin: 0, color: '#fecaca' }}>Please refresh and try again. Your writing progress is safe.</p>
              <button
                type="button"
                onClick={handleRetryLoad}
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(248, 113, 113, 0.6)',
                  background: 'rgba(127, 29, 29, 0.4)',
                  color: '#fecaca',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Retry loading
              </button>
            </section>
          )}

          {showNoWritingState && !isPreWeek && (
            <section className="writing-hub-card" style={shellCardStyle}>
              <h3 style={{ marginTop: 0, marginBottom: 8, color: '#f8fafc' }}>No active writing task yet</h3>
              <p style={{ margin: 0, color: '#cbd5e1' }}>Start your first week to unlock your mission board and daily coaching.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export const seedWritingHubForDemo = (studentId: string, grade: number, genre: WritingHubProps['genre']): void => {
  submitInitialWritingAssessment({
    student_id: studentId,
    grade,
    genre,
    prompt_text: defaultPromptByGenre[genre],
    target_word_count: grade <= 7 ? 80 : grade <= 9 ? 120 : 160,
    student_response:
      'This response describes the event, explains why it mattered, and gives one practical suggestion for next time.',
  });
};

export default WritingHub;
