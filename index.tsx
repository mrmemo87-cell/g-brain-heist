import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LoginView from './components/LoginView';
import ErrorBoundary from './components/ErrorBoundary';
import * as AuthService from './services/authService';
import { supabase } from './services/supabaseClient';
import { LightModeProvider } from './src/contexts/LightModeContext';
import './src/index.css';
import './src/styles/light-mode.css';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import IeltsHome from './src/pages/ielts/IeltsHome';
import IeltsSession from './src/pages/ielts/IeltsSession';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

const Main: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing Supabase session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = useCallback(async (email: string, pass: string) => {
    await AuthService.login(email, pass);
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await AuthService.logout();
    setIsAuthenticated(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-heading text-2xl animate-pulse" style={{color: 'var(--ion-blue)'}}>
          Initializing Heist OS...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
  }

  const router = useMemo(
    () =>
      createBrowserRouter([
        { path: '/', element: <App onLogout={handleLogout} /> },
        { path: '/ielts', element: <IeltsHome /> },
        { path: '/ielts/session/:sessionId', element: <IeltsSession /> },
        { path: '*', element: <Navigate to="/" replace /> },
      ]),
    [handleLogout]
  );

  return <RouterProvider router={router} />;
};


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <LightModeProvider>
        <QueryClientProvider client={queryClient}>
          <Main />
        </QueryClientProvider>
      </LightModeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
