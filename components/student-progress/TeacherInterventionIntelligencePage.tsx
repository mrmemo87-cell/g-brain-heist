import React, { useEffect, useMemo, useState } from 'react';
import { fetchTeacherAcademicProfileStudents, type TeacherAcademicProfileStudent } from '../../services/teacherAcademicProfileDirectoryService';
import { createLearningIntervention, getInterventionIntelligence, updateLearningIntervention, type InterventionIntelligence, type InterventionRecommendation } from '../../services/studentInterventionService';
import { getAcademicProgressExperienceContext, type AcademicProgressExperienceContext } from '../../services/academicProgressExperienceService';
import { AcademicProgressHeader, AcademicStudentPicker, selectionFromStudent } from './AcademicProgressSuite';
import './TeacherInterventionIntelligencePage.css';

const labels: Record<string, string> = {
  targeted_question_practice: 'Targeted question practice',
  writing_practice: 'Writing Hub practice',
  reassessment: 'Reassess first',
  teacher_support: 'Teacher support',
  custom: 'Custom support',
};
const fmt = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

interface TeacherInterventionIntelligencePageProps {
  onBack?: () => void;
}

const TeacherInterventionIntelligencePage: React.FC<TeacherInterventionIntelligencePageProps> = ({ onBack }) => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [students, setStudents] = useState<TeacherAcademicProfileStudent[]>([]);
  const [context, setContext] = useState<AcademicProgressExperienceContext | null>(null);
  const [grade, setGrade] = useState('');
  const [className, setClassName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState('all');
  const [data, setData] = useState<InterventionIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InterventionRecommendation | null>(null);
  const [goal, setGoal] = useState('');
  const [targetDate, setTargetDate] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [list, nextContext] = await Promise.all([
          fetchTeacherAcademicProfileStudents(),
          getAcademicProgressExperienceContext(),
        ]);
        if (cancelled) return;
        setStudents(list); setContext(nextContext);
        const requestedStudent = params.get('student') || '';
        if (requestedStudent) {
          const selection = selectionFromStudent(list, requestedStudent);
          if (selection) { setGrade(selection.grade); setClassName(selection.className); setStudentId(requestedStudent); setSubject(params.get('subject') || 'all'); }
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Students could not be loaded.'); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load(); return () => { cancelled = true; };
  }, [params]);

  useEffect(() => {
    if (!studentId) { setData(null); return; }
    setLoading(true); setError(null);
    void getInterventionIntelligence(studentId, subject === 'all' ? null : subject)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Student support information could not be loaded.'))
      .finally(() => setLoading(false));
  }, [studentId, subject]);

  const refresh = async () => { if (studentId) setData(await getInterventionIntelligence(studentId, subject === 'all' ? null : subject)); };
  const createPlan = async () => {
    if (!editing) return;
    setLoading(true); setError(null);
    try {
      await createLearningIntervention({ studentId, skillKey: editing.skill_key, interventionType: editing.recommended_type, goal: goal || editing.suggested_goal, targetDate: targetDate || null });
      setEditing(null); setGoal(''); setTargetDate(''); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'The support plan could not be created.'); }
    finally { setLoading(false); }
  };
  const act = async (id: string, action: 'start' | 'complete' | 'cancel') => {
    let outcome: any = undefined; let note = '';
    if (action === 'complete') {
      outcome = prompt('Outcome: improved, resolved, no_change, or needs_more_support') || '';
      if (!['improved', 'resolved', 'no_change', 'needs_more_support'].includes(outcome)) return;
      note = prompt('Optional outcome note') || '';
    }
    if (action === 'cancel') note = prompt('Reason for cancelling (optional)') || '';
    setLoading(true);
    try { await updateLearningIntervention({ interventionId: id, action, note, outcomeStatus: outcome }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The support plan could not be updated.'); }
    finally { setLoading(false); }
  };

  const highPriority = data?.recommendations.filter((item) => item.priority === 'high').length || 0;
  const openPlans = data?.interventions.filter((item) => ['planned', 'active'].includes(item.status)).length || 0;

  return <main className="intervention-page">
    <AcademicProgressHeader
      context={context}
      eyebrow="Student Support"
      title="Student Support Plans"
      subtitle="Choose a student, review repeated learning needs, and turn them into clear next steps that can be followed over time."
      onBack={onBack}
      backLabel={onBack ? 'Back to Teacher Workspace' : (context?.viewer.role === 'school_admin' ? 'Back to School Administration' : 'Back to Teacher Workspace')}
    />

    <AcademicStudentPicker
      students={students}
      grade={grade}
      className={className}
      studentId={studentId}
      subject={subject}
      onGradeChange={(value) => { setGrade(value); setClassName(''); setStudentId(''); setSubject('all'); }}
      onClassChange={(value) => { setClassName(value); setStudentId(''); setSubject('all'); }}
      onStudentChange={(value) => { setStudentId(value); setSubject('all'); }}
      onSubjectChange={setSubject}
    />

    {error ? <div className="intervention-alert">{error}</div> : null}
    {!studentId ? <div className="aps-empty-state">Choose a grade, class and student to review support needs.</div> : null}
    {loading && studentId && !data ? <div className="intervention-loading">Loading student support information…</div> : null}

    {data ? <>
      <section className="intervention-student"><div><span>Student support overview</span><h2>{data.student.name}</h2><p>Grade {data.student.grade || '—'} · Class {data.student.class_name || '—'}{subject !== 'all' ? ` · ${subject}` : ''}</p></div><div className="intervention-card-top"><span><b>{highPriority}</b> high priority</span><span><b>{openPlans}</b> open plan{openPlans === 1 ? '' : 's'}</span></div></section>

      <section className="intervention-panel"><div className="intervention-heading"><div><span>Recommended next steps</span><h2>Where support should focus now</h2></div><p>Recommendations use repeated assessed evidence. If evidence is old, Brain Heist recommends reassessment before further intervention.</p></div><div className="intervention-recommendations">{data.recommendations.map((r) => <article key={r.skill_key} className={`priority-${r.priority}`}><div className="intervention-card-top"><span>{r.subject}{r.topic ? ` · ${r.topic}` : ''}</span><b>{r.priority}</b></div><h3>{r.skill}</h3><p>{r.rationale}</p><dl><div><dt>Current position</dt><dd>{r.status.replaceAll('_', ' ')}</dd></div><div><dt>Assessed evidence</dt><dd>{r.evidence_items}</dd></div><div><dt>Latest evidence</dt><dd>{fmt(r.last_observed_at)}</dd></div><div><dt>Practice available</dt><dd>{r.available_questions} questions</dd></div></dl><div className="intervention-action"><span>{labels[r.recommended_type]}</span>{r.has_open_intervention ? <strong>Support plan already open</strong> : <button onClick={() => { setEditing(r); setGoal(r.suggested_goal); }}>Create support plan</button>}</div></article>)}{!data.recommendations.length ? <div className="intervention-empty">No unresolved areas currently require a support plan in this scope.</div> : null}</div></section>

      <section className="intervention-panel"><div className="intervention-heading"><div><span>Follow-up</span><h2>Student support history</h2></div><p>Plans keep the original baseline so the school can see whether support actually improved the outcome.</p></div><div className="intervention-plans">{data.interventions.map((i) => <article key={i.id}><div><span>{i.subject}</span><b>{i.status}</b></div><h3>{i.skill}</h3><p>{i.goal}</p><small>Started from: {i.baseline_status.replaceAll('_', ' ')} · {i.baseline_evidence_items} assessed evidence item{i.baseline_evidence_items === 1 ? '' : 's'} · created {fmt(i.created_at)}</small>{i.outcome_status ? <strong>Outcome: {i.outcome_status.replaceAll('_', ' ')}</strong> : null}<div>{i.status === 'planned' ? <button onClick={() => void act(i.id, 'start')}>Start plan</button> : null}{i.status === 'active' ? <button onClick={() => void act(i.id, 'complete')}>Complete & record outcome</button> : null}{['planned', 'active'].includes(i.status) ? <button className="secondary" onClick={() => void act(i.id, 'cancel')}>Cancel</button> : null}</div></article>)}{!data.interventions.length ? <div className="intervention-empty">No support plans have been created for this student yet.</div> : null}</div></section>
    </> : null}

    {editing ? <div className="intervention-modal-layer"><button className="backdrop" onClick={() => setEditing(null)} aria-label="Close"/><section className="intervention-modal"><span>{labels[editing.recommended_type]}</span><h2>{editing.skill}</h2><p>{editing.rationale}</p><label>Support goal<textarea value={goal} onChange={(e) => setGoal(e.target.value)} /></label><label>Review date<input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></label><small>The current student position is saved as the baseline so progress can be reviewed fairly later.</small><div><button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button onClick={() => void createPlan()}>Create support plan</button></div></section></div> : null}
  </main>;
};

export default TeacherInterventionIntelligencePage;
