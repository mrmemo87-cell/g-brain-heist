import { aggregateAssessmentEvidence, assessmentKey, assessmentResultLabel, assessmentSnapshot } from './academicAssessmentEvidence';
import { academicProfileSubjectName, isAcademicAssignmentSource } from '../../services/studentAcademicProfileService';
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
import {
  calendarDayKey,
  comparableTrendSegments,
  focusStatusLabel,
  isActiveSupportStatus,
  isEvidenceToConfirmStatus,
  isTeacherReviewStatus,
  reportingStatusTone,
  summarizeComparableTrend,
} from './academicReportingSemantics';
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
  comparableKey: string;
  label: string;
  source: string;
  detail: string;
  focusCount: number;
  developingCount: number;
  strengthCount: number;
  result: string;
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
const statusBand = (status: FocusItem['status'], latestType?: TimelineItem['observation_type'] | null) => reportingStatusTone(status, latestType);
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
  if (isAcademicAssignmentSource(item.source_type)) {
    return { label: 'Assignment', detail: textValue(evidence.assignment_title) || 'School assignment', tone: 'assignment' };
  }
  if (item.source_type === 'writing_attempt' || item.source_type === 'writing_assessment_review') {
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
  const focus = textValue(evidence.evidence_focus_name);
  if (focus) return `${focus}: ${assessmentResultLabel(item)} in this assessment.`;
  const statement = textValue(evidence.evidence_statement);
  if (statement) return statement;
  const objective = textValue(evidence.objective);
  if (objective) return objective;
  if (item.observation_type === 'focus') return `This assessed work shows that ${item.subskill || item.skill} needs more support.`;
  if (item.observation_type === 'strength') return `This assessed work provides positive evidence in ${item.subskill || item.skill}. More evidence may still be needed before this becomes an established strength.`;
  return `This assessed work shows developing performance in ${item.subskill || item.skill}.`;
};

const observationSignal = (item: TimelineItem) => {
  const pct = item.evidence_percentage == null ? null : Number(item.evidence_percentage);
  const bounded = pct == null || Number.isNaN(pct) ? null : Math.max(0, Math.min(100, pct));
  if (bounded != null) return bounded;
  if (item.observation_type === 'focus') return 30;
  if (item.observation_type === 'strength') return 90;
  return 65;
};

const trendPositionLabel = (score: number) => score >= 80 ? 'Strong evidence' : score >= 60 ? 'Developing evidence' : 'Needs support';
const evidenceBandClass = (score: number) => score >= 80 ? 'strong' : score >= 60 ? 'developing' : 'support';

