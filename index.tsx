import React, { Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import BrainsLoader from './components/BrainsLoader';
import LoginLaunchpad from './components/LoginLaunchpad';
import type { Session } from '@supabase/supabase-js';
import { sameBootstrapAuthority, type AuthBootstrap } from './src/lib/authBootstrap';
import { getAuthBootstrap, clearAuthBootstrap } from './services/authBootstrapService';
import { BAN_MESSAGE, storeBanMessage } from './services/banMessage';
import App, { preloadAccountWorkspace } from './App';
import LoginView from './components/LoginView';
import ErrorBoundary from './components/ErrorBoundary';
import ConfigErrorScreen from './components/ConfigErrorScreen';
import * as AuthService from './services/authService';
import { supabase, isMissingSupabaseConfig } from './services/supabaseClient';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { LightModeProvider } from './src/contexts/LightModeContext';
import './src/index.css';
import './src/styles/light-mode.css';
import './src/styles/platform-light-theme.css';
import { createBrowserRouter, Navigate, RouterProvider, useNavigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazyRetry } from './src/utils/lazyRetry';
import OnboardingRouteGate from './components/onboarding/OnboardingRouteGate';
import { getOnboardingState, readOnboardingResolution, fetchOnboardingProfile } from './src/features/onboarding/onboardingService';
import { isActiveLearnerFtue } from './src/features/onboarding/ftueTakeover';
import { buildSetupProfileFallback } from './src/features/onboarding/setupCompletion';
import { isOnboardingDebugEnabled, logOnboardingDebug } from './src/features/onboarding/featureFlags';
import type { Profile } from './types';
import { isAuthCallbackPath, isResumeEvent, resolvePostAuthPath, shouldUseGlobalAuthLoader } from './src/lib/authFlowGuards';
import { readIeltsPracticeAssignmentContext } from './src/pages/ielts/assignmentPracticeUi';
import { checkIeltsPracticeAccess, type IeltsPracticeSkill } from './services/ieltsService';
import SchoolProgrammeRouteGuard from './components/SchoolProgrammeRouteGuard';

// ── Lazy-loaded pages & modals (with automatic retry on stale-chunk errors) ──
const FinishSetupModal = lazyRetry(() => import('./components/FinishSetupModal'), 'FinishSetupModal');
const EntryScreen = lazyRetry(() => import('./components/onboarding/EntryScreen'), 'EntryScreen');
const SetupWizard = lazyRetry(() => import('./components/onboarding/SetupWizard'), 'SetupWizard');
const EmailVerificationScreen = lazyRetry(() => import('./components/EmailVerificationScreen'), 'EmailVerificationScreen');
const IELTSApp = lazyRetry(() => import('./components/ielts/IELTSApp'), 'IELTSApp');
const IELTSLoginView = lazyRetry(() => import('./components/ielts/IELTSLoginView'), 'IELTSLoginView');
const PasswordResetPage = lazyRetry(() => import('./components/PasswordResetPage'), 'PasswordResetPage');
const AuthCallback = lazyRetry(() => import('./src/pages/auth/callback'), 'AuthCallback');
const IeltsHome = lazyRetry(() => import('./src/pages/ielts/IeltsHome'), 'IeltsHome');
const IeltsProgrammeWorkspace = lazyRetry(() => import('./src/pages/ielts/IeltsProgrammeWorkspace'), 'IeltsProgrammeWorkspace');
const IeltsGovernedScreenerResult = lazyRetry(() => import('./src/pages/ielts/IeltsGovernedScreenerResult'), 'IeltsGovernedScreenerResult');
const IeltsAssignedPractice = lazyRetry(() => import('./src/pages/ielts/IeltsAssignedPractice'), 'IeltsAssignedPractice');
const IeltsJourneyDashboard = lazyRetry(() => import('./src/pages/ielts/IeltsJourneyDashboard'), 'IeltsJourneyDashboard');
const IeltsSession = lazyRetry(() => import('./src/pages/ielts/IeltsSession'), 'IeltsSession');
const ReadingPractice = lazyRetry(() => import('./src/pages/ielts/ReadingPractice'), 'ReadingPractice');
const SpeakingPractice = lazyRetry(() => import('./src/pages/ielts/SpeakingPractice'), 'SpeakingPractice');
const ListeningPractice = lazyRetry(() => import('./src/pages/ielts/ListeningPractice'), 'ListeningPractice');
const WritingPractice = lazyRetry(() => import('./src/pages/ielts/WritingPractice'), 'WritingPractice');
const TrialListeningTest = lazyRetry(() => import('./src/pages/ielts/TrialListeningTest'), 'TrialListeningTest');
const TrialListeningTask2 = lazyRetry(() => import('./src/pages/ielts/TrialListeningTask2'), 'TrialListeningTask2');
const IeltsPrime = lazyRetry(() => import('./src/pages/ielts/IeltsPrime'), 'IeltsPrime');
const IeltsAdminGuard = lazyRetry(() => import('./components/ielts/IeltsAdminGuard'), 'IeltsAdminGuard');
const IeltsExamModeAdminGuard = lazyRetry(() => import('./components/ielts/IeltsExamModeAdminGuard'), 'IeltsExamModeAdminGuard');
const IeltsAdminDashboard = lazyRetry(() => import('./components/IeltsAdminDashboard'), 'IeltsAdminDashboard');
const IeltsFunnelAnalytics = lazyRetry(() => import('./src/pages/ielts/IeltsFunnelAnalytics'), 'IeltsFunnelAnalytics');
const IeltsExamMode = lazyRetry(() => import('./src/pages/ielts/IeltsExamMode'), 'IeltsExamMode');
const IeltsExamMonitor = lazyRetry(() => import('./src/pages/ielts/IeltsExamMonitor'), 'IeltsExamMonitor');
const IeltsExamManager = lazyRetry(() => import('./src/pages/ielts/IeltsExamManager'), 'IeltsExamManager');
const IeltsWritingDraftPreview = lazyRetry(() => import('./src/pages/ielts/IeltsWritingDraftPreview'), 'IeltsWritingDraftPreview');
const IeltsWritingScreenerReview = lazyRetry(() => import('./src/pages/ielts/IeltsWritingScreenerReview'), 'IeltsWritingScreenerReview');
const IeltsSpeakingPilot = lazyRetry(() => import('./src/pages/ielts/IeltsSpeakingPilot'), 'IeltsSpeakingPilot');
const IeltsReviewQueue = lazyRetry(() => import('./src/pages/ielts/IeltsReviewQueue'), 'IeltsReviewQueue');
const IeltsSubmissionReview = lazyRetry(() => import('./src/pages/ielts/IeltsSubmissionReview'), 'IeltsSubmissionReview');
const IeltsReviewResult = lazyRetry(() => import('./src/pages/ielts/IeltsReviewResult'), 'IeltsReviewResult');
const SchoolAdminIeltsRoute = lazyRetry(() => import('./components/ielts/SchoolAdminIeltsRoute'), 'SchoolAdminIeltsRoute');
const IeltsObjectiveResult = lazyRetry(() => import('./src/pages/ielts/IeltsObjectiveResult'), 'IeltsObjectiveResult');
const IeltsReviewAdminGuard = lazyRetry(() => import('./components/ielts/IeltsReviewAdminGuard'), 'IeltsReviewAdminGuard');
const IeltsExtraPracticeGuard = lazyRetry(() => import('./src/pages/ielts/IeltsExtraPracticeGuard'), 'IeltsExtraPracticeGuard');
const BookedDemoPage = lazyRetry(() => import('./src/pages/BookedDemoPage'), 'BookedDemoPage');
const PresentationPage = lazyRetry(() => import('./src/pages/PresentationPage'), 'PresentationPage');

const queryClient = new QueryClient();

const withSchoolIeltsAccess = (element: React.ReactElement, lockedFallback?: React.ReactElement): React.ReactElement => (
  <SchoolProgrammeRouteGuard programme="ielts" lockedFallback={lockedFallback}>{element}</SchoolProgrammeRouteGuard>
);

const IeltsPracticeRouteGuard: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const assignmentContext = readIeltsPracticeAssignmentContext();
  const navigate = useNavigate();
  const params = useParams();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const skill: IeltsPracticeSkill = pathname.includes('/ielts/listening/')
    ? 'listening'
    : pathname.includes('/ielts/writing/')
      ? 'writing'
      : pathname.includes('/ielts/speaking/')
        ? 'speaking'
        : 'reading';
  const rawTaskId = params.setId ?? params.taskId;
  const taskId = rawTaskId ? Number(rawTaskId) : NaN;
  const [state, setState] = useState<{ loading: boolean; allowed: boolean; reason?: string }>({ loading: true, allowed: false });

  useEffect(() => {
    let active = true;
    if (!Number.isFinite(taskId)) {
      setState({ loading: false, allowed: false, reason: 'not_found' });
      return () => { active = false; };
    }

    void checkIeltsPracticeAccess(skill, taskId)
      .then((access) => {
        if (!active) return;
        if (access.allowed) {
          setState({ loading: false, allowed: true });
          return;
        }
        setState({ loading: false, allowed: false, reason: access.reason });
        if (access.reason === 'prime_required') {
          navigate('/ielts/apply-prime', { replace: true });
        }
      })
      .catch(() => {
        if (!active) return;
        setState({ loading: false, allowed: false, reason: 'error' });
      });

    return () => { active = false; };
  }, [navigate, skill, taskId]);

  if (state.loading) {
    return <div style={{ padding: '1rem' }}>Checking IELTS access…</div>;
  }

  if (!state.allowed) {
    if (state.reason === 'prime_required') return null;
    return <div style={{ padding: '1.5rem', maxWidth: 640, margin: '2rem auto', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, color: '#9a3412' }}>This IELTS task is not available.</div>;
  }

  if (assignmentContext.isAssignedPractice) {
    return children;
  }

  return <IeltsExtraPracticeGuard>{children}</IeltsExtraPracticeGuard>;
};

