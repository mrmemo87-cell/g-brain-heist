import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  getSchoolHeadLearningIntelligence,
  type SchoolHeadLearningIntelligence,
} from '../../services/schoolHeadLearningIntelligenceService';
import { SchoolBrand } from '../../src/components/SchoolBrand';
import { createSchoolBrand } from '../../src/lib/schoolBranding';
import AcademicReportBuilder from '../student-progress/AcademicReportBuilder';
import './SchoolHeadLearningIntelligence.css';
import './SchoolHeadLearningIntelligence.light.css';

const AcademicIntelligenceGovernance = lazy(() => import('./AcademicIntelligenceGovernance'));

interface Props { schoolId: string; schoolName?: string | null; schoolLogoUrl?: string | null; onBack?: () => void; }

const formatPercent = (value: number | null) => value == null ? 'No data' : `${Math.round(value * 10) / 10}%`;
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const ratio = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;

const SchoolHeadLearningIntelligence: React.FC<Props> = ({ schoolId, schoolName, schoolLogoUrl, onBack }) => {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<SchoolHeadLearningIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('all');
  const [className, setClassName] = useState('all');
  const [showReportBuilder, setShowReportBuilder] = useState(false);
  const [showGovernance, setShowGovernance] = useState(false);
  const brand = createSchoolBrand({ schoolId, schoolName, schoolLogoUrl });

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    getSchoolHeadLearningIntelligence(schoolId, days)
      .then((next) => { if (!cancelled) setData(next); })
      .catch((err) => { console.error('School Head learning intelligence failed', err); if (!cancelled) setError(err instanceof Error ? err.message : 'Academic intelligence could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [schoolId, days]);

  const subjects = data?.subjects ?? [];
  const classes = data?.classes ?? [];
  const prioritySkills = useMemo(() => (data?.priority_skills ?? []).filter((row) => subject === 'all' || row.subject === subject), [data, subject]);
  const supportStudents = useMemo(() => (data?.students_needing_support ?? []).filter((row) => {
    if (className !== 'all' && row.class_name !== className) return false;
    if (subject !== 'all' && !row.focus_subjects.includes(subject)) return false;
    return true;
  }), [data, className, subject]);

  if (loading && !data) return <main className="shli-shell"><div className="shli-state"><b>BH</b><h1>Building academic progress intelligence…</h1><p>Combining school attainment and progress history.</p></div></main>;
  if (error || !data) return <main className="shli-shell"><div className="shli-state is-error"><b>!</b><h1>Academic progress unavailable</h1><p>{error || 'No response was returned.'}</p><button onClick={() => window.location.reload()}>Try again</button></div></main>;

  const s = data.summary;
  const coverage = ratio(s.students_with_learning_memory, s.students);
  const persistentRate = ratio(s.students_with_persistent_focus, s.students_with_learning_memory || s.students);

  return <main className="shli-shell">
    <header className="shli-header">
      <div><SchoolBrand brand={brand} className="mb-3 font-semibold" imageClassName="h-12 w-12 rounded-xl object-contain" /><span>School Head · Academic Performance</span><h1>Academic Progress & Support</h1><p>School-wide view of attainment, recurring learning needs, improvement and strengths — with evidence over time.</p></div>
      <div className="shli-actions"><label>Live view period<select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>12 months</option></select></label><button className="is-primary" onClick={() => setShowReportBuilder(true)}>Build term / annual report</button><button onClick={() => setShowGovernance(true)}>Govern rollout</button><button onClick={onBack || (() => window.history.back())}>Back to Academic Performance</button></div>
    </header>

    <section className="shli-assurance"><strong>How to read this view</strong><p>Assignment averages use the selected period. Persistent, improving and resolved learning states use the full qualifying evidence history — not just the selected period. One isolated low result never creates a persistent weakness.</p></section>

    <section className="shli-kpis"><article><span>Progress coverage</span><strong>{coverage}%</strong><small>{s.students_with_learning_memory} of {s.students} active students</small></article><article className={s.students_with_persistent_focus ? 'is-attention' : 'is-good'}><span>Students needing sustained support</span><strong>{s.students_with_persistent_focus}</strong><small>{persistentRate}% of tracked students</small></article><article className="is-positive"><span>Students improving</span><strong>{s.students_improving}</strong><small>Current positive movement</small></article><article className="is-positive"><span>Students with resolved areas</span><strong>{s.students_with_resolved_areas}</strong><small>Earlier needs now secure</small></article><article><span>Period assignment average</span><strong>{formatPercent(s.period_assignment_average)}</strong><small>{s.period_completed_assignments} completed assignments</small></article><article className={s.stale_persistent_areas ? 'is-warning' : 'is-good'}><span>Needs fresh evidence</span><strong>{s.stale_persistent_areas}</strong><small>Persistent areas not reassessed for 60+ days</small></article></section>

    {s.stale_persistent_areas > 0 ? <section className="shli-callout is-warning"><div><span>Reassessment gap</span><h2>{s.stale_persistent_areas} area{s.stale_persistent_areas === 1 ? '' : 's'} need fresh evidence</h2><p>This does not mean the student has failed to improve. It means the school should reassess before treating the previous status as current.</p></div></section> : null}

    <div className="shli-grid-two"><section className="shli-panel"><header><div><span>Subject intelligence</span><h2>Where support is concentrated</h2></div><small>Current progress state + {days}-day attainment</small></header><div className="shli-table-wrap"><table><thead><tr><th>Subject</th><th>Avg.</th><th>Tracked</th><th>Persistent students</th><th>Improving</th><th>Resolved</th></tr></thead><tbody>{subjects.map((row) => <tr key={row.subject}><td><button className="shli-link" onClick={() => setSubject(subject === row.subject ? 'all' : row.subject)}>{row.subject}</button></td><td>{formatPercent(row.assignment_average)}</td><td>{row.students_tracked}</td><td><b className={row.persistent_students ? 'warn' : ''}>{row.persistent_students}</b></td><td>{row.improving_students}</td><td>{row.resolved_students}</td></tr>)}</tbody></table></div></section><section className="shli-panel"><header><div><span>Class intelligence</span><h2>Support needs by class</h2></div><small>Students, not raw error counts</small></header><div className="shli-class-list">{classes.map((row) => <button key={row.class_id} className={className === row.class_name ? 'active' : ''} onClick={() => setClassName(className === row.class_name ? 'all' : row.class_name)}><span><strong>{row.class_name}</strong><small>{row.tracked_students}/{row.student_count} students tracked</small></span><span><b>{row.persistent_students}</b><small>persistent</small></span><span><b>{row.improving_students}</b><small>improving</small></span><span><b>{formatPercent(row.assignment_average)}</b><small>period avg.</small></span></button>)}</div></section></div>

    <section className="shli-panel"><header><div><span>Curriculum priorities</span><h2>{subject === 'all' ? 'Most persistent school-wide skills' : `${subject} priorities`}</h2></div>{subject !== 'all' ? <button className="shli-reset" onClick={() => setSubject('all')}>Clear subject filter</button> : null}</header>{prioritySkills.length ? <div className="shli-priority-grid">{prioritySkills.slice(0, 18).map((row) => <article key={`${row.subject}:${row.topic || ''}:${row.skill}`}><div><span>{row.subject}{row.topic ? ` · ${row.topic}` : ''}</span><h3>{row.skill}</h3></div><dl><div><dt>Persistent</dt><dd>{row.persistent_students}</dd></div><div><dt>Recurring</dt><dd>{row.recurring_students}</dd></div><div><dt>Improving</dt><dd>{row.improving_students}</dd></div></dl><p>Latest evidence {formatDate(row.last_observed_at)}{row.stale_persistent_students ? ` · ${row.stale_persistent_students} student${row.stale_persistent_students === 1 ? '' : 's'} need reassessment` : ''}</p></article>)}</div> : <div className="shli-empty">No current areas for development match this filter.</div>}</section>

    <section className="shli-panel"><header><div><span>Student intervention queue</span><h2>Who may need coordinated follow-up</h2></div><div className="shli-filters"><select value={className} onChange={(e) => setClassName(e.target.value)}><option value="all">All classes</option>{classes.map((row) => <option key={row.class_id} value={row.class_name}>{row.class_name}</option>)}</select><select value={subject} onChange={(e) => setSubject(e.target.value)}><option value="all">All subjects</option>{subjects.map((row) => <option key={row.subject}>{row.subject}</option>)}</select></div></header><div className="shli-students">{supportStudents.map((row) => <article key={row.student_id}><div><strong>{row.student_name}</strong><span>{row.class_name}{row.grade ? ` · Grade ${row.grade}` : ''}</span><small>{row.focus_subjects.join(' · ') || 'No subject label'}</small></div><div className="shli-student-counts"><span><b>{row.persistent_count}</b> persistent</span><span><b>{row.recurring_count}</b> recurring</span><span><b>{row.improving_count}</b> improving</span></div><div><small>Latest evidence {formatDate(row.latest_evidence_at)}</small><a href={`/academic-profile.html?student=${encodeURIComponent(row.student_id)}`}>Open student progress →</a></div></article>)}{!supportStudents.length ? <div className="shli-empty">No students match the selected filters.</div> : null}</div></section>

    <section className="shli-panel"><header><div><span>School strengths</span><h2>Skills showing consistent strength</h2></div><small>Recognise what is working, not only what needs fixing</small></header><div className="shli-strengths">{data.school_strengths.map((row) => <article key={`${row.subject}:${row.skill}`}><span>{row.subject}</span><strong>{row.skill}</strong><small>{row.students} student{row.students === 1 ? '' : 's'} showing consistent strength</small></article>)}</div></section>

    <footer className="shli-footer">Generated {new Date(data.generated_at).toLocaleString()} · {brand.name} · School-scoped academic intelligence.</footer>
    {showReportBuilder ? <AcademicReportBuilder
      schoolId={schoolId}
      schoolName={brand.name}
      schoolLogoUrl={brand.logoUrl}
      initialSubject={subject === 'all' ? null : subject}
      appearance="school-head-light"
      onClose={() => setShowReportBuilder(false)}
    /> : null}
    {showGovernance ? <Suspense fallback={<div className="shli-governance-loading" role="status">Opening governed rollout controls…</div>}><AcademicIntelligenceGovernance schoolId={schoolId} onClose={() => setShowGovernance(false)} /></Suspense> : null}
  </main>;
};

export default SchoolHeadLearningIntelligence;
