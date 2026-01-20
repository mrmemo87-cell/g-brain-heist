import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import AccessDenied from './AccessDenied';

type GuardState = 'loading' | 'allowed' | 'denied';

const IeltsAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GuardState>('loading');

  const checkAdminStatus = useCallback(async () => {
    setState((current) => (current === 'allowed' ? 'allowed' : 'loading'));

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setState('denied');
      return;
    }

    const { data, error } = await supabase.rpc('rpc_is_ielts_admin');
    if (error) {
      console.error('Failed to verify IELTS admin status:', error);
      setState('denied');
      return;
    }

    setState(data?.is_ielts_admin ? 'allowed' : 'denied');
  }, []);

  useEffect(() => {
    let isMounted = true;

    const runCheck = async () => {
      if (!isMounted) {
        return;
      }
      await checkAdminStatus();
    };

    runCheck();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (isMounted) {
        checkAdminStatus();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [checkAdminStatus]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-700">
        <div className="text-lg font-semibold animate-pulse">Verifying IELTS admin access...</div>
      </div>
    );
  }

  if (state === 'denied') {
    return <AccessDenied />;
  }

  return <>{children}</>;
};

export default IeltsAdminGuard;
