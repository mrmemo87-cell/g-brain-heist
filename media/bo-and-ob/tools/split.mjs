// Finds where a batched voice clip (lines separated by long pauses) should be cut.
// Usage: node split.mjs clip.mp3 <number of lines>   ->  prints cut points and a safety margin
import { spawnSync } from 'node:child_process';
const [file, nStr] = process.argv.slice(2), n = +nStr;
const err = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-']).stderr.toString();
const st = [...err.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => +m[1]), en = [...err.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => +m[1]);
const dur = +(/Duration: (\d+):(\d+):([0-9.]+)/.exec(err) || []).slice(1).reduce((a, x) => a * 60 + +x, 0);
const sil = st.map((s, i) => ({ s, e: en[i] ?? dur, d: (en[i] ?? dur) - s })).filter((x) => x.s > 0.2 && x.e < dur - 0.15);
const sorted = [...sil].sort((a, b) => b.d - a.d), seps = sorted.slice(0, n - 1).sort((a, b) => a.s - b.s), rest = sorted.slice(n - 1);
const cuts = seps.map((x) => +((x.s + x.e) / 2).toFixed(2));
console.log(JSON.stringify({ cuts, total: +dur.toFixed(2), shortestSeparator: +Math.min(...seps.map((x) => x.d)).toFixed(2), longestInnerPause: +(rest[0]?.d ?? 0).toFixed(2), ok: seps.length === n - 1 && Math.min(...seps.map((x) => x.d)) > (rest[0]?.d ?? 0) * 1.25 }));
