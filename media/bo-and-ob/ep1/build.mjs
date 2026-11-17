// Episode 1 (full): schedule, cue sheet, mouth envelopes and the music-free mix.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const V = (f) => path.join(dir, 'voice', f);
const SFX = (f) => path.join(dir, '..', 'sfx', f + '.mp3');
const FPS = 30;
const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// split Bo's batched lines
for (const [id, a, b] of [['b2', 0, 1.45], ['b3', 2.6, 4.75], ['b4', 5.85, 7.4]]) ff(['-i', V('bq.mp3'), '-ss', a, '-to', b, '-af', 'afade=t=in:d=0.04', V(id + '.wav')]);
// the reflection: Bo's voice, lowered, behind glass
const OBFX = 'asetrate=44100*0.86,aresample=44100,atempo=1.1628,aecho=0.8:0.7:45|90:0.35|0.2,highpass=f=90';
const OB = ['o1', 'o2', 'o3', 'o4', 'o56', 'o7', 'O3old'];
for (const id of OB) ff(['-i', V(id + '.mp3'), '-af', OBFX, V(id + '_fx.wav')]);
const src = (id) => (OB.includes(id) ? V(id + '_fx.wav') : fs.existsSync(V(id + '.wav')) ? V(id + '.wav') : V(id + '.mp3'));

const seq = [
  ['gap', 0.4], ['v', 'NA'], ['gap', 0.9], ['cue', 'title'], ['gap', 3.4],
  ['cue', 'walk'], ['gap', 3.2], ['v', 'NB'], ['gap', 1.4],
  ['cue', 'wave2'], ['gap', 2.2], ['v', 'N3old'], ['gap', 1.6],
  ['v', 'NC'], ['gap', 1.2], ['cue', 'knock'], ['gap', 1.3],
  ['v', 'B1old'], ['gap', 0.6], ['v', 'o1'], ['gap', 0.6], ['v', 'b1'], ['gap', 0.6], ['v', 'o2'], ['gap', 0.5],
  ['cue', 'handrise'], ['gap', 2.6], ['v', 'ND'], ['gap', 1.4],
  ['cue', 'leave'], ['gap', 4.2], ['v', 'NE'], ['gap', 2.2],
  ['v', 'b2'], ['gap', 0.7], ['v', 'o3'], ['gap', 0.8], ['v', 'B2old'], ['gap', 0.6], ['v', 'o4'], ['gap', 1.6],
  ['v', 'N5old'], ['gap', 1.2], ['cue', 'black'], ['gap', 2.4], ['cue', 'land'], ['gap', 2.0],
  ['v', 'N6old'], ['gap', 1.0], ['v', 'B3old'], ['gap', 0.7], ['v', 'O3old'], ['gap', 0.9], ['v', 'b3'], ['gap', 0.7], ['v', 'o56'], ['gap', 1.0],
  ['cue', 'mirrors'], ['gap', 1.6], ['v', 'NF'], ['gap', 2.0],
  ['cue', 'turn'], ['gap', 1.2], ['v', 'n20'], ['gap', 1.2], ['cue', 'steps2'], ['gap', 2.8], ['v', 'n21'], ['gap', 1.0],
  ['cue', 'brush2'], ['gap', 2.6], ['cue', 'crack'], ['gap', 1.8],
  ['v', 'b4'], ['gap', 0.7], ['v', 'o7'], ['gap', 1.4], ['v', 'N7old'], ['gap', 0.9], ['v', 'n22'], ['gap', 0.8], ['cue', 'end'], ['gap', 4.5],
];
const Vd = {}, C = {};
let t = 0;
for (const [kind, x] of seq) {
  if (kind === 'gap') t += x;
  else if (kind === 'cue') C[x] = +t.toFixed(3);
  else {
    const f = src(x), d = dur(f);
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
    const n = Math.floor(pcm.length / 2), per = 8000 / FPS, env = [];
    for (let i = 0; i * per < n; i++) { let s = 0, c = 0; for (let j = Math.floor(i * per); j < Math.min(n, Math.floor((i + 1) * per)); j++) { const v = pcm.readInt16LE(j * 2) / 32768; s += v * v; c++; } env.push(Math.sqrt(s / Math.max(1, c))); }
    const mx = Math.max(...env);
    Vd[x] = { s: +t.toFixed(3), e: +(t + d).toFixed(3), env: x[0].toLowerCase() === 'n' ? [] : env.map((v) => +Math.min(1, (v / mx) * 1.5).toFixed(2)) };
    t += d;
  }
}
const total = +t.toFixed(2);
// beats inside batched narration (seconds from the clip start, read from its pauses)
const inner = {
  NA: { never: 4.93, reason: 9.2 },
  NB: { raise: 6.39, itraise: 7.94, smile: 9.98, itsmile: 11.26, backwards: 12.9, remember: 18.77, eleven: 21.76 },
  NC: { faster: 1.33, followed: 2.4, notcopy: 3.73, clock: 9.9, inmirror: 12.63, window: 17.04 },
  NE: { question: 7.0, midnight: 11.8 },
  N5old: { pop: 4.5 },
  N6old: { water: 3.55, backtime: 5.7, things: 7.85, held: 9.9 },
};
for (const [id, m] of Object.entries(inner)) for (const [k, o] of Object.entries(m)) C[k] = +(Vd[id].s + o).toFixed(3);
C.lightoff = +(C.leave + 1.4).toFixed(3);
fs.writeFileSync(path.join(dir, 'data.js'), 'window.EP=' + JSON.stringify({ fps: FPS, total, V: Vd, C }) + ';');
console.log('total', total, (total / 60).toFixed(2) + ' min', C);

