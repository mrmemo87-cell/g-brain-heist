export type CommanderSfxCue =
  | 'ui'
  | 'select'
  | 'focus'
  | 'meleeWindup'
  | 'rangedFire'
  | 'deathBoltCharge'
  | 'deathBoltImpact'
  | 'hit'
  | 'shieldHit'
  | 'guard'
  | 'ko'
  | 'victory'
  | 'defeat'
  | 'draw';

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let context: AudioContext | null = null;

const getContext = () => {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const AudioContextCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextCtor) return null;
  context = new AudioContextCtor();
  return context;
};

const ensureRunning = async (audio: AudioContext) => {
  if (audio.state === 'suspended') {
    try {
      await audio.resume();
    } catch {
      // Audio is optional. Browser autoplay policy can keep the context suspended.
    }
  }
};

const tone = (
  audio: AudioContext,
  frequency: number,
  endFrequency: number,
  duration: number,
  type: OscillatorType,
  peakGain: number,
  delay = 0,
) => {
  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), start + Math.min(0.025, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
};

const noise = (
  audio: AudioContext,
  duration: number,
  peakGain: number,
  delay = 0,
  cutoff = 1700,
) => {
  const sampleRate = audio.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = audio.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const envelope = 1 - (i / length);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }

  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  const start = audio.currentTime + delay;
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
};

const playChord = (audio: AudioContext, notes: number[], ascending: boolean) => {
  notes.forEach((frequency, index) => {
    const position = ascending ? index : notes.length - 1 - index;
    tone(audio, frequency, frequency * 1.02, 0.22, 'sine', 0.04, position * 0.075);
    tone(audio, frequency / 2, frequency / 2, 0.27, 'triangle', 0.018, position * 0.075);
  });
};

export const playCommanderSfx = async (cue: CommanderSfxCue) => {
  const audio = getContext();
  if (!audio) return;
  await ensureRunning(audio);
  if (audio.state !== 'running') return;

  switch (cue) {
    case 'ui':
      tone(audio, 520, 700, 0.07, 'sine', 0.028);
      break;
    case 'select':
      tone(audio, 620, 980, 0.11, 'triangle', 0.04);
      tone(audio, 1080, 1320, 0.07, 'sine', 0.022, 0.055);
      break;
    case 'focus':
      tone(audio, 360, 880, 0.2, 'triangle', 0.04);
      tone(audio, 1120, 1420, 0.08, 'sine', 0.028, 0.13);
      break;
    case 'meleeWindup':
      noise(audio, 0.11, 0.025, 0, 950);
      tone(audio, 230, 105, 0.16, 'sawtooth', 0.025);
      break;
    case 'rangedFire':
      tone(audio, 980, 360, 0.16, 'triangle', 0.035);
      noise(audio, 0.08, 0.018, 0.02, 2400);
      break;
    case 'deathBoltCharge':
      tone(audio, 95, 760, 0.36, 'sawtooth', 0.035);
      tone(audio, 190, 1120, 0.42, 'sine', 0.03);
      break;
    case 'deathBoltImpact':
      noise(audio, 0.3, 0.06, 0, 1200);
      tone(audio, 145, 46, 0.34, 'sawtooth', 0.055);
      tone(audio, 720, 180, 0.18, 'square', 0.02);
      break;
    case 'hit':
      noise(audio, 0.12, 0.042, 0, 1450);
      tone(audio, 175, 92, 0.12, 'triangle', 0.035);
      break;
    case 'shieldHit':
      tone(audio, 1250, 560, 0.19, 'triangle', 0.04);
      tone(audio, 430, 620, 0.16, 'sine', 0.027);
      break;
    case 'guard':
      tone(audio, 310, 820, 0.28, 'sine', 0.035);
      tone(audio, 620, 1040, 0.3, 'triangle', 0.026, 0.05);
      break;
    case 'ko':
      noise(audio, 0.22, 0.035, 0, 700);
      tone(audio, 170, 48, 0.42, 'sawtooth', 0.05);
      break;
    case 'victory':
      playChord(audio, [392, 523.25, 659.25, 783.99], true);
      break;
    case 'defeat':
      playChord(audio, [392, 329.63, 261.63, 196], false);
      break;
    case 'draw':
      playChord(audio, [293.66, 349.23, 293.66], true);
      break;
  }
};

export const unlockCommanderAudio = async () => {
  const audio = getContext();
  if (!audio) return;
  await ensureRunning(audio);
};
