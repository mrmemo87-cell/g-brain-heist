import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useNavigate } from 'react-router-dom';
import {
  fetchActiveListeningSets,
  fetchActiveReadingSets,
  fetchActiveSpeakingTasks,
  fetchActiveWritingTasks,
  fetchPublicIeltsTaskPreviews,
  fetchUserCompletedTasks,
  getUserTier,
  isIeltsPrime,
  UserCompletedTasks,
} from '../../../services/ieltsService';
import type { IELTSListeningSet, IELTSReadingSet, IELTSSpeakingTask, IELTSWritingTask } from '../../../types';
import { stopBackgroundMusic, resumeBackgroundMusic } from '../../../services/audioService';
import { supabase } from '../../../services/supabaseClient';
import { resolveIeltsExtraPracticeAccess } from '../../../services/ieltsExtraPracticeAccessService';
import { canAccessIeltsReviewQueue, normalizeIeltsRole } from '../../../services/ieltsReviewAccess';
import { trackIeltsFunnelEvent } from '../../../services/ieltsFunnelAnalytics';

const IeltsHome: React.FC = () => {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const primeRedirectUrl = '/ielts/apply-prime';
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [readingSets, setReadingSets] = useState<IELTSReadingSet[]>([]);
  const [listeningSets, setListeningSets] = useState<IELTSListeningSet[]>([]);
  const [writingTasks, setWritingTasks] = useState<IELTSWritingTask[]>([]);
  const [speakingTasks, setSpeakingTasks] = useState<IELTSSpeakingTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<UserCompletedTasks>({ reading: [], listening: [], writing: [], speaking: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userTier, setUserTier] = useState('free');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<string>('student');
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [hasSchoolMembership, setHasSchoolMembership] = useState(false);
  const [profileContextLoaded, setProfileContextLoaded] = useState(false);
  const [extraPracticeEnabled, setExtraPracticeEnabled] = useState(true);
  const isPrimeUser = isIeltsPrime({ tier: userTier });
  const canAccessRequiredTier = (requiredTier?: string | null) => !requiredTier || requiredTier === 'free' || isPrimeUser;
  const normalizedRole = normalizeIeltsRole(userRole);
  const isIeltsAdminLandingRole = isPlatformAdmin || normalizedRole === 'school_admin' || normalizedRole === 'admin' || normalizedRole === 'superadmin';
  const canOpenReviewQueue = canAccessIeltsReviewQueue({ role: userRole, is_admin: isPlatformAdmin });

  // Stop background music when entering IELTS section
  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      if (musicEnabled) {
        resumeBackgroundMusic();
      }
    };
  }, []);

  const toggleMusic = () => {
    if (musicEnabled) {
      stopBackgroundMusic();
      setMusicEnabled(false);
    } else {
      resumeBackgroundMusic();
      setMusicEnabled(true);
    }
  };

  const redirectToPrime = () => {
    if (!isAuthenticated) {
      requireGoogleSignIn(primeRedirectUrl);
      return;
    }
    navigate(primeRedirectUrl);
  };

  const requireGoogleSignIn = (destination: string) => {
    window.sessionStorage.setItem('ielts_auth_intent', destination);
    navigate(destination === primeRedirectUrl ? '/ielts/apply-prime' : destination);
  };

  const openTask = (destination: string, isLocked: boolean) => {
    if (!isAuthenticated) {
      if (destination === '/ielts/trial-test-2') {
        trackIeltsFunnelEvent('ielts_auth_required_for_diagnostic', {
          skill: 'listening',
          task_id: 'trial-test-2',
          user_type: 'independent',
        });
      }
      requireGoogleSignIn(destination);
      return;
    }
    if (isLocked) {
      redirectToPrime();
      return;
    }
    navigate(destination);
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setIsAuthenticated(Boolean(data.session));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    getUserTier()
      .then((tier) => {
        if (isMounted) {
          setUserTier(tier);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUserTier('free');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const loadUserRole = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        setProfileContextLoaded(true);
        return;
      }
      const { data: profile } = await supabase
        .from('users')
        .select('role, is_admin, school_id')
        .eq('id', auth.user.id)
        .maybeSingle();
      const typedProfile = profile as { role?: string | null; is_admin?: boolean | null; school_id?: string | null } | null;
      if (typedProfile?.role) setUserRole(typedProfile.role);
      setIsPlatformAdmin(Boolean(typedProfile?.is_admin));
      setHasSchoolMembership(Boolean(typedProfile?.school_id));
      setProfileContextLoaded(true);
    };

    void loadUserRole();
  }, []);

  useEffect(() => {
    if (!profileContextLoaded || isIeltsAdminLandingRole) return;
    trackIeltsFunnelEvent('ielts_landing_view', {
      user_type: hasSchoolMembership ? 'school' : 'independent',
    });
  }, [profileContextLoaded, isIeltsAdminLandingRole, hasSchoolMembership]);

  useEffect(() => {
    const loadExtraPracticeSetting = async () => {
      if (!isAuthenticated) {
        setExtraPracticeEnabled(true);
        return;
      }
      const access = await resolveIeltsExtraPracticeAccess();
      setExtraPracticeEnabled(access.enabled);
    };
    void loadExtraPracticeSetting();
  }, [isAuthenticated]);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (!isAuthenticated) {
          const previews = await fetchPublicIeltsTaskPreviews();
          const excludedListeningTitles = new Set([
            'IELTS Listening Sample Task 1 (Form Completion)',
            'IELTS Listening Sample Task 2 (Form Completion)',
          ]);
          setReadingSets(previews.filter((item) => item.skill === 'reading').map((item) => ({
            id: item.id,
            slug: item.slug || `reading-${item.id}`,
            title: item.title,
            description: item.description,
            level: item.level || 'IELTS',
            est_band_min: item.est_band_min,
            est_band_max: item.est_band_max,
            duration_minutes: item.duration_minutes || 60,
            passage_text: null,
            required_tier: item.required_tier,
            created_by: null,
            created_at: item.sort_order || '',
            is_active: true,
          } as IELTSReadingSet)));
          setListeningSets(previews.filter((item) => item.skill === 'listening' && !excludedListeningTitles.has(item.title)).map((item) => ({
            id: item.id,
            slug: item.slug || `listening-${item.id}`,
            title: item.title,
            description: item.description,
            instructions: null,
            example_prompt: null,
            example_answer: null,
            section_label: null,
            question_range_label: null,
            level: item.level || 'IELTS',
            est_band_min: item.est_band_min,
            est_band_max: item.est_band_max,
            duration_minutes: item.duration_minutes || 30,
            audio_url: '',
            created_by: null,
            created_at: item.sort_order || '',
            is_active: true,
          } as IELTSListeningSet)));
          setWritingTasks(previews.filter((item) => item.skill === 'writing').map((item) => ({
            id: item.id,
            slug: item.slug || `writing-${item.id}`,
            task_type: item.level || 'task2',
            title: item.title,
            prompt: item.description || 'Sign in with Google to view the full writing prompt.',
            bands_target: item.est_band_max ? String(item.est_band_max) : '6.5+',
            sample_answer: null,
            created_by: null,
            created_at: item.sort_order || '',
            is_active: true,
          } as IELTSWritingTask)));
          setSpeakingTasks(previews.filter((item) => item.skill === 'speaking').map((item) => ({
            id: item.id,
            slug: item.slug || `speaking-${item.id}`,
            part: Number(item.level?.replace(/[^0-9]/g, '')) || 1,
            prompt: item.description || item.title,
            follow_ups: null,
            created_by: null,
            created_at: item.sort_order || '',
            is_active: true,
          } as IELTSSpeakingTask)));
          setCompletedTasks({ reading: [], listening: [], writing: [], speaking: [] });
          return;
        }

        const [reading, listening, writing, speaking, completed] = await Promise.all([
          fetchActiveReadingSets(),
          fetchActiveListeningSets(),
          fetchActiveWritingTasks(),
          fetchActiveSpeakingTasks(),
          fetchUserCompletedTasks(),
        ]);

        setReadingSets(reading.map((set, index) => ({ ...set, required_tier: set.required_tier || (index > 0 ? 'prime_prep_user' : 'free') })));
        const excludedListeningTitles = new Set([
          'IELTS Listening Sample Task 1 (Form Completion)',
          'IELTS Listening Sample Task 2 (Form Completion)',
        ]);
        const filteredListening = listening.filter((set) => !excludedListeningTitles.has(set.title));
        setListeningSets(filteredListening);
        setWritingTasks(writing);
        setSpeakingTasks(speaking);
        setCompletedTasks(completed);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load IELTS tasks.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    if (!isIeltsAdminLandingRole) {
      void loadTasks();
      return;
    }
    setIsLoading(false);
  }, [isAuthenticated, isIeltsAdminLandingRole]);

  if (isIeltsAdminLandingRole) {
    const adminCards = [
      { label: 'Practice Content', desc: 'Manage reading, listening, writing, and speaking tasks.', route: '/ielts/admin', icon: '📋', color: '#0891b2' },
      { label: 'Review Queue', desc: 'Finalize writing & speaking reviews awaiting scoring.', route: '/ielts/reviews', icon: '✍️', color: '#7c3aed' },
      { label: 'Student Progress', desc: 'View each student’s IELTS readiness, assignments, results, and pending reviews.', route: '/ielts/journey', icon: '📊', color: '#059669' },
      { label: 'Exam Manager', desc: 'Create and monitor secure IELTS exam sessions.', route: '/ielts/exams/manage', icon: '🔒', color: '#ea580c' },
      { label: 'Assigned Practice', desc: 'Monitor assignment coverage and completion health.', route: '/ielts/practice/assigned', icon: '📌', color: '#b45309' },
    ];

    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', padding: '1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '1.75rem' }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#0891b2' }}>
              IELTS OPERATIONS
            </p>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>
              Control Center
            </h1>
            <p style={{ margin: '0.5rem 0 0', color: '#64748b', fontSize: '0.875rem' }}>
              Admin tools for school IELTS operations. Student prep center is available on student accounts.
            </p>
          </div>

          {/* Admin cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
            {adminCards.map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={() => navigate(card.route)}
                style={{
                  textAlign: 'left',
                  background: '#ffffff',
                  border: `1px solid ${card.color}22`,
                  borderRadius: '0.9rem',
                  padding: '1.1rem',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  el.style.borderColor = `${card.color}55`;
                  el.style.boxShadow = `0 2px 12px ${card.color}22`;
                  el.style.background = `${card.color}08`;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  el.style.borderColor = `${card.color}22`;
                  el.style.boxShadow = 'none';
                  el.style.background = '#ffffff';
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>{card.icon}</span>
                <div style={{ marginTop: '0.55rem', fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>{card.label}</div>
                <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>{card.desc}</div>
              </button>
            ))}
          </div>

          {/* Admin Settings */}
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.9rem' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>School Settings</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.3rem' }}>Allow students to use Extra Practice</label>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>When off, students only see assigned IELTS practice and their journey.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                <button type="button" style={{ width: '3.5rem', height: '1.5rem', background: extraPracticeEnabled ? '#059669' : '#cbd5e1', border: 'none', borderRadius: '9999px', cursor: 'pointer', transition: 'background 0.2s' }} title={extraPracticeEnabled ? 'Disable extra practice' : 'Enable extra practice'} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: extraPracticeEnabled ? '#059669' : '#94a3b8', minWidth: '3rem' }}>{extraPracticeEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // GSAP entrance animation for student view
  useEffect(() => {
    if (!rootRef.current) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    gsap.fromTo('[data-home-card]', { opacity: 0, y: 14 }, { opacity: 1, y: 0, stagger: 0.07, duration: 0.38, ease: 'power2.out', delay: 0.1 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const DARK = '#f8fafc';
  const glass = (accent = '#f1f5f9') => ({
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '0.9rem',
  } as const);

  return (
    <div ref={rootRef} style={{ minHeight: '100vh', background: DARK, color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative' }}>

      {/* Music toggle */}
      <button
        onClick={toggleMusic}
        style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', width: '3rem', height: '3rem', borderRadius: '50%', background: musicEnabled ? 'rgba(8,145,178,0.15)' : '#f1f5f9', border: '1px solid #e2e8f0', color: '#334155', cursor: 'pointer', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, transition: 'all 0.2s', boxShadow: musicEnabled ? '0 0 16px rgba(8,145,178,0.2)' : 'none' }}
        title={musicEnabled ? 'Turn off music' : 'Turn on music'}
      >
        {musicEnabled ? '🔊' : '🔇'}
      </button>

      {/* Page container */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.25rem 1rem 5rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#0891b2' }}>
            IELTS DIAGNOSTIC
          </p>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.15 }}>
            Free IELTS Band Diagnostic
          </h1>
          <p style={{ margin: '0.4rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>
            Start with a free Listening diagnostic, get an instant estimated band and clear next steps, then decide whether IELTS Prime is worth it. No school required.
          </p>
        </div>

        {/* Hero CTA */}
        <div data-home-card style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)', border: '1px solid rgba(37,99,235,0.35)', borderRadius: '1rem', padding: '1.25rem', marginBottom: '1rem', color: '#ffffff', boxShadow: '0 18px 40px rgba(15,23,42,0.18)' }}>
          <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: '9999px', padding: '0.25rem 0.65rem', fontSize: '0.68rem', fontWeight: 800, marginBottom: '0.7rem' }}>Free diagnostic assessment</div>
          <h2 style={{ margin: '0 0 0.45rem', fontSize: 'clamp(1.35rem, 4vw, 2.2rem)', lineHeight: 1.1, fontWeight: 900 }}>Find your IELTS band starting point in minutes.</h2>
          <p style={{ margin: '0 0 1rem', color: '#bfdbfe', fontSize: '0.92rem', maxWidth: '44rem', lineHeight: 1.55 }}>Take a short Listening diagnostic first. You will see your objective score, estimated band, strengths, weaknesses, and a Band 7+ practice path before any upgrade decision.</p>
          <button type="button" onClick={() => { trackIeltsFunnelEvent('ielts_start_free_assessment_click', { skill: 'listening', task_id: 'trial-test-2', user_type: hasSchoolMembership ? 'school' : 'independent' }); openTask('/ielts/trial-test-2', false); }} style={{ background: '#22c55e', color: '#052e16', border: 'none', borderRadius: '0.7rem', padding: '0.8rem 1.1rem', fontWeight: 900, cursor: 'pointer', fontSize: '0.95rem' }}>Start Free Assessment →</button>
        </div>

        {/* Status badges */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(8,145,178,0.1)', border: '1px solid rgba(8,145,178,0.25)', color: '#0891b2', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700 }}>✓ Browse Free</span>
          <span style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: '#7c3aed', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700 }}>✓ Google Sign-in to Start</span>
          <span style={{ background: 'rgba(180,83,9,0.1)', border: '1px solid rgba(180,83,9,0.25)', color: '#b45309', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700 }}>✓ No School Required</span>
          <span style={{ background: 'rgba(245,158,11,0.13)', border: '1px solid rgba(245,158,11,0.3)', color: '#b45309', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: 700 }}>Temporary 50% launch discount</span>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '0.75rem', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Core nav cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>

          {/* My IELTS Journey */}
          <div data-home-card style={{ background: '#fff', border: '1px solid rgba(8,145,178,0.18)', padding: '1.1rem', boxShadow: '0 2px 8px rgba(8,145,178,0.06)', borderRadius: '0.9rem', opacity: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.55rem' }}>
              <span style={{ fontSize: '1.4rem' }}>🧭</span>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>My IELTS Journey</h2>
            </div>
            <p style={{ margin: '0 0 0.85rem', color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5 }}>
              See your diagnostic results, target band, practice history, and reviewed feedback.
            </p>
            <button type="button" onClick={() => navigate('/ielts/journey')} style={{ width: '100%', padding: '0.55rem', background: '#0891b2', border: 'none', borderRadius: '0.6rem', color: '#ffffff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>
              View my results →
            </button>
          </div>

          {/* Assigned Practice */}
          {hasSchoolMembership && (
            <div data-home-card style={{ background: '#fff', border: '1px solid rgba(124,58,237,0.18)', padding: '1.1rem', boxShadow: '0 2px 8px rgba(124,58,237,0.06)', borderRadius: '0.9rem', opacity: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.55rem' }}>
              <span style={{ fontSize: '1.4rem' }}>📌</span>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Assigned Practice</h2>
            </div>
            <p style={{ margin: '0 0 0.85rem', color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Open IELTS practice assigned by your school or teacher.
            </p>
            <button type="button" onClick={() => navigate('/ielts/practice/assigned')} style={{ width: '100%', padding: '0.55rem', background: '#7c3aed', border: 'none', borderRadius: '0.6rem', color: '#ffffff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>
              View assignments →
            </button>
            </div>
          )}

          {/* Review Queue (authorized reviewers only) */}
          {canOpenReviewQueue && (
            <div data-home-card style={{ background: '#fff', border: '1px solid rgba(5,150,105,0.18)', padding: '1.1rem', boxShadow: '0 2px 8px rgba(5,150,105,0.06)', borderRadius: '0.9rem', opacity: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.55rem' }}>
                <span style={{ fontSize: '1.4rem' }}>📝</span>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Review Queue</h2>
              </div>
              <p style={{ margin: '0 0 0.85rem', color: '#64748b', fontSize: '0.8rem', lineHeight: 1.5 }}>
                Finalize writing and speaking submissions with structured IELTS rubric feedback.
              </p>
              <button type="button" onClick={() => navigate('/ielts/reviews')} style={{ width: '100%', padding: '0.55rem', background: '#059669', border: 'none', borderRadius: '0.6rem', color: '#ffffff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>
                Open reviews →
              </button>
            </div>
          )}
        </div>

        {/* ── Extra Practice (conditional) ── */}
        {extraPracticeEnabled && (
          <>
            {/* Free Trial Test Banner */}
            <div
              data-home-card
              onClick={() => openTask('/ielts/trial-test', !isPrimeUser)}
              style={{ background: 'linear-gradient(135deg, #0c1a3a 0%, #0f172a 100%)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: '1rem', padding: '1.1rem 1.25rem', marginBottom: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 0 32px rgba(34,211,238,0.06)', opacity: 1, transition: 'border-color 0.2s, box-shadow 0.2s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(34,211,238,0.4)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(34,211,238,0.2)'; }}
            >
              <span style={{ fontSize: '2.25rem' }}>🎧</span>
              <div style={{ flex: 1 }}>
                {!isPrimeUser && <div style={{ display: 'inline-block', background: 'linear-gradient(135deg, #fde68a, #f59e0b)', color: '#111827', padding: '0.15rem 0.55rem', borderRadius: '9999px', fontSize: '0.6rem', fontWeight: 800, marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Prime Only</div>}
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#f0f9ff' }}>IELTS Listening Test 1</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>40 questions · 4 sections · Instant band score</p>
              </div>
              <div style={{ background: '#f59e0b', padding: '0.45rem 0.9rem', borderRadius: '0.5rem', fontWeight: 800, fontSize: '0.8rem', color: '#0f172a', whiteSpace: 'nowrap' }}>Start →</div>
            </div>

            {/* Reading */}
            <section data-home-card style={{ ...glass(), padding: '1.1rem', marginBottom: '1rem', opacity: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '1.35rem' }}>📖</span>
                <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0891b2' }}>Reading</h2>
              </div>
              {isLoading && readingSets.length === 0
                ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>Loading reading sets…</p>
                : readingSets.length === 0
                  ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>No reading sets published yet.</p>
                  : readingSets.map((set, index) => {
                    const isCompleted = completedTasks.reading.includes(set.id);
                    const isLocked = !canAccessRequiredTier(set.required_tier) || (!isPrimeUser && index > 0 && !set.required_tier);
                    return (
                      <button key={set.id} onClick={() => openTask(`/ielts/reading/${set.id}`, isLocked)}
                        style={{ width: '100%', background: isCompleted ? 'rgba(5,150,105,0.07)' : isLocked ? '#f8fafc' : 'rgba(8,145,178,0.04)', border: isCompleted ? '1px solid rgba(5,150,105,0.3)' : isLocked ? '1px dashed #cbd5e1' : '1px solid rgba(8,145,178,0.15)', borderRadius: '0.65rem', padding: '0.75rem', marginBottom: '0.5rem', textAlign: 'left', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, color: isLocked ? '#94a3b8' : '#0f172a', fontSize: '0.875rem', flex: 1 }}>{set.title}</span>
                          <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                            {isLocked && <span style={{ background: 'linear-gradient(135deg, #fde68a, #f59e0b)', color: '#111827', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 800, textTransform: 'uppercase' }}>Prime</span>}
                            {isCompleted && <span style={{ background: 'rgba(5,150,105,0.15)', color: '#059669', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 800 }}>✓ Done</span>}
                            <span style={{ background: 'rgba(8,145,178,0.1)', color: '#0891b2', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 700 }}>Band {set.est_band_min}-{set.est_band_max}</span>
                          </div>
                        </div>
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>Level: {set.level} · {set.duration_minutes || 20} min</p>
                      </button>
                    );
                  })
              }
            </section>

            {/* Listening */}
            <section data-home-card style={{ ...glass(), padding: '1.1rem', marginBottom: '1rem', opacity: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '1.35rem' }}>🎧</span>
                <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#7c3aed' }}>Listening</h2>
              </div>
              <button onClick={() => navigate('/ielts/trial-test-2')} style={{ width: '100%', background: '#f0fdf9', border: '1px solid rgba(5,150,105,0.25)', borderRadius: '0.65rem', padding: '0.75rem', marginBottom: '0.75rem', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.6rem' }}>📝</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'inline-block', background: 'rgba(5,150,105,0.12)', color: '#059669', padding: '0.1rem 0.45rem', borderRadius: '0.25rem', fontSize: '0.6rem', fontWeight: 800, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Free Task</div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>Free IELTS Listening Diagnostic</div>
                  <div style={{ fontSize: '0.72rem', color: '#059669' }}>10 questions · objective score · instant estimated band</div>
                </div>
                <div style={{ background: '#059669', padding: '0.35rem 0.7rem', borderRadius: '0.45rem', fontWeight: 800, fontSize: '0.78rem', color: '#fff', whiteSpace: 'nowrap' }}>Start →</div>
              </button>
              {isLoading && listeningSets.length === 0
                ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>Loading listening sets…</p>
                : listeningSets.length === 0
                  ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>No listening sets published yet.</p>
                  : listeningSets.map((set) => {
                    const isCompleted = completedTasks.listening.includes(set.id);
                    const isLocked = !isPrimeUser;
                    return (
                      <button key={set.id} onClick={() => openTask(`/ielts/listening/${set.id}`, isLocked)}
                        style={{ width: '100%', background: isCompleted ? 'rgba(5,150,105,0.07)' : isLocked ? '#f8fafc' : 'rgba(124,58,237,0.04)', border: isCompleted ? '1px solid rgba(5,150,105,0.3)' : isLocked ? '1px dashed #cbd5e1' : '1px solid rgba(124,58,237,0.15)', borderRadius: '0.65rem', padding: '0.75rem', marginBottom: '0.5rem', textAlign: 'left', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, color: isLocked ? '#94a3b8' : '#0f172a', fontSize: '0.875rem', flex: 1 }}>{set.title}</span>
                          <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                            {isLocked && <span style={{ background: 'linear-gradient(135deg, #fde68a, #f59e0b)', color: '#111827', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 800, textTransform: 'uppercase' }}>Prime</span>}
                            {isCompleted && <span style={{ background: 'rgba(5,150,105,0.15)', color: '#059669', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 800 }}>✓ Done</span>}
                            <span style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 700 }}>Band {set.est_band_min}-{set.est_band_max}</span>
                          </div>
                        </div>
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>Level: {set.level} · {set.duration_minutes} min</p>
                      </button>
                    );
                  })
              }
            </section>

            {/* Writing */}
            <section data-home-card style={{ ...glass(), padding: '1.1rem', marginBottom: '1rem', opacity: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '1.35rem' }}>✍️</span>
                <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#059669' }}>Writing</h2>
              </div>
              {isLoading && writingTasks.length === 0
                ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>Loading writing tasks…</p>
                : writingTasks.length === 0
                  ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>No writing tasks published yet.</p>
                  : writingTasks.map((task, index) => {
                    const isCompleted = completedTasks.writing.includes(task.id);
                    const isLocked = !canAccessRequiredTier(task.required_tier) || (!isPrimeUser && index > 0 && !task.required_tier);
                    return (
                      <button key={task.id} onClick={() => openTask(`/ielts/writing/${task.id}`, isLocked)}
                        style={{ width: '100%', background: isCompleted ? 'rgba(5,150,105,0.07)' : isLocked ? '#f8fafc' : 'rgba(5,150,105,0.04)', border: isCompleted ? '1px solid rgba(5,150,105,0.3)' : isLocked ? '1px dashed #cbd5e1' : '1px solid rgba(5,150,105,0.15)', borderRadius: '0.65rem', padding: '0.75rem', marginBottom: '0.5rem', textAlign: 'left', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, color: isLocked ? '#94a3b8' : '#0f172a', fontSize: '0.875rem', flex: 1 }}>{task.title}</span>
                          <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                            {isLocked && <span style={{ background: 'linear-gradient(135deg, #fde68a, #f59e0b)', color: '#111827', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 800, textTransform: 'uppercase' }}>Prime</span>}
                            {isCompleted && <span style={{ background: 'rgba(5,150,105,0.15)', color: '#059669', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 800 }}>✓ Done</span>}
                            <span style={{ background: 'rgba(5,150,105,0.1)', color: '#059669', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 700 }}>Band {task.bands_target}</span>
                          </div>
                        </div>
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>{task.task_type === 'task1' ? 'Task 1 · 20 min' : 'Task 2 · 40 min'}</p>
                      </button>
                    );
                  })
              }
            </section>

            {/* Speaking */}
            <section data-home-card style={{ ...glass(), padding: '1.1rem', marginBottom: '1rem', opacity: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '1.35rem' }}>🎤</span>
                <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#ea580c' }}>Speaking</h2>
              </div>
              {isLoading && speakingTasks.length === 0
                ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>Loading speaking tasks…</p>
                : speakingTasks.length === 0
                  ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>No speaking tasks published yet.</p>
                  : speakingTasks.map((task, index) => {
                    const isCompleted = completedTasks.speaking.includes(task.id);
                    const isLocked = !canAccessRequiredTier(task.required_tier) || (!isPrimeUser && index > 0 && !task.required_tier);
                    return (
                      <button key={task.id} onClick={() => openTask(`/ielts/speaking/${task.id}`, isLocked)}
                        style={{ width: '100%', background: isCompleted ? 'rgba(52,211,153,0.07)' : isLocked ? 'rgba(255,255,255,0.02)' : 'rgba(251,146,60,0.04)', border: isCompleted ? '1px solid rgba(52,211,153,0.3)' : isLocked ? '1px dashed rgba(255,255,255,0.1)' : '1px solid rgba(251,146,60,0.15)', borderRadius: '0.65rem', padding: '0.75rem', marginBottom: '0.5rem', textAlign: 'left', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                            {isLocked && <span style={{ background: 'linear-gradient(135deg, #fde68a, #f59e0b)', color: '#111827', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 800, textTransform: 'uppercase' }}>Prime</span>}
                            {isCompleted && <span style={{ background: 'rgba(52,211,153,0.2)', color: '#34d399', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 800 }}>✓ Done</span>}
                            <span style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c', fontSize: '0.6rem', padding: '0.2rem 0.5rem', borderRadius: '9999px', fontWeight: 700 }}>Part {task.part}</span>
                          </div>
                          <p style={{ margin: 0, fontWeight: 700, color: isLocked ? 'rgba(255,255,255,0.3)' : '#f0f9ff', fontSize: '0.875rem', lineHeight: 1.4 }}>{task.prompt}</p>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>Record & get expert feedback</p>
                        </div>
                      </button>
                    );
                  })
              }
            </section>
          </>
        )}

        {/* Prime CTA */}
        {!isPrimeUser && (
          <div data-home-card style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '1rem', padding: '1.25rem', textAlign: 'center', marginBottom: '1rem', opacity: 1 }}>
            <h3 style={{ color: '#1d4ed8', fontSize: '1.1rem', fontWeight: 900, margin: '0 0 0.4rem' }}>⭐ Upgrade to IELTS Prime</h3>
            <p style={{ color: '#3b82f6', fontSize: '0.8rem', margin: '0 0 0.85rem' }}>After your diagnostic, unlock guided practice, feedback, transcripts, and progress tracking. Secure checkout powered by Paddle.</p>
            <button onClick={() => navigate('/ielts/apply-prime')} style={{ background: '#22c55e', color: '#fff', fontWeight: 800, padding: '0.6rem 1.5rem', borderRadius: '0.55rem', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>
              Explore Prime
            </button>
          </div>
        )}

        {/* Back to game */}
        <button onClick={() => navigate('/')} style={{ width: '100%', padding: '0.75rem', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}>
          ← Back to Brain Heist Game
        </button>
      </div>
    </div>
  );
};

export default IeltsHome;
