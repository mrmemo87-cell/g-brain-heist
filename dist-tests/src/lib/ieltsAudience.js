import { useEffect, useState } from 'react';
import { getEntitlements } from '../../services/entitlementService.js';
import { createIeltsViewCache } from './ieltsViewCache.js';
const accountCache = createIeltsViewCache();
let inflight = null;
export function resolveIeltsAccount() {
    const cached = accountCache.get();
    if (cached)
        return Promise.resolve(cached);
    inflight ??= getEntitlements()
        .then((e) => {
        const ielts = e.programmeAccess.ielts;
        const inSchool = Boolean(e.schoolId);
        return {
            audience: inSchool && ielts.available ? 'school' : 'independent',
            inSchool,
            canRequestSeat: inSchool && !ielts.available && ielts.reason === 'seat_not_allocated',
        };
    })
        .then((value) => { if (value)
        accountCache.set(value); return value; })
        .finally(() => { inflight = null; });
    return inflight;
}
export function resolveIeltsAudience() {
    return resolveIeltsAccount().then((account) => account.audience);
}
/** null while resolving. */
export function useIeltsAccount() {
    const [value, setValue] = useState(() => accountCache.get());
    useEffect(() => {
        if (value)
            return;
        let alive = true;
        resolveIeltsAccount()
            .then((v) => { if (alive)
            setValue(v); })
            .catch(() => { if (alive)
            setValue({ audience: 'independent', inSchool: false, canRequestSeat: false }); });
        return () => { alive = false; };
    }, [value]);
    return value;
}
/** null while resolving. Callers should avoid "teacher" wording until this says 'school'. */
export function useIeltsAudience() {
    return useIeltsAccount()?.audience ?? null;
}
