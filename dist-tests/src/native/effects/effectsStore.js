// Student settings for the motivation layer (IELTS Visual & UX Bible §14.5).
// Stored on this device. Outside the installed app sounds, haptics and lighting stay "off"; only the animated
// Blaze may run on the website (§14.1a), through blazeMotionLevel().
import { useEffect, useState } from 'react';
import { effectsAllowedOnPath, resolveEffectsLevel } from '../../lib/appEffects.js';
import { isNativeApp } from '../../lib/nativePlatform.js';
const CHOICE_KEY = 'bh:app-effects';
const SOUND_KEY = 'bh:app-effects-sound';
const CHANGED = 'bh:app-effects-changed';
const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
export function readEffectsChoice() {
    try {
        const v = localStorage.getItem(CHOICE_KEY);
        return v === 'full' || v === 'light' || v === 'off' ? v : 'auto';
    }
    catch {
        return 'auto';
    }
}
export function setEffectsChoice(choice) {
    try {
        localStorage.setItem(CHOICE_KEY, choice);
    }
    catch { /* private mode: setting lasts for this session only */ }
    window.dispatchEvent(new Event(CHANGED));
}
export function readSoundOn() {
    try {
        return localStorage.getItem(SOUND_KEY) !== 'off';
    }
    catch {
        return true;
    }
}
export function setSoundOn(on) {
    try {
        localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    }
    catch { /* session only */ }
    window.dispatchEvent(new Event(CHANGED));
}
/** Effective level right now, including the "quiet screen" rule for the current page. */
export function currentEffectsLevel(pathname = typeof window === 'undefined' ? '/' : window.location.pathname) {
    if (!isNativeApp() || !effectsAllowedOnPath(pathname))
        return 'off';
    const nav = (typeof navigator === 'undefined' ? {} : navigator);
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
export function blazeMotionLevel(pathname = typeof window === 'undefined' ? '/' : window.location.pathname) {
    if (isNativeApp())
        return currentEffectsLevel(pathname);
    if (!effectsAllowedOnPath(pathname))
        return 'off';
    const nav = (typeof navigator === 'undefined' ? {} : navigator);
    const env = { reducedMotion: reducedMotion(), cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory };
    const choice = readEffectsChoice();
    if (choice === 'auto' && isLowEndWebDevice(env))
        return 'off';
    // On the website "Auto" means the normal animated Blaze; the app's core/memory rule is for native effects.
    return resolveEffectsLevel(choice === 'auto' ? 'full' : choice, env);
}
/**
 * Browsers report CPU cores unreliably (Safari caps them, some laptops report 2), so on the website a device
 * counts as low-end only when it reports 2 GB of memory or less, or, if memory is unknown, 2 cores or fewer.
 */
export function isLowEndWebDevice(env) {
    if (typeof env.memoryGb === 'number')
        return env.memoryGb <= 2;
    return typeof env.cores === 'number' && env.cores <= 2;
}
export function soundsAllowed() {
    return currentEffectsLevel() !== 'off' && readSoundOn();
}
/** React view of the settings; re-renders when the student changes them or the motion setting changes. */
export function useAppEffects() {
    const read = () => ({ native: isNativeApp(), level: currentEffectsLevel(), blazeLevel: blazeMotionLevel(), choice: readEffectsChoice(), soundOn: readSoundOn() });
    const [state, setState] = useState(read);
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
