import React, { type CSSProperties } from 'react';
import { getWritingMonitoringOverview, listAdminReviewSignals } from '../../lib/brains_heist/writingIntegrationService.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { WRITING_ADMIN_HELP } from '../../lib/brains_heist/writingAdminHelp.js';

interface WritingMonitoringViewProps {
  month?: string;
  isLoading?: boolean;
  errorMessage?: string;
  filterQuery?: string;
}

const cardStyle: CSSProperties = {
  border: '1px solid #334155',
  borderRadius: 10,
  padding: 10,
  background: '#111827',
  display: 'grid',
  gap: 6,
};

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

  return (
    <div style={{ padding: 12, color: '#e5e7eb', display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>Teacher/Admin Writing Monitor</h2>
      <p>Hotspot tags: {overview.data.hotspot_tags.join(', ') || 'None'}</p>
      <p>Stalled students: {overview.data.stalled_students.join(', ') || 'None'}</p>
      <p>Ready for monthly review: {overview.data.monthly_review_ready_students.join(', ') || 'None'}</p>
      <small>{WRITING_ADMIN_HELP.stalled}</small>
      <small>{WRITING_ADMIN_HELP.improving}</small>
      <small>{WRITING_ADMIN_HELP.monthly_ready}</small>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
        {rows.map((row) => (
          <article key={`card-${row.student_id}`} style={cardStyle}>
            <strong>
              {row.student_name} ({row.student_id})
            </strong>
            <span>Grade {row.current_grade}</span>
            <span>Completion: {Math.round(row.completion_rate * 100)}%</span>
            <span>Latest score: {row.latest_score ?? '—'}</span>
            <span>Weekly target: {row.weekly_target_summary}</span>
            <span>Status: {row.stalled ? 'Stalled' : row.improving ? 'Improving' : 'Steady'}</span>
          </article>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th align="left">Student</th>
              <th align="left">Grade</th>
              <th align="left">Completion</th>
              <th align="left">Latest score</th>
              <th align="left">Latest subscales</th>
              <th align="left">Subscale trend</th>
              <th align="left">Weakness hotspots</th>
              <th align="left">Weekly target</th>
              <th align="left">Stalled</th>
              <th align="left">Improving</th>
              <th align="left">Monthly-ready</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.student_id}>
                <td>
                  {row.student_name}
                  <br />({row.student_id})
                </td>
                <td>{row.current_grade}</td>
                <td>{Math.round(row.completion_rate * 100)}%</td>
                <td>{row.latest_score ?? '—'}</td>
                <td>
                  C:{row.latest_subscale_scores.content ?? '—'} / CA:{row.latest_subscale_scores.communicative_achievement ?? '—'} / O:
                  {row.latest_subscale_scores.organisation ?? '—'} / L:{row.latest_subscale_scores.language ?? '—'}
                </td>
                <td>
                  C:{row.subscale_trend.content >= 0 ? '+' : ''}
                  {row.subscale_trend.content}, CA:{row.subscale_trend.communicative_achievement >= 0 ? '+' : ''}
                  {row.subscale_trend.communicative_achievement}, O:{row.subscale_trend.organisation >= 0 ? '+' : ''}
                  {row.subscale_trend.organisation}, L:{row.subscale_trend.language >= 0 ? '+' : ''}
                  {row.subscale_trend.language}
                </td>
                <td>{row.repeated_weakness_hotspots.join(', ') || '—'}</td>
                <td>{row.weekly_target_summary}</td>
                <td>{row.stalled ? 'Yes' : 'No'}</td>
                <td>{row.improving ? 'Yes' : 'No'}</td>
                <td>{row.ready_for_monthly_review ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WritingMonitoringView;
