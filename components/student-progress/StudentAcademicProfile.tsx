import React, { useEffect, useMemo, useState } from 'react';
import {
  fetchStudentAcademicProfile,
  formatLearningStatus,
  type StudentAcademicProfile as StudentAcademicProfileData,
} from '../../services/studentAcademicProfileService';
import {
  getAcademicProgressExperienceContext,
  type AcademicProgressExperienceContext,
  type AcademicProgressViewerRole,
} from '../../services/academicProgressExperienceService';
import IndividualStudentAcademicReport from './IndividualStudentAcademicReport';
import { AcademicProgressHeader } from './AcademicProgressSuite';
import './StudentAcademicProfile.css';

interface StudentAcademicProfileProps {
  studentId?: string | null;
  initialSubject?: string | null;
  mode?: 'student' | 'teacher' | 'school_admin' | 'school_head';
  schoolName?: string | null;
  schoolLogoUrl?: string | null;
  teacherName?: string | null;
  backLabel?: string;
  onClose?: () => void;
}

const scoreBand = (score: number | null) => score === null ? 'neutral' : score >= 80 ? 'strong' : score >= 60 ? 'developing' : 'focus';
const statusBand = (status: string) => status === 'persistent' ? 'critical' : status === 'recurring' || status === 'new_focus' ? 'focus' : status === 'improving' ? 'improving' : status === 'resolved' ? 'resolved' : 'strong';
const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const StudentAcademicProfile: React.FC<StudentAcademicProfileProps> = ({
  studentId,
  initialSubject,
  mode = 'teacher',
  schoolName,
  schoolLogoUrl,
  teacherName,
  backLabel,
  onClose,
}) => {
  const [profile, setProfile] = useState<StudentAcademicProfileData | null>(null);
  const [context, setContext] = useState<AcademicProgressExperienceContext | null>(null);
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
        const [profileResult, contextResult] = await Promise.allSettled([
          fetchStudentAcademicProfile({
            studentId,
            subject: subject === 'all' ? null : subject,
            dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : null,
            dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : null,
          }),
          getAcademicProgressExperienceContext(studentId),
        ]);
        if (profileResult.status === 'rejected') throw profileResult.reason;
        if (cancelled) return;
        setProfile(profileResult.value);
        if (contextResult.status === 'fulfilled') setContext(contextResult.value);
      } catch (err) {
        console.error('Failed to load student academic profile', err);
        if (!cancelled) setError('The student progress record could not be loaded. Please check your access and try again.');
      } finally { if (!cancelled) setLoading(false); }
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

  const strengths = useMemo(() => profile?.focus_areas.filter((item) => ['emerging_strength', 'consistent_strength'].includes(item.status)) ?? [], [profile]);
  const improving = useMemo(() => profile?.focus_areas.filter((item) => item.status === 'improving') ?? [], [profile]);
  const resolved = useMemo(() => profile?.focus_areas.filter((item) => item.status === 'resolved') ?? [], [profile]);
  const currentFocus = useMemo(() => profile?.focus_areas.filter((item) => ['new_focus', 'recurring', 'persistent'].includes(item.status)) ?? [], [profile]);

  if (loading) return <section className="sap-shell sap-state"><div className="sap-loader"/><strong>Preparing student progress…</strong><span>Combining marks, writing evidence and progress over time.</span></section>;
  if (error || !profile) return <section className="sap-shell sap-state sap-state--error"><strong>Student progress unavailable</strong><span>{error || 'No progress data was returned.'}</span>{onClose ? <button type="button" onClick={onClose}>Back</button> : null}</section>;

  const viewerRole = (context?.viewer.role || profile.scope.viewer || mode) as AcademicProgressViewerRole;
  const resolvedContext: AcademicProgressExperienceContext = context || {
    viewer: { id: '', name: teacherName || '', role: viewerRole },
    school: { id: profile.student.school_id || '', name: schoolName || 'Brain Heist', logo_url: schoolLogoUrl || null },
  };
  const canGenerateReport = ['teacher', 'school_admin', 'school_head'].includes(viewerRole);
  const resolvedSchoolName = context?.school.name || schoolName || undefined;
  const resolvedSchoolLogo = context?.school.logo_url || schoolLogoUrl || undefined;
  const preparedBy = context?.viewer.name || teacherName || undefined;

  return <section className="sap-shell">
    <AcademicProgressHeader
      context={resolvedContext}
      eyebrow="Student Progress Record"
      title={profile.student.name}
      subtitle={[profile.student.grade ? `Grade ${profile.student.grade}` : null, profile.student.class_name ? `Class ${profile.student.class_name}` : null, 'Attainment, strengths and areas for development over time'].filter(Boolean).join(' · ')}
      onBack={onClose}
      backLabel={backLabel}
      actions={canGenerateReport ? <button type="button" className="aps-primary-button" onClick={() => setShowReport(true)}>Generate individual report</button> : null}
    />

    <div className="sap-filterbar" aria-label="Progress record filters">
      <label>Subject<select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="all">All available subjects</option>{allSubjects.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
      <label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
      <span className="sap-scope-note">{profile.scope.viewer === 'teacher' ? 'This view is limited to the subjects assigned to you for this student.' : 'Showing authorised school academic evidence.'}</span>
    </div>

    <div className="sap-kpis">
      <article><span>Assignment average</span><strong className={`sap-score sap-score--${scoreBand(profile.summary.assignment_average)}`}>{profile.summary.assignment_average === null ? '—' : `${profile.summary.assignment_average}%`}</strong><small>{profile.summary.completed_assignments} completed assignment{profile.summary.completed_assignments === 1 ? '' : 's'}</small></article>
      <article><span>Areas needing support</span><strong>{profile.summary.persistent_focus_count + profile.summary.recurring_focus_count}</strong><small>{profile.summary.persistent_focus_count} persistent</small></article>
      <article><span>Improving</span><strong className="sap-positive">{profile.summary.improving_count}</strong><small>Positive movement</small></article>
      <article><span>Resolved</span><strong className="sap-positive">{profile.summary.resolved_count}</strong><small>Previous needs now secure</small></article>
      <article><span>Strengths</span><strong className="sap-positive">{profile.summary.strength_count}</strong><small>Emerging or consistent</small></article>
    </div>

    <section className="sap-panel">
      <div className="sap-panel-heading"><div><span>Subject breakdown</span><h2>Attainment and progress</h2></div><p>Marks are shown alongside longer-term learning patterns so staff can distinguish a one-off result from a recurring need.</p></div>
      <div className="sap-subject-grid">{profile.subjects.map((entry) => <article key={entry.subject} className="sap-subject-card"><div><h3>{entry.subject}</h3><span>{entry.completed_assignments} completed</span></div><strong className={`sap-score sap-score--${scoreBand(entry.assignment_average)}`}>{entry.assignment_average === null ? 'Not assessed' : `${entry.assignment_average}%`}</strong><dl><div><dt>Persistent</dt><dd>{entry.persistent_focus_count}</dd></div><div><dt>Improving</dt><dd>{entry.improving_count}</dd></div><div><dt>Resolved</dt><dd>{entry.resolved_count}</dd></div><div><dt>Strengths</dt><dd>{entry.strength_count}</dd></div></dl><small>Latest evidence {formatDate(entry.latest_evidence_at)}</small></article>)}{!profile.subjects.length ? <div className="sap-empty">No subject evidence is available in the selected period.</div> : null}</div>
    </section>

    <div className="sap-two-column">
      <section className="sap-panel"><div className="sap-panel-heading"><div><span>Persistent and recurring focus</span><h2>Current areas for development</h2></div><p>Repeated assessed evidence is prioritised; one low result does not automatically become a persistent weakness.</p></div><div className="sap-focus-list">{currentFocus.map((item) => <article key={item.skill_key}><div><span className={`sap-status sap-status--${statusBand(item.status)}`}>{formatLearningStatus(item.status)}</span><h3>{item.skill}</h3><p>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</p></div><dl><div><dt>First identified</dt><dd>{formatDate(item.first_observed_at)}</dd></div><div><dt>Latest evidence</dt><dd>{formatDate(item.last_observed_at)}</dd></div><div><dt>Assessed evidence</dt><dd>{item.evidence_items}</dd></div><div><dt>Latest result</dt><dd>{item.latest_evidence_percentage == null ? '—' : `${item.latest_evidence_percentage}%`}</dd></div></dl></article>)}{!currentFocus.length ? <div className="sap-empty">No recurring or persistent areas for development are identified in this scope.</div> : null}</div></section>
      <section className="sap-panel"><div className="sap-panel-heading"><div><span>Positive movement</span><h2>Strengths and improvement</h2></div><p>Earlier evidence remains in the history while later progress is recognised clearly.</p></div><div className="sap-progress-columns"><div><h3>Improving</h3>{improving.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject} · since {formatDate(item.first_observed_at)}</span></p>)}{!improving.length ? <small>No improving areas in this scope.</small> : null}</div><div><h3>Resolved</h3>{resolved.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject} · latest evidence {formatDate(item.last_observed_at)}</span></p>)}{!resolved.length ? <small>No resolved areas in this scope.</small> : null}</div><div><h3>Strengths</h3>{strengths.slice(0, 6).map((item) => <p key={item.skill_key}><strong>{item.skill}</strong><span>{item.subject} · {formatLearningStatus(item.status)}</span></p>)}{!strengths.length ? <small>No established strengths in this scope yet.</small> : null}</div></div></section>
    </div>

    <section className="sap-panel"><div className="sap-panel-heading"><div><span>Assessment record</span><h2>Assignment marks and grades</h2></div><p>Completed assignments only. Missing work is never silently converted into a zero.</p></div><div className="sap-table-wrap"><table className="sap-table"><thead><tr><th>Date</th><th>Subject</th><th>Assignment</th><th>Topic</th><th>Correct</th><th>Result</th></tr></thead><tbody>{profile.assignments.map((item) => <tr key={`${item.assignment_id}:${item.completed_at}`}><td>{formatDate(item.completed_at)}</td><td>{item.subject}</td><td><strong>{item.title}</strong></td><td>{item.topic || '—'}</td><td>{item.correct}/{item.correct + item.incorrect}</td><td><span className={`sap-score-chip sap-score-chip--${scoreBand(item.accuracy)}`}>{item.accuracy}%</span></td></tr>)}</tbody></table>{!profile.assignments.length ? <div className="sap-empty">No completed assignment results are available in this scope.</div> : null}</div></section>

    <section className="sap-panel"><div className="sap-panel-heading"><div><span>Progress timeline</span><h2>Learning timeline</h2></div><p>Dated evidence from school assignments, English Writing Hub work and authorised teacher observations.</p></div><div className="sap-timeline">{profile.timeline.slice(0, 60).map((item) => <article key={item.id}><i className={`sap-dot sap-dot--${item.observation_type}`} /><time>{formatDate(item.observed_at)}</time><div><strong>{item.skill}</strong><span>{item.subject}{item.topic ? ` · ${item.topic}` : ''}</span><p>{item.observation_type === 'focus' ? 'Area for development' : item.observation_type === 'strength' ? 'Strength evidence' : 'Developing evidence'}{item.evidence_percentage == null ? '' : ` · ${item.evidence_percentage}%`}</p></div></article>)}{!profile.timeline.length ? <div className="sap-empty">No learning observations are available in this scope.</div> : null}</div></section>

    {showReport ? <IndividualStudentAcademicReport profile={profile} schoolName={resolvedSchoolName} schoolLogoUrl={resolvedSchoolLogo} teacherName={preparedBy} onClose={() => setShowReport(false)} /> : null}
  </section>;
};

export default StudentAcademicProfile;
