import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useNavigate } from 'react-router-dom';
import { rpcIeltsStudentJourney, type IeltsStudentJourney } from '../../../services/ieltsJourneyService';
import { supabase } from '../../../services/supabaseClient';
import { rpcIeltsSchoolResults, type IeltsSchoolResultsResponse, type IeltsSchoolResultsStudentRow } from '../../../services/ieltsResultsService';
import { rpcIeltsSchoolStudentSnapshot, type IeltsSchoolStudentSnapshot } from '../../../services/ieltsSchoolStudentSnapshotService';
import { getUserTier, isIeltsPrime, updateIeltsTargetBand } from '../../../services/ieltsService';
import { resolveMySchoolCapabilities } from '../../../services/schoolAdminService';
import IeltsStudentJourney from './components/IeltsStudentJourney';
import { fetchIeltsStartingPoint, type IeltsStartingPoint } from '../../../services/ieltsStartingPointService';
import IeltsSchoolStudentProgressModal from './components/IeltsSchoolStudentProgressModal';
import { friendlyIeltsAdminError } from '../../lib/schoolAdminPresentation';
import { resolveIeltsDashboardMode, type IeltsDashboardMode } from './ieltsDashboardMode';

const formatDate = (value?: string | null, empty = 'No activity yet') => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : empty;

type LoadState = 'loading' | 'ready' | 'error';
type SnapshotModalState = 'idle' | 'loading' | 'ready' | 'error';

interface IeltsJourneyDashboardProps {
  embedded?: boolean;
}

