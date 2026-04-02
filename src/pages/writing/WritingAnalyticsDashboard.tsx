import React from 'react';
import { getWritingAnalyticsDashboard } from '../../lib/brains_heist/writingIntegrationService.js';
import { SupportedGenre } from '../../lib/brains_heist/writingAssessment.js';
import { serializeAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { WRITING_ADMIN_HELP } from '../../lib/brains_heist/writingAdminHelp.js';

interface WritingAnalyticsDashboardProps {
  gradeFilter?: number;
  genreFilter?: SupportedGenre;
  isLoading?: boolean;
  errorMessage?: string;
  monitoringBasePath?: string;
  calibrationBasePath?: string;
  promptBankBasePath?: string;
}

export const WritingAnalyticsDashboard: React.FC<WritingAnalyticsDashboardProps> = ({
  gradeFilter,
  genreFilter,
  isLoading = false,
  errorMessage,
  monitoringBasePath = '/writing/monitoring',
  calibrationBasePath = '/writing/calibration',
  promptBankBasePath = '/writing/prompts',
}) => {
  if (isLoading) return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading analytics…</div>;
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load analytics: {errorMessage}</div>;

  const dashboard = getWritingAnalyticsDashboard({ grade: gradeFilter, genre: genreFilter });
  if (!dashboard.ok || !dashboard.data) {
    return (
      <div style={{ padding: 12, color: '#e5e7eb' }}>
        No analytics data available for filters (grade: {gradeFilter ?? 'any'}, genre: {genreFilter ?? 'any'}).
      </div>
    );
  }

  const { data } = dashboard;
  const buildPath = (basePath: string, params: Record<string, string | number | undefined>): string =>
    `${basePath}${serializeAdminDrilldownFilters(params)}`;

  const pilotWarnings = [
    data.pilot_readiness.monthly_comparison_ready_students.length === 0 ? 'No students ready for monthly comparison' : null,
    data.pilot_readiness.incomplete_weekly_cycle_students.length > 0
      ? `${data.pilot_readiness.incomplete_weekly_cycle_students.length} students with incomplete cycles`
      : null,
    data.pilot_readiness.overused_prompts.length > 0 ? `${data.pilot_readiness.overused_prompts.length} prompts overused recently` : null,
    data.pilot_readiness.low_improvement_target_tags.length > 0
      ? `${data.pilot_readiness.low_improvement_target_tags.length} low-improvement tags need intervention`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div style={{ padding: 12, color: '#e5e7eb', display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0 }}>Writing Analytics Dashboard</h2>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 10 }}>Students: {data.summary.total_students}</article>
        <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 10 }}>
          Stalled: {data.summary.stalled_count}{' '}
          <a href={buildPath(monitoringBasePath, { status: 'stalled', grade: gradeFilter, genre: genreFilter })}>View</a>
        </article>
        <article style={{ border: '1px solid #334155', borderRadius: 10, padding: 10 }}>
          Improving: {data.summary.improving_count}{' '}
          <a href={buildPath(monitoringBasePath, { status: 'improving', grade: gradeFilter, genre: genreFilter })}>View</a>
        </article>
      </div>

      <section style={{ border: '1px solid #334155', borderRadius: 10, padding: 10 }}>
        <h3 style={{ marginTop: 0 }}>Weakness hotspots</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.most_common_weakness_tags.map((item) => (
            <li key={item.tag}>
              {item.tag} ({item.count}){' '}
              <a href={buildPath(monitoringBasePath, { weakness_tag: item.tag, grade: gradeFilter, genre: genreFilter })}>
                Open students
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 10, padding: 10 }}>
        <h3 style={{ marginTop: 0 }}>Subscale trend view</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.subscale_improvement_over_time.map((item) => (
            <li key={item.student_id}>
              {item.student_id}: C {item.content_delta >= 0 ? '+' : ''}{item.content_delta}, O {item.organisation_delta >= 0 ? '+' : ''}
              {item.organisation_delta}, L {item.language_delta >= 0 ? '+' : ''}{item.language_delta}
            </li>
          ))}
        </ul>
        <div style={{ display: 'grid', gap: 4 }}>
          {data.average_score_by_grade.map((item) => (
            <div key={`grade-${item.grade}`} style={{ display: 'grid', gap: 2 }}>
              <small>Grade {item.grade} avg score: {item.average_score}</small>
              <div style={{ background: '#1f2937', borderRadius: 999, height: 8 }}>
                <div style={{ width: `${Math.min(100, (item.average_score / 20) * 100)}%`, background: '#22c55e', height: '100%' }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 10, padding: 10, overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Prompt effectiveness</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th align="left">Prompt</th>
              <th align="left">Usage</th>
              <th align="left">Avg score</th>
            </tr>
          </thead>
          <tbody>
            {data.prompt_effectiveness.map((item) => (
              <tr key={item.prompt_id}>
                <td>{item.title}</td>
                <td>{item.usage_count}</td>
                <td>{item.average_score ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ border: '1px solid #334155', borderRadius: 10, padding: 10 }}>
        <h3 style={{ marginTop: 0 }}>Pilot readiness</h3>
        <small>{WRITING_ADMIN_HELP.overused_prompt}</small>
        <br />
        <small>{WRITING_ADMIN_HELP.low_improvement_tag}</small>
        <p>Monthly comparison ready: {data.pilot_readiness.monthly_comparison_ready_students.join(', ') || 'None'}</p>
        <p>Incomplete weekly cycles: {data.pilot_readiness.incomplete_weekly_cycle_students.join(', ') || 'None'}</p>
        <p>
          Overused prompts:{' '}
          {data.pilot_readiness.overused_prompts.map((id) => (
            <span key={id}>
              <a href={buildPath(promptBankBasePath, { prompt_id: id, status: 'active' })}>{id}</a>{' '}
            </span>
          ))}
          {data.pilot_readiness.overused_prompts.length === 0 ? 'None' : ''}
        </p>
        <p>
          Low-improvement tags:{' '}
          {data.pilot_readiness.low_improvement_target_tags.map((tag) => (
            <span key={tag}>
              <a href={buildPath(calibrationBasePath, { weakness_tag: tag, grade: gradeFilter, genre: genreFilter })}>{tag}</a>{' '}
            </span>
          ))}
          {data.pilot_readiness.low_improvement_target_tags.length === 0 ? 'None' : ''}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {pilotWarnings.map((warning) => (
            <span key={warning} style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
              ⚠ {warning}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
};

export default WritingAnalyticsDashboard;
