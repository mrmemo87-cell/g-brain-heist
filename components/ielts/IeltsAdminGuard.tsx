import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import AccessDenied from './AccessDenied';

type GuardState = 'loading' | 'allowed' | 'denied';
type AdminProfile = { role?: string | null; is_admin?: boolean | null };

const IELTS_ADMIN_ROLES = new Set(['admin', 'superadmin', 'school_admin']);

const canAccessIeltsAdmin = (profile: AdminProfile | null) => {
  const normalizedRole = (profile?.role || '').trim().toLowerCase();
  return Boolean(profile?.is_admin) || IELTS_ADMIN_ROLES.has(normalizedRole);
};

const IeltsAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GuardState>('loading');

  const checkAdminStatus = useCallback(async () => {
    setState((current) => (current === 'allowed' ? 'allowed' : 'loading'));

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      setState('denied');
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .select('role, is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to verify IELTS admin profile:', error);
      setState('denied');
      return;
    }

    setState(canAccessIeltsAdmin((data as AdminProfile | null) || null) ? 'allowed' : 'denied');
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
