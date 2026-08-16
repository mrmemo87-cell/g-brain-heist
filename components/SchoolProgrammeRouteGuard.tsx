import React, { useEffect, useState } from 'react';
import { getEntitlements, type ProgrammeAccessReason, type StudentProgrammeKey } from '../services/entitlementService';
import { supabase } from '../services/supabaseClient';
import { requestProgrammeAccess } from '../services/programmeAccessRequestService';

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
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

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
    ? "You're not selected for this program. Ask your school admin if you need it."
    : `Brains Heist could not verify your ${label} access. Please try again; access remains locked for your protection.`;

  const sendRequest = async () => {
    if (requestState === 'sending' || requestState === 'sent') return;
    setRequestState('sending');
    try {
      await requestProgrammeAccess(programme);
      setRequestState('sent');
    } catch {
      setRequestState('error');
    }
  };

  return (
    <main className="mx-auto mt-12 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-950" aria-labelledby={`${programme}-locked-title`}>
      <div className="text-3xl" aria-hidden>🔒</div>
      <h1 id={`${programme}-locked-title`} className="mt-3 text-xl font-bold">{label} is locked</h1>
      <p className="mt-2 text-sm leading-6">🔒 {message}</p>
      {state.status === 'locked' ? <button type="button" disabled={requestState === 'sending' || requestState === 'sent'} onClick={() => void sendRequest()} className="mt-5 inline-flex rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-65">{requestState === 'sending' ? 'Sending request…' : requestState === 'sent' ? 'Request sent to the school admin' : 'Send a request to the school admin'}</button> : null}
      {requestState === 'error' ? <p className="mt-2 text-xs font-semibold text-red-700">The request could not be sent. Please try again.</p> : null}
      <a href="/" className="mt-3 block text-sm font-bold text-slate-700 underline underline-offset-2">Return to dashboard</a>
    </main>
  );
};

export default SchoolProgrammeRouteGuard;
