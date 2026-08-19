import React, { useEffect, useMemo, useState } from 'react';
import { fetchTeacherAcademicProfileStudents, type TeacherAcademicProfileStudent } from '../../services/teacherAcademicProfileDirectoryService';
import {
  createLearningIntervention,
  evaluateLearningIntervention,
  getInterventionIntelligence,
  reviewLearningFocusEvidence,
  reviewLearningInterventionPlan,
  updateLearningIntervention,
  type InterventionIntelligence,
  type InterventionRecommendation,
  type LearningIntervention,
} from '../../services/studentInterventionService';
import { getAcademicProgressExperienceContext, type AcademicProgressExperienceContext } from '../../services/academicProgressExperienceService';
import { AcademicProgressHeader, AcademicStudentPicker, selectionFromStudent } from './AcademicProgressSuite';
import './TeacherInterventionIntelligencePage.css';
import './TeacherInterventionIntelligencePageV2.css';

const labels: Record<string, string> = {
  targeted_question_practice: 'Practice questions',
  writing_practice: 'Writing practice',
  reassessment: 'Check understanding again',
  teacher_support: 'Teacher support',
  custom: 'Custom support',
};
const fmt = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const schoolStatus = (value: string) => ({
  insufficient_evidence: 'New support signal', new_focus: 'New support need', recurring: 'Repeated need', persistent: 'Long-running need', improving: 'Improving', resolved: 'Secure now', emerging_strength: 'Emerging strength', consistent_strength: 'Consistent strength',
}[value] || value.replaceAll('_', ' '));
const readinessLabel = (value: InterventionRecommendation['readiness']) => value === 'ready' ? 'Ready to make a plan' : value === 'review_evidence' ? 'Check the evidence first' : value === 'open_plan' ? 'Support plan already open' : 'More assessed work is needed first';

interface TeacherInterventionIntelligencePageProps { onBack?: () => void; }

