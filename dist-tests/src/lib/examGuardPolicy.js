// Pure rules that make ExamGuard fair on phones without weakening it.
// The violation limit and auto-submit behaviour stay with the caller; these rules only
// stop one real-world event (an app switch, a notification banner) from counting twice
// or from counting when the learner never left the page.
export const FOCUS_LOSS_TYPES = new Set(['tab_hidden', 'window_blur']);
/** One app switch raises blur and hidden together; both must count as one strike. */
export const FOCUS_LOSS_COALESCE_MS = 2000;
/** Phones show notification banners, Control Centre and permission prompts over the page without hiding it. */
export const COARSE_POINTER_BLUR_GRACE_MS = 1500;
export function isFocusLossType(type) {
    return FOCUS_LOSS_TYPES.has(type);
}
/**
 * True when a new focus-loss event should be folded into a previous one instead of counted.
 * `lastFocusLossAt` is the timestamp of the last counted blur/hidden violation, or null.
 */
export function shouldCoalesceFocusLoss(type, now, lastFocusLossAt) {
    if (!isFocusLossType(type) || lastFocusLossAt === null)
        return false;
    return now - lastFocusLossAt < FOCUS_LOSS_COALESCE_MS;
}
/** Blur grace to use: callers tune for desktop; touch devices get at least the coarse-pointer floor. */
export function effectiveBlurGraceMs(configuredMs, coarsePointer, defaultMs) {
    const base = configuredMs ?? defaultMs;
    if (base <= 0)
        return base; // explicit "no grace" is respected everywhere
    return coarsePointer ? Math.max(base, COARSE_POINTER_BLUR_GRACE_MS) : base;
}
export function detectCoarsePointer(win) {
    try {
        return Boolean(win?.matchMedia?.('(pointer: coarse)').matches);
    }
    catch {
        return false;
    }
}
