import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  getTeacherMonitoringOverviewScoped,
  getTeacherWritingReport,
  getTeacherAttemptListScoped,
  saveTeacherReportScoped,
  TeacherWritingAttemptRecord,
  getWritingMonitoringOverview,
  TeacherWritingReport,
  WritingMonitoringOverview,
  setTeacherWritingIntegrityMode,
} from '../../lib/brains_heist/writingIntegrationService.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { WRITING_ADMIN_HELP } from '../../lib/brains_heist/writingAdminHelp.js';
import { openProfessionalWritingReport } from '../../lib/brains_heist/writingReportDocument.js';
import type { WritingIntegrityMode } from '../../lib/brains_heist/writingIntegrity.js';

interface WritingMonitoringViewProps {
  month?: string;
  isLoading?: boolean;
  errorMessage?: string;
  filterQuery?: string;
}

type SortKey = 'student' | 'score_desc' | 'score_asc' | 'completion_desc' | 'completion_asc';
type SupportFilter = 'all' | 'needs_support' | 'improving' | 'stable';
type ReadinessFilter = 'all' | 'ready' | 'not_ready';
type InputChangeEvent = { target: { value: string } };
type SelectChangeEvent = { target: { value: string } };

type MonitoringRow = WritingMonitoringOverview['student_rows'][number] & { class_name?: string | null };

const shellCard = {
  border: '1px solid #334155',
  borderRadius: 12,
  background: 'linear-gradient(180deg, #0f172a 0%, #0b1223 100%)',
};

const tableHeaderCellStyle = {
  color: '#cbd5e1',
  background: '#111b31',
  borderBottom: '1px solid #334155',
  padding: '10px 12px',
  fontWeight: 700,
  position: 'sticky' as const,
  top: 0,
  zIndex: 1,
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.35,
};

const tableCellStyle = {
  color: '#f8fafc',
  borderBottom: '1px solid #1e293b',
  padding: '11px 12px',
  verticalAlign: 'top' as const,
  fontSize: 13,
};

const isLikelyInternalId = (value?: string): boolean => {
  if (!value) return true;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
};