const buildTrendEvents = (items: TimelineItem[], subject: string, sourceType?: TimelineItem['source_type']): TrendEvent[] => {
  const groups = new Map<string, {
    values: number[];
    comparableKey: string;
    observedAt: string;
    label: string;
    source: string;
    detail: string;
    focusCount: number;
    developingCount: number;
    strengthCount: number;
    result: string;
  }>();
  items.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)
    && item.evidence_percentage != null
    && (!sourceType || (sourceType === 'assignment_result' ? isAcademicAssignmentSource(item.source_type) : item.source_type === sourceType))).forEach((item) => {
    const meta = sourceMeta(item);
    const comparableKey = `${item.source_type}|${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}|${String(item.evidence?.focus_signature || '')}`;
    const key = `${item.source_type}:${item.source_id || item.observed_at}:${comparableKey}`;
    const group = groups.get(key) || {
      values: [],
      result: assessmentResultLabel(item),
      comparableKey,
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
    comparableKey: group.comparableKey,
    label: group.label,
    source: group.source,
    detail: group.detail,
    focusCount: group.focusCount,
    developingCount: group.developingCount,
    strengthCount: group.strengthCount,
    result: group.result,
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
  const trendText = summarizeComparableTrend(allEvents.map(({ event }) => ({
    observedAt: event.observedAt,
    score: event.score,
    comparableKey: event.comparableKey,
  })));
  const activePoint = activeKey ? plottedPoints.find((point) => point.key === activeKey) || null : null;
  const previousComparable = activePoint ? activePoint.series.events
    .filter((event) => event.comparableKey === activePoint.event.comparableKey
      && event.observedAt < activePoint.event.observedAt
      && calendarDayKey(event.observedAt) !== calendarDayKey(activePoint.event.observedAt))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt)) : [];
  const previousEvent = previousComparable.length ? previousComparable[previousComparable.length - 1] : null;
  const pointDelta = activePoint && previousEvent ? activePoint.event.score - previousEvent.score : null;
  const xPercent = activePoint ? (activePoint.x / width) * 100 : 50;
  const yPercent = activePoint ? (activePoint.y / height) * 100 : 50;
  const horizontalEdge = xPercent < 28 ? 'left' : xPercent > 72 ? 'right' : 'center';
  const verticalEdge = yPercent < 38 ? 'below' : 'above';
  const firstEvent = allEvents[0]?.event || null;
  const lastEvent = allEvents[allEvents.length - 1]?.event || null;

  if (allEvents.length && !comparableTrendSegments(allEvents.map(({ event }) => event)).length) return <article className="sap-trend-card">
    <header><div><span className="sap-trend-eyebrow">Assessment results</span><h3>{subject}</h3></div><strong>Starting point · no progress comparison yet</strong></header>
    <p className="sap-baseline-note">These are different skills assessed in the selected period. Further comparable assessment dates are needed to show progress.</p>
    <div className="sap-table-wrap"><table className="sap-table"><thead><tr><th>Skill</th><th>Result</th><th>Assessment</th><th>Date</th></tr></thead><tbody>{allEvents.map(({ event, series: source }) => <tr key={event.key}><td><strong>{event.label}</strong></td><td>{event.result}</td><td>{source.label} · {event.detail}</td><td>{formatDate(event.observedAt)}</td></tr>)}</tbody></table></div>
  </article>;

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
          {activeSeries.flatMap((trendSeries) => comparableTrendSegments(trendSeries.events).map(([start, end], index) => <line
            key={`${trendSeries.key}:segment:${index}`}
            x1={xAt(start)}
            y1={yAt(start.score)}
            x2={xAt(end)}
            y2={yAt(end.score)}
            className={`sap-trend-line sap-trend-line--${trendSeries.tone}`}
          />))}
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
          <div className="sap-trend-tooltip-position"><span>{activePoint.event.result}</span><strong className={`sap-evidence-position sap-evidence-position--${evidenceBandClass(activePoint.event.score)}`}>{trendPositionLabel(activePoint.event.score)}</strong>{pointDelta == null ? null : <em className={pointDelta >= 0 ? 'is-up' : 'is-down'}>{pointDelta >= 0 ? '↑' : '↓'} {Math.abs(pointDelta)} from previous comparable result</em>}</div>
          <div className="sap-trend-evidence-mix" aria-label="Evidence mix">
            <span className="is-support"><i aria-hidden="true"/><span>Needs support</span><b>{activePoint.event.focusCount}</b></span>
            <span className="is-developing"><i aria-hidden="true"/><span>Developing</span><b>{activePoint.event.developingCount}</b></span>
            <span className="is-strength"><i aria-hidden="true"/><span>Positive evidence</span><b>{activePoint.event.strengthCount}</b></span>
          </div>
        </div> : null}
      </div>
      <small>Hover, focus or tap a point for detail. English uses separate source colours so assignment evidence and Writing Hub evidence stay distinct while sharing one timeline.</small>
    </> : <div className="sap-empty">No scored skill results in this period. Open Evidence activity for qualitative feedback.</div>}
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
        fetchStudentAcademicSubjects(studentId, academicYearId),
      ]);
      if (cancelled) return;
      setContext(contextResult.status === 'fulfilled' ? contextResult.value : null);
      setConfidence(confidenceResult.status === 'fulfilled' ? confidenceResult.value : null);
      setAvailableSubjects(subjectsResult.status === 'fulfilled' ? subjectsResult.value.map((item) => item.name) : []);
    };
    void loadContext();
    return () => { cancelled = true; };
  }, [studentId, academicYearId]);

  const allSubjects = useMemo(() => {
    const values: string[] = [];
    profile?.subjects.forEach((entry) => values.push(entry.subject));
    profile?.timeline.forEach((entry) => values.push(entry.subject));
    profile?.scope.allowed_subjects.forEach((entry) => values.push(entry));
    availableSubjects.forEach((entry) => values.push(entry));
    return normalizeAcademicSubjectOptions(values.map((name) => academicProfileSubjectName(name, profile?.scope.subject_aliases)));
  }, [availableSubjects, profile]);

  useEffect(() => {
    if (subject === 'all') return;
    const canonical = allSubjects.find((name) => normalizeSubject(name) === normalizeSubject(academicProfileSubjectName(subject, profile?.scope.subject_aliases)));
    if (canonical && canonical !== subject) setSubject(canonical);
  }, [allSubjects, subject, profile?.scope.subject_aliases]);

  const currentFocus = useMemo(() => profile?.focus_areas.filter((item) => isActiveSupportStatus(item.status)) ?? [], [profile]);
  const evidenceToConfirm = useMemo(() => profile?.focus_areas.filter((item) => isEvidenceToConfirmStatus(item.status)) ?? [], [profile]);
  const reviewItems = useMemo(() => profile?.focus_areas.filter((item) => isTeacherReviewStatus(item.status)) ?? [], [profile]);
  const strengths = useMemo(() => profile?.focus_areas.filter((item) => ['emerging_strength', 'consistent_strength'].includes(String(item.status))) ?? [], [profile]);
  const improving = useMemo(() => profile?.focus_areas.filter((item) => item.status === 'improving') ?? [], [profile]);
  const resolved = useMemo(() => profile?.focus_areas.filter((item) => item.status === 'resolved') ?? [], [profile]);

  const assessmentEvidence = useMemo(() => aggregateAssessmentEvidence(profile?.timeline || []), [profile]);

  const latestTimelineForFocus = useMemo(() => {
    const map = new Map<string, TimelineItem>();
    const keyFor = (item: { subject: string; skill: string; subskill?: string | null }) => `${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`;
    [...assessmentEvidence].sort((a, b) => b.observed_at.localeCompare(a.observed_at)).forEach((item) => {
      const key = keyFor(item);
      if (!map.has(key)) map.set(key, item);
    });
    return map;
  }, [assessmentEvidence]);

  const latestForFocusItem = (item: FocusItem) => latestTimelineForFocus.get(`${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`) || null;
  const positiveEvidenceToConfirm = evidenceToConfirm.filter((item) => latestForFocusItem(item)?.observation_type === 'strength');

  const trendSubjects = useMemo<TrendChart[]>(() => {
    if (!profile) return [];
    const subjects = subject === 'all' ? allSubjects : [academicProfileSubjectName(subject, profile.scope.subject_aliases)];
    return subjects.flatMap((name) => {
      const subjectExists = profile.subjects.some((row) => normalizeSubject(row.subject) === normalizeSubject(name));
      if (normalizeSubject(name) === 'english') {
        const assignmentEvents = buildTrendEvents(assessmentEvidence, name, 'assignment_result');
        const writingEvents = [
          ...buildTrendEvents(assessmentEvidence, name, 'writing_assessment_review'),
          ...buildTrendEvents(assessmentEvidence, name, 'writing_attempt'),
        ].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
        const seriesCandidates: TrendSeries[] = [
          { key: 'assignments', label: 'Assignments', tone: 'assignment', events: assignmentEvents },
          { key: 'writing-hub', label: 'Writing Hub', tone: 'writing', events: writingEvents },
        ];
        const series = seriesCandidates.filter((item) => item.events.length > 0);
        if (!series.length && subjectExists) series.push({ key: 'english', label: 'English evidence', tone: 'general', events: [] });
        return series.length || subjectExists ? [{ subject: name, series }] : [];
      }
      const events = buildTrendEvents(assessmentEvidence, name);
      return events.length > 0 || subjectExists ? [{ subject: name, series: [{ key: 'evidence', label: 'Learning evidence', tone: 'general', events }] }] : [];
    });
  }, [allSubjects, profile, subject, assessmentEvidence]);

  const latestConfidenceStates = useMemo(() => {
    const latest = new Map<string, StudentAcademicConfidence['confidenceStates'][number]>();
    confidence?.confidenceStates.forEach((item) => {
      const current = latest.get(item.skillKey);
      if (!current || String(item.computedAt || '') > String(current.computedAt || '')) latest.set(item.skillKey, item);
    });
    return [...latest.values()].filter((item) => subject === 'all' || normalizeSubject(academicProfileSubjectName(item.subject, profile?.scope.subject_aliases)) === normalizeSubject(academicProfileSubjectName(subject, profile?.scope.subject_aliases)));
  }, [confidence, subject, profile?.scope.subject_aliases]);

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
  const supportCount = currentFocus.length;
  const formatStatus = (item: FocusItem) => focusStatusLabel(item.status, latestForFocusItem(item)?.observation_type, item.first_observed_at, item.last_observed_at);
  const teacherEvidence = assessmentSnapshot(profile, assessmentEvidence);
  const snapshotText = teacherEvidence.text;


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

    {(profile.scope.writing_pending_reviews || 0) > 0 ? <div className="aps-scope-note" role="status"><strong>{profile.scope.writing_pending_reviews} Writing Hub submission{profile.scope.writing_pending_reviews === 1 ? '' : 's'} awaiting teacher review.</strong> Finalized reviews appear as writing evidence here. Writing scores stay separate from the assignment average.</div> : null}

    <div className="sap-kpis">
      <article><span>Completed assignment average</span><strong className={`sap-score sap-score--${scoreBand(profile.summary.assignment_average)}`}>{profile.summary.assignment_average === null ? '—' : `${Math.round(profile.summary.assignment_average)}%`}</strong><small>{profile.assignments.length === 1 ? `${profile.assignments[0].correct}/${profile.assignments[0].correct + profile.assignments[0].incorrect} correct · ${formatDate(profile.assignments[0].completed_at)}` : `Based on ${profile.summary.completed_assignments} completed assignments`}</small></article>
      {!teacherEvidence.baseline ? <><article><span>Confirmed support areas</span><strong>{supportCount}</strong><small>{profile.summary.persistent_focus_count} long-running</small></article>
      <article><span>Making progress</span><strong className="sap-positive">{profile.summary.improving_count}</strong><small>Established movement over time</small></article>
      <article><span>Now secure</span><strong className="sap-positive">{profile.summary.resolved_count}</strong><small>Previous needs resolved</small></article>
      <article><span>Established strengths</span><strong className="sap-positive">{profile.summary.strength_count}</strong><small>{positiveEvidenceToConfirm.length ? `${positiveEvidenceToConfirm.length} positive signal${positiveEvidenceToConfirm.length === 1 ? '' : 's'} awaiting more evidence` : 'Longitudinally supported strengths'}</small></article></> : <article><span>Evidence stage</span><strong>{assessmentEvidence.length ? 'Starting point' : 'No assessed evidence'}</strong><small>Progress and consistent strengths need further assessment dates</small></article>}
    </div>

    <section className="sap-trust-summary" aria-label="Teacher snapshot"><span>Teacher snapshot</span><p>{snapshotText}</p></section>

    {profile.subjects.length > 1 ? <section className="sap-panel sap-overview-panel">
      <div className="sap-panel-heading sap-heading-simple"><div><span>Main overview</span><h2>Subject picture</h2></div><p>Results and current learning needs for the selected period.</p></div>
      <div className="sap-subject-grid">{profile.subjects.map((entry) => {
        const subjectFocus = currentFocus.filter((item) => normalizeSubject(item.subject) === normalizeSubject(entry.subject)).length;
        const subjectConfirm = [...evidenceToConfirm, ...reviewItems].filter((item) => normalizeSubject(item.subject) === normalizeSubject(entry.subject)).length;
        return <article key={entry.subject} className="sap-subject-card"><div><h3>{entry.subject}</h3><span>{entry.completed_assignments} completed</span></div><strong className={`sap-score sap-score--${scoreBand(entry.assignment_average)}`}>{entry.assignment_average === null ? 'Not assessed' : `${entry.assignment_average}%`}</strong><dl>{!teacherEvidence.baseline ? <><div><dt>Confirmed support areas</dt><dd>{subjectFocus}</dd></div><div><dt>Evidence to confirm</dt><dd>{subjectConfirm}</dd></div><div><dt>Improving</dt><dd>{entry.improving_count}</dd></div><div><dt>Secure</dt><dd>{entry.resolved_count}</dd></div><div><dt>Established strengths</dt><dd>{entry.strength_count}</dd></div></> : <div><dt>Skills to reassess</dt><dd>{subjectConfirm}</dd></div>}</dl><small>Latest evidence {formatDate(entry.latest_evidence_at)}</small></article>;
      })}{!profile.subjects.length ? <div className="sap-empty">No subject evidence is available in the selected period.</div> : null}</div>
    </section> : null}

    <ProfileDisclosure tone="trend" eyebrow="Learning trends" title="Assessment results and progress" description="Skill results are grouped by assessment. Progress compares the same skill and evidence focus across separate dates; Writing Hub remains a separate source." meta={`${trendSubjects.length} subject${trendSubjects.length === 1 ? '' : 's'}`}>
      <div className="sap-trend-grid">{trendSubjects.map((entry) => <SubjectTrendChart key={entry.subject} subject={entry.subject} series={entry.series}/>)}</div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="support" eyebrow="Priority support" title="What should we work on?" description="Current learning needs with the latest supporting evidence, kept separate from the detailed activity log." meta={`${currentFocus.length} active area${currentFocus.length === 1 ? '' : 's'}`}>
      <div className="sap-focus-list sap-focus-list--clear">{currentFocus.map((item) => {
        const key = `${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`;
        const evidence = latestTimelineForFocus.get(key);
        const correction = getCorrections(evidence)[0];
        return <article key={item.skill_key}><div className="sap-focus-main"><span className={`sap-status sap-status--${statusBand(String(item.status))}`}>{formatStatus(item)}</span><h3>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</h3><p>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</p>{evidence ? <small className="sap-focus-explain">{evidenceExplanation(evidence)}</small> : null}{correction && (correction.original || correction.better_version) ? <div className="sap-example"><span>Example</span><del>{correction.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{correction.better_version || 'Correction'}</ins></div> : null}</div><dl><div><dt>First seen</dt><dd>{formatDate(item.first_observed_at)}</dd></div><div><dt>Latest</dt><dd>{formatDate(item.last_observed_at)}</dd></div><div><dt>Assessments</dt><dd>{item.evidence_items}</dd></div><div><dt>Questions / rubric items</dt><dd>{item.evidence_occurrences}</dd></div><div><dt>Latest result</dt><dd>{latestForFocusItem(item) ? assessmentResultLabel(latestForFocusItem(item)!) : '—'}</dd></div></dl></article>;
      })}{!currentFocus.length ? <div className="sap-empty">No confirmed support pattern yet. Use the suggested checks in the teacher snapshot to plan the next assessment.</div> : null}</div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="progress" eyebrow="Evidence to confirm" title="Initial results to check again" description="Low-data signals stay separate from support needs and established strengths until enough qualified evidence exists." meta={`${evidenceToConfirm.length + reviewItems.length} item${evidenceToConfirm.length + reviewItems.length === 1 ? '' : 's'}`}>
      <div className="sap-table-wrap"><table className="sap-table"><thead><tr><th>Skill</th><th>Latest assessment result</th><th>Assessments</th><th>Interpretation</th></tr></thead><tbody>{evidenceToConfirm.map((item) => {
        const latest = latestForFocusItem(item);
        return <tr key={item.skill_key}><td><strong>{item.subskill || item.skill}</strong><small className="sap-cell-subject">{item.subject}</small></td><td>{latest ? assessmentResultLabel(latest) : '—'}</td><td>{item.evidence_items}</td><td>{latest?.observation_type === 'strength' ? 'Positive initial result' : latest?.observation_type === 'focus' ? 'Suggested follow-up' : 'Developing result'} · needs further assessment</td></tr>;
      })}{reviewItems.map((item) => <tr key={item.skill_key}><td>{item.subskill || item.skill}</td><td>{latestForFocusItem(item) ? assessmentResultLabel(latestForFocusItem(item)!) : '—'}</td><td>{item.evidence_items}</td><td>Teacher review needed across separate assessment dates</td></tr>)}</tbody></table>{!evidenceToConfirm.length && !reviewItems.length ? <div className="sap-empty">No evidence is currently waiting for confirmation or teacher review.</div> : null}</div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="progress" eyebrow="Positive movement" title="Progress and strengths" description="A concise view of areas that are improving, secure or consistently strong." meta={`${improving.length + resolved.length + strengths.length} established positive signal${improving.length + resolved.length + strengths.length === 1 ? '' : 's'}`}>
      <div className="sap-progress-columns"><div><h3>Making progress</h3>{improving.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</strong><span>{item.subject}</span></p>)}{!improving.length ? <small>No improving areas yet.</small> : null}</div><div><h3>Now secure</h3>{resolved.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}{!resolved.length ? <small>No resolved areas yet.</small> : null}</div><div><h3>Established strengths</h3>{strengths.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}{!strengths.length ? <small>No established strengths yet.</small> : null}</div></div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="evidence" eyebrow="Detailed evidence" title="Evidence activity" description="Open an assessment, then a skill, to review its question evidence or writing feedback." meta={`${new Set(assessmentEvidence.map(assessmentKey)).size} assessment${new Set(assessmentEvidence.map(assessmentKey)).size === 1 ? '' : 's'}`}>
      <div className="sap-evidence-list">{[...new Set(assessmentEvidence.map(assessmentKey))].map((key) => {
        const rows = assessmentEvidence.filter((item) => assessmentKey(item) === key);
        const first = rows[0];
        return <details key={key} className="sap-assessment-detail"><summary><strong>{sourceMeta(first).detail}</strong><span>{first.subject} · {formatDate(first.observed_at)} · {rows.length} skills</span></summary><div className="sap-assessment-skills">{rows.map((item) => <details key={item.id} className="sap-mini-disclosure"><summary>{item.subskill || item.skill} · {assessmentResultLabel(item)}</summary><div>{(Array.isArray(item.evidence?.assessment_items) ? item.evidence.assessment_items as TimelineItem[] : [item]).map((question) => <p key={question.id}><strong>{textValue(question.evidence?.evidence_focus_name) || question.subskill || question.skill}</strong> · {assessmentResultLabel(question)}<br/>{textValue(question.evidence?.evidence_statement) || evidenceExplanation(question)}{getCorrections(question).map((correction, index) => <span key={index}> {correction.original} → {correction.better_version}</span>)}</p>)}</div></details>)}</div></details>;
      })}{!assessmentEvidence.length ? <div className="sap-empty">No learning evidence is available in this period.</div> : null}</div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="results" eyebrow="Assessment record" title="Assignment results" description="Official completed assignment outcomes used for the assignment average. Skill-level evidence may contain additional qualified diagnostic records." meta={`${profile.assignments.length} completed`}>
      <div className="sap-table-wrap"><table className="sap-table"><thead><tr><th>Date</th><th>Subject</th><th>Assignment</th><th>Topic</th><th>Correct</th><th>Result</th></tr></thead><tbody>{profile.assignments.map((item) => <tr key={`${item.assignment_id}:${item.completed_at}`}><td>{formatDate(item.completed_at)}</td><td>{item.subject}</td><td><strong>{item.title}</strong></td><td>{item.topic || '—'}</td><td>{item.correct}/{item.correct + item.incorrect}</td><td><span className={`sap-score-chip sap-score-chip--${scoreBand(item.accuracy)}`}>{item.accuracy}%</span></td></tr>)}</tbody></table>{!profile.assignments.length ? <div className="sap-empty">No completed assignments in this period.</div> : null}</div>
    </ProfileDisclosure>

    <ProfileDisclosure tone="method" eyebrow="Reporting method" title="How this profile works" description="Definitions, confidence and governed reporting terminology." meta="Reference">
      <div className="sap-glossary"><div><strong>New focus</strong><span>A recent assessed need. It is visible early, but is not called persistent yet.</span></div><div><strong>Recurring</strong><span>The same need has appeared more than once.</span></div><div><strong>Persistent</strong><span>A repeated need supported by enough evidence over time.</span></div><div><strong>Improving</strong><span>Later assessed work is moving in the right direction.</span></div><div><strong>Resolved</strong><span>Later evidence shows the previous need is now secure.</span></div><div><strong>Evidence to confirm</strong><span>Promising, developing or potential support evidence that is not yet strong enough for a longitudinal conclusion.</span></div><div><strong>Established strength</strong><span>A strength supported by enough qualified evidence over time, not just one high result.</span></div><div><strong>Teacher review needed</strong><span>Qualified evidence points in different directions, so the system withholds a simple conclusion.</span></div><div><strong>Confidence</strong><span>How complete, recent and consistent the evidence is. It is not a mark.</span></div></div>
      {!dateFrom && !dateTo && latestConfidenceStates.length ? <div className="sap-confidence-summary" aria-label="Evidence confidence summary"><span><strong>{latestConfidenceStates.filter((item) => item.assessmentState === 'assessed').length}</strong> well-evidenced skills</span><span><strong>{latestConfidenceStates.filter((item) => ['not_assessed', 'low_data'].includes(item.assessmentState)).length}</strong> need more evidence</span><span><strong>{latestConfidenceStates.filter((item) => item.assessmentState === 'stale').length}</strong> need newer evidence</span><span><strong>{latestConfidenceStates.filter((item) => item.teacherReviewRequired).length}</strong> need teacher review</span></div> : <p>No confidence details are available yet.</p>}
      <div className="sap-technical-summary"><strong>Technical reporting terminology</strong><p><b>Qualified evidence:</b> assessed evidence that meets the system's quality rules. <b>Coverage:</b> how much of the mapped curriculum has been assessed. <b>Reporting readiness:</b> whether there is enough governed evidence for higher-confidence reporting. <b>Contradictory evidence:</b> recent evidence that points in different directions and may need teacher review.</p></div>
    </ProfileDisclosure>

    {showReport ? <IndividualStudentAcademicReport profile={profile} schoolName={resolvedSchoolName} schoolLogoUrl={resolvedSchoolLogo} teacherName={preparedBy} onClose={() => setShowReport(false)} /> : null}
  </section>;
};

export default StudentAcademicProfileV2;
