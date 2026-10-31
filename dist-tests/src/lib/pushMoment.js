// Fun moments (a battle, a first reaction) are the best time to offer notifications.
// Screens announce the moment; <PushMomentPrompt /> decides whether to show the offer.
export const PUSH_MOMENT_EVENT = 'brains-heist:push-moment';
export const PUSH_MOMENT_SNOOZE_KEY = 'brains-heist:push-moment-snooze:v1';
/** "Not now" hides the offer for this many days... */
export const PUSH_MOMENT_SNOOZE_DAYS = 3;
/** ...and after this many "not now"s we stop asking (Settings still has the switch). */
export const PUSH_MOMENT_MAX_SNOOZES = 4;
/** Fired after notifications are turned on, so other offers on screen can hide themselves. */
export const PUSH_ENABLED_EVENT = 'brains-heist:push-enabled';
export function announcePushEnabled(win = typeof window === 'undefined' ? undefined : window) {
    try {
        win?.dispatchEvent(new Event(PUSH_ENABLED_EVENT));
    }
    catch { /* Old WebViews. */ }
}
export function announcePushMoment(reason, win = typeof window === 'undefined' ? undefined : window) {
    try {
        win?.dispatchEvent(new CustomEvent(PUSH_MOMENT_EVENT, { detail: { reason } }));
    }
    catch {
        /* Old WebViews without CustomEvent: no offer, nothing breaks. */
    }
}
/** Set once the "turn on alerts" offer has been shown on the first launch from the Home Screen. */
export const FIRST_LAUNCH_OFFER_KEY = 'brains-heist:push-first-launch-offered:v1';
/**
 * Right after installing, the student is most likely to say yes, and on iPhone it is the first moment it can work.
 * Offered once per device; "Not now" afterwards still follows the usual snooze for later moments.
 */
export function shouldOfferOnFirstLaunch(env) {
    return env.standalone && env.pushAvailable && !env.pushEnabled && env.signedIn && !env.alreadyOffered && !env.quietPath;
}
