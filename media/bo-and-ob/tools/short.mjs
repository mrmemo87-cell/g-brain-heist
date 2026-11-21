// Cuts the vertical YouTube Short from an episode's rendered frames.
// Usage: node ../tools/short.mjs    (inside an episode folder; needs frames/, mix.wav, data.js and `short` in episode.mjs)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = process.cwd();
const ep = (await import(pathToFileURL(path.join(dir, 'episode.mjs')).href)).default, sh = ep.short;
const D = JSON.parse(fs.readFileSync('data.js', 'utf8').replace(/^window\.EP=/, '').replace(/;$/, ''));
const F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', V = D.V, END = 2.8;
const LEN = +sh.until(D.C, V).toFixed(2), H = +(D.C.title + 0.35).toFixed(2), X = sh.cropX ?? 300;
fs.mkdirSync('short', { recursive: true });
const impact = [path.join(dir, '..', 'sfx', 'impact.mp3'), path.join(dir, '..', 'boob', 'sfx_dark', 'impact.mp3')].find((f) => fs.existsSync(f));
// each caption entry: [voice id, [line1, line2], [line1, line2], ...] shown in equal slices of that clip
const caps = [];
for (const [id, ...parts] of sh.caps) { const s = V[id].s, d = V[id].e - V[id].s; parts.forEach((p, i) => caps.push([s + (d * i) / parts.length, s + (d * (i + 1)) / parts.length - 0.05 + (i === parts.length - 1 ? 0.35 : 0), p])); }
const T = (file, txt) => { fs.writeFileSync(file, txt); return file; };
// the hook keeps the full frame (it has its own captions); after that, crop to the action
let v = sh.fullFrame
  ? `[0:v]trim=0:${LEN},setpts=PTS-STARTPTS,scale=1080:608,pad=1080:1920:0:615:color=0x08071a,setsar=1`
  : `[0:v]trim=0:${H},setpts=PTS-STARTPTS,scale=1080:608,pad=1080:1920:0:615:color=0x08071a,setsar=1[h0];[0:v]trim=${H}:${LEN},setpts=PTS-STARTPTS,crop=1300:1080:${X}:0,scale=1080:898,pad=1080:1920:0:470:color=0x08071a,setsar=1[h1];[h0][h1]concat=n=2:v=1:a=0`;
v += `,drawtext=fontfile=${F}:textfile=${T('short/t1.txt', sh.title[0])}:fontcolor=0xf6c453:fontsize=58:x=(w-tw)/2:y=215,drawtext=fontfile=${F}:textfile=${T('short/t2.txt', sh.title[1])}:fontcolor=0xf6c453:fontsize=58:x=(w-tw)/2:y=298`;
caps.forEach(([s, e, lines], i) => lines.forEach((line, j) => { if (line) v += `,drawtext=fontfile=${F}:textfile=${T(`short/c${i}_${j}.txt`, line)}:fontcolor=white:fontsize=50:x=(w-tw)/2:y=${1490 + j * 74}:enable='between(t,${s.toFixed(2)},${e.toFixed(2)})'`; }));
v += `[main];color=c=0x08071a:s=1080x1920:r=30:d=${END}[ec];[ec]setsar=1,drawtext=fontfile=${F}:textfile=${T('short/e1.txt', 'Bo & Ob')}:fontcolor=0xe9e6ff:fontsize=150:x=(w-tw)/2:y=760,drawtext=fontfile=${F}:textfile=${T('short/e2.txt', 'WATCH THE FULL EPISODE')}:fontcolor=0xf6c453:fontsize=60:x=(w-tw)/2:y=980,drawtext=fontfile=${F}:textfile=${T('short/e3.txt', 'on this channel')}:fontcolor=white:fontsize=46:x=(w-tw)/2:y=1070[end];[main][end]concat=n=2:v=1:a=0[v]`;
const a = `[1:a]atrim=0:${LEN},asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=${LEN - 0.5}:d=0.5[aa];[2:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${END},volume=0.8,apad=whole_dur=${END}[ae];[aa][ae]concat=n=2:v=0:a=1[a]`;
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', 'frames/%05d.jpg', '-i', 'mix.wav', '-i', impact, '-filter_complex', v + ';' + a, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', 'short.mp4'], { stdio: 'inherit' });
console.log('short.mp4', (LEN + END).toFixed(1) + 's');
