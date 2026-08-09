import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchStudentAcademicProfile,
  formatLearningStatus,
  type StudentAcademicProfile as StudentAcademicProfileData,
} from '../../services/studentAcademicProfileService';
import IndividualStudentAcademicReport from './IndividualStudentAcademicReport';
import './StudentAcademicProfile.css';

interface StudentAcademicProfileProps {
  studentId?: string | null;
  initialSubject?: string | null;
  mode?: 'student' | 'teacher';
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
  teacherName?: string | null;
  onClose?: () => void;
}

const scoreBand = (score: number | null) => {
  if (score === null) return 'neutral';
  if (score >= 80) return 'strong';
  if (score >= 60) return 'developing';
  return 'focus';
};

const statusBand = (status: string) => {
  if (status === 'persistent') return 'critical';
  if (status === 'recurring' || status === 'new_focus') return 'focus';
  if (status === 'improving') return 'improving';
  if (status === 'resolved') return 'resolved';
  return 'strong';
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const StudentAcademicProfile: React.FC<StudentAcademicProfileProps> = ({
  studentId,
  initialSubject,
  mode = 'teacher',
  schoolName,
  schoolLogoUrl,
  teacherName,
  onClose,
}) => {
  const [profile, setProfile] = useState<StudentAcademicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>(initialSubject || 'all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchStudentAcademicProfile({
          studentId,
          subject: subject === 'all' ? null : subject,
          dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : null,
          dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : null,
        });
        if (!cancelled) setProfile(next);
      } catch (err) {
        console.error('Failed to load student academic profile', err);
        if (!cancelled) setError('The academic profile could not be loaded. Please check your access and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [studentId, subject, dateFrom, dateTo]);

  const allSubjects = useMemo(() => {
    const values = new Set<string>();
    profile?.subjects.forEach((entry) => values.add(entry.subject));
    profile?.assignments.forEach((entry) => values.add(entry.subject));
    profile?.focus_areas.forEach((entry) => values.add(entry.subject));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [profile]);

  const strengths = useMemo(
    () => profile?.focus_areas.filter((item) => ['emerging_strength', 'consistent_strength'].includes(item.status)) ?? [],
    [profile],
  );
  const persistent = useMemo(
    () => profile?.focus_areas.filter((item) => item.status === 'persistent') ?? [],
    [profile],
  );
  const improving = useMemo(
    () => profile?.focus_areas.filter((item) => item.status === 'improving') ?? [],
    [profile],
  );
  const resolved = useMemo(
    () => profile?.focus_areas.filter((item) => item.status === 'resolved') ?? [],
    [profile],
  );
  const currentFocus = useMemo(
    () => profile?.focus_areas.filter((item) => ['new_focus', 'recurring', 'persistent'].includes(item.status)) ?? [],
    [profile],
  );

  if (loading) {
    return <section className="sap-shell sap-state"><div className="sap-loader"/><strong>Building academic profile…</strong><span>Combining assignments, writing evidence and progress history.</span></section>;
  }

  if (error || !profile) {
    return <section className="sap-shell sap-state sap-state--error"><strong>Academic profile unavailable</strong><span>{error || 'No profile data was returned.'}</span>{onClose ? <button type="button" onClick={onClose}>Back</button> : null}</section>;
  }

  return (
    <section className="sap-shell">
      <header className="sap-hero">
        <div className="sap-identity">
          {schoolLogoUrl ? <img src={schoolLogoUrl} alt="" className="sap-school-logo" /> : <div className="sap-school-mark">BH</div>}
          <div>
            <span className="sap-eyebrow">{mode === 'student' ? 'My Academic Progress' : 'Student Academic Profile'}</span>
            <h1>{profile.student.name}</h1>
            <p>{[profile.student.class_name ? `Class ${profile.student.class_name}` : null, profile.student.grade ? `Grade ${profile.student.grade}` : null, schoolName].filter(Boolean).join(' · ') || 'Academic progress record'}</p>
          </div>
        </div>
        <div className="sap-hero-actions">
          {onClose ? <button type="button" className="sap-btn sap-btn--secondary" onClick={onClose}>Back</button> : null}
          {mode === 'teacher' ? <button type="button" className="sap-btn sap-btn--primary" onClick={() => setShowReport(true)}>Generate individual report</button> : null}
        </div>
      </header>

      <div className="sap-filterbar" aria-label="Academic profile filters">
        <label>Subject<select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="all">All available subjects</option>{allSubjects.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <span className="sap-scope-note">{profile.scope.viewer === 'teacher' ? 'Showing only subjects assigned to you for this student.' : 'Showing authorised academic evidence.'}</span>
      </div>

      <div className="sap-kpis">
        <article><span>Assignment average</span><strong className={`sap-score sap-score--${scoreBand(profile.summary.assignment_average)}`}>{profile.summary.assignment_average === null ? '—' : `${profile.summary.assignment_average}%`}</strong><small>{profile.summary.completed_assignments} completed assignment{profile.summary.completed_assignments === 1 ? '' : 's'}</small></article>
        <article><span>Current focus areas</span><strong>{profile.summary.persistent_focus_count + profile.summary.recurring_focus_count}</strong><small>{profile.summary.persistent_focus_count} persistent</small></article>
        <article><span>Improving</span><strong className="sap-positive">{profile.summary.improving_count}</strong><small>Skills showing positive movement</small></article>
        <article><span>Resolved</span><strong className="sap-positive">{profile.summary.resolved_count}</strong><small>Previously identified focus areas</small></article>
        <article><span>Strengths</span><strong className="sap-positive">{profile.summary.strength_count}</strong><small>Emerging or consistent strengths</small></article>
      </div>

      <section className="sap-panel">
        <div className="sap-panel-heading"><div><span>Subject breakdown</span><h2>Attainment and learning signals</h2></div><p>Assignment averages are shown alongside longitudinal learning evidence; one low result does not automatically become a persistent weakness.</p></div>
        <div className="sap-subject-grid">
          {profile.subjects.map((entry) => (
            <article key={entry.subject} className="sap-subject-card">
              <div><h3>{entry.subject}</h3><span>{entry.completed_assignments} completed assignment{entry.completed_assignments === 1 ? '' : 's'}</span></div>
              <strong className={`sap-score sap-score--${scoreBand(entry.assignment_average)}`}>{entry.assignment_average === null ? 'Not assessed' : `${entry.assignment_average}%`}</strong>
              <dl><div><dt>Persistent</dt><dd>{entry.persistent_focus_count}</dd></div><div><dt>Improving</dt><dd>{entry.improving_count}</dd></div><div><dt>Resolved</dt><dd>{entry.resolved_count}</dd></div><div><dt>Strengths</dt><dd>{entry.strength_count}</dd></div></dl>
              <small>Latest evidence {formatDate(entry.latest_evidence_at)}</small>
            </article>
          ))}
          {!profile.subjects.length ? <div className="sap-empty">No subject evidence is available in the selected period.</div> : null}
        </div>
      </section>

      <div className="sap-two-column">
        <section className="sap-panel">
          <div className="sap-panel-heading"><div><span>Needs attention</span><h2>Persistent and recurring focus</h2></div><p>Prioritised from repeated qualifying evidence, not isolated mistakes.</p></div>
          <div className="sap-focus-list">
            {currentFocus.map((item) => <article key={item.skill_key}><div><span className={`sap-status sap-status--${statusBand(item.status)}`}>{formatLearningStatus(item.status)}</span><h3>{item.skill}</h3><p>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</p></div><dl><div><dt>First seen</dt><dd>{formatDate(item.first_observed_at)}</dd></div><div><dt>Latest</dt><dd>{formatDate(item.last_observed_at)}</dd></div><div><dt>Evidence</dt><dd>{item.evidence_items} item{item.evidence_items === 1 ? '' : 's'}</dd></div><div><dt>Latest</dt><dd>{item.latest_evidence_percentage == null ? '—' : `${item.latest_evidence_percentage}%`}</dd></div></dl></article>)}
            {!currentFocus.length ? <div className="sap-empty">No recurring or persistent focus areas are identified in this scope.</div> : null}
          </div>
        </section>

        <section className="sap-panel">
          <div className="sap-panel-heading"><div><span>Positive movement</span><h2>Strengths and improvement</h2></div><p>Shows areas where later evidence is stronger while preserving the earlier learning history.</p></div>
          <div className="sap-progress-columns">
            <div><h3>Improving</h3>{improving.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject} · since {formatDate(item.first_observed_at)}</span></p>)}{!improving.length ? <small>No improving areas in this scope.</small> : null}</div>
            <div><h3>Resolved</h3>{resolved.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject} · resolved by {formatDate(item.last_observed_at)}</span></p>)}{!resolved.length ? <small>No resolved areas in this scope.</small> : null}</div>
            <div><h3>Strengths</h3>{strengths.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject} · {formatLearningStatus(item.status)}</span></p>)}{!strengths.length ? <small>No established strengths in this scope yet.</small> : null}</div>
          </div>
        </section>
      </div>

      <section className="sap-panel">
        <div className="sap-panel-heading"><div><span>Assessment record</span><h2>Assignment marks and grades</h2></div><p>Completed assignment results in the selected scope. Missing work is intentionally not invented as a zero.</p></div>
        <div className="sap-table-wrap"><table className="sap-table"><thead><tr><th>Date</th><th>Subject</th><th>Assignment</th><th>Topic</th><th>Correct</th><th>Accuracy</th></tr></thead><tbody>{profile.assignments.map((item) => <tr key={`${item.assignment_id}:${item.completed_at}`}><td>{formatDate(item.completed_at)}</td><td>{item.subject}</td><td><strong>{item.title}</strong></td><td>{item.topic || '—'}</td><td>{item.correct}/{item.correct + item.incorrect}</td><td><span className={`sap-score-chip sap-score-chip--${scoreBand(item.accuracy)}`}>{item.accuracy}%</span></td></tr>)}</tbody></table>{!profile.assignments.length ? <div className="sap-empty">No completed assignment results are available in this scope.</div> : null}</div>
      </section>

      <section className="sap-panel">
        <div className="sap-panel-heading"><div><span>Longitudinal record</span><h2>Progress timeline</h2></div><p>Chronological evidence from school assignments, English Writing Hub work and authorised teacher observations.</p></div>
        <div className="sap-timeline">
          {profile.timeline.slice(0, 60).map((item) => <article key={item.id}><i className={`sap-dot sap-dot--${item.observation_type}`} /><time>{formatDate(item.observed_at)}</time><div><strong>{item.skill}</strong><span>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</span><p>{item.observation_type === 'focus' ? 'Focus evidence' : item.observation_type === 'strength' ? 'Strength evidence' : 'Developing evidence'}{item.evidence_percentage == null ? '' : ` · ${item.evidence_percentage}%`}{item.evidence_quality ? ` · ${item.evidence_quality} evidence` : ''}</p></div></article>)}
          {!profile.timeline.length ? <div className="sap-empty">No learning observations are available in this scope.</div> : null}
        </div>
      </section>

      {showReport ? <IndividualStudentAcademicReport profile={profile} schoolName={schoolName || undefined} schoolLogoUrl={schoolLogoUrl || undefined} teacherName={teacherName || undefined} onClose={() => setShowReport(false)} /> : null}
    </section>
  );
};

export default StudentAcademicProfile;
