import { useEffect, useState } from 'react';
import { getEntitlements } from '../../services/entitlementService';
import { createIeltsViewCache } from './ieltsViewCache';

/**
 * Who the IELTS learner is studying with (Diagnostic Bible 2.1.0 section 10.6):
 * - 'school': an active school membership whose package includes IELTS for this learner (a teacher exists);
 * - 'independent': everyone else (self-paced, no teacher will review anything).
 *
 * The IELTS access model (owner decision 2026-11-05, Asia/Bishkek):
 * - School learners with an IELTS seat get the school tabs (Assignments, Targeted) and teacher feedback.
 * - Everyone else is an independent learner: free Unit 1 and V1, then IELTS Prime. That includes school students
 *   without a seat, students of schools without IELTS, and staff of schools without IELTS. School students without a
 *   seat may also ask their school admin for one.
 * - `inSchool` only decides whether the top bar offers a way back into the Brains Heist game.
 * Cached per signed-in account; wiped when the account changes.
 */
export type IeltsAudience = 'school' | 'independent';

export interface IeltsAccount {
  audience: IeltsAudience;
  /** An active member of any school (so the Brains Heist game exists for them). */
  inSchool: boolean;
  /** A school student whose school can give an IELTS seat but has not (yet). */
  canRequestSeat: boolean;
}

const accountCache = createIeltsViewCache<IeltsAccount>();
let inflight: Promise<IeltsAccount> | null = null;

export function resolveIeltsAccount(): Promise<IeltsAccount> {
  const cached = accountCache.get();
  if (cached) return Promise.resolve(cached);
  inflight ??= getEntitlements()
    .then((e): IeltsAccount => {
      const ielts = e.programmeAccess.ielts;
      const inSchool = Boolean(e.schoolId);
      return {
        audience: inSchool && ielts.available ? 'school' : 'independent',
        inSchool,
        canRequestSeat: inSchool && !ielts.available && ielts.reason === 'seat_not_allocated',
      };
    })
    .then((value) => { if (value) accountCache.set(value); return value; })
    .finally(() => { inflight = null; });
  return inflight;
}

export function resolveIeltsAudience(): Promise<IeltsAudience> {
  return resolveIeltsAccount().then((account) => account.audience);
}

/** null while resolving. */
export function useIeltsAccount(): IeltsAccount | null {
  const [value, setValue] = useState<IeltsAccount | null>(() => accountCache.get());
  useEffect(() => {
    if (value) return;
    let alive = true;
    resolveIeltsAccount()
      .then((v) => { if (alive) setValue(v); })
      .catch(() => { if (alive) setValue({ audience: 'independent', inSchool: false, canRequestSeat: false }); });
    return () => { alive = false; };
  }, [value]);
  return value;
}

/** null while resolving. Callers should avoid "teacher" wording until this says 'school'. */
export function useIeltsAudience(): IeltsAudience | null {
  return useIeltsAccount()?.audience ?? null;
}
