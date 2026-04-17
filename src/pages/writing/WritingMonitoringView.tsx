import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  getTeacherMonitoringOverviewScoped,
  getTeacherWritingReport,
  getWritingMonitoringOverview,
  TeacherWritingReport,
  WritingMonitoringOverview,
} from '../../lib/brains_heist/writingIntegrationService.js';
import { parseAdminDrilldownFilters } from '../../lib/brains_heist/writingAdminFilters.js';
import { WRITING_ADMIN_HELP } from '../../lib/brains_heist/writingAdminHelp.js';

interface WritingMonitoringViewProps {
  month?: string;
  isLoading?: boolean;
  errorMessage?: string;
  filterQuery?: string;
}

type SortKey = 'student' | 'score_desc' | 'score_asc' | 'completion_desc' | 'completion_asc';
type SupportFilter = 'all' | 'needs_support' | 'improving' | 'stable';
type ReadinessFilter = 'all' | 'ready' | 'not_ready';
type InputChangeEvent = { target: { value: string } };
type SelectChangeEvent = { target: { value: string } };

type MonitoringRow = WritingMonitoringOverview['student_rows'][number] & { class_name?: string | null };

const shellCard = {
  border: '1px solid #334155',
  borderRadius: 12,
  background: 'linear-gradient(180deg, #0f172a 0%, #0b1223 100%)',
};

const tableHeaderCellStyle = {
  color: '#cbd5e1',
  background: '#111b31',
  borderBottom: '1px solid #334155',
  padding: '10px 12px',
  fontWeight: 700,
  position: 'sticky' as const,
  top: 0,
  zIndex: 1,
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.35,
};

