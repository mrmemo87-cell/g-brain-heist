import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatLearningStatus, type StudentAcademicProfile } from '../../services/studentAcademicProfileService';

interface IndividualStudentAcademicReportProps {
  profile: StudentAcademicProfile;
  schoolName?: string;
  schoolLogoUrl?: string;
  teacherName?: string;
  onClose: () => void;
}

const safeText = (value: unknown) => String(value ?? '').trim();
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const IndividualStudentAcademicReport: React.FC<IndividualStudentAcademicReportProps> = ({ profile, schoolName, schoolLogoUrl, teacherName, onClose }) => {
  const [title, setTitle] = useState('Individual Student Academic Report');
  const [term, setTerm] = useState('');
  const [teacherComment, setTeacherComment] = useState('');
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [includeAssignments, setIncludeAssignments] = useState(true);
  const [includeStrengths, setIncludeStrengths] = useState(true);
  const [includeFocus, setIncludeFocus] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const reportId = useMemo(() => `BH-IAR-${new Date().getFullYear()}-${profile.student.id.slice(0, 8).toUpperCase()}`, [profile.student.id]);
  const generatedAt = useMemo(() => new Date().toLocaleString(), []);
  const currentFocus = profile.focus_areas.filter((item) => ['new_focus', 'recurring', 'persistent'].includes(item.status));
  const strengths = profile.focus_areas.filter((item) => ['emerging_strength', 'consistent_strength'].includes(item.status));
  const improving = profile.focus_areas.filter((item) => item.status === 'improving');
  const resolved = profile.focus_areas.filter((item) => item.status === 'resolved');

  const handlePrint = () => window.print();

  return createPortal(
    <div className="sap-report-overlay" role="presentation">
      <div className="sap-report-shell" role="dialog" aria-modal="true" aria-label="Individual Student Academic Report">
        <div className="sap-report-toolbar sap-no-print">
          <div><strong>Individual report builder</strong><span>Review the scope and optional sections before printing or saving as PDF.</span></div>
          <div><button type="button" onClick={onClose}>Close</button><button type="button" className="primary" onClick={handlePrint}>Print / Save PDF</button></div>
        </div>
        <div className="sap-report-controls sap-no-print">
          <label>Report title<input value={title} maxLength={90} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Term / period<input value={term} maxLength={50} onChange={(event) => setTerm(event.target.value)} placeholder="Optional" /></label>
          <label className="wide">Teacher comment<textarea value={teacherComment} maxLength={900} onChange={(event) => setTeacherComment(event.target.value)} placeholder="Optional professional comment for the report recipient." /></label>
          <fieldset><legend>Include</legend><label><input type="checkbox" checked={includeFocus} onChange={(event) => setIncludeFocus(event.target.checked)} /> Focus areas</label><label><input type="checkbox" checked={includeStrengths} onChange={(event) => setIncludeStrengths(event.target.checked)} /> Strengths & progress</label><label><input type="checkbox" checked={includeAssignments} onChange={(event) => setIncludeAssignments(event.target.checked)} /> Assignment record</label><label><input type="checkbox" checked={includeTimeline} onChange={(event) => setIncludeTimeline(event.target.checked)} /> Evidence timeline</label></fieldset>
        </div>

        <article className="sap-print-report" ref={printRef}>
          <header className="sap-print-header">
            <div className="sap-print-brand">{schoolLogoUrl ? <img src={schoolLogoUrl} alt="" /> : <div>BH</div>}<span><strong>{safeText(schoolName) || 'Brain Heist School Report'}</strong><small>Confidential academic progress record</small></span></div>
            <div className="sap-print-reference"><span>{reportId}</span><small>Generated {generatedAt}</small></div>
          </header>

          <section className="sap-print-title"><span>Student Academic Profile</span><h1>{safeText(title) || 'Individual Student Academic Report'}</h1><p>{term ? `${term} · ` : ''}{profile.scope.subject || 'All authorised subjects'}</p></section>

          <section className="sap-print-student-grid">
            <div><span>Student</span><strong>{profile.student.name}</strong></div><div><span>Class</span><strong>{profile.student.class_name || '—'}</strong></div><div><span>Grade</span><strong>{profile.student.grade || '—'}</strong></div><div><span>Prepared by</span><strong>{teacherName || 'Authorised teacher'}</strong></div>
          </section>

          <section className="sap-print-summary">
            <div><span>Assignment average</span><strong>{profile.summary.assignment_average == null ? '—' : `${profile.summary.assignment_average}%`}</strong><small>{profile.summary.completed_assignments} completed</small></div>
            <div><span>Persistent focus</span><strong>{profile.summary.persistent_focus_count}</strong><small>Repeated qualifying evidence</small></div>
            <div><span>Improving</span><strong>{profile.summary.improving_count}</strong><small>Positive longitudinal movement</small></div>
            <div><span>Resolved</span><strong>{profile.summary.resolved_count}</strong><small>Previously identified needs</small></div>
            <div><span>Strengths</span><strong>{profile.summary.strength_count}</strong><small>Emerging / consistent</small></div>
          </section>

          <section className="sap-print-section">
            <div className="sap-print-section-heading"><span>01</span><div><h2>Subject overview</h2><p>Attainment from completed assignments is shown separately from longitudinal learning signals.</p></div></div>
            <table><thead><tr><th>Subject</th><th>Assignment average</th><th>Completed</th><th>Persistent</th><th>Improving</th><th>Resolved</th><th>Strengths</th></tr></thead><tbody>{profile.subjects.map((entry) => <tr key={entry.subject}><td><strong>{entry.subject}</strong></td><td>{entry.assignment_average == null ? '—' : `${entry.assignment_average}%`}</td><td>{entry.completed_assignments}</td><td>{entry.persistent_focus_count}</td><td>{entry.improving_count}</td><td>{entry.resolved_count}</td><td>{entry.strength_count}</td></tr>)}</tbody></table>
          </section>

          {includeFocus ? <section className="sap-print-section">
            <div className="sap-print-section-heading"><span>02</span><div><h2>Current focus areas</h2><p>These areas are based on repeated or recent qualifying evidence. Isolated low results are not presented as persistent weaknesses.</p></div></div>
            {currentFocus.length ? <div className="sap-print-focus-grid">{currentFocus.map((item) => <article key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</span><p>{formatLearningStatus(item.status)} · {item.evidence_items} evidence item{item.evidence_items === 1 ? '' : 's'} · first observed {formatDate(item.first_observed_at)} · latest {formatDate(item.last_observed_at)}</p></article>)}</div> : <p className="sap-print-empty">No recurring or persistent focus areas are identified in the selected scope.</p>}
          </section> : null}

          {includeStrengths ? <section className="sap-print-section">
            <div className="sap-print-section-heading"><span>03</span><div><h2>Strengths and progress</h2><p>Positive movement is shown without removing earlier learning evidence.</p></div></div>
            <div className="sap-print-three"><div><h3>Improving</h3>{improving.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Resolved</h3>{resolved.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div><div><h3>Strengths</h3>{strengths.map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject}</span></p>)}</div></div>
          </section> : null}

          {includeAssignments ? <section className="sap-print-section sap-print-page">
            <div className="sap-print-section-heading"><span>04</span><div><h2>Assignment record</h2><p>Only completed assignments are included. Missing work is not silently converted into a zero.</p></div></div>
            <table><thead><tr><th>Date</th><th>Subject</th><th>Assignment</th><th>Topic</th><th>Correct</th><th>Accuracy</th></tr></thead><tbody>{profile.assignments.map((item) => <tr key={`${item.assignment_id}:${item.completed_at}`}><td>{formatDate(item.completed_at)}</td><td>{item.subject}</td><td><strong>{item.title}</strong></td><td>{item.topic || '—'}</td><td>{item.correct}/{item.correct + item.incorrect}</td><td><strong>{item.accuracy}%</strong></td></tr>)}</tbody></table>
          </section> : null}

          {includeTimeline ? <section className="sap-print-section">
            <div className="sap-print-section-heading"><span>05</span><div><h2>Evidence timeline</h2><p>A time-based record of assignment, writing and authorised teacher evidence.</p></div></div>
            <div className="sap-print-timeline">{profile.timeline.slice(0, 80).map((item) => <p key={item.id}><time>{formatDate(item.observed_at)}</time><strong>{item.skill}</strong><span>{item.subject} · {item.observation_type}{item.evidence_percentage == null ? '' : ` · ${item.evidence_percentage}%`}{item.evidence_quality ? ` · ${item.evidence_quality}` : ''}</span></p>)}</div>
          </section> : null}

          {teacherComment.trim() ? <section className="sap-print-section"><div className="sap-print-section-heading"><span>06</span><div><h2>Teacher comment</h2><p>Professional contextual note entered by the report author.</p></div></div><blockquote>{teacherComment.trim()}</blockquote></section> : null}

          <footer className="sap-print-footer"><span>{safeText(schoolName) || 'Brain Heist'} · Confidential — authorised educational use only</span><span>{reportId}</span></footer>
        </article>
      </div>
    </div>,
    document.body,
  );
};

export default IndividualStudentAcademicReport;
