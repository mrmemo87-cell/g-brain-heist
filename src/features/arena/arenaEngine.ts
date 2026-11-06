// Proving Grounds match engine: a 3-vs-3 Reactor Rush match on a canvas, player plus five bots.
// The engine knows nothing about Supabase. It reports knockouts and the final score through callbacks.

import { FIGHTERS, MATCH_SECONDS, WIN_SCORE, powerMultiplier, type ArenaMatchOutcome, type FighterId, type FighterSpec } from './arenaModel';

const TAU = Math.PI * 2;
const TILE = 40, COLS = 40, ROWS = 26, WW = COLS * TILE, WH = ROWS * TILE;
const ZONE = { x: WW / 2, y: WH / 2, r: 125 };
const SCORE_RATE = 3.6;
const BOT_NAMES = ['Sprocket', 'Kettle', 'Lugnut', 'Mops', 'Dynamo', 'Gravel', 'Nimbus', 'Pixel', 'Tinker', 'Cog', 'Socket', 'Widget', 'Zinc', 'Fuse'];
const FIGHTER_IDS: FighterId[] = ['rivet', 'fizz', 'vex', 'boulder'];

/* ---------- Map ---------- */
const HALF = [
  '####################', '#...................', '#.,,,.......##......', '#.,,,.......##...,,,', '#...........##...,,,', '#.....###...........',
  '#.....#.............', '#.......,,,,....#...', '#.......,,,,....#...', '#..~~~..........#...', '#..~~~.....##.......', '#..S.......##.......',
  '#..S................', '#..S................', '#..........##.......', '#..~~~.....##.......', '#..~~~..........#...', '#.......,,,,....#...',
  '#.......,,,,....#...', '#.....#.............', '#.....###...........', '#...........##...,,,', '#.,,,.......##...,,,', '#.,,,.......##......',
  '#...................', '####################',
];
const MAP: string[][] = [];
const SPAWNS: Record<0 | 1, Array<{ x: number; y: number }>> = { 0: [], 1: [] };
for (let r = 0; r < ROWS; r++) {
  const left = (HALF[r] + '....................').slice(0, 20);
  const right = left.split('').reverse().join('').replace(/S/g, 'T');
  const row = (left + right).split('');
  row.forEach((c, x) => {
    if (c === 'S' || c === 'T') { SPAWNS[c === 'S' ? 0 : 1].push({ x: x * TILE + TILE / 2, y: r * TILE + TILE / 2 }); row[x] = '.'; }
  });
  MAP.push(row);
}
const tileAt = (x: number, y: number) => { const c = Math.floor(x / TILE), r = Math.floor(y / TILE); return (r < 0 || r >= ROWS || c < 0 || c >= COLS) ? '#' : MAP[r][c]; };
const blocksMove = (c: string) => c === '#' || c === '~';
const blocksShot = (c: string) => c === '#';

function buildField(goals: Array<[number, number]>) {
  const f = new Float32Array(COLS * ROWS).fill(1e9); const q: number[] = [];
  for (const [c, r] of goals) { f[r * COLS + c] = 0; q.push(c, r); }
  for (let i = 0; i < q.length; i += 2) {
    const c = q[i], r = q[i + 1], d = f[r * COLS + c];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || blocksMove(MAP[nr][nc])) continue;
      if (f[nr * COLS + nc] > d + 1) { f[nr * COLS + nc] = d + 1; q.push(nc, nr); }
    }
  }
  return f;
}
const zoneGoals: Array<[number, number]> = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  if (!blocksMove(MAP[r][c]) && Math.hypot(c * TILE + 20 - ZONE.x, r * TILE + 20 - ZONE.y) < ZONE.r - 30) zoneGoals.push([c, r]);
}
const toCell = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
const FIELDS = { zone: buildField(zoneGoals), base0: buildField(SPAWNS[0].map(toCell)), base1: buildField(SPAWNS[1].map(toCell)) };

function flowDir(f: Float32Array, x: number, y: number) {
  const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
  let best = f[r * COLS + c] ?? 1e9, bc = -1, br = -1;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dc && !dr) continue; const nc = c + dc, nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
    if (dc && dr && (blocksMove(MAP[r][nc]) || blocksMove(MAP[nr][c]))) continue;
    const v = f[nr * COLS + nc] + (dc && dr ? 0.4 : 0);
    if (v < best) { best = v; bc = nc; br = nr; }
  }
  if (bc < 0) return null;
  const dx = bc * TILE + 20 - x, dy = br * TILE + 20 - y, d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}
function lineClear(x1: number, y1: number, x2: number, y2: number) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 12);
  for (let i = 1; i < n; i++) if (blocksShot(tileAt(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n))) return false;
  return true;
}
function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

/* ---------- Pre-rendered map art ---------- */
let groundCv: HTMLCanvasElement | null = null, bushCv: HTMLCanvasElement | null = null;
function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function paintMap() {
  if (groundCv && bushCv) return;
  groundCv = document.createElement('canvas'); bushCv = document.createElement('canvas');
  groundCv.width = bushCv.width = WW; groundCv.height = bushCv.height = WH;
  const g = groundCv.getContext('2d')!, b = bushCv.getContext('2d')!, R = rng(7);
  g.fillStyle = '#4b463b'; g.fillRect(0, 0, WW, WH);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c * TILE, y = r * TILE, t = MAP[r][c];
    if (t !== '#' && t !== '~') {
      g.fillStyle = (r + c) % 2 ? '#4f4a3e' : '#4a453a'; g.fillRect(x, y, TILE, TILE);
      if (R() < 0.08) { g.fillStyle = 'rgba(20,18,14,.35)'; g.beginPath(); g.ellipse(x + 20 + (R() - .5) * 16, y + 20 + (R() - .5) * 16, 8 + R() * 10, 5 + R() * 6, R() * 3, 0, TAU); g.fill(); }
      if (R() < 0.06) { g.fillStyle = '#6d6656'; g.beginPath(); g.arc(x + 8 + R() * 24, y + 8 + R() * 24, 2.5, 0, TAU); g.fill(); }
    }
  }
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) { g.beginPath(); g.moveTo(c * TILE, 0); g.lineTo(c * TILE, WH); g.stroke(); }
  for (let r = 0; r <= ROWS; r++) { g.beginPath(); g.moveTo(0, r * TILE); g.lineTo(WW, r * TILE); g.stroke(); }
  for (const t of [0, 1] as const) {
    const p = SPAWNS[t]; const cx = p[1].x;
    g.fillStyle = t ? 'rgba(255,90,77,.16)' : 'rgba(70,176,255,.16)'; g.fillRect(cx - 60, p[0].y - 40, 120, 120);
    g.strokeStyle = t ? 'rgba(255,90,77,.5)' : 'rgba(70,176,255,.5)'; g.lineWidth = 3; g.setLineDash([10, 8]); g.strokeRect(cx - 60, p[0].y - 40, 120, 120); g.setLineDash([]);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c * TILE, y = r * TILE, t = MAP[r][c];
    if (t === '~') {
      g.fillStyle = '#1d5a70'; g.fillRect(x, y, TILE, TILE);
      g.strokeStyle = 'rgba(160,220,240,.35)'; g.lineWidth = 2;
      for (let k = 0; k < 2; k++) { const yy = y + 12 + k * 16; g.beginPath(); g.moveTo(x + 6, yy); g.quadraticCurveTo(x + 13, yy - 4, x + 20, yy); g.quadraticCurveTo(x + 27, yy + 4, x + 34, yy); g.stroke(); }
    } else if (t === '#') {
      const edge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
      if (edge) {
        g.fillStyle = '#2f2c27'; g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#3d3933'; g.fillRect(x + 2, y + 2, TILE - 4, TILE - 10);
        g.fillStyle = '#5c564c'; for (const [px, py] of [[7, 7], [33, 7], [7, 27], [33, 27]]) { g.beginPath(); g.arc(x + px, y + py, 2, 0, TAU); g.fill(); }
      } else {
        g.fillStyle = '#4a2f18'; g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#8a5b31'; g.fillRect(x + 1, y + 1, TILE - 2, TILE - 9);
        g.strokeStyle = '#5e3c1e'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, TILE - 6, TILE - 13);
        g.beginPath(); g.moveTo(x + 4, y + 4); g.lineTo(x + TILE - 4, y + TILE - 11); g.moveTo(x + TILE - 4, y + 4); g.lineTo(x + 4, y + TILE - 11); g.stroke();
      }
    } else if (t === ',') {
      for (let k = 0; k < 6; k++) {
        const bx = x + 6 + R() * 28, by = y + 6 + R() * 28, br = 13 + R() * 9;
        b.fillStyle = ['#2f6b2c', '#3a7d35', '#438c3c'][k % 3]; b.beginPath(); b.arc(bx, by, br, 0, TAU); b.fill();
      }
      b.fillStyle = 'rgba(150,220,120,.25)'; for (let k = 0; k < 4; k++) { b.beginPath(); b.arc(x + 6 + R() * 28, y + 4 + R() * 24, 4, 0, TAU); b.fill(); }
    }
  }
}

