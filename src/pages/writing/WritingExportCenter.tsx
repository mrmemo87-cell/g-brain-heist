import React, { useEffect, useState } from 'react';
import {
  exportAdminCalibrationReport,
  exportStudentMonthlyWritingReport,
  exportTeacherWeeklyClassSummary,
  getTeacherWritingReport,
  TeacherWritingReport,
  WritingExportDocument,
} from '../../lib/brains_heist/writingIntegrationService.js';

interface WritingExportCenterProps {
  mode: 'student' | 'teacher' | 'admin';
  studentId?: string;
  month?: string;
  isLoading?: boolean;
  errorMessage?: string;
}

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

const renderTeacherReport = (report: TeacherWritingReport): React.ReactElement => (
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
      <div>Latest score: {report.overall_summary.latest_score ?? '—'}</div>
      <div>Trend delta: {report.overall_summary.score_trend_delta ?? '—'}</div>
      <div>Completion: {report.overall_summary.completed_tasks}/{report.overall_summary.total_tasks} ({report.overall_summary.completion_rate_percent}%)</div>
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
      <strong>Repeated error patterns</strong>
      <div>{report.repeated_error_patterns.length ? report.repeated_error_patterns.join(', ') : 'None detected.'}</div>
    </section>
    <section>
      <strong>Teacher actions</strong>
      <ul>{(report.teacher_actions.length ? report.teacher_actions : ['No actions generated yet.']).map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
    {report.evidence_snippet ? (
      <section>
        <strong>Optional evidence snippet</strong>
        <div style={{ fontStyle: 'italic' }}>{report.evidence_snippet}</div>
      </section>
    ) : null}
    <section>
      <strong>Student-friendly summary</strong>
      <div>{report.student_friendly_summary.progress_summary}</div>
      <div>Next steps: {report.student_friendly_summary.next_steps.join(' | ') || 'No next steps generated yet.'}</div>
    </section>
  </article>
);

export const WritingExportCenter: React.FC<WritingExportCenterProps> = ({
  mode,
  studentId,
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
}) => {
  const [teacherReport, setTeacherReport] = useState<TeacherWritingReport | null>(null);
  const [teacherReportError, setTeacherReportError] = useState<string>('');
  const [teacherLoading, setTeacherLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (mode !== 'teacher' || !studentId) {
      setTeacherReport(null);
      setTeacherReportError('');
      setTeacherLoading(false);
      return;
    }

    setTeacherLoading(true);
    setTeacherReportError('');
    void getTeacherWritingReport({ student_id: studentId, month, include_snippet: false })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok || !result.data) {
          setTeacherReport(null);
          setTeacherReportError(result.error ?? 'Unable to generate teacher report.');
          return;
        }
        setTeacherReport(result.data);
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

  if (isLoading) return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading exports…</div>;
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load exports: {errorMessage}</div>;

  if (mode === 'teacher' && studentId) {
    if (teacherLoading) return <div style={{ padding: 12, color: '#e5e7eb' }}>Generating teacher report…</div>;
    if (teacherReportError) return <div style={{ padding: 12, color: '#fca5a5' }}>No export data available: {teacherReportError}</div>;
    if (!teacherReport) return <div style={{ padding: 12, color: '#e5e7eb' }}>No export data available.</div>;

    return (
      <div style={{ padding: 12, color: '#e5e7eb', display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Writing Export Center</h2>
        {renderTeacherReport(teacherReport)}
      </div>
    );
  }

  const result =
    mode === 'student'
      ? studentId
        ? exportStudentMonthlyWritingReport(studentId, month)
        : { ok: false, error: 'studentId is required for student exports.' }
      : mode === 'teacher'
      ? exportTeacherWeeklyClassSummary(month)
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
