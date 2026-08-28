import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchStudentAcademicConfidence,
  fetchStudentAcademicProfile,
  fetchStudentAcademicSubjects,
  formatLearningStatus,
  type StudentAcademicConfidence,
  type StudentAcademicProfile as StudentAcademicProfileData,
} from '../../services/studentAcademicProfileService';
import {
  getAcademicProgressExperienceContext,
  type AcademicProgressExperienceContext,
  type AcademicProgressViewerRole,
} from '../../services/academicProgressExperienceService';
import IndividualStudentAcademicReport from './IndividualStudentAcademicReportV2';
import { AcademicProgressHeader, normalizeAcademicSubjectOptions } from './AcademicProgressSuite';
import './StudentAcademicProfile.css';
import './StudentAcademicConfidence.css';
import './StudentAcademicProfileV2.css';
import './StudentAcademicProfileV2Enhancements.css';

interface StudentAcademicProfileProps {
  studentId?: string | null;
  initialSubject?: string | null;
  academicYearId?: string | null;
  academicYearName?: string | null;
  mode?: 'student' | 'teacher' | 'school_admin' | 'school_head';
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
  teacherName?: string | null;
  backLabel?: string;
  onClose?: () => void;
}

type TimelineItem = StudentAcademicProfileData['timeline'][number];
type FocusItem = StudentAcademicProfileData['focus_areas'][number];
type Correction = { original?: string; better_version?: string; issue?: string; tag?: string };
type TrendEvent = {
  key: string;
  observedAt: string;
  score: number;
  label: string;
  source: string;
  detail: string;
  focusCount: number;
  developingCount: number;
  strengthCount: number;
};
type TrendSeriesTone = 'general' | 'assignment' | 'writing';
type TrendSeries = {
  key: string;
  label: string;
  tone: TrendSeriesTone;
  events: TrendEvent[];
};
type TrendChart = { subject: string; series: TrendSeries[] };
type DisclosureTone = 'trend' | 'support' | 'progress' | 'evidence' | 'results' | 'method';

const scoreBand = (score: number | null) => score === null ? 'neutral' : score >= 80 ? 'strong' : score >= 60 ? 'developing' : 'focus';
const statusBand = (status: string) => status === 'persistent' ? 'critical' : ['insufficient_evidence', 'recurring', 'new_focus'].includes(status) ? 'focus' : status === 'improving' ? 'improving' : status === 'resolved' ? 'resolved' : 'strong';
const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const normalizeSubject = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^maths$/, 'mathematics');
const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const objectValue = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const textValue = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

const getCorrections = (item?: TimelineItem | null): Correction[] => {
  if (!item || !Array.isArray(item.evidence?.corrections)) return [];
  return item.evidence.corrections.map((entry) => objectValue(entry)).map((entry) => ({
    original: textValue(entry.original) || undefined,
    better_version: textValue(entry.better_version) || undefined,
    issue: textValue(entry.issue) || undefined,
    tag: textValue(entry.tag) || undefined,
  })).filter((entry) => entry.original || entry.better_version || entry.issue);
};

const sourceMeta = (item: TimelineItem) => {
  const evidence = objectValue(item.evidence);
  if (item.source_type === 'assignment_result') {
    return { label: 'Assignment', detail: textValue(evidence.assignment_title) || 'School assignment', tone: 'assignment' };
  }
  if (item.source_type === 'writing_attempt') {
    const genre = textValue(evidence.genre);
    return { label: genre ? titleCase(genre) : 'Writing', detail: 'Writing Hub', tone: 'writing' };
  }
  if (item.source_type === 'teacher_observation') return { label: 'Teacher note', detail: 'Teacher observation', tone: 'teacher' };
  if (item.source_type === 'import') return { label: 'School record', detail: 'Imported school evidence', tone: 'school' };
  return { label: 'School evidence', detail: item.source_type, tone: 'school' };
};

const evidenceExplanation = (item: TimelineItem) => {
  const corrections = getCorrections(item);
  if (corrections[0]?.issue) return corrections[0].issue;
  const evidence = objectValue(item.evidence);
  const justification = textValue(evidence.justification);
  if (justification) return justification;
  const improvement = textValue(evidence.improvement_action);
  if (improvement) return improvement;
  const objective = textValue(evidence.objective);
  if (objective) return objective;
  if (item.observation_type === 'focus') return `This assessed work shows that ${item.subskill || item.skill} needs more support.`;
  if (item.observation_type === 'strength') return `This assessed work shows secure performance in ${item.subskill || item.skill}.`;
  return `This assessed work shows developing performance in ${item.subskill || item.skill}.`;
};

