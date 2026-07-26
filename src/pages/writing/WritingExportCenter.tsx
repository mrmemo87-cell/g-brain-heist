import React, { useEffect, useMemo, useState } from 'react';
import {
  exportAdminCalibrationReport,
  exportStudentMonthlyWritingReport,
  getTeacherAttemptListScoped,
  getTeacherAttemptReportScoped,
  getTeacherExportRowsScoped,
  getTeacherGeneralReportScoped,
  getTeacherSavedReportsScoped,
  getTeacherWritingReport,
  saveTeacherReportScoped,
  TeacherSavedWritingReport,
  TeacherWritingAttemptRecord,
  TeacherWritingReport,
  WritingExportDocument,
} from '../../lib/brains_heist/writingIntegrationService.js';
import { openProfessionalWritingReport } from '../../lib/brains_heist/writingReportDocument.js';

interface WritingExportCenterProps {
  mode: 'student' | 'teacher' | 'admin';
  studentId?: string;
  month?: string;
  isLoading?: boolean;
  errorMessage?: string;
}
type InputChangeEvent = { target: { value: string } };

type EditableTeacherReportDraft = {
  id?: string;
  mode: 'student' | 'attempt';
  status: 'draft' | 'final';
  title: string;
  overall_performance: string;
  strengths: string;
  recurring_weaknesses: string;
  trend_progress: string;
  teacher_recommendations: string;
  prompt: string;
  submission_text: string;
  evaluation_breakdown: string;
  precise_issues: string;
  suggested_next_action: string;
  comparison_to_previous: string;
  teacher_comment: string;
};

const EMPTY_DRAFT: EditableTeacherReportDraft = {
  mode: 'student',
  status: 'draft',
  title: '',
  overall_performance: '',
  strengths: '',
  recurring_weaknesses: '',
  trend_progress: '',
  teacher_recommendations: '',
  prompt: '',
  submission_text: '',
  evaluation_breakdown: '',
  precise_issues: '',
  suggested_next_action: '',
  comparison_to_previous: '',
  teacher_comment: '',
};

const renderExport = (doc: WritingExportDocument): React.ReactElement => (
  <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, background: '#0f172a', display: 'grid', gap: 8 }}>
    <h3 style={{ margin: 0 }}>{doc.title}</h3>
    <div style={{ fontSize: 12, opacity: 0.85 }}>Generated: {doc.generated_at}</div>
    <div dangerouslySetInnerHTML={{ __html: doc.html }} />
    <details>
      <summary>PDF-ready structure</summary>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(doc.pdf_ready, null, 2)}</pre>
    </details>
  </article>
);

const renderTeacherSummary = (report: TeacherWritingReport): React.ReactElement => (
  <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, background: '#0f172a', display: 'grid', gap: 8 }}>
    <h3 style={{ margin: 0 }}>Teacher Writing Report</h3>
    <div style={{ fontSize: 12, opacity: 0.85 }}>Generated: {report.generated_at}</div>
    <section>
      <strong>{report.student.student_name}</strong> · Grade {report.student.grade ?? '—'} · {report.student.class_name}
    </section>
    <section>
      <strong>Reporting period:</strong> {report.period} · <strong>Genre:</strong> {report.genre}
    </section>
    <section>
      <strong>Overall performance</strong>
      <div>Automated formative estimate: {formatScore(report.overall_summary.latest_score)}</div>
      <div>Trend delta: {report.overall_summary.score_trend_delta ?? '—'}</div>
      <div>Writing submissions: {report.overall_summary.submission_count ?? 0}</div>
      <div>Practice plan: {report.overall_summary.practice_completed_count ?? report.overall_summary.completed_tasks}/{report.overall_summary.practice_assigned_count ?? report.overall_summary.total_tasks} ({report.overall_summary.completion_rate_percent}%)</div>
    </section>
    <section>
      <strong>Main strengths</strong>
      <ul>{(report.strengths.length ? report.strengths : ['No strengths captured yet.']).map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
    <section>
      <strong>Priority weak areas</strong>
      <ul>{(report.priority_weak_areas.length ? report.priority_weak_areas : ['No priority weaknesses captured yet.']).map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
    <section>
      <strong>Teacher actions</strong>
      <ul>{(report.teacher_actions.length ? report.teacher_actions : ['No actions generated yet.']).map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  </article>
);

const parseList = (value: string): string[] =>
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const isUuid = (value?: string): boolean =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()));

