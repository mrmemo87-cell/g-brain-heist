import React, { useEffect, useState } from 'react';
import { useIeltsAccount } from '../../lib/ieltsAudience';
import { listMyPendingProgrammeAccessRequests, requestProgrammeAccess } from '../../../services/programmeAccessRequestService';

type RequestState = 'idle' | 'sending' | 'sent' | 'error';

/**
 * "Ask my school for a seat": shown only to a school student whose school offers IELTS seats but has not given them
 * one. Anyone else (outside learners, schools without IELTS) sees nothing.
 */
export default function IeltsSeatRequest({ block = false, tone = 'light' }: { block?: boolean; tone?: 'light' | 'dark' }) {
  const account = useIeltsAccount();
  const [state, setState] = useState<RequestState>('idle');

  useEffect(() => {
    if (!account?.canRequestSeat) return;
    let alive = true;
    listMyPendingProgrammeAccessRequests()
      .then((pending) => { if (alive && pending.includes('ielts')) setState('sent'); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [account?.canRequestSeat]);

  if (!account?.canRequestSeat) return null;

  const send = async () => {
    if (state === 'sending' || state === 'sent') return;
    setState('sending');
    try {
      await requestProgrammeAccess('ielts');
      setState('sent');
    } catch {
      setState('error');
    }
  };

  return (
    <div className={'ic-seat ic-seat--' + tone + (block ? ' ic-seat--block' : '')}>
      <button type="button" className="ic-btn ic-btn--ghost" disabled={state === 'sending' || state === 'sent'} onClick={() => void send()}>
        {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Seat requested from your school ✓' : 'Or ask my school for a seat'}
      </button>
      {state === 'error' && <p className="ic-seat-error" role="alert">The request could not be sent. Please try again.</p>}
    </div>
  );
}