/* ---------- Types ---------- */
interface BotBrain { target: Unit | null; think: number; strafe: number; strafeT: number; react: number; stuckT: number; lastX: number; lastY: number; detour: number; wander: { x: number; y: number } | null; wanderT: number }
interface Unit {
  H: FighterSpec; team: 0 | 1; isPlayer: boolean; name: string; mult: number; maxHp: number; hp: number; x: number; y: number; spawn: { x: number; y: number };
  vx: number; vy: number; r: number; aim: number; ammo: number; fireCd: number; charge: number; alive: boolean; respawn: number; lastHurt: number; lastFire: number;
  flash: number; shield: number; dash: number; dvx: number; dvy: number; dashHit: Set<Unit>; reveal: number; kills: number; deaths: number; dmgDealt: number; scoreTime: number; ai: BotBrain;
}
interface Bullet { x: number; y: number; vx: number; vy: number; team: 0 | 1; owner: Unit; dmg: number; range: number; trav: number; r: number; kind: string; dead?: boolean }
interface Lob { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; owner: Unit; team: 0 | 1; dmg: number; rad: number; dead?: boolean }
interface Cloud { x: number; y: number; r: number; t: number; team: 0 | 1; owner: Unit; tick: number }
interface Beam { x0: number; y0: number; x1: number; y1: number; t: number; team: 0 | 1 }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; size: number }
interface FloatText { x: number; y: number; txt: string | number; life: number; col: string; big: boolean }
interface FeedItem { a: string; ac: string; b: string; bc: string; t: number }
interface Stick { id: number | null; ox: number; oy: number; x: number; y: number; moved: boolean }

export interface ArenaEngineOptions {
  fighter: FighterId;
  power: number;
  botPower: number;
  playerName: string;
  soundEnabled: boolean;
  labels: { holdReactor: string; backIn: string; victory: string; defeat: string; draw: string; go: string; yourTeamHolds: string; enemyHolds: string; contested: string; reactorEmpty: string; superReady: string; superCharge: string; turnPhone: string };
  onKnockout: () => void;
  onEnd: (outcome: ArenaMatchOutcome) => void;
}