// Some legacy code paths (and certain mobile browsers) attempt to read a global
// `profile` variable when the heavy “full mode” UI is enabled. Define a harmless
// default to prevent ReferenceError crashes before React mounts.
if (typeof window !== 'undefined' && typeof (window as any).profile === 'undefined') {
  (window as any).profile = null;
}

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return (await Promise.race([promise, timeoutPromise])) as T;
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
};

const ProtectedRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-heading text-2xl animate-pulse" style={{ color: 'var(--ion-blue)' }}>
          Initializing Heist OS...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<BrainsLoader message="Loading..." />}>
        <IELTSLoginView onAuthenticated={() => setIsAuthenticated(true)} />
      </Suspense>
    );
  }

  return <Suspense fallback={<BrainsLoader message="Loading..." />}>{element}</Suspense>;
};


const MinimalFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="skeleton-bone h-6 w-40 rounded-xl bg-white/10" />
  </div>
);

const MIN_RESUME_HIDDEN_MS = 45_000;
const MIN_RESUME_REFRESH_INTERVAL_MS = 60_000;
const RESUME_DEBOUNCE_MS = 300;
const SESSION_EXPIRY_WINDOW_MS = 5 * 60_000;
const PROFILE_STALE_MS = 5 * 60_000;

const Main: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupUsername, setSetupUsername] = useState<string | undefined>();
  const [postSetupProfile, setPostSetupProfile] = useState<Partial<Profile> | null>(null);
  const [postSetupDebugSnapshot, setPostSetupDebugSnapshot] = useState<Record<string, unknown> | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<AuthBootstrap | null>(null);
  const loginInFlightRef = useRef(false);
  const activeUserRef = useRef<string | null>(null);
  const pendingBootstrapUserRef = useRef<string | null>(null);
  const [showEntryScreen, setShowEntryScreen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<'brains-heist' | 'ielts' | null>(null);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const authRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const authSequenceRef = useRef(0);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const lastHiddenAtRef = useRef<number | null>(null);
  const lastResumeRefreshAtRef = useRef(0);
  const lastSuccessfulAuthRefreshAtRef = useRef(0);
  const resumeDebounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const logAuthFlow = useCallback((message: string, details?: Record<string, unknown>) => {
    if (!import.meta.env.DEV) return;
    console.info(`[auth-flow] ${message}`, details ?? '');
  }, []);

  const setLoading = useCallback((next: boolean, reason: string) => {
    logAuthFlow('loading state transition', { next, reason });
    setIsLoading(next);
  }, [logAuthFlow]);

  const resolveCallbackRoute = useCallback((authenticated: boolean, reason: string) => {
    if (typeof window === 'undefined' || !isAuthCallbackPath(window.location.pathname)) return;

    logAuthFlow('callback route resolution', {
      authenticated,
      reason,
      pathname: window.location.pathname,
      hashPresent: Boolean(window.location.hash),
    });

    if (authenticated) {
      window.history.replaceState({}, '', resolvePostAuthPath(window.location.pathname));
    }
  }, [logAuthFlow]);

  // One server-authoritative snapshot owns setup, verification and routing.
  const checkAuthAndSetup = useCallback(async (options?: { reason?: string; globalLoader?: boolean; session?: Session }) => {
    const reason = options?.reason ?? 'manual';
    const sequence = ++authSequenceRef.current;
    if (options?.globalLoader !== false) setLoading(true, `${reason}:start`);
    setInitError(null);
    try {
      const session = options?.session ?? (await withTimeout(supabase.auth.getSession(), 15000, 'Session check')).data.session;
      if (sequence !== authSequenceRef.current) return;
      if (!session) {
        clearAuthBootstrap(); activeUserRef.current = null;
        setBootstrap(null); setIsAuthenticated(false); setNeedsSetup(false); setNeedsEmailVerification(false);
        return;
      }
      pendingBootstrapUserRef.current = session.user.id;
      const result = await getAuthBootstrap(session);
      if (sequence !== authSequenceRef.current) return;
      if (result.is_banned) {
        storeBanMessage(BAN_MESSAGE); setBootstrap(null);
        await AuthService.logout(); return;
      }
      activeUserRef.current = result.user_id;
      isAuthenticatedRef.current = true;
      preloadAccountWorkspace(result);
      setBootstrap(current => options?.globalLoader === false && current && sameBootstrapAuthority(current, result) ? current : result);
      setIsAuthenticated(true);
      setUserEmail(result.email ?? session.user.email);
      setNeedsEmailVerification(!result.email_verified);
      setNeedsSetup(result.email_verified && result.needs_setup);
      setSetupUsername(result.profile?.username);
      if (result.needs_setup) setPostSetupProfile(null);
      resolveCallbackRoute(true, reason);
      lastSuccessfulAuthRefreshAtRef.current = Date.now();
    } catch (error) {
      if (sequence !== authSequenceRef.current) return;
      // Never fall through to a guessed dashboard after a failed authority read.
      setBootstrap(null);
      setInitError(error instanceof Error ? error.message : 'Unable to open your account. Please retry.');
    } finally {
      if (sequence === authSequenceRef.current) {
        pendingBootstrapUserRef.current = null;
        setLoading(false, `${reason}:end`);
      }
    }
  }, [resolveCallbackRoute, setLoading]);

  useEffect(() => {
    void checkAuthAndSetup({ reason: 'initial', globalLoader: true });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      logAuthFlow('auth state change', { event, hasSession: Boolean(session) });
      // Initial getSession owns startup; password login supplies its own session.
      if (event === 'INITIAL_SESSION' || loginInFlightRef.current && event === 'SIGNED_IN') return;
      if (!session) {
        ++authSequenceRef.current; clearAuthBootstrap(); activeUserRef.current = null; pendingBootstrapUserRef.current = null;
        isAuthenticatedRef.current = false;
        setBootstrap(null); setPostSetupProfile(null); setIsAuthenticated(false);
        setNeedsSetup(false); setNeedsEmailVerification(false); setInitError(null);
        setLoading(false, `auth-state:${event}:signed-out`);
        return;
      }
      const sameAccount = activeUserRef.current === session.user.id;
      if (sameAccount && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) return;
      const globalLoader = !sameAccount || shouldUseGlobalAuthLoader(event, isAuthenticatedRef.current);
      const sequence = authSequenceRef.current;
      // Leave Supabase's auth callback before any further Supabase call.
      window.setTimeout(() => {
        if (sequence !== authSequenceRef.current) return;
        // The initial bootstrap may have resolved since this event was queued.
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')
          && (activeUserRef.current === session.user.id || pendingBootstrapUserRef.current === session.user.id)) return;
        void checkAuthAndSetup({ reason: `auth-state:${event}`, globalLoader, session });
      }, 0);
    });

    const runResumeRefreshIfNeeded = async (trigger: string) => {
      const now = Date.now();
      const hiddenDurationMs = lastHiddenAtRef.current ? now - lastHiddenAtRef.current : null;
      const sinceResumeRefreshMs = now - lastResumeRefreshAtRef.current;
      const sinceAuthRefreshMs = now - lastSuccessfulAuthRefreshAtRef.current;
      const isCallbackRoute = typeof window !== 'undefined' && isAuthCallbackPath(window.location.pathname);

      if (authRefreshInFlightRef.current || pendingBootstrapUserRef.current) {
        logAuthFlow('resume refresh skipped; already in flight', { trigger });
        return;
      }

      if (!isCallbackRoute && sinceResumeRefreshMs < MIN_RESUME_REFRESH_INTERVAL_MS) {
        logAuthFlow('resume refresh skipped; throttled', {
          trigger,
          sinceResumeRefreshMs,
          minIntervalMs: MIN_RESUME_REFRESH_INTERVAL_MS,
        });
        return;
      }

      if (!isCallbackRoute && hiddenDurationMs !== null && hiddenDurationMs < MIN_RESUME_HIDDEN_MS) {
        logAuthFlow('resume refresh skipped; tab was hidden briefly', {
          trigger,
          hiddenDurationMs,
          minHiddenMs: MIN_RESUME_HIDDEN_MS,
          sinceAuthRefreshMs,
        });
        return;
      }

      let sessionExpiresSoon = false;
      let hasSession = isAuthenticatedRef.current;
      try {
        const result = await withTimeout(supabase.auth.getSession(), 2500, 'resume getSession');
        const session = result.data?.session;
        hasSession = Boolean(session);
        const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : null;
        sessionExpiresSoon = Boolean(expiresAtMs && expiresAtMs - now <= SESSION_EXPIRY_WINDOW_MS);
      } catch (sessionErr) {
        logAuthFlow('resume getSession check failed; falling back to staleness rules', {
          trigger,
          error: sessionErr instanceof Error ? sessionErr.message : String(sessionErr),
        });
      }

      const profileStale = sinceAuthRefreshMs >= PROFILE_STALE_MS;
      const hiddenExceededThreshold = hiddenDurationMs !== null && hiddenDurationMs >= MIN_RESUME_HIDDEN_MS;
      const shouldRefresh = isCallbackRoute || !hasSession || sessionExpiresSoon || profileStale || hiddenExceededThreshold;

      if (!shouldRefresh) {
        logAuthFlow('resume refresh skipped; session/profile still fresh', {
          trigger,
          hiddenDurationMs,
          sinceAuthRefreshMs,
          sessionExpiresSoon,
          hasSession,
        });
        return;
      }

      lastResumeRefreshAtRef.current = now;
      logAuthFlow('resume refresh run silently', {
        trigger,
        hiddenDurationMs,
        sinceAuthRefreshMs,
        sessionExpiresSoon,
        hasSession,
        isCallbackRoute,
      });

      const refreshPromise = checkAuthAndSetup({ reason: `resume:${trigger}`, globalLoader: false });
      authRefreshInFlightRef.current = refreshPromise;
      void refreshPromise.finally(() => {
        if (authRefreshInFlightRef.current === refreshPromise) {
          authRefreshInFlightRef.current = null;
        }
      });
    };

    const refreshAfterResume = (event: Event) => {
      const now = Date.now();
      const visibilityState = typeof document === 'undefined' ? 'unknown' : document.visibilityState;

      logAuthFlow('visibilitychange/focus', {
        event: event.type,
        visibilityState,
      });

      if (event.type === 'visibilitychange' && visibilityState === 'hidden') {
        lastHiddenAtRef.current = now;
        logAuthFlow('resume hidden timestamp recorded', { lastHiddenAt: now });
        return;
      }

      if (!isResumeEvent(event)) return;

      if (resumeDebounceTimerRef.current !== null) {
        window.clearTimeout(resumeDebounceTimerRef.current);
      }

      resumeDebounceTimerRef.current = window.setTimeout(() => {
        resumeDebounceTimerRef.current = null;
        void runResumeRefreshIfNeeded(event.type);
      }, RESUME_DEBOUNCE_MS);
    };

    document.addEventListener('visibilitychange', refreshAfterResume);
    window.addEventListener('focus', refreshAfterResume);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', refreshAfterResume);
      window.removeEventListener('focus', refreshAfterResume);
      if (resumeDebounceTimerRef.current !== null) {
        window.clearTimeout(resumeDebounceTimerRef.current);
      }
    };
  }, [checkAuthAndSetup, logAuthFlow, resolveCallbackRoute, setLoading]);

  const handleLogin = useCallback(async (email: string, pass: string) => {
    if (loginInFlightRef.current) return;
    loginInFlightRef.current = true;
    try {
      const { session } = await AuthService.login(email, pass);
      await checkAuthAndSetup({ reason: 'password-login', session });
    } finally { loginInFlightRef.current = false; }
  }, [checkAuthAndSetup]);

  const handleLogout = useCallback(async () => {
    ++authSequenceRef.current; clearAuthBootstrap(); setBootstrap(null); setInitError(null);
    await AuthService.logout();
    // Immediately set to false - the auth state change will confirm
    setIsAuthenticated(false);
    setNeedsSetup(false);
    setPostSetupProfile(null);
    setPostSetupDebugSnapshot(null);
  }, []);

  const handleSetupComplete = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const selectedRole = (() => {
      try {
        const role = window.sessionStorage.getItem('brains_heist_last_setup_role');
        if (role) return role;
        if (!isOnboardingDebugEnabled()) return null;
        const raw = window.sessionStorage.getItem('brains_heist_last_setup_ftue_debug');
        return raw ? (JSON.parse(raw) as { selectedRole?: unknown }).selectedRole ?? null : null;
      } catch {
        return null;
      }
    })();
    const savedProfileFromRead = user?.id ? await fetchOnboardingProfile(user.id) : null;
    const onboardingRow = user?.id ? await getOnboardingState(user.id) : null;
    const savedProfile = savedProfileFromRead ?? buildSetupProfileFallback({
      userId: user?.id,
      selectedRole: typeof selectedRole === 'string' ? selectedRole : null,
      onboardingState: onboardingRow,
    });
    const resolverResult = await readOnboardingResolution({
      userId: user?.id,
      profile: savedProfile,
    });
    const shouldRenderLearnerShell = isActiveLearnerFtue(resolverResult);
    const snapshot = {
      selectedRole,
      savedProfileRole: savedProfile?.role ?? null,
      profile_fallback_used: !savedProfileFromRead && Boolean(savedProfile),
      needs_setup: savedProfile?.needs_setup ?? null,
      school_id: savedProfile?.school_id ?? null,
      tutorial_completed: savedProfile?.tutorial_completed ?? null,
      onboarding_row_after_seed: onboardingRow ? {
        segment: onboardingRow.segment,
        current_step: onboardingRow.current_step,
        core_completed_at: onboardingRow.core_completed_at,
        completed_steps: onboardingRow.completed_steps,
      } : null,
      resolver_result: {
        segment: resolverResult.segment,
        eligible: resolverResult.eligible,
        isComplete: resolverResult.isComplete,
        current_step: resolverResult.state?.current_step ?? resolverResult.nextStep,
        reason: resolverResult.reason,
      },
      shouldRenderLearnerShell,
    };

    logOnboardingDebug('[ftue:setup-complete:main-refresh]', snapshot);
    setPostSetupProfile(savedProfile);
    setPostSetupDebugSnapshot(isOnboardingDebugEnabled() ? snapshot : null);
    await checkAuthAndSetup({ reason: 'setup-complete' });
  }, [checkAuthAndSetup]);

  if (isLoading) {
    return <LoginLaunchpad />;
  }

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-2xl border border-red-500/40 bg-black/40 p-6 text-center">
          <div className="font-heading text-2xl" style={{ color: 'var(--ion-blue)' }}>
            Initialization failed
          </div>
          <div className="mt-2 text-sm text-gray-300 break-words">{initError}</div>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              onClick={() => {
                setIsLoading(true);
                void checkAuthAndSetup();
              }}
            >
              Retry
            </button>
            <button
              className="rounded-lg bg-gray-700 px-4 py-2 text-white hover:bg-gray-600"
              onClick={() => void handleLogout()}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Entry screen for first-time visitors (before auth)
  if (!isAuthenticated && showEntryScreen && !selectedApp) {
    return (
      <Suspense fallback={<MinimalFallback />}>
        <EntryScreen
          onSelectBrainsHeist={() => {
            setSelectedApp('brains-heist');
            setShowEntryScreen(false);
          }}
          onSelectIELTS={() => {
            setSelectedApp('ielts');
            setShowEntryScreen(false);
            // Redirect to IELTS app
            window.location.href = '/ielts';
          }}
        />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
  }

  // Show email verification screen if email is not verified
  if (isAuthenticated && needsEmailVerification && userEmail) {
    return (
      <Suspense fallback={<MinimalFallback />}>
        <EmailVerificationScreen
          email={userEmail}
          onVerified={() => {
            setNeedsEmailVerification(false);
            // Trigger auth check to continue to setup or app
            checkAuthAndSetup();
          }}
        />
      </Suspense>
    );
  }

  // Show NEW setup wizard for users who need setup
  if (needsSetup) {
    return (
      <Suspense fallback={<MinimalFallback />}>
        <SetupWizard 
          onComplete={handleSetupComplete}
          onLogout={handleLogout}
          initialUsername={setupUsername}
        />
      </Suspense>
    );
  }

  if (!bootstrap) return <LoginLaunchpad />;

  return (
    <>
      {isOnboardingDebugEnabled() && postSetupDebugSnapshot && (
        <details className="fixed bottom-3 left-3 z-[100000] max-w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-cyan-300/40 bg-slate-950/95 p-3 text-xs text-cyan-50 shadow-2xl shadow-cyan-950/40">
          <summary className="cursor-pointer font-semibold">FTUE setup debug snapshot</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-200">
            {JSON.stringify(postSetupDebugSnapshot, null, 2)}
          </pre>
        </details>
      )}
      <OnboardingRouteGate observeOnly={false} profile={bootstrap?.profile ?? postSetupProfile}>
        <App key={bootstrap?.user_id} onLogout={handleLogout} initialBootstrap={bootstrap!} />
      </OnboardingRouteGate>
    </>
  );
};

