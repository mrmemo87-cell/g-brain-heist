import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import BrainsLoader from './components/BrainsLoader';
import App from './App';
import LoginView from './components/LoginView';
import FinishSetupModal from './components/FinishSetupModal';
import EntryScreen from './components/onboarding/EntryScreen';
import SetupWizard from './components/onboarding/SetupWizard';
import EmailVerificationScreen from './components/EmailVerificationScreen';
import IELTSApp from './components/ielts/IELTSApp';
import IELTSLoginView from './components/ielts/IELTSLoginView';
import ErrorBoundary from './components/ErrorBoundary';
import ConfigErrorScreen from './components/ConfigErrorScreen';
import * as AuthService from './services/authService';
import { supabase, isMissingSupabaseConfig } from './services/supabaseClient';
import { LightModeProvider } from './src/contexts/LightModeContext';
import './src/index.css';
import './src/styles/light-mode.css';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import IeltsHome from './src/pages/ielts/IeltsHome';
import IeltsSession from './src/pages/ielts/IeltsSession';
import ReadingPractice from './src/pages/ielts/ReadingPractice';
import SpeakingPractice from './src/pages/ielts/SpeakingPractice';
import ListeningPractice from './src/pages/ielts/ListeningPractice';
import WritingPractice from './src/pages/ielts/WritingPractice';
import TrialListeningTest from './src/pages/ielts/TrialListeningTest';
import TrialListeningTask2 from './src/pages/ielts/TrialListeningTask2';
import IeltsPrime from './src/pages/ielts/IeltsPrime';
import IeltsAdminGuard from './components/ielts/IeltsAdminGuard';
import IeltsAdminDashboard from './components/IeltsAdminDashboard';
import PasswordResetPage from './components/PasswordResetPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    return <IELTSLoginView onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return element;
};

const Main: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupUsername, setSetupUsername] = useState<string | undefined>();
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
              const status = await withTimeout(AuthService.checkUserSetupStatus(), 3000, 'check_user_setup_status');
              setNeedsSetup(status.needs_setup);
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
          // Check email verification first
          AuthService.checkEmailVerification().then(verificationStatus => {
            setUserEmail(verificationStatus.email);
            
            if (!verificationStatus.isVerified) {
              setNeedsEmailVerification(true);
              setNeedsSetup(false);
            } else {
              setNeedsEmailVerification(false);
              
              // Setup check happens in background - don't block UI
              setNeedsSetup(false); // Default to no setup required
              AuthService.checkUserSetupStatus().then(status => {
                setNeedsSetup(status.needs_setup);
                if (status.has_username) {
                  setSetupUsername(status.username);
                }
              }).catch(() => {
                // Silently fail - user can proceed without setup check
              });
            }
          }).catch(() => {
            // If verification check fails, proceed without blocking
            setNeedsEmailVerification(false);
          });
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
  }, []);

  const handleSetupComplete = useCallback(() => {
    setNeedsSetup(false);
  }, []);

  if (isLoading) {
    return <BrainsLoader message="Initializing Brains Heist..." />;
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
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
  }

  // Show email verification screen if email is not verified
  if (isAuthenticated && needsEmailVerification && userEmail) {
    return (
      <EmailVerificationScreen
        email={userEmail}
        onVerified={() => {
          setNeedsEmailVerification(false);
          // Trigger auth check to continue to setup or app
          checkAuthAndSetup();
        }}
      />
    );
  }

  // Show NEW setup wizard for users who need setup
  if (needsSetup) {
    return (
      <SetupWizard 
        onComplete={handleSetupComplete}
        onLogout={handleLogout}
        initialUsername={setupUsername}
      />
    );
  }

  return <App onLogout={handleLogout} />;
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
    return <IELTSLoginView onAuthenticated={handleAuthenticated} />;
  }

  return <IELTSApp onLogout={handleLogout} />;
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
    element: <PasswordResetPage />,
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
