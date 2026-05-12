import React, { Suspense, useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import BrainsLoader from './components/BrainsLoader';
import WhoAreYou from './components/WhoAreYou';
import App from './App';
import LoginView from './components/LoginView';
import ErrorBoundary from './components/ErrorBoundary';
import ConfigErrorScreen from './components/ConfigErrorScreen';
import * as AuthService from './services/authService';
import { supabase, isMissingSupabaseConfig } from './services/supabaseClient';
import { LightModeProvider } from './src/contexts/LightModeContext';
import './src/index.css';
import './src/styles/light-mode.css';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazyRetry } from './src/utils/lazyRetry';
import OnboardingRouteGate from './components/onboarding/OnboardingRouteGate';
import { decideNeedsSetup } from './src/features/onboarding/setupStatus';
import { getOnboardingState, readOnboardingResolution, fetchOnboardingProfile } from './src/features/onboarding/onboardingService';
import { isActiveLearnerFtue } from './src/features/onboarding/ftueTakeover';
import { ONBOARDING_PROFILE_SELECT } from './src/features/onboarding/profileSelect';
import { buildSetupProfileFallback } from './src/features/onboarding/setupCompletion';
import { isOnboardingDebugEnabled, logOnboardingDebug } from './src/features/onboarding/featureFlags';
import type { Profile } from './types';

// ── Lazy-loaded pages & modals (with automatic retry on stale-chunk errors) ──
const FinishSetupModal = lazyRetry(() => import('./components/FinishSetupModal'), 'FinishSetupModal');
const EntryScreen = lazyRetry(() => import('./components/onboarding/EntryScreen'), 'EntryScreen');
const SetupWizard = lazyRetry(() => import('./components/onboarding/SetupWizard'), 'SetupWizard');
const EmailVerificationScreen = lazyRetry(() => import('./components/EmailVerificationScreen'), 'EmailVerificationScreen');
const IELTSApp = lazyRetry(() => import('./components/ielts/IELTSApp'), 'IELTSApp');
const IELTSLoginView = lazyRetry(() => import('./components/ielts/IELTSLoginView'), 'IELTSLoginView');
const PasswordResetPage = lazyRetry(() => import('./components/PasswordResetPage'), 'PasswordResetPage');
const IeltsHome = lazyRetry(() => import('./src/pages/ielts/IeltsHome'), 'IeltsHome');
const IeltsSession = lazyRetry(() => import('./src/pages/ielts/IeltsSession'), 'IeltsSession');
const ReadingPractice = lazyRetry(() => import('./src/pages/ielts/ReadingPractice'), 'ReadingPractice');
const SpeakingPractice = lazyRetry(() => import('./src/pages/ielts/SpeakingPractice'), 'SpeakingPractice');
const ListeningPractice = lazyRetry(() => import('./src/pages/ielts/ListeningPractice'), 'ListeningPractice');
const WritingPractice = lazyRetry(() => import('./src/pages/ielts/WritingPractice'), 'WritingPractice');
const TrialListeningTest = lazyRetry(() => import('./src/pages/ielts/TrialListeningTest'), 'TrialListeningTest');
const TrialListeningTask2 = lazyRetry(() => import('./src/pages/ielts/TrialListeningTask2'), 'TrialListeningTask2');
const IeltsPrime = lazyRetry(() => import('./src/pages/ielts/IeltsPrime'), 'IeltsPrime');
const IeltsAdminGuard = lazyRetry(() => import('./components/ielts/IeltsAdminGuard'), 'IeltsAdminGuard');
const IeltsAdminDashboard = lazyRetry(() => import('./components/IeltsAdminDashboard'), 'IeltsAdminDashboard');

const queryClient = new QueryClient();

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


const readSetupProfileSnapshot = async (userId: string): Promise<Partial<Profile> | null> => {
  const { data, error } = await supabase
    .from('users')
    .select(ONBOARDING_PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[ftue:setup-status] failed to read profile snapshot:', error.message);
    return null;
  }

  return data as Partial<Profile> | null;
};

