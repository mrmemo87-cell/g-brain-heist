import React, { useEffect, useMemo, useState } from 'react';
import { fetchTeacherAcademicProfileStudents, type TeacherAcademicProfileStudent } from '../../services/teacherAcademicProfileDirectoryService';
import {
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

const fmt = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const schoolStatus = (value: string) => ({
  insufficient_evidence: 'New support signal', new_focus: 'New support need', recurring: 'Repeated need', persistent: 'Long-running need', improving: 'Improving', resolved: 'Secure now', emerging_strength: 'Emerging strength', consistent_strength: 'Consistent strength',
}[value] || value.replaceAll('_', ' '));

export interface TargetedPracticeContext {
  student: InterventionIntelligence['student'];
  recommendation: InterventionRecommendation;
}

interface TeacherInterventionIntelligencePageProps {
  onBack?: () => void;
  onCreateTargetedPractice?: (context: TargetedPracticeContext) => void;
}

const readinessRank: Record<InterventionRecommendation['readiness'], number> = {
  collect_evidence: 0,
  review_evidence: 1,
  ready: 2,
  open_plan: 3,
};

const uniqueExamples = (items: InterventionRecommendation['evidence_examples']) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.original || ''}|${item.better_version || ''}|${item.issue || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const aggregateRecommendations = (recommendations: InterventionRecommendation[]) => {
  const grouped = new Map<string, InterventionRecommendation>();
  recommendations.forEach((item) => {
    // Never merge distinct governed weaknesses just because their display labels match.
    // skill_key identifies the canonical objective / diagnostic atomic subskill.
    const key = [item.subject, item.topic || '', item.skill_key].map((value) => value.trim().toLocaleLowerCase()).join('|');
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...item,
        available_exact_questions: item.available_exact_questions || 0,
        available_related_questions: item.available_related_questions || 0,
        exact_question_ids: [...(item.exact_question_ids || [])],
        related_question_ids: [...(item.related_question_ids || [])],
        // Automatic practice is deliberately exact-only. Broader primary-skill
        // matches remain available separately for deliberate teacher selection.
        recommended_question_ids: [...new Set(item.exact_question_ids || [])].slice(0, 6),
        diagnostic_targets: [...item.diagnostic_targets],
        evidence_examples: uniqueExamples(item.evidence_examples),
      });
      return;
    }
    const bestReadiness = readinessRank[item.readiness] > readinessRank[existing.readiness] ? item : existing;
    grouped.set(key, {
      ...existing,
      priority: existing.priority === 'high' || item.priority === 'high' ? 'high' : existing.priority,
      status: bestReadiness.status,
      trend: bestReadiness.trend,
      readiness: bestReadiness.readiness,
      readiness_blocker: bestReadiness.readiness_blocker,
      can_create_plan: bestReadiness.can_create_plan,
      professional_review: bestReadiness.professional_review,
      diagnostic_targets: [...new Set([...existing.diagnostic_targets, ...item.diagnostic_targets])],
      evidence_examples: uniqueExamples([...existing.evidence_examples, ...item.evidence_examples]),
      evidence_items: Math.max(existing.evidence_items, item.evidence_items),
      focus_occurrences: Math.max(existing.focus_occurrences, item.focus_occurrences),
      available_questions: Math.max(existing.available_questions, item.available_questions),
      available_exact_questions: Math.max(existing.available_exact_questions || 0, item.available_exact_questions || 0),
      available_related_questions: Math.max(existing.available_related_questions || 0, item.available_related_questions || 0),
      exact_question_ids: [...new Set([...(existing.exact_question_ids || []), ...(item.exact_question_ids || [])])],
      related_question_ids: [...new Set([...(existing.related_question_ids || []), ...(item.related_question_ids || [])])],
      recommended_question_ids: [...new Set([
        ...(existing.exact_question_ids || []),
        ...(item.exact_question_ids || []),
      ])].slice(0, 6),
      last_observed_at: new Date(existing.last_observed_at).getTime() >= new Date(item.last_observed_at).getTime() ? existing.last_observed_at : item.last_observed_at,
      confidence: (item.confidence?.score || 0) > (existing.confidence?.score || 0) ? item.confidence : existing.confidence,
      rationale: existing.rationale || item.rationale,
    });
  });
  return [...grouped.values()];
};