const observationSignal = (item: TimelineItem) => {
  const pct = item.evidence_percentage == null ? null : Number(item.evidence_percentage);
  const bounded = pct == null || Number.isNaN(pct) ? null : Math.max(0, Math.min(100, pct));
  if (item.observation_type === 'focus') return bounded == null ? 28 : 16 + bounded * 0.24;
  if (item.observation_type === 'strength') return bounded == null ? 90 : 80 + bounded * 0.16;
  return bounded == null ? 62 : 48 + bounded * 0.24;
};

const trendPositionLabel = (score: number) => score >= 78 ? 'Strong evidence' : score >= 46 ? 'Developing evidence' : 'Needs support';
const evidenceBandClass = (score: number) => score >= 78 ? 'strong' : score >= 46 ? 'developing' : 'support';

const buildTrendEvents = (items: TimelineItem[], subject: string, sourceType?: TimelineItem['source_type']): TrendEvent[] => {
  const groups = new Map<string, {
    values: number[];
    observedAt: string;
    label: string;
    source: string;
    detail: string;
    focusCount: number;
    developingCount: number;
    strengthCount: number;
  }>();
  items.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)
    && (!sourceType || item.source_type === sourceType)).forEach((item) => {
    const meta = sourceMeta(item);
    const key = `${item.source_type}:${item.source_id || item.observed_at}`;
    const group = groups.get(key) || {
      values: [],
      observedAt: item.observed_at,
      label: item.subskill || item.skill,
      source: meta.label,
      detail: meta.detail,
      focusCount: 0,
      developingCount: 0,
      strengthCount: 0,
    };
    group.values.push(observationSignal(item));
    if (item.observation_type === 'focus') group.focusCount += 1;
    else if (item.observation_type === 'strength') group.strengthCount += 1;
    else group.developingCount += 1;
    if (item.observed_at > group.observedAt) group.observedAt = item.observed_at;
    groups.set(key, group);
  });
  return [...groups.entries()].map(([key, group]) => ({
    key,
    observedAt: group.observedAt,
    score: Math.round(group.values.reduce((sum, value) => sum + value, 0) / Math.max(group.values.length, 1)),
    label: group.label,
    source: group.source,
    detail: group.detail,
    focusCount: group.focusCount,
    developingCount: group.developingCount,
    strengthCount: group.strengthCount,
  })).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
};

const ProfileDisclosure: React.FC<{
  tone: DisclosureTone;
  eyebrow: string;
  title: string;
  description: string;
  meta?: string;
  children: React.ReactNode;
}> = ({ tone, eyebrow, title, description, meta, children }) => (
  <details className={`sap-panel sap-collapsible-panel sap-profile-disclosure sap-profile-disclosure--${tone}`}>
    <summary className="sap-collapsible-summary">
      <div className="sap-disclosure-title">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="sap-disclosure-controls">
        {meta ? <small>{meta}</small> : null}
        <b className="sap-collapse-action"><span className="when-closed">Open</span><span className="when-open">Close</span></b>
      </div>
    </summary>
    <div className="sap-collapsible-content">{children}</div>
  </details>
);