const toDisplayLabel = (studentName: string | undefined, studentId: string): string => {
  const candidateName = studentName?.trim();
  if (candidateName && !isLikelyInternalId(candidateName)) return candidateName;
  const candidateUsername = studentId?.trim();
  if (candidateUsername && !isLikelyInternalId(candidateUsername)) return candidateUsername;
  return 'Student';
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

const toTeacherWeaknessLabel = (tag: string): string =>
  WEAKNESS_LABEL_MAP[tag] ??
  tag
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatScoreLabel = (score: number | null | undefined): string => {
  if (score == null || Number.isNaN(score)) return '—';
  return `${score}/20`;
};

const getClassLabel = (row: Pick<MonitoringRow, 'class_name' | 'current_grade'>): string => {
  const className = row.class_name?.trim();
  return className || `Grade ${row.current_grade} · Class not linked`;
};

type ReportConfidenceState = 'no_data' | 'partial_data' | 'full_insight';


const extractAttemptFeedbackText = (attempt: TeacherWritingAttemptRecord): string => {
  const richFeedback = (attempt.rich_feedback ?? {}) as Record<string, unknown>;
  const direct = [
    richFeedback['teacher_feedback'],
    richFeedback['summary'],
    richFeedback['task_understanding'],
    richFeedback['next_move'],
  ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;
  if (direct) return direct.trim();

  const assessment = (attempt.assessment ?? {}) as Record<string, unknown>;
  const assessmentSummary = assessment['subscale_summary'];
  if (Array.isArray(assessmentSummary)) {
    const lines = assessmentSummary.filter((item) => typeof item === 'string' && item.trim().length > 0) as string[];
    if (lines.length > 0) return lines.join('\n');
  }

  return 'No feedback available yet.';
};

const getReportConfidenceState = (report: TeacherWritingReport): ReportConfidenceState => {
  const submissionCount =
    report.overall_summary.submission_count ?? report.overall_summary.completed_tasks;
  const completionRate = report.overall_summary.completion_rate_percent;
  const hasScore = report.overall_summary.latest_score != null && !Number.isNaN(report.overall_summary.latest_score);
  const hasNoAttempts = submissionCount <= 0;

  if (hasNoAttempts && !hasScore) return 'no_data';
  if (completionRate <= 0 && !hasScore) return 'no_data';

  const strengths = report.strengths.filter((item) => Boolean(item?.trim()));
  const weakAreas = report.priority_weak_areas.filter((item) => Boolean(item?.trim()));
  const hasMissingAnalysis = !report.latest_evaluation || !report.monthly_summary;
  const veryLowAttempts = submissionCount < 2;

  if (veryLowAttempts || weakAreas.length === 0 || hasMissingAnalysis || strengths.length === 0) return 'partial_data';
  return 'full_insight';
};

const chipStyle = (mode: 'danger' | 'success' | 'neutral' | 'info') => {
  const map = {
    danger: { background: '#3a1212', color: '#fecaca', border: '1px solid #7f1d1d' },
    success: { background: '#122d1f', color: '#bbf7d0', border: '1px solid #166534' },
    neutral: { background: '#172036', color: '#cbd5e1', border: '1px solid #334155' },
    info: { background: '#122a49', color: '#bfdbfe', border: '1px solid #1d4ed8' },
  } as const;
  return { ...map[mode], borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 600 };
};

const toTrendLabel = (row: MonitoringRow): 'Improving' | 'Stable' | 'Declining' | 'No recent data' => {
  if ((row.attempts_count ?? 0) < 2) return 'No recent data';
  const deltas = Object.values(row.subscale_trend);
  if (deltas.every((value) => value === 0)) return 'No recent data';
  const positives = deltas.filter((value) => value > 0).length;
  const negatives = deltas.filter((value) => value < 0).length;
  if (positives >= 2 && positives > negatives) return 'Improving';
  if (negatives >= 2 && negatives > positives) return 'Declining';
  return 'Stable';
};

export const WritingMonitoringView: React.FC<WritingMonitoringViewProps> = ({
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
  filterQuery = '',
}) => {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLElement | null>(null);
  const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  const seededOverview = isTestRuntime ? getWritingMonitoringOverview(month) : null;
  const [overview, setOverview] = useState<WritingMonitoringOverview | null>(seededOverview?.ok ? seededOverview.data ?? null : null);
  const [loadError, setLoadError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('student');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [supportFilter, setSupportFilter] = useState<SupportFilter>('all');
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [weakAreaFilter, setWeakAreaFilter] = useState<string>('all');
  const [activeQuickFilter, setActiveQuickFilter] = useState<'all' | 'stalled' | 'improving'>('all');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [activeQueueTab, setActiveQueueTab] = useState<'urgent' | 'improving' | 'on_track' | 'all'>('all');
  const [actionedToday, setActionedToday] = useState<Set<string>>(new Set());
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState('Praise:\n\nGrowth target:\n\nNext step:');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [openReportData, setOpenReportData] = useState<TeacherWritingReport | null>(null);
  const [attemptRows, setAttemptRows] = useState<TeacherWritingAttemptRecord[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [modeUpdateStatus, setModeUpdateStatus] = useState('');

  const filters = parseAdminDrilldownFilters(filterQuery);

  const allRows: MonitoringRow[] = useMemo(() => (overview?.student_rows ?? []).map((row) => ({ ...row })), [overview]);

  const gradeOptions = useMemo(() => [...new Set(allRows.map((row) => String(row.current_grade)))].sort((a, b) => Number(a) - Number(b)), [allRows]);
  const classOptions = useMemo(() => {
    return [...new Set(allRows.map((row) => getClassLabel(row)))].sort();
  }, [allRows]);

  const rows = useMemo(() => {
    const filtered = allRows.filter((row) => {
      if (filters.grade && row.current_grade !== filters.grade) return false;
      if (filters.status === 'stalled' && !row.stalled) return false;
      if (filters.status === 'improving' && !row.improving) return false;
      if (filters.weakness_tag && !row.repeated_weakness_hotspots.includes(filters.weakness_tag)) return false;

      if (activeQuickFilter === 'stalled' && !row.stalled) return false;
      if (activeQuickFilter === 'improving' && !row.improving) return false;
      if (gradeFilter !== 'all' && String(row.current_grade) !== gradeFilter) return false;
      const normalizedClass = getClassLabel(row);
      if (classFilter !== 'all' && normalizedClass !== classFilter) return false;
      if (weakAreaFilter !== 'all' && !row.repeated_weakness_hotspots.includes(weakAreaFilter)) return false;

      const trendLabel = toTrendLabel(row);
      if (supportFilter === 'needs_support' && !row.stalled) return false;
      if (supportFilter === 'improving' && !row.improving) return false;
      if (supportFilter === 'stable' && (row.stalled || row.improving || trendLabel === 'Declining')) return false;
      if (readinessFilter === 'ready' && !row.ready_for_monthly_review) return false;
      if (readinessFilter === 'not_ready' && row.ready_for_monthly_review) return false;

      const searchable = `${toDisplayLabel(row.student_name, row.student_id)} ${getClassLabel(row)} ${row.weekly_target_summary} ${row.repeated_weakness_hotspots.join(' ')}`.toLowerCase();
      if (searchQuery && !searchable.includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    const next = [...filtered];
    next.sort((a, b) => {
      if (sortKey === 'completion_desc') return b.completion_rate - a.completion_rate;
      if (sortKey === 'completion_asc') return a.completion_rate - b.completion_rate;
      if (sortKey === 'score_desc') return (b.latest_score ?? -1) - (a.latest_score ?? -1);
      if (sortKey === 'score_asc') return (a.latest_score ?? 999) - (b.latest_score ?? 999);
      return toDisplayLabel(a.student_name, a.student_id).localeCompare(toDisplayLabel(b.student_name, b.student_id));
    });
    return next;
  }, [allRows, filters, activeQuickFilter, gradeFilter, classFilter, weakAreaFilter, supportFilter, readinessFilter, searchQuery, sortKey]);

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
  }, [month, isTestRuntime]);

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
    const nodes = [headerRef.current, listRef.current, detailsRef.current].filter(Boolean);
    if (nodes.length === 0) return;
    gsap.fromTo(
      nodes,
      { y: 16, autoAlpha: 0, scale: 0.99 },
      { y: 0, autoAlpha: 1, scale: 1, duration: 0.55, stagger: 0.08, ease: 'power2.out' }
    );
  }, [month]);

  useEffect(() => {
    if (!selectedStudentId && rows[0]?.student_id) setSelectedStudentId(rows[0].student_id);
  }, [rows, selectedStudentId]);


  useEffect(() => {
    if (!isReportOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsReportOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isReportOpen]);
  const selectedRow = rows.find((row) => row.student_id === selectedStudentId) ?? rows[0];

  const openReport = (studentId: string): void => {
    setSelectedStudentId(studentId);
    setIsReportOpen(true);
    setIsReportLoading(true);
    setReportError('');
    setAttemptRows([]);
    void Promise.all([
      getTeacherWritingReport({ student_id: studentId, month, include_snippet: true }),
      getTeacherAttemptListScoped({ student_id: studentId, limit: 80 }),
    ])
      .then(([reportResult, attemptsResult]) => {
        if (!reportResult.ok || !reportResult.data) {
          const errorMsg = reportResult.error ?? 'Unable to load report.';
          if (errorMsg.includes('Could not choose the best candidate function')) {
            setReportError('Database function configuration issue. Please contact your administrator.');
            console.error('RPC Overload Error:', errorMsg);
          } else {
            setReportError(errorMsg);
          }
          setOpenReportData(null);
          return;
        }
        setOpenReportData(reportResult.data);
        const report = reportResult.data;
        setFeedbackDraft([
          `Praise: ${report.strengths[0] ?? 'Thank you for completing this writing task.'}`,
          `Growth target: ${report.priority_weak_areas[0] ? toTeacherWeaknessLabel(report.priority_weak_areas[0]) : 'Use one feedback target in the next draft.'}`,
          `Next step: ${report.teacher_actions[0] ?? 'Revise one paragraph and explain what changed.'}`,
        ].join('\n\n'));
        setFeedbackStatus('');
        if (attemptsResult.ok && attemptsResult.data) setAttemptRows(attemptsResult.data);
        setActionedToday((prev) => new Set(prev).add(studentId));
      })
      .finally(() => setIsReportLoading(false));
  };


  useEffect(() => {
    if (activeQueueTab !== 'all') return;
    if (allRows.some((row) => row.status === 'needs_review' || row.status === 'needs_support' || row.stalled)) {
      setActiveQueueTab('urgent');
    }
  }, [allRows, activeQueueTab]);

  const queueRows = useMemo(() => {
    if (activeQueueTab === 'all') return rows;
    if (activeQueueTab === 'urgent') {
      return rows.filter((row) => row.status === 'needs_review' || row.status === 'needs_support' || row.stalled);
    }
    if (activeQueueTab === 'improving') return rows.filter((row) => row.improving && !row.stalled);
    return rows.filter((row) => !row.stalled && row.status !== 'needs_review' && !row.improving);
  }, [rows, activeQueueTab]);

  const getWhyFlagged = (row: MonitoringRow): string => {
    if (row.status_reason) return row.status_reason;
    if (row.stalled) return 'Comparable writing evidence is not improving yet.';
    if (row.improving) return 'Recent writing indicators show consistent progress.';
    if ((row.submission_count ?? row.attempts_count ?? 0) === 1) {
      return 'Baseline complete. The personalized practice plan is ready to begin.';
    }
    return 'Writing and practice evidence are on track.';
  };

  const printOpenReport = (): void => {
    if (!openReportData) return;
    openProfessionalWritingReport(openReportData, {
      audience: 'teacher',
      teacherComment: feedbackDraft,
      reportStatus: feedbackStatus.includes('final') ? 'final' : 'draft',
    });
  };

  const saveFeedbackDraft = (status: 'draft' | 'final' = 'draft'): void => {
    if (!selectedRow || !feedbackDraft.trim()) return;
    setFeedbackStatus(status === 'final' ? 'Publishing feedback...' : 'Saving securely...');
    void saveTeacherReportScoped({
      student_id: selectedRow.student_id,
      mode: 'student',
      month,
      status,
      teacher_comment: feedbackDraft.trim(),
      report_payload: {
        title: `Writing feedback for ${toDisplayLabel(selectedRow.student_name, selectedRow.student_id)}`,
        praise_growth_next_step: feedbackDraft.trim(),
        latest_score: selectedRow.latest_score,
        attempts_count: selectedRow.attempts_count,
        focus_areas: selectedRow.repeated_weakness_hotspots,
      },
    }).then((result) => {
      if (!result.ok) {
        setFeedbackStatus(result.error ?? 'Unable to save feedback.');
        return;
      }
      setFeedbackStatus(status === 'final' ? 'Feedback finalized and saved.' : 'Draft saved securely.');
      setActionedToday((current) => new Set(current).add(selectedRow.student_id));
    });
  };

  const copyFeedbackDraft = (): void => {
    if (typeof navigator === 'undefined' || !feedbackDraft.trim()) return;
    void navigator.clipboard.writeText(feedbackDraft).then(
      () => setFeedbackStatus('Copied to clipboard.'),
      () => setFeedbackStatus('Copy failed. Select the text and copy manually.')
    );
  };

  const updateClassIntegrityMode = (row: MonitoringRow, mode: WritingIntegrityMode): void => {
    if (!row.class_id) {
      setModeUpdateStatus('This student is not assigned to an active class.');
      return;
    }
    setModeUpdateStatus('Updating class writing mode...');
    void setTeacherWritingIntegrityMode({ class_id: row.class_id, mode }).then((result) => {
      if (!result.ok) {
        setModeUpdateStatus(result.error ?? 'Unable to update the class writing mode.');
        return;
      }
      setModeUpdateStatus(`${result.data?.class_name ?? row.class_name ?? 'Class'} is now in ${mode} mode.`);
      void refreshOverview();
    });
  };

  if (isLoading) {
    return (
      <div style={{ padding: 20, display: 'grid', gap: 12, background: '#0a0f1a' }}>
        {[1, 2, 3].map((item) => (
          <div key={item} style={{ ...shellCard, padding: 14, border: '1px solid #1e293b', display: 'grid', gap: 10 }}>
            <div style={{ width: '40%', height: 16, background: '#1e293b', borderRadius: 6 }} />
            <div style={{ width: '70%', height: 12, background: '#1e293b', borderRadius: 6 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(80px, 1fr))', gap: 8 }}>
              <div style={{ height: 36, background: '#111827', borderRadius: 8 }} />
              <div style={{ height: 36, background: '#111827', borderRadius: 8 }} />
              <div style={{ height: 36, background: '#111827', borderRadius: 8 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load writing monitor: {errorMessage}</div>;
  if (loadError && !overview) return <div style={{ padding: 12, color: '#e5e7eb' }}>{loadError}</div>;
  if (!overview) return <div style={{ padding: 12, color: '#e5e7eb' }}>No writing monitoring data available yet.</div>;
  if (overview.student_rows.length === 0) return <div style={{ padding: 12, color: '#e5e7eb' }}>No students with writing records yet.</div>;

  const stalledCount = allRows.filter((row) => row.status === 'needs_review' || row.status === 'needs_support' || row.stalled).length;
  const improvingCount = allRows.filter((row) => row.improving).length;
  const planReadyCount = allRows.filter((row) => row.status === 'plan_ready').length;
  const onTrackCount = allRows.filter((row) => row.status === 'on_track' || row.improving).length;

  return (
    <div className="writing-monitor writing-teacher-surface" style={{ padding: 20, color: '#f3f4f6', display: 'grid', gap: 20, background: '#0a0f1a' }}>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Weekly target</span>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Teacher/Admin Writing Monitor</span>
      {loadError ? (
        <div role="status" style={{ padding: '10px 12px', border: '1px solid #92400e', borderRadius: 9, color: '#fed7aa', background: 'rgba(146,64,14,.14)', fontSize: 12 }}>
          Live refresh paused. Showing the most recent synchronized data.
        </div>
      ) : null}

      {/* Header Section */}
      <section ref={headerRef} className="writing-teacher-hero" style={{ display: 'grid', gap: 16 }}>
        <div>
          <span className="writing-teacher-eyebrow">Student progress</span>
          <h1 style={{ margin: 0, color: '#ffffff', fontSize: 32, fontWeight: 900, letterSpacing: -0.5 }}>Writing Command Center</h1>
          <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 14 }}>Start with students who need action, then open one evidence review to decide the next teaching move.</p>
          <span className="writing-monitor__sync">
            {lastSyncedAt ? `Synced ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live sync active'}
          </span>
        </div>

        {/* Key Metrics */}
        <div className="writing-monitor__summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <div className="writing-teacher-metric is-attention" style={{ ...shellCard, padding: 16, display: 'grid', gap: 8, border: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Review now</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#fca5a5' }}>{stalledCount}</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>Evidence or progress needs attention</div>
          </div>
          <div className="writing-teacher-metric is-positive" style={{ ...shellCard, padding: 16, display: 'grid', gap: 8, border: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Improving</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#86efac' }}>{improvingCount}</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>Making progress</div>
          </div>
          <div className="writing-teacher-metric is-ready" style={{ ...shellCard, padding: 16, display: 'grid', gap: 8, border: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Plan ready</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#fcd34d' }}>{planReadyCount}</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>Baseline done; practice can begin</div>
          </div>
          <div className="writing-teacher-metric is-calm" style={{ ...shellCard, padding: 16, display: 'grid', gap: 8, border: '1px solid #1e293b' }}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>On track</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#93c5fd' }}>{onTrackCount}</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>No priority action required</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Actioned today: {actionedToday.size} • Start with Review now, then check Plan ready.</div>

      </section>

      <section className="writing-monitor__queues" aria-label="Student action queues" style={{ ...shellCard, padding: 12, border: '1px solid #1e293b', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([
          ['urgent', `Review now (${stalledCount})`],
          ['improving', `Improving (${allRows.filter((row) => row.improving && !row.stalled).length})`],
          ['on_track', `On Track (${allRows.filter((row) => !row.stalled && row.status !== 'needs_review' && !row.improving).length})`],
          ['all', `All Students (${rows.length})`],
        ] as const).map(([key, label]) => (
          <button className={activeQueueTab === key ? 'is-active' : ''} key={key} type="button" onClick={() => setActiveQueueTab(key)} style={{ ...chipStyle(activeQueueTab === key ? 'info' : 'neutral'), border: 'none', cursor: 'pointer' }}>{label}</button>
        ))}
      </section>
      {/* Filters Section */}

      <section className="writing-monitor__filters writing-teacher-card" style={{ ...shellCard, padding: 16, display: 'grid', gap: 12, border: '1px solid #1e293b' }}>
        <div className="writing-teacher-section-heading">
          <div>
            <span>Find a student</span>
            <h2>Filter the evidence queue</h2>
            <p>Class and grade come from the live school roster.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <select value={classFilter} onChange={(event: SelectChangeEvent) => setClassFilter(event.target.value)} style={{ background: "#0f1728", border: "1px solid #334155", color: "#f8fafc", borderRadius: 8, padding: "10px 12px", fontSize: 13 }}><option value="all">All Classes</option>{classOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <input value={searchQuery} onChange={(event: InputChangeEvent) => setSearchQuery(event.target.value)} placeholder="Search by name..." type="text" style={{ background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 }} />
        </div>
        <details>
          <summary style={{ cursor: 'pointer', color: '#93c5fd', fontSize: 13 }}>More filters</summary>
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <select value={gradeFilter} onChange={(event: SelectChangeEvent) => setGradeFilter(event.target.value)} style={{ background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            <option value="all">Grade: All</option>
            {gradeOptions.map((value) => <option key={value} value={value}>Grade {value}</option>)}
          </select>
          <select value={weakAreaFilter} onChange={(event: SelectChangeEvent) => setWeakAreaFilter(event.target.value)} style={{ background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            <option value="all">All weak areas</option>
            {overview.hotspot_tags.map((tag) => <option key={tag} value={tag}>{toTeacherWeaknessLabel(tag)}</option>)}
          </select>
          <select value={supportFilter} onChange={(event: SelectChangeEvent) => setSupportFilter(event.target.value as SupportFilter)} style={{ background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            <option value="all">Status: All</option>
            <option value="needs_support">Needs support</option>
            <option value="improving">Improving</option>
            <option value="stable">Stable</option>
          </select>
          <select value={readinessFilter} onChange={(event: SelectChangeEvent) => setReadinessFilter(event.target.value as ReadinessFilter)} style={{ background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            <option value="all">Readiness: All</option>
            <option value="ready">Ready for review</option>
            <option value="not_ready">Not ready</option>
          </select>
          <select value={sortKey} onChange={(event: SelectChangeEvent) => setSortKey(event.target.value as SortKey)} style={{ background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            <option value="student">Sort: A-Z</option>
            <option value="score_desc">Score: High to low</option>
            <option value="score_asc">Score: Low to high</option>
            <option value="completion_desc">Completion: High to low</option>
            <option value="completion_asc">Completion: Low to high</option>
          </select>
          </div>
        </details>
        <div>
          <button
            type="button"
            onClick={() => {
              setActiveQueueTab(allRows.some((row) => row.stalled) ? 'urgent' : 'all');
              setClassFilter('all');
              setGradeFilter('all');
              setWeakAreaFilter('all');
              setSupportFilter('all');
              setReadinessFilter('all');
              setActiveQuickFilter('all');
              setSearchQuery('');
              setSortKey('student');
            }}
            style={{ borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#cbd5e1', padding: '6px 10px', fontSize: 12 }}
          >
            Reset filters
          </button>
        </div>
      </section>

      {/* Main Content: Queue Cards */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div ref={listRef} style={{ display: 'grid', gap: 12 }}>
          {queueRows.map((row) => {
            const selected = selectedRow?.student_id === row.student_id;
            const statusLabel =
              row.status === 'needs_review' ? 'Review evidence'
                : row.status === 'needs_support' || row.stalled ? 'Needs support'
                  : row.status === 'plan_ready' ? 'Plan ready'
                    : row.status === 'not_started' ? 'Not started'
                      : row.improving ? 'Improving'
                        : 'On track';
            const statusTone =
              row.status === 'needs_review' || row.status === 'needs_support' || row.stalled
                ? 'danger'
                : row.improving
                  ? 'success'
                  : row.status === 'plan_ready'
                    ? 'info'
                    : 'neutral';
            return (
              <article className="writing-monitor__student-card" key={row.student_id} onClick={() => setSelectedStudentId(row.student_id)} style={{ ...shellCard, padding: 14, border: selected ? '1px solid #3b82f6' : '1px solid #1e293b', cursor: 'pointer', display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{toDisplayLabel(row.student_name, row.student_id)}</div>
                    <div className="writing-monitor__student-context" style={{ fontSize: 12, color: '#94a3b8' }}>{getClassLabel(row)} • Grade {row.current_grade}</div>
                  </div>
                  <span style={{ ...chipStyle(statusTone) }}>{statusLabel}</span>
                </div>
                <div className="writing-monitor__student-metrics">
                  <div><small>Formative estimate</small><strong>{formatScoreLabel(row.latest_score)}</strong></div>
                  <div><small>Submissions</small><strong>{row.submission_count ?? row.attempts_count ?? 0}</strong></div>
                  <div><small>Practice plan</small><strong>{row.practice_completed_count ?? 0}/{row.practice_assigned_count ?? 0}</strong></div>
                  <div><small>Trend</small><strong>{(row.submission_count ?? row.attempts_count ?? 0) < 2 ? 'Baseline' : toTrendLabel(row)}</strong></div>
                </div>
                <div className="writing-monitor__status-reason" style={{ fontSize: 13, color: '#cbd5e1' }}><strong>Why this status:</strong> {getWhyFlagged(row)}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="writing-teacher-button" type="button" onClick={(event: React.MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); openReport(row.student_id); }} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '7px 10px' }}>Open evidence review</button>
                </div>
              </article>
            );
          })}
          {queueRows.length === 0 ? <div style={{ ...shellCard, padding: 20, textAlign: 'center', color: '#cbd5e1' }}>{activeQueueTab === 'urgent' ? 'No writing evidence needs review right now. Check Plan ready or All Students.' : 'No students match these filters.'}</div> : null}
        </div>
      </div>

      {/* Report Modal */}
      {isReportOpen ? (
        <div className="writing-monitor__modal-backdrop" onClick={() => setIsReportOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.85)', zIndex: 40, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div className="writing-monitor__modal" onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()} style={{ ...shellCard, width: 'min(900px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 20, display: 'grid', gap: 14, border: '1px solid #1e293b', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            {/* Report Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderBottom: '1px solid #1e293b', paddingBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#f8fafc' }}>Writing Evidence Review</h2>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8' }}>Review the score, writing process, practice, feedback, and revision history together.</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setIsReportOpen(false)} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '10px 14px', fontWeight: 700, fontSize: 13 }}>Close</button>
              </div>
            </div>

            {isReportLoading && <div style={{ padding: 20, textAlign: 'center', color: '#cbd5e1' }}>Loading report…</div>}
            {reportError && <div style={{ padding: 16, background: 'rgba(244, 63, 94, 0.1)', border: '1px solid #7f1d1d', borderRadius: 8, color: '#fca5a5' }}>⚠ {reportError}</div>}

            {openReportData && (
              <div style={{ display: 'grid', gap: 16 }}>
                {(() => {
                  const confidenceState = getReportConfidenceState(openReportData);
                  const hasWeaknesses = openReportData.priority_weak_areas.length > 0;
                  const showAdvancedAnalysis = confidenceState === 'full_insight';
                  const showPartialMessage = confidenceState === 'partial_data';
                  const showNoDataMessage = confidenceState === 'no_data';
                  const statusLabel = showNoDataMessage
                    ? 'No data'
                    : selectedRow?.status === 'needs_review'
                      ? 'Review evidence'
                      : selectedRow?.status === 'plan_ready'
                        ? 'Plan ready'
                        : selectedRow?.stalled
                          ? 'Needs support'
                          : selectedRow?.improving
                            ? 'Improving'
                            : 'On track';
                  const suggestedNextStep = hasWeaknesses
                    ? openReportData.teacher_actions[0] ?? openReportData.student_friendly_summary.next_steps?.[0] ?? null
                    : null;

                  return (
                    <>
                {/* Student Info */}
                <div style={{ display: 'grid', gap: 8, background: 'rgba(30, 41, 59, 0.5)', borderRadius: 10, padding: 14, border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc' }}>{openReportData.student.student_name}</div>
                  <div style={{ fontSize: 13, color: '#cbd5e1' }}>Grade {openReportData.student.grade ?? '—'} • {openReportData.student.class_name?.trim() || 'Class not linked'} • {statusLabel}</div>
                  {selectedRow?.class_id ? (
                    <label className="writing-monitor__mode-control">
                      <span>Class writing mode</span>
                      <select
                        value={selectedRow.integrity_mode ?? 'practice'}
                        onChange={(event: SelectChangeEvent) => updateClassIntegrityMode(selectedRow, event.target.value as WritingIntegrityMode)}
                      >
                        <option value="practice">Practice - support allowed</option>
                        <option value="independent">Independent - paste blocked</option>
                        <option value="supervised">Supervised assessment</option>
                      </select>
                    </label>
                  ) : null}
                  {modeUpdateStatus ? <div aria-live="polite" style={{ fontSize: 12, color: '#a5f3fc' }}>{modeUpdateStatus}</div> : null}
                </div>

                {/* Key Metrics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid #1e3a8a', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Formative estimate</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#93c5fd' }}>{formatScoreLabel(openReportData.overall_summary.latest_score)}</div>
                  </div>
                  <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid #15803d', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Submissions</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#86efac' }}>{openReportData.overall_summary.submission_count ?? attemptRows.length}</div>
                  </div>
                  <div style={{ background: 'rgba(249, 115, 22, 0.08)', border: '1px solid #92400e', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Trend</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#fbbf24' }}>{(openReportData.overall_summary.submission_count ?? attemptRows.length) < 2 ? 'Baseline' : (openReportData.overall_summary.score_trend_delta ?? 'Stable')}</div>
                  </div>
                  <div style={{ background: 'rgba(45, 212, 191, 0.08)', border: '1px solid #0f766e', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Practice plan</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#99f6e4' }}>{openReportData.overall_summary.practice_completed_count ?? openReportData.overall_summary.completed_tasks}/{openReportData.overall_summary.practice_assigned_count ?? openReportData.overall_summary.total_tasks}</div>
                  </div>
                </div>
                <div className={`writing-monitor__integrity writing-monitor__integrity--${openReportData.integrity?.review_status ?? 'practice_mode'}`}>
                  <strong>
                    {openReportData.integrity?.review_status === 'review_recommended'
                      ? 'Writing-process review recommended'
                      : openReportData.integrity?.review_status === 'no_concerns_observed'
                        ? 'No process concern observed'
                        : 'Practice evidence'}
                  </strong>
                  <span>
                    Mode: {openReportData.integrity?.mode ?? 'practice'}.
                    {openReportData.integrity?.review_status === 'review_recommended'
                      ? ` Signals: ${(openReportData.integrity.reasons ?? []).map(toTeacherWeaknessLabel).join(', ') || 'unusual composition pattern'}.`
                      : ' Automated results remain formative and teacher judgement is final.'}
                  </span>
                </div>

                {/* Detailed Info */}
                <div style={{ display: 'grid', gap: 12, borderTop: '1px solid #1e293b', paddingTop: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>What’s happening</div>
                    <div style={{ fontSize: 14, color: '#e2e8f0' }}>
                      {showNoDataMessage
                        ? 'No writing data available yet. Ask the student to complete a task to generate insights.'
                        : showPartialMessage
                          ? 'Not enough data to identify clear strengths or weaknesses yet.'
                          : `Latest formative estimate ${formatScoreLabel(openReportData.overall_summary.latest_score)} across ${(openReportData.overall_summary.submission_count ?? attemptRows.length)} submission${(openReportData.overall_summary.submission_count ?? attemptRows.length) === 1 ? '' : 's'}.`}
                    </div>
                  </div>
                  {showAdvancedAnalysis ? (
                    <>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Strength</div>
                        <div style={{ fontSize: 14, color: '#e2e8f0' }}>{openReportData.strengths.join(', ')}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Needs Work</div>
                        <div style={{ fontSize: 14, color: '#e2e8f0' }}>{openReportData.priority_weak_areas.map(toTeacherWeaknessLabel).join(', ')}</div>
                      </div>
                      {suggestedNextStep ? (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Suggested next step</div>
                          <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.6 }}>{suggestedNextStep}</div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, background: '#0b1223' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>Attempt history (genre, submission, feedback)</div>
                    {attemptRows.length === 0 ? (
                      <div style={{ fontSize: 13, color: '#cbd5e1' }}>No attempts available yet.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {attemptRows.map((attempt) => {
                          const assessment = (attempt.assessment ?? {}) as { total_score?: number };
                                                    return (
                            <article key={attempt.row_id} style={{ border: '1px solid #1e293b', borderRadius: 8, padding: 10, background: '#0f172a' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                <strong>{attempt.genre || 'Unknown genre'}</strong>
                                <span style={{ color: '#93c5fd' }}>{formatScoreLabel(assessment.total_score ?? null)}</span>
                              </div>
                              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{attempt.created_at}</div>
                              <div style={{ fontSize: 13, color: '#e2e8f0', whiteSpace: 'pre-wrap', marginBottom: 8 }}>{attempt.student_submission || 'No submission text.'}</div>
                              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>Feedback</div>
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ fontSize: 13, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>{extractAttemptFeedbackText(attempt)}</div>
                                {(() => {
                                  const assessmentFull = (attempt.assessment ?? {}) as Record<string, unknown>;
                                  const subscores = (assessmentFull['subscores'] ?? {}) as Record<string, number | null | undefined>;
                                  const criterionFeedback = (assessmentFull['band_justification'] ?? {}) as Record<string, string | null | undefined>;
                                  const weaknessTags = Array.isArray(assessmentFull['weakness_tags'])
                                    ? (assessmentFull['weakness_tags'] as string[])
                                    : [];
                                  const missedContentPoints = Array.isArray(assessmentFull['missed_content_points'])
                                    ? (assessmentFull['missed_content_points'] as string[])
                                    : [];
                                  const rows = [
                                    ['Content', subscores['content'], criterionFeedback['content']],
                                    ['Communicative Achievement', subscores['communicative_achievement'], criterionFeedback['communicative_achievement']],
                                    ['Organisation', subscores['organisation'], criterionFeedback['organisation']],
                                    ['Language', subscores['language'], criterionFeedback['language']],
                                  ] as const;
                                  const richFeedback = (attempt.rich_feedback ?? {}) as Record<string, unknown>;
                                  const wordLevelFixes = [
                                    ...((richFeedback['grammar_fixes'] as Array<Record<string, string>> | undefined) ?? []).map((fix) => ({
                                      type: 'Grammar',
                                      wrong: fix['original'] ?? '',
                                      correct: fix['better_version'] ?? '',
                                      explanation: '',
                                    })),
                                    ...((richFeedback['punctuation_fixes'] as Array<Record<string, string>> | undefined) ?? []).map((fix) => ({
                                      type: 'Punctuation',
                                      wrong: fix['original'] ?? '',
                                      correct: fix['better_version'] ?? '',
                                      explanation: '',
                                    })),
                                    ...((richFeedback['natural_phrase_upgrades'] as Array<Record<string, string>> | undefined) ?? []).map((fix) => ({
                                      type: 'Phrasing',
                                      wrong: fix['original'] ?? '',
                                      correct: fix['better_version'] ?? '',
                                      explanation: fix['why_it_helps'] ?? '',
                                    })),
                                  ].filter((fix) => fix.wrong.trim() && fix.correct.trim());
                                  const hasAny = rows.some(([, score, comment]) => score != null || (typeof comment === 'string' && comment.trim().length > 0));
                                  if (!hasAny && weaknessTags.length === 0 && missedContentPoints.length === 0 && wordLevelFixes.length === 0) return null;
                                  return (
                                    <div style={{ border: '1px solid #334155', borderRadius: 8, padding: 8, background: '#020617' }}>
                                      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>AI grading breakdown</div>
                                      <div style={{ display: 'grid', gap: 6 }}>
                                        {rows.map(([label, score, comment]) => (
                                          <div key={label} style={{ borderTop: '1px solid #1e293b', paddingTop: 6 }}>
                                            <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>{label}: {score ?? '—'}/5</div>
                                            <div style={{ marginTop: 4, width: '100%', height: 7, borderRadius: 999, background: '#1e293b', overflow: 'hidden' }}>
                                              <div
                                                style={{
                                                  width: `${Math.max(0, Math.min(100, ((score ?? 0) / 5) * 100))}%`,
                                                  height: '100%',
                                                  borderRadius: 999,
                                                  background: (score ?? 0) >= 4 ? '#22c55e' : (score ?? 0) >= 3 ? '#eab308' : '#ef4444',
                                                }}
                                              />
                                            </div>
                                            <div style={{ fontSize: 12, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>{comment?.trim() || 'No criterion note provided.'}</div>
                                          </div>
                                        ))}
                                        {missedContentPoints.length > 0 ? (
                                          <div style={{ borderTop: '1px solid #1e293b', paddingTop: 6 }}>
                                            <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 700 }}>Missed content points</div>
                                            <div style={{ fontSize: 12, color: '#fecaca', whiteSpace: 'pre-wrap' }}>{missedContentPoints.join('; ')}</div>
                                          </div>
                                        ) : null}
                                        {weaknessTags.length > 0 ? (
                                          <div style={{ borderTop: '1px solid #1e293b', paddingTop: 6 }}>
                                            <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>Detected mistakes</div>
                                            <div style={{ fontSize: 12, color: '#fde68a', whiteSpace: 'pre-wrap' }}>{weaknessTags.map(toTeacherWeaknessLabel).join(', ')}</div>
                                          </div>
                                        ) : null}
                                        {wordLevelFixes.length > 0 ? (
                                          <div style={{ borderTop: '1px solid #1e293b', paddingTop: 6 }}>
                                            <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 700 }}>Word-by-word corrections</div>
                                            <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                                              {wordLevelFixes.map((fix, fixIdx) => (
                                                <div key={`${attempt.row_id}-fix-${fixIdx}`} style={{ fontSize: 12, color: '#dbeafe' }}>
                                                  <strong>{fix.type}:</strong>{' '}
                                                  <span style={{ color: '#fca5a5', textDecoration: 'line-through' }}>{fix.wrong}</span>{' '}
                                                  → <span style={{ color: '#86efac', fontWeight: 700 }}>{fix.correct}</span>
                                                  {fix.explanation ? <span style={{ color: '#cbd5e1' }}> ({fix.explanation})</span> : null}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #1e293b', paddingTop: 12 }}>
                  <button type="button" onClick={() => setIsFeedbackOpen(true)} style={{ borderRadius: 8, border: '1px solid #3b82f6', background: '#1d4ed8', color: '#fff', padding: '8px 12px' }}>Give Feedback</button>
                  <button type="button" onClick={printOpenReport} style={{ borderRadius: 8, border: '1px solid #14b8a6', background: '#0f766e', color: '#fff', padding: '8px 12px', fontWeight: 800 }}>Preview &amp; Print Report</button>
                  <button type="button" onClick={() => setIsReportOpen(false)} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '8px 12px' }}>Close</button>
                </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {isFeedbackOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.7)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...shellCard, width: 'min(640px, 100%)', padding: 16, display: 'grid', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0 }}>Teacher Feedback</h3>
              <p style={{ margin: '5px 0 0', color: '#94a3b8', fontSize: 13 }}>
                A suggested praise, growth target, and next step are ready. Edit them in your own voice.
              </p>
            </div>
            <label htmlFor="writing-feedback-editor" style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 800 }}>Feedback to student</label>
            <textarea
              id="writing-feedback-editor"
              value={feedbackDraft}
              onChange={(event: InputChangeEvent) => {
                setFeedbackDraft(event.target.value);
                setFeedbackStatus('');
              }}
              style={{ minHeight: 180, background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: 8, padding: 10 }}
            />
            {feedbackStatus ? <div aria-live="polite" style={{ color: feedbackStatus.includes('failed') || feedbackStatus.includes('Unable') ? '#fca5a5' : '#86efac', fontSize: 13 }}>{feedbackStatus}</div> : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => saveFeedbackDraft('draft')} disabled={!feedbackDraft.trim()} style={{ borderRadius: 8, border: '1px solid #2563eb', background: '#1d4ed8', color: '#fff', padding: '8px 12px' }}>Save Draft</button>
              <button type="button" onClick={() => saveFeedbackDraft('final')} disabled={!feedbackDraft.trim()} style={{ borderRadius: 8, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '8px 12px', fontWeight: 800 }}>Finalize Feedback</button>
              <button type="button" onClick={copyFeedbackDraft} disabled={!feedbackDraft.trim()} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '8px 12px' }}>Copy Feedback</button>
              <button type="button" onClick={() => setIsFeedbackOpen(false)} style={{ borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#fff', padding: '8px 12px' }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default WritingMonitoringView;
