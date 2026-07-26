import React, { useEffect, useMemo, useState } from 'react';
import {
  exportAdminCalibrationReport,
  exportStudentMonthlyWritingReport,
  getTeacherAttemptListScoped,
  getTeacherExportRowsScoped,
  getTeacherSavedReportsScoped,
  getTeacherWritingReport,
  saveTeacherReportScoped,
  TeacherSavedWritingReport,
  TeacherWritingAttemptRecord,
  TeacherWritingReport,
  WritingExportDocument,
} from '../../lib/brains_heist/writingIntegrationService.js';
import {
  humanizeWritingTag,
  openProfessionalWritingReport,
} from '../../lib/brains_heist/writingReportDocument.js';
import type { SupportedGenre } from '../../lib/brains_heist/writingAssessment.js';

interface WritingExportCenterProps {
  mode: 'student' | 'teacher' | 'admin';
  studentId?: string;
  month?: string;
  isLoading?: boolean;
  errorMessage?: string;
}

interface TeacherExportRow {
  student_id: string;
  student_name: string;
  grade: number;
  completion_rate: number;
  latest_score: number | null;
}

interface TeacherReportDraft {
  id?: string;
  status: 'draft' | 'final';
  strengths: string;
  growth_targets: string;
  next_steps: string;
  teacher_comment: string;
}

type InputChangeEvent = { target: { value: string } };

const EMPTY_DRAFT: TeacherReportDraft = {
  status: 'draft',
  strengths: '',
  growth_targets: '',
  next_steps: '',
  teacher_comment: '',
};

const parseList = (value: string): string[] =>
  value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatScore = (score: number | null | undefined): string =>
  score == null || Number.isNaN(Number(score)) ? 'Not scored' : `${Number(score)}/20`;

const formatPeriod = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getInitials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'ST';

const isUuid = (value?: string): boolean =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()));

const renderExport = (doc: WritingExportDocument): React.ReactElement => (
  <article className="writing-export-document">
    <h3>{doc.title}</h3>
    <div dangerouslySetInnerHTML={{ __html: doc.html }} />
  </article>
);

const rubricItems = (report: TeacherWritingReport): Array<{ label: string; score: number | null }> => [
  { label: 'Content', score: report.rubric_scores?.content ?? null },
  { label: 'Purpose & audience', score: report.rubric_scores?.communicative_achievement ?? null },
  { label: 'Organisation', score: report.rubric_scores?.organisation ?? null },
  { label: 'Language', score: report.rubric_scores?.language ?? null },
];

const WritingEvidenceList = ({
  attempts,
  selectedAttemptId,
  onSelect,
}: {
  attempts: TeacherWritingAttemptRecord[];
  selectedAttemptId: string;
  onSelect: (attemptId: string) => void;
}): React.ReactElement => (
  <div className="writing-reports__attempt-list">
    {attempts.map((attempt) => {
      const score = Number((attempt.assessment as Record<string, unknown> | undefined)?.['total_score']);
      const isSelected = selectedAttemptId === attempt.attempt_id;
      return (
        <button
          key={attempt.attempt_id}
          type="button"
          className={`writing-reports__attempt-card${isSelected ? ' is-selected' : ''}`}
          onClick={() => onSelect(attempt.attempt_id)}
          aria-pressed={isSelected}
        >
          <span className="writing-reports__attempt-icon">📝</span>
          <span>
            <strong>{attempt.attempt_type === 'initial_assessment' ? 'Baseline writing' : 'Writing submission'}</strong>
            <small>{formatDate(attempt.created_at)} · {attempt.genre || 'Writing'}</small>
          </span>
          <b>{formatScore(Number.isFinite(score) ? score : null)}</b>
        </button>
      );
    })}
    {attempts.length === 0 && (
      <div className="writing-reports__empty-inline">
        No writing evidence has been submitted for this student yet.
      </div>
    )}
  </div>
);

