import React, { useCallback, useEffect, useState } from 'react';
import AccessDenied from './AccessDenied';
import { checkIeltsExamModeAdminAccess } from '../../services/ieltsExamModeAuthService';

type GuardState = 'loading' | 'allowed' | 'denied';

const IeltsExamModeAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GuardState>('loading');

  const checkExamModeAccess = useCallback(async () => {
    setState((current) => (current === 'allowed' ? 'allowed' : 'loading'));

    try {
      const decision = await checkIeltsExamModeAdminAccess();
      setState(decision.allowed ? 'allowed' : 'denied');
    } catch (error) {
      console.error('Failed to verify IELTS Exam Mode admin access:', error);
      setState('denied');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const runCheck = async () => {
      if (!isMounted) {
        return;
      }
      await checkExamModeAccess();
    };

    runCheck();

    return () => {
      isMounted = false;
    };
  }, [checkExamModeAccess]);

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
