import React, { useEffect, useMemo, useState } from 'react';
import { fetchTeacherAcademicProfileStudents, type TeacherAcademicProfileStudent } from '../../services/teacherAcademicProfileDirectoryService';
import * as GameService from '../../services/gameService';
import { tryConsumePilotQuota } from '../../services/tierService';
import { brainsAlert } from '../../src/utils/brainsAlert';
import type { Subject } from '../../types';
import {
  evaluateLearningIntervention,
  getSupportPlansOverview,
  pickQuickCheckQuestions,
  planStage,
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
// live students). The on-screen toggle was removed on 2026-11-03 so teachers see one view;
// `?rollup=0` (or a stored browser preference) still switches back to the sub-skill view for support. Presentation only — see interventionSkillRollup.ts for the
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
// Teachers usually work with the same class. Remember the last class so the page opens on it.
const LAST_CLASS_STORAGE_KEY = 'bh.intervention.lastClass';
const readLastClass = (): { grade: string; className: string } | null => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LAST_CLASS_STORAGE_KEY) || 'null');
    return parsed && typeof parsed.grade === 'string' && typeof parsed.className === 'string' ? parsed : null;
  } catch { return null; }
};
const writeLastClass = (grade: string, className: string) => {
  try { window.localStorage.setItem(LAST_CLASS_STORAGE_KEY, JSON.stringify({ grade, className })); } catch { /* best effort */ }
};

