import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StudentAcademicProfile } from '../../services/studentAcademicProfileService';
import { formatLearningStatus } from '../../services/studentAcademicProfileService';
import { createSchoolBrand } from '../../src/lib/schoolBranding';
import { normalizeAcademicSubjectOptions } from './AcademicProgressSuite';
import {
  buildAcademicSnapshot,
  comparableTrendSegments,
  evidenceConfirmationLabel,
  focusStatusLabel,
  isActiveSupportStatus,
  isEvidenceToConfirmStatus,
  isTeacherReviewStatus,
  observationDisplayLabel,
  summarizeComparableTrend,
} from './academicReportingSemantics';
import './StudentAcademicProfile.css';
import './StudentAcademicProfileV2Enhancements.css';

interface IndividualStudentAcademicReportProps {
  profile: StudentAcademicProfile;
  schoolName?: string;
  schoolLogoUrl?: string;
  teacherName?: string;
  onClose: () => void;
}

type TimelineItem = StudentAcademicProfile['timeline'][number];
type PrintTrendEvent = { key: string; observedAt: string; score: number; comparableKey: string; source: string; detail: string; label: string };

const safeText = (value: unknown) => String(value ?? '').trim();
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const formatSectionNumber = (value: number | null) => value == null ? '' : String(value).padStart(2, '0');
const normalizeSubject = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^maths$/, 'mathematics');
const sourceLabel = (item: TimelineItem) => {
  if (item.source_type === 'assignment_result') return 'Assignment';
  if (item.source_type === 'writing_attempt' || item.source_type === 'writing_assessment_review') {
    const genre = typeof item.evidence?.genre === 'string' ? item.evidence.genre.trim() : '';
    return genre ? genre.charAt(0).toUpperCase() + genre.slice(1) : 'Writing task';
  }
  if (item.source_type === 'teacher_observation') return 'Teacher note';
  if (item.source_type === 'import') return 'Imported school evidence';
  return 'School evidence';
};
const sourceDetail = (item: TimelineItem) => {
  if (item.source_type === 'assignment_result' && typeof item.evidence?.assignment_title === 'string' && item.evidence.assignment_title.trim()) return item.evidence.assignment_title.trim();
  if (item.source_type === 'writing_attempt' || item.source_type === 'writing_assessment_review') return 'Writing Hub';
  return sourceLabel(item);
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
const buildPrintTrendEvents = (items: TimelineItem[], subject: string, sourceType?: TimelineItem['source_type']): PrintTrendEvent[] => {
  const groups = new Map<string, { values: number[]; comparableKey: string; observedAt: string; source: string; detail: string; label: string }>();
  items.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)
    && (!sourceType || item.source_type === sourceType)).forEach((item) => {
    const comparableKey = `${normalizeSubject(item.subject)}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`;
    const key = `${item.source_type}:${item.source_id || item.observed_at}:${comparableKey}`;
    const group = groups.get(key) || {
      values: [],
      comparableKey,
      observedAt: item.observed_at,
      source: sourceLabel(item),
      detail: sourceDetail(item),
      label: item.subskill || item.skill,
    };
    group.values.push(observationSignal(item));
    if (item.observed_at > group.observedAt) group.observedAt = item.observed_at;
    groups.set(key, group);
  });
  return [...groups.entries()].map(([key, group]) => ({
    key,
    observedAt: group.observedAt,
    score: Math.round(group.values.reduce((sum, value) => sum + value, 0) / Math.max(group.values.length, 1)),
    comparableKey: group.comparableKey,
    source: group.source,
    detail: group.detail,
    label: group.label,
  })).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
};

