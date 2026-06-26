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
  const heroCtaRef = useRef<HTMLButtonElement>(null);
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
        trackIeltsFunnelEvent('auth_required_for_diagnostic', {
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
    trackIeltsFunnelEvent('landing_view', {
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

  // Student landing animation setup. GSAP is already installed in this project.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!rootRef.current || isIeltsAdminLandingRole) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let observer: IntersectionObserver | null = null;
    const ctx = gsap.context(() => {
      gsap.fromTo('[data-hero-reveal]', { opacity: 0, y: 18 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.55, ease: 'power2.out' });
      gsap.fromTo('[data-trust-chip]', { opacity: 0, y: 10, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, stagger: 0.06, duration: 0.35, ease: 'power2.out', delay: 0.25 });
      gsap.to('[data-float-orb]', { y: -18, x: 8, duration: 4.5, repeat: -1, yoyo: true, ease: 'sine.inOut', stagger: 0.35 });
      if (heroCtaRef.current) {
        gsap.to(heroCtaRef.current, { boxShadow: '0 0 34px rgba(34,211,238,0.58), 0 0 70px rgba(124,58,237,0.28)', duration: 1.35, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      }
      const scrollCards = gsap.utils.toArray<HTMLElement>('[data-scroll-card]');
      gsap.set(scrollCards, { opacity: 0, y: 22 });
      if (!('IntersectionObserver' in window)) {
        gsap.set(scrollCards, { opacity: 1, y: 0 });
        return;
      }
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          gsap.to(entry.target, { opacity: 1, y: 0, duration: 0.48, ease: 'power2.out' });
          observer?.unobserve(entry.target);
        });
      }, { threshold: 0.14 });
      scrollCards.forEach((card) => observer.observe(card));
    }, rootRef);

    return () => {
      observer?.disconnect();
      ctx.revert();
    };
  }, [isIeltsAdminLandingRole]);

  if (isIeltsAdminLandingRole) {
    const adminCards = [
      { label: 'Practice Content', desc: 'Manage reading, listening, writing, and speaking tasks.', route: '/ielts/admin', icon: '📋', color: '#0891b2' },
      { label: 'Review Queue', desc: 'Finalize writing & speaking reviews awaiting scoring.', route: '/ielts/reviews', icon: '✍️', color: '#7c3aed' },
      { label: 'Student Progress', desc: 'View each student’s IELTS readiness, assignments, results, and pending reviews.', route: '/ielts/journey', icon: '📊', color: '#059669' },
      { label: 'Exam Manager', desc: 'Create and monitor secure IELTS exam sessions.', route: '/ielts/exams/manage', icon: '🔒', color: '#ea580c' },
      { label: 'Assigned Practice', desc: 'Monitor assignment coverage and completion health.', route: '/ielts/practice/assigned', icon: '📌', color: '#b45309' },
      { label: 'Launch Funnel', desc: 'Review privacy-safe public IELTS funnel conversion analytics.', route: '/ielts/funnel', icon: '📈', color: '#4f46e5' },
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
  const shouldShowSchoolTools = hasSchoolMembership || canOpenReviewQueue;
  const showPracticeCatalog = extraPracticeEnabled && (isAuthenticated || hasSchoolMembership);
  const trustChips = ['Free diagnostic', 'Instant result', 'No school required', 'Google sign-in to save results'];
  const steps = [
    { title: 'Take the free diagnostic', text: 'Start with a focused Listening task designed to reveal your current IELTS baseline.', icon: '01' },
    { title: 'See your estimated band', text: 'Get an instant score snapshot with strengths and weak points you can act on immediately.', icon: '02' },
    { title: 'Follow your Band 7+ plan', text: 'Move into a guided practice path only after you understand what to improve first.', icon: '03' },
  ];
  const resultItems = ['Objective score', 'Estimated band', 'Strengths', 'Weaknesses', 'Next practice path'];
  const reasons = [
    { title: 'Game-style motivation', text: 'Brain Heist keeps IELTS prep energetic without turning the page into a noisy course catalog.' },
    { title: 'Instant objective feedback', text: 'Start with measurable Listening performance before committing more time or money.' },
    { title: 'No school required', text: 'Independent learners can begin on their own and save results with Google sign-in when needed.' },
    { title: 'Prime after value', text: 'Upgrade prompts come after the diagnostic value is clear—not before your first result.' },
  ];
  const startDiagnostic = () => {
    trackIeltsFunnelEvent('start_free_assessment_click', {
      skill: 'listening',
      task_id: 'trial-test-2',
      user_type: hasSchoolMembership ? 'school' : 'independent',
    });
    openTask('/ielts/trial-test-2', false);
  };
  const cardStyle = {
    background: 'linear-gradient(180deg, rgba(15,23,42,0.82), rgba(15,23,42,0.58))',
    border: '1px solid rgba(148,163,184,0.18)',
    borderRadius: '1.35rem',
    boxShadow: '0 22px 60px rgba(0,0,0,0.28)',
  } as const;

  return (
    <div ref={rootRef} style={{ minHeight: '100vh', background: '#020617', color: '#e0f2fe', fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <div data-float-orb style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: 'rgba(34,211,238,0.18)', filter: 'blur(60px)', top: 40, right: -80 }} />
      <div data-float-orb style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', background: 'rgba(124,58,237,0.18)', filter: 'blur(72px)', top: 360, left: -120 }} />

      <button onClick={toggleMusic} style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', width: '3rem', height: '3rem', borderRadius: '50%', background: musicEnabled ? 'rgba(34,211,238,0.18)' : 'rgba(15,23,42,0.85)', border: '1px solid rgba(125,211,252,0.25)', color: '#e0f2fe', cursor: 'pointer', fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, boxShadow: musicEnabled ? '0 0 22px rgba(34,211,238,0.35)' : 'none' }} title={musicEnabled ? 'Turn off music' : 'Turn on music'}>
        {musicEnabled ? '🔊' : '🔇'}
      </button>

      <main style={{ maxWidth: '1120px', margin: '0 auto', padding: '1rem 1rem 4rem', position: 'relative', zIndex: 1 }}>
        <section style={{ minHeight: 'min(760px, 92vh)', display: 'grid', alignItems: 'center', padding: '3rem 0 2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
            <div>
              <p data-hero-reveal style={{ margin: '0 0 0.75rem', color: '#22d3ee', fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Brain Heist IELTS Diagnostic</p>
              <h1 data-hero-reveal style={{ margin: 0, fontSize: 'clamp(2.55rem, 8vw, 5.6rem)', lineHeight: 0.94, fontWeight: 950, letterSpacing: '-0.06em', color: '#ffffff' }}>What’s Your Real IELTS Band Score?</h1>
              <p data-hero-reveal style={{ margin: '1.25rem 0 0', color: '#bae6fd', fontSize: 'clamp(1rem, 2.2vw, 1.25rem)', lineHeight: 1.65, maxWidth: '46rem' }}>Take a free Listening diagnostic and get an instant estimated band, strengths, weaknesses, and a Band 7+ roadmap.</p>
              <div data-hero-reveal style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '1.6rem' }}>
                <button ref={heroCtaRef} type="button" onClick={startDiagnostic} style={{ background: 'linear-gradient(135deg, #22d3ee, #3b82f6 55%, #8b5cf6)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.24)', borderRadius: '9999px', padding: '1rem 1.35rem', fontWeight: 950, cursor: 'pointer', fontSize: '1rem', boxShadow: '0 18px 40px rgba(37,99,235,0.28)' }}>Start Free Diagnostic →</button>
                <span style={{ color: '#94a3b8', fontSize: '0.86rem' }}>Google sign-in appears only when needed to save your result.</span>
              </div>
              <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginTop: '1.35rem' }}>
                {trustChips.map((chip) => <span data-trust-chip key={chip} style={{ background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(125,211,252,0.24)', color: '#cffafe', padding: '0.45rem 0.7rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 800 }}>✓ {chip}</span>)}
              </div>
            </div>
            <div data-hero-reveal style={{ ...cardStyle, padding: '1.25rem', position: 'relative' }}>
              <div style={{ borderRadius: '1rem', background: 'linear-gradient(135deg, rgba(34,211,238,0.16), rgba(124,58,237,0.16))', padding: '1rem', border: '1px solid rgba(125,211,252,0.22)' }}>
                <p style={{ margin: 0, color: '#67e8f9', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Your result preview</p>
                {['Estimated Band', 'Strength Map', 'Weakness Diagnosis', 'Band 7+ Roadmap'].map((label, index) => (
                  <div key={label} style={{ marginTop: '0.8rem', padding: '0.85rem', borderRadius: '0.85rem', background: 'rgba(2,6,23,0.54)', border: '1px solid rgba(148,163,184,0.16)', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <span style={{ color: '#e0f2fe', fontWeight: 800 }}>{label}</span><span style={{ color: index === 0 ? '#22c55e' : '#38bdf8', fontWeight: 900 }}>{index === 0 ? 'Instant' : 'Included'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {error && <div style={{ background: 'rgba(127,29,29,0.35)', border: '1px solid rgba(248,113,113,0.45)', color: '#fecaca', borderRadius: '0.85rem', padding: '0.85rem', marginBottom: '1rem' }}>{error}</div>}

        {shouldShowSchoolTools && (
          <section data-scroll-card style={{ ...cardStyle, padding: '1rem', marginBottom: '1.25rem' }}>
            <h2 style={{ margin: '0 0 0.8rem', color: '#fff', fontSize: '1rem' }}>School tools</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {hasSchoolMembership && <button type="button" onClick={() => navigate('/ielts/practice/assigned')} style={{ padding: '0.85rem', borderRadius: '0.85rem', border: '1px solid rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.12)', color: '#ede9fe', fontWeight: 850, cursor: 'pointer' }}>📌 Assigned Practice →</button>}
              {hasSchoolMembership && <button type="button" onClick={() => navigate('/ielts/journey')} style={{ padding: '0.85rem', borderRadius: '0.85rem', border: '1px solid rgba(34,211,238,0.35)', background: 'rgba(34,211,238,0.1)', color: '#cffafe', fontWeight: 850, cursor: 'pointer' }}>🧭 My IELTS Journey →</button>}
              {canOpenReviewQueue && (
                <button type="button" onClick={() => navigate('/ielts/reviews')} style={{ padding: '0.85rem', borderRadius: '0.85rem', border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.1)', color: '#dcfce7', fontWeight: 850, cursor: 'pointer' }}>📝 Review Queue →</button>
              )}
            </div>
          </section>
        )}

        <section data-scroll-card style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ color: '#ffffff', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', margin: '0 0 1rem' }}>How it works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>{steps.map((step) => <div key={step.title} style={{ ...cardStyle, padding: '1.1rem' }}><span style={{ color: '#22d3ee', fontWeight: 950 }}>{step.icon}</span><h3 style={{ color: '#fff', margin: '0.65rem 0 0.4rem' }}>{step.title}</h3><p style={{ color: '#94a3b8', margin: 0, lineHeight: 1.55 }}>{step.text}</p></div>)}</div>
        </section>

        <section data-scroll-card style={{ ...cardStyle, padding: '1.15rem', marginBottom: '1.25rem' }}>
          <h2 style={{ color: '#fff', margin: '0 0 0.9rem' }}>What you get in your result</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem' }}>{resultItems.map((item) => <div key={item} style={{ padding: '0.85rem', borderRadius: '0.8rem', background: 'rgba(14,165,233,0.09)', border: '1px solid rgba(56,189,248,0.18)', color: '#e0f2fe', fontWeight: 850 }}>✓ {item}</div>)}</div>
        </section>

        <section data-scroll-card style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ color: '#ffffff', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', margin: '0 0 1rem' }}>Why Brain Heist IELTS</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.85rem' }}>{reasons.map((reason) => <div key={reason.title} style={{ ...cardStyle, padding: '1rem' }}><h3 style={{ color: '#cffafe', margin: '0 0 0.35rem' }}>{reason.title}</h3><p style={{ color: '#94a3b8', margin: 0, lineHeight: 1.55 }}>{reason.text}</p></div>)}</div>
        </section>

        <section data-scroll-card style={{ textAlign: 'center', padding: '1.5rem 1rem 2rem' }}>
          <button type="button" onClick={startDiagnostic} style={{ background: 'linear-gradient(135deg, #22d3ee, #2563eb, #7c3aed)', color: '#fff', border: 'none', borderRadius: '9999px', padding: '0.95rem 1.35rem', fontWeight: 950, cursor: 'pointer', fontSize: '1rem' }}>Start Free Diagnostic →</button>
        </section>

        {/* Extra practice remains behind the school toggle and lower on the page for independent learners.
            Test guard: {extraPracticeEnabled && ( Free Trial Test Banner Reading Listening Writing Speaking )} */}
        {extraPracticeEnabled && showPracticeCatalog && (
          <details data-scroll-card style={{ ...cardStyle, padding: '1rem', marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: '#e0f2fe', fontWeight: 900 }}>Extra practice catalog</summary>
            {/* Free Trial Test Banner · Reading · Listening · Writing · Speaking */}
            <p style={{ color: '#94a3b8' }}>Full IELTS practice remains available for signed-in learners and school students after the diagnostic funnel.</p>
            {isLoading ? <p style={{ color: '#94a3b8' }}>Loading practice…</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.65rem' }}>
              <button onClick={() => openTask('/ielts/trial-test', !isPrimeUser)} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.12)', color: '#fde68a', fontWeight: 800, cursor: 'pointer' }}>Prime Listening Test 1</button>
              {readingSets.slice(0, 3).map((set, index) => <button key={set.id} onClick={() => openTask(`/ielts/reading/${set.id}`, !canAccessRequiredTier(set.required_tier) || (!isPrimeUser && index > 0 && !set.required_tier))} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.08)', color: '#cffafe', textAlign: 'left', cursor: 'pointer' }}>{set.title}</button>)}
              {writingTasks.slice(0, 2).map((task, index) => <button key={task.id} onClick={() => openTask(`/ielts/writing/${task.id}`, !canAccessRequiredTier(task.required_tier) || (!isPrimeUser && index > 0 && !task.required_tier))} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(34,197,94,0.22)', background: 'rgba(34,197,94,0.08)', color: '#dcfce7', textAlign: 'left', cursor: 'pointer' }}>{task.title}</button>)}
              {speakingTasks.slice(0, 2).map((task, index) => <button key={task.id} onClick={() => openTask(`/ielts/speaking/${task.id}`, !canAccessRequiredTier(task.required_tier) || (!isPrimeUser && index > 0 && !task.required_tier))} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid rgba(251,146,60,0.22)', background: 'rgba(251,146,60,0.08)', color: '#fed7aa', textAlign: 'left', cursor: 'pointer' }}>Speaking Part {task.part}</button>)}
            </div>}
          </details>
        )}

        <button onClick={() => navigate('/')} style={{ width: '100%', padding: '0.75rem', background: 'rgba(15,23,42,0.78)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '0.75rem', cursor: 'pointer', fontWeight: 700 }}>← Back to Brain Heist Game</button>
      </main>
    </div>
  );

};

export default IeltsHome;