const SubjectTrendChart: React.FC<{ subject: string; series: TrendSeries[] }> = ({ subject, series }) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const width = 620;
  const height = 210;
  const left = 88;
  const right = 24;
  const top = 20;
  const bottom = 36;
  const usableWidth = width - left - right;
  const usableHeight = height - top - bottom;
  const yAt = (value: number) => top + ((100 - value) / 100) * usableHeight;
  const activeSeries = series.filter((item) => item.events.length > 0);
  const allEvents = activeSeries.flatMap((item) => item.events.map((event) => ({ series: item, event })))
    .sort((a, b) => a.event.observedAt.localeCompare(b.event.observedAt));
  const validTimes = allEvents.map(({ event }) => Date.parse(event.observedAt)).filter(Number.isFinite);
  const minTime = validTimes.length ? Math.min(...validTimes) : 0;
  const maxTime = validTimes.length ? Math.max(...validTimes) : 0;
  const xAt = (event: TrendEvent, fallbackIndex = 0, fallbackCount = 1) => {
    const time = Date.parse(event.observedAt);
    if (Number.isFinite(time) && maxTime > minTime) return left + ((time - minTime) / (maxTime - minTime)) * usableWidth;
    return fallbackCount <= 1 ? left + usableWidth / 2 : left + (fallbackIndex / (fallbackCount - 1)) * usableWidth;
  };
  const plottedPoints = activeSeries.flatMap((trendSeries) => trendSeries.events.map((event, index) => ({
    key: `${trendSeries.key}:${event.key}`,
    series: trendSeries,
    event,
    x: xAt(event, index, trendSeries.events.length),
    y: yAt(event.score),
  })));
  const overallDelta = allEvents.length > 1 ? allEvents[allEvents.length - 1].event.score - allEvents[0].event.score : 0;
  const trendText = allEvents.length === 0
    ? 'No evidence in this period'
    : allEvents.length < 2
      ? 'One evidence point so far'
      : overallDelta >= 10
        ? 'Overall evidence is moving up'
        : overallDelta <= -10
          ? 'Recent evidence needs attention'
          : 'Overall evidence is broadly steady';
  const activePoint = activeKey ? plottedPoints.find((point) => point.key === activeKey) || null : null;
  const activeSeriesIndex = activePoint ? activePoint.series.events.findIndex((event) => event.key === activePoint.event.key) : -1;
  const previousEvent = activePoint && activeSeriesIndex > 0 ? activePoint.series.events[activeSeriesIndex - 1] : null;
  const pointDelta = activePoint && previousEvent ? activePoint.event.score - previousEvent.score : null;
  const xPercent = activePoint ? (activePoint.x / width) * 100 : 50;
  const yPercent = activePoint ? (activePoint.y / height) * 100 : 50;
  const horizontalEdge = xPercent < 28 ? 'left' : xPercent > 72 ? 'right' : 'center';
  const verticalEdge = yPercent < 38 ? 'below' : 'above';
  const firstEvent = allEvents[0]?.event || null;
  const lastEvent = allEvents[allEvents.length - 1]?.event || null;

  return <article className="sap-trend-card">
    <header>
      <div><span className="sap-trend-eyebrow">Subject trend</span><h3>{subject}</h3></div>
      <strong>{trendText}</strong>
    </header>
    {activeSeries.length > 1 ? <div className="sap-trend-legend" aria-label={`${subject} evidence sources`}>
      {activeSeries.map((trendSeries) => <span key={trendSeries.key} className={`sap-trend-legend-item sap-trend-legend-item--${trendSeries.tone}`}><i aria-hidden="true"/>{trendSeries.label}</span>)}
    </div> : null}
    {allEvents.length ? <>
      <div className="sap-trend-chart-wrap">
        <svg className="sap-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${subject} learning evidence trend over the selected period`}>
          {[25, 60, 90].map((value) => <g key={value}><line x1={left} y1={yAt(value)} x2={width - right} y2={yAt(value)} className="sap-trend-guide"/><text x={left - 10} y={yAt(value) + 4} textAnchor="end" className="sap-trend-axis">{value === 25 ? 'Needs support' : value === 60 ? 'Developing' : 'Strong'}</text></g>)}
          {activeSeries.map((trendSeries) => trendSeries.events.length > 1 ? <polyline
            key={`${trendSeries.key}:line`}
            points={trendSeries.events.map((event, index) => `${xAt(event, index, trendSeries.events.length)},${yAt(event.score)}`).join(' ')}
            className={`sap-trend-line sap-trend-line--${trendSeries.tone}`}
          /> : null)}
          {plottedPoints.map((point) => <circle
            key={point.key}
            cx={point.x}
            cy={point.y}
            r="6"
            className={`sap-trend-point sap-trend-point--${point.series.tone}`}
            tabIndex={0}
            aria-label={`${formatDate(point.event.observedAt)}, ${point.series.label}, ${point.event.detail}, ${point.event.label}, ${trendPositionLabel(point.event.score)}`}
            onMouseEnter={() => setActiveKey(point.key)}
            onMouseLeave={() => setActiveKey(null)}
            onFocus={() => setActiveKey(point.key)}
            onBlur={() => setActiveKey(null)}
            onClick={() => setActiveKey((current) => current === point.key ? null : point.key)}
          />)}
          {firstEvent ? <text x={left} y={height - 8} className="sap-trend-date">{formatDate(firstEvent.observedAt)}</text> : null}
          {lastEvent ? <text x={width - right} y={height - 8} textAnchor="end" className="sap-trend-date">{formatDate(lastEvent.observedAt)}</text> : null}
        </svg>
        {activePoint ? <div
          className={`sap-trend-tooltip sap-trend-tooltip--${horizontalEdge} sap-trend-tooltip--${verticalEdge} sap-trend-tooltip--series-${activePoint.series.tone}`}
          role="status"
          style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
        >
          <div className="sap-trend-tooltip-head"><strong>{formatDate(activePoint.event.observedAt)}</strong><span className={`sap-trend-source-pill sap-trend-source-pill--${activePoint.series.tone}`}>{activePoint.series.label}</span></div>
          <b>{activePoint.event.detail}</b>
          <p className="sap-trend-tooltip-skill">{activePoint.event.label}</p>
          <div className="sap-trend-tooltip-position"><span>Evidence position</span><strong className={`sap-evidence-position sap-evidence-position--${evidenceBandClass(activePoint.event.score)}`}>{trendPositionLabel(activePoint.event.score)}</strong>{pointDelta == null ? null : <em className={pointDelta >= 0 ? 'is-up' : 'is-down'}>{pointDelta >= 0 ? '↑' : '↓'} {Math.abs(pointDelta)} from previous {activePoint.series.label.toLowerCase()} activity</em>}</div>
          <div className="sap-trend-evidence-mix" aria-label="Evidence mix">
            <span className="is-support"><i aria-hidden="true"/><span>Needs support</span><b>{activePoint.event.focusCount}</b></span>
            <span className="is-developing"><i aria-hidden="true"/><span>Developing</span><b>{activePoint.event.developingCount}</b></span>
            <span className="is-strength"><i aria-hidden="true"/><span>Strength</span><b>{activePoint.event.strengthCount}</b></span>
          </div>
        </div> : null}
      </div>
      <small>Hover, focus or tap a point for detail. English uses separate source colours so assignment evidence and Writing Hub evidence stay distinct while sharing one timeline.</small>
    </> : <div className="sap-empty">No assessed evidence in this period.</div>}
  </article>;
};

