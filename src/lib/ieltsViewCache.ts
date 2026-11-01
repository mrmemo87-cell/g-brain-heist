import { subscribeToAccountChanges } from './accountChange';

/**
 * Tiny in-memory caches for IELTS screens, so switching tabs paints the last known view at once while a fresh
 * read runs in the background. Every cache is wiped the moment the signed-in account changes (sign-out, or a
 * different person signing in on a shared school device). Nothing is persisted to storage.
 */
const stores = new Set<{ clear: () => void }>();
let watching = false;

function watchAccount() {
  if (watching) return;
  watching = true;
  try {
    subscribeToAccountChanges(() => stores.forEach((store) => store.clear()));
  } catch {
    watching = false;
  }
}

export function createIeltsViewCache<T>() {
  let value: T | null = null;
  const store = { clear: () => { value = null; } };
  stores.add(store);
  return {
    get: (): T | null => value,
    set: (next: T) => { watchAccount(); value = next; },
    clear: store.clear,
  };
}

/** Wipe every IELTS view cache (used on explicit sign-out). */
export function clearIeltsViewCaches() { stores.forEach((store) => store.clear()); }
