import React, { useEffect, useState } from 'react';
import {
  getWritingAnalyticsDashboard,
  getWritingMonitoringOverview,
  getTeacherAnalyticsDashboardScoped,
  getTeacherMonitoringOverviewScoped,
  WritingAnalyticsDashboard as WritingAnalyticsDashboardShape,
  WritingMonitoringOverview,
} from '../../lib/brains_heist/writingIntegrationService.js';
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
  onNavigate?: (path: string) => void;
}

export const WritingAnalyticsDashboard: React.FC<WritingAnalyticsDashboardProps> = ({
  gradeFilter,
  genreFilter,
  isLoading = false,
  errorMessage,
  monitoringBasePath = '/writing/monitoring',
  calibrationBasePath = '/writing/calibration',
  promptBankBasePath = '/writing/prompts',
  onNavigate,
}) => {
  const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  const seededDashboard = isTestRuntime ? getWritingAnalyticsDashboard({ grade: gradeFilter, genre: genreFilter }) : null;
  const seededMonitoring = isTestRuntime ? getWritingMonitoringOverview() : null;
  const [dashboard, setDashboard] = useState<WritingAnalyticsDashboardShape | null>(seededDashboard?.ok ? seededDashboard.data ?? null : null);
  const [monitoring, setMonitoring] = useState<WritingMonitoringOverview | null>(seededMonitoring?.ok ? seededMonitoring.data ?? null : null);
  const [loadError, setLoadError] = useState<string>('');

  useEffect(() => {
    if (isTestRuntime) return;
    let cancelled = false;
    void Promise.all([
      getTeacherAnalyticsDashboardScoped(undefined, { grade: gradeFilter, genre: genreFilter }),
      getTeacherMonitoringOverviewScoped(undefined, { grade: gradeFilter, genre: genreFilter }),
    ]).then(([dashRes, monitorRes]) => {
      if (cancelled) return;
      if (!dashRes.ok || !dashRes.data) {
        setDashboard(null);
        setLoadError(dashRes.error ?? 'No analytics data available.');
        return;
      }
      setDashboard(dashRes.data);
      if (monitorRes.ok && monitorRes.data) setMonitoring(monitorRes.data);
      else setMonitoring(null);
      setLoadError('');
    });
    return () => {
      cancelled = true;
    };
  }, [gradeFilter, genreFilter, isTestRuntime]);

  if (isLoading) return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading analytics…</div>;
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load analytics: {errorMessage}</div>;

  if (loadError) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>{loadError}</div>;
  }
  if (!dashboard) {
    return (
      <div style={{ padding: 12, color: '#e5e7eb' }}>
        No analytics data available for filters (grade: {gradeFilter ?? 'any'}, genre: {genreFilter ?? 'any'}).
      </div>
    );
  }

  const data = dashboard;
  const isLikelyInternalId = (value?: string): boolean =>
    !value || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
  const toDisplayLabel = (studentName: string | undefined, studentId: string): string => {
    const name = studentName?.trim();
    if (name && !isLikelyInternalId(name)) return name;
    const username = studentId?.trim();
    if (username && !isLikelyInternalId(username)) return username;
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
  const studentLabelsById = new Map(
    monitoring
      ? monitoring.student_rows.map((row) => [row.student_id, toDisplayLabel(row.student_name, row.student_id)])
      : []
  );

  const buildPath = (basePath: string, params: Record<string, string | number | undefined>): string =>
    `${basePath}${serializeAdminDrilldownFilters(params)}`;
  const navigateTo = (path: string, event: any): void => {
    event.preventDefault();
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

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
  const trendRows = data.subscale_improvement_over_time
    .map((item) => ({
      ...item,
      overall_delta: Number(
        (
          (item.content_delta + item.communicative_delta + item.organisation_delta + item.language_delta) /
          4
        ).toFixed(2)
      ),
    }))
    .sort((a, b) => b.overall_delta - a.overall_delta);
  const topImproving = trendRows.filter((item) => item.overall_delta > 0).slice(0, 4);
  const needsSupport = [...trendRows].reverse().filter((item) => item.overall_delta < 0).slice(0, 4);

  return (
    <div style={{ padding: 12, color: '#f3f4f6', display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0, color: '#ffffff' }}>Writing Analytics</h2>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Writing Analytics Dashboard</span>
      <p style={{ margin: 0, color: '#cbd5e1' }}>
        At a glance: who needs help, who is improving, the most common weakness, and suggested next actions.
      </p>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <article style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, background: '#0f172a' }}>
          <strong>Total students</strong>
          <div>{data.summary.total_students}</div>
        </article>
        <article style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, background: '#0f172a' }}>
          <strong>Who needs help?</strong>
          <div>{data.summary.stalled_count} students currently need support.</div>
          <a href={buildPath(monitoringBasePath, { status: 'stalled', grade: gradeFilter, genre: genreFilter })} onClick={(event: any) => navigateTo(buildPath(monitoringBasePath, { status: 'stalled', grade: gradeFilter, genre: genreFilter }), event)}>View</a>
        </article>
        <article style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, background: '#0f172a' }}>
          <strong>Who is improving?</strong>
          <div>{data.summary.improving_count} students are showing growth.</div>
          <a href={buildPath(monitoringBasePath, { status: 'improving', grade: gradeFilter, genre: genreFilter })} onClick={(event: any) => navigateTo(buildPath(monitoringBasePath, { status: 'improving', grade: gradeFilter, genre: genreFilter }), event)}>View</a>
        </article>
      </div>

      <section style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, background: '#0f172a' }}>
        <h3 style={{ marginTop: 0 }}>Main class weaknesses</h3>
        <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Weakness hotspots</span>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.most_common_weakness_tags.map((item) => (
            <li key={item.tag}>
              {toTeacherWeaknessLabel(item.tag)} ({item.count} students){' '}
              <a
                href={buildPath(monitoringBasePath, { weakness_tag: item.tag, grade: gradeFilter, genre: genreFilter })}
                onClick={(event: any) => navigateTo(buildPath(monitoringBasePath, { weakness_tag: item.tag, grade: gradeFilter, genre: genreFilter }), event)}
              >
                Open students
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, background: '#0f172a' }}>
        <h3 style={{ marginTop: 0 }}>Student momentum</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div>
            <strong style={{ color: '#86efac' }}>Improving now</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {topImproving.length === 0 ? <li>No clear improvements yet.</li> : null}
              {topImproving.map((item) => (
                <li key={`improving-${item.student_id}`}>
                  {studentLabelsById.get(item.student_id) ?? 'Student'} (avg +{item.overall_delta})
                </li>
              ))}
            </ul>
          </div>
          <div>
            <strong style={{ color: '#fca5a5' }}>Needs attention</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {needsSupport.length === 0 ? <li>No significant drops detected.</li> : null}
              {needsSupport.map((item) => (
                <li key={`support-${item.student_id}`}>
                  {studentLabelsById.get(item.student_id) ?? 'Student'} (avg {item.overall_delta})
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          {data.average_score_by_grade.map((item) => (
            <div key={`grade-${item.grade}`} style={{ display: 'grid', gap: 2 }}>
              <small style={{ color: '#cbd5e1' }}>Grade {item.grade} class average: {item.average_score}</small>
              <div style={{ background: '#334155', borderRadius: 999, height: 8 }}>
                <div style={{ width: `${Math.min(100, (item.average_score / 20) * 100)}%`, background: '#22c55e', height: '100%' }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, overflowX: 'auto', background: '#0f172a' }}>
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

      <section style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, background: '#0f172a' }}>
        <h3 style={{ marginTop: 0 }}>Recommended next actions</h3>
        <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Pilot readiness</span>
        <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.overused_prompt}</small>
        <br />
        <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.low_improvement_tag}</small>
        <p>
          Monthly reviews to run:{' '}
          {data.pilot_readiness.monthly_comparison_ready_students
            .map((studentId) => studentLabelsById.get(studentId) ?? 'Student')
            .join(', ') || 'None'}
        </p>
        <p>
          Students missing part of this week&apos;s cycle:{' '}
          {data.pilot_readiness.incomplete_weekly_cycle_students
            .map((studentId) => studentLabelsById.get(studentId) ?? 'Student')
            .join(', ') || 'None'}
        </p>
        <p>
          Refresh overused prompts:{' '}
          {data.pilot_readiness.overused_prompts.map((id) => (
            <span key={id}>
              <a href={buildPath(promptBankBasePath, { prompt_id: id, status: 'active' })}>Prompt {id.slice(0, 8)}</a>{' '}
            </span>
          ))}
          {data.pilot_readiness.overused_prompts.length === 0 ? 'None' : ''}
        </p>
        <p>
          Weaknesses needing intervention:{' '}
          {data.pilot_readiness.low_improvement_target_tags.map((tag) => (
            <span key={tag}>
              <a href={buildPath(calibrationBasePath, { weakness_tag: tag, grade: gradeFilter, genre: genreFilter })}>
                {toTeacherWeaknessLabel(tag)}
              </a>{' '}
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
