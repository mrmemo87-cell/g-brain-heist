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
  let g = DEFS + `<rect width="1920" height="1080" fill="#2a2140"/><rect x="0" y="800" width="1920" height="280" fill="#1a1430"/><circle cx="1400" cy="520" r="620" fill="#f6c453" opacity=".16"/>`;
  // the impostor, huge, smiling, scarf on the wrong side
  g += impostor({ x: 1400, y: 1620, s: 2.3, face: -0.7, aL: 8, aR: 8, smile: 1.1, brow: -0.5, open: 1.1, look: [-0.9, 0.2] });
  // Bo, small, looking up at her
  g += char({ x: 420, y: 1120, s: 1.15, face: 1, aL: 8, aR: 8, smile: -0.8, brow: 1.2, open: 1.15, look: [0.9, -0.7] });
  g += `<path d="M 700 330 Q 860 300 980 400" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round"/><path d="M 700 330 Q 860 300 980 400" fill="none" stroke="${RED}" stroke-width="20" stroke-linecap="round"/><polygon points="1060,470 920,450 1010,340" fill="${RED}" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>`;
  const T = (y, s, c) => `<text x="50" y="${y}" font-size="200" fill="${c}" stroke="#05040f" stroke-width="30" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${s}</text>`;
  g += T(190, 'NOT', '#ffffff') + T(370, 'MOM.', '#ffe14d');
  g += `<rect width="1920" height="1080" fill="url(#vig)"/>`;
  document.getElementById('s').innerHTML = g;
});
await p.screenshot({ path: path.join(dir, 'thumb_raw.png') });
await b.close();
