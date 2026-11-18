// Draws an episode thumbnail. Usage (inside an episode folder with scene.html and thumb.js): node ../tools/thumb.mjs
// thumb.js is an expression evaluated inside the scene page (so it can use char(), mother(), DEFS ...) that returns SVG markup.
// Helpers it can use: T(y, text, colour, size, x) for the big outlined words and ARROW(x1,y1,cx,cy,x2,y2) for the red arrow.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const dir = process.cwd();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.error('PAGEERR', e.message));
await p.goto('file://' + path.join(dir, 'scene.html'));
await p.evaluate(() => window.ready);
await p.evaluate((code) => {
  const T = (y, s, c, size = 200, x = 50) => `<text x="${x}" y="${y}" font-size="${size}" fill="${c}" stroke="#05040f" stroke-width="30" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${s}</text>`;
  const ARROW = (x1, y1, cx, cy, x2, y2) => { const a = Math.atan2(y2 - cy, x2 - cx), q = (d, w) => `${(x2 + Math.cos(a) * d - Math.sin(a) * w).toFixed(0)},${(y2 + Math.sin(a) * d + Math.cos(a) * w).toFixed(0)}`; return `<path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round"/><path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="#ff2d2d" stroke-width="20" stroke-linecap="round"/><polygon points="${q(80, 0)} ${q(-30, 70)} ${q(-30, -70)}" fill="#ff2d2d" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>`; };
  document.getElementById('s').innerHTML = DEFS + eval(code) + `<rect width="1920" height="1080" fill="url(#vig)"/>`;
}, fs.readFileSync(path.join(dir, 'thumb.js'), 'utf8'));
await p.screenshot({ path: path.join(dir, 'thumb_raw.png') });
await b.close();
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', 'thumb_raw.png', '-vf', 'scale=1280:720', '-q:v', '3', 'thumbnail.jpg']);
console.log('thumbnail.jpg');
