// Voice chain -> timeline (data.js) -> SFX + official theme mix (mix.wav). Run inside this folder.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const TIMING = new Function(fs.readFileSync(new URL('./timing.js', import.meta.url), 'utf8') + '\nreturn TIMING;')();
const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a.map(String)]);
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const TRIM = 'silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse';
fs.mkdirSync('voice', { recursive: true });
const N = 24;
for (let i = 0; i < N; i++) ff(['-i', `narr_raw/${String(i).padStart(3, '0')}.wav`, '-af', `asetrate=24000*0.91,aresample=44100,atempo=0.99,bass=g=3:f=120,${TRIM}`, `voice/n${String(i + 1).padStart(2, '0')}.wav`]);
// gaps leave room for each jump after its lie
const seq = `g0.2 n01 g0.3 n02 g0.5 n03 g1.15 n04 g0.7 n05 g1.0 n06 g0.7 n07 g0.9 n08 g0.8 n09 g0.3 n10 g1.0 n11 g0.9
  n12 g0.3 n13 g1.1 n14 g1.9 n15 g1.0 n16 g0.8 n17 g0.3 n18 g0.3 n19 g0.9 n20 g0.2 n21 g1.1 n22 g1.1 n23 g0.3 n24 g3.6`;
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
const FILES = { boing: 'boing.wav', thud: 'thud.wav', bonk: 'bonk.wav', whoosh: SFXD + 'portal.mp3', tick: SFXD + 'clock.mp3', stamp: SFXD + 'impact.mp3' };
const { S } = TIMING(V);
const args = [], f = [], mix = []; let k = 0;
const st = 'aresample=44100,aformat=channel_layouts=stereo', ms = (x) => Math.max(0, Math.round(x * 1000));
for (const [id, q] of Object.entries(V)) { args.push('-i', `voice/${id}.wav`); f.push(`[${k}:a]loudnorm=I=-17:TP=-2:LRA=11,${st},adelay=${ms(q.s)}|${ms(q.s)}[v${k}]`); mix.push(`[v${k}]`); k++; }
for (const [name, at, v] of S) { if (at > total) continue; args.push('-i', FILES[name]); f.push(`[${k}:a]${st},volume=${v},adelay=${ms(at)}|${ms(at)}[x${k}]`); mix.push(`[x${k}]`); k++; }
f.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=longest,apad,atrim=0:${total}[fg]`);
// official theme: from 0:00, ~20 dB under the narration, fade out over the last 1.5 s
args.push('-i', '../../music/in-this-town-theme.mp3');
f.push(`[${k}:a]${st},atrim=0:${total},loudnorm=I=-37:TP=-9:LRA=11,${st},afade=t=out:st=${total - 1.5}:d=1.5[mu]`);
f.push(`[fg][mu]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[out]`);
execFileSync('ffmpeg', ['-y', '-v', 'error', ...args, '-filter_complex', f.join(';'), '-map', '[out]', '-ar', '44100', '-c:a', 'pcm_s16le', 'premix.wav'], { stdio: 'inherit' });
// final loudness: two-pass linear loudnorm to I=-17 (no pumping of the music bed)
const err = spawnSync('ffmpeg', ['-hide_banner', '-i', 'premix.wav', '-af', 'loudnorm=I=-17:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).stderr.toString();
const m = JSON.parse(err.slice(err.lastIndexOf('{')));
ff(['-i', 'premix.wav', '-af', `loudnorm=I=-17:TP=-1.5:LRA=11:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`, '-ar', '44100', '-c:a', 'pcm_s16le', 'mix.wav']);
console.log('mixed', S.length, 'sfx');
