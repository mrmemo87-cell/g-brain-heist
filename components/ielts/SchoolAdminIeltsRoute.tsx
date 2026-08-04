import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { resolveMySchoolCapabilities } from '../../services/schoolAdminService';
import { supabase } from '../../services/supabaseClient';
import {
  isValidSchoolAdminIeltsReviewAttemptId,
  isValidSchoolAdminIeltsRouteExamId,
  schoolAdminIeltsUrl,
  type SchoolAdminIeltsTab,
  type SchoolAdminIeltsReviewSkill,
} from '../../src/lib/schoolAdminIeltsNavigation';

interface SchoolAdminIeltsRouteProps {
  children: React.ReactNode;
  ieltsTab: SchoolAdminIeltsTab;
  reviewFromRoute?: boolean;
  monitorFromRoute?: boolean;
}

type AdminAccessState = 'loading' | 'school_admin' | 'not_school_admin' | 'error';

const SchoolAdminIeltsRoute: React.FC<SchoolAdminIeltsRouteProps> = ({ children, ieltsTab, reviewFromRoute = false, monitorFromRoute = false }) => {
  const [adminAccess, setAdminAccess] = useState<AdminAccessState>('loading');
  const requestIdRef = useRef(0);
  const params = useParams<{ skill?: string; attemptId?: string; examEventId?: string }>();

  const checkAccess = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setAdminAccess('loading');
    const resolution = await resolveMySchoolCapabilities();
    if (requestId !== requestIdRef.current) return;
    if (resolution.status === 'error') {
      setAdminAccess('error');
      return;
    }
    setAdminAccess(resolution.capabilities?.can_administer ? 'school_admin' : 'not_school_admin');
  }, []);

  useEffect(() => {
    void checkAccess();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void checkAccess();
    });
    return () => {
      requestIdRef.current += 1;
      subscription.unsubscribe();
    };
  }, [checkAccess]);

  if (adminAccess === 'loading') {
    return <div role="status" className="min-h-screen bg-white p-6 text-center text-sm font-semibold text-slate-600">Opening the authorised workspace…</div>;
  }

  if (adminAccess === 'error') {
    return (
      <div role="alert" className="min-h-screen bg-white p-6 text-center text-slate-700">
        <p className="font-semibold">School administration access could not be verified.</p>
        <p className="mt-2 text-sm text-slate-600">Check your connection, then try again. No standalone administrator tools have been opened.</p>
        <button type="button" onClick={() => void checkAccess()} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
          Try again
        </button>
      </div>
    );
  }

  if (adminAccess === 'school_admin') {
    const skill = params.skill === 'speaking' ? 'speaking' : params.skill === 'writing' ? 'writing' : null;
    const attemptId = params.attemptId?.trim() ?? '';
    const review = reviewFromRoute && skill && isValidSchoolAdminIeltsReviewAttemptId(attemptId)
      ? { skill: skill as SchoolAdminIeltsReviewSkill, attemptId }
      : null;
    const routeExamId = params.examEventId?.trim() ?? '';
    const monitorExamId = monitorFromRoute && isValidSchoolAdminIeltsRouteExamId(routeExamId)
      ? routeExamId
      : null;
    return <Navigate replace to={schoolAdminIeltsUrl(ieltsTab, review, monitorExamId)} />;
  }

  return <>{children}</>;
};

export default SchoolAdminIeltsRoute;