const resolveSetupDecision = async (status: AuthService.UserSetupStatus, email?: string | null) => {
  const shouldReadProfileSnapshot = Boolean(status.authenticated && status.needs_setup && status.user_id);
  const profileSnapshot = shouldReadProfileSnapshot ? await readSetupProfileSnapshot(status.user_id as string) : null;
  const decision = decideNeedsSetup({ status, profileNeedsSetup: profileSnapshot?.needs_setup });

  logOnboardingDebug('[ftue:setup-status]', {
    user_id: status.user_id ?? null,
    email: email ?? null,
    profile_role: profileSnapshot?.role ?? status.role ?? null,
    school_id: profileSnapshot?.school_id ?? status.school_id ?? null,
    tutorial_completed: profileSnapshot?.tutorial_completed ?? null,
    status_needs_setup: status.needs_setup,
    profile_needs_setup: profileSnapshot?.needs_setup ?? null,
    needsSetup: decision.needsSetup,
    decisionReason: decision.reason,
    statusReason: status.reason ?? null,
    has_role: status.has_role ?? null,
  });

  return decision.needsSetup;
};

const MinimalFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="skeleton-bone h-6 w-40 rounded-xl bg-white/10" />
  </div>
);

const Main: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupUsername, setSetupUsername] = useState<string | undefined>();
  const [postSetupProfile, setPostSetupProfile] = useState<Partial<Profile> | null>(null);
  const [postSetupDebugSnapshot, setPostSetupDebugSnapshot] = useState<Record<string, unknown> | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showEntryScreen, setShowEntryScreen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<'brains-heist' | 'ielts' | null>(null);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const MAX_RETRIES = 3;

  // Check authentication and setup status with robust timeout handling
  const checkAuthAndSetup = useCallback(async () => {
    try {
      setInitError(null);
      
      // Longer timeout for getSession - network can be slow
      let session;
      try {
        const result = await withTimeout(supabase.auth.getSession(), 15000, 'supabase.auth.getSession');
        session = result.data?.session;
      } catch (sessionErr) {
        console.warn('getSession timed out, checking if we have a cached session');
        // Try to get session from local storage as fallback
        const cachedSession = localStorage.getItem('sb-' + import.meta.env.VITE_SUPABASE_PROJECT_REF + '-auth-token');
        if (cachedSession) {
          try {
            const parsed = JSON.parse(cachedSession);
            session = parsed?.currentSession || parsed;
            console.log('Using cached session');
          } catch {
            session = null;
          }
        }
      }
      
      setIsAuthenticated(!!session);
      
      if (session) {
        // Check email verification status first
        try {
          const verificationStatus = await AuthService.checkEmailVerification();
          setUserEmail(verificationStatus.email);
          
          if (!verificationStatus.isVerified) {
            console.log('Email not verified, showing verification screen');
            setNeedsEmailVerification(true);
            setNeedsSetup(false);
          } else {
            setNeedsEmailVerification(false);
            
            // Check if user needs to complete profile setup - use short timeout
            try {
              // New accounts can take a few extra seconds while profile bootstrap
              // queries settle across regions; avoid noisy false timeout warnings.
              const status = await withTimeout(AuthService.checkUserSetupStatus(), 6000, 'check_user_setup_status');
              // Trust explicit public.users.needs_setup over role defaults. New
              // profiles may already have role='student' from DB/auth defaults,
              // but still must enter SetupWizard until needs_setup is cleared.
              const actuallyNeedsSetup = await resolveSetupDecision(status, session.user.email);
              setNeedsSetup(actuallyNeedsSetup);
              if (actuallyNeedsSetup) setPostSetupProfile(null);
              if (status.has_username) {
                setSetupUsername(status.username);
              }
            } catch (setupErr) {
              // If setup check fails but we have a valid session, DON'T assume needs setup
              // Instead, let them proceed and the app will handle missing data gracefully
              console.warn('Setup check failed, proceeding with session:', setupErr);
              setNeedsSetup(false); // Changed: Don't force setup on timeout
            }
          }
        } catch (verifyErr) {
          console.error('Email verification check failed:', verifyErr);
          // If check fails, proceed without blocking
          setNeedsEmailVerification(false);
        }
      } else {
        setNeedsSetup(false);
        setNeedsEmailVerification(false);
      }
      setRetryCount(0); // Reset on success
    } catch (err) {
      console.error('Auth check failed:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      // Auto-retry for timeout errors up to MAX_RETRIES
      if (errorMsg.includes('timed out') && retryCount < MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
        console.log(`Retrying auth check (${retryCount + 1}/${MAX_RETRIES})...`);
        setTimeout(() => checkAuthAndSetup(), 1000);
        return;
      }
      
      setInitError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [retryCount]);

  useEffect(() => {
    checkAuthAndSetup();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        setInitError(null);
        setIsAuthenticated(!!session);

        if (session) {
          setIsLoading(true);
          try {
            const verificationStatus = await AuthService.checkEmailVerification();
            setUserEmail(verificationStatus.email);

            if (!verificationStatus.isVerified) {
              setNeedsEmailVerification(true);
              setNeedsSetup(false);
            } else {
              setNeedsEmailVerification(false);
              const status = await AuthService.checkUserSetupStatus();
              // Role can be defaulted before setup is complete; use the
              // profile needs_setup flag to decide whether SetupWizard owns flow.
              const actuallyNeedsSetup = await resolveSetupDecision(status, session.user.email);
              setNeedsSetup(actuallyNeedsSetup);
              if (actuallyNeedsSetup) setPostSetupProfile(null);
              if (status.has_username) {
                setSetupUsername(status.username);
              }
            }
          } catch (authStateErr) {
            console.warn('Auth state setup check failed, proceeding with session:', authStateErr);
            setNeedsEmailVerification(false);
            setNeedsSetup(false);
          }
        } else {
          setNeedsSetup(false);
          setNeedsEmailVerification(false);
        }
      } catch (err) {
        console.error('Auth state change check failed:', err);
        setInitError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkAuthAndSetup]);

  const handleLogin = useCallback(async (email: string, pass: string) => {
    await AuthService.login(email, pass);
    // Force immediate state update and session check
    await checkAuthAndSetup();
  }, [checkAuthAndSetup]);

  const handleLogout = useCallback(async () => {
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
    setNeedsSetup(false);
  }, []);

  if (isLoading) {
    return <WhoAreYou />;
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
      <OnboardingRouteGate observeOnly={false} profile={postSetupProfile}>
        <App onLogout={handleLogout} />
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
    path: '/auth/reset',
    element: <Suspense fallback={<MinimalFallback />}><PasswordResetPage /></Suspense>,
  },
  {
    path: '/ielts',
    element: <ProtectedRoute element={<IeltsHome />} />,
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
    path: '/ielts/trial-test',
    element: <ProtectedRoute element={<TrialListeningTest />} />,
  },
  {
    path: '/ielts/trial-test-2',
    element: <ProtectedRoute element={<TrialListeningTask2 />} />,
  },
  {
    path: '/ielts/apply-prime',
    element: <ProtectedRoute element={<IeltsPrime />} />,
  },
  {
    path: '/ielts/reading/:setId',
    element: <ProtectedRoute element={<ReadingPractice />} />,
  },
  {
    path: '/ielts/listening/:setId',
    element: <ProtectedRoute element={<ListeningPractice />} />,
  },
  {
    path: '/ielts/writing/:taskId',
    element: <ProtectedRoute element={<WritingPractice />} />,
  },
  {
    path: '/ielts/speaking/:taskId',
    element: <ProtectedRoute element={<SpeakingPractice />} />,
  },
  {
    path: '/ielts/session/:sessionId',
    element: <ProtectedRoute element={<IeltsSession />} />,
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
            <RouterProvider router={router} />
          </LightModeProvider>
        </QueryClientProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
