import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTeacherAttemptListScoped,
  getTeacherMonitoringOverviewScoped,
  getTeacherWritingReport,
  getWritingMonitoringOverview,
  saveTeacherReportScoped,
  setTeacherWritingIntegrityMode,
  type TeacherWritingAttemptRecord,
  type TeacherWritingReport,
  type WritingMonitoringOverview,
} from '../../lib/brains_heist/writingIntegrationService.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { openProfessionalWritingReport } from '../../lib/brains_heist/writingReportDocument.js';
import type { WritingIntegrityMode } from '../../lib/brains_heist/writingIntegrity.js';

interface WritingMonitoringViewProps {
  month?: string;
  isLoading?: boolean;
  errorMessage?: string;
  filterQuery?: string;
}

type MonitoringRow = WritingMonitoringOverview['student_rows'][number] & {
  class_name?: string | null;
};

type CollapseKey = 'overview' | 'classes' | 'students' | 'genres' | 'reader';
type SupportedMonitorGenre = 'email' | 'article' | 'review' | 'story' | 'essay' | 'report' | 'paragraph';
type FlipDirection = 'forward' | 'backward';
type InputChangeEvent = { target: { value: string } };
type SelectChangeEvent = { target: { value: string } };

interface ClassGroup {
  key: string;
  name: string;
  gradeLabel: string;
  rows: MonitoringRow[];
  submissions: number;
  attentionCount: number;
  averageScore: number | null;
}

interface WritingCorrection {
  type: string;
  wrong: string;
  correct: string;
  explanation: string;
}

const SUPPORTED_GENRES: readonly SupportedMonitorGenre[] = [
  'email',
  'article',
  'review',
  'story',
  'essay',
  'report',
  'paragraph',
];

const GENRE_META: Record<SupportedMonitorGenre, { icon: string; description: string }> = {
  email: { icon: '✉️', description: 'Purpose, audience, tone, opening and closing' },
  article: { icon: '📰', description: 'Engaging ideas, structure and reader awareness' },
  review: { icon: '⭐', description: 'Evaluation, evidence and recommendation' },
  story: { icon: '📖', description: 'Narrative control, detail and sequencing' },
  essay: { icon: '📝', description: 'Argument, development and organization' },
  report: { icon: '📊', description: 'Formal findings, headings and recommendations' },
  paragraph: { icon: '¶', description: 'Focus, support and sentence connection' },
};

const WEAKNESS_LABEL_MAP: Record<string, string> = {
  grammar_accuracy: 'Grammar accuracy',
  vocabulary_range: 'Vocabulary range',
  paragraph_organisation: 'Paragraph organization',
  sentence_clarity: 'Sentence clarity',
  task_response: 'Task response',
  idea_development: 'Idea development',
  punctuation: 'Punctuation control',
};

const isLikelyInternalId = (value?: string): boolean => {
  if (!value) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
};

const toDisplayLabel = (studentName: string | undefined, studentId: string): string => {
  const name = studentName?.trim();
  if (name && !isLikelyInternalId(name)) return name;
  const username = studentId?.trim();
  if (username && !isLikelyInternalId(username)) return username;
  return 'Student';
};

const toTeacherWeaknessLabel = (tag: string): string =>
  WEAKNESS_LABEL_MAP[tag] ??
  tag
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const toGenreLabel = (genre: string): string =>
  genre
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatScoreLabel = (score: number | null | undefined): string => {
  if (score == null || Number.isNaN(score)) return '—';
  return `${score}/20`;
};

const formatDate = (value?: string): string => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const getSubmissionCount = (row: MonitoringRow): number =>
  row.submission_count ?? row.attempts_count ?? 0;

const getClassKey = (row: MonitoringRow): string => {
  if (row.class_id?.trim()) return `id:${row.class_id.trim()}`;
  if (row.class_name?.trim()) return `name:${row.class_name.trim().toLowerCase()}`;
  return `roster-review:${row.current_grade}`;
};

const getClassName = (row: MonitoringRow): string =>
  row.class_name?.trim() || `Grade ${row.current_grade} · Class information unavailable`;

const getStatus = (row: MonitoringRow): { label: string; tone: 'attention' | 'positive' | 'neutral' } => {
  if (row.status === 'needs_review' || row.status === 'needs_support' || row.stalled) {
    return { label: 'Needs support', tone: 'attention' };
  }
  if (row.improving) return { label: 'Improving', tone: 'positive' };
  if (row.status === 'plan_ready') return { label: 'Plan ready', tone: 'neutral' };
  if (row.status === 'not_started') return { label: 'Not started', tone: 'neutral' };
  return { label: 'On track', tone: 'positive' };
};

const getTrendLabel = (row: MonitoringRow): string => {
  if (getSubmissionCount(row) < 2) return 'Baseline';
  const deltas = Object.values(row.subscale_trend);
  const positives = deltas.filter((value) => value > 0).length;
  const negatives = deltas.filter((value) => value < 0).length;
  if (positives >= 2 && positives > negatives) return 'Improving';
  if (negatives >= 2 && negatives > positives) return 'Declining';
  return 'Stable';
};

