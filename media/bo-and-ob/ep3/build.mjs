// Episode 3: voice prep, schedule, cue sheet, mouth envelopes and the music-free mix.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const V = (f) => path.join(dir, 'voice', f);
const SFX = (f) => path.join(dir, '..', process.env.SFX_DIR || 'sfx', f + '.mp3');
const RAWEXT = process.env.RAWEXT || '.mp3';
const FPS = 30;
const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a.map(String)]);
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const TRIM = 'silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse';

// narrator: Chatterbox "tense" take, deepened and slowed slightly
const NN = 23;
for (let i = 0; i < NN; i++) ff(['-i', path.join(dir, 'narr_raw', String(i).padStart(3, '0') + RAWEXT), '-af', `asetrate=24000*0.91,aresample=44100,atempo=0.99,bass=g=3:f=120,${TRIM}`, V('n' + String(i + 1).padStart(2, '0') + '.wav')]);
const cutAll = (file, prefix, cuts, total, fx) => { const b = [0, ...cuts, total]; for (let i = 0; i < b.length - 1; i++) ff(['-i', V(file), '-ss', b[i], '-to', b[i + 1], '-af', fx, V(prefix + (i + 1) + '.wav')]); };
cutAll('mo.mp3', 'm', [3.0, 9.1, 11.85, 16.35, 19.2], 20.8, TRIM);
// the two lines that name the girl were re-recorded
ff(['-i', V('mofix.mp3'), '-ss', 0, '-to', 3.4, '-af', TRIM, V('m1.wav')]);
ff(['-i', V('mofix.mp3'), '-ss', 3.4, '-to', 6, '-af', TRIM, V('m6.wav')]);
cutAll('bo.mp3', 'b', [2.6, 7.2, 9.6, 11.3, 14.9, 17.4, 18.7], 21.2, TRIM);
const OBFX = TRIM + ',asetrate=44100*0.86,aresample=44100,atempo=1.1628,aecho=0.8:0.7:45|90:0.35|0.2,highpass=f=90';
cutAll('obA.mp3', 'oA', [4.3, 8.5, 16.2], 25.1, OBFX);
cutAll('obB.mp3', 'oB', [6.4, 18.0], 20.4, OBFX);
['oA1', 'oA2', 'oA3', 'oA4', 'oB1', 'oB2', 'oB3'].forEach((f, i) => fs.renameSync(V(f + '.wav'), V('o' + (i + 1) + '.wav')));

