export type RetentionSound = 'tap' | 'unlock' | 'complete' | 'thanks';
const key = (userId: string) => `bh:retention-sound:v1:${userId}`;
let context: AudioContext | null = null;
let unavailable = false;
let lastPlayed = 0;
const voices = new Set<OscillatorNode>();
export function soundEnabled(userId: string): boolean {
  try { return localStorage.getItem(key(userId)) === 'on'; } catch { return false; }
}
function stopVoices() {
  for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } }
  voices.clear();
}
export function setSoundEnabled(userId: string, enabled: boolean) {
  try { localStorage.setItem(key(userId), enabled ? 'on' : 'off'); } catch { return false; }
  if (!enabled) stopVoices();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bh:retention-sound', { detail: { userId, enabled } }));
  return true;
}
function getContext(): AudioContext | null {
  if (unavailable || typeof window === 'undefined') return null;
  try {
    if (!context || context.state === 'closed') {
      const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) { unavailable = true; return null; }
      context = new Audio();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { stopVoices(); void context?.suspend().catch(() => {}); }
      });
    }
    return context;
  } catch { unavailable = true; return null; }
}
export const SOUND_NOTES: Record<RetentionSound, readonly [number, number, number][]> = {
  tap: [[440, 0, 0.065], [660, 0.045, 0.08]],
  unlock: [[220, 0, 0.12], [330, 0.1, 0.15], [440, 0.2, 0.2], [880, 0.3, 0.28]],
  complete: [[523.25, 0, 0.14], [659.25, 0.1, 0.16], [783.99, 0.2, 0.25]],
  thanks: [[659.25, 0, 0.12], [880, 0.12, 0.22]],
};
/** Call only from a user gesture or that gesture's successful save. No page-load playback. */
export function playRetentionSound(userId: string, sound: RetentionSound) {
  if (!soundEnabled(userId) || typeof document === 'undefined' || document.visibilityState === 'hidden' || Date.now() - lastPlayed < 120) return;
  const audio = getContext();
  if (!audio) return;
  lastPlayed = Date.now();
  const play = () => {
    if (!soundEnabled(userId) || document.visibilityState === 'hidden') return;
    stopVoices();
    const now = audio.currentTime;
    for (const [frequency, offset, duration] of SOUND_NOTES[sound]) {
      const voice = audio.createOscillator(); const gain = audio.createGain();
      voice.type = 'sine'; voice.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.045, now + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      voice.connect(gain); gain.connect(audio.destination); voices.add(voice);
      voice.onended = () => { voices.delete(voice); voice.disconnect(); gain.disconnect(); };
      voice.start(now + offset); voice.stop(now + offset + duration + 0.02);
    }
  };
  try { if (audio.state === 'suspended') void audio.resume().then(play).catch(() => {}); else play(); } catch { /* Sound must never block a control. */ }
}
/** Unlock audio synchronously in the opening click, before any network operation. */
export function primeRetentionSound(userId: string) {
  if (!soundEnabled(userId)) return;
  const audio = getContext(); if (audio?.state === 'suspended') void audio.resume().catch(() => {});
}
