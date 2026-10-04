import { aggregateAssessmentEvidence, assessmentKey, assessmentResultLabel, assessmentSnapshot } from './academicAssessmentEvidence';
import { academicProfileSubjectName, isAcademicAssignmentSource } from '../../services/studentAcademicProfileService';
import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchStudentAcademicConfidence,
  fetchStudentAcademicProfile,
  fetchStudentAcademicSubjects,
  type StudentAcademicConfidence,
  type StudentAcademicProfile as StudentAcademicProfileData,
} from '../../services/studentAcademicProfileService';
import {
  getAcademicProgressExperienceContext,
  type AcademicProgressExperienceContext,
  type AcademicProgressViewerRole,
} from '../../services/academicProgressExperienceService';
import IndividualStudentAcademicReport from './IndividualStudentAcademicReportV2';
import { normalizeAcademicSubjectOptions } from './AcademicProgressSuite';
import { SchoolBrand } from '../../src/components/SchoolBrand';
import { createSchoolBrand } from '../../src/lib/schoolBranding';
import { academicProgressBackDestination } from '../../services/academicProgressExperienceService';
import { AssignmentResultTimeline, ProfileIcon, ProfilePreview, ProfileSection, ProfileStat } from './AcademicProfilePremium';
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
import './AcademicProfilePremium.css';

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
  <details className={`ap-section ap-method ap-method--${tone}`}>
    <summary className="ap-method-summary">
      <div className="ap-method-title">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="ap-method-controls">
        {meta ? <small>{meta}</small> : null}
        <b className="ap-method-action"><span className="when-closed">Open</span><span className="when-open">Close</span></b>
      </div>
    </summary>
    <div className="ap-method-body">{children}</div>
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

  if (allEvents.length && !comparableTrendSegments(allEvents.map(({ event }) => event)).length) return <article className="ap-skill-trend-card">
    <header><div><span className="sap-trend-eyebrow">Assessment results</span><h3>{subject}</h3></div><strong>Starting point · no progress comparison yet</strong></header>
    <p className="sap-baseline-note">These are different skills assessed in the selected period. Further comparable assessment dates are needed to show progress.</p>
    <div className="ap-table-wrap"><table className="ap-table"><thead><tr><th>Skill</th><th>Result</th><th>Assessment</th><th>Date</th></tr></thead><tbody>{allEvents.map(({ event, series: source }) => <tr key={event.key}><td><strong>{event.label}</strong></td><td>{event.result}</td><td>{source.label} · {event.detail}</td><td>{formatDate(event.observedAt)}</td></tr>)}</tbody></table></div>
  </article>;

  return <article className="ap-skill-trend-card">
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
  const [dateFilterError, setDateFilterError] = useState('');

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

  if (loading) return <section className="sap-shell sap-premium sap-state"><div className="sap-loader"/><strong>Preparing student progress…</strong><span>Combining assignments, writing and progress over time.</span></section>;
  if (error || !profile) return <section className="sap-shell sap-premium sap-state sap-state--error"><strong>Student progress unavailable</strong><span>{error || 'No progress data was returned.'}</span>{onClose ? <button type="button" onClick={onClose}>Back</button> : null}</section>;

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


  const confirmItems = [...reviewItems, ...evidenceToConfirm.filter(item => latestForFocusItem(item)?.observation_type !== 'strength'), ...positiveEvidenceToConfirm];
  const evidenceStage = !assessmentEvidence.length ? 'No assessed evidence' : teacherEvidence.baseline ? 'Starting point' : 'Across assessment dates';
  const stageDetail = teacherEvidence.baseline ? 'Progress and consistent strengths need further assessment dates.' : 'Progress depends on comparable skills and evidence over time.';
  const scopeKey = `${studentId}:${academicYearId}:${subject}:${dateFrom}:${dateTo}`;
  const additionalTrendSubjects = trendSubjects.filter(entry => entry.series.some(series => series.tone === 'writing' || comparableTrendSegments(series.events).length > 0) || !profile.assignments.length);
  const schoolBrand = createSchoolBrand({ schoolId: resolvedContext.school.id, schoolName: resolvedContext.school.name, schoolLogoUrl: resolvedContext.school.logo_url });
  const resultTone = (item: TimelineItem) => item.evidence_percentage == null ? 'neutral' : Number(item.evidence_percentage) >= 80 ? 'positive' : Number(item.evidence_percentage) < 60 ? 'followup' : 'developing';
  const goBack = () => { if (onClose) onClose(); else window.location.assign(academicProgressBackDestination(viewerRole).href); };

  return <section className="sap-shell sap-school-language sap-premium">
    <div className="ap-standalone-brand"><SchoolBrand brand={schoolBrand} imageClassName="ap-school-logo"/><span>{viewerRole === 'teacher' ? 'Teacher Workspace' : 'Academic Workspace'}</span></div>
    <header className="ap-identity">
      <div><h1>Student Academic Profile</h1><div className="ap-student"><span className="ap-avatar" aria-hidden="true">{profile.student.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(name => Array.from(name)[0]).join('').toLocaleUpperCase()}</span><div><h2>{profile.student.name}</h2><p>{[profile.student.grade ? `Grade ${profile.student.grade}` : null, profile.student.class_name ? `Class ${profile.student.class_name}` : null, 'A clear record of results, support needs and progress'].filter(Boolean).join(' · ')}</p></div></div></div>
      <div className="ap-actions"><button type="button" className="ap-button" onClick={goBack}><ProfileIcon name="back"/>{backLabel || 'Back to student selection'}</button>{canGenerateReport && !archivedYear ? <button type="button" className="ap-button ap-button--primary" onClick={() => setShowReport(true)}><ProfileIcon name="document"/>Generate individual report</button> : null}</div>
    </header>

    <div className="ap-filterbar" role="group" aria-label="Progress record filters">
      <div className="ap-year-context"><span>Academic year</span><div><ProfileIcon name="calendar"/><span><strong>{profileYearLabel || 'Selected academic year'}</strong> · {archivedYear ? 'Archived · read only' : 'Current academic year · live evidence.'}</span></div></div>
      <label>Subject<div className="ap-input-icon"><ProfileIcon name="document"/><select aria-label="Subject" value={subject} onChange={event => setSubject(event.target.value)}><option value="all">All subjects</option>{allSubjects.map(name => <option key={name.toLocaleLowerCase()} value={name}>{name}</option>)}</select></div></label>
      <label>From<input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => { const value = event.target.value; if (value && dateTo && value > dateTo) { setDateFilterError('The From date must be on or before the To date.'); return; } setDateFilterError(''); setDateFrom(value); }}/></label>
      <label>To<input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => { const value = event.target.value; if (value && dateFrom && value < dateFrom) { setDateFilterError('The To date must be on or after the From date.'); return; } setDateFilterError(''); setDateTo(value); }}/></label>
      <p className="ap-scope-note"><ProfileIcon name="info"/>{profile.scope.viewer === 'teacher' ? 'Showing the subjects you teach this student.' : 'Showing authorised school learning evidence.'}</p>
    </div>
    {dateFilterError ? <p className="ap-notice ap-notice--warning" role="alert">{dateFilterError} The previous valid date range is still applied.</p> : null}
    {archivedYear ? <p className="ap-notice">Historical evidence and placement are frozen to this school year.</p> : null}

    <div className="ap-overview" aria-label="Academic profile overview">
      <ProfileStat label="Completed assignment average" icon="result" value={profile.summary.assignment_average === null ? '—' : `${Math.round(profile.summary.assignment_average)}%`} detail={profile.assignments.length === 1 ? `${profile.assignments[0].correct}/${profile.assignments[0].correct + profile.assignments[0].incorrect} correct · ${formatDate(profile.assignments[0].completed_at)}` : profile.summary.completed_assignments ? `Based on ${profile.summary.completed_assignments} completed assignments` : 'No completed assignment results in this period.'}/>
      <ProfileStat label="Evidence stage" icon="target" value={<span className="ap-stage">{evidenceStage}</span>} detail={stageDetail}/>
      <ProfileStat label="Priority support" icon="support" tone={supportCount ? 'amber' : 'neutral'} value={`${supportCount} active area${supportCount === 1 ? '' : 's'}`} detail={supportCount ? 'Confirmed areas to address with the latest supporting evidence.' : 'No confirmed support pattern yet.'}/>
      <ProfileStat label="Evidence to confirm" icon="document" value={`${confirmItems.length} item${confirmItems.length === 1 ? '' : 's'}`} detail={`${positiveEvidenceToConfirm.length} positive initial result${positiveEvidenceToConfirm.length === 1 ? '' : 's'} · ${confirmItems.length - positiveEvidenceToConfirm.length} follow-up / review item${confirmItems.length - positiveEvidenceToConfirm.length === 1 ? '' : 's'}`}/>
    </div>

    <section className="ap-snapshot" aria-label="Teacher snapshot"><span className="ap-icon-disc"><ProfileIcon name="document"/></span><h2>Teacher snapshot</h2><div>
      <p>{profile.summary.completed_assignments ? `${profile.summary.completed_assignments} completed assignment${profile.summary.completed_assignments === 1 ? '' : 's'}; average ${profile.summary.assignment_average == null ? 'not available' : `${Math.round(profile.summary.assignment_average)}%`}.` : 'No completed assignment results in this period.'}{teacherEvidence.priorities.length ? <><strong> Check next: </strong>{teacherEvidence.priorities.map(item => <span className="ap-evidence-chip ap-evidence-chip--followup" key={item.id}>{item.subskill || item.skill} ({assessmentResultLabel(item)})</span>)}</> : null}</p>
      {teacherEvidence.positive.length ? <p><strong>Positive initial results: </strong>{teacherEvidence.positive.map(item => <span className="ap-evidence-chip ap-evidence-chip--positive" key={item.id}>{item.subskill || item.skill} ({assessmentResultLabel(item)})</span>)}</p> : null}
      <p>{teacherEvidence.baseline ? assessmentEvidence.length ? 'This is a starting point. Further assessment dates are needed to establish progress or consistent strengths.' : 'Complete an assessment to begin building this student’s learning record.' : 'Progress and consistent strengths use qualified, comparable evidence across separate assessment dates.'}</p>
    </div></section>
    {(profile.scope.writing_pending_reviews || 0) > 0 ? <p className="ap-notice" role="status"><ProfileIcon name="clock"/>{profile.scope.writing_pending_reviews} Writing Hub submission{profile.scope.writing_pending_reviews === 1 ? '' : 's'} awaiting teacher review. Finalized reviews appear as writing evidence here. Writing scores stay separate from the assignment average.</p> : null}

    <ProfileSection title="Learning trends" icon="trend" subtitle="Assessment results and progress" className="ap-learning-trends">
      {profile.assignments.length ? <AssignmentResultTimeline assignments={profile.assignments}/> : <p className="ap-empty">No completed assignment results in this period.</p>}
      {additionalTrendSubjects.length ? <div className="ap-skill-trends"><h3>Comparable skill evidence · assignment and writing sources remain distinct</h3>{additionalTrendSubjects.map(entry => <SubjectTrendChart key={entry.subject} subject={entry.subject} series={entry.series}/>)}</div> : null}
    </ProfileSection>

    {profile.subjects.length > 1 ? <ProfileSection title="Subject picture" icon="document" subtitle="Results and learning needs for the selected period."><div className="ap-subject-grid">{profile.subjects.map(entry => <article key={entry.subject}><h3>{entry.subject}</h3><strong>{entry.assignment_average === null ? 'Not assessed' : `${entry.assignment_average}%`}</strong><p>{entry.completed_assignments} completed assignments · {currentFocus.filter(item => normalizeSubject(item.subject) === normalizeSubject(entry.subject)).length} confirmed support areas</p></article>)}</div></ProfileSection> : null}

    <div className="ap-evidence-dashboard">
      <ProfileSection title="Assessment results" icon="document" className="ap-results-panel"><ProfilePreview key={scopeKey} count={assessmentEvidence.length} limit={8} label="assessment results">{limit => <div className="ap-table-wrap" tabIndex={0} role="region" aria-label="Assessment results table"><table className="ap-table"><thead><tr><th>Skill</th><th>Result</th><th>Assessment</th><th>Date</th></tr></thead><tbody>{assessmentEvidence.slice(0, limit).map(item => <tr key={item.id}><td>{item.subskill || item.skill}{subject === 'all' ? <small>{item.subject}</small> : null}</td><td><span className={`ap-result ap-result--${resultTone(item)}`}>{assessmentResultLabel(item)}</span></td><td>{sourceMeta(item).tone === 'assignment' ? sourceMeta(item).detail : `${sourceMeta(item).label} · ${sourceMeta(item).detail}`}</td><td>{formatDate(item.observed_at)}</td></tr>)}</tbody></table>{!assessmentEvidence.length ? <p className="ap-empty">No assessed skill results in this period.</p> : null}</div>}</ProfilePreview></ProfileSection>

      <ProfileSection title="Priority support" icon="support" className="ap-support-panel">{!currentFocus.length ? <div className="ap-support-empty"><span className="ap-icon-disc"><ProfileIcon name="support"/></span><strong>0 active areas</strong><p>No confirmed support pattern yet. Use the suggested checks in the teacher snapshot to plan the next assessment.</p></div> : <ProfilePreview key={scopeKey} count={currentFocus.length} limit={3} label="support areas">{limit => <div className="ap-focus-list">{currentFocus.slice(0, limit).map(item => {
        const evidence = latestForFocusItem(item);
        const correction = getCorrections(evidence)[0];
        return <article key={item.skill_key}><span className={`ap-evidence-chip ap-evidence-chip--${statusBand(item.status)}`}>{formatStatus(item)}</span><h3>{item.subskill || item.skill}</h3><p>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</p>{evidence ? <p>{evidenceExplanation(evidence)}</p> : null}{correction ? <p><del>{correction.original}</del> → {correction.better_version}</p> : null}<dl><div><dt>First seen</dt><dd>{formatDate(item.first_observed_at)}</dd></div><div><dt>Latest</dt><dd>{formatDate(item.last_observed_at)}</dd></div><div><dt>Evidence items</dt><dd>{item.evidence_items}</dd></div><div><dt>Questions / rubric items</dt><dd>{item.evidence_occurrences}</dd></div><div><dt>Latest result</dt><dd>{evidence ? assessmentResultLabel(evidence) : '—'}</dd></div></dl></article>;
      })}</div>}</ProfilePreview>}<span className="ap-sr-only">What should we work on?</span></ProfileSection>

      <ProfileSection title="Evidence to confirm" icon="document" className="ap-confirm-panel"><ProfilePreview key={scopeKey} count={confirmItems.length} limit={5} label="evidence to confirm">{limit => <div className="ap-table-wrap" tabIndex={0} role="region" aria-label="Evidence to confirm table"><table className="ap-table"><thead><tr><th>Skill</th><th>Latest result</th><th title="Evidence items">Items</th><th>Interpretation</th></tr></thead><tbody>{confirmItems.slice(0, limit).map(item => {
        const latest = latestForFocusItem(item);
        const review = isTeacherReviewStatus(item.status);
        const tone = review ? 'developing' : latest ? resultTone(latest) : 'neutral';
        return <tr key={item.skill_key}><td>{item.subskill || item.skill}{subject === 'all' ? <small>{item.subject}</small> : null}</td><td><span className={`ap-result ap-result--${tone}`}>{latest ? assessmentResultLabel(latest) : '—'}</span></td><td>{item.evidence_items}</td><td><span className={`ap-evidence-chip ap-evidence-chip--${tone}`}>{review ? 'Teacher review needed' : latest?.observation_type === 'strength' ? 'Positive initial result' : latest?.observation_type === 'focus' ? 'Suggested follow-up' : 'Developing result'}<span className="ap-chip-note">Needs further assessment</span></span></td></tr>;
      })}</tbody></table>{!confirmItems.length ? <p className="ap-empty">No evidence is currently waiting for confirmation or teacher review.</p> : null}</div>}</ProfilePreview></ProfileSection>
    </div>

    <div className="ap-record-dashboard">
      <ProfileSection title="Progress & strengths" icon="result"><div className="ap-progress-grid">{[{title:'Making progress',icon:'trend' as const,items:improving,empty:'No improving areas yet.'},{title:'Now secure',icon:'shield' as const,items:resolved,empty:'No resolved areas yet.'},{title:'Established strengths',icon:'strength' as const,items:strengths,empty:'No established strengths yet.'}].map(group => <div key={group.title}><ProfileIcon name={group.icon}/><div><h3>{group.title}</h3><ProfilePreview key={scopeKey} count={group.items.length} limit={3} label={group.title}>{limit => <>{group.items.slice(0,limit).map(item => <p key={item.skill_key}><strong>{item.subskill || item.skill}</strong><small>{item.subject}</small></p>)}{!group.items.length ? <p>{group.empty}</p> : null}</>}</ProfilePreview></div></div>)}</div></ProfileSection>

      <ProfileSection title="Detailed evidence" icon="document"><ProfilePreview key={scopeKey} count={new Set(assessmentEvidence.map(assessmentKey)).size} limit={3} label="detailed assessments">{limit => <div className="ap-evidence-list">{[...new Set(assessmentEvidence.map(assessmentKey))].slice(0,limit).map(key => {
        const rows = assessmentEvidence.filter(item => assessmentKey(item) === key);
        const first = rows[0];
        return <details key={key} className="sap-assessment-detail ap-assessment-detail"><summary><strong>{sourceMeta(first).detail}</strong><span>{first.subject} · {formatDate(first.observed_at)} · {rows.length} skill result{rows.length === 1 ? '' : 's'}</span></summary><div>{rows.map(item => <details key={item.id} className="ap-skill-detail"><summary>{item.subskill || item.skill} · {assessmentResultLabel(item)}</summary><div>{(Array.isArray(item.evidence?.assessment_items) ? item.evidence.assessment_items as TimelineItem[] : [item]).map(question => <p key={question.id}><strong>{textValue(question.evidence?.evidence_focus_name) || question.subskill || question.skill}</strong> · {assessmentResultLabel(question)}<br/>{textValue(question.evidence?.evidence_statement) || evidenceExplanation(question)}{getCorrections(question).map((correction,index) => <span key={index}> {correction.original} → {correction.better_version}</span>)}</p>)}</div></details>)}</div></details>;
      })}{!assessmentEvidence.length ? <p className="ap-empty">No learning evidence is available in this period.</p> : null}</div>}</ProfilePreview></ProfileSection>

      <ProfileSection title="Assessment record" icon="clock"><ProfilePreview key={scopeKey} count={profile.assignments.length} limit={5} label="assignment records">{limit => <div className="ap-table-wrap" tabIndex={0} role="region" aria-label="Official assignment record"><table className="ap-table"><thead><tr><th>Date</th><th>Subject</th><th>Assessment</th><th>Result</th><th>Percentage</th></tr></thead><tbody>{profile.assignments.slice(0,limit).map(item => <tr key={`${item.assignment_id}:${item.completed_at}`}><td>{formatDate(item.completed_at)}</td><td>{item.subject}</td><td>{item.title}{item.topic ? <small>{item.topic}</small> : null}</td><td>{item.correct}/{item.correct + item.incorrect}</td><td><strong>{item.accuracy}%</strong></td></tr>)}</tbody></table>{!profile.assignments.length ? <p className="ap-empty">No completed assignments in this period.</p> : null}</div>}</ProfilePreview>{assessmentEvidence.some(item => sourceMeta(item).tone === 'writing') ? <p className="ap-record-note">Writing Hub rubric results are available in Detailed evidence and the source-specific skill results above. They are excluded from the assignment average.</p> : null}</ProfileSection>
    </div>

    <ProfileDisclosure tone="method" eyebrow="Reporting method" title="How this profile works" description="Definitions, confidence and governed reporting terminology." meta="Reference">
      <div className="sap-glossary"><div><strong>New focus</strong><span>A recent assessed need. It is visible early, but is not called persistent yet.</span></div><div><strong>Recurring</strong><span>The same need has appeared more than once.</span></div><div><strong>Persistent</strong><span>A repeated need supported by enough evidence over time.</span></div><div><strong>Improving</strong><span>Later assessed work is moving in the right direction.</span></div><div><strong>Resolved</strong><span>Later evidence shows the previous need is now secure.</span></div><div><strong>Evidence to confirm</strong><span>Promising, developing or potential support evidence that is not yet strong enough for a longitudinal conclusion.</span></div><div><strong>Established strength</strong><span>A strength supported by enough qualified evidence over time, not just one high result.</span></div><div><strong>Teacher review needed</strong><span>Qualified evidence points in different directions, so the system withholds a simple conclusion.</span></div><div><strong>Confidence</strong><span>How complete, recent and consistent the evidence is. It is not a mark.</span></div></div>
      {!dateFrom && !dateTo && latestConfidenceStates.length ? <div className="sap-confidence-summary" aria-label="Evidence confidence summary"><span><strong>{latestConfidenceStates.filter((item) => item.assessmentState === 'assessed').length}</strong> well-evidenced skills</span><span><strong>{latestConfidenceStates.filter((item) => ['not_assessed', 'low_data'].includes(item.assessmentState)).length}</strong> need more evidence</span><span><strong>{latestConfidenceStates.filter((item) => item.assessmentState === 'stale').length}</strong> need newer evidence</span><span><strong>{latestConfidenceStates.filter((item) => item.teacherReviewRequired).length}</strong> need teacher review</span></div> : <p>No confidence details are available yet.</p>}
      <div className="sap-technical-summary"><strong>Technical reporting terminology</strong><p><b>Qualified evidence:</b> assessed evidence that meets the system's quality rules. <b>Coverage:</b> how much of the mapped curriculum has been assessed. <b>Reporting readiness:</b> whether there is enough governed evidence for higher-confidence reporting. <b>Contradictory evidence:</b> recent evidence that points in different directions and may need teacher review.</p></div>
    </ProfileDisclosure>

    {showReport ? <IndividualStudentAcademicReport profile={profile} schoolName={resolvedSchoolName} schoolLogoUrl={resolvedSchoolLogo} teacherName={preparedBy} onClose={() => setShowReport(false)} /> : null}
  </section>;
};

export default StudentAcademicProfileV2;
