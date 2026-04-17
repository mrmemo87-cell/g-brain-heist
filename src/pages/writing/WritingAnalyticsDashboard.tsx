import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
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

type SortKey = 'student' | 'completion' | 'score';
type InputChangeEvent = { target: { value: string } };
type SelectChangeEvent = { target: { value: string } };

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
  const shellRef = useRef<HTMLDivElement | null>(null);
  const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  const seededDashboard = isTestRuntime ? getWritingAnalyticsDashboard({ grade: gradeFilter, genre: genreFilter }) : null;
  const seededMonitoring = isTestRuntime ? getWritingMonitoringOverview() : null;
  const [dashboard, setDashboard] = useState<WritingAnalyticsDashboardShape | null>(seededDashboard?.ok ? seededDashboard.data ?? null : null);
  const [monitoring, setMonitoring] = useState<WritingMonitoringOverview | null>(seededMonitoring?.ok ? seededMonitoring.data ?? null : null);
  const [loadError, setLoadError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('student');

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

  useEffect(() => {
    if (!shellRef.current) return;
    const cards = Array.from(shellRef.current.querySelectorAll<HTMLElement>('[data-analytics-card="true"]'));
    if (cards.length === 0) return;
    gsap.fromTo(cards, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.06, ease: 'power2.out' });
  }, [dashboard, monitoring]);
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
  const retryInsights = data?.retry_insights;
  const toPercent = (value: number): string => `${Math.round(value * 100)}%`;

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
    !data ? 'No analytics data available for current filters' : null,
    data && data.pilot_readiness.monthly_comparison_ready_students.length === 0 ? 'No students ready for monthly comparison' : null,
    data && data.pilot_readiness.incomplete_weekly_cycle_students.length > 0
      ? `${data.pilot_readiness.incomplete_weekly_cycle_students.length} students with incomplete cycles`
      : null,
    data && data.pilot_readiness.overused_prompts.length > 0 ? `${data.pilot_readiness.overused_prompts.length} prompts overused recently` : null,
    data && data.pilot_readiness.low_improvement_target_tags.length > 0
      ? `${data.pilot_readiness.low_improvement_target_tags.length} low-improvement tags need intervention`
      : null,
  ].filter(Boolean) as string[];

  const summaryRows = useMemo(() => {
    if (!monitoring) return [];
    const filtered = monitoring.student_rows.filter((row) => {
      const weak = row.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ');
      const searchable = `${toDisplayLabel(row.student_name, row.student_id)} ${row.weekly_target_summary} ${weak}`.toLowerCase();
      return !searchQuery || searchable.includes(searchQuery.toLowerCase());
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'completion') return b.completion_rate - a.completion_rate;
      if (sortKey === 'score') return (b.latest_score ?? -1) - (a.latest_score ?? -1);
      return toDisplayLabel(a.student_name, a.student_id).localeCompare(toDisplayLabel(b.student_name, b.student_id));
    });
    return sorted;
  }, [monitoring, searchQuery, sortKey]);

  if (isLoading) return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading analytics…</div>;
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load analytics: {errorMessage}</div>;
  if (loadError) return <div style={{ padding: 12, color: '#e5e7eb' }}>{loadError}</div>;
  if (!data) {
    return (
      <div style={{ padding: 12, color: '#e5e7eb' }}>
        No analytics data available for filters (grade: {gradeFilter ?? 'any'}, genre: {genreFilter ?? 'any'}).
      </div>
    );
  }

  return (
    <div ref={shellRef} style={{ padding: 12, color: '#f3f4f6', display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0, color: '#ffffff' }}>Writing Analytics</h2>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Writing Analytics Dashboard</span>
      <section data-analytics-card="true" style={{ border: '1px solid #1d4ed8', borderRadius: 12, padding: 12, background: 'linear-gradient(145deg, rgba(30,58,138,0.35), rgba(2,6,23,0.9))' }}>
        <strong style={{ display: 'block', marginBottom: 6, color: '#bfdbfe' }}>What this dashboard is for</strong>
        <p style={{ margin: 0, color: '#dbeafe', fontSize: 13 }}>
          This view is class-level pattern analysis: it helps you see repeated weak skills, retry behavior, and where teaching interventions are needed.
          It is different from <strong>Writing Monitor</strong>, which is your student-by-student tracking list.
        </p>
      </section>
      <div data-analytics-card="true" style={{ position: 'sticky', top: 0, zIndex: 3, background: '#020617', border: '1px solid #1e293b', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Needs support: {data.summary.stalled_count}</span>
          <span style={{ background: '#14532d', color: '#bbf7d0', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Improving: {data.summary.improving_count}</span>
          <span style={{ background: '#1e3a8a', color: '#bfdbfe', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Total students: {data.summary.total_students}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={searchQuery} onChange={(event: InputChangeEvent) => setSearchQuery(event.target.value)} placeholder="Search student or weakness" style={{ flex: '1 1 220px', background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }} />
          <select value={sortKey} onChange={(event: SelectChangeEvent) => setSortKey(event.target.value as SortKey)} style={{ background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
            <option value="student">Sort: Student</option>
            <option value="completion">Sort: Completion</option>
            <option value="score">Sort: Latest score</option>
          </select>
          <a href={buildPath(monitoringBasePath, { status: 'stalled', grade: gradeFilter, genre: genreFilter })} onClick={(event: any) => navigateTo(buildPath(monitoringBasePath, { status: 'stalled', grade: gradeFilter, genre: genreFilter }), event)}>View stalled</a>
          <a href={buildPath(monitoringBasePath, { status: 'improving', grade: gradeFilter, genre: genreFilter })} onClick={(event: any) => navigateTo(buildPath(monitoringBasePath, { status: 'improving', grade: gradeFilter, genre: genreFilter }), event)}>View improving</a>
        </div>
      </div>

      <section data-analytics-card="true" style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, overflowX: 'auto', background: '#0f172a' }}>
        <h3 style={{ marginTop: 0 }}>Student summary table</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th align="left">Student</th>
              <th align="left">Grade</th>
              <th align="left">Completion</th>
              <th align="left">Latest score</th>
              <th align="left">Main weakness</th>
              <th align="left">Recent trend</th>
              <th align="left">Next focus</th>
              <th align="left">Flags</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => (
              <tr key={row.student_id}>
                <td>{toDisplayLabel(row.student_name, row.student_id)}</td>
                <td>{row.current_grade}</td>
                <td>{Math.round(row.completion_rate * 100)}%</td>
                <td>{row.latest_score ?? '—'}</td>
                <td>{row.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ') || '—'}</td>
                <td>ΔC {row.subscale_trend.content}, ΔCom {row.subscale_trend.communicative_achievement}, ΔO {row.subscale_trend.organisation}, ΔL {row.subscale_trend.language}</td>
                <td>{row.weekly_target_summary}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {row.stalled ? <span style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>Needs support</span> : null}
                    {row.improving ? <span style={{ background: '#14532d', color: '#bbf7d0', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>Improving</span> : null}
                    {row.ready_for_monthly_review ? <span style={{ background: '#1e3a8a', color: '#bfdbfe', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>Ready</span> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {retryInsights && (
        <section data-analytics-card="true" style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, overflowX: 'auto', background: '#0f172a' }}>
          <h3 style={{ marginTop: 0 }}>Retry-cycle insights (simple-loop metadata)</h3>
          <p style={{ marginTop: 0, color: '#cbd5e1', fontSize: 12 }}>
            Coverage: {retryInsights.retry_metadata_attempts}/{retryInsights.total_attempts} attempts have retry metadata ({toPercent(retryInsights.retry_metadata_coverage_rate)}).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ background: '#1e3a8a', color: '#bfdbfe', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Cycles: {retryInsights.retry_cycle_count}</span>
            <span style={{ background: '#164e63', color: '#a5f3fc', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Avg attempts/cycle: {retryInsights.average_attempts_per_cycle}</span>
            <span style={{ background: '#14532d', color: '#bbf7d0', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Improved cycles: {retryInsights.cycles_improved_count}</span>
            <span style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Not improved: {retryInsights.cycles_not_improved_count}</span>
            <span style={{ background: '#365314', color: '#d9f99d', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Cycle improvement rate: {toPercent(retryInsights.improved_cycle_rate)}</span>
            <span style={{ background: '#312e81', color: '#c7d2fe', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Avg same-prompt Δ: {retryInsights.average_same_prompt_score_delta ?? '—'}</span>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <h4 style={{ margin: '0 0 4px' }}>Retry depth distribution</h4>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12 }}>
                {retryInsights.retry_depth_distribution.length
                  ? retryInsights.retry_depth_distribution.map((item) => `${item.attempts} attempts: ${item.cycle_count} cycles`).join(' • ')
                  : 'No retry-cycle depth data yet.'}
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px' }}>Most repeated cycle tags</h4>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12 }}>
                {retryInsights.most_repeated_cycle_tags.length
                  ? retryInsights.most_repeated_cycle_tags.map((item) => `${toTeacherWeaknessLabel(item.tag)} (${item.count})`).join(' • ')
                  : 'No repeated tag pattern available yet.'}
              </p>
            </div>
          </div>

          <h4 style={{ marginBottom: 6 }}>Student retry profile</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th align="left">Student</th>
                <th align="left">Cycles</th>
                <th align="left">Avg attempts/cycle</th>
                <th align="left">Same-prompt retries</th>
                <th align="left">Avg same-prompt Δ</th>
                <th align="left">Recurring tags</th>
                <th align="left">Signal</th>
              </tr>
            </thead>
            <tbody>
              {retryInsights.student_retry_profiles.slice(0, 20).map((profile) => (
                <tr key={profile.student_id}>
                  <td>{studentLabelsById.get(profile.student_id) ?? profile.student_id}</td>
                  <td>{profile.retry_cycle_count}</td>
                  <td>{profile.average_attempts_per_cycle}</td>
                  <td>{profile.same_prompt_retry_count}</td>
                  <td>{profile.average_same_prompt_score_delta ?? '—'}</td>
                  <td>{profile.recurring_mistake_tags.map(toTeacherWeaknessLabel).join(', ') || '—'}</td>
                  <td>
                    {profile.needs_intervention ? (
                      <span style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>Needs intervention</span>
                    ) : profile.fast_gains ? (
                      <span style={{ background: '#14532d', color: '#bbf7d0', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>Fast gains</span>
                    ) : (
                      <span style={{ background: '#334155', color: '#e2e8f0', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>Monitor</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section data-analytics-card="true" style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, background: '#0f172a' }}>
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

      <section data-analytics-card="true" style={{ border: '1px solid #475569', borderRadius: 10, padding: 12, overflowX: 'auto', background: '#0f172a' }}>
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