const formatScore = (score: number | null | undefined): string => {
  if (score == null || Number.isNaN(score)) return '—';
  return `${score}/20`;
};

export const WritingExportCenter: React.FC<WritingExportCenterProps> = ({
  mode,
  studentId,
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
}) => {
  const [teacherSummaryReport, setTeacherSummaryReport] = useState<TeacherWritingReport | null>(null);
  const [teacherRows, setTeacherRows] = useState<Array<{ student_id: string; student_name: string; grade: number; completion_rate: number; latest_score: number | null }> | null>(null);
  const [teacherReportError, setTeacherReportError] = useState<string>('');
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const [attempts, setAttempts] = useState<TeacherWritingAttemptRecord[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string>('');
  const [attemptReport, setAttemptReport] = useState<Record<string, unknown> | null>(null);
  const [generalReport, setGeneralReport] = useState<Record<string, unknown> | null>(null);
  const [savedReports, setSavedReports] = useState<TeacherSavedWritingReport[]>([]);
  const [editor, setEditor] = useState<EditableTeacherReportDraft>(EMPTY_DRAFT);
  const [editorMessage, setEditorMessage] = useState('');
  const [showAttemptSubmissionText, setShowAttemptSubmissionText] = useState(false);

  const visibleRows = useMemo(
    () => (teacherRows ?? []).filter((row) => !searchQuery || row.student_name.toLowerCase().includes(searchQuery.toLowerCase()) || row.student_id.toLowerCase().includes(searchQuery.toLowerCase())),
    [teacherRows, searchQuery]
  );

  const selectedAttempt = attempts.find((item) => item.attempt_id === selectedAttemptId) ?? null;

  const escapeCsvField = (value: string): string => {
    const escaped = value.replace(/"/g, '""');
    return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
  };

  const exportCsv = (): void => {
    if (!teacherRows || typeof window === 'undefined') return;
    const header = 'student_name,student_id,grade,completion_rate,latest_score';
    const lines = teacherRows.map((row) => {
      const completion = `${Math.round(row.completion_rate * 100)}%`;
      return [
        escapeCsvField(row.student_name),
        escapeCsvField(row.student_id),
        escapeCsvField(String(row.grade)),
        escapeCsvField(completion),
        escapeCsvField(row.latest_score == null ? '' : String(row.latest_score)),
      ].join(',');
    });
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `writing-export-${month}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportEditorAsText = (): void => {
    if (!teacherSummaryReport) return;
    const editedReport: TeacherWritingReport = {
      ...teacherSummaryReport,
      strengths: parseList(editor.strengths).length ? parseList(editor.strengths) : teacherSummaryReport.strengths,
      priority_weak_areas: parseList(editor.recurring_weaknesses).length
        ? parseList(editor.recurring_weaknesses)
        : teacherSummaryReport.priority_weak_areas,
      teacher_actions: parseList(editor.teacher_recommendations).length
        ? parseList(editor.teacher_recommendations)
        : teacherSummaryReport.teacher_actions,
      student_friendly_summary: {
        ...teacherSummaryReport.student_friendly_summary,
        progress_summary: editor.trend_progress.trim()
          || teacherSummaryReport.student_friendly_summary.progress_summary,
        next_steps: parseList(editor.suggested_next_action).length
          ? parseList(editor.suggested_next_action)
          : teacherSummaryReport.student_friendly_summary.next_steps,
      },
    };
    openProfessionalWritingReport(editedReport, {
      audience: 'teacher',
      teacherComment: editor.teacher_comment,
      reportStatus: editor.status,
    });
  };

  const exportParentReadyReport = (): void => {
    if (!teacherSummaryReport) return;
    const parentReport: TeacherWritingReport = {
      ...teacherSummaryReport,
      strengths: parseList(editor.strengths).length ? parseList(editor.strengths) : teacherSummaryReport.strengths,
      priority_weak_areas: parseList(editor.recurring_weaknesses).length
        ? parseList(editor.recurring_weaknesses)
        : teacherSummaryReport.priority_weak_areas,
      teacher_actions: parseList(editor.teacher_recommendations).length
        ? parseList(editor.teacher_recommendations)
        : teacherSummaryReport.teacher_actions,
    };
    openProfessionalWritingReport(parentReport, {
      audience: 'parent',
      teacherComment: editor.teacher_comment,
      reportStatus: editor.status,
    });
  };

  const loadSavedReports = (targetStudentId: string, targetAttemptId?: string, targetMode?: 'student' | 'attempt'): void => {
    void getTeacherSavedReportsScoped({ student_id: targetStudentId, attempt_id: targetAttemptId, mode: targetMode }).then((result) => {
      if (!result.ok || !result.data) return;
      setSavedReports(result.data);
    });
  };

  const hydrateEditorFromGeneral = (payload: Record<string, unknown>): void => {
    const report = (payload['report'] as Record<string, unknown>) ?? {};
    const summary = (report['overall_summary'] as Record<string, unknown>) ?? {};
    setEditor((prev) => ({
      ...prev,
      mode: 'student',
      title: 'Student-level Writing Report',
      overall_performance: `Latest score: ${summary['latest_score'] ?? '—'}, trend delta: ${summary['score_trend_delta'] ?? '—'}, completion: ${summary['completion_rate_percent'] ?? '—'}%`,
      strengths: ((report['strengths'] as string[]) ?? []).join('\n'),
      recurring_weaknesses: ((report['repeated_error_patterns'] as string[]) ?? []).join('\n'),
      trend_progress: String(((report['student_friendly_summary'] as Record<string, unknown>)?.['progress_summary'] ?? '')),
      teacher_recommendations: ((report['teacher_actions'] as string[]) ?? []).join('\n'),
    }));
  };

  const hydrateEditorFromAttempt = (payload: Record<string, unknown>): void => {
    const attempt = (payload['attempt'] as Record<string, unknown>) ?? {};
    const previousAttempt = (payload['previous_attempt'] as Record<string, unknown>) ?? {};
    setEditor((prev) => ({
      ...prev,
      mode: 'attempt',
      title: 'Attempt-level Writing Report',
      prompt: String(attempt['prompt_text'] ?? ''),
      submission_text: String(attempt['student_submission'] ?? ''),
      evaluation_breakdown: JSON.stringify(attempt['assessment'] ?? {}, null, 2),
      precise_issues: ((payload['precise_issues'] as string[]) ?? []).join('\n'),
      suggested_next_action: String(payload['suggested_next_action'] ?? ''),
      comparison_to_previous: previousAttempt && Object.keys(previousAttempt).length > 0
        ? `Previous score: ${String((previousAttempt['assessment'] as Record<string, unknown> | undefined)?.['total_score'] ?? '—')}`
        : 'No previous attempt found for comparison.',
    }));
  };

  const saveEditorReport = (status: 'draft' | 'final'): void => {
    if (!selectedStudentId) return;
    setEditorMessage('Saving report…');
    void saveTeacherReportScoped({
      report_id: editor.id,
      student_id: selectedStudentId,
      attempt_id: editor.mode === 'attempt' ? selectedAttemptId || undefined : undefined,
      mode: editor.mode,
      month,
      genre: (selectedAttempt?.genre as any) ?? undefined,
      status,
      teacher_comment: editor.teacher_comment,
      report_payload: {
        title: editor.title,
        overall_performance: editor.overall_performance,
        strengths: parseList(editor.strengths),
        recurring_weaknesses: parseList(editor.recurring_weaknesses),
        trend_progress: editor.trend_progress,
        teacher_recommendations: parseList(editor.teacher_recommendations),
        prompt: editor.prompt,
        submission_text: editor.submission_text,
        evaluation_breakdown: editor.evaluation_breakdown,
        precise_issues: parseList(editor.precise_issues),
        suggested_next_action: editor.suggested_next_action,
        comparison_to_previous: editor.comparison_to_previous,
      },
    }).then((result) => {
      if (!result.ok || !result.data) {
        setEditorMessage(result.error ?? 'Unable to save report.');
        return;
      }
      const saved = result.data;
      setEditor((prev) => ({ ...prev, id: saved.id, status: saved.status }));
      setEditorMessage(`Saved ${saved.status} report at ${saved.updated_at}.`);
      loadSavedReports(selectedStudentId, editor.mode === 'attempt' ? selectedAttemptId : undefined, editor.mode);
    });
  };

  useEffect(() => {
    let cancelled = false;
    if (mode !== 'teacher') {
      setTeacherSummaryReport(null);
      setTeacherRows(null);
      setTeacherReportError('');
      setTeacherLoading(false);
      setSelectedStudentId('');
      setAttempts([]);
      setSelectedAttemptId('');
      setAttemptReport(null);
      setGeneralReport(null);
      setSavedReports([]);
      setEditor(EMPTY_DRAFT);
      return;
    }

    setTeacherLoading(true);
    setTeacherReportError('');
    const task = studentId
      ? getTeacherWritingReport({ student_id: studentId, month, include_snippet: false })
      : getTeacherExportRowsScoped(month);
    void task
      .then((result) => {
        if (cancelled) return;
        if (!result.ok || !result.data) {
          setTeacherSummaryReport(null);
          setTeacherRows(null);
          setTeacherReportError(result.error ?? 'Unable to generate teacher report.');
          return;
        }
        if (studentId) {
          setTeacherSummaryReport(result.data as TeacherWritingReport);
          setTeacherRows(null);
          setSelectedStudentId(studentId);
        } else {
          const rows = result.data as Array<{ student_id: string; student_name: string; grade: number; completion_rate: number; latest_score: number | null }>;
          setTeacherRows(rows);
          setTeacherSummaryReport(null);
          setSelectedStudentId(rows[0]?.student_id ?? '');
        }
      })
      .catch((err) => {
        if (!cancelled) setTeacherReportError(err instanceof Error ? err.message : 'Unable to generate teacher report.');
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
      setTeacherReportError(`Selected student reference "${selectedStudentId}" is not a valid UUID yet. Please refresh writing data or run migration 20260417183000.`);
      return;
    }
    let cancelled = false;
    setTeacherLoading(true);
    setEditor(EMPTY_DRAFT);
    setEditorMessage('');

    void Promise.all([
      getTeacherWritingReport({ student_id: selectedStudentId, month, include_snippet: true }),
      getTeacherAttemptListScoped({ student_id: selectedStudentId, limit: 80 }),
      getTeacherGeneralReportScoped({ student_id: selectedStudentId, month }),
      getTeacherSavedReportsScoped({ student_id: selectedStudentId }),
    ]).then(([summaryRes, attemptsRes, generalRes, savedRes]) => {
      if (cancelled) return;
      if (summaryRes.ok && summaryRes.data) setTeacherSummaryReport(summaryRes.data);
      if (attemptsRes.ok && attemptsRes.data) {
        setAttempts(attemptsRes.data);
        setSelectedAttemptId(attemptsRes.data[0]?.attempt_id ?? '');
      } else {
        setAttempts([]);
        setSelectedAttemptId('');
      }
      if (generalRes.ok && generalRes.data) {
        setGeneralReport(generalRes.data);
        hydrateEditorFromGeneral(generalRes.data);
      } else {
        setGeneralReport(null);
      }
      if (savedRes.ok && savedRes.data) setSavedReports(savedRes.data);
    }).finally(() => {
      if (!cancelled) setTeacherLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [mode, selectedStudentId, month]);

  useEffect(() => {
    if (mode !== 'teacher' || !selectedStudentId || !selectedAttemptId) {
      setAttemptReport(null);
      setShowAttemptSubmissionText(false);
      return;
    }
    if (!isUuid(selectedStudentId)) return;
    let cancelled = false;
    setTeacherLoading(true);
    void Promise.all([
      getTeacherAttemptReportScoped({ student_id: selectedStudentId, attempt_id: selectedAttemptId }),
      getTeacherSavedReportsScoped({ student_id: selectedStudentId, attempt_id: selectedAttemptId, mode: 'attempt' }),
    ]).then(([attemptRes, savedRes]) => {
      if (cancelled) return;
      if (attemptRes.ok && attemptRes.data) {
        setAttemptReport(attemptRes.data);
      } else {
        setAttemptReport(null);
      }
      if (savedRes.ok && savedRes.data?.length) {
        const savedData = savedRes.data;
        setSavedReports((prev) => {
          const byId = new Map(prev.map((item) => [item.id, item]));
          savedData.forEach((item) => byId.set(item.id, item));
          return [...byId.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        });
      }
    }).finally(() => {
      if (!cancelled) setTeacherLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, selectedStudentId, selectedAttemptId]);

  if (isLoading) return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading exports…</div>;
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load exports: {errorMessage}</div>;

  if (mode === 'teacher') {
    if (teacherLoading && !teacherRows && !teacherSummaryReport) return <div style={{ padding: 12, color: '#e5e7eb' }}>Generating teacher report…</div>;
    if (teacherReportError) return <div style={{ padding: 12, color: '#fca5a5' }}>No export data available: {teacherReportError}</div>;
    if (studentId && !teacherSummaryReport) return <div style={{ padding: 12, color: '#e5e7eb' }}>No export data available.</div>;
    if (!studentId && !teacherRows) return <div style={{ padding: 12, color: '#e5e7eb' }}>No export data available.</div>;

    return (
      <div style={{ padding: 12, color: '#e5e7eb', display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Quick Reports</h2>
        <p style={{ margin: 0, color: '#94a3b8' }}>Generate clean reports without advanced setup.</p>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, background: 'linear-gradient(180deg, #0f172a, #0b1327)' }}>
            <div style={{ fontWeight: 700 }}>Student Progress Summary</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', margin: '6px 0 10px' }}>Score, completion, strengths, growth areas, and teacher recommendations.</div>
            <button
              type="button"
              onClick={exportEditorAsText}
              disabled={!selectedStudentId || !editor.title}
              style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 10px' }}
            >
              Preview &amp; Print Teacher Report
            </button>
          </article>
          <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, background: 'linear-gradient(180deg, #0f172a, #0b1327)' }}>
            <div style={{ fontWeight: 700 }}>Parent-Ready Report</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', margin: '6px 0 10px' }}>Plain-language progress, strengths, growth targets, and practical next steps.</div>
            <button
              type="button"
              onClick={exportParentReadyReport}
              disabled={!selectedStudentId || !teacherSummaryReport}
              style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 10px' }}
            >
              Preview &amp; Print Parent Report
            </button>
          </article>
          <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, background: 'linear-gradient(180deg, #0f172a, #0b1327)' }}>
            <div style={{ fontWeight: 700 }}>Class Snapshot</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', margin: '6px 0 10px' }}>Class-level completion and performance overview for school analysis.</div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!teacherRows?.length}
              style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 10px' }}
            >
              Export CSV
            </button>
          </article>
        </section>
        <details>
          <summary style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: 700 }}>Open Advanced Report Tools</summary>
        {!studentId && teacherRows ? (
          <div style={{ position: 'sticky', top: 0, zIndex: 3, background: '#020617', border: '1px solid #1e293b', borderRadius: 10, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={searchQuery} onChange={(event: InputChangeEvent) => setSearchQuery(event.target.value)} placeholder="Search student" style={{ flex: '1 1 220px', background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }} />
            <button type="button" onClick={exportCsv} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '8px 10px' }}>Export CSV</button>
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: studentId ? 'minmax(0, 1fr)' : 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 10 }}>
          {!studentId && teacherRows ? (
            <article style={{ border: '1px solid #334155', borderRadius: 12, padding: 14, background: 'linear-gradient(180deg, #0f172a, #0b1327)', overflowX: 'auto' }}>
              <h3 style={{ margin: 0 }}>Teacher Writing Class Summary</h3>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>Month: {month}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th align="left">Student</th>
                    <th align="left">Grade</th>
                    <th align="left">Completion</th>
                    <th align="left">Latest score</th>
                    <th align="left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.student_id} style={{ borderTop: '1px solid #1e293b' }}>
                      <td>{row.student_name}</td>
                      <td>{row.grade}</td>
                      <td>{Math.round(row.completion_rate * 100)}%</td>
                      <td>{formatScore(row.latest_score)}</td>
                      <td>
                        <button type="button" onClick={() => setSelectedStudentId(row.student_id)} style={{ borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '4px 8px' }}>Open student</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ) : null}

          <aside id="selected-student-report" style={{ border: '1px solid #334155', borderRadius: 12, padding: 14, background: 'linear-gradient(180deg, #0f172a, #0b1327)', display: 'grid', gap: 10 }}>
            <strong>Selected student workspace</strong>
            {!selectedStudentId ? <div>Select a student row to load details.</div> : null}
            {selectedStudentId && !isUuid(selectedStudentId) ? (
              <div style={{ border: '1px solid #7f1d1d', background: '#3a1212', color: '#fecaca', borderRadius: 8, padding: 10 }}>
                This student id is not UUID-shaped (`{selectedStudentId}`), so secure teacher RPCs will fail with 400 until data is normalized.
              </div>
            ) : null}
            {teacherSummaryReport ? renderTeacherSummary(teacherSummaryReport) : null}

            {selectedStudentId ? (
              <section style={{ border: '1px solid #334155', borderRadius: 8, padding: 10, display: 'grid', gap: 8 }}>
                <strong>Attempts (full text available)</strong>
                {attempts.length === 0 ? <div>No attempts available.</div> : null}
                <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflow: 'auto' }}>
                  {attempts.map((item) => (
                    <button
                      key={item.attempt_id}
                      type="button"
                      onClick={() => setSelectedAttemptId(item.attempt_id)}
                      style={{
                        textAlign: 'left',
                        borderRadius: 8,
                        border: selectedAttemptId === item.attempt_id ? '1px solid #60a5fa' : '1px solid #334155',
                        background: '#111827',
                        color: '#f8fafc',
                        padding: '8px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      <div><strong>{item.attempt_type ?? 'attempt'}</strong> · {new Date(item.created_at).toLocaleString()}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>Score: {formatScore(Number((item.assessment as Record<string, unknown>)?.['total_score'] ?? NaN))} · Retry mode: {item.retry_kind === 'same_prompt' ? 'Retry prompt' : item.retry_kind === 'new_prompt' ? 'New prompt' : item.retry_kind ?? '—'}</div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {selectedAttempt ? (
              <section style={{ border: '1px solid #334155', borderRadius: 8, padding: 10, display: 'grid', gap: 8 }}>
                <strong>Attempt detail</strong>
                <div><strong>Prompt:</strong> {selectedAttempt.prompt_text || 'No prompt text available.'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
                  <article style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 8, background: '#020617' }}>
                    <div style={{ marginBottom: 6 }}><strong>Full student submission</strong></div>
                    {!showAttemptSubmissionText ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontSize: 12, color: '#cbd5e1' }}>Detailed writing text is protected by default.</div>
                        <button type="button" onClick={() => setShowAttemptSubmissionText(true)} style={{ width: 'fit-content', borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 9px' }}>View Full Submission</button>
                        <small style={{ color: '#94a3b8' }}>Viewing full submission is a sensitive action and may be logged.</small>
                      </div>
                    ) : (
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{selectedAttempt.student_submission || 'No submission text found.'}</pre>
                    )}
                  </article>
                  <article style={{ border: '1px solid #1f2937', borderRadius: 8, padding: 8, background: '#020617' }}>
                    <div style={{ marginBottom: 6 }}><strong>AI evaluation / assessment</strong></div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(selectedAttempt.assessment ?? {}, null, 2)}</pre>
                  </article>
                </div>
                {attemptReport ? (
                  <details>
                    <summary>Attempt-level comparison and precise issues</summary>
                    <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{JSON.stringify(attemptReport, null, 2)}</pre>
                  </details>
                ) : null}
              </section>
            ) : null}

            {selectedStudentId ? (
              <section style={{ border: '1px solid #334155', borderRadius: 8, padding: 10, display: 'grid', gap: 8 }}>
                <strong>Editable report builder (student-level + attempt-level)</strong>
                {teacherLoading && <small style={{ color: '#94a3b8' }}>Loading reports…</small>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button 
                    type="button" 
                    disabled={!generalReport || teacherLoading}
                    onClick={() => generalReport && hydrateEditorFromGeneral(generalReport)} 
                    title={!generalReport && !teacherLoading ? 'No student report available' : ''}
                    style={{ 
                      borderRadius: 8, 
                      border: '1px solid #334155', 
                      background: generalReport && !teacherLoading ? '#1e293b' : '#0f172a',
                      color: generalReport && !teacherLoading ? '#fff' : '#64748b',
                      padding: '6px 8px',
                      cursor: generalReport && !teacherLoading ? 'pointer' : 'not-allowed',
                      opacity: generalReport && !teacherLoading ? 1 : 0.5
                    }}>
                    Generate student report template
                  </button>
                  <button 
                    type="button" 
                    disabled={!attemptReport || teacherLoading}
                    onClick={() => attemptReport && hydrateEditorFromAttempt(attemptReport)}
                    title={!attemptReport && !teacherLoading ? 'Select an attempt first' : ''}
                    style={{ 
                      borderRadius: 8, 
                      border: '1px solid #334155', 
                      background: attemptReport && !teacherLoading ? '#1e293b' : '#0f172a',
                      color: attemptReport && !teacherLoading ? '#fff' : '#64748b',
                      padding: '6px 8px',
                      cursor: attemptReport && !teacherLoading ? 'pointer' : 'not-allowed',
                      opacity: attemptReport && !teacherLoading ? 1 : 0.5
                    }}>
                    Generate attempt report template
                  </button>
                  <button type="button" onClick={exportEditorAsText} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '6px 8px' }}>Preview &amp; Print Edited Report</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    Mode
                    <select value={editor.mode} onChange={(event: InputChangeEvent) => setEditor((prev) => ({ ...prev, mode: event.target.value as 'student' | 'attempt' }))} style={{ background: '#020617', border: '1px solid #334155', color: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <option value="student">Student-level report</option>
                      <option value="attempt">Attempt-level report</option>
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    Status
                    <select value={editor.status} onChange={(event: InputChangeEvent) => setEditor((prev) => ({ ...prev, status: event.target.value as 'draft' | 'final' }))} style={{ background: '#020617', border: '1px solid #334155', color: '#fff', borderRadius: 8, padding: '8px 10px' }}>
                      <option value="draft">Draft</option>
                      <option value="final">Final</option>
                    </select>
                  </label>
                </div>

                {[
                  ['title', 'Title'],
                  ['overall_performance', 'Overall performance'],
                  ['strengths', 'Strengths (newline/comma-separated)'],
                  ['recurring_weaknesses', 'Recurring weaknesses (newline/comma-separated)'],
                  ['trend_progress', 'Trend/progress'],
                  ['teacher_recommendations', 'Teacher recommendations (newline/comma-separated)'],
                  ['prompt', 'Prompt'],
                  ['submission_text', 'Full submission text'],
                  ['evaluation_breakdown', 'Evaluation breakdown (text/JSON)'],
                  ['precise_issues', 'Precise issues observed (newline/comma-separated)'],
                  ['suggested_next_action', 'Suggested next action'],
                  ['comparison_to_previous', 'Comparison to previous attempt'],
                  ['teacher_comment', 'Teacher comment'],
                ].map(([key, label]) => (
                  <label key={key} style={{ display: 'grid', gap: 4 }}>
                    {label}
                    <textarea
                      value={(editor as any)[key] ?? ''}
                      onChange={(event: any) => setEditor((prev) => ({ ...prev, [key]: event.target.value }))}
                      rows={key === 'submission_text' || key === 'evaluation_breakdown' ? 8 : 3}
                      style={{ background: '#020617', border: '1px solid #334155', color: '#fff', borderRadius: 8, padding: '8px 10px', fontFamily: key === 'evaluation_breakdown' ? 'monospace' : 'inherit' }}
                    />
                  </label>
                ))}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => saveEditorReport('draft')} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#fff', padding: '6px 8px' }}>Save draft</button>
                  <button type="button" onClick={() => saveEditorReport('final')} style={{ borderRadius: 8, border: '1px solid #334155', background: '#14532d', color: '#bbf7d0', padding: '6px 8px' }}>Save final</button>
                </div>
                {editorMessage ? <small>{editorMessage}</small> : null}

                <details>
                  <summary>Saved teacher reports ({savedReports.length})</summary>
                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    {savedReports.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          const payload = item.report_payload ?? {};
                          setEditor({
                            id: item.id,
                            mode: item.report_mode,
                            status: item.status,
                            title: String(payload['title'] ?? ''),
                            overall_performance: String(payload['overall_performance'] ?? ''),
                            strengths: ((payload['strengths'] as string[]) ?? []).join('\n'),
                            recurring_weaknesses: ((payload['recurring_weaknesses'] as string[]) ?? []).join('\n'),
                            trend_progress: String(payload['trend_progress'] ?? ''),
                            teacher_recommendations: ((payload['teacher_recommendations'] as string[]) ?? []).join('\n'),
                            prompt: String(payload['prompt'] ?? ''),
                            submission_text: String(payload['submission_text'] ?? ''),
                            evaluation_breakdown: String(payload['evaluation_breakdown'] ?? ''),
                            precise_issues: ((payload['precise_issues'] as string[]) ?? []).join('\n'),
                            suggested_next_action: String(payload['suggested_next_action'] ?? ''),
                            comparison_to_previous: String(payload['comparison_to_previous'] ?? ''),
                            teacher_comment: item.teacher_comment ?? '',
                          });
                          if (item.attempt_id) setSelectedAttemptId(item.attempt_id);
                          setEditorMessage(`Loaded saved report ${item.id}.`);
                        }}
                        style={{ textAlign: 'left', borderRadius: 8, border: '1px solid #334155', background: '#111827', color: '#f8fafc', padding: '8px 10px' }}
                      >
                        <div><strong>{item.report_mode === 'student' ? 'Student-level' : 'Attempt-level'}</strong> · {item.status}</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>{item.updated_at}</div>
                      </button>
                    ))}
                    {savedReports.length === 0 ? <div>No saved reports yet.</div> : null}
                  </div>
                </details>
              </section>
            ) : null}
          </aside>
        </div>
        </details>
      </div>
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
    return <div style={{ padding: 12, color: '#e5e7eb' }}>No export data available: {result.error ?? 'Unknown error'}</div>;
  }

  return (
    <div style={{ padding: 12, color: '#e5e7eb', display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0 }}>Writing Export Center</h2>
      {renderExport(result.data)}
    </div>
  );
};

export default WritingExportCenter;
