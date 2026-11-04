// Short sound effects for the app's motivation layer, synthesised with Web Audio (no audio files to download).
// Played only from a tap or a just-finished action, never on page load; silent on quiet screens, when effects
// are off, or when the student switched sounds off (IELTS Visual & UX Bible §14.5).

import { soundsAllowed } from './effectsStore';

export type SfxCue = 'whoosh' | 'crackle' | 'medalDrop' | 'medalShine' | 'fanfare' | 'coin';

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx || ctx.state === 'closed') {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void ctx?.suspend().catch(() => undefined); });
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch { return null; }
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function tone(ac: AudioContext, out: AudioNode, freq: number, start: number, dur: number, type: OscillatorType, peak: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function noise(ac: AudioContext, out: AudioNode, start: number, dur: number, from: number, to: number, peak: number, q = 0.9): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + dur * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(out);
  src.start(start);
  src.stop(start + dur + 0.05);
}

export function playSfx(cue: SfxCue): void {
  if (!soundsAllowed()) return;
  const ac = context();
  if (!ac) return;
  const master = ac.createGain();
  master.gain.value = 0.55;
  master.connect(ac.destination);
  const t = ac.currentTime + 0.01;
  switch (cue) {
    case 'whoosh': // tapping Blaze: a rising burst of fire
      noise(ac, master, t, 0.45, 300, 2600, 0.5, 0.7);
      tone(ac, master, 140, t, 0.25, 'sine', 0.18);
      break;
    case 'crackle': // tiny pops of embers
      for (let i = 0; i < 6; i += 1) noise(ac, master, t + i * 0.05 + Math.random() * 0.03, 0.04, 2500, 4000, 0.25, 4);
      break;
    case 'medalDrop': // the medal lands
      tone(ac, master, 90, t, 0.35, 'sine', 0.45);
      noise(ac, master, t, 0.12, 600, 200, 0.25, 1.2);
      break;
    case 'medalShine': // metallic ring with shimmer
      [1318.5, 1975.5, 2637].forEach((f, i) => tone(ac, master, f, t + i * 0.03, 1.1, 'sine', 0.12));
      noise(ac, master, t + 0.05, 0.6, 6000, 9000, 0.06, 3);
      break;
    case 'fanfare': // short victory arpeggio (C–E–G–C)
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone(ac, master, f, t + i * 0.11, 0.42, 'triangle', 0.22);
        tone(ac, master, f * 2, t + i * 0.11, 0.3, 'sine', 0.05);
      });
      break;
    case 'coin':
      tone(ac, master, 1567.98, t, 0.12, 'square', 0.08);
      tone(ac, master, 2093, t + 0.08, 0.3, 'square', 0.07);
      break;
  }
}