// What an active plan is waiting for. Practice answers never count; only later independent assessed
// work moves the follow-up counters, and nothing else in the product reminds the teacher of that.
const planNudge = (plan: LearningIntervention): { tone: 'wait' | 'act' | 'overdue'; text: string } | null => {
  if (plan.status === 'planned') {
    return plan.approval_status === 'pending'
      ? { tone: 'act', text: 'Waiting for your approval. Press “Approve plan & start” to begin measuring.' }
      : { tone: 'act', text: 'Approved. Press Start plan so checks count from today.' };
  }
  if (plan.status !== 'active') return null;
  const needed = Math.max(0, (plan.target_min_followup_observations || 0) - (plan.follow_up_qualifying_observations || 0));
  const started = plan.started_at ? new Date(plan.started_at).getTime() : NaN;
  const daysActive = Number.isFinite(started) ? Math.floor((Date.now() - started) / 86400000) : 0;
  const review = plan.target_date ? new Date(`${plan.target_date}T23:59:59`).getTime() : NaN;
  const daysToReview = Number.isFinite(review) ? Math.ceil((review - Date.now()) / 86400000) : null;
  const task = `independent check${needed === 1 ? '' : 's'} on ${(plan.skill || 'this skill').toLowerCase()}`;
  if (needed === 0) return { tone: 'act', text: 'Enough checks are in. See the result to close the loop.' };
  if (daysToReview !== null && daysToReview < 0) return { tone: 'overdue', text: `Review date passed. Still needs ${needed} more ${task}. Set a quick check.` };
  if (daysToReview !== null && daysToReview <= 3) return { tone: 'act', text: `Review in ${daysToReview} day${daysToReview === 1 ? '' : 's'}. Needs ${needed} more ${task} first.` };
  if (daysActive >= 7 && !(plan.follow_up_qualifying_observations || 0)) return { tone: 'act', text: `${daysActive} days without an independent check. Set a quick check.` };
  return { tone: 'wait', text: `Needs ${needed} more ${task} to measure progress. Practice answers do not count.` };
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


// A grouped skill whose best leaf already has a plan can still hold another part that needs action.
const nextLeafInPlannedGroup = (group: SkillRollupGroup) => group.leaves.find((leaf) => leaf.readiness === 'ready')
  || group.leaves.find((leaf) => leaf.readiness === 'review_evidence') || null;

const readinessLabel: Record<InterventionRecommendation['readiness'], string> = {
  ready: 'Ready for practice',
  review_evidence: 'Check the evidence',
  open_plan: 'Plan running',
  collect_evidence: 'Still checking',
};
const timesSeen = (count: number) => `Seen in ${count} marked task${count === 1 ? '' : 's'}`;

type OutcomeChoice = 'improved' | 'resolved' | 'no_change' | 'declined' | 'inconclusive' | 'needs_more_support';
const OUTCOME_CHOICES: Array<{ id: OutcomeChoice; label: string; tone: 'good' | 'neutral' | 'bad' }> = [
  { id: 'resolved', label: 'Secure now', tone: 'good' },
  { id: 'improved', label: 'Improved', tone: 'good' },
  { id: 'no_change', label: 'No change yet', tone: 'neutral' },
  { id: 'inconclusive', label: 'Not clear yet', tone: 'neutral' },
  { id: 'needs_more_support', label: 'Needs more support', tone: 'bad' },
  { id: 'declined', label: 'Got harder', tone: 'bad' },
];
const outcomeLabel = (value?: string | null) => OUTCOME_CHOICES.find((item) => item.id === value)?.label || (value ? schoolStatus(value) : '');
const CANCEL_REASONS = ['The student has left this class', 'The need turned out to be a misunderstanding', 'I am handling this another way'];

const PLAN_STEPS = ['Notice', 'Confirm', 'Practise', 'Check', 'Result'];
const stepIndex = (plan: LearningIntervention) => {
  const stage = planStage(plan);
  return stage === 'start' ? 2 : stage === 'check' || stage === 'waiting' ? 3 : stage === 'results' ? 4 : 5;
};

/** Where this plan is in the loop. Replaces the old static "1 · Notice" bar with each plan's real position. */
const PlanStepper: React.FC<{ plan: LearningIntervention }> = ({ plan }) => {
  const current = plan.status === 'cancelled' ? -1 : stepIndex(plan);
  return <ol className="plan-stepper" aria-label="Where this plan is">
    {PLAN_STEPS.map((label, index) => {
      const state = current === -1 ? 'is-off' : index < current ? 'is-done' : index === current ? 'is-current' : 'is-next';
      return <li key={label} className={state} aria-current={state === 'is-current' ? 'step' : undefined}><i aria-hidden="true">{state === 'is-done' ? '✓' : index + 1}</i><span>{label}</span></li>;
    })}
  </ol>;
};

const ProgressRing: React.FC<{ value: number; max: number; label: string }> = ({ value, max, label }) => {
  const safeMax = Math.max(1, max);
  const ratio = Math.min(1, Math.max(0, value / safeMax));
  const radius = 22; const circumference = 2 * Math.PI * radius;
  return <figure className="plan-ring" aria-label={`${label}: ${value} of ${max}`}>
    <svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r={radius} className="plan-ring-track" /><circle cx="28" cy="28" r={radius} className="plan-ring-value" strokeDasharray={`${ratio * circumference} ${circumference}`} transform="rotate(-90 28 28)" /></svg>
    <figcaption><b>{value}/{max}</b><span>{label}</span></figcaption>
  </figure>;
};

/** Before the plan vs. since the plan, in words a teacher can read at a glance. */
const BeforeAfter: React.FC<{ plan: LearningIntervention }> = ({ plan }) => {
  const checks = plan.follow_up_qualifying_observations || 0;
  const correct = plan.follow_up_successful_observations || 0;
  const before = plan.baseline_qualifying_observations || plan.baseline_evidence_items || 0;
  const afterTone = !checks ? 'is-empty' : correct / checks >= 0.67 ? 'is-good' : correct / checks >= 0.34 ? 'is-mid' : 'is-low';
  return <div className="plan-before-after">
    <div className="is-before"><span>Before the plan</span><b>{before}</b><small>marked task{before === 1 ? '' : 's'} showed this gap</small></div>
    <div className="plan-before-after-arrow" aria-hidden="true">→</div>
    <div className={`is-after ${afterTone}`}><span>Since the plan</span><b>{checks ? `${correct}/${checks}` : '—'}</b><small>{checks ? `independent check${checks === 1 ? '' : 's'} done well` : 'no independent checks yet'}</small></div>
    <ProgressRing value={Math.min(checks, plan.target_min_followup_observations || 0)} max={plan.target_min_followup_observations || 0} label="checks needed" />
  </div>;
};

type PlanModal =
  | { mode: 'start'; plan: LearningIntervention; note: string }
  | { mode: 'complete'; plan: LearningIntervention; note: string; loading: boolean; expected?: OutcomeChoice; outcome?: OutcomeChoice; shortfall?: { done: number; needed: number } }
  | { mode: 'cancel'; plan: LearningIntervention; note: string }
  | { mode: 'check'; plan: LearningIntervention; questionIds: string[] };

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
  const [planModal, setPlanModal] = useState<PlanModal | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [practisedByPlan, setPractisedByPlan] = useState<Record<string, string[]> | null>(null);
  const [rollup] = useState<boolean>(() => readRollupPreference(params));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [list, nextContext] = await Promise.all([fetchTeacherAcademicProfileStudents(), getAcademicProgressExperienceContext()]);
        if (cancelled) return;
        setStudents(list); setContext(nextContext);
        const requestedStudent = params.get('student') || '';
        const selection = requestedStudent ? selectionFromStudent(list, requestedStudent) : null;
        if (selection) {
          setGrade(selection.grade); setClassName(selection.className); setStudentId(requestedStudent); setSubject(params.get('subject') || 'all');
        } else {
          // Open on the teacher's class instead of an empty picker: the last class they used,
          // or their only class.
          const classes = new Map(list.map((student) => {
            const value = { grade: gradeKey(student.grade), className: student.class_name || 'Unassigned' };
            return [`${value.grade}|${value.className}`, value] as const;
          }));
          const last = readLastClass();
          const pick = last && classes.has(`${last.grade}|${last.className}`) ? last : classes.size === 1 ? [...classes.values()][0] : null;
          if (pick) { setGrade(pick.grade); setClassName(pick.className); }
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Students could not be loaded.'); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load(); return () => { cancelled = true; };
  }, [params]);

  useEffect(() => { if (grade && className) writeLastClass(grade, className); }, [grade, className]);

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

  // ── Plan actions: one window with buttons instead of browser prompts ──────────────────────────
  const closePlanModal = () => { if (!planBusy) { setPlanModal(null); setPlanError(null); } };
  const openStart = (plan: LearningIntervention) => { setPlanError(null); setPlanModal({ mode: 'start', plan, note: 'Teacher confirms this plan and the follow-up target.' }); };
  const openCancel = (plan: LearningIntervention) => { setPlanError(null); setPlanModal({ mode: 'cancel', plan, note: '' }); };
  const openComplete = async (plan: LearningIntervention) => {
    setPlanError(null);
    setPlanModal({ mode: 'complete', plan, note: '', loading: true });
    try {
      const evaluation = await evaluateLearningIntervention(plan.id);
      if (evaluation.systemOutcome === 'insufficient_follow_up') {
        setPlanModal({ mode: 'complete', plan, note: '', loading: false, shortfall: { done: evaluation.qualifyingFollowUpObservations, needed: evaluation.minimumFollowUpObservations } });
        return;
      }
      const expected = (evaluation.systemOutcome === 'contradictory' ? 'inconclusive' : evaluation.systemOutcome) as OutcomeChoice;
      setPlanModal({ mode: 'complete', plan, loading: false, expected, outcome: expected, note: 'Teacher confirms the measured follow-up outcome.' });
    } catch (e) {
      setPlanModal({ mode: 'complete', plan, note: '', loading: false });
      setPlanError(e instanceof Error ? e.message : 'Follow-up evidence could not be checked.');
    }
  };
  const quickCheckQuestions = (plan: LearningIntervention): string[] => {
    const exact = (data?.recommendations || []).filter((item) => item.skill_key === plan.skill_key).flatMap((item) => item.exact_question_ids || []);
    // Prefer the server's record of what was practised; if that is unavailable, skip the first six
    // exact questions, which is what targeted practice preselects.
    const practised = practisedByPlan?.[plan.id] ?? [...new Set(exact)].slice(0, 6);
    return pickQuickCheckQuestions(exact, practised, 3);
  };
  const openQuickCheck = async (plan: LearningIntervention) => {
    setPlanError(null);
    if (!practisedByPlan) {
      try {
        const overview = await getSupportPlansOverview();
        const map = Object.fromEntries(overview.map((row) => [row.intervention_id, row.practised_question_ids || []]));
        setPractisedByPlan(map);
        const exact = (data?.recommendations || []).filter((item) => item.skill_key === plan.skill_key).flatMap((item) => item.exact_question_ids || []);
        setPlanModal({ mode: 'check', plan, questionIds: pickQuickCheckQuestions(exact, map[plan.id] ?? [...new Set(exact)].slice(0, 6), 3) });
        return;
      } catch { /* fall back to the local rule below */ }
    }
    setPlanModal({ mode: 'check', plan, questionIds: quickCheckQuestions(plan) });
  };

  const submitPlanModal = async () => {
    if (!planModal || planBusy) return;
    setPlanBusy(true); setPlanError(null);
    try {
      if (planModal.mode === 'start') {
        if (planModal.plan.approval_status === 'pending') {
          await reviewLearningInterventionPlan({ interventionId: planModal.plan.id, decision: 'approved', rationale: planModal.note.trim() });
        }
        await updateLearningIntervention({ interventionId: planModal.plan.id, action: 'start', note: planModal.note.trim() });
      } else if (planModal.mode === 'complete') {
        if (!planModal.outcome) throw new Error('Choose how the student did.');
        await updateLearningIntervention({ interventionId: planModal.plan.id, action: 'complete', note: planModal.note.trim(), outcomeStatus: planModal.outcome });
      } else if (planModal.mode === 'cancel') {
        await updateLearningIntervention({ interventionId: planModal.plan.id, action: 'cancel', note: planModal.note.trim() });
      } else if (planModal.mode === 'check') {
        if (!data) throw new Error('Student details are still loading.');
        const quota = await tryConsumePilotQuota('assignments_created');
        if (!quota.proceed) throw new Error(quota.error || 'The assignment creation limit has been reached.');
        const due = new Date(); due.setDate(due.getDate() + 3); due.setHours(23, 59, 0, 0);
        // A normal assessed assignment (not registered as intervention practice), so the answers
        // count as independent follow-up evidence. Questions already used in practice are excluded.
        await GameService.create_assignment({
          subject: planModal.plan.subject as Subject,
          topic_name: planModal.plan.skill,
          question_ids: planModal.questionIds,
          assigned_at: new Date().toISOString(),
          due_at: due.toISOString(),
          title: `${planModal.plan.skill} · Quick check`,
          description: `A short independent check for ${data.student.name}.`,
          instructions: 'Work on your own without notes. This short check shows how well you can use the skill now.',
          assignment_mode: 'custom',
          student_ids: [data.student.id],
          assignment_category: 'quiz',
          publish_status: 'published',
          close_submissions_after_due: false,
          notify_students_by_email: false,
        });
        brainsAlert(`Quick check sent to ${data.student.name}. Their answers will count towards this plan.`, 'success');
      }
      setPlanModal(null);
      await refresh();
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'The support plan could not be updated.');
    } finally { setPlanBusy(false); }
  };

  const recommendations = useMemo(() => {
    const rows = aggregateRecommendations(data?.recommendations || []);
    if (!requestedFocusCode) return rows;
    return [...rows].sort((a, b) => Number(b.evidence_focus_code === requestedFocusCode) - Number(a.evidence_focus_code === requestedFocusCode));
  }, [data?.recommendations, requestedFocusCode]);
  const requestedFocusRecommendation = requestedFocusCode
    ? recommendations.find((item) => item.evidence_focus_code === requestedFocusCode) || null
    : null;
  // Grouped skills can hold a planned leaf next to a new reviewable one, so open-plan cards stay
  // here (pointing at the plan below) rather than hiding the whole group.
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
  const groupNext = (group: SkillRollupGroup) => group.readiness === 'open_plan' ? nextLeafInPlannedGroup(group)?.readiness : group.readiness;
  const readyCount = rollup
    ? actionableGroups.filter((group) => groupNext(group) === 'ready').length
    : actionable.filter((item) => item.readiness === 'ready').length;
  const reviewCount = rollup
    ? actionableGroups.filter((group) => groupNext(group) === 'review_evidence').length
    : actionable.filter((item) => item.readiness === 'review_evidence').length;
  const watchingCount = rollup ? watchingGroups.length : watching.length;
  const openPlanList = (data?.interventions || []).filter((item) => ['planned', 'active'].includes(item.status));
  const openPlans = openPlanList.length;
  const plansWithResults = openPlanList.filter((plan) => planStage(plan) === 'results').length;
  const recentWins = (data?.interventions || []).filter((plan) => plan.status === 'completed'
    && ['improved', 'resolved'].includes(plan.outcome_status || '')
    && plan.completed_at && Date.now() - new Date(plan.completed_at).getTime() < 30 * 86400000);
  const shownPlans = (data?.interventions || []).filter((plan) => plan.status !== 'cancelled');
  const cancelledPlans = (data?.interventions || []).length - shownPlans.length;

  const renderGroup = (group: SkillRollupGroup, mode: 'action' | 'watch') => {
    const anchor = group.anchor;
    const nextLeaf = group.readiness === 'open_plan' ? nextLeafInPlannedGroup(group) : null;
    const parts = group.leaves.length;
    const summary = group.readiness === 'collect_evidence'
      ? `Brains Heist has noticed ${parts === 1 ? 'this' : `${parts} related slips`}, but needs a little more marked work to be sure.`
      : group.promotedByRollup
        ? `Small slips in ${parts} related parts of this skill add up to a clear pattern.`
        : anchor.rationale;
    return <article key={group.key} className={`priority-${group.priority} intervention-candidate ${mode === 'watch' ? 'is-watching' : 'is-actionable'} is-rollup`}>
      <div className="intervention-card-top"><span>{group.subject}{group.areaLabel ? ` · ${group.areaLabel}` : ''}</span><b>{readinessLabel[nextLeaf?.readiness || group.readiness]}</b></div>
      <h3>{group.primarySkill}</h3>
      <p className="intervention-card-summary">{summary}</p>
      <div className="intervention-signal-row"><span>{timesSeen(group.evidenceItems)}</span><span>Last seen {fmt(group.lastObservedAt)}</span>{group.availableExactQuestions ? <span>{group.availableExactQuestions} practice questions ready</span> : null}</div>
      <div className="intervention-targets intervention-targets--leaves">{group.leaves.map((leaf) => <span key={leaf.skill_key} className={leaf.readiness !== 'collect_evidence' ? 'is-qualifying' : undefined} title={(leaf.merged_skill_keys || [leaf.skill_key]).join('\n')}>{leaf.subskill || leaf.skill} · {leaf.evidence_items}</span>)}</div>
      {group.unlockHint ? <div className="intervention-watch-note"><strong>What would make this clear</strong><span>{group.unlockHint}</span></div> : null}
      <div className="intervention-action intervention-action--clear">
        {group.readiness === 'review_evidence' ? <><span>{group.promotedByRollup ? 'Look at the examples and confirm the need.' : 'Look at the examples, then decide.'}</span><button onClick={() => openEvidenceReview(group.promotedByRollup ? { ...anchor, diagnostic_targets: group.diagnosticTargets.length ? group.diagnosticTargets : group.leaves.map((leaf) => leaf.subskill || leaf.skill) } : anchor)}>Review evidence</button></> : null}
        {group.readiness === 'ready' ? <><span>Short practice made just for {data?.student.name || 'this student'}.</span>{onCreateTargetedPractice ? <button onClick={() => data && onCreateTargetedPractice({ student: data.student, recommendation: practiceRecommendationForGroup(group) })}>Create targeted practice</button> : <strong>Ready to make a plan</strong>}</> : null}
        {group.readiness === 'open_plan' && !nextLeaf ? <><span>This is already in a plan below.</span><strong>Plan in progress</strong></> : null}
        {nextLeaf?.readiness === 'review_evidence' ? <><span>One part is in a plan below. {nextLeaf.subskill || nextLeaf.skill} also needs a look.</span><button onClick={() => openEvidenceReview(nextLeaf)}>Review evidence</button></> : null}
        {nextLeaf?.readiness === 'ready' ? <><span>One part is in a plan below. {nextLeaf.subskill || nextLeaf.skill} is ready for practice.</span>{onCreateTargetedPractice ? <button onClick={() => startTargetedPractice(nextLeaf)}>Create targeted practice</button> : <strong>Ready to make a plan</strong>}</> : null}
        {group.readiness === 'collect_evidence' ? <><span>Brains Heist will keep watching future marked work.</span><strong>Keep monitoring</strong></> : null}
      </div>
      <details className="intervention-reference"><summary>Show the detail</summary>{group.leaves.map((leaf) => <div key={leaf.skill_key} className="intervention-rollup-leaf"><strong>{leaf.subskill || leaf.skill}</strong><small>{schoolStatus(leaf.status)} · {timesSeen(leaf.evidence_items).toLowerCase()} · {leaf.readiness === 'ready' ? 'confirmed' : leaf.readiness === 'review_evidence' ? 'ready to check' : leaf.readiness === 'open_plan' ? 'plan open' : 'still checking'}{leaf.confidence?.band ? ` · confidence ${leaf.confidence.band}` : ''}</small>{leaf.evidence_examples[0] ? <span><del>{leaf.evidence_examples[0].original || 'Original'}</del><b aria-hidden="true">→</b><ins>{leaf.evidence_examples[0].better_version || 'Correction'}</ins></span> : null}</div>)}</details>
    </article>;
  };

  const renderRecommendation = (r: InterventionRecommendation, mode: 'action' | 'watch') => {
    const example = r.evidence_examples[0];
    return <article key={`${r.subject}-${r.topic || ''}-${r.skill_key}`} className={`priority-${r.priority} intervention-candidate ${mode === 'watch' ? 'is-watching' : 'is-actionable'}`}>
      <div className="intervention-card-top"><span>{r.subject}{r.topic ? ` · ${r.topic}` : ''}</span><b>{readinessLabel[r.readiness]}</b></div>
      <h3>{r.skill}</h3>
      <p className="intervention-card-summary">{r.readiness === 'collect_evidence' ? 'Brains Heist has noticed this, but needs a little more marked work to be sure.' : r.rationale}</p>
      <div className="intervention-signal-row"><span>{timesSeen(r.evidence_items)}</span><span>Last seen {fmt(r.last_observed_at)}</span></div>
      {r.diagnostic_targets.length ? <div className="intervention-targets">{r.diagnostic_targets.map((target) => <span key={target}>{target}</span>)}</div> : null}
      {example ? <div className="intervention-example-primary"><strong>Evidence example</strong><span><del>{example.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{example.better_version || 'Correction'}</ins></span>{example.issue ? <small>{example.issue}</small> : null}</div> : null}
      {r.readiness === 'collect_evidence' ? <div className="intervention-watch-note"><strong>Why not act yet?</strong><span>{r.readiness_blocker || 'A little more marked work is needed so progress can be measured fairly.'}</span></div> : null}
      <div className="intervention-action intervention-action--clear">
        {r.readiness === 'review_evidence' ? <><span>Look at the examples, then decide.</span><button onClick={() => openEvidenceReview(r)}>Review evidence</button></> : null}
        {r.readiness === 'ready' ? <><span>Short practice made just for {data?.student.name || 'this student'}.</span>{onCreateTargetedPractice ? <button onClick={() => startTargetedPractice(r)}>Create targeted practice</button> : <strong>Ready to make a plan</strong>}</> : null}
        {r.readiness === 'open_plan' ? <><span>This is already in a plan below.</span><strong>Plan in progress</strong></> : null}
        {r.readiness === 'collect_evidence' ? <><span>Brains Heist will keep watching future marked work.</span><strong>Keep monitoring</strong></> : null}
      </div>
      <details className="intervention-reference"><summary>Show the detail</summary><dl><div><dt>Current status</dt><dd>{schoolStatus(r.status)}</dd></div><div><dt>How sure Brains Heist is</dt><dd>{r.confidence?.band ? `${r.confidence.band} · ${Math.round(r.confidence.score || 0)}%` : 'Building'}</dd></div></dl>{r.evidence_examples.slice(1).map((item, index) => <div className="intervention-example-primary" key={`${item.original}-${index}`}><span><del>{item.original || 'Original'}</del><b aria-hidden="true">→</b><ins>{item.better_version || 'Correction'}</ins></span>{item.issue ? <small>{item.issue}</small> : null}</div>)}</details>
    </article>;
  };

  const renderPlan = (plan: LearningIntervention) => {
    const stage = planStage(plan);
    const nudge = planNudge(plan);
    const won = plan.status === 'completed' && ['improved', 'resolved'].includes(plan.outcome_status || '');
    return <article key={plan.id} className={`plan-card is-${plan.status}${won ? ' is-win' : ''}`}>
      <div className="plan-card-top"><span>{plan.subject}</span><b>{plan.status === 'active' ? (stage === 'results' ? 'Results are in' : 'In progress') : plan.status === 'planned' ? 'Not started' : plan.status === 'completed' ? 'Finished' : 'Cancelled'}</b></div>
      <h3>{plan.skill}</h3>
      <PlanStepper plan={plan} />
      <BeforeAfter plan={plan} />
      {nudge ? <div className={`plan-nudge is-${nudge.tone}`} role={nudge.tone === 'overdue' ? 'alert' : undefined}><i aria-hidden="true" /><span>{nudge.text}</span></div> : null}
      {plan.outcome_status ? <div className={`plan-outcome${won ? ' is-win' : ''}`}><strong>{won ? '✓ ' : ''}Result: {outcomeLabel(plan.outcome_status)}</strong>{plan.outcome_note ? <span>{plan.outcome_note}</span> : null}</div> : null}
      <div className="plan-card-actions">
        {stage === 'start' ? <button type="button" onClick={() => openStart(plan)}>{plan.approval_status === 'pending' ? 'Approve plan & start' : 'Start plan'}</button> : null}
        {stage === 'check' || stage === 'waiting' ? <button type="button" onClick={() => void openQuickCheck(plan)}>Set a quick check</button> : null}
        {stage === 'results' ? <button type="button" className="is-strong" onClick={() => void openComplete(plan)}>See the result</button> : null}
        {stage === 'waiting' ? <button type="button" className="secondary" onClick={() => void openComplete(plan)}>Check progress</button> : null}
        {['planned', 'active'].includes(plan.status) ? <button type="button" className="link" onClick={() => openCancel(plan)}>Cancel plan</button> : null}
      </div>
      <details className="intervention-reference"><summary>Technical record</summary>
        <p>{plan.goal}</p>
        {plan.teaching_action ? <div className="plan-step"><strong>Practice action</strong><span>{plan.teaching_action}</span></div> : null}
        {plan.evidence_task ? <div className="plan-step"><strong>Independent check</strong><span>{plan.evidence_task}</span></div> : null}
        <small>Started {fmt(plan.started_at)} · review by {fmt(plan.target_date)} · success means {plan.target_min_successful_observations} good results from {plan.target_min_followup_observations} independent follow-ups.</small>
        {plan.system_outcome_status ? <small>Brains Heist measured: {schoolStatus(plan.system_outcome_status)}</small> : null}
      </details>
    </article>;
  };

  const renderPlanModal = () => {
    if (!planModal) return null;
    const { plan } = planModal;
    const noteLength = 'note' in planModal ? planModal.note.trim().length : 0;
    const setNote = (note: string) => setPlanModal((current) => current && 'note' in current ? { ...current, note } as PlanModal : current);
    let title = ''; let body: React.ReactNode = null; let primary = ''; let canSubmit = !planBusy;
    if (planModal.mode === 'start') {
      title = `Start the plan for ${plan.skill}`;
      primary = plan.approval_status === 'pending' ? 'Approve plan & start' : 'Start plan';
      canSubmit = canSubmit && noteLength >= 10;
      body = <>
        <p>From today, Brains Heist counts {data?.student.name || 'the student'}’s independent marked work on this skill. After {plan.target_min_followup_observations} checks you will see whether it worked.</p>
        <label>Your note <small>(kept with the plan)</small><textarea value={planModal.note} onChange={(e) => setNote(e.target.value)} /></label>
        {noteLength < 10 ? <small className="plan-modal-hint">Write at least 10 characters.</small> : null}
      </>;
    } else if (planModal.mode === 'cancel') {
      title = `Cancel the plan for ${plan.skill}?`;
      primary = 'Cancel plan';
      canSubmit = canSubmit && noteLength >= 10;
      body = <>
        <p>Choose a reason, or write your own.</p>
        <div className="plan-chip-row">{CANCEL_REASONS.map((reason) => <button key={reason} type="button" className={planModal.note === reason ? 'is-active' : undefined} onClick={() => setNote(reason)}>{reason}</button>)}</div>
        <label>Reason<textarea value={planModal.note} onChange={(e) => setNote(e.target.value)} /></label>
        {noteLength < 10 ? <small className="plan-modal-hint">Write at least 10 characters.</small> : null}
      </>;
    } else if (planModal.mode === 'check') {
      title = 'Send a quick check';
      primary = 'Send check';
      canSubmit = canSubmit && planModal.questionIds.length > 0;
      body = planModal.questionIds.length
        ? <>
          <p><b>{planModal.questionIds.length} question{planModal.questionIds.length === 1 ? '' : 's'}</b> on {plan.skill}, only for {data?.student.name || 'this student'}, due in 3 days.</p>
          <ul className="plan-check-facts"><li>Uses questions they have <b>not</b> practised, so it shows real progress.</li><li>Sent as a normal quiz, so the answers count towards this plan.</li><li>Practice answers never count, only checks like this one.</li></ul>
        </>
        : <p>Every question we have for this skill has already been used in practice. Any other marked work that includes {plan.skill.toLowerCase()} will count as a check.</p>;
    } else {
      title = `How did ${data?.student.name || 'the student'} do?`;
      primary = 'Save result';
      if (planModal.loading) {
        canSubmit = false;
        body = <p>Checking their latest marked work…</p>;
      } else if (planModal.shortfall) {
        canSubmit = false;
        body = <>
          <p>Not enough checks yet: <b>{planModal.shortfall.done} of {planModal.shortfall.needed}</b> done.</p>
          <ProgressRing value={planModal.shortfall.done} max={planModal.shortfall.needed} label="checks done" />
          <button type="button" className="plan-inline-action" onClick={() => void openQuickCheck(plan)}>Set a quick check now</button>
        </>;
      } else {
        const changed = planModal.outcome !== planModal.expected;
        canSubmit = canSubmit && Boolean(planModal.outcome) && noteLength >= (changed ? 20 : 10);
        body = <>
          {planModal.expected ? <div className={`plan-measured is-${OUTCOME_CHOICES.find((item) => item.id === planModal.expected)?.tone || 'neutral'}`}><span>Brains Heist measured</span><b>{outcomeLabel(planModal.expected)}</b></div> : null}
          <BeforeAfter plan={plan} />
          <p>Do you agree? Pick a different result only if you know something the checks don’t show.</p>
          <div className="plan-chip-row">{OUTCOME_CHOICES.map((choice) => <button key={choice.id} type="button" className={`is-${choice.tone}${planModal.outcome === choice.id ? ' is-active' : ''}`} onClick={() => setPlanModal((current) => current && current.mode === 'complete' ? { ...current, outcome: choice.id, note: choice.id === current.expected ? 'Teacher confirms the measured follow-up outcome.' : (current.note === 'Teacher confirms the measured follow-up outcome.' ? '' : current.note) } : current)}>{choice.label}{choice.id === planModal.expected ? ' ✓' : ''}</button>)}</div>
          <label>Your note<textarea value={planModal.note} onChange={(e) => setNote(e.target.value)} placeholder={changed ? 'Explain why your result differs from the measured one.' : ''} /></label>
          {noteLength < (changed ? 20 : 10) ? <small className="plan-modal-hint">{changed ? 'Because you changed the result, write at least 20 characters.' : 'Write at least 10 characters.'}</small> : null}
        </>;
      }
    }
    return <div className="intervention-modal-layer"><button className="backdrop" onClick={closePlanModal} aria-label="Close" /><section className="intervention-modal plan-modal" role="dialog" aria-modal="true" aria-labelledby="plan-modal-title">
      <div className="intervention-modal-kicker"><span>{plan.subject}</span><b>{plan.skill}</b></div>
      <h2 id="plan-modal-title">{title}</h2>
      {body}
      {planError ? <div className="modal-error" role="alert">{planError}</div> : null}
      <div className="intervention-modal-actions"><button type="button" className="secondary" onClick={closePlanModal} disabled={planBusy}>Close</button>{primary && !(planModal.mode === 'complete' && (planModal.loading || planModal.shortfall)) ? <button type="button" className={planModal.mode === 'cancel' ? 'is-danger' : undefined} disabled={!canSubmit} onClick={() => void submitPlanModal()}>{planBusy ? 'Saving…' : primary}</button> : null}</div>
    </section></div>;
  };

  return <main className="intervention-page intervention-page--simple">
    <AcademicProgressHeader context={context} eyebrow="Student Support" title="Interventions" subtitle="See who needs help, give focused practice, and check whether it worked." onBack={onBack} backLabel={onBack ? 'Back to Teacher Workspace' : (context?.viewer.role === 'school_admin' ? 'Back to School Administration' : 'Back to Teacher Workspace')} />
    <AcademicStudentPicker students={students} grade={grade} className={className} studentId={studentId} subject={subject} onGradeChange={(value) => { setGrade(value); setClassName(''); setStudentId(''); setSubject('all'); }} onClassChange={(value) => { setClassName(value); setStudentId(''); setSubject('all'); }} onStudentChange={(value) => { setStudentId(value); setSubject('all'); }} onSubjectChange={setSubject} />

    {error ? <div className="intervention-alert">{error}</div> : null}
    {!studentId && !className ? <div className="aps-empty-state">Choose a class to see what it needs, or go straight to a student.</div> : null}
    {!studentId && className ? <>
      {classSubjects.length > 1 ? <div className="intervention-view-toggle intervention-class-subjects" role="tablist" aria-label="Subject">
        <span>Subject</span>
        {classSubjects.map((value) => <button key={value} type="button" role="tab" aria-selected={classSubject === value} className={classSubject === value ? 'is-active' : undefined} onClick={() => setClassSubject(value)}>{value}</button>)}
      </div> : null}
      {classSubject
        ? <ClassLearningNeeds classLabel={className} studentIds={classRosterIds} subject={classSubject} onSelectStudent={(value) => { setStudentId(value); setSubject(classSubject); }} />
        : <div className="aps-empty-state">Choose a subject to see what this class needs.</div>}
    </> : null}
    {loading && studentId && !data ? <div className="intervention-loading">Loading student support information…</div> : null}

    {data ? <>
      {requestedFocusRecommendation ? <section className="intervention-alert intervention-alert--focus"><strong>Opened from Quick diagnostic:</strong> {requestedFocusRecommendation.evidence_focus_name || requestedFocusRecommendation.skill}. Check the evidence below, then create practice when it shows as ready.</section> : null}
      <section className="intervention-student intervention-student--command"><div><span>Support for</span><h2>{data.student.name}</h2><p>Grade {data.student.grade || '—'} · Class {data.student.class_name || '—'}{subject !== 'all' ? ` · ${subject}` : ''}</p></div>
        <div className="intervention-today-stats">
          <span className={readyCount + reviewCount ? 'is-hot' : undefined}><b>{readyCount + reviewCount}</b> to act on</span>
          <span className={plansWithResults ? 'is-good' : undefined}><b>{openPlans}</b> plan{openPlans === 1 ? '' : 's'} running{plansWithResults ? ` · ${plansWithResults} with results` : ''}</span>
          <span><b>{watchingCount}</b> being watched</span>
        </div>
      </section>

      {recentWins.length ? <section className="intervention-wins" aria-label="Recent progress">{recentWins.map((plan) => <div key={plan.id} className="intervention-win"><span aria-hidden="true">🎉</span><div><strong>{data.student.name} {plan.outcome_status === 'resolved' ? 'is now secure in' : 'has improved in'} {plan.skill}</strong><small>Measured from {plan.follow_up_qualifying_observations} independent check{plan.follow_up_qualifying_observations === 1 ? '' : 's'} · finished {fmt(plan.completed_at)}</small></div></div>)}</section> : null}

      <section className="intervention-panel"><div className="intervention-heading intervention-heading--simple"><div><span>Needs attention</span><h2>What can I act on now?</h2></div><p>Each card has one next step.</p></div>
        <div className="intervention-recommendations intervention-recommendations--simple">{rollup ? actionableGroups.map((group) => renderGroup(group, 'action')) : actionable.map((r) => renderRecommendation(r, 'action'))}{(rollup ? !actionableGroups.length : !actionable.length) ? <div className="intervention-empty"><strong>Nothing new to act on.</strong><span>Brains Heist will put a need here as soon as the marked work shows it clearly.</span></div> : null}</div>
      </section>

      <section className="intervention-panel"><div className="intervention-heading intervention-heading--simple"><div><span>Support in progress</span><h2>Plans and follow-up</h2></div><p>Practice helps the student rehearse. Only later independent checks show whether it worked.</p></div>
        <div className="plan-list">{shownPlans.map(renderPlan)}{!shownPlans.length ? <div className="intervention-empty"><strong>No plans yet.</strong><span>Confirm a need above and create targeted practice to start one.</span></div> : null}</div>
        {cancelledPlans ? <small className="plan-list-footnote">{cancelledPlans} cancelled plan{cancelledPlans === 1 ? '' : 's'} hidden.</small> : null}
      </section>

      <details className="intervention-panel intervention-panel--watch intervention-watch-collapsed"><summary><span>Brains Heist is watching {watchingCount} more area{watchingCount === 1 ? '' : 's'}</span><small>Show</small></summary>
        <div className="intervention-heading intervention-heading--simple"><div><span>Still gathering evidence</span><h2>What is Brains Heist watching?</h2></div><p>These are early signals, not less important needs. More assessed evidence is required before intervention.</p></div>
        <div className="intervention-recommendations intervention-recommendations--simple">{rollup ? watchingGroups.map((group) => renderGroup(group, 'watch')) : watching.map((r) => renderRecommendation(r, 'watch'))}{(rollup ? !watchingGroups.length : !watching.length) ? <div className="intervention-empty"><strong>Nothing else is being watched.</strong><span>Everything Brains Heist has noticed is already in the sections above.</span></div> : null}</div>
      </details>
    </> : null}

    {renderPlanModal()}
    {reviewing ? <div className="intervention-modal-layer"><button className="backdrop" onClick={() => setReviewing(null)} aria-label="Close evidence review"/><section className="intervention-modal intervention-review-modal" role="dialog" aria-modal="true" aria-labelledby="intervention-review-title"><div className="intervention-modal-kicker"><span>Verify the need</span><b>{reviewing.evidence_items} evidence item{reviewing.evidence_items === 1 ? '' : 's'}</b></div><h2 id="intervention-review-title">Review: {reviewing.skill}</h2><p>Brains Heist has noticed a possible learning need. Review the evidence below, confirm the specific target, then choose whether this is ready for focused practice. The student's original work is never changed.</p><div className="intervention-review-summary"><strong>Why it was surfaced</strong><span>{reviewing.rationale}</span><small>Confidence: {reviewing.confidence?.band ? `${reviewing.confidence.band} · ${Math.round(reviewing.confidence.score || 0)}%` : 'still building'}</small></div>{reviewing.evidence_examples.length ? <div className="intervention-examples">{reviewing.evidence_examples.map((example, index) => <div key={`${example.original}-${index}`}><strong>Evidence {index + 1}</strong><span><del>{example.original || 'Original response'}</del><b aria-hidden="true">→</b><ins>{example.better_version || 'Improved version'}</ins></span><small>{example.issue}</small></div>)}</div> : <div className="intervention-no-example"><strong>No sentence-level example is attached to this signal.</strong><span>Use the diagnostic target and assessed-history summary below; choose “Keep monitoring” if the evidence is not specific enough yet.</span></div>}<fieldset><legend>What specifically needs support?</legend>{(reviewing.diagnostic_targets.length ? reviewing.diagnostic_targets : [reviewing.skill]).map((target) => <label key={target} className="target-check"><input type="checkbox" checked={selectedTargets.includes(target)} onChange={(e) => setSelectedTargets((current) => e.target.checked ? [...new Set([...current, target])] : current.filter((item) => item !== target))}/><span>{target}</span></label>)}</fieldset><label>Teacher evidence note<textarea value={reviewRationale} onChange={(e) => setReviewRationale(e.target.value)} placeholder="Briefly record why the assessed work supports—or does not yet support—this target." /></label>{modalError ? <div className="modal-error" role="alert">{modalError}</div> : null}<div className="intervention-modal-actions"><button className="secondary" disabled={reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('needs_more_evidence')}>Keep monitoring</button><button disabled={!selectedTargets.length || reviewRationale.trim().length < 10 || loading} onClick={() => void saveEvidenceReview('confirmed')}>Confirm need</button></div><small className="intervention-modal-footnote">After confirmation, the primary action becomes “Create targeted practice” for this student only.</small></section></div> : null}
  </main>;
};

export default TeacherInterventionIntelligencePageV2;
