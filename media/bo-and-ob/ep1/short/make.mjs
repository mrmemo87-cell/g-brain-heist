import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const A = [0, 11.7], B = [15.5, 52.9], END = 2.8;
const la = A[1] - A[0], lb = B[1] - B[0];
const caps = [
  [1.8, 3.9, 'Your reflection is late.'], [4.16, 6.4, 'Only by a fraction of a second.'], [6.73, 8.25, 'You have never noticed,'],
  [8.39, 10.7, 'because you have never\nhad a reason to check.'], [11.0, 12.7, 'Bo had a reason.'],
  [19.9, 22.9, 'Every morning, at fourteen\nminutes past seven,'], [23.05, 25.7, 'Bo stood in front of\nthe same mirror.'],
  [26.3, 27.6, 'He raised his hand.'], [27.85, 29.4, 'It raised its hand.'], [29.9, 30.9, 'He smiled.'], [31.17, 32.3, 'It smiled.'],
  [32.8, 35.0, 'Everything in a mirror\nis backwards.'], [35.17, 36.6, 'Left becomes right.'], [36.77, 38.3, 'Words turn around.'],
  [38.68, 39.6, 'Remember that.'], [39.77, 41.0, 'It will matter.'], [41.67, 45.8, 'For eleven years, the mirror did\nexactly what it was told.'],
  [49.24, 50.9, 'But this morning...'], [51.5, 53.6, 'his reflection was late.'],
];
const map = (t) => (t < A[1] ? t - A[0] : t - B[0] + la);
let v = `[0:v]trim=${A[0]}:${A[1]},setpts=PTS-STARTPTS[va];[0:v]trim=${B[0]}:${B[1]},setpts=PTS-STARTPTS[vb];[va][vb]concat=n=2:v=1:a=0,crop=1300:1080:350:0,scale=1080:898,pad=1080:1920:0:470:color=0x08071a,setsar=1`;
fs.writeFileSync('short/t1.txt', 'WHAT IF YOUR REFLECTION');
fs.writeFileSync('short/t2.txt', 'STOPPED COPYING YOU?');
v += `,drawtext=fontfile=${F}:textfile=short/t1.txt:fontcolor=0xf6c453:fontsize=62:x=(w-tw)/2:y=215,drawtext=fontfile=${F}:textfile=short/t2.txt:fontcolor=0xf6c453:fontsize=62:x=(w-tw)/2:y=300`;
caps.filter((c) => c[0] > 13).map((c) => [c[0] - 1.4, c[1] - 1.4, c[2]]).forEach(([s, e, txt], i) => {
  txt.split('\n').forEach((line, j) => {
    fs.writeFileSync(`short/c${i}_${j}.txt`, line);
    v += `,drawtext=fontfile=${F}:textfile=short/c${i}_${j}.txt:fontcolor=white:fontsize=56:x=(w-tw)/2:y=${1490 + j * 78}:enable='between(t,${map(s).toFixed(2)},${map(e).toFixed(2)})'`;
  });
});
v += `[main];color=c=0x08071a:s=1080x1920:r=30:d=${END}[ec];`;
fs.writeFileSync('short/e1.txt', 'Bo & Ob');
fs.writeFileSync('short/e2.txt', 'WATCH THE FULL EPISODE');
fs.writeFileSync('short/e3.txt', 'on this channel');
v += `[ec]setsar=1,drawtext=fontfile=${F}:textfile=short/e1.txt:fontcolor=0xe9e6ff:fontsize=150:x=(w-tw)/2:y=760,drawtext=fontfile=${F}:textfile=short/e2.txt:fontcolor=0xf6c453:fontsize=60:x=(w-tw)/2:y=980,drawtext=fontfile=${F}:textfile=short/e3.txt:fontcolor=white:fontsize=46:x=(w-tw)/2:y=1070[end];[main][end]concat=n=2:v=1:a=0[v]`;
const a = `[1:a]atrim=${A[0]}:${A[1]},asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=${la - 0.25}:d=0.25[aa];[1:a]atrim=${B[0]}:${B[1]},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st=${lb - 0.5}:d=0.5[ab];[2:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${END},volume=0.8,apad=whole_dur=${END}[ae];[aa][ab][ae]concat=n=3:v=0:a=1[a]`;
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', 'frames/%05d.jpg', '-i', 'mix.wav', '-i', '../sfx/impact.mp3', '-filter_complex', v + ';' + a, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', 'bo-and-ob-ep1-short.mp4'], { stdio: 'inherit' });
