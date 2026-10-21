/**
 * Moments the student mascot reacts to. Small moments only change the cat's
 * pose; 'mission-complete' is the one big moment per day, where the cat flies
 * to the middle of the screen, grows and does a backflip.
 */
export type MascotMoment = 'mission-start' | 'correct' | 'wrong' | 'climb' | 'mission-complete';

export const MASCOT_MOMENT_EVENT = 'bh:mascot-moment';

export interface MascotMomentDetail {
  moment: MascotMoment;
  /** Set by the mascot when it takes the moment; called when the reaction ends. */
  claim?: (finished: Promise<void>) => void;
}

/** Fire-and-forget reaction. Does nothing if the mascot is hidden or not on screen. */
export function mascotMoment(moment: Exclude<MascotMoment, 'mission-complete'>): void {
  try {
    window.dispatchEvent(new CustomEvent<MascotMomentDetail>(MASCOT_MOMENT_EVENT, { detail: { moment } }));
  } catch {
    /* never let the mascot break the page */
  }
}

/**
 * The big celebration. Resolves when it has finished, or straight away when
 * there is no mascot, the cat is tucked away, or the device is in performance
 * or reduced-motion mode (then the cat only changes pose in its corner).
 */
export function celebrateWithMascot(): Promise<void> {
  let finished: Promise<void> | null = null;
  try {
    window.dispatchEvent(new CustomEvent<MascotMomentDetail>(MASCOT_MOMENT_EVENT, {
      detail: { moment: 'mission-complete', claim: (promise) => { finished = promise; } },
    }));
  } catch {
    return Promise.resolve();
  }
  if (!finished) return Promise.resolve();
  // Safety net: never hold the reward back for more than 7 seconds.
  return Promise.race([finished, new Promise<void>((resolve) => window.setTimeout(resolve, 7000))]);
}

/** True when the cat should only change pose, without moving or growing. */
export function mascotMotionReduced(): boolean {
  try {
    if (document.body.classList.contains('light-mode')) return true;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return true;
  }
}
