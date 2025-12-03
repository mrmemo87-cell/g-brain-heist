import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LoginView from './components/LoginView';
import IELTSApp from './components/ielts/IELTSApp';
import IELTSLoginView from './components/ielts/IELTSLoginView';
import ErrorBoundary from './components/ErrorBoundary';
import * as AuthService from './services/authService';
import { supabase } from './services/supabaseClient';
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
import IeltsPrime from './src/pages/ielts/IeltsPrime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

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

  return element;
};

const Main: React.FC = () => {
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
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = useCallback(async (email: string, pass: string) => {
    await AuthService.login(email, pass);
    // Force immediate state update and session check
    const { data: { session } } = await supabase.auth.getSession();
    setIsAuthenticated(!!session);
  }, []);

  const handleLogout = useCallback(async () => {
    await AuthService.logout();
    // Immediately set to false - the auth state change will confirm
    setIsAuthenticated(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-heading text-2xl animate-pulse" style={{ color: 'var(--ion-blue)' }}>
          Initializing Heist OS...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
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
    return (
      <div className="ielts-auth-wrapper">
        <div className="ielts-auth-panel" style={{ textAlign: 'center' }}>
          <div className="ielts-auth-badge">IELTS Prep Hub</div>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--ielts-slate-600)' }}>Preparing secure study environment…</p>
        </div>
      </div>
    );
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
    path: '/ielts',
    element: <ProtectedRoute element={<IeltsHome />} />,
  },
  {
    path: '/ielts/trial-test',
    element: <ProtectedRoute element={<TrialListeningTest />} />,
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
      <QueryClientProvider client={queryClient}>
        <LightModeProvider>
          <RouterProvider router={router} />
        </LightModeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