const extractAttemptScore = (attempt: TeacherWritingAttemptRecord): number | null => {
  const assessment = attempt.assessment ?? {};
  const score = assessment['total_score'];
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
};

const extractAttemptWeaknesses = (attempt: TeacherWritingAttemptRecord): string[] => {
  const tags = attempt.assessment?.['weakness_tags'];
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) : [];
};

const extractAttemptFeedbackText = (attempt: TeacherWritingAttemptRecord): string => {
  const richFeedback = attempt.rich_feedback ?? {};
  const directFeedback = [
    richFeedback['teacher_feedback'],
    richFeedback['summary'],
    richFeedback['task_understanding'],
    richFeedback['next_move'],
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  if (typeof directFeedback === 'string') return directFeedback.trim();

  const subscaleSummary = attempt.assessment?.['subscale_summary'];
  if (Array.isArray(subscaleSummary)) {
    const lines = subscaleSummary.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (lines.length > 0) return lines.join('\n');
  }
  return 'Feedback will appear here when the evaluation is complete.';
};

const extractCorrections = (attempt: TeacherWritingAttemptRecord): WritingCorrection[] => {
  const richFeedback = attempt.rich_feedback ?? {};
  const mapFixes = (key: string, type: string, explanationKey?: string): WritingCorrection[] => {
    const fixes = richFeedback[key];
    if (!Array.isArray(fixes)) return [];
    return fixes.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const wrong = typeof record['original'] === 'string' ? record['original'].trim() : '';
      const correct = typeof record['better_version'] === 'string' ? record['better_version'].trim() : '';
      if (!wrong || !correct) return [];
      return [{
        type,
        wrong,
        correct,
        explanation: explanationKey && typeof record[explanationKey] === 'string'
          ? (record[explanationKey] as string).trim()
          : '',
      }];
    });
  };

  return [
    ...mapFixes('grammar_fixes', 'Grammar'),
    ...mapFixes('punctuation_fixes', 'Punctuation'),
    ...mapFixes('natural_phrase_upgrades', 'Phrasing', 'why_it_helps'),
  ];
};

const getRubricRows = (attempt: TeacherWritingAttemptRecord): Array<{ label: string; score: number | null; note: string }> => {
  const subscores = (attempt.assessment?.['subscores'] ?? {}) as Record<string, unknown>;
  const notes = (attempt.assessment?.['band_justification'] ?? {}) as Record<string, unknown>;
  const keys = [
    ['Content', 'content'],
    ['Communicative Achievement', 'communicative_achievement'],
    ['Organization', 'organisation'],
    ['Language', 'language'],
  ] as const;
  return keys.map(([label, key]) => ({
    label,
    score: typeof subscores[key] === 'number' ? (subscores[key] as number) : null,
    note: typeof notes[key] === 'string' ? (notes[key] as string) : '',
  }));
};

const CollapsibleHeading: React.FC<{
  eyebrow: string;
  title: string;
  description: string;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, collapsed, onToggle, actions }) => (
  <header className="writing-monitor__section-heading">
    <button
      type="button"
      className="writing-monitor__collapse"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
    >
      <span aria-hidden="true">{collapsed ? '＋' : '−'}</span>
    </button>
    <div>
      <span className="writing-monitor__eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    {actions ? <div className="writing-monitor__heading-actions">{actions}</div> : null}
  </header>
);