const TeacherInterventionIntelligencePageV2: React.FC<TeacherInterventionIntelligencePageProps> = ({ onBack, onCreateTargetedPractice }) => {
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
  const [reviewing, setReviewing] = useState<InterventionRecommendation | null>(null);
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
    const targets = recommendation.diagnostic_targets.length ? recommendation.diagnostic_targets : [recommendation.skill];
    setModalError(null);
    setReviewing(recommendation);
    setSelectedTargets(targets);
    setReviewRationale(`The current assessed evidence supports reviewing ${recommendation.skill} as a focused learning need.`);
  };
  const startTargetedPractice = (recommendation: InterventionRecommendation) => {
    if (!data || !onCreateTargetedPractice) return;
    onCreateTargetedPractice({ student: data.student, recommendation });
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

  const recommendations = useMemo(() => aggregateRecommendations(data?.recommendations || []), [data?.recommendations]);
  const actionable = recommendations.filter((item) => item.readiness !== 'collect_evidence');
  const watching = recommendations.filter((item) => item.readiness === 'collect_evidence');
  const readyCount = actionable.filter((item) => item.readiness === 'ready').length;
  const openPlans = data?.interventions.filter((item) => ['planned', 'active'].includes(item.status)).length || 0;

  const renderRecommendation = (r: InterventionRecommendation, mode: 'action' | 'watch') => {
    const example = r.evidence_examples[0];
    const evidenceLabel = `${r.evidence_items} assessed evidence item${r.evidence_items === 1 ? '' : 's'}`;
    return <article key={`${r.subject}-${r.topic || ''}-${r.skill_key}`} className={`priority-${r.priority} intervention-candidate ${mode === 'watch' ? 'is-watching' : 'is-actionable'}`}>
      <div className="intervention-card-top"><span>{r.subject}{r.topic ? ` · ${r.topic}` : ''}</span><b>{r.readiness === 'ready' ? 'Ready for practice' : r.readiness === 'review_evidence' ? 'Ready for review' : r.readiness === 'open_plan' ? 'Support active' : 'Gathering evidence'}</b></div>
      <h3>{r.skill}</h3>
      <p className="intervention-card-summary">{r.readiness === 'collect_evidence' ? 'Brains Heist has noticed this area, but it is still building a fair evidence baseline.' : r.rationale}</p>
      <div className="intervention-signal-row"><span>{evidenceLabel}</span><span>Last seen {fmt(r.last_observed_at)}</span>{r.focus_occurrences > 1 ? <span>{r.focus_occurrences} observations</span> : null}</div>
      <div className="intervention-targets">{r.diagnostic_targets.length ? r.diagnostic_targets.map((target) => <span key={target}>{target}</span>) : <span>Exact target still being identified</span>}</div>
      {example ? <div className="intervention-example-primary"><strong>Evidence example</strong><span><del>{example.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{example.better_version || 'Correction'}</ins></span>{example.issue ? <small>{example.issue}</small> : null}</div> : null}
      {r.readiness === 'collect_evidence' ? <div className="intervention-watch-note"><strong>Why no intervention yet?</strong><span>{r.readiness_blocker || 'More qualifying assessed work is needed before support can be measured fairly.'}</span></div> : null}
      <div className="intervention-action intervention-action--clear">
        {r.readiness === 'review_evidence' ? <><span>Review the evidence, then decide.</span><button onClick={() => openEvidenceReview(r)}>Review evidence</button></> : null}
        {r.readiness === 'ready' ? <><span>Individual practice for {data?.student.name || 'this student'}.</span>{onCreateTargetedPractice ? <button onClick={() => startTargetedPractice(r)}>Create targeted practice</button> : <strong>Ready to make a plan</strong>}</> : null}
        {r.readiness === 'open_plan' ? <><span>Support is already being tracked below.</span><strong>Plan in progress</strong></> : null}
        {r.readiness === 'collect_evidence' ? <><span>Brains Heist will keep watching future assessed work.</span><strong>Keep monitoring</strong></> : null}
      </div>
      <details className="intervention-reference"><summary>View evidence details</summary><dl><div><dt>Current status</dt><dd>{schoolStatus(r.status)}</dd></div><div><dt>Evidence confidence</dt><dd>{r.confidence?.band ? `${r.confidence.band} · ${Math.round(r.confidence.score || 0)}%` : 'Building'}</dd></div></dl>{r.evidence_examples.slice(1).map((item, index) => <div className="intervention-example-primary" key={`${item.original}-${index}`}><span><del>{item.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{item.better_version || 'Correction'}</ins></span>{item.issue ? <small>{item.issue}</small> : null}</div>)}</details>
    </article>;
  };

  return <main className="intervention-page intervention-page--simple">
    <AcademicProgressHeader context={context} eyebrow="Student Support" title="Interventions" subtitle="Turn assessed evidence into focused practice, then watch whether the student improves in later work." onBack={onBack} backLabel={onBack ? 'Back to Teacher Workspace' : (context?.viewer.role === 'school_admin' ? 'Back to School Administration' : 'Back to Teacher Workspace')} />
    <AcademicStudentPicker students={students} grade={grade} className={className} studentId={studentId} subject={subject} onGradeChange={(value) => { setGrade(value); setClassName(''); setStudentId(''); setSubject('all'); }} onClassChange={(value) => { setClassName(value); setStudentId(''); setSubject('all'); }} onStudentChange={(value) => { setStudentId(value); setSubject('all'); }} onSubjectChange={setSubject} />

    {error ? <div className="intervention-alert">{error}</div> : null}
    {!studentId ? <div className="aps-empty-state">Choose a grade, class and student to review support needs.</div> : null}
    {loading && studentId && !data ? <div className="intervention-loading">Loading student support information…</div> : null}

    {data ? <>
      <section className="intervention-student intervention-student--command"><div><span>Student support cycle</span><h2>{data.student.name}</h2><p>Grade {data.student.grade || '—'} · Class {data.student.class_name || '—'}{subject !== 'all' ? ` · ${subject}` : ''}</p></div><div className="intervention-card-top"><span><b>{readyCount}</b> ready for practice</span><span><b>{watching.length}</b> still gathering evidence</span><span><b>{openPlans}</b> support plan{openPlans === 1 ? '' : 's'}</span></div></section>

      <section className="intervention-cycle" aria-label="Brains Heist support cycle"><span className="is-current">1 · Notice</span><span>2 · Verify</span><span>3 · Practise</span><span>4 · Watch</span><span>5 · Adapt</span></section>

      <section className="intervention-panel"><div className="intervention-heading intervention-heading--simple"><div><span>Needs attention</span><h2>What can I act on now?</h2></div><p>Only needs that are ready for teacher review, focused practice, or an active support plan appear here.</p></div>
        <div className="intervention-recommendations intervention-recommendations--simple">{actionable.map((r) => renderRecommendation(r, 'action'))}{!actionable.length ? <div className="intervention-empty"><strong>No intervention is ready yet.</strong><span>Brains Heist will move a need here when the evidence is strong enough to act on.</span></div> : null}</div>
      </section>

      <section className="intervention-panel intervention-panel--watch"><div className="intervention-heading intervention-heading--simple"><div><span>Still gathering evidence</span><h2>What is Brains Heist watching?</h2></div><p>These are signals, not lower-priority students or less important needs. More assessed evidence is required before intervention.</p></div>
        <div className="intervention-recommendations intervention-recommendations--simple">{watching.map((r) => renderRecommendation(r, 'watch'))}{!watching.length ? <div className="intervention-empty"><strong>No unresolved signals.</strong><span>Everything currently detected is already ready for review or support.</span></div> : null}</div>
      </section>

      <section className="intervention-panel"><div className="intervention-heading intervention-heading--simple"><div><span>Support in progress</span><h2>Plans and follow-up</h2></div><p>Targeted practice helps the student rehearse the skill. Later qualifying assessed work is what shows whether the improvement transfers independently.</p></div>
        <div className="intervention-plans intervention-plans--simple">{data.interventions.map((i) => <article key={i.id}><div><span>{i.subject}</span><b>{i.status === 'active' ? 'In progress' : i.status === 'planned' ? 'Planned' : i.status === 'completed' ? 'Completed' : 'Cancelled'}</b></div><h3>{i.skill}</h3><p>{i.goal}</p>{i.teaching_action ? <div className="plan-step"><strong>Practice action</strong><span>{i.teaching_action}</span></div> : null}{i.evidence_task ? <div className="plan-step"><strong>Independent check</strong><span>{i.evidence_task}</span></div> : null}<div className="follow-up-progress"><span>{i.follow_up_qualifying_observations || 0}/{i.target_min_followup_observations} follow-ups</span><span>{i.follow_up_successful_observations || 0}/{i.target_min_successful_observations} successful</span></div>{i.system_outcome_status ? <strong>Measured progress: {schoolStatus(i.system_outcome_status)}</strong> : null}{i.outcome_status ? <strong>Teacher outcome: {schoolStatus(i.outcome_status)}</strong> : null}<div>{i.status === 'planned' && i.approval_status === 'pending' ? <button onClick={() => void act(i.id, 'approve')}>Approve plan</button> : null}{i.status === 'planned' && ['approved', 'legacy_approved'].includes(i.approval_status) ? <button onClick={() => void act(i.id, 'start')}>Start plan</button> : null}{i.status === 'active' ? <button onClick={() => void act(i.id, 'complete')}>Check progress</button> : null}{['planned', 'active'].includes(i.status) ? <button className="secondary" onClick={() => void act(i.id, 'cancel')}>Cancel</button> : null}</div><details className="intervention-reference"><summary>Technical record</summary><small>Baseline: {schoolStatus(i.baseline_status)} · {i.baseline_qualifying_observations} qualifying evidence item{i.baseline_qualifying_observations === 1 ? '' : 's'} · review {fmt(i.target_date)}</small><small>Success rule: {i.target_min_successful_observations} successful from {i.target_min_followup_observations} qualifying follow-ups.</small></details></article>)}{!data.interventions.length ? <div className="intervention-empty"><strong>No support plans yet.</strong><span>Confirm a need and create targeted practice to start the support cycle.</span></div> : null}</div>
      </section>
    </> : null}

    {reviewing ? <div className="intervention-modal-layer"><button className="backdrop" onClick={() => setReviewing(null)} aria-label="Close evidence review"/><section className="intervention-modal intervention-review-modal"><div className="intervention-modal-kicker"><span>Verify the need</span><b>{reviewing.evidence_items} evidence item{reviewing.evidence_items === 1 ? '' : 's'}</b></div><h2>Review: {reviewing.skill}</h2><p>Brains Heist has noticed a possible learning need. Review the evidence below, confirm the specific target, then choose whether this is ready for focused practice. The student's original work is never changed.</p><div className="intervention-review-summary"><strong>Why it was surfaced</strong><span>{reviewing.rationale}</span><small>Confidence: {reviewing.confidence?.band ? `${reviewing.confidence.band} · ${Math.round(reviewing.confidence.score || 0)}%` : 'still building'}</small></div>{reviewing.evidence_examples.length ? <div className="intervention-examples">{reviewing.evidence_examples.map((example, index) => <div key={`${example.original}-${index}`}><strong>Evidence {index + 1}</strong><span><del>{example.original || 'Original response'}</del><b aria-hidden="true">→</b><ins>{example.better_version || 'Improved version'}</ins></span><small>{example.issue}</small></div>)}</div> : <div className="intervention-no-example"><strong>No sentence-level example is attached to this signal.</strong><span>Use the diagnostic target and assessed-history summary below; choose “Keep monitoring” if the evidence is not specific enough yet.</span></div>}<fieldset><legend>What specifically needs support?</legend>{(reviewing.diagnostic_targets.length ? reviewing.diagnostic_targets : [reviewing.skill]).map((target) => <label key={target} className="target-check"><input type="checkbox" checked={selectedTargets.includes(target)} onChange={(e) => setSelectedTargets((current) => e.target.checked ? [...new Set([...current, target])] : current.filter((item) => item !== target))}/><span>{target}</span></label>)}</fieldset><label>Teacher evidence note<textarea value={reviewRationale} onChange={(e) => setReviewRationale(e.target.value)} placeholder="Briefly record why the assessed work supports—or does not yet support—this target." /></label>{modalError ? <div className="modal-error" role="alert">{modalError}</div> : null}<div className="intervention-modal-actions"><button className="secondary" disabled={reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('needs_more_evidence')}>Keep monitoring</button><button disabled={!selectedTargets.length || reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('confirmed')}>Confirm need</button></div><small className="intervention-modal-footnote">After confirmation, the primary action becomes “Create targeted practice” for this student only.</small></section></div> : null}
  </main>;
};

export default TeacherInterventionIntelligencePageV2;