const g = (x) => ['gap', x], v = (x) => ['v', x], c = (x) => ['cue', x];
const seq = [
  g(0.3), v('n01'), g(0.5), v('n02'), g(0.6), c('title'), g(0.6),
  c('act1'), g(0.5), v('m1'), g(1.4), v('n03'), g(1.0), v('m2'), g(1.8), c('leave'), g(2.4), v('n04'), g(1.2),
  c('hall'), g(1.6), v('n05'), g(0.9), v('n06'), g(1.6),
  c('kitchen'), g(2.0), v('n07'), g(1.2), v('m3'), g(1.1), v('b1'), g(0.6), v('m4'), g(1.2), v('n08'), g(1.0), c('hiss'), g(1.6), v('m5'), g(0.8), v('n09'), g(1.0), c('catout'), g(1.8), v('n10'), g(1.6),
  c('act3'), g(2.2), v('b2'), g(1.0), c('fog'), g(1.4), v('n11'), g(0.9), c('write1'), g(2.8), v('n12'), g(0.6), c('read1'), g(2.4), v('b3'), g(0.8), c('write2'), g(3.2), c('read2'), g(2.2), v('n13'), g(0.8), c('ava'), g(4.0), c('wipe'), g(1.6),
  c('act4'), v('o1'), g(0.7), v('b4'), g(0.5), v('o2'), g(0.6), v('b5'), g(0.5), v('o3'), g(0.8), v('o4'), g(1.0), v('n14'), g(1.0), v('b6'), g(0.5), v('o5'), g(0.6), v('b7'), g(0.5), v('o6'), g(1.0), v('b8'), g(0.9), v('o7'), g(1.2), c('obleaves'), g(2.8), v('n15'), g(1.8),
  c('night'), g(2.2), v('m6'), g(0.8), c('lightoff'), g(2.2), v('n16'), g(0.9), v('n17'), g(1.4), c('crackle'), g(1.8), v('n18'), g(0.8), c('note'), g(2.8), v('n19'), g(1.0), v('n20'), g(1.0), c('sig'), g(1.4), v('n21'), g(0.4), c('turn'), g(2.2), v('n22'), g(1.0), c('wave'), g(2.4), v('n23'), g(1.2), c('end'), g(4.5),
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
// where the second half of each hook line starts (first inner pause)
const inner = (id, fallbackFrac) => { const f = V(id + '.wav'), d = dur(f), sil = spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-']).stderr.toString(); const e = [...sil.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => +m[1]).filter((x) => x > d * 0.3 && x < d - 0.6); return +(Vd[id].s + (e[0] || d * fallbackFrac)).toFixed(3); };
C.n01b = inner('n01', 0.55); C.n02b = inner('n02', 0.35);
fs.writeFileSync(path.join(dir, 'data.js'), 'window.EP=' + JSON.stringify({ fps: FPS, total, V: Vd, C }) + ';');
console.log('total', total, (total / 60).toFixed(2) + ' min');
console.log(Object.entries(Vd).map(([k, q]) => k + ':' + (q.e - q.s).toFixed(1)).join(' '));
console.log(JSON.stringify(C));

// ---------------- mix (no music) ----------------
ff(['-f', 'lavfi', '-i', 'anoisesrc=d=0.06:c=white:a=0.9:r=44100', '-af', 'highpass=f=1500,afade=t=out:st=0.01:d=0.05', path.join(dir, 'click.wav')]);
// a synthesized cat hiss and paper rustle (filtered noise)
ff(['-f', 'lavfi', '-i', 'anoisesrc=d=1.1:c=white:a=0.8:r=44100', '-af', 'highpass=f=3500,afade=t=in:d=0.08,afade=t=out:st=0.5:d=0.6', path.join(dir, 'hiss.wav')]);
ff(['-f', 'lavfi', '-i', 'anoisesrc=d=0.9:c=pink:a=0.9:r=44100', '-af', 'highpass=f=2000,tremolo=f=17:d=0.9,afade=t=in:d=0.05,afade=t=out:st=0.6:d=0.3', path.join(dir, 'rustle.wav')]);
const MUF = ',lowpass=f=500', LOC = { CLICK: 'click.wav', HISS: 'hiss.wav', RUSTLE: 'rustle.wav' };
const sfx = [
  ['creak', 0.05, 0.6, ''], ['steps', 0.9, 0.5, ''], ['impact', C.title, 0.8, ''],
  ...[0.2, 0.8, 1.5, 2.6, 3.3].map((d) => ['knock', C.act1 + d, 0.45, MUF]), ...[0.4, 1.1, 2.0, 3.0].map((d) => ['knock', Vd.n03.s + d, 0.45, MUF]),
  ['steps', C.leave - 0.3, 0.45, ''], ['steps', C.hall + 0.2, 0.5, ''], ['ring', Vd.n06.s - 0.4, 0.28, ''],
  ['clock', C.kitchen + 0.2, 0.18, ''], ['HISS', C.hiss, 0.7, ''], ['impact', C.hiss, 0.3, ''], ['steps', C.catout, 0.25, ',atempo=1.8'],
  ['steps', C.act3 + 0.2, 0.45, ''], ['CLICK', C.act3 + 1.9, 0.5, MUF], ['ring', C.fog, 0.22, ''], ['RUSTLE', C.write1, 0.18, ',lowpass=f=3000'], ['RUSTLE', C.write1 + 1.2, 0.18, ',lowpass=f=3000'],
  ['RUSTLE', C.write2, 0.18, ',lowpass=f=3000'], ['RUSTLE', C.write2 + 1.4, 0.18, ',lowpass=f=3000'], ['RUSTLE', C.ava, 0.18, ',lowpass=f=3000'], ['ring', C.ava + 2.2, 0.3, ''],
  ['RUSTLE', C.wipe, 0.5, ',lowpass=f=1800'], ['impact', C.wipe + 0.1, 0.5, ''], ['creak', Vd.n14.s, 0.3, ''], ['impact', Vd.o7.e + 0.2, 0.4, ''],
  ['CLICK', C.lightoff, 0.6, ''], ['creak', C.lightoff + 0.5, 0.4, ''], ['RUSTLE', C.crackle, 0.7, ''], ['RUSTLE', C.note, 0.5, ''], ['impact', Vd.n20.s + 1.2, 0.5, ''],
  ['RUSTLE', C.turn, 0.6, ''], ['ring', C.turn + 0.8, 0.35, ''], ['creak', C.wave + 0.4, 0.35, ''], ['impact', C.end, 0.8, ''],
];
const args = ['-y', '-v', 'error'], f = [], mixIn = [];
let k = 0;
const st = 'aresample=44100,aformat=channel_layouts=stereo', ms = (x) => Math.max(0, Math.round(x * 1000));
for (const [id, q] of Object.entries(Vd)) {
  args.push('-i', V(id + '.wav'));
  const fx = id[0] === 'n' ? 'loudnorm=I=-17:TP=-2:LRA=11,' : '';
  f.push(`[${k}:a]${fx}${st},volume=${id[0] === 'n' ? 1.15 : id[0] === 'm' ? 1.9 : 2.7},adelay=${ms(q.s)}|${ms(q.s)}[v${k}]`); mixIn.push(`[v${k}]`); k++;
}
// one quiet room tone throughout (the story stays in the house), with the cold tone under the mirror scenes
args.push('-stream_loop', '-1', '-i', SFX('amb1'));
f.push(`[${k}:a]${st},atrim=0:${total},afade=t=in:d=0.4,afade=t=out:st=${total - 3}:d=3,volume=0.4[a1]`); mixIn.push('[a1]'); k++;
args.push('-stream_loop', '-1', '-i', SFX('amb2'));
const m0 = C.fog, m1 = C.night;
f.push(`[${k}:a]${st},atrim=0:${m1 - m0},afade=t=in:d=2,afade=t=out:st=${m1 - m0 - 2}:d=2,volume=0.3,adelay=${ms(m0)}|${ms(m0)}[a2]`); mixIn.push('[a2]'); k++;
args.push('-stream_loop', '-1', '-i', SFX('amb2'));
f.push(`[${k}:a]${st},atrim=0:${total - C.lightoff},afade=t=in:d=2,afade=t=out:st=${total - C.lightoff - 3}:d=3,volume=0.3,adelay=${ms(C.lightoff)}|${ms(C.lightoff)}[a3]`); mixIn.push('[a3]'); k++;
sfx.forEach(([name, at, vol, extra], i) => {
  args.push('-i', LOC[name] ? path.join(dir, LOC[name]) : SFX(name));
  f.push(`[${k}:a]${st}${extra},volume=${vol},adelay=${ms(at)}|${ms(at)}[s${i}]`); mixIn.push(`[s${i}]`); k++;
});
f.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0:duration=longest,alimiter=limit=0.94,atrim=0:${total},afade=t=out:st=${total - 0.8}:d=0.8[out]`);
args.push('-filter_complex', f.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', path.join(dir, 'mix.wav'));
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log('mixed', sfx.length, 'sfx');
