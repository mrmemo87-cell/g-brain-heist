/**
 * Quest Mode Sound Manager
 * Handles all audio playback for the quest experience.
 * Sounds are lazy-loaded on first play to avoid blocking page load.
 */

import { feelGameCue } from '../src/native/effects/gameFeedback';
type SoundKey =
  | 'correct'
  | 'wrong'
  | 'spin'
  | 'win'
  | 'chestOpen'
  | 'riddleAppear'
  | 'avatarMove';

const SOUND_PATHS: Record<SoundKey, string> = {
  // Shared Brains Heist sound set, so quest answers match the rest of the app.
  correct:      '/sounds/mascot/correct.mp3',
  wrong:        '/sounds/mascot/wrong.mp3',
  spin:         '/nodes/spin-wheel.mp3',
  win:          '/nodes/prize-win.mp3',
  chestOpen:    '/nodes/chest-open.mp3',
  riddleAppear: '/nodes/riddle-appear.mp3',
  avatarMove:   '/nodes/avatar-move.mp3',
};

const audioCache: Partial<Record<SoundKey, HTMLAudioElement>> = {};
let muted = false;
let globalVolume = 0.6;

function getAudio(key: SoundKey): HTMLAudioElement {
  if (!audioCache[key]) {
    const audio = new Audio(SOUND_PATHS[key]);
    audio.preload = 'auto';
    audioCache[key] = audio;
  }
  return audioCache[key]!;
}

export function playSound(key: SoundKey, volumeOverride?: number): void {
  if (typeof window !== 'undefined') feelGameCue(key); // phone vibration in the app; no-op on the website
  if (muted || typeof window === 'undefined') return;
  try {
    const audio = getAudio(key);
    audio.currentTime = 0;
    audio.volume = volumeOverride ?? globalVolume;
    audio.play().catch(() => {
      // Autoplay policy may block silent tabs — fail silently
    });
  } catch {
    // Audio not supported — fail silently
  }
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function setVolume(value: number): void {
  globalVolume = Math.max(0, Math.min(1, value));
}

export function isMuted(): boolean {
  return muted;
}