// ---------------- mix ----------------
ff(['-f', 'lavfi', '-i', 'anoisesrc=d=0.06:c=white:a=0.9:r=44100', '-af', 'highpass=f=1500,afade=t=out:st=0.01:d=0.05', path.join(dir, 'click.wav')]);
const sfx = [
  ['impact', C.title + 0.1, 0.9], ['steps', C.walk, 0.55], ['creak', C.wave2 + 0.5, 0.6], ['knock', C.knock, 0.9],
  ['ring', C.handrise - 0.2, 0.45], ['CLICK', C.lightoff, 0.7], ['steps', C.lightoff + 0.4, 0.3], ['steps', C.midnight, 0.5],
  ['creak', Vd.o4.e, 0.3], ['portal', C.pop - 1.0, 0.9], ['land', C.land - 0.3, 0.75],
  ['water', C.water, 0.6], ['clock', C.backtime, 0.55], ['brush', C.held, 0.55],
  ['impact', C.mirrors + 0.2, 0.5], ['STEPS_MUFFLED', C.steps2, 0.45], ['crack', C.crack - 2.2, 0.8], ['impact', C.end, 0.75],
];
const args = ['-y', '-v', 'error'], f = [], mixIn = [];
let k = 0;
const st = 'aresample=44100,aformat=channel_layouts=stereo', ms = (x) => Math.max(0, Math.round(x * 1000));
for (const [id, v] of Object.entries(Vd)) {
  args.push('-i', src(id));
  f.push(`[${k}:a]${st},volume=${id[0].toLowerCase() === 'n' ? 1.7 : 1.5},adelay=${ms(v.s)}|${ms(v.s)}[v${k}]`); mixIn.push(`[v${k}]`); k++;
}
const cut = C.pop + 0.6;
args.push('-stream_loop', '-1', '-i', SFX('amb1'));
f.push(`[${k}:a]${st},atrim=0:${cut + 1},afade=t=in:d=1.5,afade=t=out:st=${cut - 0.3}:d=1.2,volume=0.38[a1]`); mixIn.push('[a1]'); k++;
args.push('-stream_loop', '-1', '-i', SFX('amb2'));
const a2 = C.black + 0.6;
f.push(`[${k}:a]${st},atrim=0:${total - a2},afade=t=in:d=1.5,afade=t=out:st=${total - a2 - 3}:d=3,volume=0.5,adelay=${ms(a2)}|${ms(a2)}[a2]`); mixIn.push('[a2]'); k++;
sfx.forEach(([name, at, vol], i) => {
  const extra = name === 'STEPS_MUFFLED' ? ',lowpass=f=700' : '';
  args.push('-i', name === 'CLICK' ? path.join(dir, 'click.wav') : SFX(name === 'STEPS_MUFFLED' ? 'steps' : name));
  f.push(`[${k}:a]${st}${extra},volume=${vol},adelay=${ms(at)}|${ms(at)}[s${i}]`); mixIn.push(`[s${i}]`); k++;
});
f.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0:duration=longest,alimiter=limit=0.94,atrim=0:${total},afade=t=out:st=${total - 0.8}:d=0.8[out]`);
args.push('-filter_complex', f.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', path.join(dir, 'mix.wav'));
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log('mixed', sfx.length, 'sfx');
