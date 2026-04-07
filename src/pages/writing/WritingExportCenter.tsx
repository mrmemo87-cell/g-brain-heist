import React, { useEffect, useMemo, useState } from 'react';
import {
  exportAdminCalibrationReport,
  exportStudentMonthlyWritingReport,
  getTeacherExportRowsScoped,
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
      <strong>Teacher actions</strong>
      <ul>{(report.teacher_actions.length ? report.teacher_actions : ['No actions generated yet.']).map((item) => <li key={item}>{item}</li>)}</ul>
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
  const [teacherRows, setTeacherRows] = useState<Array<{ student_id: string; student_name: string; grade: number; completion_rate: number; latest_score: number | null }> | null>(null);
  const [teacherReportError, setTeacherReportError] = useState<string>('');
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (mode !== 'teacher') {
      setTeacherReport(null);
      setTeacherRows(null);
      setTeacherReportError('');
      setTeacherLoading(false);
      setSelectedStudentId('');
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
          setTeacherReport(null);
          setTeacherRows(null);
          setTeacherReportError(result.error ?? 'Unable to generate teacher report.');
          return;
        }
        if (studentId) {
          setTeacherReport(result.data as TeacherWritingReport);
          setTeacherRows(null);
          setSelectedStudentId(studentId);
        } else {
          const rows = result.data as Array<{ student_id: string; student_name: string; grade: number; completion_rate: number; latest_score: number | null }>;
          setTeacherRows(rows);
          setTeacherReport(null);
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
    if (mode !== 'teacher' || studentId || !selectedStudentId) return;
    let cancelled = false;
    setTeacherLoading(true);
    void getTeacherWritingReport({ student_id: selectedStudentId, month, include_snippet: false })
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.data) setTeacherReport(result.data);
      })
      .finally(() => {
        if (!cancelled) setTeacherLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, month, selectedStudentId, studentId]);

  if (isLoading) return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading exports…</div>;
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load exports: {errorMessage}</div>;

  const visibleRows = useMemo(
    () => (teacherRows ?? []).filter((row) => !searchQuery || row.student_name.toLowerCase().includes(searchQuery.toLowerCase()) || row.student_id.toLowerCase().includes(searchQuery.toLowerCase())),
    [teacherRows, searchQuery]
  );

  const exportCsv = (): void => {
    if (!teacherRows || typeof window === 'undefined') return;
    const header = 'student_name,student_id,grade,completion_rate,latest_score';
    const lines = teacherRows.map((row) => `${row.student_name},${row.student_id},${row.grade},${Math.round(row.completion_rate * 100)}%,${row.latest_score ?? ''}`);
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `writing-export-${month}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (mode === 'teacher') {
    if (teacherLoading && !teacherRows && !teacherReport) return <div style={{ padding: 12, color: '#e5e7eb' }}>Generating teacher report…</div>;
    if (teacherReportError) return <div style={{ padding: 12, color: '#fca5a5' }}>No export data available: {teacherReportError}</div>;
    if (studentId && !teacherReport) return <div style={{ padding: 12, color: '#e5e7eb' }}>No export data available.</div>;
    if (!studentId && !teacherRows) return <div style={{ padding: 12, color: '#e5e7eb' }}>No export data available.</div>;

    return (
      <div style={{ padding: 12, color: '#e5e7eb', display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Writing Export Center</h2>
        {studentId && teacherReport ? renderTeacherReport(teacherReport) : null}
        {!studentId && teacherRows ? (
          <>
            <div style={{ position: 'sticky', top: 0, zIndex: 3, background: '#020617', border: '1px solid #1e293b', borderRadius: 10, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={searchQuery} onChange={(event: { target: { value: string } }) => setSearchQuery(event.target.value)} placeholder="Search student" style={{ flex: '1 1 220px', background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }} />
              <button type="button" onClick={exportCsv} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '8px 10px' }}>Export CSV</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: 10 }}>
              <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, background: '#0f172a', overflowX: 'auto' }}>
                <h3 style={{ margin: 0 }}>Teacher Writing Class Summary</h3>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>Month: {month}</div>
                {visibleRows.length === 0 ? (
                  <div>No students found for your current roster.</div>
                ) : (
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
                        <tr key={row.student_id}>
                          <td>{row.student_name}</td>
                          <td>{row.grade}</td>
                          <td>{Math.round(row.completion_rate * 100)}%</td>
                          <td>{row.latest_score ?? '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button type="button" onClick={() => setSelectedStudentId(row.student_id)} style={{ borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '4px 8px' }}>View summary</button>
                              <button type="button" onClick={() => setSelectedStudentId(row.student_id)} style={{ borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '4px 8px' }}>Open report</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </article>

              <aside style={{ border: '1px solid #334155', borderRadius: 10, padding: 12, background: '#0f172a', display: 'grid', gap: 8 }}>
                <strong>Selected student report</strong>
                {teacherReport ? renderTeacherReport(teacherReport) : <div>Select a student row to load details.</div>}
              </aside>
            </div>
          </>
        ) : null}
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
