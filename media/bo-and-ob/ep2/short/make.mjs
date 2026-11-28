import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const D = JSON.parse(fs.readFileSync('data.js', 'utf8').replace(/^window\.EP=/, '').replace(/;$/, ''));
const V = D.V, END = 2.8, LEN = +(D.C.lightoff + 1.3).toFixed(2);
const half = (id, a, b, frac) => { const s = V[id].s, e = V[id].e, m = s + (e - s) * frac; return [[s, m - 0.05, a], [m, e + 0.3, b]]; };
const caps = [
  ...half('n03', 'From the other side,\na mirror is not glass.', 'It is a wall that happens\nto show you your own life.', 0.44),
  ...half('n04', 'Bo shouted until\nhis throat gave out.', 'The one wearing his face\ndid not even blink.', 0.42),
  ...half('n05', 'Watch his hands.', 'It will matter.', 0.5),
];
const H = +(D.C.title + 0.35).toFixed(2);
let v = `[0:v]trim=0:${H},setpts=PTS-STARTPTS,scale=1080:608,pad=1080:1920:0:615:color=0x08071a,setsar=1[h0];[0:v]trim=${H}:${LEN},setpts=PTS-STARTPTS,crop=1300:1080:300:0,scale=1080:898,pad=1080:1920:0:470:color=0x08071a,setsar=1[h1];[h0][h1]concat=n=2:v=1:a=0`;
fs.writeFileSync('short/t1.txt', 'WHAT IF YOU COULDN’T');
fs.writeFileSync('short/t2.txt', 'GET BACK OUT?');
v += `,drawtext=fontfile=${F}:textfile=short/t1.txt:fontcolor=0xf6c453:fontsize=62:x=(w-tw)/2:y=215,drawtext=fontfile=${F}:textfile=short/t2.txt:fontcolor=0xf6c453:fontsize=62:x=(w-tw)/2:y=300`;
caps.forEach(([s, e, txt], i) => txt.split('\n').forEach((line, j) => {
  fs.writeFileSync(`short/c${i}_${j}.txt`, line);
  v += `,drawtext=fontfile=${F}:textfile=short/c${i}_${j}.txt:fontcolor=white:fontsize=56:x=(w-tw)/2:y=${1490 + j * 78}:enable='between(t,${s.toFixed(2)},${e.toFixed(2)})'`;
}));
v += `[main];color=c=0x08071a:s=1080x1920:r=30:d=${END}[ec];`;
fs.writeFileSync('short/e1.txt', 'Bo & Ob'); fs.writeFileSync('short/e2.txt', 'WATCH THE FULL EPISODE'); fs.writeFileSync('short/e3.txt', 'on this channel');
v += `[ec]setsar=1,drawtext=fontfile=${F}:textfile=short/e1.txt:fontcolor=0xe9e6ff:fontsize=150:x=(w-tw)/2:y=760,drawtext=fontfile=${F}:textfile=short/e2.txt:fontcolor=0xf6c453:fontsize=60:x=(w-tw)/2:y=980,drawtext=fontfile=${F}:textfile=short/e3.txt:fontcolor=white:fontsize=46:x=(w-tw)/2:y=1070[end];[main][end]concat=n=2:v=1:a=0[v]`;
const a = `[1:a]atrim=0:${LEN},asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=${LEN - 0.5}:d=0.5[aa];[2:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${END},volume=0.8,apad=whole_dur=${END}[ae];[aa][ae]concat=n=2:v=0:a=1[a]`;
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', 'frames/%05d.jpg', '-i', 'mix.wav', '-i', process.env.IMPACT || '../sfx/impact.mp3', '-filter_complex', v + ';' + a, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', 'bo-and-ob-ep2-short.mp4'], { stdio: 'inherit' });
