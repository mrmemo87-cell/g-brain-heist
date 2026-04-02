import React from 'react';
import {
  exportAdminCalibrationReport,
  exportStudentMonthlyWritingReport,
  exportTeacherWeeklyClassSummary,
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

export const WritingExportCenter: React.FC<WritingExportCenterProps> = ({
  mode,
  studentId,
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
}) => {
  if (isLoading) return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading exports…</div>;
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load exports: {errorMessage}</div>;

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
