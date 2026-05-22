import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useNavigate } from 'react-router-dom';
import { rpcIeltsStudentJourney, type IeltsJourneyAssignmentItem, type IeltsStudentJourney } from '../../../services/ieltsJourneyService';

type LoadState = 'loading' | 'ready' | 'error';
type DashboardTab = 'current' | 'completed' | 'results';
type SkillKey = 'reading' | 'listening' | 'writing' | 'speaking';

const skillLabels: Record<string, string> = { reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking', overall: 'Overall' };
const orderedSkills: SkillKey[] = ['reading', 'listening', 'writing', 'speaking'];

const formatDate = (value?: string | null) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No due date';
  return parsed.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const isReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const taskState = (item: IeltsJourneyAssignmentItem, skill: SkillKey) => {
  const skills = item.skills ?? [];
  if (!skills.includes(skill)) return 'Not assigned';
  if ((item.status || '').toLowerCase() === 'completed') {
    if ((skill === 'reading' || skill === 'listening') && item.objective_result_link) return 'Result available';
    if ((skill === 'writing' || skill === 'speaking') && item.has_finalized_review) return 'Feedback ready';
    if (skill === 'writing' || skill === 'speaking') return 'Review pending';
    return 'Completed';
  }
  if (item.started_at && !item.completed_at) return 'Started';
  return 'Not started';
};

const IeltsJourneyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [journey, setJourney] = useState<IeltsStudentJourney | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('current');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const loadJourney = async () => {
    setLoadState('loading');
    setError(null);
    try {
      setJourney(await rpcIeltsStudentJourney());
      setLoadState('ready');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your IELTS journey.');
      setLoadState('error');
    }
  };

  useEffect(() => { void loadJourney(); }, []);

  const summary = useMemo(() => {
    const current = journey?.assigned_practice.length ?? 0;
    const completed = journey?.completed_practice.length ?? 0;
    const resultsAvailable = (journey?.completed_practice ?? []).filter((i) => !!i.objective_result_link).length;
    const feedbackReady = (journey?.completed_practice ?? []).filter((i) => !!i.review_result_link && !!i.has_finalized_review).length;
    return { current, completed, resultsAvailable, feedbackReady };
  }, [journey]);

  const nextAction = useMemo(() => {
    const current = journey?.assigned_practice?.[0];
    if (current) {
      const done = orderedSkills.filter((skill) => taskState(current, skill) === 'Completed' || taskState(current, skill) === 'Result available' || taskState(current, skill) === 'Feedback ready').length;
      const nextTask = orderedSkills.find((skill) => ['Not started', 'Started', 'Review pending'].includes(taskState(current, skill)));
      return { mode: 'current' as const, current, done, nextTask: nextTask ? skillLabels[nextTask] : 'All tasks complete' };
    }
    if ((journey?.completed_practice?.length ?? 0) > 0) return { mode: 'results' as const };
    return { mode: 'empty' as const };
  }, [journey]);

  useEffect(() => {
    if (loadState !== 'ready' || !rootRef.current) return;
    const reduce = isReducedMotion();
    const ctx = gsap.context(() => {
      if (reduce) {
        gsap.set('[data-anim]', { opacity: 1 });
        return;
      }
      gsap.from('[data-anim="header"]', { opacity: 0, y: 18, duration: 0.45 });
      gsap.from('[data-anim="summary"]', { opacity: 0, y: 14, duration: 0.45, stagger: 0.08, delay: 0.08 });
      gsap.from('[data-anim="spotlight"]', { opacity: 0, x: -24, duration: 0.5, delay: 0.22 });
      gsap.from('[data-anim="tab-content"] .journey-card', { opacity: 0, y: 10, duration: 0.4, stagger: 0.05 });
      gsap.to('[data-anim="spotlight-glow"]', { backgroundPositionX: '120%', duration: 3.5, repeat: -1, ease: 'none' });
    }, rootRef);
    return () => ctx.revert();
  }, [loadState, activeTab]);

  const renderTaskRows = (item: IeltsJourneyAssignmentItem) => orderedSkills.map((skill) => {
    const state = taskState(item, skill);
    return <div key={`${item.assignment_id}-${skill}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#cbd5e1', borderTop: '1px solid #1e293b', paddingTop: '0.35rem', marginTop: '0.35rem' }}><span>{skillLabels[skill]}</span><span>{state}</span></div>;
  });

  return <div ref={rootRef} style={{ minHeight: '100vh', background: '#020617', color: '#e2e8f0', padding: '1rem' }}>
    <div style={{ maxWidth: '74rem', margin: '0 auto', display: 'grid', gap: '1rem' }}>
      <button type="button" onClick={() => navigate('/ielts')} style={{ color: '#93c5fd', background: 'none', border: 'none', fontWeight: 700, textAlign: 'left' }}>← Back to IELTS Home</button>
      <header data-anim="header" style={{ border: '1px solid #334155', borderRadius: '1rem', padding: '1.2rem', background: 'linear-gradient(130deg, rgba(15,23,42,0.96), rgba(30,41,59,0.9))' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem' }}>My IELTS Journey</h1>
        <p style={{ margin: '0.45rem 0 0', color: '#93c5fd' }}>Track your assignments, results, and reviewed feedback.</p>
      </header>

      {loadState === 'loading' ? <div>Loading your IELTS journey…</div> : null}
      {loadState === 'error' ? <div>{error}</div> : null}

      {loadState === 'ready' && journey ? <>
        <section style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          {[['Current assignments', summary.current], ['Completed assignments', summary.completed], ['Results available', summary.resultsAvailable], ['Feedback ready', summary.feedbackReady]].map(([label, value]) => <div data-anim="summary" key={String(label)} style={{ border: '1px solid #334155', borderRadius: '0.8rem', padding: '0.9rem', background: 'rgba(15,23,42,0.75)' }}><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{label}</div><div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{value}</div></div>)}
        </section>

        <section data-anim="spotlight" style={{ border: '1px solid #1d4ed8', borderRadius: '0.95rem', padding: '1rem', background: 'rgba(30,41,59,0.8)', position: 'relative', overflow: 'hidden' }}>
          <div data-anim="spotlight-glow" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(110deg, transparent 0%, rgba(59,130,246,0.15) 48%, transparent 100%)', backgroundSize: '180% 100%', pointerEvents: 'none' }} />
          <h2 style={{ margin: 0, position: 'relative' }}>Continue where you left off</h2>
          {nextAction.mode === 'current' ? <div style={{ position: 'relative' }}><p>{nextAction.current.title}</p><p>{nextAction.done} / 4 tasks completed · Next: {nextAction.nextTask}</p><button type="button" onClick={() => navigate('/ielts/assigned')} style={{ border: '1px solid #3b82f6', background: '#1d4ed8', color: '#eff6ff', borderRadius: '0.6rem', padding: '0.5rem 0.8rem' }}>Continue assignment</button></div> : null}
          {nextAction.mode === 'results' ? <div style={{ position: 'relative' }}><p>You have completed work waiting in your timeline.</p><button type="button" onClick={() => setActiveTab('results')} style={{ border: '1px solid #3b82f6', background: '#1d4ed8', color: '#eff6ff', borderRadius: '0.6rem', padding: '0.5rem 0.8rem' }}>View latest results</button></div> : null}
          {nextAction.mode === 'empty' ? <p style={{ position: 'relative' }}>No current IELTS assignments.</p> : null}
        </section>

        <section>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(['current', 'completed', 'results'] as DashboardTab[]).map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} style={{ border: '1px solid #334155', background: activeTab === tab ? '#1d4ed8' : '#0f172a', color: '#e2e8f0', borderRadius: '999px', padding: '0.45rem 0.8rem' }}>{tab === 'results' ? 'Results & Feedback' : tab[0].toUpperCase() + tab.slice(1)}</button>)}
          </div>

          <div data-anim="tab-content" style={{ marginTop: '0.8rem', display: 'grid', gap: '0.8rem' }}>
            {activeTab === 'current' && (journey.assigned_practice.length === 0 ? <div className="journey-card">No current IELTS assignments.</div> : journey.assigned_practice.map((item) => <article className="journey-card" key={item.assignment_id} style={{ border: '1px solid #334155', borderRadius: '0.8rem', padding: '0.9rem', background: '#0f172a' }}><h3 style={{ margin: 0 }}>{item.title}</h3><p>Status: {item.status || 'Not started'}</p><p>Due date: {formatDate(item.due_at)}</p><p>{orderedSkills.filter((s) => ['Completed', 'Result available', 'Feedback ready'].includes(taskState(item, s))).length} / 4 tasks completed</p>{renderTaskRows(item)}<button type="button" onClick={() => navigate('/ielts/assigned')} style={{ marginTop: '0.6rem' }}>{item.started_at ? 'Continue assignment' : 'Start assignment'}</button></article>))}

            {activeTab === 'completed' && (journey.completed_practice.length === 0 ? <div className="journey-card">No completed IELTS assignments yet.</div> : journey.completed_practice.map((item) => <article key={item.assignment_id} className="journey-card" style={{ border: '1px solid #334155', borderRadius: '0.8rem', padding: '0.9rem', background: '#0f172a' }}><h3 style={{ margin: 0 }}>{item.title}</h3><p>Completed: {formatDate(item.completed_at)}</p>{orderedSkills.map((skill) => <div key={skill}>{skillLabels[skill]}: {taskState(item, skill)} {(skill === 'reading' || skill === 'listening') && item.objective_result_link ? <button type="button" onClick={() => navigate(item.objective_result_link as string)}>View result</button> : null}{(skill === 'writing' || skill === 'speaking') && item.review_result_link && item.has_finalized_review ? <button type="button" onClick={() => navigate(item.review_result_link as string)}>View feedback</button> : null}{(skill === 'writing' || skill === 'speaking') && !item.has_finalized_review ? <span>Review pending</span> : null}</div>)}</article>))}

            {activeTab === 'results' && <div className="journey-card" style={{ display: 'grid', gap: '0.8rem' }}>
              <section style={{ border: '1px solid #334155', borderRadius: '0.8rem', padding: '0.8rem' }}><h3 style={{ marginTop: 0 }}>Objective Results</h3>{journey.completed_practice.some((item) => item.objective_result_link) ? journey.completed_practice.map((item) => (item.objective_result_link ? <div key={`result-${item.assignment_id}`}><p>{item.title}</p><button type="button" onClick={() => navigate(item.objective_result_link as string)}>View result</button></div> : null)) : <p>No results available yet.</p>}</section>
              <section style={{ border: '1px solid #334155', borderRadius: '0.8rem', padding: '0.8rem' }}><h3 style={{ marginTop: 0 }}>Reviewed Feedback</h3>{journey.completed_practice.some((item) => item.review_result_link && item.has_finalized_review) ? journey.completed_practice.map((item) => (item.review_result_link && item.has_finalized_review ? <div key={`feedback-${item.assignment_id}`}><p>{item.title}</p><button type="button" onClick={() => navigate(item.review_result_link as string)}>View feedback</button></div> : null)) : <p>No reviewed feedback yet.</p>}{journey.completed_practice.some((item) => !item.has_finalized_review && (item.skills ?? []).some((skill) => skill === 'writing' || skill === 'speaking')) ? <p>Review pending — your teacher or school admin has not finalized feedback yet.</p> : null}</section>
            </div>}
          </div>
        </section>
      </> : null}
    </div>
  </div>;
};

export default IeltsJourneyDashboard;
