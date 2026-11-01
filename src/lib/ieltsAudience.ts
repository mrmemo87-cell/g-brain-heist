import { useEffect, useState } from 'react';
import { getEntitlements } from '../../services/entitlementService';
import { createIeltsViewCache } from './ieltsViewCache';

/**
 * Who the IELTS learner is studying with (Diagnostic Bible 2.1.0 section 10.6):
 * - 'school': an active school membership whose package includes IELTS for this learner (a teacher exists);
 * - 'independent': everyone else (self-paced, no teacher will review anything).
 * Cached per signed-in account; wiped when the account changes.
 */
export type IeltsAudience = 'school' | 'independent';
const audienceCache = createIeltsViewCache<IeltsAudience>();
let inflight: Promise<IeltsAudience> | null = null;

export function resolveIeltsAudience(): Promise<IeltsAudience> {
  const cached = audienceCache.get();
  if (cached) return Promise.resolve(cached);
  inflight ??= getEntitlements()
    .then((e) => (e.schoolId && e.programmeAccess.ielts.available ? 'school' : 'independent') as IeltsAudience)
    .then((value) => { audienceCache.set(value); return value; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** null while resolving. Callers should avoid "teacher" wording until this says 'school'. */
export function useIeltsAudience(): IeltsAudience | null {
  const [value, setValue] = useState<IeltsAudience | null>(() => audienceCache.get());
  useEffect(() => {
    if (value) return;
    let alive = true;
    resolveIeltsAudience().then((v) => { if (alive) setValue(v); }).catch(() => { if (alive) setValue('independent'); });
    return () => { alive = false; };
  }, [value]);
  return value;
}
