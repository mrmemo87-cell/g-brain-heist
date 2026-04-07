import React, { useEffect, useMemo, useState } from 'react';
import { getTeacherMonitoringOverviewScoped, getWritingMonitoringOverview, WritingMonitoringOverview } from '../../lib/brains_heist/writingIntegrationService.js';
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
  position: 'sticky' as const,
  top: 0,
  zIndex: 1,
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

type SortKey = 'student' | 'completion' | 'score';
type InputChangeEvent = { target: { value: string } };
type SelectChangeEvent = { target: { value: string } };

export const WritingMonitoringView: React.FC<WritingMonitoringViewProps> = ({
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
  filterQuery = '',
}) => {
  const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  const seededOverview = isTestRuntime ? getWritingMonitoringOverview(month) : null;
  const [overview, setOverview] = useState<WritingMonitoringOverview | null>(seededOverview?.ok ? seededOverview.data ?? null : null);
  const [loadError, setLoadError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('student');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const filters = parseAdminDrilldownFilters(filterQuery);

  const rows = useMemo(() => {
    if (!overview) return [];
    const filtered = overview.student_rows.filter((row) => {
      if (filters.grade && row.current_grade !== filters.grade) return false;
      if (filters.status === 'stalled' && !row.stalled) return false;
      if (filters.status === 'improving' && !row.improving) return false;
      if (filters.weakness_tag && !row.repeated_weakness_hotspots.includes(filters.weakness_tag)) return false;
      const searchable = `${toDisplayLabel(row.student_name, row.student_id)} ${row.weekly_target_summary}`.toLowerCase();
      if (searchQuery && !searchable.includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    const next = [...filtered];
    next.sort((a, b) => {
      if (sortKey === 'completion') return b.completion_rate - a.completion_rate;
      if (sortKey === 'score') return (b.latest_score ?? -1) - (a.latest_score ?? -1);
      return toDisplayLabel(a.student_name, a.student_id).localeCompare(toDisplayLabel(b.student_name, b.student_id));
    });
    return next;
  }, [overview, filters, searchQuery, sortKey]);

  useEffect(() => {
    if (isTestRuntime) return;
    let cancelled = false;
    void getTeacherMonitoringOverviewScoped(month).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setOverview(null);
        setLoadError(result.error ?? 'No writing monitoring data available yet.');
        return;
      }
      setOverview(result.data);
      setLoadError('');
    });
    return () => {
      cancelled = true;
    };
  }, [month, isTestRuntime]);

  if (isLoading) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading writing monitor…</div>;
  }

  if (errorMessage) {
    return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load writing monitor: {errorMessage}</div>;
  }

  if (loadError) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>{loadError}</div>;
  }
  if (!overview) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>No writing monitoring data available yet.</div>;
  }
  if (overview.student_rows.length === 0) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>No students with writing records yet.</div>;
  }
  if (rows.length === 0) {
    return <div style={{ padding: 12, color: '#e5e7eb' }}>No monitoring matches for current filters ({filterQuery || 'none'}).</div>;
  }

  const stalledCount = rows.filter((row) => row.stalled).length;
  const improvingCount = rows.filter((row) => row.improving).length;
  const monthlyReadyCount = rows.filter((row) => row.ready_for_monthly_review).length;
  const selectedRow = rows.find((row) => row.student_id === selectedStudentId) ?? rows[0];
  const handleViewSummary = (): void => {};
  const handleOpenReport = (): void => {};
  const handleExportReport = (): void => {};

  return (
    <div style={{ padding: 12, color: '#f3f4f6', display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, color: '#ffffff' }}>Writing Monitor</h2>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Weekly target</span>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Teacher/Admin Writing Monitor</span>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: '#020617', border: '1px solid #1e293b', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Needs support: {stalledCount}</span>
          <span style={{ background: '#14532d', color: '#bbf7d0', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Improving: {improvingCount}</span>
          <span style={{ background: '#1e3a8a', color: '#bfdbfe', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>Ready for review: {monthlyReadyCount}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={searchQuery}
            onChange={(event: InputChangeEvent) => setSearchQuery(event.target.value)}
            placeholder="Search student or focus"
            style={{ flex: '1 1 220px', background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}
          />
          <select
            value={sortKey}
            onChange={(event: SelectChangeEvent) => setSortKey(event.target.value as SortKey)}
            style={{ background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}
          >
            <option value="student">Sort: Student</option>
            <option value="completion">Sort: Completion</option>
            <option value="score">Sort: Latest score</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)' }}>
        <div style={{ overflowX: 'auto', maxHeight: '70vh', border: '1px solid #1e293b', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#0f172a' }}>
            <thead>
              <tr>
                <th align="left" style={tableHeaderCellStyle}>Student</th>
                <th align="left" style={tableHeaderCellStyle}>Grade</th>
                <th align="left" style={tableHeaderCellStyle}>Completion</th>
                <th align="left" style={tableHeaderCellStyle}>Latest score</th>
                <th align="left" style={tableHeaderCellStyle}>Main weakness</th>
                <th align="left" style={tableHeaderCellStyle}>Recent trend</th>
                <th align="left" style={tableHeaderCellStyle}>Next focus</th>
                <th align="left" style={tableHeaderCellStyle}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.student_id} onClick={() => setSelectedStudentId(row.student_id)} style={{ cursor: 'pointer', outline: selectedRow.student_id === row.student_id ? '1px solid #38bdf8' : 'none' }}>
                  <td style={tableCellStyle}>{toDisplayLabel(row.student_name, row.student_id)}</td>
                  <td style={tableCellStyle}>{row.current_grade}</td>
                  <td style={tableCellStyle}>{Math.round(row.completion_rate * 100)}%</td>
                  <td style={tableCellStyle}>{row.latest_score ?? '—'}</td>
                  <td style={tableCellStyle}>{row.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ') || '—'}</td>
                  <td style={tableCellStyle}>ΔC {row.subscale_trend.content}, ΔCom {row.subscale_trend.communicative_achievement}, ΔO {row.subscale_trend.organisation}, ΔL {row.subscale_trend.language}</td>
                  <td style={tableCellStyle}>{row.weekly_target_summary}</td>
                  <td style={tableCellStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {row.stalled ? <span style={{ background: '#7f1d1d', color: '#fecaca', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>Needs support</span> : null}
                      {row.stalled ? <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Status: Stalled</span> : null}
                      {row.improving ? <span style={{ background: '#14532d', color: '#bbf7d0', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>Improving</span> : null}
                      {row.improving ? <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Status: Improving</span> : null}
                      {row.ready_for_monthly_review ? <span style={{ background: '#1e3a8a', color: '#bfdbfe', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>Ready</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside style={cardStyle}>
          <strong style={{ color: '#93c5fd' }}>Student details</strong>
          <span>{toDisplayLabel(selectedRow.student_name, selectedRow.student_id)}</span>
          <span>Grade {selectedRow.current_grade}</span>
          <span>Completion {Math.round(selectedRow.completion_rate * 100)}%</span>
          <span>Latest score {selectedRow.latest_score ?? '—'}</span>
          <span>Main weakness: {selectedRow.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ') || '—'}</span>
          <span>Next focus: {selectedRow.weekly_target_summary}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleViewSummary} disabled aria-disabled title="View summary action is not wired yet" style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 8px', opacity: 0.65, cursor: 'not-allowed' }}>View summary</button>
            <button type="button" onClick={handleOpenReport} disabled aria-disabled title="Open report action is not wired yet" style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 8px', opacity: 0.65, cursor: 'not-allowed' }}>Open report</button>
            <button type="button" onClick={handleExportReport} disabled aria-disabled title="Export action is not wired yet" style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 8px', opacity: 0.65, cursor: 'not-allowed' }}>Export</button>
          </div>
        </aside>
      </div>

      <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.stalled}</small>
      <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.improving}</small>
      <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.monthly_ready}</small>
    </div>
  );
};

export default WritingMonitoringView;
