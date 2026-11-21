// Episode 2: voice prep, schedule, cue sheet, mouth envelopes and the music-free mix.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const V = (f) => path.join(dir, 'voice', f);
const SFX = (f) => path.join(dir, '..', process.env.SFX_DIR || 'sfx', f + '.mp3');
const FPS = 30;
const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a.map(String)]);
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// narrator: Chatterbox "tense" take, deepened; silence trimmed from both ends
const NARR = 'asetrate=24000*0.91,aresample=44100,atempo=0.99,bass=g=3:f=120,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse';
for (let i = 0; i < 19; i++) ff(['-i', path.join(dir, 'narr_raw', String(i).padStart(3, '0') + '.mp3'), '-af', NARR, V('n' + String(i + 1).padStart(2, '0') + '.wav')]);
// Bo: split the batch at its long pauses
[[0, 1.7], [1.7, 4.45], [4.45, 6.78], [6.78, 9.33], [9.33, 10.97], [10.97, 13.1], [13.1, 15.57], [15.57, 17.5]]
  .forEach(([a, b], i) => ff(['-i', V('bo.mp3'), '-ss', a, '-to', b, '-af', 'silenceremove=start_periods=1:start_threshold=-40dB,areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse', V('b' + (i + 1) + '.wav')]));
// Ob: Bo's voice lowered and set behind glass
const OBFX = 'silenceremove=start_periods=1:start_threshold=-40dB,areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse,asetrate=44100*0.86,aresample=44100,atempo=1.1628,aecho=0.8:0.7:45|90:0.35|0.2,highpass=f=90';
[['obA', 0, 3.98], ['obA', 3.98, 11.45], ['obA', 11.45, 18.3], ['obA', 18.3, 20.2], ['obB', 0, 6.59], ['obB', 6.59, 11.5], ['obB', 11.5, 15.5], ['obB', 15.5, 18.7]]
  .forEach(([f, a, b], i) => ff(['-i', V(f + '.mp3'), '-ss', a, '-to', b, '-af', OBFX, V('o' + (i + 1) + '.wav')]));

const g = (x) => ['gap', x], v = (x) => ['v', x], c = (x) => ['cue', x];
const seq = [
  g(0.3), v('n01'), g(0.5), v('n02'), g(0.5), c('title'), g(0.7),
  c('act1'), g(2.6), v('n03'), g(1.0), v('n04'), g(0.9), v('n05'), g(0.9), c('lightoff'), g(2.4),
  v('b1'), g(0.5), v('o1'), g(0.5), v('b2'), g(0.5), v('o2'), g(0.6), v('b3'), g(0.6), v('o3'), g(1.0), v('n06'), g(1.5),
  c('act3'), g(1.6), v('n07'), g(1.0), c('spoon'), g(1.2), v('n08'), g(1.0), c('window'), g(1.6), v('n09'), g(0.8), c('smile'), g(2.6), v('n10'), g(1.5),
  c('act4'), g(0.7), v('b4'), g(0.5), v('o4'), g(0.6), v('b5'), g(0.5), v('o5'), g(0.4), c('run'), g(1.4), v('n11'), g(2.0), c('hallmid'), g(1.5), v('n12'), g(2.6), c('found'), g(1.4), v('n13'), g(1.8), c('push'), g(1.5), c('black2'), g(1.8),
  c('act5'), g(2.4), v('n14'), g(1.0), c('laugh'), g(1.8), c('clock'), g(0.7), v('n15'), g(1.0), c('hand'), g(1.3), v('n16'), g(0.9), c('thud'), g(1.9), v('n17'), g(1.6),
  c('act6'), g(1.2), v('b6'), g(0.5), v('o6'), g(0.6), v('b7'), g(0.5), v('o7'), g(0.7), v('b8'), g(0.8), v('o8'), g(1.0), c('steps'), g(2.4), v('n18'), g(1.0), c('door'), g(1.4), v('n19'), g(1.0), c('end'), g(4.5),
];
const Vd = {}, C = {};
let t = 0;
for (const [kind, x] of seq) {
  if (kind === 'gap') t += x;
  else if (kind === 'cue') C[x] = +t.toFixed(3);
  else {
    const f = V(x + '.wav'), d = dur(f);
    let env = [];
    if (x[0] !== 'n') {
      const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
      const n = Math.floor(pcm.length / 2), per = 8000 / FPS;
      for (let i = 0; i * per < n; i++) { let s = 0, k = 0; for (let j = Math.floor(i * per); j < Math.min(n, Math.floor((i + 1) * per)); j++) { const q = pcm.readInt16LE(j * 2) / 32768; s += q * q; k++; } env.push(Math.sqrt(s / Math.max(1, k))); }
      const mx = Math.max(...env); env = env.map((q) => +Math.min(1, (q / mx) * 1.5).toFixed(2));
    }
    Vd[x] = { s: +t.toFixed(3), e: +(t + d).toFixed(3), env };
    t += d;
  }
}
const total = +t.toFixed(2);
C.n05e = Vd.n05.e;
// second sentence of the hook line: first pause of 0.3s or more inside n01
const sil = spawnSync('ffmpeg', ['-hide_banner', '-i', V('n01.wav'), '-af', 'silencedetect=noise=-35dB:d=0.3', '-f', 'null', '-']).stderr.toString();
const ends = [...sil.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => +m[1]).filter((x) => x > 1.2 && x < dur(V('n01.wav')) - 0.5);
C.n01b = +(Vd.n01.s + (ends[0] || 2.6)).toFixed(3);
fs.writeFileSync(path.join(dir, 'data.js'), 'window.EP=' + JSON.stringify({ fps: FPS, total, V: Vd, C }) + ';');
console.log('total', total, (total / 60).toFixed(2) + ' min');
console.log(Object.entries(Vd).filter(([k]) => k[0] === 'n').map(([k, q]) => k + ':' + (q.e - q.s).toFixed(1)).join(' '));
console.log(C);

