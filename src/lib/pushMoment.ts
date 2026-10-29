// Fun moments (a battle, a first reaction) are the best time to offer notifications.
// Screens announce the moment; <PushMomentPrompt /> decides whether to show the offer.

export type PushMomentReason = 'battle' | 'reaction';

export const PUSH_MOMENT_EVENT = 'brains-heist:push-moment';
export const PUSH_MOMENT_SNOOZE_KEY = 'brains-heist:push-moment-snooze:v1';
/** "Not now" hides the offer for this many days... */
export const PUSH_MOMENT_SNOOZE_DAYS = 3;
/** ...and after this many "not now"s we stop asking (Settings still has the switch). */
export const PUSH_MOMENT_MAX_SNOOZES = 4;

/** Fired after notifications are turned on, so other offers on screen can hide themselves. */
export const PUSH_ENABLED_EVENT = 'brains-heist:push-enabled';

export function announcePushEnabled(
  win: Pick<Window, 'dispatchEvent'> | undefined = typeof window === 'undefined' ? undefined : window,
): void {
  try { win?.dispatchEvent(new Event(PUSH_ENABLED_EVENT)); } catch { /* Old WebViews. */ }
}

export function announcePushMoment(
  reason: PushMomentReason,
  win: Pick<Window, 'dispatchEvent'> | undefined = typeof window === 'undefined' ? undefined : window,
): void {
  try {
    win?.dispatchEvent(new CustomEvent(PUSH_MOMENT_EVENT, { detail: { reason } }));
  } catch {
    /* Old WebViews without CustomEvent: no offer, nothing breaks. */
  }
}
