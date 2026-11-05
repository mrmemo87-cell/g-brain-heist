// The Brains Heist sound set: the neon cat, the streak flame and answer feedback, shared by Brains Heist and IELTS.
// Short recorded clips (public/sounds/mascot, about 190 KB in total), loaded on first use and reused after that.
//
// When they play:
// - In the app: only when the student's Effects setting allows motion and the Sounds switch is on, and never
//   on quiet screens such as exams (effectsStore). Phones in silent mode stay silent as usual.
// - On the website: on Brains Heist screens when game sound is on (the speaker toggle). The IELTS website stays
//   a quiet study space, as before; IELTS sounds play in the app only.

import { isNativeApp } from '../../lib/nativePlatform';
import { soundsAllowed } from './effectsStore';

export type BrandSound =
  | 'catGreet' | 'catPurr' | 'catMeow' | 'catGrumpy'
  | 'correct' | 'wrong' | 'lessonComplete'
  | 'streakFlare' | 'streakMilestone' | 'streakSleepy' | 'streakFreeze'
  | 'battleWin';

const FILES: Record<BrandSound, string> = {
  catGreet: 'cat-greet', catPurr: 'cat-purr', catMeow: 'cat-meow', catGrumpy: 'cat-grumpy',
  correct: 'correct', wrong: 'wrong', lessonComplete: 'lesson-complete',
  streakFlare: 'streak-flare', streakMilestone: 'streak-milestone', streakSleepy: 'streak-sleepy', streakFreeze: 'streak-freeze',
  battleWin: 'battle-win',
};

/** Path of a sound file; also used by the older sound services so every screen shares one set. */
export const brandSoundUrl = (sound: BrandSound): string => `/sounds/mascot/${FILES[sound]}.mp3`;

// Celebrations sit a little lower than the short cues so nothing jumps out.
const VOLUME: Partial<Record<BrandSound, number>> = { lessonComplete: 0.5, streakMilestone: 0.5, battleWin: 0.45, catPurr: 0.5 };

const cache = new Map<BrandSound, HTMLAudioElement>();
let lastCatTap = 0;
let catTapIndex = 0;

const isIeltsPath = (path: string) => path === '/ielts' || path.startsWith('/ielts/') || path.startsWith('/ielts-prep');

function allowed(): boolean {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false;
  if (isNativeApp()) return soundsAllowed();
  if (isIeltsPath(window.location.pathname)) return false;
  try { return localStorage.getItem('gbh_audio_enabled') !== 'false'; } catch { return true; }
}

function element(sound: BrandSound): HTMLAudioElement {
  let audio = cache.get(sound);
  if (!audio) {
    audio = new Audio(brandSoundUrl(sound));
    audio.preload = 'auto';
    cache.set(sound, audio);
  }
  return audio;
}

/** Plays one sound from the set. Silent when sound is off; never throws. */
export function playBrandSound(sound: BrandSound): void {
  if (!allowed()) return;
  try {
    const base = element(sound);
    // A fresh copy lets the same cue overlap itself (fast answers) without cutting off.
    const audio = base.readyState >= 2 ? (base.cloneNode() as HTMLAudioElement) : base;
    audio.volume = VOLUME[sound] ?? 0.6;
    if (audio === base) audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch { /* audio unavailable: stay silent */ }
}

/** Tapping the cat: alternates purr and meow, and ignores rapid repeat taps. */
export function playCatTap(): void {
  const now = Date.now();
  if (now - lastCatTap < 700) return;
  lastCatTap = now;
  catTapIndex += 1;
  playBrandSound(catTapIndex % 2 ? 'catMeow' : 'catPurr');
}

/** Loads the given sounds in the background so the first play is instant. */
export function preloadBrandSounds(sounds: BrandSound[]): void {
  if (!allowed()) return;
  sounds.forEach((sound) => { element(sound); });
}

/** Plays a sound at most once per calendar day on this device (greetings, freeze notices). */
export function playBrandSoundOncePerDay(sound: BrandSound, key: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const storageKey = `bh:sound-once:${key}`;
  try {
    if (localStorage.getItem(storageKey) === today) return;
    if (!allowed()) return;
    localStorage.setItem(storageKey, today);
  } catch { /* private mode: play anyway */ }
  playBrandSound(sound);
}