const PrintSubjectTrendChart: React.FC<{ subject: string; events: PrintTrendEvent[] }> = ({ subject, events }) => {
  const width = 520;
  const height = 160;
  const left = 78;
  const right = 16;
  const top = 16;
  const bottom = 28;
  const usableWidth = width - left - right;
  const usableHeight = height - top - bottom;
  const xAt = (index: number) => events.length <= 1 ? left + usableWidth / 2 : left + (index / (events.length - 1)) * usableWidth;
  const yAt = (value: number) => top + ((100 - value) / 100) * usableHeight;
  const trendText = summarizeComparableTrend(events.map((event) => ({ observedAt: event.observedAt, score: event.score, comparableKey: event.comparableKey })));
  const indexFor = (event: PrintTrendEvent) => Math.max(0, events.findIndex((row) => row.key === event.key));

  return <article className="sap-print-trend-card">
    <header><div><h3>{subject}</h3><span>Subject trend for this reporting period</span></div><strong>{trendText}</strong></header>
    <svg className="sap-print-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${subject} printed learning trend`}>
      {[25, 60, 90].map((value) => <g key={value}><line x1={left} y1={yAt(value)} x2={width - right} y2={yAt(value)} className="sap-print-trend-guide"/><text x={left - 9} y={yAt(value) + 3} textAnchor="end" className="sap-print-trend-axis">{value === 25 ? 'Needs support' : value === 60 ? 'Developing' : 'Strong'}</text></g>)}
      {comparableTrendSegments(events).map(([start, end], index) => <line key={`segment:${index}`} x1={xAt(indexFor(start))} y1={yAt(start.score)} x2={xAt(indexFor(end))} y2={yAt(end.score)} className="sap-print-trend-line"/>)}
      {events.map((event, index) => <g key={event.key}><circle cx={xAt(index)} cy={yAt(event.score)} r="7" className="sap-print-trend-point"/><text x={xAt(index)} y={yAt(event.score) + 3} className="sap-print-trend-point-number">{index + 1}</text></g>)}
      {events.length ? <><text x={left} y={height - 6} className="sap-print-trend-date">{formatDate(events[0].observedAt)}</text><text x={width - right} y={height - 6} textAnchor="end" className="sap-print-trend-date">{formatDate(events[events.length - 1].observedAt)}</text></> : null}
    </svg>
    <ol className="sap-print-trend-point-list">{events.map((event, index) => <li key={event.key}><b>{index + 1}</b><span><strong>{formatDate(event.observedAt)} · {event.source} · {event.detail}</strong><small>{event.label} · {trendPositionLabel(event.score)}</small></span></li>)}</ol>
  </article>;
};