const TeacherInterventionIntelligencePageV2: React.FC<TeacherInterventionIntelligencePageProps> = ({ onBack }) => {
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
        const [list, nextContext] = await Promise.all([fetchTeacherAcademicProfileStudents(), getAcademicProgressExperienceContext()]);
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
    setModalError(null); setReviewing(recommendation); setSelectedTargets(recommendation.diagnostic_targets); setReviewRationale('');
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
      note = prompt('Why is this support plan appropriate for this student?', 'Teacher confirms this plan and the follow-up target.') || '';
      if (note.trim().length < 10) return;
    }
    if (action === 'complete') {
      try {
        const evaluation = await evaluateLearningIntervention(id);
        if (evaluation.systemOutcome === 'insufficient_follow_up') throw new Error(`More assessed work is needed: ${evaluation.qualifyingFollowUpObservations}/${evaluation.minimumFollowUpObservations} follow-ups completed.`);
        const expected = evaluation.systemOutcome === 'contradictory' ? 'inconclusive' : evaluation.systemOutcome;
        outcome = prompt(`Measured outcome: ${expected}. Confirm it or enter: improved, resolved, no_change, declined, inconclusive, or needs_more_support.`, expected) || '';
        if (!['improved', 'resolved', 'no_change', 'declined', 'inconclusive', 'needs_more_support'].includes(outcome)) return;
        note = prompt('Add a short teacher note explaining the outcome.', outcome === expected ? 'Teacher confirms the measured follow-up outcome.' : '') || '';
        if (note.trim().length < (outcome === expected ? 10 : 20)) return;
      } catch (e) { setError(e instanceof Error ? e.message : 'Follow-up evidence could not be checked.'); return; }
    }
    if (action === 'cancel') { note = prompt('Reason for cancelling this support plan') || ''; if (note.trim().length < 10) return; }
    setLoading(true);
    try {
      if (action === 'approve') await reviewLearningInterventionPlan({ interventionId: id, decision: 'approved', rationale: note });
      else await updateLearningIntervention({ interventionId: id, action, note, outcomeStatus: outcome });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'The support plan could not be updated.'); }
    finally { setLoading(false); }
  };

  const highPriority = data?.recommendations.filter((item) => item.priority === 'high').length || 0;
  const openPlans = data?.interventions.filter((item) => ['planned', 'active'].includes(item.status)).length || 0;

  return <main className="intervention-page intervention-page--simple">
    <AcademicProgressHeader context={context} eyebrow="Student Support" title="Student Support Plans" subtitle="Choose a student, see what needs attention, and plan the next teaching step." onBack={onBack} backLabel={onBack ? 'Back to Teacher Workspace' : (context?.viewer.role === 'school_admin' ? 'Back to School Administration' : 'Back to Teacher Workspace')} />
    <AcademicStudentPicker students={students} grade={grade} className={className} studentId={studentId} subject={subject} onGradeChange={(value) => { setGrade(value); setClassName(''); setStudentId(''); setSubject('all'); }} onClassChange={(value) => { setClassName(value); setStudentId(''); setSubject('all'); }} onStudentChange={(value) => { setStudentId(value); setSubject('all'); }} onSubjectChange={setSubject} />

    {error ? <div className="intervention-alert">{error}</div> : null}
    {!studentId ? <div className="aps-empty-state">Choose a grade, class and student to review support needs.</div> : null}
    {loading && studentId && !data ? <div className="intervention-loading">Loading student support information…</div> : null}

    {data ? <>
      <section className="intervention-student"><div><span>Student</span><h2>{data.student.name}</h2><p>Grade {data.student.grade || '—'} · Class {data.student.class_name || '—'}{subject !== 'all' ? ` · ${subject}` : ''}</p></div><div className="intervention-card-top"><span><b>{highPriority}</b> high priority</span><span><b>{openPlans}</b> open plan{openPlans === 1 ? '' : 's'}</span></div></section>

      <section className="intervention-panel"><div className="intervention-heading intervention-heading--simple"><div><span>Needs support now</span><h2>What should we work on next?</h2></div><p>Specific needs, examples from assessed work, and the next action.</p></div>
        <div className="intervention-recommendations intervention-recommendations--simple">{data.recommendations.map((r) => {
          const example = r.evidence_examples[0];
          return <article key={r.skill_key} className={`priority-${r.priority}`}>
            <div className="intervention-card-top"><span>{r.subject}{r.topic ? ` · ${r.topic}` : ''}</span><b>{r.priority === 'high' ? 'High priority' : r.priority === 'low' ? 'Lower priority' : 'Priority'}</b></div>
            <h3>{r.skill}</h3>
            <div className="intervention-targets">{r.diagnostic_targets.length ? r.diagnostic_targets.map((target) => <span key={target}>{target}</span>) : <span>Specific target still being identified</span>}</div>
            {example ? <div className="intervention-example-primary"><strong>Example from assessed work</strong><span><del>{example.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{example.better_version || 'Correction'}</ins></span>{example.issue ? <small>{example.issue}</small> : null}</div> : null}
            <div className={`intervention-readiness readiness-${r.readiness}`}><strong>{readinessLabel(r.readiness)}</strong>{r.readiness_blocker && r.readiness !== 'ready' ? <small>{r.readiness_blocker}</small> : null}</div>
            <div className="intervention-action"><span>{labels[r.recommended_type]}</span>{r.readiness === 'open_plan' ? <strong>Plan already open</strong> : r.readiness === 'review_evidence' ? <button onClick={() => openEvidenceReview(r)}>Check evidence</button> : r.can_create_plan ? <button onClick={() => openPlanBuilder(r)}>Create support plan</button> : <strong>More evidence needed</strong>}</div>
            <details className="intervention-reference"><summary>Why is this being suggested?</summary><p>{r.rationale}</p><dl><div><dt>Current status</dt><dd>{schoolStatus(r.status)}</dd></div><div><dt>Assessed evidence</dt><dd>{r.evidence_items}</dd></div><div><dt>Latest evidence</dt><dd>{fmt(r.last_observed_at)}</dd></div><div><dt>Evidence confidence</dt><dd>{r.confidence?.band ? `${r.confidence.band} · ${Math.round(r.confidence.score || 0)}%` : 'Not ready'}</dd></div></dl><small>{r.evidence_authority === 'teacher_validated' ? 'Evidence checked by a teacher.' : 'Suggested from the student’s assessed history.'}</small>{r.evidence_examples.slice(1).map((item, index) => <div className="intervention-example-primary" key={`${item.original}-${index}`}><span><del>{item.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{item.better_version || 'Correction'}</ins></span>{item.issue ? <small>{item.issue}</small> : null}</div>)}</details>
          </article>;
        })}{!data.recommendations.length ? <div className="intervention-empty">No current learning needs require a support plan in this subject.</div> : null}</div>
      </section>

      <section className="intervention-panel"><div className="intervention-heading intervention-heading--simple"><div><span>Support already in place</span><h2>Plans and follow-up</h2></div><p>What the teacher is doing and how progress will be checked.</p></div>
        <div className="intervention-plans intervention-plans--simple">{data.interventions.map((i) => <article key={i.id}><div><span>{i.subject}</span><b>{i.status === 'active' ? 'In progress' : i.status === 'planned' ? 'Planned' : i.status === 'completed' ? 'Completed' : 'Cancelled'}</b></div><h3>{i.skill}</h3><p>{i.goal}</p>{i.teaching_action ? <div className="plan-step"><strong>Teacher action</strong><span>{i.teaching_action}</span></div> : null}{i.evidence_task ? <div className="plan-step"><strong>Check progress with</strong><span>{i.evidence_task}</span></div> : null}<div className="follow-up-progress"><span>{i.follow_up_qualifying_observations || 0}/{i.target_min_followup_observations} follow-ups</span><span>{i.follow_up_successful_observations || 0}/{i.target_min_successful_observations} successful</span></div>{i.system_outcome_status ? <strong>Measured progress: {schoolStatus(i.system_outcome_status)}</strong> : null}{i.outcome_status ? <strong>Teacher outcome: {schoolStatus(i.outcome_status)}</strong> : null}<div>{i.status === 'planned' && i.approval_status === 'pending' ? <button onClick={() => void act(i.id, 'approve')}>Approve plan</button> : null}{i.status === 'planned' && ['approved', 'legacy_approved'].includes(i.approval_status) ? <button onClick={() => void act(i.id, 'start')}>Start plan</button> : null}{i.status === 'active' ? <button onClick={() => void act(i.id, 'complete')}>Check progress</button> : null}{['planned', 'active'].includes(i.status) ? <button className="secondary" onClick={() => void act(i.id, 'cancel')}>Cancel</button> : null}</div><details className="intervention-reference"><summary>Technical record</summary><small>Baseline: {schoolStatus(i.baseline_status)} · {i.baseline_qualifying_observations} qualifying evidence item{i.baseline_qualifying_observations === 1 ? '' : 's'} · review {fmt(i.target_date)}</small><small>Success rule: {i.target_min_successful_observations} successful from {i.target_min_followup_observations} qualifying follow-ups.</small><small>Baseline reference: {i.baseline_snapshot_hash.slice(0, 12)}…</small></details></article>)}{!data.interventions.length ? <div className="intervention-empty"><strong>No support plans yet.</strong><span>When enough assessed evidence is available, a teacher can create a focused plan above.</span></div> : null}</div>
      </section>

      <details className="intervention-panel intervention-glossary"><summary><span><strong>How support plans work</strong><small>Reference for school terminology and evidence rules</small></span><b>Reference</b></summary><div><p><strong>New support signal</strong> means a recent assessed need. <strong>Repeated need</strong> means the same area has appeared again. <strong>Long-running need</strong> means enough repeated evidence has built up over time. <strong>Evidence confidence</strong> describes how complete, recent and consistent the evidence is; it is not a student mark.</p><p>The technical baseline and confidence details remain available inside each plan so staff can audit decisions without crowding the everyday teaching view.</p></div></details>
    </> : null}

    {reviewing ? <div className="intervention-modal-layer"><button className="backdrop" onClick={() => setReviewing(null)} aria-label="Close"/><section className="intervention-modal intervention-review-modal"><span>Check the evidence</span><h2>What does “{reviewing.skill}” mean for this student?</h2><p>Confirm the specific needs before creating a support plan. The student's original work is not changed.</p>{reviewing.evidence_examples.length ? <div className="intervention-examples">{reviewing.evidence_examples.map((example, index) => <div key={`${example.original}-${index}`}><span><del>{example.original}</del><b aria-hidden="true">→</b><ins>{example.better_version}</ins></span><small>{example.issue}</small></div>)}</div> : null}<fieldset><legend>Which needs are confirmed?</legend>{reviewing.diagnostic_targets.map((target) => <label key={target} className="target-check"><input type="checkbox" checked={selectedTargets.includes(target)} onChange={(e) => setSelectedTargets((current) => e.target.checked ? [...current, target] : current.filter((item) => item !== target))}/><span>{target}</span></label>)}</fieldset><label>Teacher note<textarea value={reviewRationale} onChange={(e) => setReviewRationale(e.target.value)} placeholder="Why does the assessed work support—or not yet support—these needs?" /></label>{modalError ? <div className="modal-error" role="alert">{modalError}</div> : null}<div><button className="secondary" disabled={reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('needs_more_evidence')}>Need more evidence</button><button disabled={!selectedTargets.length || reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('confirmed')}>Confirm needs</button></div></section></div> : null}

    {editing ? <div className="intervention-modal-layer"><button className="backdrop" onClick={() => setEditing(null)} aria-label="Close"/><section className="intervention-modal"><span>{labels[editing.recommended_type]} · draft</span><h2>Create support for {editing.skill}</h2><div className="reviewed-evidence"><strong>Specific needs</strong><span>{editing.diagnostic_targets.join(' · ')}</span></div><label>1. What should the student improve?<textarea value={goal} onChange={(e) => setGoal(e.target.value)} /></label><label>2. What will the teacher do?<textarea value={teachingAction} onChange={(e) => setTeachingAction(e.target.value)} /></label><label>3. How will we check progress?<textarea value={evidenceTask} onChange={(e) => setEvidenceTask(e.target.value)} /></label><div className="intervention-measures"><label>Goal<select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as LearningIntervention['target_status'])}><option value="improving">Improving</option><option value="resolved">Secure / resolved</option><option value="emerging_strength">Emerging strength</option><option value="consistent_strength">Consistent strength</option></select></label><label>Follow-up pieces<input type="number" min="1" max="20" value={minimumFollowUp} onChange={(e) => { const value = Number(e.target.value); setMinimumFollowUp(value); setMinimumSuccessful((current) => Math.min(current, value)); }} /></label><label>Successful follow-ups<input type="number" min="1" max={minimumFollowUp} value={minimumSuccessful} onChange={(e) => setMinimumSuccessful(Number(e.target.value))} /></label><label>Review date<input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></label></div><small>This creates a draft support plan. A teacher still approves it before it starts.</small>{modalError ? <div className="modal-error" role="alert">{modalError}</div> : null}<div><button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button disabled={!targetDate || goal.trim().length < 10 || teachingAction.trim().length < 10 || evidenceTask.trim().length < 10 || loading} onClick={() => void createPlan()}>Create plan draft</button></div></section></div> : null}
  </main>;
};

export default TeacherInterventionIntelligencePageV2;
