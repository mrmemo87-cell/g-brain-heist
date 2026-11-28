// Voice chain -> timeline (data.js) -> SFX + official theme mix (mix.wav). Run inside this folder.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const TIMING = new Function(fs.readFileSync(new URL('./timing.js', import.meta.url), 'utf8') + '\nreturn TIMING;')();
const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a.map(String)]);
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const TRIM = 'silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse';
fs.mkdirSync('voice', { recursive: true });
const N = 86;
for (let i = 0; i < N; i++) ff(['-i', `narr_raw/${String(i).padStart(3, '0')}.wav`, '-af', `asetrate=24000*0.91,aresample=44100,atempo=0.99,bass=g=3:f=120,${TRIM}`, `voice/n${String(i + 1).padStart(2, '0')}.wav`]);
// gaps leave room for each jump after its lie
const seq = `g0.2 n01 g0.25 n02 g0.4 n03 g1.0 n04 g0.5 n05 g0.95 n06 g0.5 n07 g0.85 n08 g0.5 n25 g0.15 n26 g1.0 n27 g0.2 n28 g0.5
  n29 g0.15 n30 g0.95 n31 g0.9 n32 g0.5 n09 g0.2 n10 g0.95 n11 g0.6 n12 g0.2 n13 g1.0 n14 g1.7 n15 g0.95 n16 g0.5
  n33 g0.15 n34 g1.0 n35 g0.5 n36 g0.15 n37 g1.1 n38 g0.6 n17 g0.3 n18 g0.2 n19 g1.7
  n39 g0.2 n40 g0.6 n41 g0.1 n42 g0.95 n43 g0.4 n44 g0.1 n45 g1.3 n46 g0.5 n47 g0.1 n48 g0.95 n49 g0.4 n50 g0.1 n51 g1.2 n52 g0.5
  n53 g0.1 n54 g0.9 n55 g0.4 n56 g0.1 n57 g0.5 n58 g0.5 n59 g0.1 n60 g1.6
  n61 g0.1 n62 g0.9 n63 g0.4 n64 g0.1 n65 g1.0 n66 g0.4 n67 g0.1 n68 g0.9 n69 g1.0 n70 g0.15 n71 g1.0 n72 g0.1 n73 g1.1
  n74 g0.1 n75 g0.9 n76 g0.4 n77 g0.1 n78 g1.2 n79 g0.2 n80 g0.4 n81 g0.3 n82 g1.1 n83 g0.5 n84 g0.1 n85 g1.0 n86 g0.6
  n20 g0.2 n21 g1.1 n22 g1.0 n23 g0.3 n24 g2.8`;
const V = {}; let t = 0;
for (const tok of seq.trim().split(/\s+/)) { if (tok[0] === 'g') t += +tok.slice(1); else { const d = dur(`voice/${tok}.wav`); V[tok] = { s: +t.toFixed(3), e: +(t + d).toFixed(3) }; t += d; } }
const total = +t.toFixed(2);
fs.writeFileSync('data.js', 'window.EP=' + JSON.stringify({ fps: 30, total, V, C: {} }) + ';');
console.log('total', total);
// sfx: springy boing, soft dust thud, bonk, whoosh, tick
const SFXD = '../../../bo-and-ob/sfx/';
ff(['-f', 'lavfi', '-i', "aevalsrc='0.7*sin(2*PI*(160*t+700*t*t))*exp(-5*t)':s=44100:d=0.45", '-af', 'vibrato=f=18:d=0.5,afade=t=out:st=0.3:d=0.15', 'boing.wav']);
ff(['-f', 'lavfi', '-i', 'anoisesrc=d=0.35:c=brown:a=0.9:r=44100', '-af', 'lowpass=f=500,afade=t=in:d=0.005,afade=t=out:st=0.05:d=0.3', 'thud.wav']);
ff(['-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*520*t)*exp(-14*t)+0.4*sin(2*PI*780*t)*exp(-18*t)':s=44100:d=0.4", 'bonk.wav']);
const FILES = { boing: 'boing.wav', thud: 'thud.wav', bonk: 'bonk.wav', whoosh: SFXD + 'portal.mp3', tick: SFXD + 'clock.mp3', stamp: SFXD + 'impact.mp3', crash: SFXD + 'crack.mp3' };
const { S } = TIMING(V);
const args = [], f = [], mix = []; let k = 0;
const st = 'aresample=44100,aformat=channel_layouts=stereo', ms = (x) => Math.max(0, Math.round(x * 1000));
for (const [id, q] of Object.entries(V)) { args.push('-i', `voice/${id}.wav`); f.push(`[${k}:a]loudnorm=I=-17:TP=-2:LRA=11,${st},adelay=${ms(q.s)}|${ms(q.s)}[v${k}]`); mix.push(`[v${k}]`); k++; }
for (const [name, at, v] of S) { if (at > total) continue; args.push('-i', FILES[name]); f.push(`[${k}:a]${st},volume=${v},adelay=${ms(at)}|${ms(at)}[x${k}]`); mix.push(`[x${k}]`); k++; }
f.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=longest,apad,atrim=0:${total}[fg]`);
// official theme: from 0:00, ~20 dB under the narration, fade out over the last 1.5 s
args.push('-i', '../../music/in-this-town-theme.mp3', '-i', '../../music/in-this-town-theme.mp3');
// theme looped once with a 3 s crossfade, ~20 dB under the voice; a little louder during the Truth Day parade
const P0 = V.n77 ? V.n77.s : 0, P1 = V.n78 ? V.n78.e + 1.2 : 0;
f.push(`[${k}:a]${st}[m1];[${k + 1}:a]${st}[m2];[m1][m2]acrossfade=d=3:c1=tri:c2=tri,atrim=0:${total},loudnorm=I=-37:TP=-9:LRA=11,${st},volume='if(between(t,${P0},${P1}),1.7,1)':eval=frame,afade=t=out:st=${total - 1.5}:d=1.5[mu]`);
f.push(`[fg][mu]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[out]`);
execFileSync('ffmpeg', ['-y', '-v', 'error', ...args, '-filter_complex', f.join(';'), '-map', '[out]', '-ar', '44100', '-c:a', 'pcm_s16le', 'premix.wav'], { stdio: 'inherit' });
// final loudness: two-pass linear loudnorm to I=-17 (no pumping of the music bed)
const err = spawnSync('ffmpeg', ['-hide_banner', '-i', 'premix.wav', '-af', 'loudnorm=I=-17:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).stderr.toString();
const m = JSON.parse(err.slice(err.lastIndexOf('{')));
ff(['-i', 'premix.wav', '-af', `loudnorm=I=-17:TP=-1.5:LRA=11:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`, '-ar', '44100', '-c:a', 'pcm_s16le', 'mix.wav']);
console.log('mixed', S.length, 'sfx');
