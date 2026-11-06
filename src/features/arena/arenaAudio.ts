// Arena audio: generated sound effects and a music loop in /arena/sfx, with procedural fallbacks.
// Files are fetched as soon as a match is created; decoding waits for the first user gesture, which
// browsers require before any sound can play.

export type SfxName =
  | 'shot_rivet' | 'shot_fizz' | 'shot_vex' | 'shot_boulder' | 'hit' | 'splash' | 'ko' | 'super' | 'super_rail' | 'super_cloud'
  | 'super_dash' | 'super_shell' | 'capture' | 'tick' | 'countdown' | 'go' | 'correct' | 'wrong' | 'respawn' | 'victory' | 'defeat' | 'heal' | 'bush';

const SFX_NAMES: SfxName[] = ['shot_rivet', 'shot_fizz', 'shot_vex', 'shot_boulder', 'hit', 'splash', 'ko', 'super', 'super_rail', 'super_cloud',
  'super_dash', 'super_shell', 'capture', 'tick', 'countdown', 'go', 'correct', 'wrong', 'respawn', 'victory', 'defeat', 'heal', 'bush'];
const MUSIC = 'music_battle';

// Fallback tones, so the game still sounds like something if a file is missing.
const FALLBACK: Record<SfxName, [number, number, OscillatorType, number, number?]> = {
  shot_rivet: [180, .08, 'square', .04, .5], shot_fizz: [300, .15, 'triangle', .05, 2], shot_vex: [900, .12, 'sawtooth', .035, .3], shot_boulder: [120, .1, 'square', .05, .5],
  hit: [180, .07, 'square', .03, .6], splash: [240, .25, 'triangle', .05, .5], ko: [520, .4, 'square', .05, .25], super: [220, .35, 'sawtooth', .05, 4],
  super_rail: [160, .5, 'sawtooth', .06, 3], super_cloud: [200, .5, 'triangle', .06, .5], super_dash: [300, .3, 'square', .05, 2], super_shell: [110, .5, 'triangle', .06, 1.2],
  capture: [440, .5, 'triangle', .04, 2], tick: [880, .06, 'triangle', .03], countdown: [660, .1, 'square', .04], go: [990, .3, 'square', .05, 1.5],
  correct: [784, .3, 'triangle', .05, 1.5], wrong: [220, .3, 'square', .04, .7], respawn: [400, .4, 'triangle', .04, 3], victory: [523, .6, 'square', .05, 2],
  defeat: [392, .6, 'triangle', .05, .5], heal: [1046, .3, 'triangle', .03, 1.3], bush: [600, .08, 'triangle', .02, .7],
};

const fetched = new Map<string, Promise<ArrayBuffer | null>>();
function fetchFile(name: string, base: string) {
  let p = fetched.get(name);
  if (!p) {
    p = fetch(`${base}${name}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    fetched.set(name, p);
  }
  return p;
}

export class ArenaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private musicSource: AudioBufferSourceNode | null = null;
  private musicWanted = false;
  private readonly base: string;
  enabled: boolean;

  constructor(enabled: boolean, base = '/arena/sfx/') {
    this.enabled = enabled; this.base = base;
    // Start the downloads now; decoding happens once the context exists.
    for (const n of SFX_NAMES) void fetchFile(n, base);
    void fetchFile(MUSIC, base);
  }

  /** Call from a user gesture. Creates the context and decodes whatever has arrived. */
  unlock() {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain(); this.master.gain.value = this.enabled ? 1 : 0; this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.master);
      } catch { this.ctx = null; return; }
      for (const n of [...SFX_NAMES, MUSIC]) void this.decode(n);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private async decode(name: string) {
    if (!this.ctx || this.buffers.has(name)) return;
    const data = await fetchFile(name, this.base); if (!data || !this.ctx) return;
    try { this.buffers.set(name, await this.ctx.decodeAudioData(data.slice(0))); } catch { /* keep the fallback */ }
    if (name === MUSIC && this.musicWanted) this.startMusic();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  play(name: SfxName, opts: { vol?: number; rate?: number; delay?: number } = {}) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const buf = this.buffers.get(name);
    const t = this.ctx.currentTime + (opts.delay ?? 0);
    if (buf) {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = opts.rate ?? 1;
      const g = this.ctx.createGain(); g.gain.value = opts.vol ?? 0.8;
      s.connect(g).connect(this.master); s.start(t);
      return;
    }
    const [freq, dur, type, vol, slide] = FALLBACK[name];
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(freq * (opts.rate ?? 1), t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol * (opts.vol ?? 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  /** Fades the battle loop in. Safe to call before the file has arrived; it starts when ready. */
  startMusic() {
    this.musicWanted = true;
    if (!this.ctx || !this.musicGain || this.musicSource) return;
    const buf = this.buffers.get(MUSIC); if (!buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(this.musicGain); s.start();
    this.musicSource = s;
    this.musicGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(0.32, this.ctx.currentTime + 1.5);
  }
  /** Lower the music under a question or a result screen. */
  duckMusic(down: boolean) {
    if (!this.ctx || !this.musicGain || !this.musicSource) return;
    this.musicGain.gain.setTargetAtTime(down ? 0.1 : 0.32, this.ctx.currentTime, 0.25);
  }
  stopMusic(fadeSeconds = 1.2) {
    this.musicWanted = false;
    if (!this.ctx || !this.musicGain || !this.musicSource) return;
    const src = this.musicSource; this.musicSource = null;
    this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, fadeSeconds / 3);
    window.setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, fadeSeconds * 1000 + 100);
  }

  destroy() {
    this.stopMusic(0.3);
    const ctx = this.ctx; this.ctx = null; this.master = null; this.musicGain = null;
    if (ctx) window.setTimeout(() => { void ctx.close().catch(() => undefined); }, 600);
  }
}
