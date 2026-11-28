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
  let g = DEFS + `<defs><clipPath id="tw"><rect x="860" y="60" width="1000" height="960" rx="20"/></clipPath><clipPath id="tg"><rect x="60" y="330" width="720" height="750" rx="20"/></clipPath></defs><rect width="1920" height="1080" fill="#0b0920"/>`;
  // the warm room: a mother kissing the wrong child good morning
  g += `<g clip-path="url(#tw)"><rect x="860" y="60" width="1000" height="960" fill="#e9f2dc"/><rect x="860" y="700" width="1000" height="320" fill="#bcd9a8"/>`;
  g += char({ x: 1170, y: 1330, s: 1.75, face: 0.35, flip: 1, smile: -0.4, brow: 1.3, open: 1.15, look: [0.9, -0.2], aL: 8, aR: 8 });
  g += mother({ x: 1640, y: 1420, s: 2.0, face: -0.75, smile: 1.1, brow: 0.2, open: 0.08, look: [-0.8, 0], aL: 70, aR: 8, tilt: -9 });
  g += `</g><rect x="860" y="60" width="1000" height="960" rx="20" fill="none" stroke="#e9e6ff" stroke-width="22"/>`;
  // her real daughter, behind the glass
  g += `<g clip-path="url(#tg)"><rect x="60" y="330" width="720" height="750" fill="#211b4d"/>`;
  g += girl({ x: 420, y: 1400, s: 1.8, face: 0.55, smile: -0.6, brow: 1.3, open: 1.15, mouth: 0.95, look: [1, -0.1], aL: 150, aR: 150 });
  g += `<rect x="60" y="330" width="720" height="750" fill="#7fb4ff" opacity=".12"/><polygon points="200,330 330,330 130,1080 0,1080" fill="#fff" opacity=".14"/></g><rect x="60" y="330" width="720" height="750" rx="20" fill="none" stroke="#f6c453" stroke-width="20"/>`;
  g += `<path d="M 760 250 Q 900 240 990 420" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round"/><path d="M 760 250 Q 900 240 990 420" fill="none" stroke="${RED}" stroke-width="20" stroke-linecap="round"/><polygon points="1050,520 915,470 1035,380" fill="${RED}" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>`;
  const T = (y, s, c) => `<text x="60" y="${y}" font-size="170" fill="${c}" stroke="#05040f" stroke-width="28" paint-order="stroke" stroke-linejoin="round" letter-spacing="3">${s}</text>`;
  g += T(160, 'WRONG', '#ffffff') + T(310, 'CHILD.', '#ffe14d');
  g += `<rect width="1920" height="1080" fill="url(#vig)"/>`;
  document.getElementById('s').innerHTML = g;
});
await p.screenshot({ path: path.join(dir, 'thumb_raw.png') });
await b.close();
