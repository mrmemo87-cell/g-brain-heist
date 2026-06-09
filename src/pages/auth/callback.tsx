import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { ensureIeltsProfile } from '../../../services/ieltsService';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const completeSignIn = async () => {
      // Supabase handles the OAuth callback automatically. Once the session is
      // available, return IELTS funnel users to the exact task/Prime page they
      // intended to open before Google sign-in.
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      const intendedPath = window.sessionStorage.getItem('ielts_auth_intent') || '/';
      if (intendedPath.startsWith('/ielts')) {
        try {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user) {
            await ensureIeltsProfile();
          }
        } catch (error) {
          console.warn('Unable to prepare IELTS profile after Google sign-in:', error);
        }
      }
      window.sessionStorage.removeItem('ielts_auth_intent');
      if (!cancelled) {
        navigate(intendedPath.startsWith('/') ? intendedPath : '/', { replace: true });
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
