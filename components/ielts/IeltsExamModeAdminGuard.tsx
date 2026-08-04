import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { checkIeltsExamModeAdminAccess } from '../../services/ieltsExamAccessService';
import AccessDenied from './AccessDenied';

type GuardState = 'loading' | 'allowed' | 'denied' | 'error';

const IeltsExamModeAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GuardState>('loading');
  const requestIdRef = useRef(0);

  const checkAccess = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState('loading');
    try {
      const result = await checkIeltsExamModeAdminAccess();
      if (requestId !== requestIdRef.current) return;
      if (result.allowed) setState('allowed');
      else setState(result.reason === 'verification_error' ? 'error' : 'denied');
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState('error');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const runCheck = async () => {
      if (!isMounted) return;
      await checkAccess();
    };

    runCheck();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (isMounted) {
        checkAccess();
      }
    });

    return () => {
      isMounted = false;
      requestIdRef.current += 1;
      subscription.unsubscribe();
    };
  }, [checkAccess]);

  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center bg-white text-gray-700">
        <div className="text-lg font-semibold animate-pulse">Verifying IELTS Exam Mode access...</div>
      </div>
    );
  }

  if (state === 'denied') {
    return <AccessDenied />;
  }

  if (state === 'error') {
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center bg-white p-6 text-gray-700">
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold">IELTS Exam Mode access could not be verified.</p>
          <p className="mt-2 text-sm text-gray-600">No exam or monitoring records have been opened. Check your connection and try again.</p>
          <button type="button" onClick={() => void checkAccess()} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default IeltsExamModeAdminGuard;
