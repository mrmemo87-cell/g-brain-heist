// Small synthesized sound effects for the Commander menus (shop, training, rewards).
// Generated with Web Audio, so there is nothing to download. Every cue is played from a
// tap, which satisfies browser autoplay rules. Students can mute it; the choice is remembered.

export type CommanderUiCue =
  | 'tap'
  | 'tab'
  | 'coin'
  | 'equip'
  | 'train'
  | 'xp'
  | 'levelUp'
  | 'fanfare'
  | 'error';

const STORAGE_KEY = 'cc-ui-sound';
let context: AudioContext | null = null;
let enabled = (() => {
  try { return window.localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
})();
const listeners = new Set<(value: boolean) => void>();

export const commanderUiSoundEnabled = () => enabled;

export const setCommanderUiSound = (value: boolean) => {
  enabled = value;
  try { window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off'); } catch { /* Optional preference. */ }
  listeners.forEach((listener) => listener(value));
};

export const onCommanderUiSoundChange = (listener: (value: boolean) => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const audio = () => {
  if (typeof window === 'undefined') return null;
  const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  try {
    context ??= new Constructor();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
};

type Note = { freq: number; at: number; length: number; type?: OscillatorType; volume?: number; slideTo?: number };

const play = (notes: Note[]) => {
  const ctx = audio();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);
  const start = ctx.currentTime + 0.01;
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type ?? 'triangle';
    osc.frequency.setValueAtTime(note.freq, start + note.at);
    if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, start + note.at + note.length);
    const peak = note.volume ?? 0.6;
    gain.gain.setValueAtTime(0.0001, start + note.at);
    gain.gain.exponentialRampToValueAtTime(peak, start + note.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
    osc.connect(gain).connect(master);
    osc.start(start + note.at);
    osc.stop(start + note.at + note.length + 0.05);
  }
};

const CUES: Record<CommanderUiCue, Note[]> = {
  tap: [{ freq: 660, at: 0, length: 0.06, type: 'sine', volume: 0.35 }],
  tab: [{ freq: 520, at: 0, length: 0.07, type: 'sine', volume: 0.3, slideTo: 780 }],
  coin: [
    { freq: 988, at: 0, length: 0.09, type: 'square', volume: 0.22 },
    { freq: 1319, at: 0.08, length: 0.28, type: 'square', volume: 0.22 },
  ],
  equip: [
    { freq: 220, at: 0, length: 0.18, type: 'sawtooth', volume: 0.18, slideTo: 660 },
    { freq: 880, at: 0.15, length: 0.12, type: 'triangle', volume: 0.35 },
  ],
  train: [
    { freq: 262, at: 0, length: 0.12, volume: 0.4 },
    { freq: 330, at: 0.09, length: 0.12, volume: 0.4 },
    { freq: 392, at: 0.18, length: 0.12, volume: 0.4 },
    { freq: 523, at: 0.27, length: 0.3, volume: 0.45 },
  ],
  xp: [
    { freq: 1047, at: 0, length: 0.12, type: 'sine', volume: 0.35 },
    { freq: 1568, at: 0.07, length: 0.25, type: 'sine', volume: 0.3 },
  ],
  levelUp: [
    { freq: 392, at: 0, length: 0.14, type: 'square', volume: 0.22 },
    { freq: 523, at: 0.12, length: 0.14, type: 'square', volume: 0.22 },
    { freq: 659, at: 0.24, length: 0.14, type: 'square', volume: 0.22 },
    { freq: 784, at: 0.36, length: 0.5, type: 'square', volume: 0.24 },
    { freq: 1047, at: 0.36, length: 0.5, type: 'triangle', volume: 0.3 },
  ],
  fanfare: [
    { freq: 523, at: 0, length: 0.12, type: 'triangle', volume: 0.4 },
    { freq: 659, at: 0.1, length: 0.12, type: 'triangle', volume: 0.4 },
    { freq: 784, at: 0.2, length: 0.35, type: 'triangle', volume: 0.45 },
  ],
  error: [{ freq: 196, at: 0, length: 0.22, type: 'sawtooth', volume: 0.15, slideTo: 130 }],
};

export const playCommanderUi = (cue: CommanderUiCue) => {
  if (!enabled) return;
  try { play(CUES[cue]); } catch { /* Sound is optional. */ }
};
