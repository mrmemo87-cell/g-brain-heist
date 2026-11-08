// Proving Grounds match engine: a 3-vs-3 Reactor Rush match on a canvas, player plus five bots.
// The engine knows nothing about Supabase. It reports knockouts and the final score through callbacks.

import { FIGHTERS, MATCH_SECONDS, WIN_SCORE, powerMultiplier, type ArenaMatchOutcome, type FighterId, type FighterSpec } from './arenaModel';
import { ArenaAudio, type SfxName } from './arenaAudio';

const F_DISPLAY = "Bungee, 'IBM Plex Sans', sans-serif";
const F_BODY = "'IBM Plex Sans', sans-serif";
const TEAM_RGB = ['70,176,255', '255,90,77'] as const;

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

/* ---------- Art assets (generated sprites in /arena; the procedural art below is the fallback) ---------- */
const ASSET_NAMES = ['rivet', 'fizz', 'vex', 'boulder', 'ground', 'water', 'wall', 'crate', 'bush', 'reactor'] as const;
type AssetName = typeof ASSET_NAMES[number];
const ASSETS: Partial<Record<AssetName, HTMLImageElement>> = {};
const SILHOUETTES: Partial<Record<AssetName, HTMLCanvasElement>> = {};
let assetsVersion = 0; let assetsRequested = false;
/** Starts loading the sprites once per page. Each image that fails simply keeps the procedural look. */
export function loadArenaAssets(base = '/arena/') {
  if (assetsRequested || typeof Image === 'undefined') return; assetsRequested = true;
  for (const name of ASSET_NAMES) {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => {
      ASSETS[name] = img;
      if (['rivet', 'fizz', 'vex', 'boulder'].includes(name)) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
        if (x) { x.drawImage(img, 0, 0, 256, 256); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); SILHOUETTES[name] = c; }
      }
      assetsVersion++;
    };
    img.onerror = () => undefined;
    img.src = `${base}${name}.webp`;
  }
}
export const arenaSprite = (name: AssetName) => ASSETS[name] ?? null;

/* ---------- Animated fighters: Blender-rendered strips in /arena/anim (the still sprite above is the fallback) ---------- */
export type AnimName = 'idle' | 'run' | 'attack' | 'ko';
const ANIM_FRAMES: Record<AnimName, number> = { idle: 8, run: 10, attack: 6, ko: 10 };
const ANIM_FPS: Record<AnimName, number> = { idle: 8, run: 16, attack: 20, ko: 18 };
/** Each sheet has one row per direction: 0 = right, then clockwise on screen in 45-degree steps. */
const DIRS = 8;
const dirOf = (ang: number) => ((Math.round(ang / (Math.PI / 4)) % DIRS) + DIRS) % DIRS;
const angDiff = (a: number, b: number) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const KO_SECONDS = ANIM_FRAMES.ko / ANIM_FPS.ko;
/** Frames are square (the strip's height); the fighter's feet sit this far down each frame. */
const FEET = 204 / 256;
const ANIMS: Partial<Record<string, HTMLImageElement>> = {};
const animsRequested = new Set<string>();
function loadFighterAnims(f: FighterId, base: string) {
  return Promise.all((Object.keys(ANIM_FRAMES) as AnimName[]).map((a) => new Promise<void>((resolve) => {
    const key = `${f}_${a}`; if (animsRequested.has(key) || typeof Image === 'undefined') { resolve(); return; } animsRequested.add(key);
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { ANIMS[key] = img; resolve(); };
    img.onerror = () => { animsRequested.delete(key); resolve(); };
    img.src = `${base}${key}.webp`;
  })));
}
/**
 * Loads the animation sheets when a match is created: the student's own fighter first, then the
 * fighters in the match one at a time, so a slow connection gets the important one quickly.
 * Anything not loaded yet is drawn with its still sprite.
 */
export function loadArenaAnims(first?: FighterId, others: FighterId[] = FIGHTER_IDS, base = '/arena/anim/') {
  const order = [...new Set([...(first ? [first] : []), ...others])];
  void order.reduce<Promise<unknown>>((p, f) => p.then(() => loadFighterAnims(f, base)), Promise.resolve());
}
// One small scratch canvas turns any frame white for the hit flash, instead of keeping a white copy of every strip.
let flashCv: HTMLCanvasElement | null = null;
function whiteFrame(img: HTMLImageElement, frame: number, row = 0, F = img.height) {
  if (!flashCv) flashCv = document.createElement('canvas');
  if (flashCv.width !== F) { flashCv.width = F; flashCv.height = F; }
  const x = flashCv.getContext('2d'); if (!x) return null;
  x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, F, F);
  x.drawImage(img, frame * F, row * F, F, F, 0, 0, F, F);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, F, F);
  x.globalCompositeOperation = 'source-over';
  return flashCv;
}
export interface HeroPose { anim?: AnimName; frame?: number; sq?: number; ox?: number; oy?: number; face?: number }
function tilePattern(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const x = c.getContext('2d'); if (!x) return null; x.drawImage(img, 0, 0, size, size);
  return ctx.createPattern(c, 'repeat');
}

/* ---------- Pre-rendered map art ---------- */
let groundCv: HTMLCanvasElement | null = null, bushCv: HTMLCanvasElement | null = null, paintedVersion = -1;
function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function paintMap() {
  if (groundCv && bushCv && paintedVersion === assetsVersion) return;
  paintedVersion = assetsVersion;
  groundCv = groundCv ?? document.createElement('canvas'); bushCv = bushCv ?? document.createElement('canvas');
  groundCv.width = bushCv.width = WW; groundCv.height = bushCv.height = WH;
  const g = groundCv.getContext('2d')!, b = bushCv.getContext('2d')!, R = rng(7);
  const groundImg = ASSETS.ground, waterImg = ASSETS.water, wallImg = ASSETS.wall, crateImg = ASSETS.crate, bushImg = ASSETS.bush;
  const groundPat = groundImg ? tilePattern(g, groundImg, 240) : null, waterPat = waterImg ? tilePattern(g, waterImg, 160) : null, wallPat = wallImg ? tilePattern(g, wallImg, 120) : null;
  g.fillStyle = groundPat ?? '#4b463b'; g.fillRect(0, 0, WW, WH);
  if (groundPat) {
    // Textured floor: skip the procedural checker, keep a soft vignette so the arena still reads as a room.
    const v = g.createRadialGradient(WW / 2, WH / 2, WH * 0.35, WW / 2, WH / 2, WW * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = v; g.fillRect(0, 0, WW, WH);
  } else
  {
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
  }
  for (const t of [0, 1] as const) {
    const p = SPAWNS[t]; const cx = p[1].x;
    g.fillStyle = t ? 'rgba(255,90,77,.16)' : 'rgba(70,176,255,.16)'; g.fillRect(cx - 60, p[0].y - 40, 120, 120);
    g.strokeStyle = t ? 'rgba(255,90,77,.5)' : 'rgba(70,176,255,.5)'; g.lineWidth = 3; g.setLineDash([10, 8]); g.strokeRect(cx - 60, p[0].y - 40, 120, 120); g.setLineDash([]);
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = c * TILE, y = r * TILE, t = MAP[r][c];
    if (t === '~') {
      if (waterPat) { g.fillStyle = waterPat; g.fillRect(x, y, TILE, TILE); g.fillStyle = 'rgba(0,40,80,.18)'; g.fillRect(x, y, TILE, 3); g.fillRect(x, y, 3, TILE); }
      else {
        g.fillStyle = '#1d5a70'; g.fillRect(x, y, TILE, TILE);
        g.strokeStyle = 'rgba(160,220,240,.35)'; g.lineWidth = 2;
        for (let k = 0; k < 2; k++) { const yy = y + 12 + k * 16; g.beginPath(); g.moveTo(x + 6, yy); g.quadraticCurveTo(x + 13, yy - 4, x + 20, yy); g.quadraticCurveTo(x + 27, yy + 4, x + 34, yy); g.stroke(); }
      }
    } else if (t === '#') {
      const edge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
      if (edge && wallPat) { g.fillStyle = wallPat; g.fillRect(x, y, TILE, TILE); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y, TILE, TILE); }
      else if (!edge && crateImg) {
        g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 20, y + 34, 20, 7, 0, 0, TAU); g.fill();
        g.drawImage(crateImg, x - 4, y - 12, TILE + 8, TILE + 10);
      } else if (edge) {
        g.fillStyle = '#2f2c27'; g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#3d3933'; g.fillRect(x + 2, y + 2, TILE - 4, TILE - 10);
        g.fillStyle = '#5c564c'; for (const [px, py] of [[7, 7], [33, 7], [7, 27], [33, 27]]) { g.beginPath(); g.arc(x + px, y + py, 2, 0, TAU); g.fill(); }
      } else {
        g.fillStyle = '#4a2f18'; g.fillRect(x, y, TILE, TILE);
        g.fillStyle = '#8a5b31'; g.fillRect(x + 1, y + 1, TILE - 2, TILE - 9);
        g.strokeStyle = '#5e3c1e'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, TILE - 6, TILE - 13);
        g.beginPath(); g.moveTo(x + 4, y + 4); g.lineTo(x + TILE - 4, y + TILE - 11); g.moveTo(x + TILE - 4, y + 4); g.lineTo(x + 4, y + TILE - 11); g.stroke();
      }
    } else if (t === ',' && bushImg) {
      // One generated bush per tile, nudged so clusters overlap into a hedge.
      b.drawImage(bushImg, x - 10 + (R() - .5) * 8, y - 12 + (R() - .5) * 8, TILE + 20, TILE + 20);
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
  // Game feel: knockback velocity, squash spring, shot recoil, lagging health bar, pending super, dust timer.
  kx: number; ky: number; sq: number; sqv: number; recoil: number; ghostHp: number; phase: number; wind: Wind | null; dustT: number; wasMoving: boolean;
  /** Where the body faces: turns smoothly toward the aim while shooting, otherwise toward where it runs. */
  face: number;
}
interface Wind { ang: number; tx: number; ty: number; t: number; max: number }
interface Corpse { H: FighterSpec; x: number; y: number; aim: number; face: number; r: number; t: number; near: boolean }
interface Chunk { x: number; y: number; z: number; vx: number; vy: number; vz: number; rot: number; vr: number; s: number; col: string; life: number }
interface Swoosh { x: number; y: number; ang: number; r: number; life: number; max: number }
interface HitArrow { ang: number; life: number }
interface Bullet { x: number; y: number; vx: number; vy: number; team: 0 | 1; owner: Unit; dmg: number; range: number; trav: number; r: number; kind: string; dead?: boolean }
interface Lob { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; owner: Unit; team: 0 | 1; dmg: number; rad: number; dead?: boolean }
interface Cloud { x: number; y: number; r: number; t: number; team: 0 | 1; owner: Unit; tick: number }
interface Beam { x0: number; y0: number; x1: number; y1: number; t: number; team: 0 | 1 }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; size: number; streak?: boolean; grow?: number }
interface FloatText { x: number; y: number; txt: string | number; life: number; col: string; big: boolean }
interface FeedItem { a: string; ac: string; b: string; bc: string; t: number; af: FighterId | null; bf: FighterId }
interface Ring { x: number; y: number; r: number; max: number; life: number; maxLife: number; col: string; width: number }
interface Callout { text: string; sub?: string; life: number; max: number; col: string }
interface Ghost { x: number; y: number; aim: number; H: FighterSpec; life: number }
interface SpawnFx { x: number; y: number; life: number; col: string }
interface Confetti { x: number; y: number; vx: number; vy: number; rot: number; vr: number; col: string; w: number; h: number; life: number }
interface Stick { id: number | null; ox: number; oy: number; x: number; y: number; moved: boolean }

