import React, { useEffect, useMemo, useState } from 'react';
import { fetchTeacherAcademicProfileStudents, type TeacherAcademicProfileStudent } from '../../services/teacherAcademicProfileDirectoryService';
import { createLearningIntervention, evaluateLearningIntervention, getInterventionIntelligence, reviewLearningFocusEvidence, reviewLearningInterventionPlan, updateLearningIntervention, type InterventionIntelligence, type InterventionRecommendation, type LearningIntervention } from '../../services/studentInterventionService';
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
  const [reviewing, setReviewing] = useState<InterventionRecommendation | null>(null);
  const [goal, setGoal] = useState('');
  const [teachingAction, setTeachingAction] = useState('');
  const [evidenceTask, setEvidenceTask] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [targetStatus, setTargetStatus] = useState<LearningIntervention['target_status']>('improving');
  const [minimumFollowUp, setMinimumFollowUp] = useState(2);
  const [minimumSuccessful, setMinimumSuccessful] = useState(2);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [reviewRationale, setReviewRationale] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

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
    setLoading(true); setModalError(null);
    try {
      await createLearningIntervention({ studentId, skillKey: editing.skill_key, interventionType: editing.recommended_type, goal: goal || editing.suggested_goal, teachingAction, evidenceTask, targetDate, targetStatus, minimumFollowUpObservations: minimumFollowUp, minimumSuccessfulObservations: minimumSuccessful });
      setEditing(null); setGoal(''); setTeachingAction(''); setEvidenceTask(''); setTargetDate(''); setTargetStatus('improving'); setMinimumFollowUp(2); setMinimumSuccessful(2); await refresh();
    } catch (e) { setModalError(e instanceof Error ? e.message : 'The support plan could not be created.'); }
    finally { setLoading(false); }
  };
  const saveEvidenceReview = async (decision: 'confirmed' | 'needs_more_evidence') => {
    if (!reviewing) return;
    setLoading(true); setModalError(null);
    try {
      await reviewLearningFocusEvidence({ studentId, skillKey: reviewing.skill_key, decision, diagnosticTargets: selectedTargets, rationale: reviewRationale });
      setReviewing(null); setSelectedTargets([]); setReviewRationale(''); await refresh();
    } catch (e) { setModalError(e instanceof Error ? e.message : 'The evidence review could not be saved.'); }
    finally { setLoading(false); }
  };
  const openEvidenceReview = (recommendation: InterventionRecommendation) => {
    setModalError(null); setReviewing(recommendation);
    setSelectedTargets(recommendation.diagnostic_targets);
    setReviewRationale('');
  };
  const openPlanBuilder = (recommendation: InterventionRecommendation) => {
    const target = recommendation.diagnostic_targets[0] || recommendation.skill;
    setModalError(null); setEditing(recommendation); setGoal(recommendation.suggested_goal);
    setTeachingAction(`Model and practise ${target.toLowerCase()} using examples from the student's assessed work.`);
    setEvidenceTask(`Review the next assessed task for accurate, independent use of ${target.toLowerCase()}.`);
    setTargetDate(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  };
  const act = async (id: string, action: 'approve' | 'start' | 'complete' | 'cancel') => {
    let outcome: any = undefined; let note = '';
    if (action === 'approve') {
      note = prompt('Why is this plan and its measurable target appropriate for this student?', 'Teacher confirms this evidence-led plan and measurable follow-up target.') || '';
      if (note.trim().length < 10) return;
    }
    if (action === 'complete') {
      try {
        const evaluation = await evaluateLearningIntervention(id);
        if (evaluation.systemOutcome === 'insufficient_follow_up') {
          throw new Error(`More evidence is needed: ${evaluation.qualifyingFollowUpObservations}/${evaluation.minimumFollowUpObservations} qualifying and ${evaluation.successfulFollowUpObservations}/${evaluation.minimumSuccessfulObservations} successful follow-up observations.`);
        }
        const expected = evaluation.systemOutcome === 'contradictory' ? 'inconclusive' : evaluation.systemOutcome;
        outcome = prompt(`Measured outcome: ${expected}. Confirm it or enter an override: improved, resolved, no_change, declined, inconclusive, or needs_more_support.`, expected) || '';
        if (!['improved', 'resolved', 'no_change', 'declined', 'inconclusive', 'needs_more_support'].includes(outcome)) return;
        note = prompt('Record the professional rationale for this outcome.', outcome === expected ? 'Teacher confirms the measured follow-up outcome for this intervention.' : '') || '';
        if (note.trim().length < (outcome === expected ? 10 : 20)) return;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Follow-up evidence could not be evaluated.');
        return;
      }
    }
    if (action === 'cancel') { note = prompt('Reason for cancelling this intervention') || ''; if (note.trim().length < 10) return; }
    setLoading(true);
    try {
      if (action === 'approve') await reviewLearningInterventionPlan({ interventionId: id, decision: 'approved', rationale: note });
      else await updateLearningIntervention({ interventionId: id, action, note, outcomeStatus: outcome });
      await refresh();
    }
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

      <section className="intervention-panel"><div className="intervention-heading"><div><span>Recommended next steps</span><h2>Evidence-led intervention queue</h2></div><p>Each recommendation now separates the broad skill, the exact diagnostic targets, the evidence behind them, and the next professional decision.</p></div><div className="intervention-recommendations">{data.recommendations.map((r) => <article key={r.skill_key} className={`priority-${r.priority}`}><div className="intervention-card-top"><span>{r.subject}{r.topic ? ` · ${r.topic}` : ''}</span><b>{r.priority}</b></div><div className="intervention-title-row"><h3>{r.skill}</h3><span className={`authority-${r.evidence_authority}`}>{r.evidence_authority === 'teacher_validated' ? 'Teacher validated' : 'Automated history'}</span></div><p>{r.rationale}</p>
        <section className="intervention-diagnostic"><strong>What specifically needs attention</strong><div className="intervention-targets">{r.diagnostic_targets.length ? r.diagnostic_targets.map((target) => <span key={target}>{target}</span>) : <span>Specific target not yet identified</span>}</div>{r.evidence_examples.length ? <div className="intervention-examples">{r.evidence_examples.map((example, index) => <div key={`${example.original}-${index}`}><span><del>{example.original || 'Original phrase'}</del><b aria-hidden="true">→</b><ins>{example.better_version || 'Suggested correction'}</ins></span>{example.issue ? <small>{example.issue}</small> : null}</div>)}</div> : <small>No sentence-level example is available for this evidence source.</small>}</section>
        <dl><div><dt>Current position</dt><dd>{r.status.replaceAll('_', ' ')}</dd></div><div><dt>Qualifying evidence</dt><dd>{r.evidence_items}</dd></div><div><dt>Latest evidence</dt><dd>{fmt(r.last_observed_at)}</dd></div><div><dt>Confidence</dt><dd>{r.confidence?.band ? `${r.confidence.band} · ${Math.round(r.confidence.score || 0)}%` : 'Not ready'}</dd></div></dl>
        <div className={`intervention-readiness readiness-${r.readiness}`}><strong>{r.readiness === 'ready' ? 'Ready for a plan' : r.readiness === 'review_evidence' ? 'Teacher evidence review required' : r.readiness === 'open_plan' ? 'Plan already open' : 'Collect more assessed evidence'}</strong>{r.readiness_blocker ? <small>{r.readiness_blocker}</small> : null}</div>
        <div className="intervention-action"><span>{labels[r.recommended_type]}</span>{r.readiness === 'open_plan' ? <strong>Support plan already open</strong> : r.readiness === 'review_evidence' ? <button onClick={() => openEvidenceReview(r)}>Review exact evidence</button> : r.can_create_plan ? <button onClick={() => openPlanBuilder(r)}>Build support plan</button> : <strong>Planning is locked until evidence is ready</strong>}</div></article>)}{!data.recommendations.length ? <div className="intervention-empty">No unresolved areas currently require a support plan in this scope.</div> : null}</div></section>

      <section className="intervention-panel"><div className="intervention-heading"><div><span>Follow-up</span><h2>Student support history</h2></div><p>Follow-up means new assessed evidence collected after the frozen baseline. Brains Heist measures it; the teacher still confirms the outcome.</p></div><div className="intervention-plans">{data.interventions.map((i) => <article key={i.id}><div><span>{i.subject}</span><b>{i.status} · {i.approval_status.replaceAll('_', ' ')}</b></div><h3>{i.skill}</h3><p>{i.goal}</p>{i.teaching_action ? <div className="plan-step"><strong>Teacher action</strong><span>{i.teaching_action}</span></div> : null}{i.evidence_task ? <div className="plan-step"><strong>Follow-up evidence</strong><span>{i.evidence_task}</span></div> : null}<small>Frozen baseline: {i.baseline_status.replaceAll('_', ' ')} · {i.baseline_qualifying_observations} qualifying evidence item{i.baseline_qualifying_observations === 1 ? '' : 's'} · {i.baseline_snapshot_hash.slice(0, 12)}…</small><small>Success measure: at least {i.target_min_successful_observations} successful from {i.target_min_followup_observations} qualifying follow-ups · review {fmt(i.target_date)}</small><div className="follow-up-progress"><span>{i.follow_up_qualifying_observations || 0}/{i.target_min_followup_observations} qualifying</span><span>{i.follow_up_successful_observations || 0}/{i.target_min_successful_observations} successful</span></div>{i.system_outcome_status ? <strong>Measured follow-up: {i.system_outcome_status.replaceAll('_', ' ')}</strong> : null}{i.outcome_status ? <strong>Teacher-confirmed outcome: {i.outcome_status.replaceAll('_', ' ')}</strong> : null}<div>{i.status === 'planned' && i.approval_status === 'pending' ? <button onClick={() => void act(i.id, 'approve')}>Review & approve plan</button> : null}{i.status === 'planned' && ['approved', 'legacy_approved'].includes(i.approval_status) ? <button onClick={() => void act(i.id, 'start')}>Start plan</button> : null}{i.status === 'active' ? <button onClick={() => void act(i.id, 'complete')}>Evaluate follow-up & record outcome</button> : null}{['planned', 'active'].includes(i.status) ? <button className="secondary" onClick={() => void act(i.id, 'cancel')}>Cancel</button> : null}</div></article>)}{!data.interventions.length ? <div className="intervention-empty"><strong>No support plans yet.</strong><span>When evidence becomes decision-ready, review its exact targets and build the first measurable plan above.</span></div> : null}</div></section>
    </> : null}

    {reviewing ? <div className="intervention-modal-layer"><button className="backdrop" onClick={() => setReviewing(null)} aria-label="Close"/><section className="intervention-modal intervention-review-modal"><span>Professional evidence review</span><h2>Confirm what “{reviewing.skill}” means here</h2><p>Review the exact evidence before it can support a plan. This does not change the student’s work or rewrite the evidence history.</p>{reviewing.evidence_examples.length ? <div className="intervention-examples">{reviewing.evidence_examples.map((example, index) => <div key={`${example.original}-${index}`}><span><del>{example.original}</del><b aria-hidden="true">→</b><ins>{example.better_version}</ins></span><small>{example.issue}</small></div>)}</div> : null}<fieldset><legend>Confirmed diagnostic targets</legend>{reviewing.diagnostic_targets.map((target) => <label key={target} className="target-check"><input type="checkbox" checked={selectedTargets.includes(target)} onChange={(e) => setSelectedTargets((current) => e.target.checked ? [...current, target] : current.filter((item) => item !== target))}/><span>{target}</span></label>)}</fieldset><label>Professional rationale<textarea value={reviewRationale} onChange={(e) => setReviewRationale(e.target.value)} placeholder="Why does this evidence support—or not yet support—these targets?" /></label>{modalError ? <div className="modal-error" role="alert">{modalError}</div> : null}<div><button className="secondary" disabled={reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('needs_more_evidence')}>Needs more evidence</button><button disabled={!selectedTargets.length || reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('confirmed')}>Confirm evidence</button></div></section></div> : null}

    {editing ? <div className="intervention-modal-layer"><button className="backdrop" onClick={() => setEditing(null)} aria-label="Close"/><section className="intervention-modal"><span>{labels[editing.recommended_type]} · draft</span><h2>Build support for {editing.skill}</h2><div className="reviewed-evidence"><strong>Evidence reviewed</strong><span>{editing.diagnostic_targets.join(' · ')}</span></div><label>1. Measurable student goal<textarea value={goal} onChange={(e) => setGoal(e.target.value)} /></label><label>2. What the teacher will do<textarea value={teachingAction} onChange={(e) => setTeachingAction(e.target.value)} /></label><label>3. What will count as follow-up evidence<textarea value={evidenceTask} onChange={(e) => setEvidenceTask(e.target.value)} /></label><div className="intervention-measures"><label>Target status<select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as LearningIntervention['target_status'])}><option value="improving">Improving</option><option value="resolved">Resolved</option><option value="emerging_strength">Emerging strength</option><option value="consistent_strength">Consistent strength</option></select></label><label>Qualifying follow-ups<input type="number" min="1" max="20" value={minimumFollowUp} onChange={(e) => { const value = Number(e.target.value); setMinimumFollowUp(value); setMinimumSuccessful((current) => Math.min(current, value)); }} /></label><label>Successful follow-ups<input type="number" min="1" max={minimumFollowUp} value={minimumSuccessful} onChange={(e) => setMinimumSuccessful(Number(e.target.value))} /></label><label>Review date<input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></label></div><small>The evidence baseline will be frozen and hashed. This creates a draft only; a teacher must separately approve it before it starts.</small>{modalError ? <div className="modal-error" role="alert">{modalError}</div> : null}<div><button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button disabled={!targetDate || goal.trim().length < 10 || teachingAction.trim().length < 10 || evidenceTask.trim().length < 10 || loading} onClick={() => void createPlan()}>Create support plan draft</button></div></section></div> : null}
  </main>;
};

export default TeacherInterventionIntelligencePage;
