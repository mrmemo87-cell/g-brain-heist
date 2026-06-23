import React, { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { ensureIeltsProfile } from '../../../services/ieltsService';
import { consumeIeltsAuthIntent, readIeltsAuthIntent } from '../../lib/authFlowGuards';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const completeSignIn = async () => {
      // Supabase handles the OAuth callback automatically. For IELTS funnel
      // users, do not let the wildcard Brain Heist app route consume /auth/callback
      // and show general onboarding before the IELTS profile is ready.
      const hasIeltsIntent = Boolean(readIeltsAuthIntent(window.sessionStorage));
      let session: Session | null = null;

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (session?.user || !hasIeltsIntent) break;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      const intendedPath = hasIeltsIntent ? readIeltsAuthIntent(window.sessionStorage) : null;
      if (intendedPath && session?.user) {
        try {
          await ensureIeltsProfile();
          consumeIeltsAuthIntent(window.sessionStorage);
        } catch (error) {
          console.warn('Unable to prepare IELTS profile after Google sign-in:', error);
        }
      }

      if (!cancelled) {
        navigate(intendedPath && session?.user ? intendedPath : '/', { replace: true });
      }
    };

    void completeSignIn();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400"></div>
        <p className="text-white mt-4 font-heading">Signing you in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
