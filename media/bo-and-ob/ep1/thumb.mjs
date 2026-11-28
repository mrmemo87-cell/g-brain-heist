import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const dir = path.dirname(new URL(import.meta.url).pathname);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('file://' + path.join(dir, 'scene.html'));
await p.evaluate(() => window.ready);
await p.evaluate(() => {
  const RED = '#ff2d2d';
  let g = DEFS + `<defs><radialGradient id="rg" cx=".7" cy=".5" r=".7"><stop offset="0" stop-color="#5a1024"/><stop offset="1" stop-color="#07061a"/></radialGradient>
  <radialGradient id="eg"><stop offset="0" stop-color="#ff3b3b" stop-opacity=".9"/><stop offset="1" stop-color="#ff3b3b" stop-opacity="0"/></radialGradient></defs>
  <rect width="1920" height="1080" fill="url(#rg)"/>`;
  // mirror with the smiling double
  g += `<g transform="translate(120,-30) scale(1.06)"><g clip-path="url(#mc)"><rect x="1010" y="150" width="620" height="770" fill="#dff3f7"/>${tiles(1010,640,620,280,'#bfe6de','#9fd3c8')}`;
  g += char({ x: 1320, y: 1270, s: 1.55, face: -0.35, smile: 1.25, brow: -1.1, open: 1.12, look: [-0.9, 0.1], aL: 8, aR: 8 });
  g += `<circle cx="1240" cy="690" r="70" fill="url(#eg)"/><circle cx="1362" cy="690" r="70" fill="url(#eg)"/>`;
  const X = 1210, Y = 380, R = [[0.2, 420], [1.0, 520], [1.8, 560], [2.7, 420], [3.4, 300], [4.2, 330], [5.0, 300], [5.7, 380]];
  for (const [a, len] of R) { let d = 'M ' + X + ' ' + Y; for (let j = 1; j <= 6; j++) { const r = len * j / 6, w = (j % 2 ? 1 : -1) * 0.13; d += ' L ' + (X + Math.cos(a + w) * r).toFixed(1) + ' ' + (Y + Math.sin(a + w) * r).toFixed(1); } g += `<path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>`; }
  g += SHINE(1320) + `</g>` + MIRROR_FRAME(1010) + `</g>`;
  // terrified Bo, close up
  g += char({ x: 520, y: 1330, s: 1.85, face: 0.75, smile: -0.6, brow: 1.3, open: 1.15, mouth: 0.95, look: [1, 0], aL: 30, aR: 30 });
  // arrow + circle
  g += `<ellipse cx="1500" cy="785" rx="135" ry="85" fill="none" stroke="${RED}" stroke-width="16"/>`;
  g += `<path d="M 905 395 Q 1040 420 1150 560" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round"/><path d="M 905 395 Q 1040 420 1150 560" fill="none" stroke="${RED}" stroke-width="20" stroke-linecap="round"/><polygon points="1215,655 1085,585 1190,505" fill="${RED}" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>`;
  // text
  const T = (y, s, c, sz) => `<text x="60" y="${y}" font-size="${sz}" fill="${c}" stroke="#05040f" stroke-width="26" paint-order="stroke" stroke-linejoin="round" letter-spacing="2">${s}</text>`;
  g += T(170, 'IT STOPPED', '#ffffff', 170) + T(345, 'COPYING ME', '#ffe14d', 170);
  g += `<rect width="1920" height="1080" fill="url(#vig)"/>`;
  document.getElementById('s').innerHTML = g;
});
await p.screenshot({ path: path.join(dir, 'thumb_raw.png') });
await b.close();
