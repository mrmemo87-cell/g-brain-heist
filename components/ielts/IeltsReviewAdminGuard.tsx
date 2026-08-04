import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import AccessDenied from './AccessDenied';
import { canAccessIeltsReviewQueue } from '../../services/ieltsReviewAccess';
import { resolveMySchoolCapabilities } from '../../services/schoolAdminService';

type GuardState = 'loading' | 'allowed' | 'denied' | 'error';

const IeltsReviewAdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GuardState>('loading');
  const requestIdRef = useRef(0);

  const checkAccess = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState('loading');

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (requestId !== requestIdRef.current) return;
      if (authError) {
        setState('error');
        return;
      }
      if (!authData.user) {
        setState('denied');
        return;
      }

      const [{ data: profile, error: profileError }, capabilityResolution] = await Promise.all([
        supabase
          .from('users')
          .select('role, is_admin')
          .eq('id', authData.user.id)
          .maybeSingle(),
        resolveMySchoolCapabilities(),
      ]);
      if (requestId !== requestIdRef.current) return;

      const typedProfile = profile as { role?: string | null; is_admin?: boolean | null };
      const canAdministerSchool = capabilityResolution.status === 'ready'
        && Boolean(capabilityResolution.capabilities?.can_administer);
      const allowed = canAdministerSchool || (
        !profileError
        && canAccessIeltsReviewQueue({ ...typedProfile, can_administer_school: canAdministerSchool })
      );
      if (allowed) {
        setState('allowed');
        return;
      }
      if (profileError || capabilityResolution.status === 'error') {
        setState('error');
        return;
      }
      setState('denied');
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
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-700">
        <div className="text-lg font-semibold animate-pulse">Verifying IELTS review access...</div>
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
          <p className="text-lg font-semibold">IELTS review access could not be verified.</p>
          <p className="mt-2 text-sm text-gray-600">No review records have been opened. Check your connection and try again.</p>
          <button type="button" onClick={() => void checkAccess()} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default IeltsReviewAdminGuard;
