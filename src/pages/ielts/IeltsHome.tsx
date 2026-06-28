import React, { useEffect, useRef, useState } from 'react';
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
import { fetchIeltsDashboardSummary, type IeltsDashboardSummary } from '../../../services/ieltsDashboardService';
import IeltsAnimatedHero from '../../components/ielts/IeltsAnimatedHero';
import IeltsPrimeDashboard from '../../components/ielts/IeltsPrimeDashboard';

const IeltsHome: React.FC = () => {
  const navigate = useNavigate();
  const dashboardEventTrackedRef = useRef(false);
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
  const [authResolved, setAuthResolved] = useState(false);
  const [userRole, setUserRole] = useState<string>('student');
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [hasSchoolMembership, setHasSchoolMembership] = useState(false);
  const [profileContextLoaded, setProfileContextLoaded] = useState(false);
  const [extraPracticeEnabled, setExtraPracticeEnabled] = useState(true);
  const [dashboardSummary, setDashboardSummary] = useState<IeltsDashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
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
      if (active) {
        setIsAuthenticated(Boolean(data.session));
        setAuthResolved(true);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setAuthResolved(true);
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
    let active = true;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    if (!profileContextLoaded || !isAuthenticated || isIeltsAdminLandingRole) {
      setDashboardSummary(null);
      setDashboardLoading(false);
      setDashboardLoaded(false);
      dashboardEventTrackedRef.current = false;
      return () => { active = false; };
    }

    const loadDashboard = async () => {
      setDashboardLoading(true);
      setDashboardLoaded(false);
      const recentSubmittedAt = Number(window.localStorage.getItem('ielts_diagnostic_submitted_recently') || 0);
      const shouldRetryDiagnostic = recentSubmittedAt > 0 && Date.now() - recentSubmittedAt < 2 * 60 * 1000;
      const maxAttempts = shouldRetryDiagnostic ? 3 : 1;
      let latestSummary: IeltsDashboardSummary | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          latestSummary = await fetchIeltsDashboardSummary();
        } catch {
          latestSummary = null;
        }
        if (!active) return;
        if (!shouldRetryDiagnostic || latestSummary?.diagnostic.completed || attempt === maxAttempts) break;
        await wait(450);
      }

      if (!active) return;
      setDashboardSummary(latestSummary);
      setDashboardLoaded(true);
      setDashboardLoading(false);
      if (shouldRetryDiagnostic) window.localStorage.removeItem('ielts_diagnostic_submitted_recently');

      if (latestSummary && !dashboardEventTrackedRef.current) {
        dashboardEventTrackedRef.current = true;
        trackIeltsFunnelEvent(latestSummary.isPrimeActive ? 'prime_dashboard_viewed' : 'dashboard_viewed', {
          skill: latestSummary.diagnostic.skill,
          task_id: latestSummary.diagnostic.taskId,
          estimated_band: latestSummary.diagnostic.estimatedBand,
          plan: latestSummary.subscription.plan,
          user_type: hasSchoolMembership ? 'school' : 'independent',
        });
      }
    };

    void loadDashboard();
    return () => { active = false; };
  }, [profileContextLoaded, isAuthenticated, isIeltsAdminLandingRole, hasSchoolMembership]);

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

  // GSAP is already installed in this project and powers the IELTS hero components.

  const startDiagnostic = () => {
    trackIeltsFunnelEvent('start_free_assessment_click', {
      skill: 'listening',
      task_id: 'trial-test-2',
      user_type: hasSchoolMembership ? 'school' : 'independent',
    });
    openTask('/ielts/trial-test-2', false);
  };

  const shouldShowDashboardLoading = !authResolved || (isAuthenticated && !isIeltsAdminLandingRole && (!profileContextLoaded || dashboardLoading || (!dashboardLoaded && !dashboardSummary)));

  if (shouldShowDashboardLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#172554 48%,#4c1d95)', color: '#e0f2fe', display: 'grid', placeItems: 'center', padding: '1.5rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ width: 'min(100%, 520px)', background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(125,211,252,0.24)', borderRadius: '1.25rem', padding: 'clamp(1.5rem,4vw,2.25rem)', textAlign: 'center', boxShadow: '0 24px 70px rgba(2,6,23,0.35)' }}>
          <div style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>🎧</div>
          <p style={{ margin: '0 0 0.45rem', color: '#67e8f9', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Brain Heist IELTS</p>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 'clamp(1.45rem,5vw,2.25rem)', letterSpacing: '-0.04em' }}>Loading your IELTS dashboard…</h1>
          <p style={{ margin: '0.75rem auto 0', color: '#cbd5e1', lineHeight: 1.6, maxWidth: 420 }}>We’re checking your diagnostic result and practice access.</p>
        </div>
      </div>
    );
  }

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


  const formatDate = (value?: string | null) => {
    if (!value) return 'Not available yet';
    if (value === 'Practice activity available') return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available yet' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (isAuthenticated && dashboardSummary && !isIeltsAdminLandingRole) {
    const summary = dashboardSummary;
    const activePrime = summary.isPrimeActive;
    const lapsedPrime = Boolean(summary.subscription.status && summary.subscription.status !== 'active');
    const recommendedSkill = summary.weakestSkill || 'reading';
    const recommendedRoute = summary.continueLearningRoute;
    const taskTotal = Object.values(summary.tasks).reduce((sum, list) => sum + list.length, 0);
    const completedTotal = Object.values(summary.skillProgress).reduce((sum, progress) => sum + progress.completedTaskCount, 0);
    const shell: React.CSSProperties = { minHeight: '100vh', background: 'linear-gradient(135deg,#eef7ff 0%,#f8fafc 42%,#f3e8ff 100%)', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 'clamp(1rem,3vw,2rem)' };
    const whiteCard: React.CSSProperties = { background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(148,163,184,0.28)', borderRadius: '1.25rem', padding: '1.1rem', boxShadow: '0 18px 45px rgba(15,23,42,0.08)' };
    const skillCards = [
      { skill: 'reading' as const, label: 'Reading', benefit: 'Build speed, scanning, and evidence matching.', progress: summary.skillProgress.reading, overviewRoute: '/ielts/reading' },
      { skill: 'writing' as const, label: 'Writing', benefit: 'Structure essays and get feedback when Prime tools are available.', progress: summary.skillProgress.writing, overviewRoute: '/ielts/writing' },
      { skill: 'listening' as const, label: 'Listening', benefit: 'Improve detail accuracy and distractor control.', progress: summary.skillProgress.listening, overviewRoute: '/ielts/listening' },
      { skill: 'speaking' as const, label: 'Speaking', benefit: 'Practise fluent answers with clear response patterns.', progress: summary.skillProgress.speaking, overviewRoute: '/ielts/speaking' },
    ];
    if (!summary.diagnostic.completed) {
      return <div style={shell}><main style={{ maxWidth: 1120, margin: '0 auto' }}><IeltsAnimatedHero onStartDiagnostic={startDiagnostic} compact authenticated /><section style={{ ...whiteCard, marginTop: '1rem' }}><h2 style={{ margin: '0 0 .5rem', color: '#0f172a' }}>Your diagnostic is ready.</h2><p style={{ margin: 0, color: '#475569', lineHeight: 1.65 }}>Start the free Listening diagnostic to unlock an estimated band snapshot, strengths, weaknesses, and your next IELTS practice path.</p></section></main></div>;
    }
    if (activePrime) {
      return (
        <IeltsPrimeDashboard
          summary={summary}
          lapsedPrime={lapsedPrime}
          taskTotal={taskTotal}
          completedTotal={completedTotal}
          recommendedSkill={recommendedSkill}
          recommendedRoute={recommendedRoute}
          onNavigate={navigate}
          onRedirectToPrime={redirectToPrime}
          formatDate={formatDate}
        />
      );
    }
    return <div style={shell}><main style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: '1rem' }}><section style={{ ...whiteCard, background: 'linear-gradient(135deg,#0f172a,#172554 48%,#4c1d95)', color: '#fff', padding: 'clamp(1.3rem,4vw,2.2rem)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}><div><span style={{ display: 'inline-flex', background: activePrime ? 'rgba(34,197,94,.16)' : 'rgba(251,191,36,.16)', border: '1px solid rgba(255,255,255,.22)', borderRadius: 999, padding: '.35rem .7rem', fontWeight: 900, color: activePrime ? '#bbf7d0' : '#fde68a' }}>{activePrime ? 'IELTS Prime Active' : lapsedPrime ? 'Prime access needs renewal' : 'Diagnostic complete'}</span><h1 style={{ margin: '.8rem 0 .35rem', fontSize: 'clamp(2rem,5vw,3.7rem)', letterSpacing: '-0.05em' }}>Welcome back, {summary.displayName || 'IELTS learner'}.</h1><p style={{ margin: 0, color: '#cbd5e1' }}>{activePrime ? 'Continue your premium IELTS practice dashboard.' : 'You’re closer than you think. Your result shows where to focus next.'}</p></div><button type="button" onClick={() => navigate(recommendedRoute)} style={{ alignSelf: 'center', background: '#fff', color: '#312e81', border: 0, borderRadius: 999, padding: '.9rem 1.15rem', fontWeight: 950, cursor: 'pointer' }}>Continue Learning →</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.75rem', marginTop: '1.1rem' }}>{[['Estimated Band', summary.diagnostic.estimatedBand ? `${summary.diagnostic.estimatedBand}.0` : 'Estimated after diagnostic'], ['Target Band', summary.targetBand ? `${summary.targetBand}.0` : 'Set when ready'], ['Plan', summary.subscription.plan || (activePrime ? 'Prime access active' : 'Free')], ['Status', summary.subscription.status || (activePrime ? 'active' : 'free')], ['Started', formatDate((summary.subscription as any).current_period_start)], ['Renewal', formatDate(summary.subscription.current_period_end)]].map(([k,v]) => <div key={k} style={{ background: 'rgba(15,23,42,.48)', border: '1px solid rgba(148,163,184,.22)', borderRadius: '.9rem', padding: '.85rem' }}><div style={{ color: '#94a3b8', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase' }}>{k}</div><div style={{ color: '#fff', fontWeight: 950, marginTop: '.2rem' }}>{v}</div></div>)}</div></section><section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem' }}><div style={whiteCard}><b>Diagnostic complete</b><p>Completed {formatDate(summary.diagnostic.completedAt)}</p></div><div style={whiteCard}><b>Tasks completed</b><p>{completedTotal} completed · {taskTotal || 'No'} available</p></div><div style={whiteCard}><b>Current focus skill</b><p>{recommendedSkill ? recommendedSkill[0].toUpperCase()+recommendedSkill.slice(1) : 'Reading'}</p></div><div style={whiteCard}><b>Recent activity</b><p>{formatDate(summary.recentActivity)}</p></div></section><section style={whiteCard}><h2 style={{ marginTop: 0 }}>{activePrime ? 'Skill tracks' : 'Your IELTS result and next step'}</h2>{!activePrime && <p style={{ color: '#475569' }}>IELTS Prime helps you turn this result into a guided practice plan. Prime sections are previewed below without hiding your diagnostic progress.</p>}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '.8rem' }}>{skillCards.map((card) => { const locked = !activePrime && ['writing','speaking'].includes(card.skill); const disabled = !locked && !card.progress.nextUnfinishedTaskRoute; const statusLabel = locked ? 'Locked' : card.progress.buttonLabel; const destination = card.progress.nextUnfinishedTaskRoute || (card.progress.allTasksCompleted ? card.overviewRoute : null); return <div key={card.skill} style={{ border: card.progress.allTasksCompleted ? '1px solid rgba(34,197,94,0.34)' : '1px solid #e2e8f0', borderRadius: '1rem', padding: '1rem', background: locked ? '#f8fafc' : card.progress.allTasksCompleted ? 'linear-gradient(180deg,#ffffff,#f0fdf4)' : '#fff' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{card.label}</h3><span style={{ color: locked ? '#9333ea' : card.progress.allTasksCompleted ? '#047857' : card.progress.totalAvailableTasks ? '#059669' : '#64748b', fontWeight: 900 }}>{locked ? 'Locked' : card.progress.totalAvailableTasks ? (card.progress.allTasksCompleted ? 'Completed' : 'Available') : 'Coming soon'}</span></div><p style={{ color: '#64748b', minHeight: 44 }}>{card.benefit}</p><p style={{ fontSize: '.82rem', color: '#475569' }}>{card.progress.completedTaskCount} / {card.progress.totalAvailableTasks} completed</p><button type="button" disabled={disabled} onClick={() => locked ? redirectToPrime() : destination && navigate(destination)} style={{ width: '100%', border: 0, borderRadius: '.7rem', padding: '.7rem', fontWeight: 900, cursor: disabled ? 'default' : 'pointer', background: locked ? '#ede9fe' : card.progress.allTasksCompleted ? '#dcfce7' : card.progress.totalAvailableTasks ? '#0f172a' : '#e2e8f0', color: locked ? '#6d28d9' : card.progress.allTasksCompleted ? '#166534' : card.progress.totalAvailableTasks ? '#fff' : '#64748b', opacity: disabled ? 0.82 : 1 }}>{locked ? 'Unlock with Prime' : statusLabel}</button></div>; })}</div></section>{!activePrime && <section style={{ ...whiteCard, borderColor: '#c4b5fd' }}><h2 style={{ marginTop: 0 }}>{lapsedPrime ? 'Renew IELTS Prime' : 'Unlock IELTS Prime'}</h2><p style={{ color: '#475569' }}>Writing feedback, Speaking practice, full progress tracking, and a band improvement plan are available with Prime. No fake promises — just a clearer practice system.</p><button type="button" onClick={redirectToPrime} style={{ background: 'linear-gradient(135deg,#7c3aed,#2563eb)', color: '#fff', border: 0, borderRadius: 999, padding: '.85rem 1.1rem', fontWeight: 950, cursor: 'pointer' }}>{lapsedPrime ? 'Renew IELTS Prime' : 'Improve My Band'}</button></section>}{activePrime && summary.subscription.management_url && <a href={summary.subscription.management_url} style={{ color: '#334155', fontWeight: 800 }}>Manage subscription</a>}<button onClick={() => navigate('/')} style={{ padding: '.75rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '.75rem', cursor: 'pointer' }}>← Back to Brain Heist Game</button></main></div>;
  }

  const shouldShowSchoolTools = hasSchoolMembership || canOpenReviewQueue;
  const showPracticeCatalog = extraPracticeEnabled && (isAuthenticated || hasSchoolMembership);
  const getItems = ['Objective score', 'Estimated band', 'Strengths', 'Weaknesses', 'Next practice path'];
  const steps = [
    { title: 'Take the free diagnostic', text: 'Complete a focused Listening baseline without paying first.', icon: '01' },
    { title: 'See your estimated band', text: 'Review an estimated band snapshot plus the patterns behind it.', icon: '02' },
    { title: 'Follow your next practice path', text: 'Move into the skills that matter most for your gap.', icon: '03' },
    { title: 'Upgrade when ready', text: 'Prime tools appear after your result, not before.', icon: '04' },
  ];
  const skills = [
    { title: 'Reading', text: 'Build speed while proving every answer with evidence.', accent: '#0ea5e9' },
    { title: 'Listening', text: 'Catch details, traps, and distractors under test pressure.', accent: '#7c3aed' },
    { title: 'Writing', text: 'Turn structure and feedback into cleaner Task 1 and Task 2 responses.', accent: '#f59e0b' },
    { title: 'Speaking', text: 'Practise fluency, confidence, and complete answers.', accent: '#10b981' },
  ];
  const primeTools = ['Guided practice', 'Writing/Speaking feedback', 'Progress tracking', 'Skill-by-skill dashboard'];
  const sectionTitle: React.CSSProperties = { margin: '0 0 1rem', color: '#0f172a', fontSize: 'clamp(1.55rem,4vw,2.45rem)', letterSpacing: '-0.04em', lineHeight: 1.05 };
  const card: React.CSSProperties = { background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(148,163,184,0.22)', borderRadius: '1.35rem', padding: '1.1rem', boxShadow: '0 18px 48px rgba(15,23,42,0.08)' };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 85% 8%, #dbeafe 0, transparent 30%), radial-gradient(circle at 12% 16%, #ccfbf1 0, transparent 28%), linear-gradient(180deg,#f8fbff 0%,#eef6ff 45%,#ffffff 100%)', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif', overflowX: 'hidden' }}>
      <button onClick={toggleMusic} style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', width: '3rem', height: '3rem', borderRadius: '50%', background: musicEnabled ? '#dbeafe' : '#ffffff', border: '1px solid #bfdbfe', color: '#1e3a8a', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, boxShadow: '0 14px 30px rgba(37,99,235,0.16)' }} title={musicEnabled ? 'Turn off music' : 'Turn on music'}>
        {musicEnabled ? '🔊' : '🔇'}
      </button>

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '1rem 1rem 4rem' }}>
        <IeltsAnimatedHero onStartDiagnostic={startDiagnostic} authenticated={isAuthenticated} compact={isAuthenticated} />

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '0.85rem', padding: '0.85rem', marginBottom: '1rem' }}>{error}</div>}

        {shouldShowSchoolTools && (
          <section style={{ ...card, marginBottom: '1.25rem' }}>
            <h2 style={{ margin: '0 0 0.8rem', color: '#0f172a', fontSize: '1rem' }}>School tools</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {hasSchoolMembership && <button type="button" onClick={() => navigate('/ielts/practice/assigned')} style={{ padding: '0.85rem', borderRadius: '0.85rem', border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#5b21b6', fontWeight: 850, cursor: 'pointer' }}>📌 Assigned Practice →</button>}
              {hasSchoolMembership && <button type="button" onClick={() => navigate('/ielts/journey')} style={{ padding: '0.85rem', borderRadius: '0.85rem', border: '1px solid #bae6fd', background: '#f0f9ff', color: '#075985', fontWeight: 850, cursor: 'pointer' }}>🧭 My IELTS Journey →</button>}
              {canOpenReviewQueue && (
                <button type="button" onClick={() => navigate('/ielts/reviews')} style={{ padding: '0.85rem', borderRadius: '0.85rem', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontWeight: 850, cursor: 'pointer' }}>📝 Review Queue →</button>
              )}
            </div>
          </section>
        )}

        <section style={{ marginBottom: '1.4rem' }}>
          <h2 style={sectionTitle}>What you get</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '.8rem' }}>{getItems.map((item) => <div key={item} style={card}><span style={{ color: '#2563eb', fontWeight: 950 }}>✓</span><h3 style={{ margin: '.45rem 0 0', fontSize: '1rem' }}>{item}</h3></div>)}</div>
        </section>

        <section style={{ marginBottom: '1.4rem' }}>
          <h2 style={sectionTitle}>How it works</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '.85rem' }}>{steps.map((step) => <div key={step.title} style={card}><span style={{ color: '#2563eb', fontWeight: 950, letterSpacing: '.08em' }}>{step.icon}</span><h3 style={{ margin: '.65rem 0 .35rem' }}>{step.title}</h3><p style={{ margin: 0, color: '#64748b', lineHeight: 1.55 }}>{step.text}</p></div>)}</div>
        </section>

        <section style={{ marginBottom: '1.4rem' }}>
          <h2 style={sectionTitle}>Skill paths</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '.85rem' }}>{skills.map((skill) => <button key={skill.title} type="button" style={{ ...card, textAlign: 'left', cursor: 'pointer', transition: 'transform .2s ease, box-shadow .2s ease' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 22px 54px ${skill.accent}22`; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 18px 48px rgba(15,23,42,0.08)'; }}><span style={{ display: 'inline-flex', width: 36, height: 36, borderRadius: 12, background: `${skill.accent}18`, color: skill.accent, alignItems: 'center', justifyContent: 'center', fontWeight: 950 }}>●</span><h3 style={{ margin: '.7rem 0 .35rem' }}>{skill.title}</h3><p style={{ margin: 0, color: '#64748b', lineHeight: 1.55 }}>{skill.text}</p></button>)}</div>
        </section>

        <section style={{ ...card, marginBottom: '1.4rem', background: 'linear-gradient(135deg,#ffffff,#f5f3ff)' }}>
          <h2 style={sectionTitle}>Prime starts after you see your result — not before.</h2>
          <p style={{ color: '#475569', lineHeight: 1.7, maxWidth: 760 }}>Prime is a focused next step for learners who want deeper feedback and a clearer plan after the free diagnostic has shown the gap.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '.75rem', marginTop: '1rem' }}>{primeTools.map((tool) => <div key={tool} style={{ border: '1px solid #ddd6fe', background: '#fff', borderRadius: '1rem', padding: '.9rem', color: '#4c1d95', fontWeight: 900 }}>🔒 {tool}</div>)}</div>
        </section>

        <section style={{ textAlign: 'center', padding: '1.7rem 1rem 2.2rem' }}>
          <button type="button" onClick={startDiagnostic} style={{ background: 'linear-gradient(135deg,#0ea5e9,#2563eb,#7c3aed)', color: '#fff', border: 'none', borderRadius: '9999px', padding: '1rem 1.45rem', fontWeight: 950, cursor: 'pointer', fontSize: '1rem' }}>Start Free IELTS Diagnostic →</button>
        </section>

        {extraPracticeEnabled && (showPracticeCatalog && (
          <details style={{ ...card, marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: '#0f172a', fontWeight: 900 }}>Extra practice catalog</summary>
            {/* Free Trial Test Banner · Reading · Listening · Writing · Speaking */}
            <p style={{ color: '#64748b' }}>Full IELTS practice remains available for signed-in learners and school students after the diagnostic funnel.</p>
            {isLoading ? <p style={{ color: '#64748b' }}>Loading practice…</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.65rem' }}>
              <button onClick={() => openTask('/ielts/trial-test', !isPrimeUser)} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', fontWeight: 800, cursor: 'pointer' }}>Prime Listening Test 1</button>
              {readingSets.slice(0, 3).map((set, index) => <button key={set.id} onClick={() => openTask(`/ielts/reading/${set.id}`, !canAccessRequiredTier(set.required_tier) || (!isPrimeUser && index > 0 && !set.required_tier))} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #bae6fd', background: '#f0f9ff', color: '#075985', textAlign: 'left', cursor: 'pointer' }}>{set.title}</button>)}
              {writingTasks.slice(0, 2).map((task, index) => <button key={task.id} onClick={() => openTask(`/ielts/writing/${task.id}`, !canAccessRequiredTier(task.required_tier) || (!isPrimeUser && index > 0 && !task.required_tier))} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', textAlign: 'left', cursor: 'pointer' }}>{task.title}</button>)}
              {speakingTasks.slice(0, 2).map((task, index) => <button key={task.id} onClick={() => openTask(`/ielts/speaking/${task.id}`, !canAccessRequiredTier(task.required_tier) || (!isPrimeUser && index > 0 && !task.required_tier))} style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', textAlign: 'left', cursor: 'pointer' }}>Speaking Part {task.part}</button>)}
            </div>}
          </details>
        ))}

        <button onClick={() => navigate('/')} style={{ width: '100%', padding: '0.75rem', background: '#ffffff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '0.75rem', cursor: 'pointer', fontWeight: 700 }}>← Back to Brain Heist Game</button>
      </main>
    </div>
  );

};

export default IeltsHome;
