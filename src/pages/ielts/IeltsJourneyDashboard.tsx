import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useNavigate } from 'react-router-dom';
import { rpcIeltsStudentJourney, type IeltsJourneyAssignmentItem, type IeltsStudentJourney } from '../../../services/ieltsJourneyService';
import { getUserTier, isIeltsPrime, updateIeltsTargetBand } from '../../../services/ieltsService';
import IeltsMissionCard from './components/IeltsMissionCard';
import IeltsNextActionCard from './components/IeltsNextActionCard';

type SkillKey = 'reading' | 'listening' | 'writing' | 'speaking';
const orderedSkills: SkillKey[] = ['reading', 'listening', 'writing', 'speaking'];
const skillIcons: Record<SkillKey, string> = { reading: '📖', listening: '🎧', writing: '✍️', speaking: '🎤' };

const formatDate = (value?: string | null, empty = 'No due date') => {
  if (!value) return empty;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return empty;
  return parsed.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const humanizeStatus = (status?: string | null): string => {
  const v = (status ?? '').trim().toLowerCase();
  if (!v) return 'Not started';
  if (v === 'in_progress') return 'In progress';
  return v.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
};

const taskState = (item: IeltsJourneyAssignmentItem, skill: SkillKey): string => {
  if (skill === 'reading' || skill === 'listening') {
    return item.objective_result_link ? 'Result available' : item.completed_at ? 'Submitted' : item.started_at ? 'In progress' : 'Not started';
  }
  if (item.has_finalized_review) return 'Feedback ready';
  if (item.completed_at || item.feedback_status === 'awaiting_feedback') return 'Review pending';
  return item.started_at ? 'In progress' : 'Not started';
};

const statusDot = (status: string): string => {
  const s = status.toLowerCase();
  if (s === 'completed') return '#059669';
  if (s === 'in_progress') return '#0891b2';
  if (s === 'overdue') return '#dc2626';
  return '#cbd5e1';
};

interface AssignmentCardProps {
  item: IeltsJourneyAssignmentItem;
  isCompleted: boolean;
  onNavigate: (path: string) => void;
}

const AssignmentCard: React.FC<AssignmentCardProps> = ({ item, onNavigate }) => {
  const skills = orderedSkills.filter((skill) => (item.skills ?? []).includes(skill));
  const dot = statusDot(item.status ?? '');
  return (
    <div style={{ background: '#ffffff', border: `1px solid ${dot}44`, borderLeft: `3px solid ${dot}`, borderRadius: '0.85rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Due: <strong style={{ color: '#475569' }}>{formatDate(item.due_at)}</strong></span>
        </div>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0.25rem 0.6rem', borderRadius: '9999px', background: '#f1f5f9', color: dot, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {humanizeStatus(item.status)}
        </span>
      </div>
      {skills.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {skills.map((skill) => {
            const state = taskState(item, skill);
            const canResult = (skill === 'reading' || skill === 'listening') && !!item.objective_result_link;
            const canFeedback = (skill === 'writing' || skill === 'speaking') && !!item.review_result_link && !!item.has_finalized_review;
            return (
              <div key={skill} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', padding: '0.3rem 0', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {skillIcons[skill]} {skill.charAt(0).toUpperCase() + skill.slice(1)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ color: state === 'Review pending' ? '#ea580c' : state.includes('available') || state.includes('ready') ? '#0891b2' : '#94a3b8', fontWeight: 700 }}>
                    {state}
                  </span>
                  {canResult && (
                    <button type="button" onClick={() => onNavigate(item.objective_result_link as string)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '0.4rem', padding: '0.2rem 0.55rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
                      View result →
                    </button>
                  )}
                  {canFeedback && (
                    <button type="button" onClick={() => onNavigate(item.review_result_link as string)} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#6d28d9', borderRadius: '0.4rem', padding: '0.2rem 0.55rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
                      View feedback →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

type LoadState = 'loading' | 'ready' | 'error';

const IeltsJourneyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [journey, setJourney] = useState<IeltsStudentJourney | null>(null);
  const [userTier, setUserTier] = useState('free');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isEditingTargetBand, setIsEditingTargetBand] = useState(false);
  const [targetBandDraft, setTargetBandDraft] = useState('');
  const [targetBandError, setTargetBandError] = useState<string | null>(null);
  const [isSavingTargetBand, setIsSavingTargetBand] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoadState('loading');
      try {
        const [journeyData, tier] = await Promise.all([rpcIeltsStudentJourney(), getUserTier()]);
        setJourney(journeyData);
        setUserTier(tier || 'free');
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

  const actionable = useMemo(() => (journey?.assigned_practice ?? []).find(
    (item) => {
      const status = (item.status ?? '').toLowerCase();
      return status !== 'completed' && ((item.skills ?? []).length > 0 || !!item.started_at || !!item.assigned_at);
    }
  ) ?? null, [journey]);
  const isPrimeUser = isIeltsPrime({ tier: userTier });

  const openTargetBandEditor = () => {
    setTargetBandDraft(journey?.target_band?.toFixed(1) ?? '');
    setTargetBandError(null);
    setIsEditingTargetBand(true);
  };

  const saveTargetBand = async () => {
    if (!journey || !isPrimeUser) return;
    const value = targetBandDraft.trim();
    const parsed = Number(value);
    if (!value || Number.isNaN(parsed)) {
      setTargetBandError('Enter a valid band between 0.0 and 9.0.');
      return;
    }
    if (parsed < 0 || parsed > 9) {
      setTargetBandError('Target band must be between 0.0 and 9.0.');
      return;
    }

    const normalized = Math.round(parsed * 2) / 2;
    setIsSavingTargetBand(true);
    setTargetBandError(null);
    try {
      await updateIeltsTargetBand(normalized);
      setJourney({ ...journey, target_band: normalized });
      setIsEditingTargetBand(false);
    } catch (e) {
      setTargetBandError(e instanceof Error ? e.message : 'Unable to save target band.');
    } finally {
      setIsSavingTargetBand(false);
    }
  };

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

        {loadState === 'ready' && journey && (
          <>
            {/* Readiness overview — Overall band estimate and skill breakdown. Not enough data yet shown when estimates are null. */}
            <section data-anim="card" aria-labelledby="readiness-heading">
              <p id="readiness-heading" style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 800, color: '#0891b2', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                Readiness overview
              </p>
              <IeltsMissionCard journey={journey} animate={true} targetBandCtaHref={isPrimeUser ? '/ielts/apply' : '/ielts/apply-prime'} />
              {isPrimeUser && (
                <div style={{ marginTop: '0.55rem', display: 'flex', justifyContent: 'flex-end' }}>
                  {!isEditingTargetBand ? (
                    <button
                      type="button"
                      onClick={openTargetBandEditor}
                      style={{ border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0369a1', fontWeight: 800, borderRadius: '0.55rem', padding: '0.35rem 0.7rem', fontSize: '0.76rem', cursor: 'pointer' }}
                    >
                      {journey.target_band ? 'Edit target band' : 'Set target band'}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          max={9}
                          step={0.5}
                          value={targetBandDraft}
                          onChange={(e) => setTargetBandDraft(e.target.value)}
                          placeholder="e.g. 7.5"
                          style={{ width: '6.5rem', border: '1px solid #cbd5e1', borderRadius: '0.5rem', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                        />
                        <button type="button" disabled={isSavingTargetBand} onClick={saveTargetBand} style={{ border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 800, borderRadius: '0.5rem', padding: '0.35rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                          {isSavingTargetBand ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" disabled={isSavingTargetBand} onClick={() => setIsEditingTargetBand(false)} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 700, borderRadius: '0.5rem', padding: '0.35rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.68rem', color: targetBandError ? '#dc2626' : '#64748b' }}>
                        {targetBandError ?? 'Band accepts 0.0 to 9.0 (0.5 steps).'}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {!journey.current_estimates?.overall && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                  Not enough data yet — complete more practice to unlock your Overall band estimate.
                </p>
              )}
            </section>

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

            {/* Current assignments — No current IELTS assignments. shown when list is empty */}
            <section data-anim="section" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '1rem' }}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Current assignments</h2>
              {journey.assigned_practice.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                  No active IELTS assignments right now.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  <button
                    type="button"
                    onClick={() => navigate('/ielts/practice/assigned')}
                    style={{ padding: '0.7rem 1rem', background: 'linear-gradient(90deg, #0891b2, #7c3aed)', border: 'none', borderRadius: '0.7rem', color: '#fff', fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer', letterSpacing: '0.02em', boxShadow: '0 2px 8px rgba(8,145,178,0.28)' }}
                  >
                    Open assigned practice →
                  </button>
                  {journey.assigned_practice.map((item) => (
                    <AssignmentCard key={item.assignment_id} item={item} isCompleted={false} onNavigate={navigate} />
                  ))}
                </div>
              )}
            </section>

            {/* Completed assignments */}
            <section data-anim="section" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '1rem' }}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Completed assignments</h2>
              {journey.completed_practice.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>No completed IELTS assignments yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {journey.completed_practice.map((item) => (
                    <AssignmentCard key={item.assignment_id} item={item} isCompleted={true} onNavigate={navigate} />
                  ))}
                </div>
              )}
            </section>

            {/* Results & Feedback */}
            <section data-anim="section" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '1rem' }}>
              <h2 style={{ margin: '0 0 0.4rem', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>Results & Feedback</h2>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#64748b' }}>View your latest results and feedback.</p>
              {summary.results === 0 && (
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 0.35rem' }}>No results available yet.</p>
              )}
              {summary.feedback === 0 && (
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>No reviewed feedback yet.</p>
              )}
              {(summary.results > 0 || summary.feedback > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
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
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default IeltsJourneyDashboard;
