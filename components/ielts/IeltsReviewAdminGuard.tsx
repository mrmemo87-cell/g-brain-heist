import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import AccessDenied from './AccessDenied';

type GuardState = 'loading' | 'allowed' | 'denied';

const normalizeRole = (role?: string | null) => (role ?? '').trim().toLowerCase();

const IeltsReviewAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GuardState>('loading');

  const checkAccess = useCallback(async () => {
    setState((current) => (current === 'allowed' ? 'allowed' : 'loading'));

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setState('denied');
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, is_admin')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      setState('denied');
      return;
    }

    const typedProfile = profile as { role?: string | null; is_admin?: boolean | null };
    const role = normalizeRole(typedProfile.role);
    const allowed = Boolean(typedProfile.is_admin) || role === 'school_admin' || role === 'admin' || role === 'superadmin';
    setState(allowed ? 'allowed' : 'denied');
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
        <div className="text-lg font-semibold animate-pulse">Verifying IELTS review access...</div>
      </div>
    );
  }

  if (state === 'denied') {
    return <AccessDenied />;
  }

  return <>{children}</>;
};

export default IeltsReviewAdminGuard;