const IELTSMain: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthenticated = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  }, []);

  if (isLoading) {
    return <BrainsLoader message="Loading IELTS Hub..." size={180} />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<BrainsLoader message="Loading IELTS..." />}>
        <IELTSLoginView onAuthenticated={handleAuthenticated} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<BrainsLoader message="Loading IELTS..." />}>
      <IELTSApp onLogout={handleLogout} />
    </Suspense>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);

// Create router with IELTS routes
const router = createBrowserRouter([
  {
    path: '/presentation',
    element: <Suspense fallback={<BrainsLoader message="Loading Brains Heist presentation…" />}><PresentationPage /></Suspense>,
  },
  {
    path: '/booked',
    element: <Suspense fallback={<BrainsLoader message="Preparing your school demo…" />}><BookedDemoPage /></Suspense>,
  },
  {
    path: '/auth/callback',
    element: <Suspense fallback={<MinimalFallback />}><AuthCallback /></Suspense>,
  },
  {
    path: '/auth/reset',
    element: <Suspense fallback={<MinimalFallback />}><PasswordResetPage /></Suspense>,
  },
  {
    path: '/ielts',
    element: withSchoolIeltsAccess(<IeltsHome />, <ProtectedRoute element={<TrialListeningTask2 />} />),
  },
  {
    path: '/ielts/practice/assigned',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<IeltsAssignedPractice />} />),
  },
  { path: '/ielts/programme', element: <ProtectedRoute element={<SchoolAdminIeltsRoute ieltsTab="ielts-overview"><IeltsProgrammeWorkspace /></SchoolAdminIeltsRoute>} /> },
  { path: '/ielts/screener-result/:attemptId', element: <ProtectedRoute element={<IeltsGovernedScreenerResult />} /> },
  {
    path: '/ielts/journey',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<SchoolAdminIeltsRoute ieltsTab="ielts-student-progress"><IeltsJourneyDashboard /></SchoolAdminIeltsRoute>} />),
  },
  {
    path: '/ielts/admin',
    element: (
      <ProtectedRoute
        element={(
          <IeltsAdminGuard>
            <IeltsAdminDashboard />
          </IeltsAdminGuard>
        )}
      />
    ),
  },
  {
    path: '/ielts/funnel',
    element: (
      <ProtectedRoute
        element={(<IeltsAdminGuard>
            <IeltsFunnelAnalytics />
          </IeltsAdminGuard>
        )}
      />
    ),
  },
  {
    path: '/ielts/trial-test',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<IeltsExtraPracticeGuard><TrialListeningTest /></IeltsExtraPracticeGuard>} />),
  },
  {
    path: '/ielts/trial-test-2',
    element: <ProtectedRoute element={<TrialListeningTask2 />} />,
  },
  {
    path: '/ielts/listening-screener',
    element: <ProtectedRoute element={<TrialListeningTask2 />} />,
  },
  {
    path: '/ielts/writing-screener',
    element: <ProtectedRoute element={<TrialListeningTask2 skill="writing" />} />,
  },
  {
    path: '/ielts/writing-screener/preview',
    element: <ProtectedRoute element={<IeltsReviewAdminGuard><IeltsWritingDraftPreview /></IeltsReviewAdminGuard>} />,
  },
  {
    path: '/ielts/writing-screener/reviews',
    element: <ProtectedRoute element={<IeltsWritingScreenerReview />} />,
  },
  {
    path: '/ielts/writing-screener/reviews/:attemptId',
    element: <ProtectedRoute element={<IeltsWritingScreenerReview />} />,
  },
  { path: '/ielts/speaking-pilot', element: <ProtectedRoute element={<IeltsSpeakingPilot />} /> },
  { path: '/ielts/speaking-interviews', element: <ProtectedRoute element={<IeltsSpeakingPilot />} /> },
  { path: '/ielts/speaking-pilot/:sessionId', element: <ProtectedRoute element={<IeltsSpeakingPilot />} /> },
  {
    path: '/ielts/reading-screener',
    element: <ProtectedRoute element={<TrialListeningTask2 skill="reading" />} />,
  },
  {
    path: '/ielts/apply-prime',
    element: withSchoolIeltsAccess(<IeltsPrime />),
  },
  {
    path: '/ielts/exams/manage',
    element: (
      <ProtectedRoute
        element={(
          <SchoolAdminIeltsRoute ieltsTab="ielts-exams">
            <IeltsExamModeAdminGuard><IeltsExamManager /></IeltsExamModeAdminGuard>
          </SchoolAdminIeltsRoute>
        )}
      />
    ),
  },
  {
    path: '/ielts/reviews',
    element: (
      <ProtectedRoute
        element={(
          <SchoolAdminIeltsRoute ieltsTab="ielts-reviews">
            <IeltsReviewAdminGuard><IeltsReviewQueue /></IeltsReviewAdminGuard>
          </SchoolAdminIeltsRoute>
        )}
      />
    ),
  },
  {
    path: '/ielts/reviews/:skill/:attemptId',
    element: (
      <ProtectedRoute
        element={(
          <SchoolAdminIeltsRoute ieltsTab="ielts-reviews" reviewFromRoute>
            <IeltsReviewAdminGuard><IeltsSubmissionReview /></IeltsReviewAdminGuard>
          </SchoolAdminIeltsRoute>
        )}
      />
    ),
  },
  {
    path: '/ielts/review-result/:skill/:attemptId',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<IeltsReviewResult />} />),
  },
  {
    path: '/ielts/:skill/result/:attemptId',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<IeltsObjectiveResult />} />),
  },
  {
    path: '/ielts/exam/:examEventId/monitor',
    element: (
      <ProtectedRoute
        element={(
          <SchoolAdminIeltsRoute ieltsTab="ielts-exams" monitorFromRoute>
            <IeltsExamModeAdminGuard><IeltsExamMonitor /></IeltsExamModeAdminGuard>
          </SchoolAdminIeltsRoute>
        )}
      />
    ),
  },
  {
    path: '/ielts/exam/:examEventId',
    element: <ProtectedRoute element={<IeltsExamMode />} />,
  },
  {
    path: '/ielts/reading/:setId',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<IeltsPracticeRouteGuard><ReadingPractice /></IeltsPracticeRouteGuard>} />),
  },
  {
    path: '/ielts/listening/:setId',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<IeltsPracticeRouteGuard><ListeningPractice /></IeltsPracticeRouteGuard>} />),
  },
  {
    path: '/ielts/writing/:taskId',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<IeltsPracticeRouteGuard><WritingPractice /></IeltsPracticeRouteGuard>} />),
  },
  {
    path: '/ielts/speaking/:taskId',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<IeltsPracticeRouteGuard><SpeakingPractice /></IeltsPracticeRouteGuard>} />),
  },
  {
    path: '/ielts/session/:sessionId',
    element: withSchoolIeltsAccess(<ProtectedRoute element={<IeltsSession />} />),
  },
  {
    path: '*',
    element: <Main />,
  },
]);

// Render the main app with routing for all paths
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {isMissingSupabaseConfig ? (
        <ConfigErrorScreen />
      ) : (
        <QueryClientProvider client={queryClient}>
          <LightModeProvider>
            <LanguageProvider><RouterProvider router={router} /></LanguageProvider>
          </LightModeProvider>
        </QueryClientProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
