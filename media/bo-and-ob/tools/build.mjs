// Shared episode builder: prepares voices, lays out the timeline, writes data.js and mixes the soundtrack.
// Usage: node ../tools/build.mjs            (run inside an episode folder that has episode.mjs)
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = process.cwd();
const ep = (await import(pathToFileURL(path.join(dir, 'episode.mjs')).href)).default;
const V = (f) => path.join(dir, 'voice', f);
const sfxDir = [process.env.SFX_DIR, path.join(dir, '..', 'sfx'), path.join(dir, '..', 'boob', 'sfx_dark')].filter(Boolean).find((d) => fs.existsSync(d));
const SFX = (f) => path.join(sfxDir, f + '.mp3');
const FPS = 30;
const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a.map(String)]);
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const silences = (f, d = 0.25) => { const e = spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', `silencedetect=noise=-35dB:d=${d}`, '-f', 'null', '-']).stderr.toString(); const s = [...e.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => +m[1]), en = [...e.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => +m[1]); return s.map((x, i) => ({ s: x, e: en[i] ?? x, d: (en[i] ?? x) - x })); };
const TRIM = 'silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse';
const FX = { plain: TRIM, ob: TRIM + ',asetrate=44100*0.86,aresample=44100,atempo=1.1628,aecho=0.8:0.7:45|90:0.35|0.2,highpass=f=90' };

// narrator: Chatterbox "tense" take, deepened and slowed slightly
const rawExt = fs.existsSync(path.join(dir, 'narr_raw', '000.wav')) ? '.wav' : '.mp3';
for (let i = 0; i < ep.narr; i++) ff(['-i', path.join(dir, 'narr_raw', String(i).padStart(3, '0') + rawExt), '-af', `asetrate=24000*0.91,aresample=44100,atempo=0.99,bass=g=3:f=120,${TRIM}`, V('n' + String(i + 1).padStart(2, '0') + '.wav')]);
// character batches: cut at the longest pauses
const vol = {};
for (const b of ep.batches) {
  const f = V(b.file), total = dur(f), sil = silences(f).filter((x) => x.s > 0.2 && x.e < total - 0.15).sort((a, c) => c.d - a.d);
  const seps = sil.slice(0, b.n - 1).sort((a, c) => a.s - c.s), inner = sil[b.n - 1]?.d ?? 0;
  if (seps.length !== b.n - 1 || Math.min(...seps.map((x) => x.d), 9) < inner * 1.2) console.warn('WARNING: uncertain split for', b.file, 'separator', Math.min(...seps.map((x) => x.d)).toFixed(2), 'inner', inner.toFixed(2));
  const cuts = [0, ...seps.map((x) => (x.s + x.e) / 2), total + 0.05];
  for (let i = 0; i < b.n; i++) { const id = b.prefix + ((b.start || 1) + i); ff(['-i', f, '-ss', cuts[i], '-to', cuts[i + 1], '-af', FX[b.fx || 'plain'], V(id + '.wav')]); vol[id] = b.vol; }
}
for (const [id, f, a, b, fx, v] of ep.patches || []) { ff(['-i', V(f), '-ss', a, '-to', b, '-af', FX[fx || 'plain'], V(id + '.wav')]); if (v) vol[id] = v; }

// timeline: "g1.2" gap, "cname" cue, anything else is a voice clip id
const Vd = {}, C = {};
let t = 0;
for (const tok of ep.seq.trim().split(/\s+/)) {
  if (/^g[0-9.]+$/.test(tok)) t += +tok.slice(1);
  else if (/^c[A-Za-z]/.test(tok) && !fs.existsSync(V(tok + '.wav'))) C[tok.slice(1)] = +t.toFixed(3);
  else {
    const f = V(tok + '.wav'), d = dur(f);
    let env = [];
    if (tok[0] !== 'n') {
      const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
      const n = Math.floor(pcm.length / 2), per = 8000 / FPS;
      for (let i = 0; i * per < n; i++) { let s = 0, k = 0; for (let j = Math.floor(i * per); j < Math.min(n, Math.floor((i + 1) * per)); j++) { const q = pcm.readInt16LE(j * 2) / 32768; s += q * q; k++; } env.push(Math.sqrt(s / Math.max(1, k))); }
      const mx = Math.max(...env); env = env.map((q) => +Math.min(1, (q / mx) * 1.5).toFixed(2));
    }
    Vd[tok] = { s: +t.toFixed(3), e: +(t + d).toFixed(3), env };
    t += d;
  }
}
const total = +t.toFixed(2);
// pauses inside a clip, as absolute times (used to time on-screen captions)
const pauses = (id) => { const d = dur(V(id + '.wav')); return silences(V(id + '.wav')).filter((x) => x.e > 0.5 && x.e < d - 0.4).map((x) => +(Vd[id].s + x.e).toFixed(3)); };
if (ep.post) ep.post(C, Vd, { pauses });
fs.writeFileSync(path.join(dir, 'data.js'), 'window.EP=' + JSON.stringify({ fps: FPS, total, V: Vd, C }) + ';');
const chars = (p) => Object.entries(Vd).filter(([k]) => k[0] === p).reduce((s, [, q]) => s + (q.e - q.s), 0).toFixed(0);
console.log('total', total, (total / 60).toFixed(2) + ' min | narrator', chars('n') + 's, voices', (+chars('b') + +chars('o') + +chars('m')).toFixed(0) + 's');
console.log(JSON.stringify(C));

// ---------------- mix (no music) ----------------
ff(['-f', 'lavfi', '-i', 'anoisesrc=d=0.06:c=white:a=0.9:r=44100', '-af', 'highpass=f=1500,afade=t=out:st=0.01:d=0.05', path.join(dir, 'click.wav')]);
ff(['-f', 'lavfi', '-i', 'anoisesrc=d=1.1:c=white:a=0.8:r=44100', '-af', 'highpass=f=3500,afade=t=in:d=0.08,afade=t=out:st=0.5:d=0.6', path.join(dir, 'hiss.wav')]);
ff(['-f', 'lavfi', '-i', 'anoisesrc=d=0.9:c=pink:a=0.9:r=44100', '-af', 'highpass=f=2000,tremolo=f=17:d=0.9,afade=t=in:d=0.05,afade=t=out:st=0.6:d=0.3', path.join(dir, 'rustle.wav')]);
const LOC = { CLICK: 'click.wav', HISS: 'hiss.wav', RUSTLE: 'rustle.wav' };
const sfx = ep.sfx(C, Vd, total), amb = ep.amb(C, Vd, total);
const args = ['-y', '-v', 'error'], f = [], mixIn = [];
let k = 0;
const st = 'aresample=44100,aformat=channel_layouts=stereo', ms = (x) => Math.max(0, Math.round(x * 1000));
for (const [id, q] of Object.entries(Vd)) {
  args.push('-i', V(id + '.wav'));
  const fx = id[0] === 'n' ? 'loudnorm=I=-17:TP=-2:LRA=11,' : '';
  f.push(`[${k}:a]${fx}${st},volume=${id[0] === 'n' ? 1.15 : vol[id] || 2.4},adelay=${ms(q.s)}|${ms(q.s)}[v${k}]`); mixIn.push(`[v${k}]`); k++;
}
amb.forEach(([name, from, to, v], i) => {
  args.push('-stream_loop', '-1', '-i', SFX(name));
  const len = to - from;
  f.push(`[${k}:a]${st},atrim=0:${len},afade=t=in:d=${Math.min(1.5, len / 4)},afade=t=out:st=${len - Math.min(2.5, len / 3)}:d=${Math.min(2.5, len / 3)},volume=${v},adelay=${ms(from)}|${ms(from)}[a${i}]`); mixIn.push(`[a${i}]`); k++;
});
sfx.forEach(([name, at, v, extra], i) => {
  args.push('-i', LOC[name] ? path.join(dir, LOC[name]) : SFX(name));
  f.push(`[${k}:a]${st}${extra || ''},volume=${v},adelay=${ms(at)}|${ms(at)}[s${i}]`); mixIn.push(`[s${i}]`); k++;
});
f.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0:duration=longest,alimiter=limit=0.94,atrim=0:${total},afade=t=out:st=${total - 0.8}:d=0.8[out]`);
args.push('-filter_complex', f.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', path.join(dir, 'mix.wav'));
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log('mixed', sfx.length, 'sfx,', amb.length, 'ambience beds');
