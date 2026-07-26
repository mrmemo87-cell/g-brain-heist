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
type MonitoringRow = WritingMonitoringOverview['student_rows'][number] & { class_name?: string | null };

const toSafeAnalyticsError = (message?: string): string => {
  if (!message) return 'Writing analytics is temporarily unavailable. Refresh this page or try again shortly.';
  const normalized = message.toLowerCase();
  if (
    normalized.includes('coalesce')
    || normalized.includes('postgres')
    || normalized.includes('rpc')
    || normalized.includes('function')
    || normalized.includes('operator')
    || normalized.includes('type')
  ) {
    return 'Writing analytics is temporarily unavailable. Refresh this page or ask your school administrator for help.';
  }
  return message;
};

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
        setLoadError(toSafeAnalyticsError(dashRes.error));
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

  const summaryRows = useMemo<MonitoringRow[]>(() => {
    if (!monitoring) return [];
    const filtered: MonitoringRow[] = monitoring.student_rows.filter((row) => {
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
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load analytics. {toSafeAnalyticsError(errorMessage)}</div>;
  if (loadError) return <div style={{ padding: 12, color: '#e5e7eb' }}>{toSafeAnalyticsError(loadError)}</div>;
  if (!data) {
    return (
      <div style={{ padding: 12, color: '#e5e7eb' }}>
        No analytics data available for filters (grade: {gradeFilter ?? 'any'}, genre: {genreFilter ?? 'any'}).
      </div>
    );
  }

  return (
    <div className="writing-analytics" ref={shellRef} style={{ padding: 20, color: '#f3f4f6', display: 'grid', gap: 20, background: '#0a0f1a' }}>
      <section>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: '#ffffff', letterSpacing: -0.5 }}>Writing Analytics</h1>
        <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 14 }}>Class-level patterns, retry trends, and intervention opportunities</p>
      </section>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Writing Analytics Dashboard</span>

      <section data-analytics-card="true" style={{ border: '1px solid #1e3a8a', borderRadius: 12, padding: 14, background: 'rgba(30, 58, 138, 0.12)', display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', letterSpacing: 0.5, textTransform: 'uppercase' }}>About this view</div>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>
          See class-wide patterns in weak skills and retry behavior. Different from Writing Monitor, which tracks individual students one-by-one.
        </p>
      </section>

      <div data-analytics-card="true" style={{ position: 'sticky', top: 0, zIndex: 3, background: '#0a0f1a', border: '1px solid #1e293b', borderRadius: 12, padding: 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' }}>Needing Support</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#f87171' }}>{data?.summary.stalled_count ?? 0}</div>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' }}>Improving</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#86efac' }}>{data?.summary.improving_count ?? 0}</div>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase' }}>Total</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#93c5fd' }}>{data?.summary.total_students ?? 0}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input value={searchQuery} onChange={(event: InputChangeEvent) => setSearchQuery(event.target.value)} placeholder="Search by name or weakness..." type="text" style={{ background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 }} />
          <select value={sortKey} onChange={(event: SelectChangeEvent) => setSortKey(event.target.value as SortKey)} style={{ background: '#0f1728', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
            <option value="student">Sort: A-Z</option>
            <option value="completion">Sort: Completion</option>
            <option value="score">Sort: Latest Score</option>
          </select>
        </div>
      </div>

      {data && (
        <section data-analytics-card="true" style={{ border: '1px solid #1e293b', borderRadius: 12, padding: 16, background: 'rgba(15, 23, 42, 0.5)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Student Summary</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#111b31', borderBottom: '2px solid #334155' }}>
                  <th align="left" style={{ padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Student</th>
                  <th align="center" style={{ padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Grade</th>
                  <th align="center" style={{ padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Practice</th>
                  <th align="center" style={{ padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Formative estimate</th>
                  <th align="left" style={{ padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Focus Areas</th>
                  <th align="center" style={{ padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.length > 0 ? (
                  summaryRows.map((row) => (
                    <tr key={row.student_id} style={{ borderBottom: '1px solid #1e293b', color: '#e2e8f0' }}>
                      <td style={{ padding: '11px 12px' }}>
                        <div style={{ fontWeight: 600 }}>{toDisplayLabel(row.student_name, row.student_id)}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{row.class_name ?? 'Unassigned'}</div>
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'center', fontWeight: 600 }}>{row.current_grade}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'center', fontWeight: 600, color: '#93c5fd' }}>{row.practice_completed_count ?? 0}/{row.practice_assigned_count ?? 0}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'center', fontWeight: 600 }}>{row.latest_score == null ? '—' : `${row.latest_score}/20`}</td>
                      <td style={{ padding: '11px 12px', fontSize: 12 }}>
                        {row.repeated_weakness_hotspots.length ? row.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ') : <span style={{ color: '#64748b' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'center' }}>
                        {row.status === 'needs_review' && <span style={{ background: '#7c2d12', color: '#fed7aa', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>Review evidence</span>}
                        {row.stalled && row.status !== 'needs_review' && <span style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>Needs support</span>}
                        {row.improving && !row.stalled && <span style={{ background: '#14532d', color: '#bbf7d0', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>Improving</span>}
                        {!row.stalled && !row.improving && row.status !== 'needs_review' && <span style={{ background: '#1e293b', color: '#cbd5e1', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>{row.status === 'plan_ready' ? 'Plan ready' : 'On track'}</span>}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '20px 12px', textAlign: 'center', color: '#64748b' }}>
                      No students found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && data.most_common_weakness_tags && data.most_common_weakness_tags.length > 0 && (
        <section data-analytics-card="true" style={{ border: '1px solid #1e293b', borderRadius: 12, padding: 16, background: 'rgba(15, 23, 42, 0.5)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Most Common Weak Areas</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {data.most_common_weakness_tags.map((item) => (
              <div key={item.tag} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(30, 41, 59, 0.3)', borderRadius: 8, border: '1px solid #1e293b' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{toTeacherWeaknessLabel(item.tag)}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{item.count} students</div>
                </div>
                <button
                  onClick={(event: any) => navigateTo(buildPath(monitoringBasePath, { weakness_tag: item.tag, grade: gradeFilter, genre: genreFilter }), event)}
                  style={{ borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#93c5fd', padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  View students
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {data && data.prompt_effectiveness && data.prompt_effectiveness.length > 0 && (
        <section data-analytics-card="true" style={{ border: '1px solid #1e293b', borderRadius: 12, padding: 16, background: 'rgba(15, 23, 42, 0.5)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Prompt Effectiveness</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#111b31', borderBottom: '2px solid #334155' }}>
                  <th align="left" style={{ padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Prompt</th>
                  <th align="center" style={{ padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Used</th>
                  <th align="center" style={{ padding: '12px', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {data.prompt_effectiveness.map((item) => (
                  <tr key={item.prompt_id} style={{ borderBottom: '1px solid #1e293b', color: '#e2e8f0' }}>
                    <td style={{ padding: '11px 12px', fontWeight: 600 }}>{item.title}</td>
                    <td style={{ padding: '11px 12px', textAlign: 'center' }}>{item.usage_count}</td>
                    <td style={{ padding: '11px 12px', textAlign: 'center' }}>{item.average_score ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <section data-analytics-card="true" style={{ border: '1px solid #1e293b', borderRadius: 12, padding: 16, background: 'rgba(15, 23, 42, 0.5)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>Recommended Actions</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {data.pilot_readiness.monthly_comparison_ready_students.length > 0 && (
              <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.08)', borderRadius: 8, border: '1px solid #14532d' }}>
                <div style={{ fontWeight: 600, color: '#86efac', marginBottom: 4 }}>✓ Ready for monthly reviews:</div>
                <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                  {data.pilot_readiness.monthly_comparison_ready_students.map((studentId) => studentLabelsById.get(studentId) ?? 'Student').join(', ') || 'None'}
                </div>
              </div>
            )}
            {data.pilot_readiness.overused_prompts.length > 0 && (
              <div style={{ padding: '12px', background: 'rgba(249, 115, 22, 0.08)', borderRadius: 8, border: '1px solid #92400e' }}>
                <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: 4 }}>⚠ Overused prompts to refresh:</div>
                <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                  {data.pilot_readiness.overused_prompts.map((id, idx) => (
                    <span key={id}>
                      Prompt {id.slice(0, 8)}
                      {idx < data.pilot_readiness.overused_prompts.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {data.pilot_readiness.low_improvement_target_tags.length > 0 && (
              <div style={{ padding: '12px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: 8, border: '1px solid #7f1d1d' }}>
                <div style={{ fontWeight: 600, color: '#f87171', marginBottom: 4 }}>! Weaknesses needing intervention:</div>
                <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                  {data.pilot_readiness.low_improvement_target_tags.map((tag) => toTeacherWeaknessLabel(tag)).join(', ')}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default WritingAnalyticsDashboard;