const IeltsJourneyDashboard: React.FC<IeltsJourneyDashboardProps> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [startingPoint, setStartingPoint] = useState<IeltsStartingPoint | null>(null);
  const [retry, setRetry] = useState(0);
  const [journey, setJourney] = useState<IeltsStudentJourney | null>(null);
  const [userTier, setUserTier] = useState('free');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isEditingTargetBand, setIsEditingTargetBand] = useState(false);
  const [targetBandDraft, setTargetBandDraft] = useState('');
  const [targetBandError, setTargetBandError] = useState<string | null>(null);
  const [isSavingTargetBand, setIsSavingTargetBand] = useState(false);
  const [mode, setMode] = useState<IeltsDashboardMode>('student');
  const [schoolResults, setSchoolResults] = useState<IeltsSchoolResultsResponse | null>(null);
  const [snapshotStudentId, setSnapshotStudentId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<IeltsSchoolStudentSnapshot | null>(null);
  const [snapshotState, setSnapshotState] = useState<SnapshotModalState>('idle');
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoadState('loading');
      setError(null);
      setStartingPoint(null);
      try {
        const [{ data: auth }, tierResult] = await Promise.all([
          supabase.auth.getUser(),
          getUserTier().catch(() => null),
        ]);
        if (!active) return;
        setUserTier(tierResult || 'free');
        const userId = auth?.user?.id;
        let dashboardMode: IeltsDashboardMode = 'student';
        if (userId) {
          const [{ data: profile, error: profileError }, capabilityResolution] = await Promise.all([
            supabase
              .from('users')
              .select('role, is_admin')
              .eq('id', userId)
              .maybeSingle(),
            resolveMySchoolCapabilities(),
          ]);
          if (!active) return;
          const typedProfile = profile as { role?: string | null; is_admin?: boolean | null } | null;
          const modeResolution = resolveIeltsDashboardMode({
            profile: typedProfile,
            profileError,
            capabilityResolution,
          });
          if (modeResolution === 'error') {
            throw new Error('School access could not be verified.');
          }
          dashboardMode = modeResolution;
        }

        if (dashboardMode === 'admin') {
          const results = await rpcIeltsSchoolResults({ limit: 100 });
          if (!active) return;
          setSchoolResults(results);
          setMode('admin');
          setJourney(null);
        } else {
          const [journeyData, startingPointData] = await Promise.all([rpcIeltsStudentJourney(), fetchIeltsStartingPoint()]);
          if (!active) return;
          setJourney(journeyData);
          setStartingPoint(startingPointData);
          setMode('student');
          setSchoolResults(null);
        }
        setLoadState('ready');
      } catch (e) {
        if (!active) return;
        setError(friendlyIeltsAdminError(e, 'Unable to load the IELTS journey. Please try again.'));
        setLoadState('error');
      }
    };
    void run();
    return () => { active = false; };
  }, [retry]);

  const openStudentSnapshot = async (student: IeltsSchoolResultsStudentRow) => {
    setSnapshotStudentId(student.student_id);
    setSnapshot(null);
    setSnapshotError(null);
    setSnapshotState('loading');
    try {
      const data = await rpcIeltsSchoolStudentSnapshot(student.student_id);
      setSnapshot(data);
      setSnapshotState('ready');
    } catch (e) {
      setSnapshotError(friendlyIeltsAdminError(e, 'Unable to load this student snapshot. Please try again.'));
      setSnapshotState('error');
    }
  };

  const closeStudentSnapshot = () => {
    setSnapshotStudentId(null);
    setSnapshot(null);
    setSnapshotError(null);
    setSnapshotState('idle');
  };

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
      setTargetBandError(friendlyIeltsAdminError(e, 'Unable to save the target band. Please try again.'));
    } finally {
      setIsSavingTargetBand(false);
    }
  };

  useEffect(() => {
    if (loadState !== 'ready' || mode !== 'admin' || !rootRef.current) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      if (reduced) return;
      gsap.from('[data-anim="header"]', { opacity: 0, y: 10, duration: 0.35 });
      gsap.from('[data-anim="card"]', { opacity: 0, y: 10, stagger: 0.06, duration: 0.35, delay: 0.06 });
      gsap.from('[data-anim="section"]', { opacity: 0, y: 12, stagger: 0.08, duration: 0.4, delay: 0.12 });
    }, rootRef);
    return () => ctx.revert();
  }, [loadState, mode]);

  return (
    <div ref={rootRef} style={{ minHeight: embedded ? 'auto' : '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: embedded ? '100%' : '1120px', margin: '0 auto', padding: embedded ? '1rem' : '1.25rem 1rem 4rem', display: 'grid', gap: '1rem' }}>

        {/* Back button */}
        {!embedded && (
          <button
            type="button"
            onClick={() => navigate('/ielts')}
            style={{ background: 'none', border: 'none', color: '#0891b2', fontWeight: 700, textAlign: 'left', cursor: 'pointer', padding: '0.25rem 0', fontSize: '0.875rem' }}
          >
            ← Back to IELTS Home
          </button>
        )}

        {/* Page header */}
        <header data-anim="header" hidden={loadState === 'ready' && mode === 'student'} style={{ padding: '0.25rem 0' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>{embedded ? 'Student IELTS Progress' : 'My IELTS Journey'}</h1>
          <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>{embedded ? 'Review assignments, results, readiness, and feedback for this school.' : 'Track assignments, results, and reviewed feedback.'}</p>
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
            <p role="alert">{error}</p><button type="button" className="ij-link" onClick={() => setRetry(value => value + 1)}>Try again</button>
          </div>
        )}

        {loadState === 'ready' && mode === 'admin' && schoolResults && (
          <>
            <section data-anim="card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.9rem', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>School IELTS Results</h2>
                  <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>Select a student name to open their authorised IELTS progress record.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ background: '#ecfeff', color: '#0e7490', border: '1px solid #a5f3fc', borderRadius: '9999px', padding: '0.35rem 0.7rem', fontSize: '0.72rem', fontWeight: 900 }}>{schoolResults.summary.total_students} students</span>
                  <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '9999px', padding: '0.35rem 0.7rem', fontSize: '0.72rem', fontWeight: 900 }}>{schoolResults.summary.completed_practice_count} completed practices</span>
                </div>
              </div>
            </section>

            <section data-anim="section" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.9rem', overflow: 'hidden' }}>
              {schoolResults.students.length === 0 ? (
                <p style={{ margin: 0, padding: '1rem', color: '#94a3b8', fontSize: '0.875rem' }}>No IELTS students found for your school yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                    <thead style={{ background: '#f8fafc' }}>
                      <tr>
                        {['Student', 'Class', 'Assignments', 'Overall', 'Last activity'].map((heading) => <th key={heading} style={{ textAlign: 'left', padding: '0.75rem', color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{heading}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {schoolResults.students.map((student) => (
                        <tr key={student.student_id} data-testid="ielts-school-student-row" style={{ borderTop: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>
                            <button
                              type="button"
                              data-testid="ielts-open-student-progress"
                              onClick={() => void openStudentSnapshot(student)}
                              style={{ background: 'transparent', border: 'none', color: '#0e7490', fontWeight: 900, cursor: 'pointer', padding: 0, textAlign: 'left', fontSize: '0.86rem' }}
                            >
                              {student.username ?? student.email ?? 'Student'}
                            </button>
                          </td>
                          <td style={{ padding: '0.75rem', color: '#64748b', fontSize: '0.82rem' }}>{student.class_name ?? 'No class'}</td>
                          <td style={{ padding: '0.75rem', color: '#334155', fontSize: '0.82rem', fontWeight: 800 }}>{student.completed_practice_total} / {student.assigned_practice_total} completed</td>
                          <td style={{ padding: '0.75rem', color: '#334155', fontSize: '0.82rem', fontWeight: 800 }}>{student.latest_overall_estimate == null ? 'Verified readiness pending' : `${student.latest_overall_estimate.toFixed(1)} / 9.0`}</td>
                          <td style={{ padding: '0.75rem', color: '#64748b', fontSize: '0.82rem' }}>{formatDate(student.last_activity_at, 'No activity yet')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {loadState === 'ready' && journey && startingPoint && mode === 'student' && (
          <IeltsStudentJourney journey={journey} startingPoint={startingPoint} onSetTargetBand={isPrimeUser ? openTargetBandEditor : undefined} />
        )}
              {isEditingTargetBand && isPrimeUser && (
                <div
                  role="presentation"
                  onClick={() => !isSavingTargetBand && setIsEditingTargetBand(false)}
                  style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.48)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60 }}
                >
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Set target IELTS band"
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '100%', maxWidth: '360px', borderRadius: '0.9rem', border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 18px 44px rgba(15, 23, 42, 0.22)', padding: '1rem' }}
                  >
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#0f172a' }}>Set target band</h3>
                    <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.75rem', color: '#64748b' }}>Choose your IELTS goal between 0.0 and 9.0 in 0.5 steps.</p>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        max={9}
                        step={0.5}
                        value={targetBandDraft}
                        onChange={(e) => setTargetBandDraft(e.target.value)}
                        placeholder="e.g. 7.5"
                        style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '0.5rem', padding: '0.45rem 0.55rem', fontSize: '0.82rem' }}
                      />
                    </div>
                    <p style={{ margin: '0.55rem 0 0', fontSize: '0.68rem', color: targetBandError ? '#dc2626' : '#64748b' }}>
                      {targetBandError ?? 'Band accepts 0.0 to 9.0 (0.5 steps).'}
                    </p>
                    <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                      <button type="button" disabled={isSavingTargetBand} onClick={() => setIsEditingTargetBand(false)} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 700, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button type="button" disabled={isSavingTargetBand} onClick={saveTargetBand} style={{ border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 800, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                        {isSavingTargetBand ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
      </div>
      <IeltsSchoolStudentProgressModal
        isOpen={!!snapshotStudentId}
        state={snapshotState}
        snapshot={snapshot}
        error={snapshotError}
        onClose={closeStudentSnapshot}
      />
    </div>
  );
};

export default IeltsJourneyDashboard;
