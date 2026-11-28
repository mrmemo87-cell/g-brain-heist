// storyboard: frame 0, each clip at 60%, and each lie-jump apex; tiled into contact sheets (4x3 of 270x480)
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const D = JSON.parse(fs.readFileSync('data.js', 'utf8').replace(/^window\.EP=/, '').replace(/;\s*$/, ''));
const TIMING = new Function(fs.readFileSync('timing.js', 'utf8') + '\nreturn TIMING;')();
const { J } = TIMING(D.V);
let ts = [0, ...Object.values(D.V).map((q) => q.s + 0.6 * (q.e - q.s)), ...J.filter((j) => j.sfx || ['mayor'].includes(j.k)).map((j) => j.t0 + Math.min(j.dur, 3) / 2), D.total - 0.5];
ts = [...new Set(ts.map((t) => +t.toFixed(2)))].filter((t) => t >= 0).sort((a, b) => a - b);
const SD = process.env.STILLS || 'stills'; fs.rmSync(SD, { recursive: true, force: true });
execFileSync('node', ['render.mjs', 'stills', ts.join(',')], { stdio: 'inherit' });
for (let p = 0; p * 12 < ts.length; p++) {
  const part = ts.slice(p * 12, p * 12 + 12), args = [];
  part.forEach((t) => args.push('-i', `${SD}/t${t}.jpg`));
  for (let q = part.length; q < 12; q++) args.push('-f', 'lavfi', '-i', 'color=black:s=270x480');
  const lab = Array.from({ length: 12 }, (_, i) => `[${i}:v]scale=270:480,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${part[i] ?? ''}':x=6:y=6:fontsize=20:fontcolor=red[v${i}]`).join(';');
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args, '-filter_complex', `${lab};${Array.from({ length: 12 }, (_, i) => `[v${i}]`).join('')}xstack=inputs=12:layout=${Array.from({ length: 12 }, (_, i) => `${(i % 6) * 270}_${Math.floor(i / 6) * 480}`).join('|')}`, '-frames:v', '1', '-q:v', '3', `${process.env.SBP || 'sb'}-${p + 1}.jpg`]);
}
console.log(ts.length, 'stills');
