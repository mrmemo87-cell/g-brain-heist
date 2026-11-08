// Arena audio: generated sound effects, voice lines and a music loop in /arena/sfx, with procedural fallbacks for effects.
// Files are fetched as soon as a match is created; decoding waits for the first user gesture, which
// browsers require before any sound can play.

export type SfxName =
  | 'shot_rivet' | 'shot_fizz' | 'shot_vex' | 'shot_boulder' | 'hit' | 'splash' | 'ko' | 'super' | 'super_rail' | 'super_cloud'
  | 'super_dash' | 'super_shell' | 'capture' | 'tick' | 'countdown' | 'go' | 'correct' | 'wrong' | 'respawn' | 'victory' | 'defeat' | 'heal' | 'bush';

const SFX_NAMES: SfxName[] = ['shot_rivet', 'shot_fizz', 'shot_vex', 'shot_boulder', 'hit', 'splash', 'ko', 'super', 'super_rail', 'super_cloud',
  'super_dash', 'super_shell', 'capture', 'tick', 'countdown', 'go', 'correct', 'wrong', 'respawn', 'victory', 'defeat', 'heal', 'bush'];
const MUSIC = 'music_battle';

// Voice lines: an announcer plus four short lines per fighter. They live in /arena/sfx/voice and have
// no procedural fallback; a missing file simply stays silent.
export type AnnouncerLine = 'intro' | 'go' | 'secured' | 'lost' | 'first_ko' | 'double_ko' | 'triple_ko' | 'question' | 'shielded' | 'wrong' | 'ten' | 'victory' | 'defeat' | 'draw';
export type FighterLine = 'ready' | 'super' | 'ko' | 'kill';
export type VoiceName = `ann_${AnnouncerLine}` | `${string}_${FighterLine}`;
const ANNOUNCER: AnnouncerLine[] = ['intro', 'go', 'secured', 'lost', 'first_ko', 'double_ko', 'triple_ko', 'question', 'shielded', 'wrong', 'ten', 'victory', 'defeat', 'draw'];
const FIGHTER_LINES: FighterLine[] = ['ready', 'super', 'ko', 'kill'];
const VOICE_DIR = 'voice/';
export const voiceFileUrl = (name: VoiceName, base = '/arena/sfx/') => `${base}${VOICE_DIR}${name}.mp3`;

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
  private musicLevel = 0.32;
  private musicWanted = false;
  private readonly base: string;
  private voiceNames = new Set<string>();
  private voiceSource: AudioBufferSourceNode | null = null;
  private voiceEndsAt = 0;
  private voiceQueue: VoiceName[] = [];
  private voiceLast = new Map<string, number>();
  enabled: boolean;

  constructor(enabled: boolean, base = '/arena/sfx/') {
    this.enabled = enabled; this.base = base;
    // Start the downloads now; decoding happens once the context exists.
    for (const n of SFX_NAMES) void fetchFile(n, base);
    void fetchFile(MUSIC, base);
    for (const l of ANNOUNCER) this.addVoice(`ann_${l}`);
  }

  /** Fetches the four lines of the fighter the student plays. Bots stay silent. */
  prepareFighter(fighter: string) { for (const l of FIGHTER_LINES) this.addVoice(`${fighter}_${l}`); }
  private addVoice(name: VoiceName) {
    if (this.voiceNames.has(name)) return;
    this.voiceNames.add(name); void fetchFile(`${VOICE_DIR}${name}`, this.base);
    if (this.ctx) void this.decode(`${VOICE_DIR}${name}`);
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
      for (const n of this.voiceNames) void this.decode(`${VOICE_DIR}${n}`);
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

  /**
   * Speaks a line. Lines never overlap: a `priority` line cuts off whatever is playing, a `queue` line
   * waits for it, and anything else is dropped while a line is running. `cooldown` (seconds) keeps a
   * line from repeating too often, so the announcer does not narrate every reactor flip.
   */
  voice(name: VoiceName, opts: { priority?: boolean; queue?: boolean; cooldown?: number; vol?: number; delay?: number } = {}) {
    if (!this.enabled || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const last = this.voiceLast.get(name);
    if (opts.cooldown && last !== undefined && now - last < opts.cooldown) return;
    const key = `${VOICE_DIR}${name}`;
    const buf = this.buffers.get(key);
    if (!buf) {
      // Still downloading or decoding: play it if it arrives within a moment, otherwise let it go.
      if (!this.voiceNames.has(name) || !fetched.has(key)) return;
      const asked = now;
      void this.decode(key).then(() => { if (this.ctx && this.buffers.has(key) && this.ctx.currentTime - asked < 1.5) this.voice(name, { ...opts, delay: 0 }); });
      return;
    }
    const busy = now < this.voiceEndsAt;
    if (busy && opts.queue) { if (!this.voiceQueue.includes(name)) this.voiceQueue.push(name); return; }
    if (busy && !opts.priority) return;
    if (busy && this.voiceSource) { try { this.voiceSource.stop(); } catch { /* already done */ } }
    const t = now + (opts.delay ?? 0);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = opts.vol ?? 0.95;
    s.connect(g).connect(this.master); s.start(t);
    this.voiceSource = s; this.voiceEndsAt = t + buf.duration; this.voiceLast.set(name, now);
    if (this.musicGain && this.musicSource) { // Dip the music under the voice.
      this.musicGain.gain.setTargetAtTime(0.14, t, 0.08);
      this.musicGain.gain.setTargetAtTime(this.musicLevel, this.voiceEndsAt, 0.3);
    }
    s.onended = () => {
      if (this.voiceSource !== s) return;
      this.voiceSource = null;
      const next = this.voiceQueue.shift(); if (next) this.voice(next, { priority: true });
    };
  }
  /** Drops any waiting lines, e.g. when the match ends. */
  clearVoiceQueue() { this.voiceQueue = []; }

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
    this.musicLevel = down ? 0.1 : 0.32;
    this.musicGain.gain.setTargetAtTime(this.musicLevel, this.ctx.currentTime, 0.25);
  }
  stopMusic(fadeSeconds = 1.2) {
    this.musicWanted = false;
    if (!this.ctx || !this.musicGain || !this.musicSource) return;
    const src = this.musicSource; this.musicSource = null; this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, fadeSeconds / 3);
    window.setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, fadeSeconds * 1000 + 100);
  }

  destroy() {
    this.clearVoiceQueue(); this.stopMusic(0.3);
    const ctx = this.ctx; this.ctx = null; this.master = null; this.musicGain = null;
    if (ctx) window.setTimeout(() => { void ctx.close().catch(() => undefined); }, 600);
  }
}
