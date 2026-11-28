// storyboard: one still per clip at fraction F, tiled into contact sheets
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const D = JSON.parse(fs.readFileSync('data.js', 'utf8').replace(/^window\.EP=/, '').replace(/;\s*$/, ''));
const F = +(process.argv[2] || 0.7);
const ids = Object.entries(D.V).sort((a, b) => a[1].s - b[1].s);
const ts = ids.map(([, q]) => +(q.s + F * (q.e - q.s)).toFixed(2)); ts.splice(5, 0, +(D.C.title + 1.2).toFixed(2));
fs.rmSync('stills', { recursive: true, force: true });
execFileSync('node', ['render.mjs', 'stills', ts.join(',')], { stdio: 'inherit' });
const files = ts.map((t) => `stills/t${t}.jpg`);
for (let p = 0; p * 20 < files.length; p++) {
  const part = files.slice(p * 20, p * 20 + 20), args = [];
  part.forEach((f) => args.push('-i', f));
  const lab = part.map((f, i) => `[${i}:v]scale=480:270,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${(ids[p * 20 + i - (p * 20 + i > 5 ? 1 : 0)] || ['title'])[0]}':x=8:y=8:fontsize=22:fontcolor=yellow:borderw=2[v${i}]`).join(';');
  while (part.length < 20) { args.push('-f', 'lavfi', '-i', 'color=black:s=480x270'); part.push('x'); }
  const pads = Array.from({ length: 20 }, (_, i) => i < files.slice(p * 20, p * 20 + 20).length ? `[v${i}]` : `[${i}:v]`).join('');
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args, '-filter_complex', `${lab};${pads}xstack=inputs=20:layout=${Array.from({ length: 20 }, (_, i) => `${(i % 4) * 480}_${Math.floor(i / 4) * 270}`).join('|')}`, '-frames:v', '1', '-q:v', '4', `sb-${p + 1}.jpg`]);
}
console.log('sheets', Math.ceil(files.length / 20));