export interface ArenaEngineOptions {
  fighter: FighterId;
  power: number;
  botPower: number;
  playerName: string;
  soundEnabled: boolean;
  labels: { holdReactor: string; backIn: string; victory: string; defeat: string; draw: string; go: string; yourTeamHolds: string; enemyHolds: string; contested: string; reactorEmpty: string; superReady: string; superCharge: string; turnPhone: string;
    firstKo?: string; doubleKo?: string; tripleKo?: string; reactorSecured?: string; reactorLost?: string; shielded?: string };
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
  private ended = false;
  readonly audio: ArenaAudio;
  /** While a respawn question is open the match freezes; the clock and the bots wait too. */
  paused = false;
  private rotatedFlag = false;
  /** Set by the view when it turns the match a quarter turn so a phone held upright still plays in landscape. */
  get rotated() { return this.rotatedFlag; }
  set rotated(on: boolean) { if (on !== this.rotatedFlag) { this.rotatedFlag = on; this.resize(); } }
  // Game feel: hit-stop, slow motion, flashes, shockwaves, callouts, dash ghosts, spawn beams, confetti.
  private timeScale = 1; private slowT = 0; private hitStop = 0; private realNow = 0; private musicDucked = false; private musicStarted = false;
  private flashFx = { a: 0, col: '255,255,255' };
  private rings: Ring[] = []; private callouts: Callout[] = []; private ghosts: Ghost[] = []; private spawnFx: SpawnFx[] = []; private confetti: Confetti[] = [];
  private corpses: Corpse[] = []; private chunks: Chunk[] = []; private swooshes: Swoosh[] = []; private hitArrows: HitArrow[] = [];
  private kick = { x: 0, y: 0 }; private lastStop = -9; private lastHitSfx = -9; private lastBuzz = -9; private combo = 0; private comboT = -9; private heartT = 0; private finalTen = false; private lastClockTick = 99;
  private killTimes: number[] = []; private firstKoDone = false; private playerWasInBush = false; private lastHealFx = 0; private lastCountdown = 99; private ghostT = 0;
  /** Frames drawn so far and the last error seen in the loop, for device diagnostics. */
  frames = 0; lastError: string | null = null;
  private superHit = { x: 0, y: 0, r: 0 };

  constructor(canvas: HTMLCanvasElement, opts: ArenaEngineOptions) {
    this.cv = canvas; this.ctx = canvas.getContext('2d')!; this.opts = opts;
    this.audio = new ArenaAudio(opts.soundEnabled);
    // The match starts from a tap on Battle, which counts as the gesture browsers need before sound.
    this.audio.unlock();
    this.audio.prepareFighter(opts.fighter);
    this.audio.voice('ann_intro');
    loadArenaAssets();
    try { void document.fonts?.load(`400 20px ${F_DISPLAY}`); } catch { /* fallback fonts are fine */ }
    paintMap();
    this.setup();
    loadArenaAnims(opts.fighter, this.units.map((u) => u.H.id));
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
    this.audio.destroy();
  }

  setSound(on: boolean) { this.audio.setEnabled(on); }
  get superReady() { return this.player.alive && this.player.charge >= 1; }

  /** Respawn question outcome. Right: back at once with a full super and a 3-second shield. Wrong: wait 2 seconds longer. */
  respawnOutcome(correct: boolean) {
    const p = this.player;
    if (correct) {
      if (!p.alive) { Object.assign(p, { alive: true, hp: p.maxHp, x: p.spawn.x, y: p.spawn.y, ammo: 3, reveal: 0, lastHurt: this.now, respawn: 0 }); }
      p.charge = 1; p.shield = 3; this.burst(p.x, p.y, '#ffc93c', 22, 240); this.sfx('correct'); this.sfx('respawn', { delay: 0.2 } as { vol?: number; rate?: number });
      this.spawnFx.push({ x: p.x, y: p.y, life: 0.7, col: '255,201,60' }); this.ring(p.x, p.y, 110, 'rgba(255,201,60,.9)', 0.5, 8);
      this.callout(this.opts.labels.shielded ?? 'SHIELDED!', '#ffc93c', undefined, 1.2);
      this.audio.voice('ann_shielded', { priority: true });
    } else { this.sfx('wrong', { vol: 0.6 }); if (!p.alive) p.respawn += 2; this.audio.voice('ann_wrong', { priority: true }); }
  }
  /** Kept for older callers: the small bonus. */
  applyRespawnBonus() { this.respawnOutcome(true); }

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
      kx: 0, ky: 0, sq: 0, sqv: 0, recoil: 0, ghostHp: H.hp * m, phase: Math.random() * 10, wind: null, dustT: 0, wasMoving: false, face: team ? Math.PI : 0,
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

  /* ---------- Audio ---------- */
  private unlockAudio() { this.audio.unlock(); }
  private sfx(name: SfxName, opts?: { vol?: number; rate?: number }) { this.audio.play(name, opts); }
  private shotSfx(id: FighterId) { this.sfx(`shot_${id}` as SfxName, { rate: 0.95 + Math.random() * 0.1 }); }

