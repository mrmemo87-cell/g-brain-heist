import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { checkIeltsExamModeAdminAccess } from '../../services/ieltsExamAccessService';
import AccessDenied from './AccessDenied';

type GuardState = 'loading' | 'allowed' | 'denied';

const IeltsExamModeAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GuardState>('loading');

  const checkAccess = useCallback(async () => {
    setState((current) => (current === 'allowed' ? 'allowed' : 'loading'));
    const result = await checkIeltsExamModeAdminAccess();
    setState(result.allowed ? 'allowed' : 'denied');
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
      subscription.unsubscribe();
    };
  }, [checkAccess]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-700">
        <div className="text-lg font-semibold animate-pulse">Verifying IELTS Exam Mode access...</div>
      </div>
    );
  }

  if (state === 'denied') {
    return <AccessDenied />;
  }

  return <>{children}</>;
};

export default IeltsExamModeAdminGuard;
