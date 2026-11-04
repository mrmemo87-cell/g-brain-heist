// Student settings for the app-only motivation layer (IELTS Visual & UX Bible §14.5).
// Stored on this device. Outside the installed app every check returns "off", so the website never changes.

import { useEffect, useState } from 'react';
import { effectsAllowedOnPath, resolveEffectsLevel, type EffectsChoice, type EffectsLevel } from '../../lib/appEffects';
import { isNativeApp } from '../../lib/nativePlatform';

const CHOICE_KEY = 'bh:app-effects';
const SOUND_KEY = 'bh:app-effects-sound';
const CHANGED = 'bh:app-effects-changed';

const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function readEffectsChoice(): EffectsChoice {
  try {
    const v = localStorage.getItem(CHOICE_KEY);
    return v === 'full' || v === 'light' || v === 'off' ? v : 'auto';
  } catch { return 'auto'; }
}

export function setEffectsChoice(choice: EffectsChoice): void {
  try { localStorage.setItem(CHOICE_KEY, choice); } catch { /* private mode: setting lasts for this session only */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function readSoundOn(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

export function setSoundOn(on: boolean): void {
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* session only */ }
  window.dispatchEvent(new Event(CHANGED));
}

/** Effective level right now, including the "quiet screen" rule for the current page. */
export function currentEffectsLevel(pathname = typeof window === 'undefined' ? '/' : window.location.pathname): EffectsLevel {
  if (!isNativeApp() || !effectsAllowedOnPath(pathname)) return 'off';
  const nav = (typeof navigator === 'undefined' ? {} : navigator) as Navigator & { deviceMemory?: number };
  return resolveEffectsLevel(readEffectsChoice(), {
    reducedMotion: reducedMotion(),
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
  });
}

export function soundsAllowed(): boolean {
  return currentEffectsLevel() !== 'off' && readSoundOn();
}

export interface AppEffectsState {
  native: boolean;
  level: EffectsLevel;
  choice: EffectsChoice;
  soundOn: boolean;
}

/** React view of the settings; re-renders when the student changes them or the motion setting changes. */
export function useAppEffects(): AppEffectsState {
  const read = (): AppEffectsState => ({ native: isNativeApp(), level: currentEffectsLevel(), choice: readEffectsChoice(), soundOn: readSoundOn() });
  const [state, setState] = useState<AppEffectsState>(read);
  useEffect(() => {
    const update = () => setState(read());
    window.addEventListener(CHANGED, update);
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    mq?.addEventListener?.('change', update);
    update();
    return () => {
      window.removeEventListener(CHANGED, update);
      mq?.removeEventListener?.('change', update);
    };
  }, []);
  return state;
}