const IndividualStudentAcademicReportV2: React.FC<IndividualStudentAcademicReportProps> = ({ profile, schoolName, schoolLogoUrl, teacherName, onClose }) => {
  const [title, setTitle] = useState('Student Progress Report');
  const [term, setTerm] = useState('');
  const [teacherComment, setTeacherComment] = useState('');
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [includeAssignments, setIncludeAssignments] = useState(true);
  const [includeStrengths, setIncludeStrengths] = useState(true);
  const [includeFocus, setIncludeFocus] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const brand = useMemo(() => createSchoolBrand({ schoolId: profile.student.school_id, schoolName, schoolLogoUrl }), [profile.student.school_id, schoolName, schoolLogoUrl]);
  const reportId = useMemo(() => `APR-${new Date().getFullYear()}-${profile.student.id.slice(0, 8).toUpperCase()}`, [profile.student.id]);
  const generatedAt = useMemo(() => new Date().toLocaleString(), []);
  const currentFocus = profile.focus_areas.filter((item) => isActiveSupportStatus(item.status));
  const evidenceToConfirm = profile.focus_areas.filter((item) => isEvidenceToConfirmStatus(item.status));
  const reviewItems = profile.focus_areas.filter((item) => isTeacherReviewStatus(item.status));
  const latestForFocusItem = (focus: StudentAcademicProfile['focus_areas'][number]) => profile.timeline
    .filter((item) => normalizeSubject(item.subject) === normalizeSubject(focus.subject)
      && item.skill.toLowerCase() === focus.skill.toLowerCase()
      && String(item.subskill || '').toLowerCase() === String(focus.subskill || '').toLowerCase())
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0] || null;
  const positiveEvidenceToConfirm = evidenceToConfirm.filter((item) => latestForFocusItem(item)?.observation_type === 'strength');
  const snapshotText = buildAcademicSnapshot({
    studentName: profile.student.name,
    completedAssignments: profile.summary.completed_assignments,
    supportLabels: currentFocus.map((item) => item.subskill ? `${item.skill} — ${item.subskill}` : item.skill),
    positiveEvidenceLabels: positiveEvidenceToConfirm.map((item) => item.subskill ? `${item.skill} — ${item.subskill}` : item.skill),
    teacherReviewCount: reviewItems.length,
  });
  const strengths = profile.focus_areas.filter((item) => ['emerging_strength', 'consistent_strength'].includes(String(item.status)));
  const improving = profile.focus_areas.filter((item) => item.status === 'improving');
  const resolved = profile.focus_areas.filter((item) => item.status === 'resolved');
  const printTrendSubjects = useMemo(() => normalizeAcademicSubjectOptions(profile.timeline.map((item) => item.subject))
    .flatMap((subject) => {
      if (normalizeSubject(subject) === 'english') {
        return [
          { subject: `${subject} — Writing Hub`, events: [
            ...buildPrintTrendEvents(profile.timeline, subject, 'writing_assessment_review'),
            ...buildPrintTrendEvents(profile.timeline, subject, 'writing_attempt'),
          ].sort((a, b) => a.observedAt.localeCompare(b.observedAt)) },
          { subject: `${subject} — Assignments`, events: buildPrintTrendEvents(profile.timeline, subject, 'assignment_result') },
        ];
      }
      const events = buildPrintTrendEvents(profile.timeline, subject);
      return events.length > 0 ? [{ subject, events }] : [];
    }), [profile.timeline]);
  const sectionNumbers = useMemo(() => {
    let next = 1;
    const take = () => next++;
    return {
      overview: take(),
      focus: includeFocus ? take() : null,
      strengths: includeStrengths ? take() : null,
      assignments: includeAssignments ? take() : null,
      timeline: includeTimeline ? take() : null,
      comment: teacherComment.trim() ? take() : null,
    };
  }, [includeAssignments, includeFocus, includeStrengths, includeTimeline, teacherComment]);

  return createPortal(
    <div className="sap-report-overlay" role="presentation">
      <div className="sap-report-shell" role="dialog" aria-modal="true" aria-label="Individual Student Academic Report">
        <div className="sap-report-toolbar sap-no-print">
          <div><strong>Student report</strong><span>Choose what to include, then print or save as PDF.</span></div>
          <div><button type="button" onClick={onClose}>Close</button><button type="button" className="primary" onClick={() => window.print()}>Print / Save PDF</button></div>
        </div>
        <div className="sap-report-controls sap-no-print">
          <label>Report title<input value={title} maxLength={90} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Term / reporting period<input value={term} maxLength={50} onChange={(event) => setTerm(event.target.value)} placeholder="e.g. Autumn Term 2026" /></label>
          <label className="wide">Teacher comment<textarea value={teacherComment} maxLength={900} onChange={(event) => setTeacherComment(event.target.value)} placeholder="Optional note for the parent, student or school record." /></label>
          <fieldset><legend>Include in report</legend><label><input type="checkbox" checked={includeFocus} onChange={(event) => setIncludeFocus(event.target.checked)} /> Needs support</label><label><input type="checkbox" checked={includeStrengths} onChange={(event) => setIncludeStrengths(event.target.checked)} /> Strengths & progress</label><label><input type="checkbox" checked={includeAssignments} onChange={(event) => setIncludeAssignments(event.target.checked)} /> Assignment results</label><label><input type="checkbox" checked={includeTimeline} onChange={(event) => setIncludeTimeline(event.target.checked)} /> Learning timeline + trend graphs</label></fieldset>
        </div>

        <article className="sap-print-report" ref={printRef}>
          <header className="sap-print-header">
            <div className="sap-print-brand">{brand.logoUrl ? <img src={brand.logoUrl} alt={`${brand.name} logo`} /> : <div>{brand.name.slice(0, 1).toUpperCase()}</div>}<span><strong>{brand.name}</strong><small>Student progress report</small></span></div>
            <div className="sap-print-reference"><span>{reportId}</span><small>Generated {generatedAt}</small></div>
          </header>

          <section className="sap-print-title"><span>Student Progress</span><h1>{safeText(title) || 'Student Progress Report'}</h1><p>{term ? `${term} · ` : ''}{profile.scope.subject || 'All authorised subjects'}</p></section>
          <section className="sap-print-student-grid"><div><span>Student</span><strong>{profile.student.name}</strong></div><div><span>Class</span><strong>{profile.student.class_name || '—'}</strong></div><div><span>Grade</span><strong>{profile.student.grade || '—'}</strong></div><div><span>Prepared by</span><strong>{teacherName || 'Authorised school staff'}</strong></div></section>
          <section className="sap-print-trust-summary"><span>Teacher snapshot</span><p>{snapshotText}</p></section>
          <section className="sap-print-summary"><div><span>Completed assignment average</span><strong>{profile.summary.assignment_average == null ? '—' : `${profile.summary.assignment_average}%`}</strong><small>{profile.summary.completed_assignments} completed</small></div><div><span>Needs support</span><strong>{currentFocus.length}</strong><small>{profile.summary.persistent_focus_count} long-running</small></div><div><span>Making progress</span><strong>{profile.summary.improving_count}</strong><small>Moving in the right direction</small></div><div><span>Now secure</span><strong>{profile.summary.resolved_count}</strong><small>Previous needs resolved</small></div><div><span>Established strengths</span><strong>{profile.summary.strength_count}</strong><small>{positiveEvidenceToConfirm.length ? `${positiveEvidenceToConfirm.length} positive signal${positiveEvidenceToConfirm.length === 1 ? '' : 's'} awaiting more evidence` : 'Longitudinally supported strengths'}</small></div></section>

          <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.overview}</span><div><h2>Subject overview</h2><p>A simple view of results and longer-term progress.</p></div></div><table><thead><tr><th>Subject</th><th>Average</th><th>Completed</th><th>Long-running support</th><th>Improving</th><th>Now secure</th><th>Established strengths</th></tr></thead><tbody>{profile.subjects.map((entry) => <tr key={entry.subject}><td><strong>{entry.subject}</strong></td><td>{entry.assignment_average == null ? '—' : `${entry.assignment_average}%`}</td><td>{entry.completed_assignments}</td><td>{entry.persistent_focus_count}</td><td>{entry.improving_count}</td><td>{entry.resolved_count}</td><td>{entry.strength_count}</td></tr>)}</tbody></table></section>

          {includeFocus ? <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.focus}</span><div><h2>Needs support</h2><p>Current learning needs seen in assessed work.</p></div></div>{currentFocus.length ? <div className="sap-print-focus-grid">{currentFocus.map((item) => <article key={item.skill_key}><strong>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</strong><span>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</span><p>{focusStatusLabel(item.status, latestForFocusItem(item)?.observation_type, item.first_observed_at, item.last_observed_at)} · {item.evidence_items} assessment record{item.evidence_items === 1 ? '' : 's'} · {item.evidence_occurrences} assessed item{item.evidence_occurrences === 1 ? '' : 's'} · first seen {formatDate(item.first_observed_at)} · latest {formatDate(item.last_observed_at)}</p></article>)}</div> : <p className="sap-print-empty">No current support needs are identified in this period.</p>}</section> : null}

          {includeStrengths ? <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.strengths}</span><div><h2>Strengths, progress and evidence to confirm</h2><p>Established positive conclusions stay separate from low-data evidence that still needs confirmation.</p></div></div><div className="sap-print-three"><div><h3>Making progress</h3>{improving.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Now secure</h3>{resolved.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Established strengths</h3>{strengths.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div></div>{evidenceToConfirm.length || reviewItems.length ? <div className="sap-print-focus-grid"><h3>Evidence to confirm</h3>{evidenceToConfirm.map((item) => <article key={`confirm:${item.skill_key}`}><strong>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</strong><span>{item.subject}</span><p>{evidenceConfirmationLabel(latestForFocusItem(item)?.observation_type)} · latest {item.latest_evidence_percentage == null ? '—' : `${item.latest_evidence_percentage}%`} · {item.evidence_items} assessment record{item.evidence_items === 1 ? '' : 's'}</p></article>)}{reviewItems.map((item) => <article key={`review:${item.skill_key}`}><strong>{item.skill}</strong><span>{item.subject}</span><p>Teacher review needed · qualified evidence points in different directions.</p></article>)}</div> : null}</section> : null}

          {includeAssignments ? <section className="sap-print-section sap-print-page"><div className="sap-print-section-heading"><span>{sectionNumbers.assignments}</span><div><h2>Official completed assignment outcomes</h2><p>These outcomes are the denominator for the completed-assignment average.</p></div></div><table><thead><tr><th>Date</th><th>Subject</th><th>Assignment</th><th>Topic</th><th>Correct</th><th>Result</th></tr></thead><tbody>{profile.assignments.map((item) => <tr key={`${item.assignment_id}:${item.completed_at}`}><td>{formatDate(item.completed_at)}</td><td>{item.subject}</td><td><strong>{item.title}</strong></td><td>{item.topic || '—'}</td><td>{item.correct}/{item.correct + item.incorrect}</td><td><strong>{item.accuracy}%</strong></td></tr>)}</tbody></table></section> : null}

          {includeTimeline ? <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.timeline}</span><div><h2>Learning timeline and subject trends</h2><p>Trend lines only connect the same skill across separate assessment dates. Same-day and cross-skill evidence remains visible without being labelled progress.</p></div></div><div className="sap-print-trend-grid">{printTrendSubjects.map((entry) => <PrintSubjectTrendChart key={entry.subject} subject={entry.subject} events={entry.events}/>)}</div><div className="sap-print-timeline">{profile.timeline.slice(0, 80).map((item) => <p key={item.id}><time>{formatDate(item.observed_at)}</time><strong>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</strong><span>{sourceLabel(item)} · {item.subject} · {observationDisplayLabel(item.observation_type).toLowerCase()}{item.evidence_percentage == null ? '' : ` · ${item.evidence_percentage}%`}</span></p>)}</div></section> : null}

          {teacherComment.trim() ? <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.comment}</span><div><h2>Teacher comment</h2><p>Additional school context.</p></div></div><blockquote>{teacherComment.trim()}</blockquote></section> : null}
          <footer className="sap-print-footer"><span>{brand.name} · Confidential academic record</span><span>{reportId} · Generated securely through Brains Heist</span></footer>
        </article>
      </div>
    </div>,
    document.body,
  );
};

export default IndividualStudentAcademicReportV2;
