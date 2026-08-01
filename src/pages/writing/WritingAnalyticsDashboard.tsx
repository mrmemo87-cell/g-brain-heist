import React, { useEffect, useMemo, useState } from 'react';
import {
  getTeacherAnalyticsDashboardScoped,
  getTeacherMonitoringOverviewScoped,
  getWritingAnalyticsDashboard,
  getWritingMonitoringOverview,
  type WritingAnalyticsDashboard as WritingAnalyticsDashboardShape,
  type WritingMonitoringOverview,
} from '../../lib/brains_heist/writingIntegrationService.js';
import type { SupportedGenre } from '../../lib/brains_heist/writingAssessment.js';

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

type MonitoringRow = WritingMonitoringOverview['student_rows'][number] & { class_name?: string | null };
type CollapseKey = 'overview' | 'classes' | 'students' | 'focus';
type InputChangeEvent = { target: { value: string } };

interface ClassAnalyticsGroup {
  key: string;
  classId: string | null;
  name: string;
  grade: number | null;
  rows: MonitoringRow[];
  monthSubmissions: number;
  allTimeSubmissions: number;
  focusAreas: Array<{ tag: string; count: number }>;
}

const WEAKNESS_LABEL_MAP: Record<string, string> = {
  grammar_accuracy: 'Grammar accuracy',
  vocabulary_range: 'Vocabulary range',
  paragraph_organisation: 'Paragraph organization',
  sentence_clarity: 'Sentence clarity',
  task_response: 'Task response',
  idea_development: 'Idea development',
  punctuation: 'Punctuation control',
  partial_content_coverage: 'Content development',
  weak_genre_convention: 'Genre conventions',
  run_on: 'Sentence boundaries',
  spelling_error: 'Spelling accuracy',
  agreement_error: 'Subject–verb agreement',
};

const isLikelyInternalId = (value?: string): boolean =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim()));

const toDisplayLabel = (studentName: string | undefined, studentId: string): string => {
  const name = studentName?.trim();
  if (name && !isLikelyInternalId(name)) return name;
  return !isLikelyInternalId(studentId) ? studentId : 'Student';
};

const toTeacherWeaknessLabel = (tag: string): string =>
  WEAKNESS_LABEL_MAP[tag] ?? tag
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getClassLabel = (row: MonitoringRow): string =>
  row.class_name?.trim() || `Grade ${row.current_grade}`;

const getAllTimeCount = (row: MonitoringRow): number =>
  row.all_time_submission_count ?? row.attempts_count ?? row.submission_count ?? 0;

const getMonthCount = (row: MonitoringRow): number => row.submission_count ?? 0;

const getStudentFocus = (
  row: MonitoringRow,
  analytics: WritingAnalyticsDashboardShape | null
): Array<{ tag: string; count: number }> => {
  const saved = row.focus_area_counts?.filter((item) => item.tag && item.count > 0) ?? [];
  if (saved.length > 0) return saved;
  const analyticsMatch = analytics?.student_weakness_counts?.find((item) => item.student_id === row.student_id);
  if (analyticsMatch?.tags.length) return analyticsMatch.tags;
  return row.repeated_weakness_hotspots.map((tag) => ({ tag, count: 1 }));
};

const getTeachingAction = (tag: string): string => {
  const normalized = tag.toLowerCase();
  if (normalized.includes('content') || normalized.includes('task_response')) return 'Model how to develop one idea with evidence and explanation.';
  if (normalized.includes('genre') || normalized.includes('register')) return 'Compare a strong genre model and annotate its audience, structure, and tone.';
  if (normalized.includes('run_on') || normalized.includes('sentence')) return 'Teach sentence boundaries, then revise one paragraph together.';
  if (normalized.includes('spell')) return 'Build a personal spelling list from the student’s own writing.';
  if (normalized.includes('agreement') || normalized.includes('grammar')) return 'Use a short edit–explain–rewrite cycle with examples from recent submissions.';
  if (normalized.includes('punctuation')) return 'Run a focused punctuation edit before the next full draft.';
  return 'Use one model, one guided example, and one independent rewrite for this focus area.';
};

