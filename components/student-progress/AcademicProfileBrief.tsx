import React, { useEffect, useState } from 'react';
import { getInterventionIntelligence, type LearningIntervention } from '../../services/studentInterventionService';
import './AcademicProfileBrief.css';

export interface ProfileBriefNeed { key: string; label: string; status: string; evidence: number }
export interface ProfileBriefProps {
  studentId?: string | null;
  subject: string | null;              // null = all subjects
  average: number | null;
  completedAssignments: number;
  latestAssignment?: { title: string; accuracy: number; completedAt?: string | null } | null;
  needs: ProfileBriefNeed[];           // active support areas, strongest first
  watching: number;                    // evidence still to confirm
  improving: number;
  strengths: number;
  checkNext: string[];                 // suggested next checks (sub-skill names)
  canSeePlans: boolean;                // teacher / school roles only
  /** Render an "Open Interventions" link the teacher shell intercepts (aria-label + data attributes). */
  interventionsLink?: { studentId: string; subject?: string | null; studentName: string } | null;
}

const fmt = (value?: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const tone = (average: number | null) => (average == null ? 'none' : average >= 80 ? 'strong' : average >= 60 ? 'developing' : 'focus');
const statusWord: Record<string, string> = { new_focus: 'new', recurring: 'repeated', persistent: 'long-running', improving: 'improving' };

const AcademicProfileBrief: React.FC<ProfileBriefProps> = ({
  studentId, subject, average, completedAssignments, latestAssignment, needs, watching, improving, strengths, checkNext, canSeePlans, interventionsLink,
}) => {
  const [plans, setPlans] = useState<LearningIntervention[] | null>(null);

  useEffect(() => {
    if (!canSeePlans || !studentId) { setPlans(null); return; }
    let cancelled = false;
    getInterventionIntelligence(studentId, subject)
      .then((data) => { if (!cancelled) setPlans(data.interventions.filter((item) => ['planned', 'active'].includes(item.status))); })
      .catch(() => { if (!cancelled) setPlans(null); });
    return () => { cancelled = true; };
  }, [canSeePlans, studentId, subject]);

  const confirmedNeeds = needs.slice(0, 3);
  const activePlan = plans?.find((item) => item.status === 'active') || plans?.[0] || null;
  const planLine = !canSeePlans ? null
    : plans === null ? null
    : !plans.length ? 'No support plan yet'
    : activePlan?.status === 'active'
      ? `Plan active · ${activePlan.follow_up_qualifying_observations || 0}/${activePlan.target_min_followup_observations} follow-ups${activePlan.target_date ? ` · review ${fmt(activePlan.target_date)}` : ''}`
      : `Plan ${activePlan?.approval_status === 'pending' ? 'awaiting approval' : 'ready to start'}${activePlan?.target_date ? ` · review ${fmt(activePlan.target_date)}` : ''}`;

  return <section className={`apb is-${tone(average)}`} aria-label="At a glance">
    <div className="apb-score">
      <strong>{average == null ? '—' : `${Math.round(average)}%`}</strong>
      <span>{completedAssignments ? `${completedAssignments} assignment${completedAssignments === 1 ? '' : 's'}` : 'No assignments yet'}</span>
      {latestAssignment ? <small>Latest: {latestAssignment.title} · {Math.round(latestAssignment.accuracy)}%{latestAssignment.completedAt ? ` · ${fmt(latestAssignment.completedAt)}` : ''}</small> : null}
    </div>

    <div className="apb-facts">
      <div className="apb-fact is-needs">
        <b>{needs.length}</b>
        <span>{needs.length === 1 ? 'need to act on' : 'needs to act on'}</span>
        {confirmedNeeds.length ? <ul>{confirmedNeeds.map((need) => <li key={need.key}><span>{need.label}</span><small>{statusWord[need.status] || need.status} · {need.evidence}</small></li>)}{needs.length > confirmedNeeds.length ? <li className="is-more">+{needs.length - confirmedNeeds.length} more</li> : null}</ul> : <p>Nothing confirmed yet.</p>}
      </div>
      <div className="apb-fact is-watch">
        <b>{watching}</b>
        <span>still being watched</span>
        {checkNext.length ? <p>Check next: {checkNext.slice(0, 2).join(', ')}</p> : <p>Needs more assessed work.</p>}
      </div>
      <div className="apb-fact is-good">
        <b>{improving + strengths}</b>
        <span>{improving + strengths === 1 ? 'going well' : 'going well'}</span>
        <p>{[improving ? `${improving} improving` : null, strengths ? `${strengths} strength${strengths === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'No strengths recorded yet.'}</p>
      </div>
    </div>

    {planLine ? <div className={`apb-plan${activePlan?.status === 'active' ? ' is-active' : plans?.length ? ' is-pending' : ''}`}>
      <span>{planLine}</span>
      {interventionsLink ? <button type="button" aria-label={`Open Interventions for ${interventionsLink.studentName}`} data-student-id={interventionsLink.studentId} data-subject={interventionsLink.subject || ''}>{plans?.length ? 'Open plan' : 'Plan support'}</button> : null}
    </div> : null}
  </section>;
};

export default AcademicProfileBrief;
