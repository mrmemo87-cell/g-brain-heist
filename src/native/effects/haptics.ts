// Phone vibration patterns for the app (IELTS Visual & UX Bible §14). Silent no-ops on the website,
// on quiet screens (tests, screeners, practice tasks) and when the student turned effects off.

import { currentEffectsLevel } from './effectsStore';

export type HapticCue = 'tap' | 'select' | 'correct' | 'wrong' | 'reward' | 'hit' | 'heavy' | 'celebrate';

type HapticsModule = typeof import('@capacitor/haptics');
let modulePromise: Promise<HapticsModule | null> | null = null;
const load = () => (modulePromise ??= import('@capacitor/haptics').catch(() => null));

let lastAt = 0;

export async function haptic(cue: HapticCue): Promise<void> {
  const level = currentEffectsLevel();
  if (level === 'off') return;
  // Light keeps only the meaningful moments, not every tap.
  if (level === 'light' && (cue === 'tap' || cue === 'select')) return;
  const now = Date.now();
  if (cue === 'tap' && now - lastAt < 60) return;
  lastAt = now;
  const mod = await load();
  if (!mod) return;
  const { Haptics, ImpactStyle, NotificationType } = mod;
  try {
    switch (cue) {
      case 'tap': await Haptics.impact({ style: ImpactStyle.Light }); break;
      case 'select': await Haptics.selectionChanged(); break;
      case 'correct': await Haptics.notification({ type: NotificationType.Success }); break;
      case 'wrong': await Haptics.notification({ type: NotificationType.Error }); break;
      case 'reward': await Haptics.impact({ style: ImpactStyle.Medium }); break;
      case 'hit': await Haptics.impact({ style: ImpactStyle.Medium }); break;
      case 'heavy': await Haptics.impact({ style: ImpactStyle.Heavy }); break;
      case 'celebrate':
        await Haptics.impact({ style: ImpactStyle.Heavy });
        window.setTimeout(() => { void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined); }, 140);
        window.setTimeout(() => { void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined); }, 320);
        break;
    }
  } catch { /* vibration is optional */ }
}

/**
 * A soft tick on every button tap across the app (game side and allowed IELTS screens). Installed once by the
 * native shell; quiet screens and the Light/Off settings switch it off automatically.
 */
export function installTapHaptics(): void {
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Element | null;
    const control = target?.closest?.('button, a[href], [role="button"], [role="tab"], [role="radio"], [role="switch"], summary, label');
    if (!control || (control as HTMLButtonElement).disabled || control.getAttribute('aria-disabled') === 'true') return;
    void haptic('tap');
  }, { passive: true, capture: true });
}