export const WritingMonitoringView: React.FC<WritingMonitoringViewProps> = ({
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
  filterQuery = '',
}) => {
  const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  const seededOverview = isTestRuntime ? getWritingMonitoringOverview(month) : null;
  const [overview, setOverview] = useState<WritingMonitoringOverview | null>(
    seededOverview?.ok ? seededOverview.data ?? null : null
  );
  const [loadError, setLoadError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [selectedClassKey, setSelectedClassKey] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState('');
  const [attemptRows, setAttemptRows] = useState<TeacherWritingAttemptRecord[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptError, setAttemptError] = useState('');
  const [studentReport, setStudentReport] = useState<TeacherWritingReport | null>(null);
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [flipDirection, setFlipDirection] = useState<FlipDirection>('forward');
  const [flipSequence, setFlipSequence] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<CollapseKey>>(() => new Set());
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [modeUpdateStatus, setModeUpdateStatus] = useState('');
  const studentRequestRef = useRef(0);

  const filters = parseAdminDrilldownFilters(filterQuery);

  const allRows = useMemo<MonitoringRow[]>(
    () => (overview?.student_rows ?? []).map((row) => ({ ...row })),
    [overview]
  );

  const filteredRows = useMemo(() => allRows.filter((row) => {
    if (filters.grade && row.current_grade !== filters.grade) return false;
    if (filters.status === 'stalled' && !row.stalled) return false;
    if (filters.status === 'improving' && !row.improving) return false;
    if (filters.weakness_tag && !row.repeated_weakness_hotspots.includes(filters.weakness_tag)) return false;
    return true;
  }), [allRows, filters.grade, filters.status, filters.weakness_tag]);

  const classGroups = useMemo<ClassGroup[]>(() => {
    const groups = new Map<string, MonitoringRow[]>();
    for (const row of filteredRows) {
      const key = getClassKey(row);
      const current = groups.get(key);
      if (current) current.push(row);
      else groups.set(key, [row]);
    }
    return [...groups.entries()]
      .map(([key, rows]) => {
        const scores = rows
          .map((row) => row.latest_score)
          .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
        const grades = [...new Set(rows.map((row) => row.current_grade))].sort((a, b) => a - b);
        return {
          key,
          name: getClassName(rows[0]),
          gradeLabel: grades.map((grade) => `Grade ${grade}`).join(' · '),
          rows: [...rows].sort((a, b) =>
            toDisplayLabel(a.student_name, a.student_id).localeCompare(toDisplayLabel(b.student_name, b.student_id))
          ),
          submissions: rows.reduce((sum, row) => sum + getSubmissionCount(row), 0),
          attentionCount: rows.filter((row) => getStatus(row).tone === 'attention').length,
          averageScore: scores.length > 0
            ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredRows]);

  const selectedClass = classGroups.find((group) => group.key === selectedClassKey) ?? null;
  const visibleStudents = useMemo(() => {
    if (!selectedClass) return [];
    const query = studentSearch.trim().toLowerCase();
    if (!query) return selectedClass.rows;
    return selectedClass.rows.filter((row) =>
      `${toDisplayLabel(row.student_name, row.student_id)} ${getStatus(row).label}`.toLowerCase().includes(query)
    );
  }, [selectedClass, studentSearch]);

  const selectedRow = selectedClass?.rows.find((row) => row.student_id === selectedStudentId) ?? null;

  const availableGenres = useMemo(() => {
    const extras = attemptRows
      .map((attempt) => attempt.genre?.trim().toLowerCase())
      .filter((genre): genre is string => Boolean(genre) && !SUPPORTED_GENRES.includes(genre as SupportedMonitorGenre));
    return [...SUPPORTED_GENRES, ...[...new Set(extras)].sort()];
  }, [attemptRows]);

  const genreCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const genre of availableGenres) counts.set(genre, 0);
    for (const attempt of attemptRows) {
      const genre = attempt.genre?.trim().toLowerCase() || 'other';
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
    return counts;
  }, [attemptRows, availableGenres]);

  const genreAttempts = useMemo(
    () => attemptRows.filter((attempt) => (attempt.genre?.trim().toLowerCase() || 'other') === selectedGenre),
    [attemptRows, selectedGenre]
  );
  const activeAttempt = genreAttempts[attemptIndex] ?? null;

  const totalSubmissions = filteredRows.reduce((sum, row) => sum + getSubmissionCount(row), 0);
  const attentionCount = filteredRows.filter((row) => getStatus(row).tone === 'attention').length;
  const improvingCount = filteredRows.filter((row) => row.improving).length;

  const toggleCollapsed = (key: CollapseKey): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandSection = (key: CollapseKey): void => {
    setCollapsed((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  const refreshOverview = useCallback(async (): Promise<void> => {
    if (isTestRuntime) return;
    const result = await getTeacherMonitoringOverviewScoped(month);
    if (!result.ok || !result.data) {
      setLoadError(result.error ?? 'Writing data could not be refreshed. Please try again.');
      return;
    }
    setOverview(result.data);
    setLastSyncedAt(new Date());
    setLoadError('');
  }, [isTestRuntime, month]);

  useEffect(() => {
    if (isTestRuntime) return;
    void refreshOverview();
    const refreshTimer = window.setInterval(() => void refreshOverview(), 30_000);
    const refreshOnFocus = () => void refreshOverview();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshOverview();
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isTestRuntime, refreshOverview]);

  useEffect(() => {
    if (selectedClassKey && !classGroups.some((group) => group.key === selectedClassKey)) {
      setSelectedClassKey('');
      setSelectedStudentId('');
      setSelectedGenre('');
    }
  }, [classGroups, selectedClassKey]);

  useEffect(() => {
    if (attemptIndex < genreAttempts.length) return;
    setAttemptIndex(Math.max(0, genreAttempts.length - 1));
  }, [attemptIndex, genreAttempts.length]);

  useEffect(() => {
    if (!selectedGenre || genreAttempts.length < 2 || collapsed.has('reader')) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowRight' && attemptIndex < genreAttempts.length - 1) {
        setFlipDirection('forward');
        setAttemptIndex((index) => index + 1);
        setFlipSequence((sequence) => sequence + 1);
      }
      if (event.key === 'ArrowLeft' && attemptIndex > 0) {
        setFlipDirection('backward');
        setAttemptIndex((index) => index - 1);
        setFlipSequence((sequence) => sequence + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [attemptIndex, collapsed, genreAttempts.length, selectedGenre]);

  const selectClass = (group: ClassGroup): void => {
    studentRequestRef.current = (studentRequestRef.current ?? 0) + 1;
    setSelectedClassKey(group.key);
    setSelectedStudentId('');
    setSelectedGenre('');
    setStudentSearch('');
    setAttemptRows([]);
    setStudentReport(null);
    setAttemptError('');
    setCollapsed((current) => {
      const next = new Set(current);
      next.add('classes');
      next.delete('students');
      return next;
    });
  };

  const selectStudent = async (row: MonitoringRow): Promise<void> => {
    const requestId = (studentRequestRef.current ?? 0) + 1;
    studentRequestRef.current = requestId;
    setSelectedStudentId(row.student_id);
    setSelectedGenre('');
    setAttemptRows([]);
    setStudentReport(null);
    setAttemptError('');
    setAttemptsLoading(true);
    setFeedbackStatus('');
    setCollapsed((current) => {
      const next = new Set(current);
      next.add('students');
      next.delete('genres');
      return next;
    });

    const [attemptsResult, reportResult] = await Promise.all([
      getTeacherAttemptListScoped({ student_id: row.student_id, limit: 100 }),
      getTeacherWritingReport({ student_id: row.student_id, month, include_snippet: true }),
    ]);

    if (studentRequestRef.current !== requestId) return;

    if (attemptsResult.ok && attemptsResult.data) {
      setAttemptRows([...attemptsResult.data].sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return 0;
        return aTime - bTime;
      }));
    }
    else setAttemptError(attemptsResult.error ?? 'Unable to load this student’s writing submissions.');

    if (reportResult.ok && reportResult.data) {
      setStudentReport(reportResult.data);
      setFeedbackDraft([
        `Praise: ${reportResult.data.strengths[0] ?? 'Thank you for completing this writing task.'}`,
        `Growth target: ${reportResult.data.priority_weak_areas[0]
          ? toTeacherWeaknessLabel(reportResult.data.priority_weak_areas[0])
          : 'Develop one idea more fully in the next draft.'}`,
        `Next step: ${reportResult.data.teacher_actions[0] ?? 'Revise one paragraph and explain what changed.'}`,
      ].join('\n\n'));
    }
    setAttemptsLoading(false);
  };

  const selectGenre = (genre: string): void => {
    setSelectedGenre(genre);
    setAttemptIndex(0);
    setFlipDirection('forward');
    setFlipSequence((sequence) => sequence + 1);
    setCollapsed((current) => {
      const next = new Set(current);
      next.add('genres');
      next.delete('reader');
      return next;
    });
  };

  const turnPage = (direction: FlipDirection): void => {
    if (direction === 'forward' && attemptIndex >= genreAttempts.length - 1) return;
    if (direction === 'backward' && attemptIndex <= 0) return;
    setFlipDirection(direction);
    setAttemptIndex((index) => index + (direction === 'forward' ? 1 : -1));
    setFlipSequence((sequence) => sequence + 1);
  };

  const printStudentReport = (): void => {
    if (!studentReport) return;
    openProfessionalWritingReport(studentReport, {
      audience: 'teacher',
      teacherComment: feedbackDraft,
      reportStatus: feedbackStatus.includes('final') ? 'final' : 'draft',
    });
  };

  const saveFeedback = async (status: 'draft' | 'final'): Promise<void> => {
    if (!selectedRow || !feedbackDraft.trim()) return;
    setFeedbackStatus(status === 'final' ? 'Publishing feedback…' : 'Saving securely…');
    const result = await saveTeacherReportScoped({
      student_id: selectedRow.student_id,
      mode: 'student',
      month,
      genre: SUPPORTED_GENRES.includes(selectedGenre as SupportedMonitorGenre)
        ? selectedGenre as SupportedMonitorGenre
        : undefined,
      status,
      teacher_comment: feedbackDraft.trim(),
      report_payload: {
        title: `Writing feedback for ${toDisplayLabel(selectedRow.student_name, selectedRow.student_id)}`,
        praise_growth_next_step: feedbackDraft.trim(),
        latest_score: selectedRow.latest_score,
        attempts_count: selectedRow.attempts_count,
        focus_areas: selectedRow.repeated_weakness_hotspots,
      },
    });
    setFeedbackStatus(
      result.ok
        ? status === 'final' ? 'Feedback finalized and saved.' : 'Draft saved securely.'
        : result.error ?? 'Unable to save feedback.'
    );
  };

  const copyFeedback = async (): Promise<void> => {
    if (typeof navigator === 'undefined' || !feedbackDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(feedbackDraft);
      setFeedbackStatus('Copied to clipboard.');
    } catch {
      setFeedbackStatus('Copy failed. Select the text and copy manually.');
    }
  };

  const updateClassIntegrityMode = async (mode: WritingIntegrityMode): Promise<void> => {
    if (!selectedRow?.class_id) {
      setModeUpdateStatus('Class information is unavailable for this student.');
      return;
    }
    setModeUpdateStatus('Updating class writing mode…');
    const result = await setTeacherWritingIntegrityMode({ class_id: selectedRow.class_id, mode });
    setModeUpdateStatus(
      result.ok
        ? `${result.data?.class_name ?? selectedRow.class_name ?? 'Class'} is now in ${mode} mode.`
        : result.error ?? 'Unable to update the class writing mode.'
    );
    if (result.ok) void refreshOverview();
  };

  if (isLoading) {
    return (
      <div className="writing-monitor writing-monitor--loading" aria-label="Loading writing monitor">
        <div className="writing-monitor__skeleton writing-monitor__skeleton--hero" />
        <div className="writing-monitor__skeleton-grid">
          {[1, 2, 3, 4].map((item) => <div key={item} className="writing-monitor__skeleton" />)}
        </div>
        <div className="writing-monitor__skeleton writing-monitor__skeleton--panel" />
      </div>
    );
  }

  if (errorMessage) {
    return <div className="writing-monitor__state is-error">Unable to load writing monitor: {errorMessage}</div>;
  }
  if (loadError && !overview) return <div className="writing-monitor__state is-error">{loadError}</div>;
  if (!overview) return <div className="writing-monitor__state">No writing monitoring data available yet.</div>;
  if (overview.student_rows.length === 0) {
    return <div className="writing-monitor__state">No students with writing records yet.</div>;
  }

  const readerWeaknesses = activeAttempt ? extractAttemptWeaknesses(activeAttempt) : [];
  const readerCorrections = activeAttempt ? extractCorrections(activeAttempt) : [];
  const readerRubric = activeAttempt ? getRubricRows(activeAttempt) : [];

  return (
    <main className="writing-monitor writing-teacher-surface">
      <span className="writing-monitor__sr-only">Teacher/Admin Writing Monitor</span>
      <span className="writing-monitor__sr-only">Weekly target</span>

      {loadError ? (
        <div className="writing-monitor__sync-warning" role="status">
          Live refresh paused. Showing the most recently synchronized data.
        </div>
      ) : null}

      <section className="writing-monitor__hero">
        <div>
          <span className="writing-monitor__eyebrow">Writing Command Center</span>
          <h1>Writing Monitor</h1>
          <p>Move from the school overview to one class, one student, one genre, and finally the exact writing evidence.</p>
        </div>
        <div className="writing-monitor__sync">
          <span aria-hidden="true" />
          {lastSyncedAt
            ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Live school data'}
        </div>
      </section>

      <nav className="writing-monitor__path" aria-label="Writing monitor drill-down">
        {[
          ['1', 'Overview', true],
          ['2', selectedClass?.name ?? 'Choose class', Boolean(selectedClass)],
          ['3', selectedRow ? toDisplayLabel(selectedRow.student_name, selectedRow.student_id) : 'Choose student', Boolean(selectedRow)],
          ['4', selectedGenre ? toGenreLabel(selectedGenre) : 'Choose genre', Boolean(selectedGenre)],
        ].map(([number, label, active]) => (
          <div key={String(number)} className={active ? 'is-complete' : ''}>
            <span>{number}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </nav>

      <section className="writing-monitor__section">
        <CollapsibleHeading
          eyebrow="School overview"
          title="Students and general writing data"
          description="A clean starting point before you open a class."
          collapsed={collapsed.has('overview')}
          onToggle={() => toggleCollapsed('overview')}
        />
        {!collapsed.has('overview') ? (
          <div className="writing-monitor__metrics">
            <article><span>Total students</span><strong>{filteredRows.length}</strong><small>With writing records</small></article>
            <article><span>Classes</span><strong>{classGroups.length}</strong><small>From your live roster</small></article>
            <article><span>Submissions</span><strong>{totalSubmissions}</strong><small>Across all genres</small></article>
            <article className="is-attention"><span>Need support</span><strong>{attentionCount}</strong><small>Review these students first</small></article>
            <article className="is-positive"><span>Improving</span><strong>{improvingCount}</strong><small>Recent progress detected</small></article>
          </div>
        ) : null}
      </section>

      <section className="writing-monitor__section">
        <CollapsibleHeading
          eyebrow="Step 1"
          title="Choose a class"
          description="Class and grade come from the live school roster. Each card summarizes the students and writing evidence in that class."
          collapsed={collapsed.has('classes')}
          onToggle={() => toggleCollapsed('classes')}
          actions={selectedClass ? (
            <button type="button" className="writing-monitor__text-button" onClick={() => expandSection('classes')}>
              Change class
            </button>
          ) : undefined}
        />
        {!collapsed.has('classes') ? (
          classGroups.length > 0 ? (
            <div className="writing-monitor__class-grid">
              {classGroups.map((group) => (
                <button
                  type="button"
                  key={group.key}
                  className={`writing-monitor__class-card${selectedClassKey === group.key ? ' is-selected' : ''}`}
                  onClick={() => selectClass(group)}
                  aria-pressed={selectedClassKey === group.key}
                >
                  <span className="writing-monitor__class-icon" aria-hidden="true">🏫</span>
                  <span className="writing-monitor__card-copy">
                    <strong>{group.name}</strong>
                    <small>{group.gradeLabel}</small>
                  </span>
                  <span className="writing-monitor__mini-metrics">
                    <span><strong>{group.rows.length}</strong><small>Students</small></span>
                    <span><strong>{group.submissions}</strong><small>Submissions</small></span>
                    <span><strong>{formatScoreLabel(group.averageScore)}</strong><small>Average</small></span>
                  </span>
                  <span className={group.attentionCount > 0 ? 'writing-monitor__attention' : 'writing-monitor__on-track'}>
                    {group.attentionCount > 0 ? `${group.attentionCount} need support` : 'No priority alerts'}
                  </span>
                  <span className="writing-monitor__open-label">Open class <span aria-hidden="true">→</span></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="writing-monitor__empty">No monitoring matches the current link filters.</div>
          )
        ) : null}
      </section>

      {selectedClass ? (
        <section className="writing-monitor__section writing-monitor__section--accent">
          <CollapsibleHeading
            eyebrow="Step 2"
            title={`Students in ${selectedClass.name}`}
            description="Choose a student to see their complete genre portfolio."
            collapsed={collapsed.has('students')}
            onToggle={() => toggleCollapsed('students')}
            actions={(
              <label className="writing-monitor__search">
                <span className="writing-monitor__sr-only">Search students</span>
                <input
                  type="search"
                  value={studentSearch}
                  onChange={(event: InputChangeEvent) => setStudentSearch(event.target.value)}
                  placeholder="Search students"
                />
              </label>
            )}
          />
          {!collapsed.has('students') ? (
            visibleStudents.length > 0 ? (
              <div className="writing-monitor__student-grid">
                {visibleStudents.map((row) => {
                  const status = getStatus(row);
                  return (
                    <button
                      type="button"
                      key={row.student_id}
                      className={`writing-monitor__student-card${selectedStudentId === row.student_id ? ' is-selected' : ''}`}
                      onClick={() => void selectStudent(row)}
                      aria-pressed={selectedStudentId === row.student_id}
                    >
                      <span className="writing-monitor__student-topline">
                        <span>
                          <strong>{toDisplayLabel(row.student_name, row.student_id)}</strong>
                          <small>Grade {row.current_grade} · {selectedClass.name}</small>
                        </span>
                        <span className={`writing-monitor__status is-${status.tone}`}>{status.label}</span>
                      </span>
                      <span className="writing-monitor__student-metrics">
                        <span><small>Latest score</small><strong>{formatScoreLabel(row.latest_score)}</strong></span>
                        <span><small>Submissions</small><strong>{getSubmissionCount(row)}</strong></span>
                        <span><small>Trend</small><strong>{getTrendLabel(row)}</strong></span>
                        <span>
                          <small>Practice</small>
                          <strong>{row.practice_completed_count ?? 0}/{row.practice_assigned_count ?? 0}</strong>
                        </span>
                      </span>
                      <span className="writing-monitor__student-focus">
                        <strong>Current focus</strong>
                        {row.repeated_weakness_hotspots.length > 0
                          ? row.repeated_weakness_hotspots.slice(0, 2).map(toTeacherWeaknessLabel).join(' · ')
                          : row.weekly_target_summary || 'Build more writing evidence'}
                      </span>
                      <span className="writing-monitor__open-label">Open writing portfolio <span aria-hidden="true">→</span></span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="writing-monitor__empty">No students match this search.</div>
            )
          ) : null}
        </section>
      ) : null}

      {selectedRow ? (
        <section className="writing-monitor__section writing-monitor__section--accent">
          <CollapsibleHeading
            eyebrow="Step 3"
            title={`${toDisplayLabel(selectedRow.student_name, selectedRow.student_id)} · Writing genres`}
            description="Every genre stays visible, including genres with no submissions yet."
            collapsed={collapsed.has('genres')}
            onToggle={() => toggleCollapsed('genres')}
            actions={studentReport ? (
              <div className="writing-monitor__student-actions">
                <button type="button" className="writing-monitor__secondary-button" onClick={() => setIsFeedbackOpen(true)}>
                  Give feedback
                </button>
                <button type="button" className="writing-monitor__primary-button" onClick={printStudentReport}>
                  Preview &amp; print report
                </button>
              </div>
            ) : undefined}
          />
          {!collapsed.has('genres') ? (
            <>
              <div className="writing-monitor__student-summary">
                <div>
                  <span>Student overview</span>
                  <strong>{formatScoreLabel(selectedRow.latest_score)}</strong>
                  <small>Latest formative estimate</small>
                </div>
                <div>
                  <span>Total submissions</span>
                  <strong>{attemptsLoading ? '…' : attemptRows.length}</strong>
                  <small>Saved writing evidence</small>
                </div>
                <div>
                  <span>Practice progress</span>
                  <strong>{selectedRow.practice_completed_count ?? 0}/{selectedRow.practice_assigned_count ?? 0}</strong>
                  <small>Personalized activities</small>
                </div>
                <label>
                  <span>Class writing mode</span>
                  <select
                    value={selectedRow.integrity_mode ?? 'practice'}
                    onChange={(event: SelectChangeEvent) =>
                      void updateClassIntegrityMode(event.target.value as WritingIntegrityMode)}
                    disabled={!selectedRow.class_id}
                  >
                    <option value="practice">Practice · support allowed</option>
                    <option value="independent">Independent · paste blocked</option>
                    <option value="supervised">Supervised assessment</option>
                  </select>
                  <small>{modeUpdateStatus || 'Applies to this class.'}</small>
                </label>
              </div>

              {attemptsLoading ? (
                <div className="writing-monitor__inline-loading" role="status">
                  <span /> Loading genres and submissions…
                </div>
              ) : attemptError ? (
                <div className="writing-monitor__inline-error" role="alert">{attemptError}</div>
              ) : (
                <div className="writing-monitor__genre-grid">
                  {availableGenres.map((genre) => {
                    const count = genreCounts.get(genre) ?? 0;
                    const genreMeta = GENRE_META[genre as SupportedMonitorGenre];
                    const scores = attemptRows
                      .filter((attempt) => attempt.genre?.toLowerCase() === genre)
                      .map(extractAttemptScore)
                      .filter((score): score is number => score != null);
                    const average = scores.length > 0
                      ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
                      : null;
                    return (
                      <button
                        type="button"
                        key={genre}
                        className={`writing-monitor__genre-card${selectedGenre === genre ? ' is-selected' : ''}${count === 0 ? ' is-empty' : ''}`}
                        onClick={() => selectGenre(genre)}
                        aria-pressed={selectedGenre === genre}
                      >
                        <span className="writing-monitor__genre-icon" aria-hidden="true">{genreMeta?.icon ?? '📄'}</span>
                        <span>
                          <strong>{toGenreLabel(genre)}</strong>
                          <small>{genreMeta?.description ?? 'Writing evidence and teacher feedback'}</small>
                        </span>
                        <span className="writing-monitor__genre-count">
                          <strong>{count}</strong>
                          <small>{count === 1 ? 'submission' : 'submissions'}</small>
                        </span>
                        <span className="writing-monitor__genre-score">
                          {average == null ? 'No score yet' : `Average ${formatScoreLabel(average)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </section>
      ) : null}

      {selectedRow && selectedGenre ? (
        <section className="writing-monitor__section writing-monitor__section--reader">
          <CollapsibleHeading
            eyebrow="Step 4"
            title={`${toGenreLabel(selectedGenre)} submission book`}
            description="Flip through the student’s saved submissions in chronological evidence pages."
            collapsed={collapsed.has('reader')}
            onToggle={() => toggleCollapsed('reader')}
            actions={genreAttempts.length > 0 ? (
              <span className="writing-monitor__page-count">
                Submission {attemptIndex + 1} of {genreAttempts.length}
              </span>
            ) : undefined}
          />
          {!collapsed.has('reader') ? (
            genreAttempts.length === 0 ? (
              <div className="writing-monitor__empty writing-monitor__empty--genre">
                <span aria-hidden="true">📭</span>
                <strong>No {toGenreLabel(selectedGenre)} submissions yet</strong>
                <p>This genre remains visible so the teacher can see the student’s complete writing coverage.</p>
              </div>
            ) : activeAttempt ? (
              <>
                <div className="writing-monitor__book-controls writing-monitor__book-controls--top">
                  <button type="button" onClick={() => turnPage('backward')} disabled={attemptIndex === 0}>
                    <span aria-hidden="true">←</span> Previous submission
                  </button>
                  <div className="writing-monitor__book-dots" aria-label={`Submission ${attemptIndex + 1} of ${genreAttempts.length}`}>
                    {genreAttempts.map((attempt, index) => (
                      <button
                        type="button"
                        key={attempt.attempt_id || attempt.row_id}
                        className={index === attemptIndex ? 'is-active' : ''}
                        onClick={() => {
                          setFlipDirection(index > attemptIndex ? 'forward' : 'backward');
                          setAttemptIndex(index);
                          setFlipSequence((sequence) => sequence + 1);
                        }}
                        aria-label={`Open submission ${index + 1}`}
                        aria-current={index === attemptIndex ? 'page' : undefined}
                      />
                    ))}
                  </div>
                  <button type="button" onClick={() => turnPage('forward')} disabled={attemptIndex === genreAttempts.length - 1}>
                    Next submission <span aria-hidden="true">→</span>
                  </button>
                </div>

                <article
                  key={`${activeAttempt.attempt_id || activeAttempt.row_id}-${flipSequence}`}
                  className={`writing-monitor__book is-turning-${flipDirection}`}
                >
                  <div className="writing-monitor__book-spread">
                    <section className="writing-monitor__book-page writing-monitor__book-page--submission">
                      <header>
                        <span>{toGenreLabel(activeAttempt.genre || selectedGenre)}</span>
                        <strong>{formatDate(activeAttempt.created_at)}</strong>
                      </header>
                      <div className="writing-monitor__book-page-number">Writing evidence</div>
                      <h3>The task</h3>
                      <p className="writing-monitor__prompt">
                        {activeAttempt.prompt_text || 'Prompt text is not available for this submission.'}
                      </p>
                      <h3>Student submission</h3>
                      <div className="writing-monitor__submission-text">
                        {activeAttempt.student_submission || 'No submission text was saved.'}
                      </div>
                      <footer>Brain Heist Writing Hub · Evidence page</footer>
                    </section>

                    <section className="writing-monitor__book-page writing-monitor__book-page--feedback">
                      <header>
                        <span>Teacher review</span>
                        <strong>{formatScoreLabel(extractAttemptScore(activeAttempt))}</strong>
                      </header>
                      <div className="writing-monitor__book-page-number">Feedback &amp; next steps</div>
                      <h3>Feedback summary</h3>
                      <p className="writing-monitor__feedback-copy">{extractAttemptFeedbackText(activeAttempt)}</p>

                      <h3>Rubric snapshot</h3>
                      <div className="writing-monitor__rubric">
                        {readerRubric.map((row) => (
                          <div key={row.label}>
                            <span><strong>{row.label}</strong><b>{row.score == null ? '—' : `${row.score}/5`}</b></span>
                            <div><i style={{ width: `${Math.max(0, Math.min(100, ((row.score ?? 0) / 5) * 100))}%` }} /></div>
                            {row.note ? <small>{row.note}</small> : null}
                          </div>
                        ))}
                      </div>

                      <h3>Focus tags</h3>
                      <div className="writing-monitor__tags">
                        {readerWeaknesses.length > 0
                          ? readerWeaknesses.map((tag) => <span key={tag}>{toTeacherWeaknessLabel(tag)}</span>)
                          : <span className="is-neutral">No weakness tags saved for this submission</span>}
                      </div>

                      {readerCorrections.length > 0 ? (
                        <details className="writing-monitor__corrections">
                          <summary>Sentence-level corrections ({readerCorrections.length})</summary>
                          <div>
                            {readerCorrections.map((correction, index) => (
                              <p key={`${correction.type}-${index}`}>
                                <strong>{correction.type}</strong>
                                <del>{correction.wrong}</del>
                                <span aria-hidden="true">→</span>
                                <ins>{correction.correct}</ins>
                                {correction.explanation ? <small>{correction.explanation}</small> : null}
                              </p>
                            ))}
                          </div>
                        </details>
                      ) : null}
                      <footer>Brain Heist Writing Hub · Feedback page</footer>
                    </section>
                  </div>
                </article>

                <div className="writing-monitor__book-controls writing-monitor__book-controls--bottom">
                  <button type="button" onClick={() => turnPage('backward')} disabled={attemptIndex === 0}>
                    <span aria-hidden="true">←</span> Previous
                  </button>
                  <span>Use the arrows or keyboard ← → to flip through submissions.</span>
                  <button type="button" onClick={() => turnPage('forward')} disabled={attemptIndex === genreAttempts.length - 1}>
                    Next <span aria-hidden="true">→</span>
                  </button>
                </div>
              </>
            ) : null
          ) : null}
        </section>
      ) : null}

      {isFeedbackOpen && selectedRow ? (
        <div className="writing-monitor__modal-backdrop" role="presentation" onMouseDown={() => setIsFeedbackOpen(false)}>
          <section
            className="writing-monitor__feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="writing-feedback-title"
            onMouseDown={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="writing-monitor__eyebrow">Teacher feedback</span>
                <h2 id="writing-feedback-title">{toDisplayLabel(selectedRow.student_name, selectedRow.student_id)}</h2>
                <p>Edit the suggested praise, growth target, and next step in your own voice.</p>
              </div>
              <button type="button" onClick={() => setIsFeedbackOpen(false)} aria-label="Close feedback">×</button>
            </header>
            <label htmlFor="writing-feedback-editor">Feedback to student</label>
            <textarea
              id="writing-feedback-editor"
              value={feedbackDraft}
              onChange={(event: InputChangeEvent) => {
                setFeedbackDraft(event.target.value);
                setFeedbackStatus('');
              }}
            />
            {feedbackStatus ? <div className="writing-monitor__feedback-status" aria-live="polite">{feedbackStatus}</div> : null}
            <footer>
              <button type="button" className="writing-monitor__secondary-button" onClick={() => void copyFeedback()}>
                Copy feedback
              </button>
              <button type="button" className="writing-monitor__secondary-button" onClick={() => void saveFeedback('draft')}>
                Save draft
              </button>
              <button type="button" className="writing-monitor__primary-button" onClick={() => void saveFeedback('final')}>
                Finalize feedback
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
};

export default WritingMonitoringView;