/* ---------- Engine ---------- */
export class ArenaEngine {
  private cv: HTMLCanvasElement; private ctx: CanvasRenderingContext2D; private opts: ArenaEngineOptions;
  private units: Unit[] = []; private player!: Unit; private bullets: Bullet[] = []; private lobs: Lob[] = []; private clouds: Cloud[] = []; private beams: Beam[] = [];
  private parts: Particle[] = []; private floats: FloatText[] = []; private feed: FeedItem[] = [];
  private score: [number, number] = [0, 0]; private t = -2.6; private over = false; private owner = -1; private skill = 0.2;
  private now = 0; private last = 0; private raf = 0; private destroyed = false;
  private cw = 0; private ch = 0; private dpr = 1; private scale = 1; private cam = { x: ZONE.x, y: ZONE.y, shake: 0 };
  private keys: Record<string, boolean> = {}; private mouse = { x: 0, y: 0, down: false, active: false }; touchMode = false;
  private stickL: Stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, moved: false }; private stickR: Stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, moved: false };
  private actx: AudioContext | null = null; private soundOn: boolean; private ended = false;
  /** Frames drawn so far and the last error seen in the loop, for device diagnostics. */
  frames = 0; lastError: string | null = null;
  private superHit = { x: 0, y: 0, r: 0 };

  constructor(canvas: HTMLCanvasElement, opts: ArenaEngineOptions) {
    this.cv = canvas; this.ctx = canvas.getContext('2d')!; this.opts = opts; this.soundOn = opts.soundEnabled;
    paintMap();
    this.setup();
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('contextmenu', this.prevent);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.cv.removeEventListener('contextmenu', this.prevent);
    this.cv.removeEventListener('pointerdown', this.onPointerDown);
    this.cv.removeEventListener('pointermove', this.onPointerMove);
    this.cv.removeEventListener('pointerup', this.onPointerUp);
    this.cv.removeEventListener('pointercancel', this.onPointerUp);
    if (this.actx) { void this.actx.close().catch(() => undefined); this.actx = null; }
  }

  setSound(on: boolean) { this.soundOn = on; }
  get superReady() { return this.player.alive && this.player.charge >= 1; }

  /** A correct respawn answer: come back a second early with the super half charged. */
  applyRespawnBonus() {
    const p = this.player;
    if (!p.alive) p.respawn = Math.max(0.2, p.respawn - 1);
    p.charge = Math.max(p.charge, 0.5);
  }

  /** Called from the on-screen super button on touch devices. */
  playerSuper() {
    const p = this.player; if (!p.alive || p.charge < 1 || this.over) return;
    this.unlockAudio();
    if (this.touchMode || !this.mouse.active) {
      const t = this.autoTarget(p, 760);
      if (t) this.useSuper(p, Math.atan2(t.y - p.y, t.x - p.x), t.x, t.y);
      else this.useSuper(p, p.aim, p.x + Math.cos(p.aim) * 250, p.y + Math.sin(p.aim) * 250);
    } else { const w = this.toWorld(this.mouse.x, this.mouse.y); this.useSuper(p, Math.atan2(w.y - p.y, w.x - p.x), w.x, w.y); }
  }

  private makeUnit(heroId: FighterId, team: 0 | 1, isPlayer: boolean, power: number, name: string, slot: number): Unit {
    const H = FIGHTERS[heroId], m = powerMultiplier(power), sp = SPAWNS[team][slot % 3];
    return { H, team, isPlayer, name, mult: m, maxHp: H.hp * m, hp: H.hp * m, x: sp.x, y: sp.y, spawn: sp, vx: 0, vy: 0, r: 18,
      aim: team ? Math.PI : 0, ammo: 3, fireCd: 0, charge: 0, alive: true, respawn: 0, lastHurt: -9, lastFire: -9, flash: 0,
      shield: 0, dash: 0, dvx: 0, dvy: 0, dashHit: new Set(), reveal: 0, kills: 0, deaths: 0, dmgDealt: 0, scoreTime: 0,
      ai: { target: null, think: 0, strafe: Math.random() < .5 ? 1 : -1, strafeT: 0, react: 0.3, stuckT: 0, lastX: sp.x, lastY: sp.y, detour: 0, wander: null, wanderT: 0 } };
  }

  private setup() {
    const names = BOT_NAMES.slice().sort(() => Math.random() - .5);
    const pick = () => FIGHTER_IDS[Math.floor(Math.random() * FIGHTER_IDS.length)];
    const bp = Math.max(1, Math.min(5, this.opts.botPower));
    this.units = [this.makeUnit(this.opts.fighter, 0, true, this.opts.power, this.opts.playerName, 0)];
    for (let i = 1; i < 3; i++) this.units.push(this.makeUnit(pick(), 0, false, bp, names.pop()!, i));
    for (let i = 0; i < 3; i++) this.units.push(this.makeUnit(pick(), 1, false, bp, names.pop()!, i));
    this.player = this.units[0];
    this.skill = Math.max(0.06, 0.32 - (bp - 1) * 0.055);
    this.cam.x = this.player.x; this.cam.y = this.player.y;
  }

  /* ---------- Audio (procedural, no files) ---------- */
  private unlockAudio() {
    if (!this.actx) { try { this.actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { this.actx = null; } }
    if (this.actx && this.actx.state === 'suspended') void this.actx.resume();
  }
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide?: number) {
    if (!this.soundOn || !this.actx) return; const a = this.actx, t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain(); o.type = type;
    o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, cutoff: number) {
    if (!this.soundOn || !this.actx) return; const a = this.actx, t = a.currentTime, len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
    s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start(t);
  }
  private sfx(kind: 'shoot' | 'hit' | 'boom' | 'ko' | 'sup' | 'score' | 'win' | 'lose', id?: FighterId) {
    switch (kind) {
      case 'shoot': if (id === 'vex') this.tone(900, .12, 'sawtooth', .035, .3); else if (id === 'fizz') this.tone(300, .15, 'triangle', .05, 2); else this.noise(.08, .06, 2200); break;
      case 'hit': this.tone(180, .07, 'square', .03, .6); break;
      case 'boom': this.noise(.35, .12, 500); break;
      case 'ko': this.tone(520, .4, 'square', .05, .25); break;
      case 'sup': this.tone(220, .35, 'sawtooth', .05, 4); break;
      case 'score': this.tone(880, .06, 'triangle', .03); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, .22, 'square', .05), i * 120)); break;
      case 'lose': [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, .3, 'triangle', .06), i * 170)); break;
    }
  }

  /* ---------- View ---------- */
  private resize = () => {
    const rect = this.cv.getBoundingClientRect();
    const vv = window.visualViewport;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = rect.width > 10 ? rect.width : (vv?.width || window.innerWidth || 360);
    this.ch = rect.height > 10 ? rect.height : (vv?.height || window.innerHeight || 640);
    const w = Math.round(this.cw * this.dpr), h = Math.round(this.ch * this.dpr);
    if (this.cv.width !== w) this.cv.width = w; if (this.cv.height !== h) this.cv.height = h;
    this.scale = this.ch > this.cw ? this.cw / 600 : Math.min(this.cw / 950, this.ch / 540);
  };
  /** What the engine sees on this device: enough to diagnose a blank match from the database. */
  diagnostics() {
    const rect = this.cv.getBoundingClientRect();
    let center = 'n/a';
    try { const d = this.ctx.getImageData(Math.floor(this.cv.width / 2), Math.floor(this.cv.height / 2), 1, 1).data; center = `${d[0]},${d[1]},${d[2]},${d[3]}`; } catch (e) { center = 'blocked:' + String(e); }
    return { frames: this.frames, error: this.lastError, canvas: [this.cv.width, this.cv.height], rect: [Math.round(rect.width), Math.round(rect.height), Math.round(rect.top), Math.round(rect.left)],
      view: [this.cw, this.ch], scale: Number(this.scale.toFixed(3)), dpr: this.dpr, cam: [Math.round(this.cam.x), Math.round(this.cam.y)], t: Number(this.t.toFixed(2)), center,
      inner: [window.innerWidth, window.innerHeight], visual: window.visualViewport ? [Math.round(window.visualViewport.width), Math.round(window.visualViewport.height)] : null,
      touch: this.touchMode, ua: navigator.userAgent.slice(0, 160) };
  }
  private toWorld(sx: number, sy: number) { const rect = this.cv.getBoundingClientRect(); return { x: (sx - rect.left - this.cw / 2) / this.scale + this.cam.x, y: (sy - rect.top - this.ch / 2) / this.scale + this.cam.y }; }
  private local(e: PointerEvent) { const rect = this.cv.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
  private shake(n: number) { this.cam.shake = Math.max(this.cam.shake, n); }

  /* ---------- Input ---------- */
  private prevent = (e: Event) => e.preventDefault();
  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    this.keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') { e.preventDefault(); this.playerSuper(); }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = false; };
  private onBlur = () => { for (const k in this.keys) this.keys[k] = false; this.mouse.down = false; };
  private onPointerDown = (e: PointerEvent) => {
    this.unlockAudio();
    const p = this.local(e);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      this.touchMode = true;
      if (p.x < this.cw * 0.45) { if (this.stickL.id === null) Object.assign(this.stickL, { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, moved: false }); }
      else if (this.stickR.id === null) Object.assign(this.stickR, { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, moved: false });
      try { this.cv.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    } else {
      this.mouse.active = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 2) this.playerSuper(); else this.mouse.down = true;
    }
  };
  private onPointerMove = (e: PointerEvent) => {
    const p = this.local(e);
    if (e.pointerId === this.stickL.id) { this.stickL.x = p.x; this.stickL.y = p.y; }
    else if (e.pointerId === this.stickR.id) { this.stickR.x = p.x; this.stickR.y = p.y; if (Math.hypot(p.x - this.stickR.ox, p.y - this.stickR.oy) > 18) this.stickR.moved = true; }
    else if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true; }
  };
  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickL.id) this.stickL.id = null;
    else if (e.pointerId === this.stickR.id) {
      const p = this.player, s = this.stickR;
      if (p.alive && !this.over && this.t >= 0) {
        if (s.moved) { const dx = s.x - s.ox, dy = s.y - s.oy, a = Math.atan2(dy, dx), k = Math.min(1, Math.hypot(dx, dy) / 70); this.fire(p, a, p.x + Math.cos(a) * p.H.range * k, p.y + Math.sin(a) * p.H.range * k); }
        else { const t = this.autoTarget(p, p.H.range + 60); if (t) this.fire(p, Math.atan2(t.y - p.y, t.x - p.x), t.x, t.y); else this.fire(p, p.aim, p.x + Math.cos(p.aim) * p.H.range, p.y + Math.sin(p.aim) * p.H.range); }
      }
      s.id = null;
    } else if (e.pointerType === 'mouse') this.mouse.down = false;
  };
  private autoTarget(p: Unit, maxDist: number) {
    let best: Unit | null = null, bd = maxDist;
    for (const e of this.units) { if (!e.alive || e.team === p.team || !this.canSee(p.team, e)) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  /* ---------- Combat ---------- */
  private near(u: Unit) { return Math.hypot(u.x - this.player.x, u.y - this.player.y) < 500; }
  private fire(u: Unit, ang: number, tx: number, ty: number) {
    if (u.ammo < 1 || u.fireCd > 0 || !u.alive || u.dash > 0) return false;
    const H = u.H; u.ammo -= 1; u.fireCd = H.fireGap; u.lastFire = this.now; u.reveal = 1.2; u.aim = ang;
    const ox = u.x + Math.cos(ang) * 20, oy = u.y + Math.sin(ang) * 20;
    if (H.attack === 'spread') {
      const n = H.pellets || 3, sp = H.spread || 0.5, bs = H.bulletSpeed || 700;
      for (let i = 0; i < n; i++) { const a = ang + (i / (n - 1) - .5) * sp + (Math.random() - .5) * .04;
        this.bullets.push({ x: ox, y: oy, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, team: u.team, owner: u, dmg: H.dmg * u.mult, range: H.range, trav: 0, r: 6, kind: H.id }); }
    } else if (H.attack === 'bolt') {
      const bs = H.bulletSpeed || 1000;
      this.bullets.push({ x: ox, y: oy, vx: Math.cos(ang) * bs, vy: Math.sin(ang) * bs, team: u.team, owner: u, dmg: H.dmg * u.mult, range: H.range, trav: 0, r: 7, kind: 'vex' });
    } else {
      let dx = tx - u.x, dy = ty - u.y; const d = Math.hypot(dx, dy); if (d > H.range) { dx *= H.range / d; dy *= H.range / d; }
      this.lobs.push({ x0: u.x, y0: u.y, x1: u.x + dx, y1: u.y + dy, t: 0, dur: 0.5, owner: u, team: u.team, dmg: H.dmg * u.mult, rad: H.splash || 70 });
    }
    if (u.isPlayer || this.near(u)) this.sfx('shoot', H.id);
    return true;
  }
  private useSuper(u: Unit, ang: number, tx: number, ty: number) {
    if (!u.alive || u.charge < 1 || u.dash > 0) return false;
    u.charge = 0; u.reveal = 1.5; u.aim = ang; const H = u.H;
    if (H.sup === 'dash') { u.dash = 0.3; u.dvx = Math.cos(ang) * 900; u.dvy = Math.sin(ang) * 900; u.dashHit = new Set(); }
    else if (H.sup === 'cloud') { let dx = tx - u.x, dy = ty - u.y; const d = Math.hypot(dx, dy); if (d > 380) { dx *= 380 / d; dy *= 380 / d; }
      this.clouds.push({ x: u.x + dx, y: u.y + dy, r: 135, t: 4, team: u.team, owner: u, tick: 0 }); }
    else if (H.sup === 'rail') {
      let ex = u.x, ey = u.y; const cx = Math.cos(ang), cy = Math.sin(ang);
      for (let s = 0; s < 760; s += 8) { const nx = u.x + cx * s, ny = u.y + cy * s; if (blocksShot(tileAt(nx, ny))) break; ex = nx; ey = ny; }
      for (const e of this.units) if (e.alive && e.team !== u.team && distToSeg(e.x, e.y, u.x, u.y, ex, ey) < e.r + 14) this.hurt(e, 2200 * u.mult, u, true);
      this.beams.push({ x0: u.x, y0: u.y, x1: ex, y1: ey, t: .35, team: u.team }); if (this.near(u)) this.shake(5);
    } else { u.shield = 4; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25); this.burst(u.x, u.y, '#ffc93c', 18, 220); }
    if (u.isPlayer || this.near(u)) this.sfx('sup');
    return true;
  }
  private hurt(t: Unit, amount: number, src: Unit | null, isSuper: boolean) {
    if (!t.alive || this.over) return;
    if (t.shield > 0) amount *= 0.35;
    amount = Math.round(amount); t.hp -= amount; t.lastHurt = this.now; t.flash = .12; t.reveal = Math.max(t.reveal, .8);
    if (src) { src.dmgDealt += amount; if (!isSuper) src.charge = Math.min(1, src.charge + amount / src.H.superCost); }
    this.floats.push({ x: t.x + (Math.random() - .5) * 16, y: t.y - 30, txt: amount, life: .8, col: t.team === 0 ? '#ff8a7a' : '#fff3c4', big: !!(src && src.isPlayer) });
    if (t.isPlayer) this.shake(5); else if (src && src.isPlayer) this.sfx('hit');
    if (t.hp <= 0) this.knockout(t, src);
  }
  private knockout(t: Unit, src: Unit | null) {
    t.alive = false; t.hp = 0; t.respawn = 3; t.deaths++; t.dash = 0; t.shield = 0;
    this.burst(t.x, t.y, t.H.color, 26, 300); this.burst(t.x, t.y, '#fff3c4', 10, 180);
    if (src) src.kills++;
    this.feed.unshift({ a: src ? src.name : '', ac: src ? (src.team ? '#ff5a4d' : '#46b0ff') : '#fff', b: t.name, bc: t.team ? '#ff5a4d' : '#46b0ff', t: 4 });
    this.feed.length = Math.min(this.feed.length, 4);
    if (t.isPlayer || (src && src.isPlayer) || this.near(t)) { this.sfx('ko'); this.shake(t.isPlayer ? 12 : 6); }
    if (t.isPlayer && !this.over) this.opts.onKnockout();
  }
  private burst(x: number, y: number, col: string, n: number, sp: number) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = sp * (.3 + Math.random() * .7);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .4 + Math.random() * .4, max: .8, col, size: 2 + Math.random() * 4 }); }
  }
  private inBush(u: Unit) { return tileAt(u.x, u.y) === ','; }
  private canSee(team: 0 | 1, u: Unit) {
    if (u.team === team || !this.inBush(u) || u.reveal > 0) return true;
    for (const o of this.units) if (o.alive && o.team === team && Math.hypot(o.x - u.x, o.y - u.y) < 110) return true;
    return false;
  }

  /* ---------- Movement ---------- */
  private moveUnit(u: Unit, mx: number, my: number, dt: number) {
    let sp = u.H.speed * (u.shield > 0 ? 1.25 : 1);
    if (u.dash > 0) { mx = u.dvx; my = u.dvy; sp = 1; }
    const ox = u.x, oy = u.y; u.x += mx * sp * dt; u.y += my * sp * dt; this.collide(u);
    u.vx = (u.x - ox) / dt; u.vy = (u.y - oy) / dt;
  }
  private collide(u: Unit) {
    const r = u.r;
    for (let pass = 0; pass < 2; pass++) {
      const c0 = Math.floor((u.x - r) / TILE), c1 = Math.floor((u.x + r) / TILE), r0 = Math.floor((u.y - r) / TILE), r1 = Math.floor((u.y + r) / TILE);
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        const t = (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) ? '#' : MAP[rr][cc]; if (!blocksMove(t)) continue;
        const rx = cc * TILE, ry = rr * TILE, px = Math.max(rx, Math.min(u.x, rx + TILE)), py = Math.max(ry, Math.min(u.y, ry + TILE));
        const dx = u.x - px, dy = u.y - py, d = Math.hypot(dx, dy);
        if (d === 0) { const l = u.x - rx, rgt = rx + TILE - u.x, tp = u.y - ry, bt = ry + TILE - u.y, m = Math.min(l, rgt, tp, bt);
          if (m === l) u.x = rx - r; else if (m === rgt) u.x = rx + TILE + r; else if (m === tp) u.y = ry - r; else u.y = ry + TILE + r; }
        else if (d < r) { u.x += dx / d * (r - d); u.y += dy / d * (r - d); }
      }
    }
  }

  /* ---------- Bot brain ---------- */
  private bot(u: Unit, dt: number): [number, number] {
    const H = u.H, A = u.ai; let mx = 0, my = 0;
    A.think -= dt; A.strafeT -= dt; A.react -= dt;
    if (A.strafeT <= 0) { A.strafe *= -1; A.strafeT = .8 + Math.random() * 1.4; }
    if (A.think <= 0) {
      A.think = .2; let best = 1e9, tgt: Unit | null = null;
      for (const e of this.units) {
        if (!e.alive || e.team === u.team || !this.canSee(u.team, e)) continue;
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d < H.range + 260 && (H.attack === 'lob' || lineClear(u.x, u.y, e.x, e.y)) && d < best) { best = d; tgt = e; }
      }
      if (tgt !== A.target) A.react = .25 + this.skill;
      A.target = tgt;
    }
    const t = A.target && A.target.alive ? A.target : null;
    const lowHp = u.hp / u.maxHp < 0.3;
    if (A.detour > 0) { A.detour -= dt; const f = flowDir(FIELDS.zone, u.x, u.y) || { x: 0, y: 0 }; mx = f.x; my = f.y; }
    else if (lowHp && (!t || Math.hypot(t.x - u.x, t.y - u.y) > 220)) {
      const f = flowDir(u.team ? FIELDS.base1 : FIELDS.base0, u.x, u.y); if (f) { mx = f.x; my = f.y; }
    } else if (t) {
      const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
      const fwd = d > H.prefDist + 40 ? 1 : d < H.prefDist - 60 ? -0.8 : 0;
      mx = nx * fwd - ny * A.strafe * .75; my = ny * fwd + nx * A.strafe * .75;
      const inRange = d <= H.range * (H.attack === 'lob' ? 1 : .95);
      if (inRange && A.react <= 0 && u.fireCd <= 0 && u.ammo >= 1) {
        const lead = H.bulletSpeed ? d / H.bulletSpeed * .7 : .35;
        const px = t.x + t.vx * lead, py = t.y + t.vy * lead;
        const err = (Math.random() - .5) * 2 * this.skill;
        const ang = Math.atan2(py - u.y, px - u.x) + err;
        if (this.fire(u, ang, px + (Math.random() - .5) * 180 * this.skill, py + (Math.random() - .5) * 180 * this.skill)) u.fireCd = H.fireGap + Math.random() * .35 + this.skill;
      }
      if (u.charge >= 1) {
        const ang = Math.atan2(t.y - u.y, t.x - u.x);
        if ((H.sup === 'dash' && d < 250) || (H.sup === 'cloud' && d < 380) || (H.sup === 'rail' && d < 700) || (H.sup === 'fortify' && (d < 260 || u.hp / u.maxHp < .5)))
          this.useSuper(u, ang, t.x, t.y);
      }
    } else {
      const dz = Math.hypot(ZONE.x - u.x, ZONE.y - u.y);
      if (dz < ZONE.r - 25) {
        A.wanderT -= dt;
        if (!A.wander || A.wanderT <= 0) { const a = Math.random() * TAU, rr = Math.random() * (ZONE.r - 40); A.wander = { x: ZONE.x + Math.cos(a) * rr, y: ZONE.y + Math.sin(a) * rr }; A.wanderT = 1 + Math.random() * 1.5; }
        const wx = A.wander.x - u.x, wy = A.wander.y - u.y, wd = Math.hypot(wx, wy);
        if (wd > 10) { mx = wx / wd * .6; my = wy / wd * .6; }
      } else { const f = flowDir(FIELDS.zone, u.x, u.y); if (f) { mx = f.x; my = f.y; } }
      if (u.charge >= 1 && H.sup === 'fortify' && u.hp / u.maxHp < .5) this.useSuper(u, u.aim, u.x, u.y);
    }
    A.stuckT += dt;
    if (A.stuckT > .8) { const moved = Math.hypot(u.x - A.lastX, u.y - A.lastY); if (moved < 14 && (mx || my) && A.detour <= 0) A.detour = .9; A.stuckT = 0; A.lastX = u.x; A.lastY = u.y; }
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    if (l > 0.1 && !(t && u.fireCd > H.fireGap - .15)) u.aim = t ? Math.atan2(t.y - u.y, t.x - u.x) : Math.atan2(my, mx);
    return [mx, my];
  }

  private playerInput(u: Unit): [number, number] {
    const k = this.keys; let mx = 0, my = 0;
    if (k['a'] || k['arrowleft']) mx -= 1; if (k['d'] || k['arrowright']) mx += 1;
    if (k['w'] || k['arrowup']) my -= 1; if (k['s'] || k['arrowdown']) my += 1;
    const L = this.stickL;
    if (L.id !== null) { const dx = L.x - L.ox, dy = L.y - L.oy, d = Math.hypot(dx, dy); if (d > 8) { const kk = Math.min(1, d / 60); mx = dx / d * kk; my = dy / d * kk; } }
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    if (!this.touchMode && this.mouse.active) {
      const w = this.toWorld(this.mouse.x, this.mouse.y); u.aim = Math.atan2(w.y - u.y, w.x - u.x);
      if (this.mouse.down) this.fire(u, u.aim, w.x, w.y);
    } else if (this.stickR.id !== null && this.stickR.moved) { u.aim = Math.atan2(this.stickR.y - this.stickR.oy, this.stickR.x - this.stickR.ox); }
    else if (l > .2) u.aim = Math.atan2(my, mx);
    return [mx, my];
  }

  /* ---------- Update ---------- */
  private update(dt: number) {
    this.t += dt;
    const started = this.t >= 0, P = this.player;
    for (const u of this.units) {
      u.flash = Math.max(0, u.flash - dt); u.reveal = Math.max(0, u.reveal - dt); u.shield = Math.max(0, u.shield - dt); u.fireCd = Math.max(0, u.fireCd - dt);
      if (!u.alive) {
        if (!this.over) { u.respawn -= dt; if (u.respawn <= 0) { Object.assign(u, { alive: true, hp: u.maxHp, x: u.spawn.x, y: u.spawn.y, ammo: 3, reveal: 0, lastHurt: this.now }); u.ai.target = null; } }
        continue;
      }
      u.ammo = Math.min(3, u.ammo + dt / u.H.reload);
      if (this.now - u.lastHurt > 3 && this.now - u.lastFire > 2.5 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.13 * dt);
      let mv: [number, number] = [0, 0];
      if (started && !this.over) mv = u === P ? this.playerInput(u) : this.bot(u, dt);
      if (u.dash > 0) {
        u.dash -= dt; this.moveUnit(u, 0, 0, dt);
        for (const e of this.units) if (e.alive && e.team !== u.team && !u.dashHit.has(e) && Math.hypot(e.x - u.x, e.y - u.y) < e.r + u.r + 6) {
          u.dashHit.add(e); this.hurt(e, 1150 * u.mult, u, true); const a = Math.atan2(e.y - u.y, e.x - u.x); e.x += Math.cos(a) * 60; e.y += Math.sin(a) * 60; this.collide(e); this.burst(e.x, e.y, '#fff3c4', 12, 260); }
        if (Math.random() < .8) this.parts.push({ x: u.x, y: u.y, vx: 0, vy: 0, life: .25, max: .25, col: u.H.color, size: 10 });
      } else this.moveUnit(u, mv[0], mv[1], dt);
    }
    for (let i = 0; i < this.units.length; i++) for (let j = i + 1; j < this.units.length; j++) {
      const a = this.units[i], b = this.units[j]; if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r - 4;
      if (d > 0 && d < m) { const p = (m - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * p; a.y -= ny * p; b.x += nx * p; b.y += ny * p; this.collide(a); this.collide(b); }
    }
    for (const b of this.bullets) {
      for (let s = 0; s < 2 && !b.dead; s++) {
        b.x += b.vx * dt / 2; b.y += b.vy * dt / 2; b.trav += Math.hypot(b.vx, b.vy) * dt / 2;
        if (blocksShot(tileAt(b.x, b.y))) { b.dead = true; this.burst(b.x, b.y, '#d9b98a', 4, 120); break; }
        for (const u of this.units) if (u.alive && u.team !== b.team && Math.hypot(u.x - b.x, u.y - b.y) < u.r + b.r) { this.hurt(u, b.dmg, b.owner, false); b.dead = true; this.burst(b.x, b.y, '#fff3c4', 5, 160); break; }
        if (b.trav > b.range) b.dead = true;
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
    for (const l of this.lobs) {
      l.t += dt;
      if (l.t >= l.dur) { l.dead = true;
        for (const u of this.units) if (u.alive && u.team !== l.team && Math.hypot(u.x - l.x1, u.y - l.y1) < l.rad + u.r) this.hurt(u, l.dmg, l.owner, false);
        this.burst(l.x1, l.y1, '#9be86b', 16, 200); this.burst(l.x1, l.y1, '#e6ffd0', 6, 120);
        if (l.owner.isPlayer || this.near(l.owner)) this.sfx('boom'); }
    }
    this.lobs = this.lobs.filter(l => !l.dead);
    for (const c of this.clouds) {
      c.t -= dt; c.tick -= dt;
      if (c.tick <= 0) { c.tick = .25;
        for (const u of this.units) if (u.alive && Math.hypot(u.x - c.x, u.y - c.y) < c.r) {
          if (u.team !== c.team) this.hurt(u, 130 * c.owner.mult, c.owner, true); else u.hp = Math.min(u.maxHp, u.hp + 90); } }
    }
    this.clouds = this.clouds.filter(c => c.t > 0);
    for (const b of this.beams) b.t -= dt; this.beams = this.beams.filter(b => b.t > 0);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .9; p.vy *= .9; p.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0); if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    for (const f of this.floats) { f.y -= 40 * dt; f.life -= dt; } this.floats = this.floats.filter(f => f.life > 0);
    for (const f of this.feed) f.t -= dt; this.feed = this.feed.filter(f => f.t > 0);
    if (started && !this.over) {
      const inZ = [0, 0];
      for (const u of this.units) if (u.alive && Math.hypot(u.x - ZONE.x, u.y - ZONE.y) < ZONE.r) { inZ[u.team]++; u.scoreTime += dt; }
      this.owner = inZ[0] && !inZ[1] ? 0 : inZ[1] && !inZ[0] ? 1 : (inZ[0] && inZ[1] ? 2 : -1);
      if (this.owner === 0 || this.owner === 1) {
        const before = Math.floor(this.score[this.owner] / 10);
        this.score[this.owner] = Math.min(WIN_SCORE, this.score[this.owner] + SCORE_RATE * dt);
        if (Math.floor(this.score[this.owner] / 10) > before) this.sfx('score');
      }
      if (this.score[0] >= WIN_SCORE || this.score[1] >= WIN_SCORE || this.t >= MATCH_SECONDS) this.endMatch();
    }
    this.cam.x += (P.x - this.cam.x) * Math.min(1, dt * 6); this.cam.y += (P.y - this.cam.y) * Math.min(1, dt * 6);
    const vw = this.cw / this.scale, vh = this.ch / this.scale;
    this.cam.x = vw >= WW ? WW / 2 : Math.max(vw / 2, Math.min(WW - vw / 2, this.cam.x));
    this.cam.y = vh >= WH ? WH / 2 : Math.max(vh / 2, Math.min(WH - vh / 2, this.cam.y));
    this.cam.shake = Math.max(0, this.cam.shake - dt * 30);
  }

  private endMatch() {
    this.over = true;
    const s0 = Math.round(this.score[0]), s1 = Math.round(this.score[1]);
    const P = this.player;
    const rank = (u: Unit) => u.kills * 2 + u.dmgDealt / 1500 + u.scoreTime / 6;
    const mvp = this.units.slice().sort((a, b) => rank(b) - rank(a))[0];
    if (s0 > s1) this.sfx('win'); else if (s1 > s0) this.sfx('lose');
    window.setTimeout(() => {
      if (this.ended || this.destroyed) return; this.ended = true;
      this.opts.onEnd({ scoreMine: s0, scoreTheirs: s1, mvp: mvp === P, kills: P.kills, deaths: P.deaths, damage: Math.round(P.dmgDealt) });
    }, 1400);
  }

  /* ---------- Drawing ---------- */
  private rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

  static drawHero(c: CanvasRenderingContext2D, H: FighterSpec, x: number, y: number, r: number, aim: number, ring: string | null, flash: number, t: number, shield: number) {
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, r * .8, r * 1.05, r * .45, 0, 0, TAU); c.fill();
    if (ring) { c.strokeStyle = ring; c.lineWidth = 4; c.beginPath(); c.ellipse(0, r * .8, r * 1.15, r * .52, 0, 0, TAU); c.stroke(); }
    c.translate(0, Math.sin(t * 8) * 1.2);
    c.save(); c.rotate(aim);
    if (H.id === 'rivet') { c.fillStyle = '#3a3f44'; c.beginPath(); c.roundRect ? c.roundRect(r * .3, -6, r * 1.05, 12, 3) : c.rect(r * .3, -6, r * 1.05, 12); c.fill(); c.fillStyle = '#ffc93c'; c.fillRect(r * 1.15, -7, 6, 14); }
    else if (H.id === 'fizz') { c.fillStyle = '#9be86b'; c.beginPath(); c.arc(r * 1.05, 0, 7, 0, TAU); c.fill(); c.fillStyle = '#e6ffd0'; c.fillRect(r * 1.05 + 5, -2.5, 8, 5); }
    else if (H.id === 'vex') { c.fillStyle = '#2b2440'; c.fillRect(r * .2, -4, r * 1.6, 8); c.fillStyle = '#e2d4ff'; c.fillRect(r * 1.6, -2, 6, 4); }
    else { c.fillStyle = H.dark; for (const s of [-1, 1]) { c.beginPath(); c.arc(r * .95, s * r * .55, 8, 0, TAU); c.fill(); } }
    c.restore();
    c.fillStyle = H.color; c.strokeStyle = H.dark; c.lineWidth = 3;
    if (H.id === 'boulder') { c.beginPath(); c.roundRect ? c.roundRect(-r * 1.05, -r * 1.05, r * 2.1, r * 2.05, 9) : c.rect(-r * 1.05, -r * 1.05, r * 2.1, r * 2.05); c.fill(); c.stroke();
      c.fillStyle = H.dark; for (const [px, py] of [[-.75, -.75], [.75, -.75], [-.75, .7], [.75, .7]]) { c.beginPath(); c.arc(px * r, py * r, 2.5, 0, TAU); c.fill(); }
      c.fillStyle = '#5a5045'; c.fillRect(-r * .7, -r * 1.55, r * .4, r * .55);
    } else { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke(); }
    if (H.id === 'rivet') { c.fillStyle = '#3a3f44'; c.fillRect(-r * .95, -r * .55, r * 1.9, r * .3); }
    if (H.id === 'fizz') { c.fillStyle = '#e6ffd0'; c.beginPath(); c.arc(-r * .3, -r * .85, 4, 0, TAU); c.arc(r * .25, -r * 1.0, 3, 0, TAU); c.fill(); c.fillStyle = H.dark; c.fillRect(-r * .35, -r * 1.25, r * .7, r * .35); }
    if (H.id === 'vex') { c.fillStyle = H.dark; c.beginPath(); c.moveTo(-r, -r * .1); c.quadraticCurveTo(0, -r * 1.9, r, -r * .1); c.quadraticCurveTo(0, -r * .9, -r, -r * .1); c.fill(); }
    const ax = Math.cos(aim), ay = Math.sin(aim), ex = ax * r * .3, ey = ay * r * .22 - r * .12;
    for (const s of [-1, 1]) {
      const cx = ex + s * r * .32, cy = ey;
      c.fillStyle = H.id === 'rivet' ? '#bfe7ff' : '#fff'; c.beginPath(); c.arc(cx, cy, r * .24, 0, TAU); c.fill();
      c.fillStyle = '#1a1714'; c.beginPath(); c.arc(cx + ax * 3, cy + ay * 3, r * .11, 0, TAU); c.fill();
    }
    if (shield > 0) { c.strokeStyle = 'rgba(255,201,60,.85)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, r * 1.45, 0, TAU); c.stroke(); c.fillStyle = 'rgba(255,201,60,.12)'; c.fill(); }
    if (flash > 0) { c.globalAlpha = Math.min(1, flash * 6); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, r + 1, 0, TAU); c.fill(); c.globalAlpha = 1; }
    c.restore();
  }

  private drawWorld() {
    const ctx = this.ctx, now = this.now, P = this.player;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#15130f'; ctx.fillRect(0, 0, this.cw, this.ch);
    const sx = (Math.random() - .5) * this.cam.shake, sy = (Math.random() - .5) * this.cam.shake;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * (this.cw / 2 - this.cam.x * this.scale + sx), this.dpr * (this.ch / 2 - this.cam.y * this.scale + sy));
    ctx.drawImage(groundCv!, 0, 0);
    const ownerCol = this.owner === 0 ? '70,176,255' : this.owner === 1 ? '255,90,77' : this.owner === 2 ? '255,201,60' : '230,220,200';
    ctx.fillStyle = `rgba(${ownerCol},${this.owner >= 0 ? .2 : .08})`; ctx.beginPath(); ctx.arc(ZONE.x, ZONE.y, ZONE.r, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(ZONE.x, ZONE.y); ctx.rotate(now * .4);
    ctx.strokeStyle = `rgba(${ownerCol},.85)`; ctx.lineWidth = 6; ctx.setLineDash([22, 14]); ctx.beginPath(); ctx.arc(0, 0, ZONE.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    ctx.fillStyle = '#2f2c27'; ctx.beginPath(); ctx.arc(ZONE.x, ZONE.y, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(${ownerCol},${.6 + Math.sin(now * 5) * .25})`; ctx.beginPath(); ctx.arc(ZONE.x, ZONE.y, 15, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ZONE.x, ZONE.y, 26, 0, TAU); ctx.stroke();
    for (const c of this.clouds) {
      const fr = Math.min(1, c.t, (4 - c.t) * 4);
      ctx.fillStyle = `rgba(${c.team ? '255,120,90' : '120,230,110'},${.22 * fr})`;
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + now * .5; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * c.r * .45, c.y + Math.sin(a) * c.r * .45, c.r * .55, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = `rgba(${c.team ? '255,90,77' : '127,211,78'},${.7 * fr})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.stroke();
    }
    if (P.alive && !this.over && this.t >= 0) {
      let show = false, a = P.aim, k = 1;
      if (!this.touchMode && this.mouse.active) { show = true; const w = this.toWorld(this.mouse.x, this.mouse.y); if (P.H.attack === 'lob') k = Math.min(1, Math.hypot(w.x - P.x, w.y - P.y) / P.H.range); }
      if (this.stickR.id !== null && this.stickR.moved) { show = true; a = Math.atan2(this.stickR.y - this.stickR.oy, this.stickR.x - this.stickR.ox); k = Math.min(1, Math.hypot(this.stickR.x - this.stickR.ox, this.stickR.y - this.stickR.oy) / 70); }
      if (show) {
        ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
        if (P.H.attack === 'lob') { const tx = P.x + Math.cos(a) * P.H.range * k, ty = P.y + Math.sin(a) * P.H.range * k;
          ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(tx, ty, P.H.splash || 70, 0, TAU); ctx.fill(); ctx.stroke(); }
        else { const sp = P.H.attack === 'spread' ? (P.H.spread || 0.5) / 2 + .03 : .04;
          ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.arc(P.x, P.y, P.H.range, a - sp, a + sp); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
    }
    const vis = this.units.filter(u => u.alive && this.canSee(0, u)).sort((a, b) => a.y - b.y);
    for (const u of vis) ArenaEngine.drawHero(ctx, u.H, u.x, u.y, u.r, u.aim, u.team ? '#ff5a4d' : '#46b0ff', u.flash, now + u.x * .01, u.shield);
    for (const l of this.lobs) {
      const k = l.t / l.dur, x = l.x0 + (l.x1 - l.x0) * k, y = l.y0 + (l.y1 - l.y0) * k, h = Math.sin(k * Math.PI) * 70;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, 8, 4, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y - h); ctx.rotate(k * 10);
      ctx.fillStyle = '#9be86b'; this.rrect(ctx, -6, -9, 12, 18, 4); ctx.fill(); ctx.fillStyle = '#e6ffd0'; ctx.fillRect(-3, -14, 6, 6); ctx.restore();
      ctx.strokeStyle = 'rgba(155,232,107,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(l.x1, l.y1, l.rad * (1 - k * .3), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = .93; ctx.drawImage(bushCv!, 0, 0); ctx.globalAlpha = 1;
    for (const u of vis) if (u.team === 0 && this.inBush(u)) { ctx.globalAlpha = .45; ArenaEngine.drawHero(ctx, u.H, u.x, u.y, u.r, u.aim, '#46b0ff', 0, now, u.shield); ctx.globalAlpha = 1; }
    for (const b of this.bullets) {
      ctx.strokeStyle = b.kind === 'vex' ? '#e2d4ff' : b.team ? '#ffb4a8' : '#cfe9ff'; ctx.lineWidth = b.kind === 'vex' ? 6 : 5; ctx.lineCap = 'round';
      const l = b.kind === 'vex' ? .03 : .018; ctx.beginPath(); ctx.moveTo(b.x - b.vx * l, b.y - b.vy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, TAU); ctx.fill();
    }
    for (const b of this.beams) {
      ctx.strokeStyle = `rgba(226,212,255,${b.t / .35})`; ctx.lineWidth = 22 * b.t / .35 + 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
    }
    for (const p of this.parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const u of vis) {
      const w = 52, x = u.x - w / 2, y = u.y - u.r - 24;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; this.rrect(ctx, x - 2, y - 2, w + 4, 11, 4); ctx.fill();
      ctx.fillStyle = u.isPlayer ? '#7fd34e' : u.team ? '#ff5a4d' : '#46b0ff'; this.rrect(ctx, x, y, w * Math.max(0, u.hp / u.maxHp), 7, 3); ctx.fill();
      ctx.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(u.name, u.x + 1, y - 4);
      ctx.fillStyle = u.isPlayer ? '#fff3c4' : '#f4ead8'; ctx.fillText(u.name, u.x, y - 5);
      if (u.isPlayer) for (let i = 0; i < 3; i++) { const f = Math.max(0, Math.min(1, u.ammo - i)); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(u.x - 26 + i * 18, u.y + u.r + 12, 16, 5); ctx.fillStyle = f >= 1 ? '#ffc93c' : '#a17a2a'; ctx.fillRect(u.x - 26 + i * 18, u.y + u.r + 12, 16 * f, 5); }
      if (u.charge >= 1) { ctx.strokeStyle = `rgba(255,201,60,${.5 + Math.sin(now * 8) * .3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 9, 0, TAU); ctx.stroke(); }
    }
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.life * 2); ctx.font = `800 ${f.big ? 18 : 14}px "Barlow Condensed", Impact, sans-serif`;
      ctx.fillStyle = '#1a1714'; ctx.fillText(String(f.txt), f.x + 1.5, f.y + 1.5); ctx.fillStyle = f.col; ctx.fillText(String(f.txt), f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawHUD() {
    const ctx = this.ctx, L = this.opts.labels, P = this.player, cw = this.cw, ch = this.ch;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const top = 10, cx = cw / 2, bw = Math.min(420, cw - 140);
    ctx.fillStyle = 'rgba(20,18,15,.82)'; this.rrect(ctx, cx - bw / 2 - 8, top, bw + 16, 52, 12); ctx.fill();
    const half = bw / 2 - 34;
    ctx.fillStyle = '#15130f'; this.rrect(ctx, cx - bw / 2, top + 26, half, 14, 5); ctx.fill(); this.rrect(ctx, cx + 34, top + 26, half, 14, 5); ctx.fill();
    ctx.fillStyle = '#46b0ff'; this.rrect(ctx, cx - 34 - half * this.score[0] / 100, top + 26, half * this.score[0] / 100, 14, 5); ctx.fill();
    ctx.fillStyle = '#ff5a4d'; this.rrect(ctx, cx + 34, top + 26, half * this.score[1] / 100, 14, 5); ctx.fill();
    ctx.font = '800 20px "Barlow Condensed", Impact, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#46b0ff'; ctx.fillText(String(Math.floor(this.score[0])), cx - bw / 4 - 10, top + 21);
    ctx.fillStyle = '#ff5a4d'; ctx.fillText(String(Math.floor(this.score[1])), cx + bw / 4 + 10, top + 21);
    const tl = Math.max(0, Math.ceil(MATCH_SECONDS - Math.max(0, this.t)));
    ctx.fillStyle = tl <= 20 ? '#ff5a4d' : '#f4ead8'; ctx.font = '800 18px "Barlow Condensed", Impact, sans-serif';
    ctx.fillText(`${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`, cx, top + 38);
    ctx.font = '600 13px "Barlow Condensed", sans-serif';
    ctx.fillStyle = this.owner === 0 ? '#46b0ff' : this.owner === 1 ? '#ff5a4d' : this.owner === 2 ? '#ffc93c' : '#b3a893';
    ctx.fillText((this.owner === 0 ? L.yourTeamHolds : this.owner === 1 ? L.enemyHolds : this.owner === 2 ? L.contested : L.reactorEmpty).toUpperCase(), cx, top + 66);
    ctx.textAlign = 'right'; ctx.font = '600 16px "Barlow Condensed", sans-serif';
    this.feed.forEach((f, i) => {
      const y = top + 18 + i * 24, x = cw - 14;
      ctx.globalAlpha = Math.min(1, f.t);
      const bw2 = ctx.measureText(f.b).width, aw = f.a ? ctx.measureText(f.a + '  ✕  ').width : ctx.measureText('✕  ').width;
      ctx.fillStyle = 'rgba(20,18,15,.75)'; this.rrect(ctx, x - bw2 - aw - 10, y - 15, bw2 + aw + 16, 21, 6); ctx.fill();
      ctx.fillStyle = f.bc; ctx.fillText(f.b, x, y);
      ctx.fillStyle = '#f4ead8'; ctx.fillText('✕  ', x - bw2, y);
      if (f.a) { ctx.fillStyle = f.ac; ctx.fillText(f.a, x - bw2 - ctx.measureText('✕  ').width, y); }
    });
    ctx.globalAlpha = 1;
    if (!this.touchMode) {
      const w = 190, x = cx - w / 2, y = ch - 44;
      ctx.fillStyle = 'rgba(20,18,15,.82)'; this.rrect(ctx, x - 6, y - 6, w + 12, 34, 10); ctx.fill();
      ctx.fillStyle = '#15130f'; this.rrect(ctx, x, y, w, 22, 6); ctx.fill();
      ctx.fillStyle = P.charge >= 1 ? '#ffc93c' : '#a17a2a'; this.rrect(ctx, x, y, w * P.charge, 22, 6); ctx.fill();
      ctx.textAlign = 'center'; ctx.font = '800 13px "Barlow Condensed", Impact, sans-serif'; ctx.fillStyle = P.charge >= 1 ? '#2a1d05' : '#f4ead8';
      ctx.fillText((P.charge >= 1 ? `${P.H.superName} · ${L.superReady}` : `${L.superCharge} ${Math.floor(P.charge * 100)}%`).toUpperCase(), cx, y + 16);
    } else {
      const drawStick = (s: Stick, aim: boolean, baseX: number, baseY: number) => {
        const ox = s.id !== null ? s.ox : baseX, oy = s.id !== null ? s.oy : baseY;
        ctx.globalAlpha = s.id !== null ? .6 : .25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ox, oy, 58, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#f4ead8'; ctx.lineWidth = 3; ctx.stroke();
        let kx = 0, ky = 0; if (s.id !== null) { const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), m = Math.min(d, 58); if (d) { kx = dx / d * m; ky = dy / d * m; } }
        ctx.fillStyle = aim ? '#ffc93c' : '#f4ead8'; ctx.beginPath(); ctx.arc(ox + kx, oy + ky, 26, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      };
      drawStick(this.stickL, false, 100, ch - 100);
      drawStick(this.stickR, true, cw - 80, ch - 110);
    }
    ctx.textAlign = 'center';
    if (!P.alive && !this.over) { ctx.fillStyle = 'rgba(20,18,15,.6)'; ctx.fillRect(0, ch / 2 - 46, cw, 76);
      ctx.font = '800 30px "Barlow Condensed", Impact, sans-serif'; ctx.fillStyle = '#f4ead8'; ctx.fillText(`${L.backIn} ${Math.ceil(P.respawn)}`, cx, ch / 2 + 6); }
    if (this.t < 0) {
      const n = Math.ceil(-this.t);
      ctx.font = '800 26px "Barlow Condensed", Impact, sans-serif'; ctx.fillStyle = '#ffc93c'; ctx.fillText(L.holdReactor, cx, ch / 2 - 40);
      ctx.font = '800 72px "Barlow Condensed", Impact, sans-serif'; ctx.fillStyle = '#f4ead8'; ctx.fillText(n > 0 ? String(n) : L.go, cx, ch / 2 + 40);
    } else if (this.t < .8) { ctx.font = '800 72px "Barlow Condensed", Impact, sans-serif'; ctx.globalAlpha = 1 - this.t / .8; ctx.fillStyle = '#ffc93c'; ctx.fillText(L.go, cx, ch / 2 + 30); ctx.globalAlpha = 1; }
    if (this.over) { ctx.font = '800 54px "Barlow Condensed", Impact, sans-serif'; ctx.fillStyle = '#ffc93c'; ctx.fillText(this.score[0] > this.score[1] ? L.victory : this.score[1] > this.score[0] ? L.defeat : L.draw, cx, ch / 2); }
    if (ch > cw) { ctx.font = '600 15px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#b3a893'; ctx.fillText(L.turnPhone, cx, top + 90); }
  }

  private frame = (t: number) => {
    if (this.destroyed) return;
    const dt = Math.max(0, Math.min(0.05, (t - this.last) / 1000)); this.last = t; this.now += dt;
    try {
      if (this.frames % 30 === 0) this.resize();
      this.update(dt); this.drawWorld(); this.drawHUD(); this.frames++;
    } catch (error) {
      this.lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (this.frames === 0 || this.lastError !== null) { /* keep going: one bad frame should not freeze the match */ }
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}

/** Draws a fighter portrait onto a small canvas for the lobby cards. */
export function drawFighterPortrait(canvas: HTMLCanvasElement, fighter: FighterId) {
  const c = canvas.getContext('2d'); if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
  const s = canvas.width / 200; c.scale(s, s);
  ArenaEngine.drawHero(c, FIGHTERS[fighter], 100, 60, 34, 0.35, null, 0, 0, 0);
}
