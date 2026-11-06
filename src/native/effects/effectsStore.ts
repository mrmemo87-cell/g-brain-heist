// Student settings for the motivation layer (IELTS Visual & UX Bible §14.5).
// Stored on this device. Outside the installed app sounds, haptics and lighting stay "off"; only the animated
// Blaze may run on the website (§14.1a), through blazeMotionLevel().

import { useEffect, useState } from 'react';
import { effectsAllowedOnPath, isLowEndDevice, resolveEffectsLevel, type EffectsChoice, type EffectsLevel } from '../../lib/appEffects';
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

/**
 * Level for the animated Blaze only. In the app it equals the effects level. On the website (Bible §14.1a)
 * he may animate on the same pages, silently; on low-end devices "Auto" keeps him still there.
 */
export function blazeMotionLevel(pathname = typeof window === 'undefined' ? '/' : window.location.pathname): EffectsLevel {
  if (isNativeApp()) return currentEffectsLevel(pathname);
  if (!effectsAllowedOnPath(pathname)) return 'off';
  const nav = (typeof navigator === 'undefined' ? {} : navigator) as Navigator & { deviceMemory?: number };
  const env = { reducedMotion: reducedMotion(), cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory };
  const choice = readEffectsChoice();
  if (choice === 'auto' && isLowEndDevice(env)) return 'off';
  return resolveEffectsLevel(choice, env);
}

export function soundsAllowed(): boolean {
  return currentEffectsLevel() !== 'off' && readSoundOn();
}

export interface AppEffectsState {
  native: boolean;
  level: EffectsLevel;
  /** Level for the animated Blaze (also on the website). */
  blazeLevel: EffectsLevel;
  choice: EffectsChoice;
  soundOn: boolean;
}

/** React view of the settings; re-renders when the student changes them or the motion setting changes. */
export function useAppEffects(): AppEffectsState {
  const read = (): AppEffectsState => ({ native: isNativeApp(), level: currentEffectsLevel(), blazeLevel: blazeMotionLevel(), choice: readEffectsChoice(), soundOn: readSoundOn() });
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
