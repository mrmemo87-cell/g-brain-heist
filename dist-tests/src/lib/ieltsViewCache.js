import { subscribeToAccountChanges } from './accountChange.js';
/**
 * Tiny in-memory caches for IELTS screens, so switching tabs paints the last known view at once while a fresh
 * read runs in the background. Every cache is wiped the moment the signed-in account changes (sign-out, or a
 * different person signing in on a shared school device). Nothing is persisted to storage.
 */
const stores = new Set();
let watching = false;
function watchAccount() {
    if (watching)
        return;
    watching = true;
    try {
        subscribeToAccountChanges(() => stores.forEach((store) => store.clear()));
    }
    catch {
        watching = false;
    }
}
export function createIeltsViewCache() {
    let value = null;
    const store = { clear: () => { value = null; } };
    stores.add(store);
    return {
        get: () => value,
        set: (next) => { watchAccount(); value = next; },
        clear: store.clear,
    };
}
/** Wipe every IELTS view cache (used on explicit sign-out). */
export function clearIeltsViewCaches() { stores.forEach((store) => store.clear()); }
