import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useNavigate } from 'react-router-dom';
import { rpcIeltsStudentJourney, type IeltsJourneyAssignmentItem, type IeltsStudentJourney } from '../../../services/ieltsJourneyService';
import IeltsMissionCard from './components/IeltsMissionCard';
import IeltsAssignmentTimeline from './components/IeltsAssignmentTimeline';
import IeltsNextActionCard from './components/IeltsNextActionCard';

type LoadState = 'loading' | 'ready' | 'error';
type DashboardTab = 'current' | 'completed';

const isActionable = (item: IeltsJourneyAssignmentItem) => {
  const status = (item.status ?? '').toLowerCase();
  return status !== 'completed' && ((item.skills ?? []).length > 0 || !!item.started_at || !!item.assigned_at);
};

const IeltsJourneyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [journey, setJourney] = useState<IeltsStudentJourney | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('current');

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

  const statCards = [
    { label: 'Active', value: summary.current, color: '#0891b2', icon: '📌' },
    { label: 'Completed', value: summary.completed, color: '#059669', icon: '✅' },
    { label: 'Results', value: summary.results, color: '#7c3aed', icon: '📊' },
    { label: 'Feedback', value: summary.feedback, color: '#b45309', icon: '💬' },
  ];

  return (
    <div ref={rootRef} style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '1.25rem 1rem 4rem', display: 'grid', gap: '1rem' }}>

        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate('/ielts')}
          style={{ background: 'none', border: 'none', color: '#0891b2', fontWeight: 700, textAlign: 'left', cursor: 'pointer', padding: '0.25rem 0', fontSize: '0.875rem' }}
        >
          ← Back to IELTS Home
        </button>

        {/* Page header */}
        <header data-anim="header" style={{ padding: '0.25rem 0' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>My IELTS Journey</h1>
          <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>Track assignments, results, and reviewed feedback.</p>
        </header>

        {/* Loading */}
        {loadState === 'loading' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.8rem', padding: '1.25rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
            Loading your IELTS journey…
          </div>
        )}

        {/* Error */}
        {loadState === 'error' && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.8rem', padding: '1rem', color: '#b91c1c', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Ready */}
        {loadState === 'ready' && journey && (
          <>
            {/* Mission hero card */}
            <div data-anim="card">
              <IeltsMissionCard journey={journey} animate={true} />
            </div>

            {/* Stat strip */}
            <div data-anim="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.55rem' }}>
              {statCards.map(({ label, value, color, icon }) => (
                <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>{icon}</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginTop: '0.2rem' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Next action */}
            <div data-anim="card">
              <IeltsNextActionCard
                weakSkill={journey.weak_skill}
                nextRecommendation={journey.next_recommendation ?? (actionable ? `Open "${actionable.title}" to continue.` : 'Keep up your practice to build your band estimates.')}
                hasActionable={!!actionable}
                onOpen={() => navigate('/ielts/practice/assigned')}
                animate={false}
              />
            </div>

            {/* Assignment timeline */}
            <div data-anim="section">
              <IeltsAssignmentTimeline
                assigned={journey.assigned_practice}
                completed={journey.completed_practice}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onOpenAssigned={() => navigate('/ielts/practice/assigned')}
                navigate={navigate}
                animate={false}
              />
            </div>

            {/* Results & feedback shortcuts */}
            {(summary.results > 0 || summary.feedback > 0) && (
              <section data-anim="section" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '1rem' }}>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Quick links</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {journey.completed_practice
                    .filter((item) => item.objective_result_link || (item.review_result_link && item.has_finalized_review))
                    .map((item) => (
                        <div key={item.assignment_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0.55rem 0', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>{item.title}</span>
                        <div style={{ display: 'flex', gap: '0.45rem' }}>
                          {item.objective_result_link && (
                            <button type="button" onClick={() => navigate(item.objective_result_link as string)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '0.3rem 0.65rem', borderRadius: '0.45rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                              View result →
                            </button>
                          )}
                          {item.review_result_link && item.has_finalized_review && (
                            <button type="button" onClick={() => navigate(item.review_result_link as string)} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#6d28d9', padding: '0.3rem 0.65rem', borderRadius: '0.45rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                              View feedback →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default IeltsJourneyDashboard;
