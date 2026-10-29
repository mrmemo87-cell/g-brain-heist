// "Not now" for friendly prompts: snooze for a few days, and stop asking after a few tries.
// Pure helpers so the rules are unit-testable without a browser.

export interface SnoozeState {
  /** How many times the student has said "not now". */
  count: number;
  /** Epoch ms until which the prompt stays hidden. */
  until: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function readSnooze(storage: Pick<Storage, 'getItem'> | undefined, key: string): SnoozeState {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return { count: 0, until: 0 };
    // Older builds stored a permanent "1". Treat it as one earlier "not now" that has expired.
    if (raw === '1') return { count: 1, until: 0 };
    const parsed = JSON.parse(raw) as Partial<SnoozeState>;
    return {
      count: Number.isFinite(parsed.count) ? Math.max(0, Number(parsed.count)) : 0,
      until: Number.isFinite(parsed.until) ? Number(parsed.until) : 0,
    };
  } catch {
    return { count: 0, until: 0 };
  }
}

export function isSnoozed(state: SnoozeState, now: number, maxCount: number): boolean {
  return state.count >= maxCount || state.until > now;
}

export function recordSnooze(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  key: string,
  now: number,
  days: number,
): SnoozeState {
  const next = { count: readSnooze(storage, key).count + 1, until: now + days * DAY_MS };
  try {
    storage?.setItem(key, JSON.stringify(next));
  } catch {
    /* Blocked storage: the prompt may show again next visit. */
  }
  return next;
}
