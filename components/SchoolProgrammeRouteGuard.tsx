import React, { useEffect, useState } from 'react';
import { getEntitlements, type ProgrammeAccessReason, type StudentProgrammeKey } from '../services/entitlementService';
import { supabase } from '../services/supabaseClient';

interface SchoolProgrammeRouteGuardProps {
  programme: StudentProgrammeKey;
  children: React.ReactElement;
}

type GuardState =
  | { status: 'loading' }
  | { status: 'allowed' }
  | { status: 'locked'; reason: ProgrammeAccessReason }
  | { status: 'error' };

const programmeLabels: Record<StudentProgrammeKey, string> = {
  cambridge: 'Cambridge',
  ielts: 'IELTS',
  writing: 'Writing Hub',
};

const SchoolProgrammeRouteGuard: React.FC<SchoolProgrammeRouteGuardProps> = ({ programme, children }) => {
  const [state, setState] = useState<GuardState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const checkAccess = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
          if (active) setState({ status: 'allowed' });
          return;
        }

        const entitlements = await getEntitlements(true);
        if (!entitlements.authoritative) {
          if (active) setState({ status: 'error' });
          return;
        }
        if (!entitlements.schoolId || entitlements.programmeAccess[programme].available) {
          if (active) setState({ status: 'allowed' });
          return;
        }
        if (active) {
          setState({ status: 'locked', reason: entitlements.programmeAccess[programme].reason });
        }
      } catch {
        if (active) setState({ status: 'error' });
      }
    };

    void checkAccess();
    return () => { active = false; };
  }, [programme]);

  if (state.status === 'allowed') return children;
  if (state.status === 'loading') {
    return <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-700">Checking programme access…</div>;
  }

  const label = programmeLabels[programme];
  const message = state.status === 'locked'
    ? state.reason === 'seat_not_allocated'
      ? `${label} is included in your school's agreement, but a School Head must allocate a ${label} seat to you first.`
      : `${label} has not been purchased by your school.`
    : `Brains Heist could not verify your ${label} access. Please try again; access remains locked for your protection.`;

  return (
    <main className="mx-auto mt-12 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-950" aria-labelledby={`${programme}-locked-title`}>
      <div className="text-3xl" aria-hidden>🔒</div>
      <h1 id={`${programme}-locked-title`} className="mt-3 text-xl font-bold">{label} is locked</h1>
      <p className="mt-2 text-sm leading-6">{message}</p>
      <a href="/" className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Return to dashboard</a>
    </main>
  );
};

export default SchoolProgrammeRouteGuard;
