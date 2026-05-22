import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useNavigate } from 'react-router-dom';
import { rpcIeltsStudentJourney, type IeltsJourneyAssignmentItem, type IeltsStudentJourney } from '../../../services/ieltsJourneyService';

type LoadState = 'loading' | 'ready' | 'error';
type SkillKey = 'reading' | 'listening' | 'writing' | 'speaking';

const orderedSkills: SkillKey[] = ['reading', 'listening', 'writing', 'speaking'];
const skillLabels: Record<SkillKey, string> = { reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking' };

const formatBand = (value?: number | null) => (value === null || value === undefined ? 'Not enough data yet' : value.toFixed(1));
const formatDate = (value?: string | null, empty = 'No due date') => {
  if (!value) return empty;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return empty;
  return parsed.toLocaleDateString(undefined, { dateStyle: 'medium' });
};
const humanizeStatus = (status?: string | null) => {
  const value = (status ?? '').trim().toLowerCase();
  if (!value) return 'Not started';
  if (value === 'in_progress') return 'In progress';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
};

const isActionable = (item: IeltsJourneyAssignmentItem) => {
  const status = (item.status ?? '').toLowerCase();
  return status !== 'completed' && ((item.skills ?? []).length > 0 || !!item.started_at || !!item.assigned_at);
};

const taskState = (item: IeltsJourneyAssignmentItem, skill: SkillKey) => {
  if (skill === 'reading' || skill === 'listening') return item.objective_result_link ? 'Result available' : item.completed_at ? 'Submitted' : item.started_at ? 'Started' : 'Not started';
  if (item.has_finalized_review) return 'Feedback ready';
  if (item.completed_at || item.feedback_status === 'awaiting_feedback') return 'Review pending';
  return item.started_at ? 'Started' : 'Not started';
};

const IeltsJourneyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [journey, setJourney] = useState<IeltsStudentJourney | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('current');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const renderCompletedSkillRow = (item: IeltsJourneyAssignmentItem, skill: SkillKey) => {
    const label = taskState(item, skill);
    const canViewResult = (skill === 'reading' || skill === 'listening') && !!item.objective_result_link;
    const canViewFeedback = (skill === 'writing' || skill === 'speaking') && !!item.review_result_link && !!item.has_finalized_review;
    const showReviewPending = (skill === 'writing' || skill === 'speaking') && !item.has_finalized_review;

    return <div key={skill} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem' }}>
      <span>{skillLabels[skill]}</span>
      <span>{label}</span>
      {canViewResult ? <button type="button" onClick={() => navigate(item.objective_result_link as string)}>View result</button> : null}
      {canViewFeedback ? <button type="button" onClick={() => navigate(item.review_result_link as string)}>View feedback</button> : null}
      {showReviewPending ? <span>Review pending</span> : null}
    </div>;
  };

  useEffect(() => {
    const run = async () => {
      setLoadState('loading');
      try {
        setJourney(await rpcIeltsStudentJourney());
        setLoadState('ready');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load your IELTS journey.');
        setLoadState('error');
      }
    };
    void run();
  }, []);

  const summary = useMemo(() => {
    const current = journey?.assigned_practice.length ?? 0;
    const completed = journey?.completed_practice.length ?? 0;
    const results = (journey?.completed_practice ?? []).filter((item) => !!item.objective_result_link).length;
    const feedback = (journey?.completed_practice ?? []).filter((item) => !!item.review_result_link && !!item.has_finalized_review).length;
    return { current, completed, results, feedback };
  }, [journey]);

  const actionable = useMemo(() => (journey?.assigned_practice ?? []).find(isActionable) ?? null, [journey]);

  useEffect(() => {
    if (loadState !== 'ready' || !rootRef.current) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      if (reduced) return;
      gsap.from('[data-anim="header"]', { opacity: 0, y: 10, duration: 0.35 });
      gsap.from('[data-anim="card"]', { opacity: 0, y: 10, stagger: 0.06, duration: 0.35, delay: 0.06 });
      gsap.from('[data-anim="section"]', { opacity: 0, y: 12, stagger: 0.08, duration: 0.4, delay: 0.12 });
    }, rootRef);
    return () => ctx.revert();
  }, [loadState]);

  return <div ref={rootRef} style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', padding: '1rem' }}>
    <div style={{ maxWidth: '74rem', margin: '0 auto', display: 'grid', gap: '1rem' }}>
      <button type="button" onClick={() => navigate('/ielts')} style={{ color: '#2563eb', background: 'none', border: 'none', textAlign: 'left', fontWeight: 700 }}>← Back to IELTS Home</button>
      <header data-anim="header" style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: '1rem', padding: '1.2rem' }}>
        <h1 style={{ margin: 0, color: '#1e3a8a' }}>My IELTS Journey</h1>
        <p style={{ margin: '0.5rem 0 0', color: '#334155' }}>Track your assignments, results, and reviewed feedback.</p>
      </header>

      {loadState === 'loading' && <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.8rem', padding: '0.8rem' }}>Loading your IELTS journey…</div>}
      {loadState === 'error' && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.8rem', padding: '0.8rem' }}>{error}</div>}

      {loadState === 'ready' && journey && <>
        <section data-anim="card" style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {[['Current assignments', summary.current], ['Completed assignments', summary.completed], ['Results available', summary.results], ['Feedback ready', summary.feedback]].map(([label, value]) => <div key={String(label)} style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: '0.8rem', padding: '0.8rem' }}><div style={{ fontSize: '0.78rem', color: '#475569' }}>{label}</div><div style={{ fontSize: '1.5rem', color: '#1d4ed8', fontWeight: 900 }}>{value}</div></div>)}
        </section>

        <section data-anim="card" style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: '0.8rem', padding: '0.9rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Readiness overview</h2>
          <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginTop: '0.7rem' }}>
            <div><strong>Overall</strong><div>{formatBand(journey.current_estimates?.overall)}</div></div>
            <div><strong>Reading</strong><div>{formatBand(journey.current_estimates?.reading)}</div></div>
            <div><strong>Listening</strong><div>{formatBand(journey.current_estimates?.listening)}</div></div>
            <div><strong>Writing</strong><div>{formatBand(journey.current_estimates?.writing)}</div></div>
            <div><strong>Speaking</strong><div>{formatBand(journey.current_estimates?.speaking)}</div></div>
          </div>
        </section>

        <section data-anim="card" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.8rem', padding: '0.9rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Next action</h2>
          {actionable ? <><p style={{ margin: '0.5rem 0' }}>{actionable.title}</p><p style={{ margin: '0 0 0.6rem' }}>Status: {humanizeStatus(actionable.status)}</p><button type="button" onClick={() => navigate('/ielts/practice/assigned')} style={{ border: '1px solid #2563eb', background: '#2563eb', color: '#fff', borderRadius: '0.45rem', padding: '0.5rem 0.8rem' }}>Open assigned practice</button></> : (summary.results + summary.feedback > 0 ? <p style={{ margin: '0.5rem 0 0' }}>View your latest results and feedback.</p> : <p style={{ margin: '0.5rem 0 0' }}>No active IELTS assignments right now.</p>)}
        </section>

        <section data-anim="section" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.8rem', padding: '0.9rem' }}>
          <h2 style={{ marginTop: 0 }}>Current assignments</h2>
          {journey.assigned_practice.length === 0 ? <p>No current IELTS assignments.</p> : journey.assigned_practice.map((item) => {
            const skills = orderedSkills.filter((skill) => (item.skills ?? []).includes(skill));
            const done = skills.filter((skill) => ['Result available', 'Feedback ready'].includes(taskState(item, skill))).length;
            return <article key={item.assignment_id} className="journey-card" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.7rem', marginTop: '0.7rem' }}>
              <h3 style={{ margin: 0 }}>{item.title}</h3>
              <p style={{ margin: '0.25rem 0' }}>Status: {humanizeStatus(item.status)}</p>
              <p style={{ margin: '0.25rem 0' }}>Due date: {formatDate(item.due_at)}</p>
              <p style={{ margin: '0.25rem 0' }}>{done} / {skills.length || 0} tasks completed</p>
              {skills.map((skill) => <div key={skill} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem' }}><span>{skillLabels[skill]}</span><span>{taskState(item, skill)}</span></div>)}
            </article>;
          })}
        </section>

        <section data-anim="section" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.8rem', padding: '0.9rem' }}>
          <h2 style={{ marginTop: 0 }}>Completed assignments</h2>
          {journey.completed_practice.length === 0 ? <p>No completed IELTS assignments yet.</p> : journey.completed_practice.map((item) => {
            const skills = orderedSkills.filter((skill) => (item.skills ?? []).includes(skill));
            return <article key={item.assignment_id} className="journey-card" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.7rem', marginTop: '0.7rem' }}>
              <h3 style={{ margin: 0 }}>{item.title}</h3><p style={{ margin: '0.25rem 0' }}>Completed: {formatDate(item.completed_at, '—')}</p>
              {skills.map((skill) => renderCompletedSkillRow(item, skill))}
            </article>;
          })}
        </section>

        <section data-anim="section" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.8rem', padding: '0.9rem' }}>
          <h2 style={{ marginTop: 0 }}>Results & Feedback</h2>
          <h3>Objective Results</h3>
          {(journey.completed_practice.some((item) => !!item.objective_result_link)) ? journey.completed_practice.map((item) => item.objective_result_link ? <div key={`r-${item.assignment_id}`}>{item.title} <button type="button" onClick={() => navigate(item.objective_result_link as string)}>View result</button></div> : null) : <p>No results available yet.</p>}
          <h3>Reviewed Feedback</h3>
          {(journey.completed_practice.some((item) => !!item.review_result_link && !!item.has_finalized_review)) ? journey.completed_practice.map((item) => item.review_result_link && item.has_finalized_review ? <div key={`f-${item.assignment_id}`}>{item.title} <button type="button" onClick={() => navigate(item.review_result_link as string)}>View feedback</button></div> : null) : <p>No reviewed feedback yet.</p>}
          {(journey.completed_practice.some((item) => !item.has_finalized_review && (item.skills ?? []).some((s) => s === 'writing' || s === 'speaking'))) ? <p>Review pending — your teacher or school admin has not finalized feedback yet.</p> : null}
        </section>
      </>}
    </div>
  </div>;
};

export default IeltsJourneyDashboard;
