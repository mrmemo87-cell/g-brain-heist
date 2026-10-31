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
import { AcademicProgressHeader, AcademicStudentPicker, gradeKey, normalizeAcademicSubjectOptions, selectionFromStudent } from './AcademicProgressSuite';
import ClassLearningNeeds from './ClassLearningNeeds';
import { practiceRecommendationForGroup, rollUpRecommendations, type SkillRollupGroup } from './interventionSkillRollup';
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

// Skill-level roll-up view. On by default since 2026-10-30 (owner decision after reviewing it on
// live students); `?rollup=0` or the in-page toggle switches back to the sub-skill view, and the
// choice is remembered per browser. Presentation only — see interventionSkillRollup.ts for the
// gate-preserving rules.
const ROLLUP_STORAGE_KEY = 'bh.intervention.skillRollup';
const ROLLUP_DEFAULT = true;
const readRollupPreference = (params: URLSearchParams): boolean => {
  const fromUrl = params.get('rollup');
  if (fromUrl === '1' || fromUrl === 'true') return true;
  if (fromUrl === '0' || fromUrl === 'false') return false;
  try {
    const stored = window.localStorage.getItem(ROLLUP_STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch { /* fall through to default */ }
  return ROLLUP_DEFAULT;
};
const writeRollupPreference = (value: boolean) => {
  try { window.localStorage.setItem(ROLLUP_STORAGE_KEY, value ? '1' : '0'); } catch { /* best effort */ }
};

// What an active plan is waiting for. Practice answers never count; only later independent assessed
// work moves the follow-up counters, and nothing else in the product reminds the teacher of that.
const planNudge = (plan: LearningIntervention): { tone: 'wait' | 'act' | 'overdue'; text: string } | null => {
  if (plan.status === 'planned') {
    return plan.approval_status === 'pending'
      ? { tone: 'act', text: 'Waiting for your approval. Approve to start measuring.' }
      : { tone: 'act', text: 'Approved. Start the plan so follow-ups count from today.' };
  }
  if (plan.status !== 'active') return null;
  const needed = Math.max(0, (plan.target_min_followup_observations || 0) - (plan.follow_up_qualifying_observations || 0));
  const started = plan.started_at ? new Date(plan.started_at).getTime() : NaN;
  const daysActive = Number.isFinite(started) ? Math.floor((Date.now() - started) / 86400000) : 0;
  const review = plan.target_date ? new Date(`${plan.target_date}T23:59:59`).getTime() : NaN;
  const daysToReview = Number.isFinite(review) ? Math.ceil((review - Date.now()) / 86400000) : null;
  const task = `independent task${needed === 1 ? '' : 's'} on ${(plan.skill || 'this skill').toLowerCase()}`;
  if (needed === 0) return { tone: 'act', text: 'Enough follow-up evidence has arrived. Check progress to close the loop.' };
  if (daysToReview !== null && daysToReview < 0) return { tone: 'overdue', text: `Review date passed. Still needs ${needed} ${task} to measure progress.` };
  if (daysToReview !== null && daysToReview <= 3) return { tone: 'act', text: `Review in ${daysToReview} day${daysToReview === 1 ? '' : 's'}. Needs ${needed} ${task} first.` };
  if (daysActive >= 7) return { tone: 'act', text: `${daysActive} days active with no qualifying follow-up. Set ${needed} ${task}.` };
  return { tone: 'wait', text: `Needs ${needed} ${task} to measure progress. Practice answers do not count.` };
};

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
  const requestedFocusCode = params.get('focus') || '';
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
  const [rollup, setRollup] = useState<boolean>(() => readRollupPreference(params));
  const toggleRollup = () => setRollup((current) => { writeRollupPreference(!current); return !current; });

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

  const recommendations = useMemo(() => {
    const rows = aggregateRecommendations(data?.recommendations || []);
    if (!requestedFocusCode) return rows;
    return [...rows].sort((a, b) => Number(b.evidence_focus_code === requestedFocusCode) - Number(a.evidence_focus_code === requestedFocusCode));
  }, [data?.recommendations, requestedFocusCode]);
  const requestedFocusRecommendation = requestedFocusCode
    ? recommendations.find((item) => item.evidence_focus_code === requestedFocusCode) || null
    : null;
  const actionable = recommendations.filter((item) => item.readiness !== 'collect_evidence');
  const watching = recommendations.filter((item) => item.readiness === 'collect_evidence');
  // Class view (no student chosen yet): the roster of the picked class and its subjects.
  const classRoster = useMemo(() => (grade && className
    ? students.filter((student) => gradeKey(student.grade) === grade && (student.class_name || 'Unassigned') === className)
    : []), [className, grade, students]);
  const classRosterIds = useMemo(() => classRoster.map((student) => student.student_id), [classRoster]);
  const classSubjects = useMemo(() => normalizeAcademicSubjectOptions(classRoster.flatMap((student) => student.subjects || [])), [classRoster]);
  const [classSubject, setClassSubject] = useState('');
  useEffect(() => {
    setClassSubject((current) => (current && classSubjects.includes(current) ? current : (classSubjects.length === 1 ? classSubjects[0] : '')));
  }, [classSubjects]);

  const groups = useMemo(() => rollup ? rollUpRecommendations(recommendations) : [], [recommendations, rollup]);
  const actionableGroups = groups.filter((group) => group.readiness !== 'collect_evidence');
  const watchingGroups = groups.filter((group) => group.readiness === 'collect_evidence');
  const readyCount = rollup
    ? actionableGroups.filter((group) => group.readiness === 'ready').length
    : actionable.filter((item) => item.readiness === 'ready').length;
  const reviewCount = rollup ? actionableGroups.filter((group) => group.readiness === 'review_evidence').length : 0;
  const watchingCount = rollup ? watchingGroups.length : watching.length;
  const openPlans = data?.interventions.filter((item) => ['planned', 'active'].includes(item.status)).length || 0;

  const renderGroup = (group: SkillRollupGroup, mode: 'action' | 'watch') => {
    const anchor = group.anchor;
    const readinessLabel = group.readiness === 'ready' ? 'Ready for practice' : group.readiness === 'review_evidence' ? 'Ready for review' : group.readiness === 'open_plan' ? 'Support active' : 'Gathering evidence';
    const summary = group.readiness === 'collect_evidence'
      ? `Brains Heist has noticed ${group.leaves.length === 1 ? 'this area' : `${group.leaves.length} parts of this skill`}, but is still building a fair evidence baseline.`
      : group.promotedByRollup
        ? `${group.evidenceItems} qualifying evidence items across ${group.leaves.length} sub-skills. No single sub-skill qualifies alone; together they meet the skill-level threshold.`
        : anchor.rationale;
    return <article key={group.key} className={`priority-${group.priority} intervention-candidate ${mode === 'watch' ? 'is-watching' : 'is-actionable'} is-rollup`}>
      <div className="intervention-card-top"><span>{group.subject}{group.areaLabel ? ` · ${group.areaLabel}` : ''}</span><b>{readinessLabel}</b></div>
      <h3>{group.primarySkill}</h3>
      <p className="intervention-card-summary">{summary}</p>
      <div className="intervention-signal-row"><span>{group.evidenceItems} assessed evidence item{group.evidenceItems === 1 ? '' : 's'}</span><span>{group.leaves.length} sub-skill{group.leaves.length === 1 ? '' : 's'}</span><span>Last seen {fmt(group.lastObservedAt)}</span>{group.availableExactQuestions ? <span>{group.availableExactQuestions} exact practice questions</span> : null}</div>
      <div className="intervention-targets intervention-targets--leaves">{group.leaves.map((leaf) => <span key={leaf.skill_key} className={leaf.readiness !== 'collect_evidence' ? 'is-qualifying' : undefined} title={(leaf.merged_skill_keys || [leaf.skill_key]).join('\n')}>{leaf.subskill || leaf.skill} · {leaf.evidence_items}</span>)}</div>
      {group.unlockHint ? <div className="intervention-watch-note"><strong>What would unlock this</strong><span>{group.unlockHint}</span></div> : null}
      <div className="intervention-action intervention-action--clear">
        {group.readiness === 'review_evidence' ? <><span>{group.promotedByRollup ? 'Confirm the skill-level need, or pick a sub-skill.' : 'Review the evidence, then decide.'}</span><button onClick={() => openEvidenceReview(group.promotedByRollup ? { ...anchor, diagnostic_targets: group.diagnosticTargets.length ? group.diagnosticTargets : group.leaves.map((leaf) => leaf.subskill || leaf.skill) } : anchor)}>Review evidence</button></> : null}
        {group.readiness === 'ready' ? <><span>Individual practice for {data?.student.name || 'this student'}.</span>{onCreateTargetedPractice ? <button onClick={() => data && onCreateTargetedPractice({ student: data.student, recommendation: practiceRecommendationForGroup(group) })}>Create targeted practice</button> : <strong>Ready to make a plan</strong>}</> : null}
        {group.readiness === 'open_plan' ? <><span>Support is already being tracked below.</span><strong>Plan in progress</strong></> : null}
        {group.readiness === 'collect_evidence' ? <><span>Brains Heist will keep watching future assessed work.</span><strong>Keep monitoring</strong></> : null}
      </div>
      <details className="intervention-reference"><summary>View sub-skill details</summary>{group.leaves.map((leaf) => <div key={leaf.skill_key} className="intervention-rollup-leaf"><strong>{leaf.subskill || leaf.skill}</strong><small>{schoolStatus(leaf.status)} · {leaf.evidence_items} item{leaf.evidence_items === 1 ? '' : 's'} · {leaf.readiness === 'ready' ? 'confirmed' : leaf.readiness === 'review_evidence' ? 'reviewable' : leaf.readiness === 'open_plan' ? 'plan open' : 'collecting'}{leaf.confidence?.band ? ` · confidence ${leaf.confidence.band}` : ''}{leaf.merged_skill_keys ? ` · evidence pooled from ${leaf.merged_skill_keys.length} tracking keys` : ''}</small>{leaf.evidence_examples[0] ? <span><del>{leaf.evidence_examples[0].original || 'Original'}</del><b aria-hidden="true">→</b><ins>{leaf.evidence_examples[0].better_version || 'Correction'}</ins></span> : null}</div>)}</details>
    </article>;
  };

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
    {!studentId && !className ? <div className="aps-empty-state">Choose a grade and class to see what the class shares, or go straight to a student.</div> : null}
    {!studentId && className ? <>
      {classSubjects.length > 1 ? <div className="intervention-view-toggle intervention-class-subjects" role="tablist" aria-label="Subject">
        <span>Subject</span>
        {classSubjects.map((value) => <button key={value} type="button" role="tab" aria-selected={classSubject === value} className={classSubject === value ? 'is-active' : undefined} onClick={() => setClassSubject(value)}>{value}</button>)}
      </div> : null}
      {classSubject
        ? <ClassLearningNeeds classLabel={className} studentIds={classRosterIds} subject={classSubject} onSelectStudent={(value) => { setStudentId(value); setSubject(classSubject); }} />
        : <div className="aps-empty-state">Choose a subject to see this class’s shared needs.</div>}
    </> : null}
    {loading && studentId && !data ? <div className="intervention-loading">Loading student support information…</div> : null}

    {data ? <>
      {requestedFocusRecommendation ? <section className="intervention-alert" style={{ borderColor: '#a5b4fc', background: '#eef2ff', color: '#3730a3' }}><strong>Opened from Quick diagnostic:</strong> {requestedFocusRecommendation.evidence_focus_name || requestedFocusRecommendation.skill}. Review the evidence below, then create exact-focus practice only when the governed support workflow says it is ready.</section> : null}
      <section className="intervention-student intervention-student--command"><div><span>Student support cycle</span><h2>{data.student.name}</h2><p>Grade {data.student.grade || '—'} · Class {data.student.class_name || '—'}{subject !== 'all' ? ` · ${subject}` : ''}</p></div><div className="intervention-card-top"><span><b>{readyCount}</b> ready for practice</span>{rollup ? <span><b>{reviewCount}</b> ready for review</span> : null}<span><b>{watchingCount}</b> still gathering evidence</span><span><b>{openPlans}</b> support plan{openPlans === 1 ? '' : 's'}</span></div></section>

      <div className="intervention-view-toggle"><label><input type="checkbox" checked={rollup} onChange={toggleRollup} /><span>Group by skill</span></label><small>{rollup ? `Showing ${groups.length} skills built from ${recommendations.length} sub-skill signals. Review and practice still act on the exact sub-skill.` : `Showing ${recommendations.length} sub-skill signals. Turn on grouping to see them by primary skill.`}</small></div>

      <section className="intervention-cycle" aria-label="Brains Heist support cycle"><span className="is-current">1 · Notice</span><span>2 · Verify</span><span>3 · Practise</span><span>4 · Watch</span><span>5 · Adapt</span></section>

      <section className="intervention-panel"><div className="intervention-heading intervention-heading--simple"><div><span>Needs attention</span><h2>What can I act on now?</h2></div><p>Only needs that are ready for teacher review, focused practice, or an active support plan appear here.</p></div>
        <div className="intervention-recommendations intervention-recommendations--simple">{rollup ? actionableGroups.map((group) => renderGroup(group, 'action')) : actionable.map((r) => renderRecommendation(r, 'action'))}{(rollup ? !actionableGroups.length : !actionable.length) ? <div className="intervention-empty"><strong>No intervention is ready yet.</strong><span>Brains Heist will move a need here when the evidence is strong enough to act on.</span></div> : null}</div>
      </section>

      <section className="intervention-panel intervention-panel--watch"><div className="intervention-heading intervention-heading--simple"><div><span>Still gathering evidence</span><h2>What is Brains Heist watching?</h2></div><p>These are signals, not lower-priority students or less important needs. More assessed evidence is required before intervention.</p></div>
        <div className="intervention-recommendations intervention-recommendations--simple">{rollup ? watchingGroups.map((group) => renderGroup(group, 'watch')) : watching.map((r) => renderRecommendation(r, 'watch'))}{(rollup ? !watchingGroups.length : !watching.length) ? <div className="intervention-empty"><strong>No unresolved signals.</strong><span>Everything currently detected is already ready for review or support.</span></div> : null}</div>
      </section>

      <section className="intervention-panel"><div className="intervention-heading intervention-heading--simple"><div><span>Support in progress</span><h2>Plans and follow-up</h2></div><p>Targeted practice helps the student rehearse the skill. Later qualifying assessed work is what shows whether the improvement transfers independently.</p></div>
        <div className="intervention-plans intervention-plans--simple">{data.interventions.map((i) => <article key={i.id}><div><span>{i.subject}</span><b>{i.status === 'active' ? 'In progress' : i.status === 'planned' ? 'Planned' : i.status === 'completed' ? 'Completed' : 'Cancelled'}</b></div><h3>{i.skill}</h3><p>{i.goal}</p>{i.teaching_action ? <div className="plan-step"><strong>Practice action</strong><span>{i.teaching_action}</span></div> : null}{i.evidence_task ? <div className="plan-step"><strong>Independent check</strong><span>{i.evidence_task}</span></div> : null}<div className="follow-up-progress"><span>{i.follow_up_qualifying_observations || 0}/{i.target_min_followup_observations} follow-ups</span><span>{i.follow_up_successful_observations || 0}/{i.target_min_successful_observations} successful</span></div>{(() => { const nudge = planNudge(i); return nudge ? <div className={`plan-nudge is-${nudge.tone}`} role={nudge.tone === 'overdue' ? 'alert' : undefined}><i aria-hidden="true" /><span>{nudge.text}</span></div> : null; })()}{i.system_outcome_status ? <strong>Measured progress: {schoolStatus(i.system_outcome_status)}</strong> : null}{i.outcome_status ? <strong>Teacher outcome: {schoolStatus(i.outcome_status)}</strong> : null}<div>{i.status === 'planned' && i.approval_status === 'pending' ? <button onClick={() => void act(i.id, 'approve')}>Approve plan</button> : null}{i.status === 'planned' && ['approved', 'legacy_approved'].includes(i.approval_status) ? <button onClick={() => void act(i.id, 'start')}>Start plan</button> : null}{i.status === 'active' ? <button onClick={() => void act(i.id, 'complete')}>Check progress</button> : null}{['planned', 'active'].includes(i.status) ? <button className="secondary" onClick={() => void act(i.id, 'cancel')}>Cancel</button> : null}</div><details className="intervention-reference"><summary>Technical record</summary><small>Baseline: {schoolStatus(i.baseline_status)} · {i.baseline_qualifying_observations} qualifying evidence item{i.baseline_qualifying_observations === 1 ? '' : 's'} · review {fmt(i.target_date)}</small><small>Success rule: {i.target_min_successful_observations} successful from {i.target_min_followup_observations} qualifying follow-ups.</small></details></article>)}{!data.interventions.length ? <div className="intervention-empty"><strong>No support plans yet.</strong><span>Confirm a need and create targeted practice to start the support cycle.</span></div> : null}</div>
      </section>
    </> : null}

    {reviewing ? <div className="intervention-modal-layer"><button className="backdrop" onClick={() => setReviewing(null)} aria-label="Close evidence review"/><section className="intervention-modal intervention-review-modal" role="dialog" aria-modal="true" aria-labelledby="intervention-review-title"><div className="intervention-modal-kicker"><span>Verify the need</span><b>{reviewing.evidence_items} evidence item{reviewing.evidence_items === 1 ? '' : 's'}</b></div><h2 id="intervention-review-title">Review: {reviewing.skill}</h2><p>Brains Heist has noticed a possible learning need. Review the evidence below, confirm the specific target, then choose whether this is ready for focused practice. The student's original work is never changed.</p><div className="intervention-review-summary"><strong>Why it was surfaced</strong><span>{reviewing.rationale}</span><small>Confidence: {reviewing.confidence?.band ? `${reviewing.confidence.band} · ${Math.round(reviewing.confidence.score || 0)}%` : 'still building'}</small></div>{reviewing.evidence_examples.length ? <div className="intervention-examples">{reviewing.evidence_examples.map((example, index) => <div key={`${example.original}-${index}`}><strong>Evidence {index + 1}</strong><span><del>{example.original || 'Original response'}</del><b aria-hidden="true">→</b><ins>{example.better_version || 'Improved version'}</ins></span><small>{example.issue}</small></div>)}</div> : <div className="intervention-no-example"><strong>No sentence-level example is attached to this signal.</strong><span>Use the diagnostic target and assessed-history summary below; choose “Keep monitoring” if the evidence is not specific enough yet.</span></div>}<fieldset><legend>What specifically needs support?</legend>{(reviewing.diagnostic_targets.length ? reviewing.diagnostic_targets : [reviewing.skill]).map((target) => <label key={target} className="target-check"><input type="checkbox" checked={selectedTargets.includes(target)} onChange={(e) => setSelectedTargets((current) => e.target.checked ? [...new Set([...current, target])] : current.filter((item) => item !== target))}/><span>{target}</span></label>)}</fieldset><label>Teacher evidence note<textarea value={reviewRationale} onChange={(e) => setReviewRationale(e.target.value)} placeholder="Briefly record why the assessed work supports—or does not yet support—this target." /></label>{modalError ? <div className="modal-error" role="alert">{modalError}</div> : null}<div className="intervention-modal-actions"><button className="secondary" disabled={reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('needs_more_evidence')}>Keep monitoring</button><button disabled={!selectedTargets.length || reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('confirmed')}>Confirm need</button></div><small className="intervention-modal-footnote">After confirmation, the primary action becomes “Create targeted practice” for this student only.</small></section></div> : null}
  </main>;
};

export default TeacherInterventionIntelligencePageV2;