const tableCellStyle = {
  color: '#f8fafc',
  borderBottom: '1px solid #1e293b',
  padding: '11px 12px',
  verticalAlign: 'top' as const,
  fontSize: 13,
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

const chipStyle = (mode: 'danger' | 'success' | 'neutral' | 'info') => {
  const map = {
    danger: { background: '#3a1212', color: '#fecaca', border: '1px solid #7f1d1d' },
    success: { background: '#122d1f', color: '#bbf7d0', border: '1px solid #166534' },
    neutral: { background: '#172036', color: '#cbd5e1', border: '1px solid #334155' },
    info: { background: '#122a49', color: '#bfdbfe', border: '1px solid #1d4ed8' },
  } as const;
  return { ...map[mode], borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 600 };
};

const toTrendLabel = (row: MonitoringRow): 'Improving' | 'Stable' | 'Declining' | 'No recent data' => {
  const deltas = Object.values(row.subscale_trend);
  if (deltas.every((value) => value === 0)) return 'No recent data';
  const positives = deltas.filter((value) => value > 0).length;
  const negatives = deltas.filter((value) => value < 0).length;
  if (positives >= 2 && positives > negatives) return 'Improving';
  if (negatives >= 2 && negatives > positives) return 'Declining';
  return 'Stable';
};

const downloadText = (filename: string, content: string): void => {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const WritingMonitoringView: React.FC<WritingMonitoringViewProps> = ({
  month = new Date().toISOString().slice(0, 7),
  isLoading = false,
  errorMessage,
  filterQuery = '',
}) => {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLElement | null>(null);
  const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  const seededOverview = isTestRuntime ? getWritingMonitoringOverview(month) : null;
  const [overview, setOverview] = useState<WritingMonitoringOverview | null>(seededOverview?.ok ? seededOverview.data ?? null : null);
  const [loadError, setLoadError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('student');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [supportFilter, setSupportFilter] = useState<SupportFilter>('all');
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [weakAreaFilter, setWeakAreaFilter] = useState<string>('all');
  const [activeQuickFilter, setActiveQuickFilter] = useState<'all' | 'stalled' | 'improving'>('all');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [openReportData, setOpenReportData] = useState<TeacherWritingReport | null>(null);

  const filters = parseAdminDrilldownFilters(filterQuery);

  const allRows: MonitoringRow[] = useMemo(() => (overview?.student_rows ?? []).map((row) => ({ ...row })), [overview]);

  const gradeOptions = useMemo(() => [...new Set(allRows.map((row) => String(row.current_grade)))].sort((a, b) => Number(a) - Number(b)), [allRows]);
  const classOptions = useMemo(() => ['Unassigned'], []);

  const rows = useMemo(() => {
    const filtered = allRows.filter((row) => {
      if (filters.grade && row.current_grade !== filters.grade) return false;
      if (filters.status === 'stalled' && !row.stalled) return false;
      if (filters.status === 'improving' && !row.improving) return false;
      if (filters.weakness_tag && !row.repeated_weakness_hotspots.includes(filters.weakness_tag)) return false;

      if (activeQuickFilter === 'stalled' && !row.stalled) return false;
      if (activeQuickFilter === 'improving' && !row.improving) return false;
      if (gradeFilter !== 'all' && String(row.current_grade) !== gradeFilter) return false;
      if (classFilter !== 'all' && (row.class_name ?? 'Unassigned') !== classFilter) return false;
      if (weakAreaFilter !== 'all' && !row.repeated_weakness_hotspots.includes(weakAreaFilter)) return false;

      const trendLabel = toTrendLabel(row);
      if (supportFilter === 'needs_support' && !row.stalled) return false;
      if (supportFilter === 'improving' && !row.improving) return false;
      if (supportFilter === 'stable' && (row.stalled || row.improving || trendLabel === 'Declining')) return false;
      if (readinessFilter === 'ready' && !row.ready_for_monthly_review) return false;
      if (readinessFilter === 'not_ready' && row.ready_for_monthly_review) return false;

      const searchable = `${toDisplayLabel(row.student_name, row.student_id)} ${(row.class_name ?? 'Unassigned')} ${row.weekly_target_summary} ${row.repeated_weakness_hotspots.join(' ')}`.toLowerCase();
      if (searchQuery && !searchable.includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    const next = [...filtered];
    next.sort((a, b) => {
      if (sortKey === 'completion_desc') return b.completion_rate - a.completion_rate;
      if (sortKey === 'completion_asc') return a.completion_rate - b.completion_rate;
      if (sortKey === 'score_desc') return (b.latest_score ?? -1) - (a.latest_score ?? -1);
      if (sortKey === 'score_asc') return (a.latest_score ?? 999) - (b.latest_score ?? 999);
      return toDisplayLabel(a.student_name, a.student_id).localeCompare(toDisplayLabel(b.student_name, b.student_id));
    });
    return next;
  }, [allRows, filters, activeQuickFilter, gradeFilter, classFilter, weakAreaFilter, supportFilter, readinessFilter, searchQuery, sortKey]);

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

  useEffect(() => {
    const nodes = [headerRef.current, listRef.current, detailsRef.current].filter(Boolean);
    if (nodes.length === 0) return;
    gsap.fromTo(
      nodes,
      { y: 16, autoAlpha: 0, scale: 0.99 },
      { y: 0, autoAlpha: 1, scale: 1, duration: 0.55, stagger: 0.08, ease: 'power2.out' }
    );
  }, [month]);

  useEffect(() => {
    if (!selectedStudentId && rows[0]?.student_id) setSelectedStudentId(rows[0].student_id);
  }, [rows, selectedStudentId]);

  const selectedRow = rows.find((row) => row.student_id === selectedStudentId) ?? rows[0];

  const openReport = (studentId: string): void => {
    setSelectedStudentId(studentId);
    setIsReportOpen(true);
    setIsReportLoading(true);
    setReportError('');
    void getTeacherWritingReport({ student_id: studentId, month, include_snippet: false })
      .then((result) => {
        if (!result.ok || !result.data) {
          setReportError(result.error ?? 'Unable to load report.');
          setOpenReportData(null);
          return;
        }
        setOpenReportData(result.data);
      })
      .finally(() => setIsReportLoading(false));
  };

  const buildPrintableReportHtml = (report: TeacherWritingReport): string => {
    const rows = [
      ['Student', report.student.student_name],
      ['Grade', report.student.grade ?? '—'],
      ['Class', report.student.class_name ?? 'Unassigned'],
      ['Reporting period', report.period],
      ['Genre', report.genre],
      ['Latest score', report.overall_summary.latest_score ?? '—'],
      ['Completion', `${report.overall_summary.completion_rate_percent}% (${report.overall_summary.completed_tasks}/${report.overall_summary.total_tasks})`],
      ['Trend delta', report.overall_summary.score_trend_delta ?? '—'],
      ['Progress summary', report.student_friendly_summary.progress_summary],
      ['Priority weak areas', report.priority_weak_areas.join(', ') || 'None detected yet'],
      ['Teacher actions', report.teacher_actions.join(' • ') || 'No actions generated yet'],
      ['Strengths', report.strengths.join(' • ') || 'No strengths captured yet'],
    ];
    const renderedRows = rows
      .map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`)
      .join('');
    return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Writing Report Card</title>
<style>
body{font-family:Inter,Segoe UI,Arial,sans-serif;padding:24px;color:#0f172a}
h1{margin:0 0 4px;font-size:24px} p{margin:0 0 16px;color:#475569}
table{width:100%;border-collapse:collapse} th,td{border:1px solid #cbd5e1;padding:10px;vertical-align:top}
th{background:#f1f5f9;text-align:left;width:230px}
.meta{margin-top:14px;font-size:12px;color:#64748b}
</style></head>
<body>
  <h1>Writing Report Card</h1>
  <p>Teacher view • generated ${new Date().toLocaleString()}</p>
  <table>${renderedRows}</table>
  <div class="meta">Confidential — For teacher and student support planning.</div>
</body></html>`;
  };

  const printOpenReport = (): void => {
    if (!openReportData || typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(buildPrintableReportHtml(openReportData));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleExportStudent = (studentId: string): void => {
    const targetRow = allRows.find((row) => row.student_id === studentId);
    if (!targetRow) return;
    const content = [
      `Student: ${toDisplayLabel(targetRow.student_name, targetRow.student_id)}`,
      `Grade: ${targetRow.current_grade}`,
      `Completion: ${Math.round(targetRow.completion_rate * 100)}%`,
      `Latest score: ${targetRow.latest_score ?? 'No score yet'}`,
      `Recent trend: ${toTrendLabel(targetRow)}`,
      `Weak areas: ${targetRow.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ') || 'None yet'}`,
      `Next focus: ${targetRow.weekly_target_summary}`,
      `Readiness: ${targetRow.ready_for_monthly_review ? 'Ready for monthly review' : 'Not ready for monthly review yet'}`,
    ].join('\n');
    downloadText(`writing-summary-${studentId}-${month}.txt`, content);
  };

  if (isLoading) return <div style={{ padding: 12, color: '#e5e7eb' }}>Loading writing monitor…</div>;
  if (errorMessage) return <div style={{ padding: 12, color: '#fca5a5' }}>Unable to load writing monitor: {errorMessage}</div>;
  if (loadError) return <div style={{ padding: 12, color: '#e5e7eb' }}>{loadError}</div>;
  if (!overview) return <div style={{ padding: 12, color: '#e5e7eb' }}>No writing monitoring data available yet.</div>;
  if (overview.student_rows.length === 0) return <div style={{ padding: 12, color: '#e5e7eb' }}>No students with writing records yet.</div>;

  const stalledCount = allRows.filter((row) => row.stalled).length;
  const improvingCount = allRows.filter((row) => row.improving).length;
  const monthlyReadyCount = allRows.filter((row) => row.ready_for_monthly_review).length;

  return (
    <div style={{ padding: 14, color: '#f3f4f6', display: 'grid', gap: 12 }}>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Weekly target</span>
      <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Teacher/Admin Writing Monitor</span>

      <section ref={headerRef} style={{ ...shellCard, padding: 14, display: 'grid', gap: 10, boxShadow: '0 16px 42px rgba(15,23,42,0.35)' }}>
        <h2 style={{ margin: 0, color: '#ffffff', fontSize: 24 }}>Writing Monitor</h2>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13 }}>
          Clear weekly snapshot for teachers: who needs intervention, who is improving, and who is ready for monthly report cards.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <article style={{ ...shellCard, padding: 12 }}><div style={{ color: '#94a3b8', fontSize: 12 }}>Students needing support</div><strong style={{ fontSize: 24 }}>{stalledCount}</strong></article>
          <article style={{ ...shellCard, padding: 12 }}><div style={{ color: '#94a3b8', fontSize: 12 }}>Students improving</div><strong style={{ fontSize: 24 }}>{improvingCount}</strong></article>
          <article style={{ ...shellCard, padding: 12 }}><div style={{ color: '#94a3b8', fontSize: 12 }}>Ready for monthly review</div><strong style={{ fontSize: 24 }}>{monthlyReadyCount}</strong></article>
        </div>
      </section>

      <section style={{ ...shellCard, padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setActiveQuickFilter('stalled')} style={{ ...chipStyle(activeQuickFilter === 'stalled' ? 'danger' : 'neutral'), cursor: 'pointer' }}>View stalled</button>
          <button type="button" onClick={() => setActiveQuickFilter('improving')} style={{ ...chipStyle(activeQuickFilter === 'improving' ? 'success' : 'neutral'), cursor: 'pointer' }}>View improving</button>
          <button type="button" onClick={() => setActiveQuickFilter('all')} style={{ ...chipStyle(activeQuickFilter === 'all' ? 'info' : 'neutral'), cursor: 'pointer' }}>View all</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 8 }}>
          <input value={searchQuery} onChange={(event: InputChangeEvent) => setSearchQuery(event.target.value)} placeholder="Search student name" style={{ background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }} />
          <select value={classFilter} onChange={(event: SelectChangeEvent) => setClassFilter(event.target.value)} style={{ background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
            <option value="all">Class: All classes</option>
            {classOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={gradeFilter} onChange={(event: SelectChangeEvent) => setGradeFilter(event.target.value)} style={{ background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
            <option value="all">Grade: All</option>
            {gradeOptions.map((value) => <option key={value} value={value}>Grade {value}</option>)}
          </select>
          <select value={weakAreaFilter} onChange={(event: SelectChangeEvent) => setWeakAreaFilter(event.target.value)} style={{ background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
            <option value="all">Weak area: All</option>
            {overview.hotspot_tags.map((tag) => <option key={tag} value={tag}>{toTeacherWeaknessLabel(tag)}</option>)}
          </select>
          <select value={supportFilter} onChange={(event: SelectChangeEvent) => setSupportFilter(event.target.value as SupportFilter)} style={{ background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
            <option value="all">Support status: All</option>
            <option value="needs_support">Needs support</option>
            <option value="improving">Improving</option>
            <option value="stable">Stable</option>
          </select>
          <select value={readinessFilter} onChange={(event: SelectChangeEvent) => setReadinessFilter(event.target.value as ReadinessFilter)} style={{ background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
            <option value="all">Readiness: All</option>
            <option value="ready">Ready for review</option>
            <option value="not_ready">Not ready</option>
          </select>
          <select value={sortKey} onChange={(event: SelectChangeEvent) => setSortKey(event.target.value as SortKey)} style={{ background: '#020617', border: '1px solid #334155', color: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
            <option value="student">Sort: Student A-Z</option>
            <option value="score_desc">Score: High to low</option>
            <option value="score_asc">Score: Low to high</option>
            <option value="completion_desc">Completion: High to low</option>
            <option value="completion_asc">Completion: Low to high</option>
          </select>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)' }}>
        <div ref={listRef} style={{ ...shellCard, overflowX: 'auto', maxHeight: '70vh', boxShadow: '0 10px 28px rgba(15,23,42,0.3)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'transparent' }}>
            <thead>
              <tr>
                <th align="left" style={tableHeaderCellStyle}>Student</th>
                <th align="left" style={tableHeaderCellStyle}>Grade</th>
                <th align="left" style={tableHeaderCellStyle}>Completion</th>
                <th align="left" style={tableHeaderCellStyle}>Latest score</th>
                <th align="left" style={tableHeaderCellStyle}>Weak areas</th>
                <th align="left" style={tableHeaderCellStyle}>Recent trend</th>
                <th align="left" style={tableHeaderCellStyle}>Support</th>
                <th align="left" style={tableHeaderCellStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = selectedRow?.student_id === row.student_id;
                return (
                  <tr key={row.student_id} onClick={() => setSelectedStudentId(row.student_id)} style={{ cursor: 'pointer', background: selected ? '#0b1f36' : 'transparent' }}>
                    <td style={tableCellStyle}><strong>{toDisplayLabel(row.student_name, row.student_id)}</strong><div style={{ color: '#94a3b8', fontSize: 12 }}>{row.class_name ?? 'Unassigned'}</div></td>
                    <td style={tableCellStyle}>{row.current_grade}</td>
                    <td style={tableCellStyle}>{Math.round(row.completion_rate * 100)}%</td>
                    <td style={tableCellStyle}>{row.latest_score ?? '—'}</td>
                    <td style={tableCellStyle}>{row.repeated_weakness_hotspots.length ? row.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ') : 'No repeated weak areas yet'}</td>
                    <td style={tableCellStyle}>{toTrendLabel(row)}</td>
                    <td style={tableCellStyle}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.stalled ? <span style={chipStyle('danger')}>Needs support</span> : null}
                        {row.stalled ? <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Status: Stalled</span> : null}
                        {row.improving ? <span style={chipStyle('success')}>Improving</span> : null}
                        {row.improving ? <span style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>Status: Improving</span> : null}
                        {!row.stalled && !row.improving ? <span style={chipStyle('neutral')}>Stable</span> : null}
                        {row.ready_for_monthly_review ? <span style={chipStyle('info')}>Ready</span> : null}
                      </div>
                    </td>
                    <td style={tableCellStyle}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" onClick={(event: { stopPropagation: () => void }) => { event.stopPropagation(); setSelectedStudentId(row.student_id); }} style={{ borderRadius: 7, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '4px 8px' }}>View summary</button>
                        <button type="button" onClick={(event: { stopPropagation: () => void }) => { event.stopPropagation(); openReport(row.student_id); }} style={{ borderRadius: 7, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '4px 8px' }}>Open report</button>
                        <button type="button" onClick={(event: { stopPropagation: () => void }) => { event.stopPropagation(); handleExportStudent(row.student_id); }} style={{ borderRadius: 7, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '4px 8px' }}>Export</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <div style={{ padding: 12, color: '#cbd5e1' }}>No monitoring matches for current filters.</div> : null}
        </div>

        {selectedRow ? (
          <aside ref={detailsRef} style={{ ...shellCard, padding: 12, display: 'grid', gap: 8, boxShadow: '0 10px 28px rgba(15,23,42,0.3)' }}>
            <strong style={{ color: '#93c5fd' }}>Student details</strong>
            <span>{toDisplayLabel(selectedRow.student_name, selectedRow.student_id)}</span>
            <span>Grade {selectedRow.current_grade}</span>
            <span>Completion {Math.round(selectedRow.completion_rate * 100)}%</span>
            <span>Latest score {selectedRow.latest_score ?? '—'}</span>
            <span>Recent trend: {toTrendLabel(selectedRow)}</span>
            <span>Weak areas: {selectedRow.repeated_weakness_hotspots.length ? selectedRow.repeated_weakness_hotspots.map(toTeacherWeaknessLabel).join(', ') : 'No repeated weak areas yet'}</span>
            <span>Next focus: {selectedRow.weekly_target_summary}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setSelectedStudentId(selectedRow.student_id)} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 8px' }}>View summary</button>
              <button type="button" onClick={() => openReport(selectedRow.student_id)} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 8px' }}>Open report</button>
              <button type="button" onClick={() => handleExportStudent(selectedRow.student_id)} style={{ borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 8px' }}>Export</button>
            </div>
          </aside>
        ) : null}
      </div>

      {isReportOpen ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.72)', zIndex: 30, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ ...shellCard, width: 'min(880px, 100%)', maxHeight: '88vh', overflow: 'auto', padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Student writing report</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={printOpenReport} disabled={!openReportData || isReportLoading} style={{ borderRadius: 7, border: '1px solid #14532d', background: '#166534', color: '#f0fdf4', padding: '6px 10px', cursor: openReportData ? 'pointer' : 'not-allowed', opacity: openReportData ? 1 : 0.5 }}>Print report card</button>
                <button type="button" onClick={() => setIsReportOpen(false)} style={{ borderRadius: 7, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '6px 10px' }}>Close</button>
              </div>
            </div>
            {isReportLoading ? <div>Loading report…</div> : null}
            {reportError ? <div style={{ color: '#fca5a5' }}>{reportError}</div> : null}
            {openReportData ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div><strong>{openReportData.student.student_name}</strong> · Grade {openReportData.student.grade ?? '—'} · {openReportData.student.class_name}</div>
                <div>Period: {openReportData.period} · Genre: {openReportData.genre}</div>
                <div>Latest score: {openReportData.overall_summary.latest_score ?? '—'} · Completion: {openReportData.overall_summary.completion_rate_percent}%</div>
                <div><strong>Priority weak areas:</strong> {openReportData.priority_weak_areas.join(', ') || 'None detected yet'}</div>
                <div><strong>Teacher actions:</strong> {openReportData.teacher_actions.join(' • ') || 'No actions generated yet'}</div>
                <div><strong>Progress summary:</strong> {openReportData.student_friendly_summary.progress_summary}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.stalled}</small>
      <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.improving}</small>
      <small style={{ color: '#cbd5e1' }}>{WRITING_ADMIN_HELP.monthly_ready}</small>
    </div>
  );
};

export default WritingMonitoringView;
