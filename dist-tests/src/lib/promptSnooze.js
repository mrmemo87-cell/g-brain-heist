// "Not now" for friendly prompts: snooze for a few days, and stop asking after a few tries.
// Pure helpers so the rules are unit-testable without a browser.
const DAY_MS = 24 * 60 * 60 * 1000;
export function readSnooze(storage, key) {
    try {
        const raw = storage?.getItem(key);
        if (!raw)
            return { count: 0, until: 0 };
        // Older builds stored a permanent "1". Treat it as one earlier "not now" that has expired.
        if (raw === '1')
            return { count: 1, until: 0 };
        const parsed = JSON.parse(raw);
        return {
            count: Number.isFinite(parsed.count) ? Math.max(0, Number(parsed.count)) : 0,
            until: Number.isFinite(parsed.until) ? Number(parsed.until) : 0,
        };
    }
    catch {
        return { count: 0, until: 0 };
    }
}
export function isSnoozed(state, now, maxCount) {
    return state.count >= maxCount || state.until > now;
}
export function recordSnooze(storage, key, now, days) {
    const next = { count: readSnooze(storage, key).count + 1, until: now + days * DAY_MS };
    try {
        storage?.setItem(key, JSON.stringify(next));
    }
    catch {
        /* Blocked storage: the prompt may show again next visit. */
    }
    return next;
}