const AnalyticsHeading = ({
  eyebrow,
  title,
  description,
  collapsed,
  onToggle,
}: {
  eyebrow: string;
  title: string;
  description: string;
  collapsed: boolean;
  onToggle: () => void;
}): React.ReactElement => (
  <header className="writing-analytics__section-heading">
    <div>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    <button type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}>
      <span aria-hidden="true">{collapsed ? '＋' : '−'}</span>
    </button>
  </header>
);

export const WritingAnalyticsDashboard = ({
  gradeFilter,
  genreFilter,
  isLoading = false,
  errorMessage,
}: WritingAnalyticsDashboardProps): React.ReactElement => {
  const isTestRuntime = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  const currentMonth = new Date().toISOString().slice(0, 7);
  const seededMonitoring = isTestRuntime ? getWritingMonitoringOverview(currentMonth) : null;
  const seededAnalytics = isTestRuntime ? getWritingAnalyticsDashboard({ grade: gradeFilter, genre: genreFilter }) : null;
  const [monitoring, setMonitoring] = useState<WritingMonitoringOverview | null>(
    seededAnalytics?.ok ? seededMonitoring?.data ?? null : null
  );
  const [analytics, setAnalytics] = useState<WritingAnalyticsDashboardShape | null>(seededAnalytics?.data ?? null);
  const [loadError, setLoadError] = useState('');
  const [collapsed, setCollapsed] = useState<Set<CollapseKey>>(() => new Set());
  const [selectedClassKey, setSelectedClassKey] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isTestRuntime) return;
    let cancelled = false;
    void Promise.allSettled([
      getTeacherMonitoringOverviewScoped(currentMonth, { grade: gradeFilter, genre: genreFilter }),
      getTeacherAnalyticsDashboardScoped(currentMonth, { grade: gradeFilter, genre: genreFilter }),
    ]).then(([monitorResult, analyticsResult]) => {
      if (cancelled) return;
      if (monitorResult.status === 'fulfilled' && monitorResult.value.ok && monitorResult.value.data) {
        setMonitoring(monitorResult.value.data);
        setLoadError('');
      } else {
        setLoadError('Writing evidence could not be loaded. Refresh this page or ask your school administrator for help.');
      }
      if (analyticsResult.status === 'fulfilled' && analyticsResult.value.ok && analyticsResult.value.data) {
        setAnalytics(analyticsResult.value.data);
      }
    });
    return () => { cancelled = true; };
  }, [currentMonth, gradeFilter, genreFilter, isTestRuntime]);

  const rows = useMemo(() => monitoring?.student_rows ?? [], [monitoring]);
  const classGroups = useMemo<ClassAnalyticsGroup[]>(() => {
    const byClass = new Map<string, MonitoringRow[]>();
    for (const row of rows) {
      const key = row.class_id ? `id:${row.class_id}` : `name:${getClassLabel(row).toLowerCase()}`;
      byClass.set(key, [...(byClass.get(key) ?? []), row]);
    }
    const groups: ClassAnalyticsGroup[] = [...byClass.entries()].map(([key, classRows]) => {
      const rosterClass = monitoring?.class_rows?.find((item) => item.class_id === classRows[0]?.class_id);
      const focusCounter = new Map<string, number>();
      for (const row of classRows) {
        for (const focus of getStudentFocus(row, analytics)) {
          focusCounter.set(focus.tag, (focusCounter.get(focus.tag) ?? 0) + focus.count);
        }
      }
      return {
        key,
        classId: classRows[0]?.class_id ?? null,
        name: rosterClass?.class_name || getClassLabel(classRows[0]),
        grade: rosterClass?.current_grade ?? classRows[0]?.current_grade ?? null,
        rows: [...classRows].sort((a, b) => toDisplayLabel(a.student_name, a.student_id).localeCompare(toDisplayLabel(b.student_name, b.student_id))),
        monthSubmissions: rosterClass?.submission_count ?? classRows.reduce((sum, row) => sum + getMonthCount(row), 0),
        allTimeSubmissions: rosterClass?.all_time_submission_count ?? classRows.reduce((sum, row) => sum + getAllTimeCount(row), 0),
        focusAreas: [...focusCounter.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
      };
    });
    for (const rosterClass of monitoring?.class_rows ?? []) {
      const key = `id:${rosterClass.class_id}`;
      if (groups.some((group) => group.key === key)) continue;
      groups.push({
        key,
        classId: rosterClass.class_id,
        name: rosterClass.class_name,
        grade: rosterClass.current_grade,
        rows: [],
        monthSubmissions: rosterClass.submission_count,
        allTimeSubmissions: rosterClass.all_time_submission_count,
        focusAreas: [],
      });
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }, [analytics, monitoring?.class_rows, rows]);

  const selectedClass = classGroups.find((group) => group.key === selectedClassKey) ?? null;
  const visibleStudents = useMemo(() => {
    const source = selectedClass?.rows ?? [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return source;
    return source.filter((row) => `${toDisplayLabel(row.student_name, row.student_id)} ${getStudentFocus(row, analytics).map((item) => item.tag).join(' ')}`.toLowerCase().includes(query));
  }, [analytics, searchQuery, selectedClass]);
  const selectedStudent = selectedClass?.rows.find((row) => row.student_id === selectedStudentId) ?? null;
  const selectedFocus = selectedStudent ? getStudentFocus(selectedStudent, analytics) : [];
  const allTimeSubmissions = rows.reduce((sum, row) => sum + getAllTimeCount(row), 0);
  const monthSubmissions = rows.reduce((sum, row) => sum + getMonthCount(row), 0);
  const uniqueFocusAreas = new Set(rows.flatMap((row) => getStudentFocus(row, analytics).map((item) => item.tag))).size;

  const toggle = (key: CollapseKey): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectClass = (group: ClassAnalyticsGroup): void => {
    setSelectedClassKey(group.key);
    setSelectedStudentId('');
    setSearchQuery('');
    setCollapsed((current) => new Set([...current, 'classes'].filter((key) => key !== 'students') as CollapseKey[]));
  };

  if (isLoading) return <div className="writing-analytics__state">Loading analytics…</div>;
  if (errorMessage) return <div className="writing-analytics__state is-error">Unable to load analytics. {errorMessage}</div>;
  if (loadError && !monitoring) return <div className="writing-analytics__state is-error">{loadError}</div>;
  if (!monitoring) return <div className="writing-analytics__state">No analytics data available for filters (grade: {gradeFilter ?? 'any'}, genre: {genreFilter ?? 'any'}).</div>;

  return (
    <main className="writing-analytics writing-teacher-surface">
      <span className="writing-analytics__sr-only">Writing Analytics Dashboard</span>
      <span className="writing-analytics__sr-only">Most Common Weak Areas</span>
      <span className="writing-analytics__sr-only">Recommended Actions</span>

      <section className="writing-analytics__hero">
        <div>
          <span>Writing intelligence</span>
          <h1>Class and student focus analysis</h1>
          <p>Start with the whole English roster, open a class, then use each student’s saved focus areas to plan the next lesson.</p>
        </div>
        <strong>Live evidence · {currentMonth}</strong>
      </section>

      {loadError ? <div className="writing-analytics__notice">Advanced calculations are refreshing. Roster evidence and saved focus areas remain available below.</div> : null}

      <section className="writing-analytics__section">
        <AnalyticsHeading eyebrow="Overview" title="School writing picture" description="A concise view of the English classes currently assigned to you." collapsed={collapsed.has('overview')} onToggle={() => toggle('overview')} />
        {!collapsed.has('overview') ? (
          <div className="writing-analytics__metrics">
            <article><span>Classes</span><strong>{classGroups.length}</strong><small>English rosters</small></article>
            <article><span>Students</span><strong>{rows.length}</strong><small>Current roster</small></article>
            <article><span>This month</span><strong>{monthSubmissions}</strong><small>Writing submissions</small></article>
            <article><span>All-time evidence</span><strong>{allTimeSubmissions}</strong><small>Saved submissions</small></article>
            <article><span>Focus areas</span><strong>{uniqueFocusAreas}</strong><small>Saved teaching priorities</small></article>
          </div>
        ) : null}
      </section>

      <section className="writing-analytics__section">
        <AnalyticsHeading eyebrow="Step 1" title="Choose a class" description="Open one class to see its writing volume and shared teaching priorities." collapsed={collapsed.has('classes')} onToggle={() => toggle('classes')} />
        {!collapsed.has('classes') ? (
          <div className="writing-analytics__class-grid">
            {classGroups.map((group) => (
              <button type="button" key={group.key} className={selectedClassKey === group.key ? 'is-selected' : ''} onClick={() => selectClass(group)}>
                <span><b>{group.name}</b><small>{group.grade == null ? 'Grade not recorded' : `Grade ${group.grade}`}</small></span>
                <span className="writing-analytics__card-metrics">
                  <span><strong>{group.rows.length}</strong><small>Students</small></span>
                  <span><strong>{group.monthSubmissions}</strong><small>This month</small></span>
                  <span><strong>{group.allTimeSubmissions}</strong><small>All time</small></span>
                </span>
                <span className="writing-analytics__chips">
                  {group.focusAreas.length > 0
                    ? group.focusAreas.slice(0, 3).map((item) => <i key={item.tag}>{toTeacherWeaknessLabel(item.tag)} · {item.count}</i>)
                    : <i className="is-neutral">More submissions needed for a shared pattern</i>}
                </span>
                <em>Open class analysis →</em>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {selectedClass ? (
        <section className="writing-analytics__section is-accent">
          <AnalyticsHeading eyebrow="Step 2" title={`Students in ${selectedClass.name}`} description="Choose a student to see the focus areas saved from all of their writing." collapsed={collapsed.has('students')} onToggle={() => toggle('students')} />
          {!collapsed.has('students') ? (
            <>
              <label className="writing-analytics__search">
                <span>Find a student or focus area</span>
                <input value={searchQuery} onChange={(event: InputChangeEvent) => setSearchQuery(event.target.value)} placeholder="Search this class…" />
              </label>
              <div className="writing-analytics__student-grid">
                {visibleStudents.map((row) => {
                  const focus = getStudentFocus(row, analytics);
                  return (
                    <button type="button" key={row.student_id} className={selectedStudentId === row.student_id ? 'is-selected' : ''} onClick={() => {
                      setSelectedStudentId(row.student_id);
                      setCollapsed((current) => new Set([...current, 'students'].filter((key) => key !== 'focus') as CollapseKey[]));
                    }}>
                      <span><b>{toDisplayLabel(row.student_name, row.student_id)}</b><small>Grade {row.current_grade} · {selectedClass.name}</small></span>
                      <span className="writing-analytics__card-metrics">
                        <span><strong>{row.latest_score == null ? '—' : `${row.latest_score}/20`}</strong><small>Latest score</small></span>
                        <span><strong>{getMonthCount(row)}</strong><small>This month</small></span>
                        <span><strong>{getAllTimeCount(row)}</strong><small>All time</small></span>
                      </span>
                      <span className="writing-analytics__chips">
                        {focus.length > 0 ? focus.slice(0, 3).map((item) => <i key={item.tag}>{toTeacherWeaknessLabel(item.tag)} · {item.count}</i>) : <i className="is-neutral">No stable focus area yet</i>}
                      </span>
                      <em>Open focus plan →</em>
                    </button>
                  );
                })}
                {visibleStudents.length === 0 ? <div className="writing-analytics__empty">No students match this search.</div> : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {selectedStudent ? (
        <section className="writing-analytics__section is-accent">
          <AnalyticsHeading eyebrow="Step 3" title={`${toDisplayLabel(selectedStudent.student_name, selectedStudent.student_id)} · focus plan`} description="These priorities come from focus tags saved with the student’s writing evidence." collapsed={collapsed.has('focus')} onToggle={() => toggle('focus')} />
          {!collapsed.has('focus') ? (
            selectedFocus.length > 0 ? (
              <div className="writing-analytics__focus-list">
                {selectedFocus.map((item, index) => (
                  <article key={item.tag}>
                    <span>{index + 1}</span>
                    <div><h3>{toTeacherWeaknessLabel(item.tag)}</h3><p>{getTeachingAction(item.tag)}</p></div>
                    <strong>{item.count}<small>saved {item.count === 1 ? 'signal' : 'signals'}</small></strong>
                  </article>
                ))}
              </div>
            ) : (
              <div className="writing-analytics__empty">Not enough saved evidence to identify a reliable focus area yet. The next complete writing submission will update this plan.</div>
            )
          ) : null}
        </section>
      ) : null}
    </main>
  );
};

export default WritingAnalyticsDashboard;