  /* ---------- Effects ---------- */
  private ring(x: number, y: number, max: number, col: string, life = 0.45, width = 6) { this.rings.push({ x, y, r: 6, max, life, maxLife: life, col, width }); }
  private callout(text: string, col = '#ffc93c', sub?: string, max = 1.6) { this.callouts = this.callouts.filter((c) => c.text !== text).slice(-2); this.callouts.push({ text, sub, life: max, max, col }); }
  /** A small push of the camera in one direction (recoil, incoming hit), on top of the random shake. */
  private kickCam(ang: number, amt: number) { this.kick.x += Math.cos(ang) * amt; this.kick.y += Math.sin(ang) * amt; }
  /** Phone vibration where the browser supports it (Android); iPhones ignore it. */
  private buzz(pattern: number | number[]) {
    if (!this.touchMode || this.realNow - this.lastBuzz < 0.08) return; this.lastBuzz = this.realNow;
    try { navigator.vibrate?.(pattern); } catch { /* not allowed */ }
  }
  /** Sparks that spray away from a hit, along the direction of the shot. */
  private burstDir(x: number, y: number, ang: number, col: string, n: number, sp: number, cone: number) {
    for (let i = 0; i < n; i++) { const a = ang + (Math.random() - .5) * cone, s = sp * (.45 + Math.random() * .55);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .18 + Math.random() * .18, max: .36, col, size: 2 + Math.random() * 2, streak: true }); }
  }
  private dust(x: number, y: number, n: number, spread = 14) {
    for (let i = 0; i < n; i++) this.parts.push({ x: x + (Math.random() - .5) * spread, y: y + (Math.random() - .5) * 6, vx: (Math.random() - .5) * 50, vy: -10 - Math.random() * 25, life: .45, max: .45, col: 'rgba(214,192,150,.7)', size: 3 + Math.random() * 3, grow: 10 });
  }
  /** A knocked-out fighter bursts like a balloon: chunky pieces in its own colours. */
  private popChunks(c: Corpse) {
    const cols = [c.H.color, c.H.color, c.H.dark, '#fff3c4'];
    for (let i = 0; i < 16; i++) { const a = Math.random() * TAU, s = 90 + Math.random() * 220;
      this.chunks.push({ x: c.x, y: c.y, z: 18 + Math.random() * 14, vx: Math.cos(a) * s, vy: Math.sin(a) * s * .6, vz: 160 + Math.random() * 260, rot: Math.random() * TAU, vr: (Math.random() - .5) * 18, s: 4 + Math.random() * 6, col: cols[i % cols.length], life: 1.1 + Math.random() * .5 }); }
    this.burst(c.x, c.y - 10, '#ffc93c', 10, 260);
    this.ring(c.x, c.y, 70, 'rgba(255,243,196,.9)', 0.3, 5);
    if (c.near) { this.sfx('pop', { vol: 0.75, rate: 0.9 + Math.random() * 0.2 }); this.floats.push({ x: c.x, y: c.y - 40, txt: 'POP!', life: .8, col: '#ffc93c', big: true }); }
  }
  private flash(col: string, a: number) { this.flashFx = { col, a: Math.max(this.flashFx.a, a) }; }
  private updateFx(real: number) {
    for (const r of this.rings) { r.life -= real; r.r = r.max * (1 - Math.pow(Math.max(0, r.life / r.maxLife), 2)); }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const c of this.callouts) c.life -= real; this.callouts = this.callouts.filter((c) => c.life > 0);
    for (const g of this.ghosts) g.life -= real; this.ghosts = this.ghosts.filter((g) => g.life > 0);
    for (const f of this.spawnFx) f.life -= real; this.spawnFx = this.spawnFx.filter((f) => f.life > 0);
    for (const c of this.confetti) { c.vy += 420 * real; c.x += c.vx * real; c.y += c.vy * real; c.rot += c.vr * real; c.vx *= 0.99; c.life -= real; }
    this.confetti = this.confetti.filter((c) => c.life > 0 && c.y < this.ch + 40);
    this.flashFx.a = Math.max(0, this.flashFx.a - real * 3);
  }
  private spawnConfetti() {
    const cols = ['#ffc93c', '#46b0ff', '#7fd34e', '#ff8ad1', '#fff3c4', '#b38cff'];
    for (let i = 0; i < 160; i++) this.confetti.push({ x: Math.random() * this.cw, y: -20 - Math.random() * this.ch * 0.6, vx: (Math.random() - .5) * 160, vy: 40 + Math.random() * 120, rot: Math.random() * TAU, vr: (Math.random() - .5) * 10, col: cols[i % cols.length], w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, life: 4 + Math.random() * 3 });
  }

  /* ---------- View ---------- */
  private resize = () => {
    const rect = this.cv.getBoundingClientRect();
    const vv = window.visualViewport;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    // When the page turns the match sideways (phone held upright), the canvas's own width is the screen's height.
    const rw = this.rotated ? rect.height : rect.width, rh = this.rotated ? rect.width : rect.height;
    const vw = this.rotated ? (vv?.height || window.innerHeight) : (vv?.width || window.innerWidth), vh = this.rotated ? (vv?.width || window.innerWidth) : (vv?.height || window.innerHeight);
    this.cw = rw > 10 ? rw : (vw || 360);
    this.ch = rh > 10 ? rh : (vh || 640);
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
  /** Screen point to canvas point, undoing the quarter turn when the match is shown sideways. */
  private toLocal(cx: number, cy: number) {
    const rect = this.cv.getBoundingClientRect();
    return this.rotated ? { x: cy - rect.top, y: rect.right - cx } : { x: cx - rect.left, y: cy - rect.top };
  }
  private toWorld(sx: number, sy: number) { const p = this.toLocal(sx, sy); return { x: (p.x - this.cw / 2) / this.scale + this.cam.x, y: (p.y - this.ch / 2) / this.scale + this.cam.y }; }
  private local(e: PointerEvent) { return this.toLocal(e.clientX, e.clientY); }
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
    if (u.isPlayer || this.near(u)) this.shotSfx(H.id);
    u.recoil = 1; u.sq = -0.08;
    // Close-range fighters swing: a bright arc in front of them.
    if (H.attack === 'spread' && H.range < 350) {
      this.swooshes.push({ x: u.x, y: u.y, ang, r: Math.min(80, H.range * 0.32), life: .16, max: .16 });
      if (u.isPlayer || this.near(u)) this.sfx('swoosh', { vol: 0.45, rate: 0.9 + Math.random() * 0.25 });
    }
    if (u.isPlayer) this.kickCam(ang + Math.PI, 3);
    return true;
  }
  /** Bots announce a super half a second ahead with a marker on the ground, so being hit by one feels fair. */
  private windSuper(u: Unit, ang: number, tx: number, ty: number) {
    if (u.wind || !u.alive || u.charge < 1) return;
    if (u.H.sup === 'fortify') { this.useSuper(u, ang, tx, ty); return; }
    u.wind = { ang, tx, ty, t: 0.5, max: 0.5 };
    if (u.team !== this.player.team && this.near(u)) this.sfx('tick', { vol: 0.5, rate: 1.7 });
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
      for (const e of this.units) if (e.alive && e.team !== u.team && distToSeg(e.x, e.y, u.x, u.y, ex, ey) < e.r + 14 + (u.isPlayer ? 8 : 0) - (e.isPlayer ? 5 : 0)) this.hurt(e, 2200 * u.mult, u, true);
      this.beams.push({ x0: u.x, y0: u.y, x1: ex, y1: ey, t: .35, team: u.team }); if (this.near(u)) this.shake(5);
    } else { u.shield = 4; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.25); this.burst(u.x, u.y, '#ffc93c', 18, 220); }
    const sfxName: SfxName = H.sup === 'dash' ? 'super_dash' : H.sup === 'cloud' ? 'super_cloud' : H.sup === 'rail' ? 'super_rail' : 'super_shell';
    if (u.isPlayer || this.near(u)) { this.sfx(sfxName); this.ring(u.x, u.y, 120, `rgba(${TEAM_RGB[u.team]},.9)`, 0.5, 8); }
    if (u.isPlayer) { this.sfx('super', { vol: 0.5 }); this.flash(TEAM_RGB[0], 0.22); this.callout(H.superName.toUpperCase() + '!', '#ffc93c', undefined, 1.2); this.shake(4); this.audio.voice(`${H.id}_super`, { priority: true }); }
    return true;
  }
  private hurt(t: Unit, amount: number, src: Unit | null, isSuper: boolean) {
    if (!t.alive || this.over) return;
    if (t.shield > 0) amount *= 0.35;
    amount = Math.round(amount); t.hp -= amount; t.lastHurt = this.now; t.flash = .12; t.reveal = Math.max(t.reveal, .8);
    if (src) { src.dmgDealt += amount; if (!isSuper) src.charge = Math.min(1, src.charge + amount / src.H.superCost); }
    this.floats.push({ x: t.x + (Math.random() - .5) * 16, y: t.y - 30, txt: amount, life: .8, col: t.team === 0 ? '#ff8a7a' : '#fff3c4', big: !!(src && src.isPlayer) });
    t.sq = Math.max(t.sq, 0.16);
    if (src && src !== t) {
      // Knockback along the hit; the player is pushed less, so bots cannot juggle you.
      const a = Math.atan2(t.y - src.y, t.x - src.x), k = Math.min(420, 90 + amount * 0.12) * (isSuper ? 1.6 : 1) * (t.isPlayer ? 0.6 : 1);
      t.kx += Math.cos(a) * k; t.ky += Math.sin(a) * k;
      if (t.isPlayer) { this.hitArrows.push({ ang: a + Math.PI, life: .9 }); if (this.hitArrows.length > 4) this.hitArrows.shift(); this.kickCam(a, 5); }
    }
    if (t.isPlayer) { this.shake(5); this.sfx('hit', { vol: 0.5, rate: 0.8 }); this.buzz(20); }
    else if (src && src.isPlayer) {
      // Your hits land with a tiny freeze and a hit sound that climbs in pitch through a combo.
      if (this.realNow - this.lastStop > 0.15) { this.hitStop = Math.max(this.hitStop, isSuper ? 0.07 : 0.045); this.lastStop = this.realNow; }
      this.combo = this.now - this.comboT < 0.8 ? this.combo + 1 : 1; this.comboT = this.now;
      if (this.realNow - this.lastHitSfx > 0.03) { this.lastHitSfx = this.realNow; this.sfx('hit', { rate: 1 + Math.min(8, this.combo) * 0.045 + Math.random() * 0.06 }); }
      this.buzz(8);
    }
    if (t.hp <= 0) this.knockout(t, src);
  }
  private knockout(t: Unit, src: Unit | null) {
    t.alive = false; t.hp = 0; t.respawn = 3; t.deaths++; t.dash = 0; t.shield = 0; t.wind = null; t.kx = 0; t.ky = 0;
    this.corpses.push({ H: t.H, x: t.x, y: t.y, aim: t.aim, face: t.face, r: t.r, t: ANIMS[`${t.H.id}_ko`] ? 0 : KO_SECONDS - 0.001, near: t.isPlayer || this.near(t) });
    this.burst(t.x, t.y, t.H.color, 26, 300); this.burst(t.x, t.y, '#fff3c4', 10, 180);
    if (src) src.kills++;
    this.feed.unshift({ a: src ? src.name : '', ac: src ? (src.team ? '#ff5a4d' : '#46b0ff') : '#fff', b: t.name, bc: t.team ? '#ff5a4d' : '#46b0ff', t: 4, af: src ? src.H.id : null, bf: t.H.id });
    this.feed.length = Math.min(this.feed.length, 4);
    this.ring(t.x, t.y, 90, `rgba(${TEAM_RGB[t.team]},.9)`, 0.45, 6);
    if (t.isPlayer || (src && src.isPlayer) || this.near(t)) { this.sfx('ko', { rate: 0.9 + Math.random() * 0.2 }); this.shake(t.isPlayer ? 12 : 6); }
    if (src && src.isPlayer && !t.isPlayer) {
      // The player scored a knockout: a brief hit-stop, and streak callouts for quick follow-ups.
      this.hitStop = 0.09; this.flash('255,255,255', 0.18);
      const L = this.opts.labels; this.killTimes = this.killTimes.filter((k) => this.now - k < 4); this.killTimes.push(this.now);
      if (this.killTimes.length >= 3) { this.callout(L.tripleKo ?? 'TRIPLE KO!', '#ff8ad1'); this.audio.voice('ann_triple_ko', { priority: true }); }
      else if (this.killTimes.length === 2) { this.callout(L.doubleKo ?? 'DOUBLE KO!', '#ffc93c'); this.audio.voice('ann_double_ko', { priority: true }); }
      else if (!this.firstKoDone) { this.firstKoDone = true; this.callout(L.firstKo ?? 'FIRST KO!', '#ffc93c', undefined, 1.2); this.audio.voice('ann_first_ko', { priority: true }); }
      else if (Math.random() < 0.5) this.audio.voice(`${src.H.id}_kill`, { cooldown: 8 });
      this.buzz(35);
    }
    if (t.isPlayer && !this.over) { this.timeScale = 0.3; this.slowT = 0.55; this.flash('255,90,77', 0.25); this.buzz([40, 30, 60]); this.audio.voice(`${t.H.id}_ko`, { priority: true }); this.opts.onKnockout(); }
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
    // A zero-length step (hit-stop, pause) must not turn velocities into NaN.
    if (dt > 0) { u.vx = (u.x - ox) / dt; u.vy = (u.y - oy) / dt; }
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
          this.windSuper(u, ang, t.x, t.y);
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
    const prevT = this.t; this.t += dt;
    const started = this.t >= 0, P = this.player;
    if (this.t < 0) { const n = Math.ceil(-this.t); if (n !== this.lastCountdown) { this.lastCountdown = n; this.sfx('countdown', { rate: 1 + (3 - n) * 0.12 }); } }
    else if (prevT < 0) { this.sfx('go'); this.flash('255,201,60', 0.35); this.ring(P.x, P.y, 140, 'rgba(255,201,60,.9)'); this.audio.voice('ann_go', { queue: true }); this.audio.voice(`${P.H.id}_ready`, { queue: true }); }
    if (!this.over && prevT < MATCH_SECONDS - 10 && this.t >= MATCH_SECONDS - 10) { this.audio.voice('ann_ten', { priority: true }); this.finalTen = true; this.audio.setMusicRate(1.1); }
    if (this.finalTen && !this.over) { const left = Math.ceil(MATCH_SECONDS - this.t); if (left !== this.lastClockTick && left > 0) { this.lastClockTick = left; this.sfx('tick', { vol: 0.55, rate: 1.35 + (10 - left) * 0.03 }); } }
    if (started && !this.over && P.alive && P.hp / P.maxHp < 0.3) { this.heartT -= dt; if (this.heartT <= 0) { this.heartT = 0.85; this.sfx('heartbeat', { vol: 0.7 }); } } else this.heartT = 0;
    if (started && !this.musicStarted) { this.musicStarted = true; this.audio.startMusic(); }
    if (P.alive && started) {
      const inB = this.inBush(P);
      if (inB && !this.playerWasInBush) { this.sfx('bush', { vol: 0.6 }); for (let i = 0; i < 10; i++) this.parts.push({ x: P.x + (Math.random() - .5) * 30, y: P.y + (Math.random() - .5) * 30, vx: (Math.random() - .5) * 120, vy: -40 - Math.random() * 80, life: .5, max: .5, col: '#7fd34e', size: 3 }); }
      this.playerWasInBush = inB;
    }
    for (const u of this.units) {
      u.flash = Math.max(0, u.flash - dt); u.reveal = Math.max(0, u.reveal - dt); u.shield = Math.max(0, u.shield - dt); u.fireCd = Math.max(0, u.fireCd - dt);
      u.sqv += (-260 * u.sq - 16 * u.sqv) * dt; u.sq += u.sqv * dt; u.recoil = Math.max(0, u.recoil - dt * 7);
      if (this.now - u.lastHurt > 0.35) u.ghostHp = Math.max(u.hp, u.ghostHp - u.maxHp * 0.9 * dt); if (u.ghostHp < u.hp) u.ghostHp = u.hp;
      if (u.alive && (Math.abs(u.kx) > 2 || Math.abs(u.ky) > 2)) { u.x += u.kx * dt; u.y += u.ky * dt; this.collide(u); const f = Math.exp(-11 * dt); u.kx *= f; u.ky *= f; } else { u.kx = 0; u.ky = 0; }
      if (u.wind) { u.wind.t -= dt; if (u.wind.t <= 0) { const w = u.wind; u.wind = null; this.useSuper(u, w.ang, w.tx, w.ty); } }
      if (!u.alive) {
        if (!this.over) { u.respawn -= dt; if (u.respawn <= 0) { Object.assign(u, { alive: true, hp: u.maxHp, ghostHp: u.maxHp, x: u.spawn.x, y: u.spawn.y, ammo: 3, reveal: 0, lastHurt: this.now, sq: -0.2, sqv: 0 }); u.ai.target = null; this.dust(u.x, u.y + u.r * .8, 10, 40); this.spawnFx.push({ x: u.x, y: u.y, life: 0.7, col: TEAM_RGB[u.team] }); this.ring(u.x, u.y, 70, `rgba(${TEAM_RGB[u.team]},.9)`, 0.4, 4); if (u.isPlayer) this.sfx('respawn'); } }
        continue;
      }
      u.ammo = Math.min(3, u.ammo + dt / u.H.reload);
      if (this.now - u.lastHurt > 3 && this.now - u.lastFire > 2.5 && u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.13 * dt);
        if (u.isPlayer && this.now - this.lastHealFx > 0.3) { this.lastHealFx = this.now; this.parts.push({ x: u.x + (Math.random() - .5) * 30, y: u.y + 10, vx: 0, vy: -60, life: .7, max: .7, col: '#9bffa0', size: 3 }); if (Math.random() < 0.15) this.sfx('heal', { vol: 0.35 }); }
      }
      let mv: [number, number] = [0, 0];
      if (started && !this.over) mv = u === P ? this.playerInput(u) : this.bot(u, dt);
      if (u.dash > 0) {
        u.dash -= dt; this.moveUnit(u, 0, 0, dt);
        for (const e of this.units) if (e.alive && e.team !== u.team && !u.dashHit.has(e) && Math.hypot(e.x - u.x, e.y - u.y) < e.r + u.r + 6) {
          u.dashHit.add(e); this.hurt(e, 1150 * u.mult, u, true); const a = Math.atan2(e.y - u.y, e.x - u.x); e.x += Math.cos(a) * 60; e.y += Math.sin(a) * 60; this.collide(e); this.burst(e.x, e.y, '#fff3c4', 12, 260); }
        if (Math.random() < .8) this.parts.push({ x: u.x, y: u.y, vx: 0, vy: 0, life: .25, max: .25, col: u.H.color, size: 10 });
        this.ghostT += dt; if (this.ghostT > 0.03) { this.ghostT = 0; this.ghosts.push({ x: u.x, y: u.y, aim: u.aim, H: u.H, life: 0.3 }); }
      } else this.moveUnit(u, u.wind ? mv[0] * 0.4 : mv[0], u.wind ? mv[1] * 0.4 : mv[1], dt);
      // Dust at the feet when starting, stopping and while running (only near the player, where it can be seen).
      const moving = Math.hypot(u.vx, u.vy) > 40;
      if (this.near(u)) {
        if (moving !== u.wasMoving) this.dust(u.x, u.y + u.r * .8, 5);
        if (moving) { u.dustT -= dt; if (u.dustT <= 0) { u.dustT = 0.16; this.dust(u.x - Math.cos(u.aim) * 6, u.y + u.r * .8, 2, 8); } }
      }
      u.wasMoving = moving;
      // Turn the body, never snap it: aim while shooting or aiming with the mouse, otherwise face the way you run.
      const aiming = this.now - u.lastFire < 0.6 || u.wind !== null || (u.isPlayer && ((!this.touchMode && this.mouse.active) || (this.stickR.id !== null && this.stickR.moved)));
      const want = aiming || !moving ? u.aim : Math.atan2(u.vy, u.vx);
      const dTurn = angDiff(u.face, want), maxTurn = 13 * dt;
      u.face += Math.abs(dTurn) <= maxTurn ? dTurn : Math.sign(dTurn) * maxTurn;
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
        // Generous on purpose: the player's shots hit slightly wider than they look, and shots at the player slightly narrower.
        for (const u of this.units) if (u.alive && u.team !== b.team && Math.hypot(u.x - b.x, u.y - b.y) < u.r + b.r + (b.owner.isPlayer ? 6 : 0) - (u.isPlayer ? 5 : 0)) {
          this.hurt(u, b.dmg, b.owner, false); b.dead = true; const a = Math.atan2(b.vy, b.vx);
          this.burstDir(b.x, b.y, a, '#fff3c4', b.owner.isPlayer ? 8 : 5, b.owner.isPlayer ? 420 : 300, 0.8); this.burstDir(b.x, b.y, a, b.owner.H.color, 3, 260, 1.2); break; }
        if (b.trav > b.range) b.dead = true;
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
    for (const l of this.lobs) {
      l.t += dt;
      if (l.t >= l.dur) { l.dead = true;
        for (const u of this.units) if (u.alive && u.team !== l.team && Math.hypot(u.x - l.x1, u.y - l.y1) < l.rad + u.r + (l.owner.isPlayer ? 10 : 0) - (u.isPlayer ? 6 : 0)) this.hurt(u, l.dmg, l.owner, false);
        this.burst(l.x1, l.y1, '#9be86b', 16, 200); this.burst(l.x1, l.y1, '#e6ffd0', 6, 120);
        this.ring(l.x1, l.y1, l.rad + 10, 'rgba(155,232,107,.9)', 0.35, 5);
        if (l.owner.isPlayer || this.near(l.owner)) this.sfx('splash'); }
    }
    this.lobs = this.lobs.filter(l => !l.dead);
    for (const c of this.clouds) {
      c.t -= dt; c.tick -= dt;
      for (let k = 0; k < 2; k++) { const a = Math.random() * TAU, d = Math.random() * c.r; this.parts.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, vx: 0, vy: -50, life: .8, max: .8, col: c.team ? 'rgba(255,200,180,.9)' : 'rgba(225,255,205,.9)', size: 2 + Math.random() * 3 }); }
      if (c.tick <= 0) { c.tick = .25;
        for (const u of this.units) if (u.alive && Math.hypot(u.x - c.x, u.y - c.y) < c.r) {
          if (u.team !== c.team) this.hurt(u, 130 * c.owner.mult, c.owner, true); else u.hp = Math.min(u.maxHp, u.hp + 90); } }
    }
    this.clouds = this.clouds.filter(c => c.t > 0);
    for (const b of this.beams) b.t -= dt; this.beams = this.beams.filter(b => b.t > 0);
    // Knocked-out fighters topple over, then pop.
    for (const c of this.corpses) { const before = c.t; c.t += dt; if (before < KO_SECONDS && c.t >= KO_SECONDS) this.popChunks(c); }
    this.corpses = this.corpses.filter((c) => c.t < KO_SECONDS);
    for (const k of this.chunks) { k.vz -= 900 * dt; k.z += k.vz * dt; if (k.z < 0) { k.z = 0; k.vz *= -0.35; k.vx *= .6; k.vy *= .6; k.vr *= .6; } k.x += k.vx * dt; k.y += k.vy * dt; k.rot += k.vr * dt; k.life -= dt; }
    this.chunks = this.chunks.filter((k) => k.life > 0);
    for (const w of this.swooshes) w.life -= dt; this.swooshes = this.swooshes.filter((w) => w.life > 0);
    for (const h of this.hitArrows) h.life -= dt; this.hitArrows = this.hitArrows.filter((h) => h.life > 0);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .9; p.vy *= .9; p.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0); if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    for (const f of this.floats) { f.y -= 40 * dt; f.life -= dt; } this.floats = this.floats.filter(f => f.life > 0);
    for (const f of this.feed) f.t -= dt; this.feed = this.feed.filter(f => f.t > 0);
    if (started && !this.over) {
      const inZ = [0, 0];
      for (const u of this.units) if (u.alive && Math.hypot(u.x - ZONE.x, u.y - ZONE.y) < ZONE.r) { inZ[u.team]++; u.scoreTime += dt; }
      const prevOwner = this.owner;
      this.owner = inZ[0] && !inZ[1] ? 0 : inZ[1] && !inZ[0] ? 1 : (inZ[0] && inZ[1] ? 2 : -1);
      if (this.owner !== prevOwner && (this.owner === 0 || this.owner === 1)) {
        const L = this.opts.labels; this.ring(ZONE.x, ZONE.y, ZONE.r + 40, `rgba(${TEAM_RGB[this.owner]},.9)`, 0.6, 8);
        this.sfx('capture', { rate: this.owner === 0 ? 1 : 0.85, vol: 0.7 });
        if (this.t > 1.5) this.audio.voice(this.owner === 0 ? 'ann_secured' : 'ann_lost', { cooldown: 18 });
        this.callout(this.owner === 0 ? (L.reactorSecured ?? 'REACTOR SECURED') : (L.reactorLost ?? 'REACTOR LOST'), this.owner === 0 ? '#46b0ff' : '#ff5a4d', undefined, 1.3);
      }
      if (this.owner === 0 || this.owner === 1) {
        const before = Math.floor(this.score[this.owner] / 10);
        this.score[this.owner] = Math.min(WIN_SCORE, this.score[this.owner] + SCORE_RATE * dt);
        if (Math.floor(this.score[this.owner] / 10) > before) this.sfx('tick', { vol: 0.5, rate: this.owner === 0 ? 1.1 : 0.9 });
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
    this.audio.clearVoiceQueue(); this.audio.stopMusic(2);
    if (s0 > s1) { this.sfx('victory'); this.spawnConfetti(); this.flash('255,201,60', 0.3); } else if (s1 > s0) this.sfx('defeat');
    this.audio.voice(s0 > s1 ? 'ann_victory' : s1 > s0 ? 'ann_defeat' : 'ann_draw', { priority: true, delay: 0.7 });
    window.setTimeout(() => {
      if (this.ended || this.destroyed) return; this.ended = true;
      this.opts.onEnd({ scoreMine: s0, scoreTheirs: s1, mvp: mvp === P, kills: P.kills, deaths: P.deaths, damage: Math.round(P.dmgDealt) });
    }, 1400);
  }

  /* ---------- Drawing ---------- */
  private rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

  static drawHero(c: CanvasRenderingContext2D, H: FighterSpec, x: number, y: number, r: number, aim: number, ring: string | null, flash: number, t: number, shield: number, moving = false, pose?: HeroPose) {
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, r * .8, r * 1.05, r * .45, 0, 0, TAU); c.fill();
    if (ring) { c.strokeStyle = ring; c.lineWidth = 4; c.beginPath(); c.ellipse(0, r * .8, r * 1.15, r * .52, 0, 0, TAU); c.stroke(); }
    const strip = pose?.anim ? ANIMS[`${H.id}_${pose.anim}`] : undefined;
    if (strip && pose?.anim) {
      // Animated strip: frames face right and stand on FEET_Y; squash and stretch around the feet.
      // A sheet with one row per direction turns the fighter for real; a single-row strip faces right and is mirrored.
      const S = r * 5.4, n = ANIM_FRAMES[pose.anim], F = strip.width / n, rows = Math.round(strip.height / F);
      const f = ((Math.floor(pose.frame ?? 0) % n) + n) % n, sq = pose.sq ?? 0;
      const row = rows >= DIRS ? dirOf(pose.face ?? aim) : 0;
      c.translate(pose.ox ?? 0, r * .8 + (pose.oy ?? 0));
      if (rows < DIRS && Math.cos(aim) < 0) c.scale(-1, 1);
      c.scale(1 + sq, 1 - sq);
      c.drawImage(strip, f * F, row * F, F, F, -S / 2, -S * FEET, S, S);
      if (flash > 0) { const w = whiteFrame(strip, f, row, F); if (w) { const a0 = c.globalAlpha; c.globalAlpha = Math.min(1, flash * 6) * a0; c.drawImage(w, -S / 2, -S * FEET, S, S); c.globalAlpha = a0; } }
      c.restore();
      if (shield > 0) { c.save(); c.translate(x, y); c.strokeStyle = 'rgba(255,201,60,.85)'; c.lineWidth = 3; c.beginPath(); c.arc(0, -r * .1, r * 1.7, 0, TAU); c.stroke(); c.fillStyle = 'rgba(255,201,60,.12)'; c.fill(); c.restore(); }
      return;
    }
    const sprite = ASSETS[H.id];
    if (sprite) {
      // Generated sprite: faces right, so mirror it when aiming left; bob while moving, breathe while still.
      const s = r * 3.6, bob = moving ? Math.abs(Math.sin(t * 12)) * 3 : Math.sin(t * 3) * 1;
      const squash = (moving ? 1 + Math.sin(t * 12) * 0.03 : 1) - (pose?.sq ?? 0);
      c.translate(0, -r * 0.55 - bob);
      if (Math.cos(aim) < 0) c.scale(-1, 1);
      c.scale(1 / squash, squash);
      c.drawImage(sprite, -s / 2, -s / 2, s, s);
      const sil = SILHOUETTES[H.id];
      if (flash > 0 && sil) { c.globalAlpha = Math.min(1, flash * 6); c.drawImage(sil, -s / 2, -s / 2, s, s); c.globalAlpha = 1; }
      c.scale(squash, 1 / squash);
      if (Math.cos(aim) < 0) c.scale(-1, 1);
      if (shield > 0) { c.strokeStyle = 'rgba(255,201,60,.85)'; c.lineWidth = 3; c.beginPath(); c.arc(0, r * .2, r * 1.7, 0, TAU); c.stroke(); c.fillStyle = 'rgba(255,201,60,.12)'; c.fill(); }
      c.restore(); return;
    }
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

  private poseOf(u: Unit): HeroPose {
    const el = this.now - u.lastFire, moving = Math.hypot(u.vx, u.vy) > 20;
    const ox = -Math.cos(u.aim) * u.recoil * 5, oy = -Math.sin(u.aim) * u.recoil * 5;
    const face = u.face;
    if (el >= 0 && el < 0.3) return { anim: 'attack', frame: Math.min(ANIM_FRAMES.attack - 1, Math.floor(el * ANIM_FPS.attack)), sq: u.sq, ox, oy, face };
    if (moving || u.dash > 0) return { anim: 'run', frame: (this.now + u.phase) * ANIM_FPS.run, sq: u.sq, ox, oy, face };
    return { anim: 'idle', frame: (this.now + u.phase) * ANIM_FPS.idle, sq: u.sq, ox, oy, face };
  }

  private drawWorld() {
    const ctx = this.ctx, now = this.now, P = this.player;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#15130f'; ctx.fillRect(0, 0, this.cw, this.ch);
    const sx = (Math.random() - .5) * this.cam.shake + this.kick.x, sy = (Math.random() - .5) * this.cam.shake + this.kick.y;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * (this.cw / 2 - this.cam.x * this.scale + sx), this.dpr * (this.ch / 2 - this.cam.y * this.scale + sy));
    ctx.drawImage(groundCv!, 0, 0);
    const reactor = ASSETS.reactor;
    if (reactor) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(ZONE.x, ZONE.y + 8, ZONE.r + 6, ZONE.r * .5 + 6, 0, 0, TAU); ctx.fill(); ctx.drawImage(reactor, ZONE.x - ZONE.r, ZONE.y - ZONE.r, ZONE.r * 2, ZONE.r * 2); }
    const ownerCol = this.owner === 0 ? '70,176,255' : this.owner === 1 ? '255,90,77' : this.owner === 2 ? '255,201,60' : '230,220,200';
    ctx.fillStyle = `rgba(${ownerCol},${this.owner >= 0 ? .2 : .08})`; ctx.beginPath(); ctx.arc(ZONE.x, ZONE.y, ZONE.r, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(ZONE.x, ZONE.y); ctx.rotate(now * .4);
    ctx.strokeStyle = `rgba(${ownerCol},.85)`; ctx.lineWidth = 6; ctx.setLineDash([22, 14]); ctx.beginPath(); ctx.arc(0, 0, ZONE.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    if (!reactor) { ctx.fillStyle = '#2f2c27'; ctx.beginPath(); ctx.arc(ZONE.x, ZONE.y, 26, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ZONE.x, ZONE.y, 26, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = `rgba(${ownerCol},${.6 + Math.sin(now * 5) * .25})`; ctx.beginPath(); ctx.arc(ZONE.x, ZONE.y, reactor ? 11 : 15, 0, TAU); ctx.fill();
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
          ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.quadraticCurveTo((P.x + tx) / 2, (P.y + ty) / 2 - 90 * k, tx, ty); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(tx, ty, P.H.splash || 70, 0, TAU); ctx.fill(); ctx.stroke(); }
        else { const sp = P.H.attack === 'spread' ? (P.H.spread || 0.5) / 2 + .03 : .04;
          ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.arc(P.x, P.y, P.H.range, a - sp, a + sp); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
    }
    // Enemy supers are announced on the ground half a second ahead.
    for (const u of this.units) {
      const w = u.wind; if (!w || !u.alive || u.team === 0) continue;
      const k = 1 - w.t / w.max, a = 0.25 + 0.55 * k + Math.sin(this.realNow * 30) * 0.1;
      ctx.strokeStyle = `rgba(255,70,60,${a})`; ctx.fillStyle = `rgba(255,70,60,${a * 0.25})`; ctx.lineWidth = 4;
      if (u.H.sup === 'cloud') { let dx = w.tx - u.x, dy = w.ty - u.y; const d = Math.hypot(dx, dy); if (d > 380) { dx *= 380 / d; dy *= 380 / d; }
        ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.arc(u.x + dx, u.y + dy, 135 * (0.6 + 0.4 * k), 0, TAU); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); }
      else { const len = u.H.sup === 'rail' ? 760 : 270, wd = u.H.sup === 'rail' ? 30 : 40;
        ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(w.ang);
        ctx.fillRect(0, -wd / 2, len * (0.3 + 0.7 * k), wd); ctx.strokeRect(0, -wd / 2, len, wd);
        ctx.beginPath(); ctx.moveTo(len, -wd); ctx.lineTo(len + 26, 0); ctx.lineTo(len, wd); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }
    for (const g of this.ghosts) { ctx.globalAlpha = Math.max(0, g.life / 0.3) * 0.45; ArenaEngine.drawHero(ctx, g.H, g.x, g.y, 18, g.aim, null, 0, 0, 0, false, { anim: 'run', frame: 3, face: g.aim }); }
    ctx.globalAlpha = 1;
    for (const f of this.spawnFx) {
      const k = Math.max(0, f.life / 0.7); ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createLinearGradient(0, f.y - 260, 0, f.y); grad.addColorStop(0, `rgba(${f.col},0)`); grad.addColorStop(1, `rgba(${f.col},${0.55 * k})`);
      ctx.fillStyle = grad; ctx.fillRect(f.x - 16 * k, f.y - 260, 32 * k, 262);
      ctx.fillStyle = `rgba(${f.col},${0.35 * k})`; ctx.beginPath(); ctx.ellipse(f.x, f.y + 6, 30 * (1.4 - k), 12 * (1.4 - k), 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    const vis = this.units.filter(u => u.alive && this.canSee(0, u)).sort((a, b) => a.y - b.y);
    for (const c of this.corpses) if (ANIMS[`${c.H.id}_ko`]) ArenaEngine.drawHero(ctx, c.H, c.x, c.y, c.r, c.aim, null, c.t < 0.1 ? 0.1 : 0, now, 0, false, { anim: 'ko', frame: Math.min(ANIM_FRAMES.ko - 1, c.t * ANIM_FPS.ko), face: c.face });
    for (const u of vis) ArenaEngine.drawHero(ctx, u.H, u.x, u.y, u.r, u.aim, u.team ? '#ff5a4d' : '#46b0ff', u.flash, now + u.x * .01, u.shield, Math.hypot(u.vx, u.vy) > 20, this.poseOf(u));
    for (const l of this.lobs) {
      const k = l.t / l.dur, x = l.x0 + (l.x1 - l.x0) * k, y = l.y0 + (l.y1 - l.y0) * k, h = Math.sin(k * Math.PI) * 70;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, 8, 4, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y - h); ctx.rotate(k * 10);
      ctx.fillStyle = '#9be86b'; this.rrect(ctx, -6, -9, 12, 18, 4); ctx.fill(); ctx.fillStyle = '#e6ffd0'; ctx.fillRect(-3, -14, 6, 6); ctx.restore();
      ctx.strokeStyle = 'rgba(155,232,107,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(l.x1, l.y1, l.rad * (1 - k * .3), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = .93; ctx.drawImage(bushCv!, 0, 0); ctx.globalAlpha = 1;
    for (const u of vis) if (u.team === 0 && this.inBush(u)) { ctx.globalAlpha = .45; ArenaEngine.drawHero(ctx, u.H, u.x, u.y, u.r, u.aim, '#46b0ff', 0, now, u.shield, false, this.poseOf(u)); ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = 'lighter';
    for (const w of this.swooshes) {
      const k = w.life / w.max, sweep = 1 - k, a0 = w.ang - 1.1 + sweep * 0.5, a1 = w.ang + 1.1 * Math.min(1, sweep * 2.2);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,200,70,${0.85 * k})`; ctx.lineWidth = 14 * k + 3; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, a0, a1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,110,170,${0.7 * k})`; ctx.lineWidth = 5 * k + 1; ctx.beginPath(); ctx.arc(w.x, w.y, w.r - 9, a0, a1); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w.x, w.y, w.r + 4, a0 + 0.2, a1); ctx.stroke();
    }
    for (const b of this.bullets) {
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) { b.dead = true; continue; }
      const glow = b.kind === 'vex' ? '190,160,255' : b.team ? '255,140,110' : '120,200,255';
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 16); g.addColorStop(0, `rgba(${glow},.55)`); g.addColorStop(1, `rgba(${glow},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 16, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${glow},.8)`; ctx.lineWidth = b.kind === 'vex' ? 7 : 5; ctx.lineCap = 'round';
      const l = b.kind === 'vex' ? .035 : .02; ctx.beginPath(); ctx.moveTo(b.x - b.vx * l, b.y - b.vy * l); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, TAU); ctx.fill();
    }
    for (const b of this.beams) {
      const k = b.t / .35; ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(150,120,255,${0.5 * k})`; ctx.lineWidth = 46 * k + 6; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      ctx.strokeStyle = `rgba(226,212,255,${k})`; ctx.lineWidth = 18 * k + 4; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
      if (Math.random() < 0.7) { const q = Math.random(); this.parts.push({ x: b.x0 + (b.x1 - b.x0) * q, y: b.y0 + (b.y1 - b.y0) * q, vx: (Math.random() - .5) * 200, vy: (Math.random() - .5) * 200, life: .3, max: .3, col: '#e2d4ff', size: 2 }); }
    }
    for (const r of this.rings) {
      const k = Math.max(0, r.life / r.maxLife);
      ctx.strokeStyle = r.col; ctx.globalAlpha = k; ctx.lineWidth = r.width * k + 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      if (p.streak) { ctx.strokeStyle = p.col; ctx.lineWidth = p.size; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.lineTo(p.x, p.y); ctx.stroke(); continue; }
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size + (p.grow ? (p.max - p.life) * p.grow : 0), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const k of this.chunks) {
      ctx.globalAlpha = Math.min(1, k.life * 2);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(k.x, k.y + 4, k.s * .7, k.s * .3, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(k.x, k.y - k.z); ctx.rotate(k.rot); ctx.fillStyle = k.col; ctx.fillRect(-k.s / 2, -k.s / 2, k.s, k.s);
      ctx.strokeStyle = 'rgba(26,23,20,.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(-k.s / 2, -k.s / 2, k.s, k.s); ctx.restore();
    }
    ctx.globalAlpha = 1;
    // Which way the last hits came from: red chevrons around the player.
    if (P.alive) for (const h of this.hitArrows) {
      const k = Math.min(1, h.life / 0.5), rr = P.r + 40;
      ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(h.ang); ctx.globalAlpha = k;
      ctx.strokeStyle = '#ff4a3d'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, rr, -0.45, 0.45); ctx.stroke();
      ctx.fillStyle = '#ff4a3d'; ctx.beginPath(); ctx.moveTo(rr + 16, 0); ctx.lineTo(rr + 4, -9); ctx.lineTo(rr + 4, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const u of vis) {
      const w = 52, x = u.x - w / 2, y = u.y - u.r - 24;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; this.rrect(ctx, x - 2, y - 2, w + 4, 11, 4); ctx.fill();
      if (u.ghostHp > u.hp) { ctx.fillStyle = '#fff3c4'; this.rrect(ctx, x, y, w * Math.min(1, u.ghostHp / u.maxHp), 7, 3); ctx.fill(); }
      ctx.fillStyle = u.isPlayer ? '#7fd34e' : u.team ? '#ff5a4d' : '#46b0ff'; this.rrect(ctx, x, y, w * Math.max(0, u.hp / u.maxHp), 7, 3); ctx.fill();
      ctx.font = `600 13px ${F_BODY}`; ctx.fillStyle = '#000'; ctx.fillText(u.name, u.x + 1, y - 4);
      ctx.fillStyle = u.isPlayer ? '#fff3c4' : '#f4ead8'; ctx.fillText(u.name, u.x, y - 5);
      if (u.isPlayer) for (let i = 0; i < 3; i++) { const f = Math.max(0, Math.min(1, u.ammo - i)); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(u.x - 26 + i * 18, u.y + u.r + 12, 16, 5); ctx.fillStyle = f >= 1 ? '#ffc93c' : '#a17a2a'; ctx.fillRect(u.x - 26 + i * 18, u.y + u.r + 12, 16 * f, 5); }
      if (u.charge >= 1) { ctx.strokeStyle = `rgba(255,201,60,${.5 + Math.sin(now * 8) * .3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 9, 0, TAU); ctx.stroke(); }
    }
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.life * 2); ctx.font = `400 ${f.big ? 17 : 13}px ${F_DISPLAY}`;
      ctx.fillStyle = '#1a1714'; ctx.fillText(String(f.txt), f.x + 1.5, f.y + 1.5); ctx.fillStyle = f.col; ctx.fillText(String(f.txt), f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawHUD() {
    const ctx = this.ctx, L = this.opts.labels, P = this.player, cw = this.cw, ch = this.ch;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const top = 10, cx = cw / 2, bw = Math.min(420, cw - 140);
    // Low health: a red pulse at the edges of the screen.
    if (P.alive && P.hp / P.maxHp < 0.3) {
      const pulse = 0.25 + Math.sin(this.realNow * 6) * 0.12;
      const vg = ctx.createRadialGradient(cx, ch / 2, Math.min(cw, ch) * 0.3, cx, ch / 2, Math.max(cw, ch) * 0.7); vg.addColorStop(0, 'rgba(255,40,40,0)'); vg.addColorStop(1, `rgba(255,40,40,${pulse})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
    }
    if (this.flashFx.a > 0) { ctx.fillStyle = `rgba(${this.flashFx.col},${this.flashFx.a})`; ctx.fillRect(0, 0, cw, ch); }
    ctx.fillStyle = 'rgba(20,18,15,.82)'; this.rrect(ctx, cx - bw / 2 - 8, top, bw + 16, 52, 12); ctx.fill();
    const half = bw / 2 - 34;
    ctx.fillStyle = '#15130f'; this.rrect(ctx, cx - bw / 2, top + 26, half, 14, 5); ctx.fill(); this.rrect(ctx, cx + 34, top + 26, half, 14, 5); ctx.fill();
    ctx.fillStyle = '#46b0ff'; this.rrect(ctx, cx - 34 - half * this.score[0] / 100, top + 26, half * this.score[0] / 100, 14, 5); ctx.fill();
    ctx.fillStyle = '#ff5a4d'; this.rrect(ctx, cx + 34, top + 26, half * this.score[1] / 100, 14, 5); ctx.fill();
    ctx.font = `400 20px ${F_DISPLAY}`; ctx.textAlign = 'center';
    ctx.fillStyle = '#46b0ff'; ctx.fillText(String(Math.floor(this.score[0])), cx - bw / 4 - 10, top + 21);
    ctx.fillStyle = '#ff5a4d'; ctx.fillText(String(Math.floor(this.score[1])), cx + bw / 4 + 10, top + 21);
    const tl = Math.max(0, Math.ceil(MATCH_SECONDS - Math.max(0, this.t)));
    ctx.fillStyle = tl <= 20 ? '#ff5a4d' : '#f4ead8'; ctx.font = `400 18px ${F_DISPLAY}`;
    if (tl <= 10 && this.t >= 0 && !this.over) {
      // Final ten seconds: the clock beats once a second.
      const frac = (MATCH_SECONDS - this.t) % 1, pop = 1 + 0.35 * Math.pow(Math.max(0, frac), 3);
      ctx.save(); ctx.translate(cx, top + 32); ctx.scale(pop, pop); ctx.fillText(`0:${String(tl).padStart(2, '0')}`, 0, 6); ctx.restore();
    } else ctx.fillText(`${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`, cx, top + 38);
    ctx.font = `600 13px ${F_BODY}`;
    ctx.fillStyle = this.owner === 0 ? '#46b0ff' : this.owner === 1 ? '#ff5a4d' : this.owner === 2 ? '#ffc93c' : '#b3a893';
    ctx.fillText((this.owner === 0 ? L.yourTeamHolds : this.owner === 1 ? L.enemyHolds : this.owner === 2 ? L.contested : L.reactorEmpty).toUpperCase(), cx, top + 66);
    ctx.textAlign = 'right'; ctx.font = `600 16px ${F_BODY}`;
    this.feed.forEach((f, i) => {
      const y = top + 18 + i * 26, x = cw - 14, icon = 20;
      ctx.globalAlpha = Math.min(1, f.t);
      const bw2 = ctx.measureText(f.b).width + icon + 4, aw = f.a ? ctx.measureText(f.a).width + icon + 4 + 28 : 28;
      ctx.fillStyle = 'rgba(20,18,15,.78)'; this.rrect(ctx, x - bw2 - aw - 10, y - 17, bw2 + aw + 16, 25, 8); ctx.fill();
      const drawIcon = (id: FighterId | null, ix: number, col: string) => { const sp = id ? ASSETS[id] : undefined; if (sp) ctx.drawImage(sp, ix, y - 15, icon, icon); else { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ix + icon / 2, y - 5, 7, 0, TAU); ctx.fill(); } };
      ctx.fillStyle = f.bc; ctx.fillText(f.b, x, y); drawIcon(f.bf, x - bw2, f.bc);
      ctx.fillStyle = '#f4ead8'; ctx.textAlign = 'center'; ctx.fillText('✕', x - bw2 - 14, y); ctx.textAlign = 'right';
      if (f.a) { ctx.fillStyle = f.ac; ctx.fillText(f.a, x - bw2 - 28, y); drawIcon(f.af, x - bw2 - 28 - ctx.measureText(f.a).width - icon - 4, f.ac); }
    });
    ctx.globalAlpha = 1;
    {
      // Portrait with a health arc and a super gauge, under the Quit button.
      const px = 54, py = 108, pr = 30;
      ctx.fillStyle = 'rgba(20,18,15,.82)'; ctx.beginPath(); ctx.arc(px, py, pr + 12, 0, TAU); ctx.fill();
      const hp = Math.max(0, P.hp / P.maxHp);
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(px, py, pr + 6, 0, TAU); ctx.stroke();
      ctx.strokeStyle = hp > 0.5 ? '#7fd34e' : hp > 0.25 ? '#ffc93c' : '#ff5a4d'; ctx.beginPath(); ctx.arc(px, py, pr + 6, -Math.PI / 2, -Math.PI / 2 + TAU * hp); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = P.charge >= 1 ? `rgba(255,201,60,${0.7 + Math.sin(this.realNow * 8) * 0.3})` : 'rgba(255,201,60,.45)';
      ctx.beginPath(); ctx.arc(px, py, pr + 13, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, P.charge)); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.clip(); ctx.fillStyle = '#2a2621'; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      const sp = ASSETS[P.H.id]; if (sp) ctx.drawImage(sp, px - pr * 1.1, py - pr * 1.0, pr * 2.2, pr * 2.2); else { ctx.fillStyle = P.H.color; ctx.beginPath(); ctx.arc(px, py, pr * .7, 0, TAU); ctx.fill(); }
      if (!P.alive) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2); }
      ctx.restore();
      ctx.textAlign = 'center'; ctx.font = `400 11px ${F_DISPLAY}`; ctx.fillStyle = P.charge >= 1 ? '#ffc93c' : '#b3a893';
      ctx.fillText(P.charge >= 1 ? (this.touchMode ? L.superCharge : `${L.superCharge} · ${L.superReady}`).toUpperCase() : `${L.superCharge} ${Math.floor(P.charge * 100)}%`.toUpperCase(), px, py + pr + 30);
    }
    if (this.touchMode) {
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
      ctx.font = `400 30px ${F_DISPLAY}`; ctx.fillStyle = '#f4ead8'; ctx.fillText(`${L.backIn} ${Math.ceil(P.respawn)}`, cx, ch / 2 + 6); }
    const banner = (text: string, y: number, size: number, col: string, scale = 1, alpha = 1) => {
      ctx.save(); ctx.translate(cx, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha; ctx.textAlign = 'center';
      ctx.font = `400 ${size}px ${F_DISPLAY}`; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(4, size * 0.16); ctx.strokeStyle = 'rgba(20,18,15,.9)'; ctx.strokeText(text, 0, 0);
      ctx.fillStyle = col; ctx.fillText(text, 0, 0); ctx.restore();
    };
    if (this.t < 0) {
      const n = Math.ceil(-this.t), frac = (-this.t) % 1;
      banner(L.holdReactor, ch / 2 - 60, 24, '#ffc93c');
      banner(String(n), ch / 2 + 40, 84, '#f4ead8', 1 + 0.5 * frac * frac, 1);
    } else if (this.t < .7) { const k = this.t / .7; banner(L.go, ch / 2 + 30, 84, '#ffc93c', 1 + k * 0.6, 1 - k); }
    // Simultaneous callouts stack downwards instead of printing over each other.
    this.callouts.forEach((c, i) => {
      const p = 1 - c.life / c.max, sIn = Math.min(1, p / 0.12), scale = 1.35 - 0.35 * (1 - Math.pow(1 - sIn, 3)), alpha = c.life < 0.3 ? c.life / 0.3 : 1;
      const y = ch * 0.26 + i * 52;
      banner(c.text, y, i === 0 ? 42 : 30, c.col, scale, alpha);
      if (c.sub) banner(c.sub, y + 30, 16, '#f4ead8', 1, alpha);
    });
    for (const c of this.confetti) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.globalAlpha = Math.min(1, c.life); ctx.fillStyle = c.col; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore(); }
    ctx.globalAlpha = 1;
    if (this.over) { const win = this.score[0] > this.score[1]; banner(win ? L.victory : this.score[1] > this.score[0] ? L.defeat : L.draw, ch / 2, 64, win ? '#ffc93c' : this.score[1] > this.score[0] ? '#ff8a7a' : '#f4ead8', 1 + Math.sin(this.realNow * 3) * 0.03); }
    if (this.paused && !this.over) { ctx.fillStyle = 'rgba(20,18,15,.45)'; ctx.fillRect(0, 0, cw, ch); }
    if (ch > cw) { ctx.font = `600 15px ${F_BODY}`; ctx.fillStyle = '#b3a893'; ctx.fillText(L.turnPhone, cx, top + 90); }
  }

  private frame = (t: number) => {
    if (this.destroyed) return;
    const real = Math.max(0, Math.min(0.05, (t - this.last) / 1000)); this.last = t; this.realNow += real;
    let dt = this.paused ? 0 : real;
    if (this.hitStop > 0) { this.hitStop -= real; dt = 0; }
    if (this.slowT > 0) { this.slowT -= real; if (this.slowT <= 0) this.timeScale = 1; }
    dt *= this.timeScale; this.now += dt;
    const duck = this.paused || this.over;
    if (duck !== this.musicDucked) { this.musicDucked = duck; this.audio.duckMusic(duck); }
    try {
      if (this.frames % 30 === 0) this.resize();
      if (paintedVersion !== assetsVersion) paintMap();
      this.updateFx(real);
      const kd = Math.exp(-18 * real); this.kick.x *= kd; this.kick.y *= kd;
      if (!this.paused && dt > 0) this.update(dt); this.drawWorld(); this.drawHUD(); this.frames++;
    } catch (error) {
      this.lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      this.ctx.globalCompositeOperation = 'source-over'; this.ctx.globalAlpha = 1;
      if (this.frames === 0 || this.lastError !== null) { /* keep going: one bad frame should not freeze the match */ }
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}

/** Draws a fighter portrait onto a small canvas for the lobby cards. */
export function drawFighterPortrait(canvas: HTMLCanvasElement, fighter: FighterId) {
  const c = canvas.getContext('2d'); if (!c) return;
  loadArenaAssets();
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
  const sprite = ASSETS[fighter];
  if (sprite) { const h = canvas.height * 0.96, w = h; c.drawImage(sprite, (canvas.width - w) / 2, canvas.height - h, w, h); return; }
  const s = canvas.width / 200; c.scale(s, s);
  ArenaEngine.drawHero(c, FIGHTERS[fighter], 100, 60, 34, 0.35, null, 0, 0, 0);
}
/** Resolves once the fighter sprites have loaded (or failed), so lobby portraits can redraw. */
export function whenArenaAssetsReady(cb: () => void) {
  loadArenaAssets();
  let seen = assetsVersion; const id = window.setInterval(() => { if (assetsVersion !== seen) { seen = assetsVersion; cb(); } }, 300);
  window.setTimeout(() => window.clearInterval(id), 15000);
  return () => window.clearInterval(id);
}
