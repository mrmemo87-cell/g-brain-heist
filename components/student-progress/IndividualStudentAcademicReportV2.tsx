import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StudentAcademicProfile } from '../../services/studentAcademicProfileService';
import { formatLearningStatus } from '../../services/studentAcademicProfileService';
import { createSchoolBrand } from '../../src/lib/schoolBranding';
import { normalizeAcademicSubjectOptions } from './AcademicProgressSuite';
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
type PrintTrendEvent = { key: string; observedAt: string; score: number; source: string; detail: string; label: string };

const safeText = (value: unknown) => String(value ?? '').trim();
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const formatSectionNumber = (value: number | null) => value == null ? '' : String(value).padStart(2, '0');
const normalizeSubject = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^maths$/, 'mathematics');
const sourceLabel = (item: TimelineItem) => {
  if (item.source_type === 'assignment_result') return 'Assignment';
  if (item.source_type === 'writing_attempt') {
    const genre = typeof item.evidence?.genre === 'string' ? item.evidence.genre.trim() : '';
    return genre ? genre.charAt(0).toUpperCase() + genre.slice(1) : 'Writing task';
  }
  if (item.source_type === 'teacher_observation') return 'Teacher note';
  if (item.source_type === 'import') return 'Imported school evidence';
  return 'School evidence';
};
const sourceDetail = (item: TimelineItem) => {
  if (item.source_type === 'assignment_result' && typeof item.evidence?.assignment_title === 'string' && item.evidence.assignment_title.trim()) return item.evidence.assignment_title.trim();
  if (item.source_type === 'writing_attempt') return 'Writing Hub';
  return sourceLabel(item);
};
const observationSignal = (item: TimelineItem) => {
  const pct = item.evidence_percentage == null ? null : Number(item.evidence_percentage);
  const bounded = pct == null || Number.isNaN(pct) ? null : Math.max(0, Math.min(100, pct));
  if (item.observation_type === 'focus') return bounded == null ? 28 : 16 + bounded * 0.24;
  if (item.observation_type === 'strength') return bounded == null ? 90 : 80 + bounded * 0.16;
  return bounded == null ? 62 : 48 + bounded * 0.24;
};
const trendPositionLabel = (score: number) => score >= 78 ? 'Strong evidence' : score >= 46 ? 'Developing evidence' : 'Needs support';
const buildPrintTrendEvents = (items: TimelineItem[], subject: string): PrintTrendEvent[] => {
  const groups = new Map<string, { values: number[]; observedAt: string; source: string; detail: string; label: string }>();
  items.filter((item) => normalizeSubject(item.subject) === normalizeSubject(subject)).forEach((item) => {
    const key = `${item.source_type}:${item.source_id || item.observed_at}`;
    const group = groups.get(key) || {
      values: [],
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
  const points = events.map((event, index) => `${xAt(index)},${yAt(event.score)}`).join(' ');
  const delta = events.length > 1 ? events[events.length - 1].score - events[0].score : 0;
  const trendText = events.length < 2 ? 'One evidence point so far' : delta >= 10 ? 'Overall evidence is moving up' : delta <= -10 ? 'Recent evidence needs attention' : 'Overall evidence is broadly steady';

  return <article className="sap-print-trend-card">
    <header><div><h3>{subject}</h3><span>Subject trend for this reporting period</span></div><strong>{trendText}</strong></header>
    <svg className="sap-print-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${subject} printed learning trend`}>
      {[25, 60, 90].map((value) => <g key={value}><line x1={left} y1={yAt(value)} x2={width - right} y2={yAt(value)} className="sap-print-trend-guide"/><text x={left - 9} y={yAt(value) + 3} textAnchor="end" className="sap-print-trend-axis">{value === 25 ? 'Needs support' : value === 60 ? 'Developing' : 'Strong'}</text></g>)}
      {events.length > 1 ? <polyline points={points} className="sap-print-trend-line"/> : null}
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
  const currentFocus = profile.focus_areas.filter((item) => ['new_focus', 'recurring', 'persistent', 'insufficient_evidence'].includes(String(item.status)));
  const strengths = profile.focus_areas.filter((item) => ['emerging_strength', 'consistent_strength'].includes(String(item.status)));
  const improving = profile.focus_areas.filter((item) => item.status === 'improving');
  const resolved = profile.focus_areas.filter((item) => item.status === 'resolved');
  const printTrendSubjects = useMemo(() => normalizeAcademicSubjectOptions(profile.timeline.map((item) => item.subject))
    .map((subject) => ({ subject, events: buildPrintTrendEvents(profile.timeline, subject) }))
    .filter((entry) => entry.events.length > 0), [profile.timeline]);
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
          <section className="sap-print-summary"><div><span>Assignment average</span><strong>{profile.summary.assignment_average == null ? '—' : `${profile.summary.assignment_average}%`}</strong><small>{profile.summary.completed_assignments} completed</small></div><div><span>Needs support</span><strong>{profile.summary.persistent_focus_count + profile.summary.recurring_focus_count}</strong><small>{profile.summary.persistent_focus_count} long-running</small></div><div><span>Making progress</span><strong>{profile.summary.improving_count}</strong><small>Moving in the right direction</small></div><div><span>Now secure</span><strong>{profile.summary.resolved_count}</strong><small>Previous needs resolved</small></div><div><span>Strengths</span><strong>{profile.summary.strength_count}</strong><small>Positive evidence</small></div></section>

          <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.overview}</span><div><h2>Subject overview</h2><p>A simple view of results and longer-term progress.</p></div></div><table><thead><tr><th>Subject</th><th>Average</th><th>Completed</th><th>Long-running support</th><th>Improving</th><th>Now secure</th><th>Strengths</th></tr></thead><tbody>{profile.subjects.map((entry) => <tr key={entry.subject}><td><strong>{entry.subject}</strong></td><td>{entry.assignment_average == null ? '—' : `${entry.assignment_average}%`}</td><td>{entry.completed_assignments}</td><td>{entry.persistent_focus_count}</td><td>{entry.improving_count}</td><td>{entry.resolved_count}</td><td>{entry.strength_count}</td></tr>)}</tbody></table></section>

          {includeFocus ? <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.focus}</span><div><h2>Needs support</h2><p>Current learning needs seen in assessed work.</p></div></div>{currentFocus.length ? <div className="sap-print-focus-grid">{currentFocus.map((item) => <article key={item.skill_key}><strong>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</strong><span>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</span><p>{String(item.status) === 'insufficient_evidence' ? 'New support signal' : formatLearningStatus(item.status)} · {item.evidence_items} evidence item{item.evidence_items === 1 ? '' : 's'} · first seen {formatDate(item.first_observed_at)} · latest {formatDate(item.last_observed_at)}</p></article>)}</div> : <p className="sap-print-empty">No current support needs are identified in this period.</p>}</section> : null}

          {includeStrengths ? <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.strengths}</span><div><h2>Strengths and progress</h2><p>Areas that are improving, secure or consistently strong.</p></div></div><div className="sap-print-three"><div><h3>Making progress</h3>{improving.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Now secure</h3>{resolved.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Strengths</h3>{strengths.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div></div></section> : null}

          {includeAssignments ? <section className="sap-print-section sap-print-page"><div className="sap-print-section-heading"><span>{sectionNumbers.assignments}</span><div><h2>Assignment results</h2><p>Completed assignments only.</p></div></div><table><thead><tr><th>Date</th><th>Subject</th><th>Assignment</th><th>Topic</th><th>Correct</th><th>Result</th></tr></thead><tbody>{profile.assignments.map((item) => <tr key={`${item.assignment_id}:${item.completed_at}`}><td>{formatDate(item.completed_at)}</td><td>{item.subject}</td><td><strong>{item.title}</strong></td><td>{item.topic || '—'}</td><td>{item.correct}/{item.correct + item.incorrect}</td><td><strong>{item.accuracy}%</strong></td></tr>)}</tbody></table></section> : null}

          {includeTimeline ? <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.timeline}</span><div><h2>Learning timeline and subject trends</h2><p>The graph is printed with numbered point details so the evidence remains understandable without hover.</p></div></div><div className="sap-print-trend-grid">{printTrendSubjects.map((entry) => <PrintSubjectTrendChart key={entry.subject} subject={entry.subject} events={entry.events}/>)}</div><div className="sap-print-timeline">{profile.timeline.slice(0, 80).map((item) => <p key={item.id}><time>{formatDate(item.observed_at)}</time><strong>{item.subskill ? `${item.skill} — ${item.subskill}` : item.skill}</strong><span>{sourceLabel(item)} · {item.subject} · {item.observation_type === 'focus' ? 'needs support' : item.observation_type === 'strength' ? 'strength' : 'developing'}{item.evidence_percentage == null ? '' : ` · ${item.evidence_percentage}%`}</span></p>)}</div></section> : null}

          {teacherComment.trim() ? <section className="sap-print-section"><div className="sap-print-section-heading"><span>{sectionNumbers.comment}</span><div><h2>Teacher comment</h2><p>Additional school context.</p></div></div><blockquote>{teacherComment.trim()}</blockquote></section> : null}
          <footer className="sap-print-footer"><span>{brand.name} · Confidential academic record</span><span>{reportId} · Generated securely through Brains Heist</span></footer>
        </article>
      </div>
    </div>,
    document.body,
  );
};

export default IndividualStudentAcademicReportV2;