const StudentAcademicProfileV2: React.FC<StudentAcademicProfileProps> = ({
  studentId,
  initialSubject,
  academicYearId,
  academicYearName,
  mode = 'teacher',
  schoolName,
  schoolLogoUrl,
  teacherName,
  backLabel,
  onClose,
}) => {
  const [profile, setProfile] = useState<StudentAcademicProfileData | null>(null);
  const [confidence, setConfidence] = useState<StudentAcademicConfidence | null>(null);
  const [context, setContext] = useState<AcademicProgressExperienceContext | null>(null);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>(initialSubject || 'all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const nextProfile = await fetchStudentAcademicProfile({
          studentId,
          subject: subject === 'all' ? null : subject,
          academicYearId: academicYearId ?? null,
          dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : null,
          dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : null,
        });
        if (!cancelled) setProfile(nextProfile);
      } catch (err) {
        console.error('Failed to load student academic profile', err);
        if (!cancelled) setError('The student progress record could not be loaded. Please check your access and try again.');
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [studentId, subject, academicYearId, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    const loadContext = async () => {
      const [contextResult, confidenceResult, subjectsResult] = await Promise.allSettled([
        getAcademicProgressExperienceContext(studentId),
        fetchStudentAcademicConfidence(studentId, academicYearId),
        fetchStudentAcademicSubjects(studentId),
      ]);
      if (cancelled) return;
      setContext(contextResult.status === 'fulfilled' ? contextResult.value : null);
      setConfidence(confidenceResult.status === 'fulfilled' ? confidenceResult.value : null);
      setAvailableSubjects(subjectsResult.status === 'fulfilled' ? subjectsResult.value.map((item) => item.name) : []);
    };
    void loadContext();
    return () => { cancelled = true; };
  }, [studentId, academicYearId]);

  useEffect(() => {
    if (!academicYearId || !profile) return;
    setAvailableSubjects(profile.subjects.map((item) => item.subject));
  }, [academicYearId, profile]);

  const allSubjects = useMemo(() => {
    const values: string[] = [];
    profile?.subjects.forEach((entry) => values.push(entry.subject));
    profile?.timeline.forEach((entry) => values.push(entry.subject));
    profile?.scope.allowed_subjects.forEach((entry) => values.push(entry));
    availableSubjects.forEach((entry) => values.push(entry));
    return normalizeAcademicSubjectOptions(values);
  }, [availableSubjects, profile]);

  useEffect(() => {
    if (subject === 'all') return;
    const canonical = allSubjects.find((name) => normalizeSubject(name) === normalizeSubject(subject));
    if (canonical && canonical !== subject) setSubject(canonical);
  }, [allSubjects, subject]);

  const currentFocus = useMemo(() => profile?.focus_areas.filter((item) => ['insufficient_evidence', 'new_focus', 'recurring', 'persistent'].includes(String(item.status))) ?? [], [profile]);
  const strengths = useMemo(() => profile?.focus_areas.filter((item) => ['emerging_strength', 'consistent_strength'].includes(String(item.status))) ?? [], [profile]);
  const improving = useMemo(() => profile?.focus_areas.filter((item) => item.status === 'improving') ?? [], [profile]);
  const resolved = useMemo(() => profile?.focus_areas.filter((item) => item.status === 'resolved') ?? [], [profile]);

  const latestTimelineForFocus = useMemo(() => {
    const map = new Map<string, TimelineItem>();
    const keyFor = (item: { subject: string; skill: string; subskill?: string | null }) => `${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`;
    [...(profile?.timeline || [])].sort((a, b) => b.observed_at.localeCompare(a.observed_at)).forEach((item) => {
      const key = keyFor(item);
      if (!map.has(key)) map.set(key, item);
    });
    return map;
  }, [profile]);

  const trendSubjects = useMemo<TrendChart[]>(() => {
    if (!profile) return [];
    const subjects = subject === 'all' ? allSubjects : [subject];
    return subjects.flatMap((name) => {
      const subjectExists = profile.subjects.some((row) => normalizeSubject(row.subject) === normalizeSubject(name));
      if (normalizeSubject(name) === 'english') {
        const assignmentEvents = buildTrendEvents(profile.timeline, name, 'assignment_result');
        const writingEvents = buildTrendEvents(profile.timeline, name, 'writing_attempt');
        const seriesCandidates: TrendSeries[] = [
          { key: 'assignments', label: 'Assignments', tone: 'assignment', events: assignmentEvents },
          { key: 'writing-hub', label: 'Writing Hub', tone: 'writing', events: writingEvents },
        ];
        const series = seriesCandidates.filter((item) => item.events.length > 0);
        if (!series.length && subjectExists) series.push({ key: 'english', label: 'English evidence', tone: 'general', events: [] });
        return series.length || subjectExists ? [{ subject: name, series }] : [];
      }
      const events = buildTrendEvents(profile.timeline, name);
      return events.length > 0 || subjectExists ? [{ subject: name, series: [{ key: 'evidence', label: 'Learning evidence', tone: 'general', events }] }] : [];
    });
  }, [allSubjects, profile, subject]);

  const latestConfidenceStates = useMemo(() => {
    const latest = new Map<string, StudentAcademicConfidence['confidenceStates'][number]>();
    confidence?.confidenceStates.forEach((item) => {
      const current = latest.get(item.skillKey);
      if (!current || String(item.computedAt || '') > String(current.computedAt || '')) latest.set(item.skillKey, item);
    });
    return [...latest.values()].filter((item) => subject === 'all' || normalizeSubject(item.subject) === normalizeSubject(subject));
  }, [confidence, subject]);

  if (loading) return <section className="sap-shell sap-state"><div className="sap-loader"/><strong>Preparing student progress…</strong><span>Combining assignments, writing and progress over time.</span></section>;
  if (error || !profile) return <section className="sap-shell sap-state sap-state--error"><strong>Student progress unavailable</strong><span>{error || 'No progress data was returned.'}</span>{onClose ? <button type="button" onClick={onClose}>Back</button> : null}</section>;

  const viewerRole = (context?.viewer.role || profile.scope.viewer || mode) as AcademicProgressViewerRole;
  const resolvedContext: AcademicProgressExperienceContext = context || {
    viewer: { id: '', name: teacherName || '', role: viewerRole },
    school: { id: profile.student.school_id || '', name: schoolName || 'Brains Heist', logo_url: schoolLogoUrl || null },
  };
  const canGenerateReport = ['teacher', 'school_admin', 'school_head'].includes(viewerRole);
  const resolvedSchoolName = context?.school.name || schoolName || undefined;
  const resolvedSchoolLogo = context?.school.logo_url || schoolLogoUrl || undefined;
  const preparedBy = context?.viewer.name || teacherName || undefined;
  const archivedYear = profile.scope.archived === true;
  const profileYearLabel = profile.scope.academic_year_name || academicYearName || null;
  const supportCount = profile.summary.persistent_focus_count + profile.summary.recurring_focus_count;
  const formatStatus = (item: FocusItem) => String(item.status) === 'insufficient_evidence' ? 'New support signal' : formatLearningStatus(item.status);

  return <section className="sap-shell sap-school-language">
    <AcademicProgressHeader
      context={resolvedContext}
      eyebrow="Student Academic Profile"
      title={profile.student.name}
      subtitle={[profile.student.grade ? `Grade ${profile.student.grade}` : null, profile.student.class_name ? `Class ${profile.student.class_name}` : null, 'A clear record of results, support needs and progress'].filter(Boolean).join(' · ')}
      onBack={onClose}
      backLabel={backLabel}
      actions={canGenerateReport && !archivedYear ? <button type="button" className="aps-primary-button" onClick={() => setShowReport(true)}>Generate individual report</button> : null}
    />

    {profileYearLabel ? <div className="aps-scope-note"><strong>{profileYearLabel}</strong> · {archivedYear ? 'Archived · read only. Historical evidence and placement are frozen to this school year.' : 'Current academic year · live evidence.'}</div> : null}

    <div className="sap-filterbar" aria-label="Progress record filters">
      <label>Subject<select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="all">All subjects</option>{allSubjects.map((name) => <option key={name.toLocaleLowerCase()} value={name}>{name}</option>)}</select></label>
      <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
      <label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
      <span className="sap-scope-note">{profile.scope.viewer === 'teacher' ? 'Showing the subjects you teach this student.' : 'Showing authorised school learning evidence.'}</span>
    </div>

    <div className="sap-kpis">
      <article><span>Assignment average</span><strong className={`sap-score sap-score--${scoreBand(profile.summary.assignment_average)}`}>{profile.summary.assignment_average === null ? '—' : `${profile.summary.assignment_average}%`}</strong><small>{profile.summary.completed_assignments} completed</small></article>
      <article><span>Needs support</span><strong>{supportCount}</strong><small>{profile.summary.persistent_focus_count} long-running</small></article>
      <article><span>Making progress</span><strong className="sap-positive">{profile.summary.improving_count}</strong><small>Moving in the right direction</small></article>
      <article><span>Now secure</span><strong className="sap-positive">{profile.summary.resolved_count}</strong><small>Previous needs resolved</small></article>
      <article><span>Strengths</span><strong className="sap-positive">{profile.summary.strength_count}</strong><small>Positive evidence</small></article>
    </div>

    <section className="sap-panel sap-overview-panel">
      <div className="sap-panel-heading sap-heading-simple"><div><span>Main overview</span><h2>Subject picture</h2></div><p>Results and current learning needs for the selected period.</p></div>
      <div className="sap-subject-grid">{profile.subjects.map((entry) => {
        const subjectFocus = currentFocus.filter((item) => normalizeSubject(item.subject) === normalizeSubject(entry.subject)).length;
        return <article key={entry.subject} className="sap-subject-card"><div><h3>{entry.subject}</h3><span>{entry.completed_assignments} completed</span></div><strong className={`sap-score sap-score--${scoreBand(entry.assignment_average)}`}>{entry.assignment_average === null ? 'Not assessed' : `${entry.assignment_average}%`}</strong><dl><div><dt>Needs support</dt><dd>{subjectFocus}</dd></div><div><dt>Improving</dt><dd>{entry.improving_count}</dd></div><div><dt>Secure</dt><dd>{entry.resolved_count}</dd></div><div><dt>Strengths</dt><dd>{entry.strength_count}</dd></div></dl><small>Latest evidence {formatDate(entry.latest_evidence_at)}</small></article>;
      })}{!profile.subjects.length ? <div className="sap-empty">No subject evidence is available in the selected period.</div> : null}</div>
    </section>

    <ProfileDisclosure tone="trend" eyebrow="Learning trends" title="How is the student moving over time?" description="One timeline per subject. English combines assignments and Writing Hub as separate colour-coded evidence streams." meta={`${trendSubjects.length} subject trend${trendSubjects.length === 1 ? '' : 's'}`}>
      <div className="sap-trend-grid">{trendSubjects.map((entry) => <SubjectTrendChart key={entry.subject} subject={entry.subject} series={entry.series}/>)}</div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="support" eyebrow="Priority support" title="What should we work on?" description="Current learning needs with the latest supporting evidence, kept separate from the detailed activity log." meta={`${currentFocus.length} active area${currentFocus.length === 1 ? '' : 's'}`}>
      <div className="sap-focus-list sap-focus-list--clear">{currentFocus.map((item) => {
        const key = `${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`;
        const evidence = latestTimelineForFocus.get(key);
        const correction = getCorrections(evidence)[0];
        return <article key={item.skill_key}><div className="sap-focus-main"><span className={`sap-status sap-status--${statusBand(String(item.status))}`}>{formatStatus(item)}</span><h3>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</h3><p>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</p>{evidence ? <small className="sap-focus-explain">{evidenceExplanation(evidence)}</small> : null}{correction && (correction.original || correction.better_version) ? <div className="sap-example"><span>Example</span><del>{correction.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{correction.better_version || 'Correction'}</ins></div> : null}</div><dl><div><dt>First seen</dt><dd>{formatDate(item.first_observed_at)}</dd></div><div><dt>Latest</dt><dd>{formatDate(item.last_observed_at)}</dd></div><div><dt>Evidence</dt><dd>{item.evidence_items}</dd></div><div><dt>Latest result</dt><dd>{item.latest_evidence_percentage == null ? '—' : `${item.latest_evidence_percentage}%`}</dd></div></dl></article>;
      })}{!currentFocus.length ? <div className="sap-empty">No current support needs are identified in this period.</div> : null}</div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="progress" eyebrow="Positive movement" title="Progress and strengths" description="A concise view of areas that are improving, secure or consistently strong." meta={`${improving.length + resolved.length + strengths.length} positive signal${improving.length + resolved.length + strengths.length === 1 ? '' : 's'}`}>
      <div className="sap-progress-columns"><div><h3>Making progress</h3>{improving.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</strong><span>{item.subject}</span></p>)}{!improving.length ? <small>No improving areas yet.</small> : null}</div><div><h3>Now secure</h3>{resolved.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}{!resolved.length ? <small>No resolved areas yet.</small> : null}</div><div><h3>Strengths</h3>{strengths.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}{!strengths.length ? <small>No established strengths yet.</small> : null}</div></div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="evidence" eyebrow="Detailed evidence" title="Evidence activity" description="Chronological source evidence for deeper review. This stays closed until detail is needed." meta={`${profile.timeline.length} record${profile.timeline.length === 1 ? '' : 's'}`}>
      <div className="sap-evidence-list">{profile.timeline.slice(0, 60).map((item) => {
        const meta = sourceMeta(item);
        const corrections = getCorrections(item);
        const firstCorrection = corrections[0];
        const evidence = objectValue(item.evidence);
        const improvementAction = textValue(evidence.improvement_action);
        return <article key={item.id} className={`sap-evidence-card sap-evidence-card--${item.observation_type}`}>
          <div className="sap-evidence-top"><span className={`sap-source-badge sap-source-badge--${meta.tone}`}>{meta.label}</span><time>{formatDate(item.observed_at)}</time></div>
          <div className="sap-evidence-heading"><div><h3>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</h3><span>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</span></div><span className={`sap-status sap-status--${item.observation_type === 'focus' ? 'focus' : item.observation_type === 'strength' ? 'strong' : 'improving'}`}>{item.observation_type === 'focus' ? 'Needs support' : item.observation_type === 'strength' ? 'Strength' : 'Developing'}</span></div>
          <p className="sap-evidence-explanation">{evidenceExplanation(item)}</p>
          {firstCorrection && (firstCorrection.original || firstCorrection.better_version) ? <div className="sap-example sap-example--wide"><span>From the student's work</span><del>{firstCorrection.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{firstCorrection.better_version || 'Correction'}</ins></div> : null}
          {improvementAction ? <p className="sap-next-step"><strong>Helpful next step:</strong> {improvementAction}</p> : null}
          <div className="sap-evidence-meta"><span>{meta.detail}</span>{item.evidence_count ? <span>{item.evidence_count} evidence item{item.evidence_count === 1 ? '' : 's'}</span> : null}{item.evidence_percentage == null ? null : <span>{item.evidence_percentage}%</span>}</div>
          {(corrections.length > 1 || textValue(evidence.objective)) ? <details className="sap-mini-disclosure"><summary>More evidence <span aria-hidden="true">+</span></summary><div>{corrections.slice(1).map((correction, index) => <div className="sap-example sap-example--wide" key={`${correction.original}-${index}`}><del>{correction.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{correction.better_version || 'Correction'}</ins>{correction.issue ? <small>{correction.issue}</small> : null}</div>)}{textValue(evidence.objective) ? <p><strong>Curriculum focus:</strong> {textValue(evidence.objective)}</p> : null}</div></details> : null}
        </article>;
      })}{!profile.timeline.length ? <div className="sap-empty">No learning evidence is available in this period.</div> : null}</div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="results" eyebrow="Assessment record" title="Assignment results" description="Completed assignment outcomes for the selected period." meta={`${profile.assignments.length} completed`}>
      <div className="sap-table-wrap"><table className="sap-table"><thead><tr><th>Date</th><th>Subject</th><th>Assignment</th><th>Topic</th><th>Correct</th><th>Result</th></tr></thead><tbody>{profile.assignments.map((item) => <tr key={`${item.assignment_id}:${item.completed_at}`}><td>{formatDate(item.completed_at)}</td><td>{item.subject}</td><td><strong>{item.title}</strong></td><td>{item.topic || '—'}</td><td>{item.correct}/{item.correct + item.incorrect}</td><td><span className={`sap-score-chip sap-score-chip--${scoreBand(item.accuracy)}`}>{item.accuracy}%</span></td></tr>)}</tbody></table>{!profile.assignments.length ? <div className="sap-empty">No completed assignments in this period.</div> : null}</div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="method" eyebrow="Reporting method" title="How this profile works" description="Definitions, confidence and governed reporting terminology." meta="Reference">
      <div className="sap-glossary"><div><strong>New focus</strong><span>A recent assessed need. It is visible early, but is not called persistent yet.</span></div><div><strong>Recurring</strong><span>The same need has appeared more than once.</span></div><div><strong>Persistent</strong><span>A repeated need supported by enough evidence over time.</span></div><div><strong>Improving</strong><span>Later assessed work is moving in the right direction.</span></div><div><strong>Resolved</strong><span>Later evidence shows the previous need is now secure.</span></div><div><strong>Confidence</strong><span>How complete, recent and consistent the evidence is. It is not a mark.</span></div></div>
      {latestConfidenceStates.length ? <div className="sap-confidence-summary" aria-label="Evidence confidence summary"><span><strong>{latestConfidenceStates.filter((item) => item.assessmentState === 'assessed').length}</strong> well-evidenced skills</span><span><strong>{latestConfidenceStates.filter((item) => ['not_assessed', 'low_data'].includes(item.assessmentState)).length}</strong> need more evidence</span><span><strong>{latestConfidenceStates.filter((item) => item.assessmentState === 'stale').length}</strong> need newer evidence</span><span><strong>{latestConfidenceStates.filter((item) => item.teacherReviewRequired).length}</strong> need teacher review</span></div> : <p>No confidence details are available yet.</p>}
      <div className="sap-technical-summary"><strong>Technical reporting terminology</strong><p><b>Qualified evidence:</b> assessed evidence that meets the system's quality rules. <b>Coverage:</b> how much of the mapped curriculum has been assessed. <b>Reporting readiness:</b> whether there is enough governed evidence for higher-confidence reporting. <b>Contradictory evidence:</b> recent evidence that points in different directions and may need teacher review.</p></div>
    </ProfileDisclosure>

    {showReport ? <IndividualStudentAcademicReport profile={profile} schoolName={resolvedSchoolName} schoolLogoUrl={resolvedSchoolLogo} teacherName={preparedBy} onClose={() => setShowReport(false)} /> : null}
  </section>;
};

export default StudentAcademicProfileV2;
