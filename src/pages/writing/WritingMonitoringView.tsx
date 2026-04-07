import React from 'react';
import { getWritingMonitoringOverview, listAdminReviewSignals } from '../../lib/brains_heist/writingIntegrationService.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { WRITING_ADMIN_HELP } from '../../lib/brains_heist/writingAdminHelp.js';

interface WritingMonitoringViewProps {
  month?: string;
  isLoading?: boolean;
  errorMessage?: string;
  filterQuery?: string;
}

const cardStyle = {
  border: '1px solid #475569',
  borderRadius: 10,
  padding: 12,
  background: '#0f172a',
  display: 'grid',
  gap: 8,
};
const tableHeaderCellStyle = {
  color: '#e2e8f0',
  background: '#1e293b',
  borderBottom: '1px solid #334155',
  padding: '8px 10px',
  fontWeight: 700,
};
const tableCellStyle = {
  color: '#f8fafc',
  background: '#0f172a',
  borderBottom: '1px solid #1e293b',
  padding: '8px 10px',
  verticalAlign: 'top' as const,
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

export const WritingMonitoringView: React.FC<WritingMonitoringViewProps> = ({
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
  filterQuery = '',
}) => {
  if (isLoading) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading writing monitor…</div>;
  }

  if (errorMessage) {
    return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load writing monitor: {errorMessage}</div>;
  }

  const overview = getWritingMonitoringOverview(month);

  if (!overview.ok || !overview.data) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>No writing monitoring data available yet.</div>;
  }
  if (overview.data.student_rows.length === 0) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>No students with writing records yet.</div>;
  }
  const filters = parseAdminDrilldownFilters(filterQuery);
  const reviewSignals = filters.status
    ? listAdminReviewSignals({ status: filters.status as 'questionable' | 'needs_calibration_review' | 'approved' })
    : null;
  const flaggedStudentIds = new Set((reviewSignals?.data ?? []).map((item) => item.student_id).filter(Boolean));
  const rows = overview.data.student_rows.filter((row) => {
    if (filters.grade && row.current_grade !== filters.grade) return false;
    if (filters.status === 'stalled' && !row.stalled) return false;
    if (filters.status === 'improving' && !row.improving) return false;
    if (filters.weakness_tag && !row.repeated_weakness_hotspots.includes(filters.weakness_tag)) return false;
    if (filters.status && ['questionable', 'needs_calibration_review', 'approved'].includes(filters.status)) {
      return flaggedStudentIds.has(row.student_id);
    }
    return true;
  });
  if (rows.length === 0) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>No monitoring matches for current filters ({filterQuery || 'none'}).</div>;
  }

  const stalledCount = rows.filter((row) => row.stalled).length;
  const improvingCount = rows.filter((row) => row.improving).length;
  const monthlyReadyCount = rows.filter((row) => row.ready_for_monthly_review).length;

  return (
    <div style={{ padding: 12, color: '#f3f4f6', display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, color: '#ffffff' }}>Writing Monitor</h2>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Teacher/Admin Writing Monitor</span>
      <p style={{ margin: 0, color: '#cbd5e1' }}>
        Quick answers: <strong>{stalledCount}</strong> students need support, <strong>{improvingCount}</strong> are improving, and{' '}
        <strong>{monthlyReadyCount}</strong> are ready for monthly review.
      </p>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Weekly target</span>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <article style={cardStyle}>
          <strong style={{ color: '#fef08a' }}>Who needs help?</strong>
          <span>{stalledCount === 0 ? 'No urgent concerns in this view.' : `${stalledCount} students are currently off track.`}</span>
        </article>
        <article style={cardStyle}>
          <strong style={{ color: '#86efac' }}>Who is improving?</strong>
          <span>{improvingCount === 0 ? 'No clear upward trends yet.' : `${improvingCount} students are showing positive momentum.`}</span>
        </article>
        <article style={cardStyle}>
          <strong style={{ color: '#93c5fd' }}>What should I do next?</strong>
          <span>{monthlyReadyCount} students are ready for monthly review and feedback.</span>
        </article>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
        {rows.map((row) => (
          <article key={`card-${row.student_id}`} style={cardStyle}>
            <strong>{toDisplayLabel(row.student_name, row.student_id)}</strong>
            <span style={{ color: '#cbd5e1' }}>Grade {row.current_grade}</span>
            <span>Task completion: {Math.round(row.completion_rate * 100)}%</span>
            <span>Latest writing score: {row.latest_score ?? '—'}</span>
            <span>Current weekly focus: {row.weekly_target_summary}</span>
            <span>
              Progress status:{' '}
              {row.stalled
                ? 'Status: Stalled (Needs support)'
                : row.improving
                  ? 'Status: Improving'
                  : 'Status: Steady'}
            </span>
          </article>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#0f172a' }}>
          <thead>
            <tr>
              <th align="left" style={tableHeaderCellStyle}>Student</th>
              <th align="left" style={tableHeaderCellStyle}>Grade</th>
              <th align="left" style={tableHeaderCellStyle}>Completion</th>
              <th align="left" style={tableHeaderCellStyle}>Latest score</th>
              <th align="left" style={tableHeaderCellStyle}>Skill snapshot</th>
              <th align="left" style={tableHeaderCellStyle}>Recent trend</th>
              <th align="left" style={tableHeaderCellStyle}>Main weakness</th>
              <th align="left" style={tableHeaderCellStyle}>Next focus</th>
              <th align="left" style={tableHeaderCellStyle}>Needs support</th>
              <th align="left" style={tableHeaderCellStyle}>Improving</th>
              <th align="left" style={tableHeaderCellStyle}>Ready for monthly review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.student_id}>
                <td style={tableCellStyle}>{toDisplayLabel(row.student_name, row.student_id)}</td>
                <td style={tableCellStyle}>{row.current_grade}</td>
                <td style={tableCellStyle}>{Math.round(row.completion_rate * 100)}%</td>
                <td style={tableCellStyle}>{row.latest_score ?? '—'}</td>
                <td style={tableCellStyle}>
                  Content {row.latest_subscale_scores.content ?? '—'} / Communication {row.latest_subscale_scores.communicative_achievement ?? '—'} / Organization
                  {' '}
                  {row.latest_subscale_scores.organisation ?? '—'} / Language {row.latest_subscale_scores.language ?? '—'}
                </td>
                <td style={tableCellStyle}>
                  Content {row.subscale_trend.content >= 0 ? '+' : ''}
                  {row.subscale_trend.content}, Communication {row.subscale_trend.communicative_achievement >= 0 ? '+' : ''}
                  {row.subscale_trend.communicative_achievement}, Organization {row.subscale_trend.organisation >= 0 ? '+' : ''}
                  {row.subscale_trend.organisation}, Language {row.subscale_trend.language >= 0 ? '+' : ''}
                  {row.subscale_trend.language}
                </td>
                <td style={tableCellStyle}>{row.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ') || '—'}</td>
                <td style={tableCellStyle}>{row.weekly_target_summary}</td>
                <td style={tableCellStyle}>{row.stalled ? 'Yes' : 'No'}</td>
                <td style={tableCellStyle}>{row.improving ? 'Yes' : 'No'}</td>
                <td style={tableCellStyle}>{row.ready_for_monthly_review ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.stalled}</small>
      <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.improving}</small>
      <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.monthly_ready}</small>
    </div>
  );
};

export default WritingMonitoringView;