// ---------------- mix (no music) ----------------
ff(['-f', 'lavfi', '-i', 'anoisesrc=d=0.06:c=white:a=0.9:r=44100', '-af', 'highpass=f=1500,afade=t=out:st=0.01:d=0.05', path.join(dir, 'click.wav')]);
const MUF = ',lowpass=f=500', FAST = ',atempo=1.7';
const sfx = [
  ['steps', 0.1, 0.5, FAST], ['portal', Vd.n02.s - 0.3, 0.6, ''], ['impact', C.title, 0.9, ''],
  ...[0.4, 1.0, 1.7, 2.3, 3.4, 4.1, 5.2].map((d) => ['knock', C.act1 + d, 0.55, MUF]),
  ['CLICK', C.lightoff, 0.6, MUF], ['ring', C.act3, 0.3, ''], ['ring', C.spoon, 0.25, ''], ['ring', C.window, 0.25, ''], ['impact', C.smile + 0.3, 0.5, ''],
  ['steps', C.run, 0.55, FAST], ['steps', C.run + 2.2, 0.5, FAST], ['steps', C.hallmid, 0.5, FAST], ['steps', C.hallmid + 2.4, 0.5, FAST], ['steps', C.hallmid + 5, 0.45, FAST], ['steps', C.found - 1.2, 0.4, ''],
  ['creak', C.found + 0.3, 0.4, ''], ['portal', C.push - 0.5, 0.9, ''],
  ['clock', C.clock, 0.4, ''], ['impact', C.hand + 0.2, 0.35, ''],
  ...[0, 0.55, 1.1, 2.0, 2.6].map((d) => ['knock', C.thud + d, 0.6, MUF]),
  ...[0.2, 0.9].map((d) => ['knock', C.steps + d, 0.4, MUF]),
  ['steps', C.steps, 0.5, ',lowpass=f=700'], ['creak', C.door, 0.6, ''], ['impact', C.end, 0.8, ''],
];
const args = ['-y', '-v', 'error'], f = [], mixIn = [];
let k = 0;
const st = 'aresample=44100,aformat=channel_layouts=stereo', ms = (x) => Math.max(0, Math.round(x * 1000));
for (const [id, q] of Object.entries(Vd)) {
  args.push('-i', V(id + '.wav'));
  const fx = id[0] === 'n' ? 'loudnorm=I=-17:TP=-2:LRA=11,' : '';
  f.push(`[${k}:a]${fx}${st},volume=${id[0] === 'n' ? 1.15 : 2.1},adelay=${ms(q.s)}|${ms(q.s)}[v${k}]`); mixIn.push(`[v${k}]`); k++;
}
// ambience: the cold space until the mirror, then the quiet room
const a1e = C.black2 + 0.6;
args.push('-stream_loop', '-1', '-i', SFX('amb2'));
f.push(`[${k}:a]${st},atrim=0:${a1e},afade=t=in:d=0.4,afade=t=out:st=${a1e - 1.4}:d=1.4,volume=0.5[a1]`); mixIn.push('[a1]'); k++;
args.push('-stream_loop', '-1', '-i', SFX('amb1'));
f.push(`[${k}:a]${st},atrim=0:${total - C.act5},afade=t=in:d=1.2,afade=t=out:st=${total - C.act5 - 3}:d=3,volume=0.42,adelay=${ms(C.act5)}|${ms(C.act5)}[a2]`); mixIn.push('[a2]'); k++;
sfx.forEach(([name, at, vol, extra], i) => {
  args.push('-i', name === 'CLICK' ? path.join(dir, 'click.wav') : SFX(name));
  f.push(`[${k}:a]${st}${extra},volume=${vol},adelay=${ms(at)}|${ms(at)}[s${i}]`); mixIn.push(`[s${i}]`); k++;
});
f.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0:duration=longest,alimiter=limit=0.94,atrim=0:${total},afade=t=out:st=${total - 0.8}:d=0.8[out]`);
args.push('-filter_complex', f.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', path.join(dir, 'mix.wav'));
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log('mixed', sfx.length, 'sfx');
