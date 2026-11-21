// Cuts vertical trailer Shorts from the finished 16:9 video, with a title and burned-in captions
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const D = JSON.parse(fs.readFileSync('data.js', 'utf8').replace(/^window\.EP=/, '').replace(/;\s*$/, ''));
const V = D.V;
const NARR = fs.readFileSync('narr.txt', 'utf8').split('\n').filter((l) => l.trim()).map((l) => l.split('|').slice(2).join('|'));
const DLG = { p1: 'You snore like a broken lawnmower.', p2: 'I know. I’ve made it badly for eight years, so you’d stop asking me to make it.', p3: 'For the record... I love your snoring.',
  y1: 'And your feet are freezing. Every single night.', y2: 'This is honestly the worst coffee I have ever tasted.', y3: 'Tired. A bit scared of you. And I think about quitting every Wednesday.', y4: 'I love that you made this for me.',
  k1: 'I broke the vase. And the remote. And I put your car keys in the freezer!', b1: 'Morning! How are you?', b2: 'Same. Not the quitting. The being scared of me. I’m scared of me too.',
  c1: 'So... does anyone actually like this plan?', i1: 'What would you say is your greatest weakness?', j1: 'I lied on my CV. Twice. I don’t speak French.',
  s1: 'Three times! One of them was this morning. I crashed it... because I couldn’t stop telling a customer the truth.', z1: 'My fellow citizens... I have no idea what I’m doing. Nobody does. We’ve been guessing for years.',
  e1: 'Honestly? We made the numbers up. All of them.', d1: 'I’m only here because my mum made me come. You seem nice, though.' };
const text = (id) => (id[0] === 'n' ? NARR[+id.slice(1) - 1] : DLG[id]) || '';
const chunk = (s) => { const w = s.split(/\s+/); const out = []; let cur = ''; for (const x of w) { if ((cur + ' ' + x).trim().length > 24 && cur) { out.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); } if (cur) out.push(cur); return out; };
const F = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', END = 2.6;
const SHORTS = [
  { name: 'short-a', a: 0, b: D.C.title + 1.4, title: ['WHAT IF NOBODY', 'COULD LIE?'] },
  { name: 'short-b', a: V.n18.s - 0.3, b: V.n22.e + 0.5, title: ['WHAT IF YOUR BOSS', 'COULDN’T LIE?'] },
  { name: 'short-c', a: V.n49.s - 0.3, b: V.n56.e + 0.6, title: ['THE KINDEST THING', 'YOU CAN’T FAKE'] },
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
      const a = Math.max(0, s0 - sh.a), b = Math.min(L, s1 - sh.a + 0.1); if (b <= a) continue;
      v += `,drawtext=fontfile=${F}:textfile=${tf('c' + k++, (id[0] === 'n' ? '' : '“') + c + (id[0] === 'n' ? '' : '”'))}:fontcolor=${id[0] === 'n' ? 'white' : '0xffe14d'}:fontsize=66:x=(w-tw)/2:y=1480:borderw=7:bordercolor=0x05040f:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`; }
  }
  v += `[main];color=c=0x08071a:s=1080x1920:r=30:d=${END}[ec];[ec]setsar=1,drawtext=fontfile=${F}:textfile=${tf('e1', 'WATCH THE FULL VIDEO')}:fontcolor=0xffe14d:fontsize=70:x=(w-tw)/2:y=820,drawtext=fontfile=${F}:textfile=${tf('e2', 'What If Nobody Could Lie')}:fontcolor=white:fontsize=56:x=(w-tw)/2:y=940,drawtext=fontfile=${F}:textfile=${tf('e3', 'for 24 Hours?')}:fontcolor=white:fontsize=56:x=(w-tw)/2:y=1010,drawtext=fontfile=${F}:textfile=${tf('e4', 'on this channel')}:fontcolor=0x9aa0b5:fontsize=44:x=(w-tw)/2:y=1110[end];[main][end]concat=n=2:v=1:a=0[v]`;
  const a = `[0:a]atrim=${sh.a.toFixed(2)}:${sh.b.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=${(L - 0.5).toFixed(2)}:d=0.5,aresample=48000[aa];anullsrc=r=48000:cl=stereo,atrim=0:${END}[ae];[aa][ae]concat=n=2:v=0:a=1[a]`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', 'what-if-nobody-could-lie.mp4', '-filter_complex', v + ';' + a, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `shorts/${sh.name}.mp4`]);
  console.log(sh.name, (L + END).toFixed(1) + 's');
}