export const WritingExportCenter = ({
  mode,
  studentId,
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
}: WritingExportCenterProps): React.ReactElement => {
  const [teacherRows, setTeacherRows] = useState<TeacherExportRow[] | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [teacherSummaryReport, setTeacherSummaryReport] = useState<TeacherWritingReport | null>(null);
  const [attempts, setAttempts] = useState<TeacherWritingAttemptRecord[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState('');
  const [savedReports, setSavedReports] = useState<TeacherSavedWritingReport[]>([]);
  const [draft, setDraft] = useState<TeacherReportDraft>(EMPTY_DRAFT);
  const [searchQuery, setSearchQuery] = useState('');
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [teacherReportError, setTeacherReportError] = useState('');
  const [editorMessage, setEditorMessage] = useState('');
  const [showSubmission, setShowSubmission] = useState(false);

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return teacherRows ?? [];
    return (teacherRows ?? []).filter((row) =>
      `${row.student_name} ${row.grade}`.toLowerCase().includes(query)
    );
  }, [teacherRows, searchQuery]);

  const selectedAttempt = useMemo(
    () => attempts.find((attempt) => attempt.attempt_id === selectedAttemptId) ?? null,
    [attempts, selectedAttemptId]
  );

  const editedReport = useMemo<TeacherWritingReport | null>(() => {
    if (!teacherSummaryReport) return null;
    const strengths = parseList(draft.strengths);
    const growthTargets = parseList(draft.growth_targets);
    const nextSteps = parseList(draft.next_steps);
    return {
      ...teacherSummaryReport,
      strengths: strengths.length ? strengths : teacherSummaryReport.strengths,
      priority_weak_areas: growthTargets.length
        ? growthTargets
        : teacherSummaryReport.priority_weak_areas,
      teacher_actions: nextSteps.length ? nextSteps : teacherSummaryReport.teacher_actions,
      student_friendly_summary: {
        ...teacherSummaryReport.student_friendly_summary,
        next_steps: nextSteps.length
          ? nextSteps
          : teacherSummaryReport.student_friendly_summary.next_steps,
      },
    };
  }, [teacherSummaryReport, draft.strengths, draft.growth_targets, draft.next_steps]);

  const exportCsv = (): void => {
    if (!teacherRows || typeof window === 'undefined') return;
    const escapeField = (value: string): string => {
      const escaped = value.replace(/"/g, '""');
      return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    };
    const header = 'student_name,student_id,grade,practice_completion,latest_formative_score';
    const lines = teacherRows.map((row) => [
      escapeField(row.student_name),
      escapeField(row.student_id),
      escapeField(String(row.grade)),
      escapeField(`${Math.round(row.completion_rate * 100)}%`),
      escapeField(row.latest_score == null ? '' : String(row.latest_score)),
    ].join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `writing-class-summary-${month}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const openReport = (audience: 'teacher' | 'parent'): void => {
    if (!editedReport) return;
    const opened = openProfessionalWritingReport(editedReport, {
      audience,
      teacherComment: draft.teacher_comment,
      reportStatus: draft.status,
    });
    if (!opened) setEditorMessage('Your browser blocked the report preview. Allow pop-ups and try again.');
  };

  const saveReport = (status: 'draft' | 'final'): void => {
    if (!selectedStudentId || !editedReport) return;
    setEditorMessage(status === 'final' ? 'Finalizing report…' : 'Saving draft…');
    void saveTeacherReportScoped({
      report_id: draft.id,
      student_id: selectedStudentId,
      mode: 'student',
      month,
      genre: editedReport.genre as SupportedGenre,
      status,
      teacher_comment: draft.teacher_comment,
      report_payload: {
        title: 'Writing Progress Report',
        strengths: editedReport.strengths,
        recurring_weaknesses: editedReport.priority_weak_areas,
        teacher_recommendations: editedReport.teacher_actions,
      },
    }).then((result) => {
      if (!result.ok || !result.data) {
        setEditorMessage(result.error ?? 'The report could not be saved. Please try again.');
        return;
      }
      setDraft((current) => ({
        ...current,
        id: result.data?.id,
        status: result.data?.status ?? status,
      }));
      setEditorMessage(status === 'final' ? 'Report finalized and ready to share.' : 'Draft saved.');
      void getTeacherSavedReportsScoped({ student_id: selectedStudentId }).then((savedResult) => {
        if (savedResult.ok && savedResult.data) setSavedReports(savedResult.data);
      });
    });
  };

  const loadSavedReport = (saved: TeacherSavedWritingReport): void => {
    const payload = saved.report_payload ?? {};
    setDraft({
      id: saved.id,
      status: saved.status,
      strengths: ((payload['strengths'] as string[]) ?? []).join('\n'),
      growth_targets: ((payload['recurring_weaknesses'] as string[]) ?? []).join('\n'),
      next_steps: ((payload['teacher_recommendations'] as string[]) ?? []).join('\n'),
      teacher_comment: saved.teacher_comment ?? '',
    });
    setEditorMessage(`${saved.status === 'final' ? 'Final' : 'Draft'} report from ${formatDate(saved.updated_at)} loaded.`);
  };

  useEffect(() => {
    let cancelled = false;
    if (mode !== 'teacher') return;
    setTeacherLoading(true);
    setTeacherReportError('');

    const request = studentId
      ? getTeacherWritingReport({ student_id: studentId, month, include_snippet: false })
      : getTeacherExportRowsScoped(month);

    void request
      .then((result) => {
        if (cancelled) return;
        if (!result.ok || !result.data) {
          setTeacherReportError('Writing reports could not be loaded. Please refresh and try again.');
          return;
        }
        if (studentId) {
          setTeacherRows(null);
          setTeacherSummaryReport(result.data as TeacherWritingReport);
          setSelectedStudentId(studentId);
        } else {
          const rows = result.data as TeacherExportRow[];
          setTeacherRows(rows);
          setSelectedStudentId((current) => current || rows[0]?.student_id || '');
        }
      })
      .catch(() => {
        if (!cancelled) setTeacherReportError('Writing reports could not be loaded. Please refresh and try again.');
      })
      .finally(() => {
        if (!cancelled) setTeacherLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, studentId, month]);

  useEffect(() => {
    if (mode !== 'teacher' || !selectedStudentId) return;
    if (!isUuid(selectedStudentId)) {
      setTeacherReportError('This student record needs refreshing. Ask your school administrator to check the student profile.');
      return;
    }

    let cancelled = false;
    setTeacherLoading(true);
    setTeacherReportError('');
    setEditorMessage('');
    setShowSubmission(false);
    setDraft(EMPTY_DRAFT);

    void Promise.all([
      getTeacherWritingReport({ student_id: selectedStudentId, month, include_snippet: true }),
      getTeacherAttemptListScoped({ student_id: selectedStudentId, limit: 30 }),
      getTeacherSavedReportsScoped({ student_id: selectedStudentId }),
    ]).then(([summaryResult, attemptsResult, savedResult]) => {
      if (cancelled) return;
      if (!summaryResult.ok || !summaryResult.data) {
        setTeacherSummaryReport(null);
        setTeacherReportError('This student does not have enough writing data for a report yet.');
        return;
      }

      const report = summaryResult.data;
      setTeacherSummaryReport(report);
      setDraft({
        status: 'draft',
        strengths: report.strengths.join('\n'),
        growth_targets: report.priority_weak_areas.map(humanizeWritingTag).join('\n'),
        next_steps: report.teacher_actions.join('\n'),
        teacher_comment: '',
      });

      const attemptRows = attemptsResult.ok && attemptsResult.data ? attemptsResult.data : [];
      setAttempts(attemptRows);
      setSelectedAttemptId(attemptRows[0]?.attempt_id ?? '');
      setSavedReports(savedResult.ok && savedResult.data ? savedResult.data : []);
    }).finally(() => {
      if (!cancelled) setTeacherLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [mode, selectedStudentId, month]);

  if (isLoading) {
    return <div className="writing-reports__state">Loading Writing Reports…</div>;
  }
  if (errorMessage) {
    return <div className="writing-reports__state writing-reports__state--error">Writing Reports could not be opened. Please try again.</div>;
  }

  if (mode === 'teacher') {
    const summary = teacherSummaryReport?.overall_summary;
    const reportedSubmissions = summary?.submission_count ?? 0;
    const submissions = Math.max(reportedSubmissions, summary?.latest_score != null ? 1 : 0);
    const practiceCompleted = summary?.practice_completed_count ?? summary?.completed_tasks ?? 0;
    const practiceAssigned = summary?.practice_assigned_count ?? summary?.total_tasks ?? 0;
    const scoreTrend = summary?.score_trend_delta;
    const trendLabel = submissions < 2
      ? 'Baseline only'
      : scoreTrend == null
        ? 'No comparable trend'
        : scoreTrend > 0
          ? `Improved by ${scoreTrend}`
          : scoreTrend < 0
            ? `Down by ${Math.abs(scoreTrend)}`
            : 'Holding steady';
    const reportStage = submissions === 0
      ? { label: 'No writing yet', tone: 'empty', copy: 'Ask the student to complete their first writing task.' }
      : submissions === 1
        ? { label: 'Baseline ready', tone: 'baseline', copy: 'This is a starting point. A trend appears after another comparable submission.' }
        : { label: 'Progress report ready', tone: 'ready', copy: 'There is enough evidence to discuss progress and agree on next steps.' };
    const integrityLabel = teacherSummaryReport?.integrity?.review_status === 'review_recommended'
      ? 'Review the writing process before sharing this score.'
      : teacherSummaryReport?.integrity?.review_status === 'no_concerns_observed'
        ? 'No writing-process concerns were observed.'
        : 'Practice mode: the score supports learning but does not verify authorship.';

    return (
      <main className="writing-reports">
        <header className="writing-reports__header">
          <div>
            <span className="writing-reports__eyebrow">Writing Hub · Reports</span>
            <h2>Turn writing evidence into a clear conversation</h2>
            <p>Choose a student, check the learning story, add your professional comment, then print a school-ready report.</p>
          </div>
          <div className="writing-reports__period">
            <span>Reporting period</span>
            <strong>{formatPeriod(month)}</strong>
          </div>
        </header>

        <ol className="writing-reports__steps" aria-label="Report workflow">
          <li className={selectedStudentId ? 'is-complete' : 'is-current'}><b>1</b><span><strong>Choose</strong><small>Select a student</small></span></li>
          <li className={teacherSummaryReport ? 'is-complete' : selectedStudentId ? 'is-current' : ''}><b>2</b><span><strong>Review</strong><small>Understand the evidence</small></span></li>
          <li className={teacherSummaryReport ? 'is-current' : ''}><b>3</b><span><strong>Share</strong><small>Comment and print</small></span></li>
        </ol>

        {teacherRows && (
          <section className="writing-reports__picker" aria-labelledby="writing-student-picker-title">
            <div className="writing-reports__section-heading">
              <div>
                <span>Step 1</span>
                <h3 id="writing-student-picker-title">Choose a student</h3>
              </div>
              <button type="button" className="writing-reports__button writing-reports__button--quiet" onClick={exportCsv}>
                Export class summary
              </button>
            </div>
            <label className="writing-reports__search">
              <span>Search by student name or grade</span>
              <input
                value={searchQuery}
                onChange={(event: InputChangeEvent) => setSearchQuery(event.target.value)}
                placeholder="Start typing a student name…"
              />
            </label>
            <div className="writing-reports__student-list">
              {visibleRows.map((row) => (
                <button
                  key={row.student_id}
                  type="button"
                  className={`writing-reports__student-card${row.student_id === selectedStudentId ? ' is-selected' : ''}`}
                  onClick={() => setSelectedStudentId(row.student_id)}
                  aria-pressed={row.student_id === selectedStudentId}
                >
                  <span className="writing-reports__avatar">{getInitials(row.student_name)}</span>
                  <span>
                    <strong>{row.student_name}</strong>
                    <small>Grade {row.grade} · {formatScore(row.latest_score)}</small>
                  </span>
                  <i aria-hidden="true">→</i>
                </button>
              ))}
              {visibleRows.length === 0 && <div className="writing-reports__empty-inline">No students match that search.</div>}
            </div>
          </section>
        )}

        {teacherReportError && (
          <div className="writing-reports__state writing-reports__state--error" role="alert">
            {teacherReportError}
          </div>
        )}

        {teacherLoading && selectedStudentId && (
          <div className="writing-reports__state" aria-live="polite">Building the student’s writing story…</div>
        )}

        {teacherSummaryReport && !teacherLoading && (
          <>
            <section className="writing-reports__overview" aria-labelledby="writing-report-overview-title">
              <div className="writing-reports__student-hero">
                <span className="writing-reports__avatar writing-reports__avatar--large">
                  {getInitials(teacherSummaryReport.student.student_name)}
                </span>
                <div>
                  <span>Student writing story</span>
                  <h3 id="writing-report-overview-title">{teacherSummaryReport.student.student_name}</h3>
                  <p>
                    Grade {teacherSummaryReport.student.grade ?? '—'} · {teacherSummaryReport.student.class_name}
                    {' · '}{teacherSummaryReport.genre}
                  </p>
                </div>
                <span className={`writing-reports__readiness writing-reports__readiness--${reportStage.tone}`}>{reportStage.label}</span>
              </div>

              <div className="writing-reports__guidance">
                <strong>What this report means</strong>
                <span>{reportStage.copy}</span>
              </div>

              <div className="writing-reports__metrics">
                <article>
                  <span>Formative estimate</span>
                  <strong>{formatScore(summary?.latest_score)}</strong>
                  <small>Use with teacher judgement</small>
                </article>
                <article>
                  <span>Writing evidence</span>
                  <strong>{submissions}</strong>
                  <small>{submissions === 1 ? 'submission' : 'submissions'}</small>
                </article>
                <article>
                  <span>Practice plan</span>
                  <strong>{practiceAssigned ? `${practiceCompleted}/${practiceAssigned}` : 'Not assigned'}</strong>
                  <small>{practiceAssigned ? 'tasks completed' : 'No practice tasks yet'}</small>
                </article>
                <article>
                  <span>Progress trend</span>
                  <strong>{trendLabel}</strong>
                  <small>{submissions < 2 ? 'Needs another submission' : 'Compared with the baseline'}</small>
                </article>
              </div>

              <div className="writing-reports__learning-grid">
                <article className="writing-reports__learning-card writing-reports__learning-card--strength">
                  <span>✓</span>
                  <div>
                    <h4>What the student is doing well</h4>
                    <ul>
                      {(editedReport?.strengths.length ? editedReport.strengths : ['Strengths will appear after a complete writing submission.'])
                        .slice(0, 3)
                        .map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </article>
                <article className="writing-reports__learning-card writing-reports__learning-card--growth">
                  <span>↑</span>
                  <div>
                    <h4>Best focus for the next lesson</h4>
                    <ul>
                      {(editedReport?.priority_weak_areas.length
                        ? editedReport.priority_weak_areas.map(humanizeWritingTag)
                        : ['A focused growth target will appear when enough evidence is available.'])
                        .slice(0, 3)
                        .map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </article>
              </div>

              <section className="writing-reports__rubric" aria-labelledby="writing-rubric-title">
                <div>
                  <span>Assessment snapshot</span>
                  <h4 id="writing-rubric-title">How the formative estimate was built</h4>
                </div>
                <div className="writing-reports__rubric-grid">
                  {rubricItems(teacherSummaryReport).map((item) => {
                    const score = item.score == null ? 0 : Math.max(0, Math.min(5, item.score));
                    return (
                      <div key={item.label}>
                        <span><b>{item.label}</b><strong>{item.score == null ? '—' : `${score}/5`}</strong></span>
                        <i><em style={{ width: `${(score / 5) * 100}%` }} /></i>
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="writing-reports__integrity">
                <span aria-hidden="true">🛡️</span>
                <div><strong>Writing-process context</strong><p>{integrityLabel}</p></div>
              </div>
            </section>

            <section className="writing-reports__personalize" aria-labelledby="writing-personalize-title">
              <div className="writing-reports__section-heading">
                <div>
                  <span>Step 3</span>
                  <h3 id="writing-personalize-title">Make the report personal</h3>
                  <p>We prepared the learning points. Adjust only what you want families to see.</p>
                </div>
                <span className={`writing-reports__status writing-reports__status--${draft.status}`}>
                  {draft.status === 'final' ? 'Final report' : 'Draft'}
                </span>
              </div>

              <div className="writing-reports__editor-grid">
                <label>
                  <span>Strengths</span>
                  <small>One clear point per line</small>
                  <textarea rows={4} value={draft.strengths} onChange={(event: InputChangeEvent) => setDraft((current) => ({ ...current, strengths: event.target.value }))} />
                </label>
                <label>
                  <span>Next growth targets</span>
                  <small>Use language a parent will understand</small>
                  <textarea rows={4} value={draft.growth_targets} onChange={(event: InputChangeEvent) => setDraft((current) => ({ ...current, growth_targets: event.target.value }))} />
                </label>
                <label>
                  <span>Recommended next steps</span>
                  <small>Practical actions for school and home</small>
                  <textarea rows={4} value={draft.next_steps} onChange={(event: InputChangeEvent) => setDraft((current) => ({ ...current, next_steps: event.target.value }))} />
                </label>
                <label>
                  <span>Your professional comment</span>
                  <small>This appears above your name in the printed report</small>
                  <textarea maxLength={600} rows={4} value={draft.teacher_comment} onChange={(event: InputChangeEvent) => setDraft((current) => ({ ...current, teacher_comment: event.target.value }))} placeholder="Add a short, encouraging comment…" />
                </label>
              </div>

              <div className="writing-reports__actions">
                <button type="button" className="writing-reports__button writing-reports__button--primary" onClick={() => openReport('parent')}>
                  Preview family report
                </button>
                <button type="button" className="writing-reports__button" onClick={() => openReport('teacher')}>
                  Preview teacher report
                </button>
                <button type="button" className="writing-reports__button writing-reports__button--quiet" onClick={() => saveReport('draft')}>
                  Save draft
                </button>
                <button type="button" className="writing-reports__button writing-reports__button--final" onClick={() => saveReport('final')}>
                  Finalize report
                </button>
              </div>
              <p className="writing-reports__message" aria-live="polite">{editorMessage}</p>
            </section>

            <details className="writing-reports__evidence">
              <summary>
                <span><b>View writing evidence</b><small>Submissions, prompts and rubric scores</small></span>
                <i aria-hidden="true">⌄</i>
              </summary>
              <div className="writing-reports__evidence-body">
                <WritingEvidenceList attempts={attempts} selectedAttemptId={selectedAttemptId} onSelect={(attemptId) => {
                  setSelectedAttemptId(attemptId);
                  setShowSubmission(false);
                }} />
                {selectedAttempt && (
                  <article className="writing-reports__attempt-detail">
                    <span>Selected evidence</span>
                    <h4>{selectedAttempt.prompt_text || 'Writing prompt unavailable'}</h4>
                    <div className="writing-reports__attempt-rubric">
                      {Object.entries((selectedAttempt.assessment as Record<string, unknown> | undefined)?.['subscores'] as Record<string, unknown> ?? {}).map(([key, value]) => (
                        <span key={key}><b>{humanizeWritingTag(key)}</b>{String(value)}/5</span>
                      ))}
                    </div>
                    {!showSubmission ? (
                      <button type="button" className="writing-reports__button writing-reports__button--quiet" onClick={() => setShowSubmission(true)}>
                        Read student submission
                      </button>
                    ) : (
                      <div className="writing-reports__submission">
                        <strong>Student submission</strong>
                        <p>{selectedAttempt.student_submission || 'No submission text is available.'}</p>
                      </div>
                    )}
                  </article>
                )}
              </div>
            </details>

            {savedReports.length > 0 && (
              <details className="writing-reports__evidence">
                <summary>
                  <span><b>Saved reports</b><small>{savedReports.length} saved version{savedReports.length === 1 ? '' : 's'}</small></span>
                  <i aria-hidden="true">⌄</i>
                </summary>
                <div className="writing-reports__saved-list">
                  {savedReports.map((saved) => (
                    <button key={saved.id} type="button" onClick={() => loadSavedReport(saved)}>
                      <span><strong>{saved.status === 'final' ? 'Final report' : 'Draft report'}</strong><small>{formatDate(saved.updated_at)}</small></span>
                      <i aria-hidden="true">Open</i>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </main>
    );
  }

  const result =
    mode === 'student'
      ? studentId
        ? exportStudentMonthlyWritingReport(studentId, month)
        : { ok: false, error: 'studentId is required for student exports.' }
      : studentId
        ? exportAdminCalibrationReport(studentId, month)
        : { ok: false, error: 'studentId is required for admin exports.' };

  if (!result.ok || !result.data) {
    return <div className="writing-reports__state">No export data is available yet.</div>;
  }

  return (
    <div className="writing-export-center">
      <h2>Writing Export Center</h2>
      {renderExport(result.data)}
    </div>
  );
};

export default WritingExportCenter;
