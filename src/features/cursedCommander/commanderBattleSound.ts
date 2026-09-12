export type CommanderSfxCue =
  | 'intro'
  | 'team'
  | 'deploy'
  | 'countdown'
  | 'battleStart'
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

// Vite bundles the supplied assets; no generated or legacy sound fallback.
const clips = {
  drums: new URL('../../assets/mixkit-drums-of-war-call-2780.wav', import.meta.url).href,
  percussion: new URL('../../assets/mixkit-futuristic-space-war-percussion-2787.wav', import.meta.url).href,
  arrow: new URL('../../assets/mixkit-metal-arrow-fast-hit-2770.wav', import.meta.url).href,
  hit: new URL('../../assets/deep hit.wav', import.meta.url).href,
  shield: new URL('../../assets/sheilded hit.wav', import.meta.url).href,
  bolt: new URL('../../assets/death bolt.wav', import.meta.url).href,
  effort: new URL('../../assets/mixkit-voice-from-effort-to-punch-2174.wav', import.meta.url).href,
  defeat: new URL('../../assets/defeated.wav', import.meta.url).href,
};
const cues: Record<CommanderSfxCue, [keyof typeof clips, number, number]> = {
  intro: ['percussion', .12, 12], team: ['drums', .22, .8], deploy: ['shield', .12, .18],
  countdown: ['hit', .16, .25], battleStart: ['drums', .38, 1.2],
  ui: ['shield', .08, .1], select: ['shield', .12, .16], focus: ['shield', .2, .45],
  meleeWindup: ['effort', .2, .5], rangedFire: ['arrow', .25, .6],
  deathBoltCharge: ['percussion', .16, .7], deathBoltImpact: ['bolt', .35, 1.5],
  hit: ['hit', .3, .6], shieldHit: ['shield', .28, .6], guard: ['shield', .22, .7],
  ko: ['defeat', .22, .8], victory: ['drums', .35, 2.5], defeat: ['defeat', .3, 2], draw: ['percussion', .2, 1],
};
let context: AudioContext | null = null;
let generation = 0;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const active = new Map<CommanderSfxCue, { source: AudioBufferSourceNode; gain: GainNode }>();
const getContext = () => {
  if (typeof window === 'undefined') return null;
  const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  try { return context ??= new Constructor(); } catch { return null; }
};
const load = (url: string) => {
  if (!buffers.has(url)) {
    const audio = getContext();
    if (!audio) return Promise.resolve(null);
    buffers.set(url, fetch(url, { signal: AbortSignal.timeout(8000) })
      .then(response => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer(); })
      .then(bytes => audio.decodeAudioData(bytes)).catch(() => null));
  }
  return buffers.get(url)!;
};
export const preloadCommanderAudio = () => Promise.all(Object.values(clips).map(load));
export const unlockCommanderAudio = async () => {
  const audio = getContext();
  if (audio?.state === 'suspended') { try { await audio.resume(); } catch { /* Optional audio. */ } }
};
export const stopCommanderAudio = () => {
  generation += 1; // Invalidates any pending decode/play request too.
  for (const { source, gain } of active.values()) {
    const now = context?.currentTime ?? 0;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, .035);
    try { source.stop(now + .15); } catch { /* Already ended. */ }
  }
  active.clear();
};
export const playCommanderSfx = async (cue: CommanderSfxCue) => {
  const audio = getContext();
  if (!audio || audio.state !== 'running') return;
  const run = generation;
  const [clip, volume, maxDuration] = cues[cue];
  const buffer = await load(clips[clip]);
  if (!buffer || run !== generation || audio.state !== 'running') return;
  const previous = active.get(cue);
  if (previous) { try { previous.source.stop(); } catch { /* Already ended. */ } }
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = buffer;
  const duration = Math.min(buffer.duration, maxDuration);
  const now = audio.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + Math.min(.04, duration / 4));
  gain.gain.setValueAtTime(volume, now + Math.max(.04, duration - .15));
  gain.gain.linearRampToValueAtTime(0, now + duration);
  source.connect(gain); gain.connect(audio.destination);
  active.set(cue, { source, gain });
  source.onended = () => {
    source.disconnect(); gain.disconnect();
    if (active.get(cue)?.source === source) active.delete(cue);
  };
  source.start(now, 0, duration);
};
