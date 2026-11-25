// Cuts vertical trailer Shorts from the finished 16:9 video, with a title and burned-in captions
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const D = JSON.parse(fs.readFileSync('data.js', 'utf8').replace(/^window\.EP=/, '').replace(/;\s*$/, ''));
const V = D.V;
const NARR = fs.readFileSync('narr.txt', 'utf8').split('\n').filter((l) => l.trim()).map((l) => l.split('|').slice(2).join('|'));
const DLG = { j1: 'Heyyy bestie! Miss you so much! Quick favour... can you drive me to the airport? At four AM?', k1: 'Love that! Mind if I take it to the meeting? I\u2019ll mention you, obviously.', x1: 'Oh no. Forgot my wallet again! Next one\u2019s on me, yeah?', m1: 'Oh! Hello, love. Is everything alright? You never just call.' };
const text = (id) => (id[0] === 'n' ? NARR[+id.slice(1) - 1] : DLG[id]) || '';
const chunk = (s) => { const w = s.split(/\s+/); const out = []; let cur = ''; for (const x of w) { if ((cur + ' ' + x).trim().length > 24 && cur) { out.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); } if (cur) out.push(cur); return out; };
const F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', END = 2.6;
const SHORTS = [
  { name: 'short-a', a: 0, b: D.C.title + 1.6, title: ['SEE WHO', 'USES YOU'] },
  { name: 'short-b', a: V.n07.s - 0.2, b: V.n13.e + 0.6, title: ['YOUR BESTIE', 'ONLY TEXTS WHEN…'] },
  { name: 'short-c', a: V.n14.s - 0.2, b: V.n21.e + 0.6, title: ['SHE STOLE', 'YOUR IDEAS'] },
  { name: 'short-d', a: V.n25.s - 0.2, b: V.n32.e + 0.6, title: ['WHO USES', 'THE WORLD'] },
  { name: 'short-e', a: V.n39.s - 0.2, b: V.n53.e + 0.6, title: ['THEN YOU LOOK', 'AT YOUR OTHER HAND'] },
];
fs.mkdirSync('shorts', { recursive: true });
for (const sh of SHORTS) {
  const L = +(sh.b - sh.a).toFixed(2), tf = (n, s) => { const p = `shorts/${sh.name}_${n}.txt`; fs.writeFileSync(p, s); return p; };
  let v = `[0:v]trim=${sh.a.toFixed(2)}:${sh.b.toFixed(2)},setpts=PTS-STARTPTS,crop=1440:1080:240:0,scale=1080:810,pad=1080:1920:0:560:color=0x0b0826,setsar=1`;
  v += `,drawtext=fontfile=${F}:textfile=${tf('t1', sh.title[0])}:fontcolor=white:fontsize=72:x=(w-tw)/2:y=290:borderw=6:bordercolor=0x05040f`;
  v += `,drawtext=fontfile=${F}:textfile=${tf('t2', sh.title[1])}:fontcolor=0xffe14d:fontsize=72:x=(w-tw)/2:y=385:borderw=6:bordercolor=0x05040f`;
  let k = 0;
  for (const [id, q] of Object.entries(V)) {
    if (q.e < sh.a || q.s > sh.b) continue;
    const ch = chunk(text(id)), tot = ch.reduce((s, c) => s + c.length + 3, 0); let acc = 0;
    for (const c of ch) { const s0 = q.s + (q.e - q.s) * acc / tot; acc += c.length + 3; const s1 = q.s + (q.e - q.s) * acc / tot;
      const a = Math.max(0, s0 - sh.a), b = Math.min(L, s1 - sh.a - 0.02); if (b <= a) continue;
      v += `,drawtext=fontfile=${F}:textfile=${tf('c' + k++, (id[0] === 'n' ? '' : '“') + c + (id[0] === 'n' ? '' : '”'))}:fontcolor=${id[0] === 'n' ? 'white' : '0xffe14d'}:fontsize=66:x=(w-tw)/2:y=1480:borderw=7:bordercolor=0x05040f:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`; }
  }
  v += `[main];color=c=0x08071a:s=1080x1920:r=30:d=${END}[ec];[ec]setsar=1,drawtext=fontfile=${F}:textfile=${tf('e1', 'WATCH THE FULL VIDEO')}:fontcolor=0xffe14d:fontsize=70:x=(w-tw)/2:y=820,drawtext=fontfile=${F}:textfile=${tf('e2', 'What If You Could See')}:fontcolor=white:fontsize=56:x=(w-tw)/2:y=940,drawtext=fontfile=${F}:textfile=${tf('e3', 'Who Uses You?')}:fontcolor=white:fontsize=56:x=(w-tw)/2:y=1010,drawtext=fontfile=${F}:textfile=${tf('e4', 'on this channel')}:fontcolor=0x9aa0b5:fontsize=44:x=(w-tw)/2:y=1110[end];[main][end]concat=n=2:v=1:a=0[v]`;
  const a = `[0:a]atrim=${sh.a.toFixed(2)}:${sh.b.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=${(L - 0.5).toFixed(2)}:d=0.5,aresample=48000[aa];anullsrc=r=48000:cl=stereo,atrim=0:${END}[ae];[aa][ae]concat=n=2:v=0:a=1[a]`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', 'what-if-who-uses-you.mp4', '-filter_complex', v + ';' + a, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `shorts/${sh.name}.mp4`]);
  console.log(sh.name, (L + END).toFixed(1) + 's');
}
