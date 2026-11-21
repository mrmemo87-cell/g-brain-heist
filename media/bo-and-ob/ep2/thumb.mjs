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
  let g = DEFS + `<defs><radialGradient id="eg"><stop offset="0" stop-color="#ff3b3b" stop-opacity=".9"/><stop offset="1" stop-color="#ff3b3b" stop-opacity="0"/></radialGradient><clipPath id="tw"><rect x="900" y="70" width="960" height="940" rx="20"/></clipPath><clipPath id="tg"><rect x="60" y="330" width="760" height="750" rx="20"/></clipPath></defs><rect width="1920" height="1080" fill="#0b0920"/>`;
  // the warm kitchen: his mother holding the wrong one
  g += `<g clip-path="url(#tw)"><rect x="900" y="70" width="960" height="940" fill="#ffe9c2"/><rect x="900" y="760" width="960" height="250" fill="#e0b98a"/>`;
  g += char({ x: 1560, y: 1290, s: 1.75, face: -0.3, flip: 1, smile: 1.25, brow: -1.0, open: 1.12, look: [-0.5, 0.2], aL: 60, aR: 8 });
  g += `<circle cx="1470" cy="655" r="80" fill="url(#eg)"/><circle cx="1608" cy="655" r="80" fill="url(#eg)"/>`;
  g += char({ x: 1230, y: 1420, s: 2.1, face: 0, back: 1, bun: 1, hg: 'hg3', hc: '#5b3a6e', sw: PLUM, sc: '#f6c453', aL: 20, aR: 64 });
  g += `</g><rect x="900" y="70" width="960" height="940" rx="20" fill="none" stroke="#e9e6ff" stroke-width="22"/>`;
  // Bo, trapped behind cracked glass
  g += `<g clip-path="url(#tg)"><rect x="60" y="330" width="760" height="750" fill="#211b4d"/>`;
  g += char({ x: 440, y: 1400, s: 1.8, face: 0.55, smile: -0.6, brow: 1.3, open: 1.15, mouth: 0.95, look: [1, -0.1], aL: 150, aR: 150 });
  g += `<rect x="60" y="330" width="760" height="750" fill="#7fb4ff" opacity=".12"/></g>` + cracks(620, 560, 'tg', 1).replace(/stroke-width="4"/g, 'stroke-width="7"');
  g += `<rect x="60" y="330" width="760" height="750" rx="20" fill="none" stroke="#f6c453" stroke-width="20"/>`;
  g += `<path d="M 1100 185 Q 1270 190 1345 415" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round"/><path d="M 1100 185 Q 1270 190 1345 415" fill="none" stroke="${RED}" stroke-width="20" stroke-linecap="round"/><polygon points="1400,510 1255,470 1370,375" fill="${RED}" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>`;
  g += `<text x="60" y="240" font-size="250" fill="#ffe14d" stroke="#05040f" stroke-width="30" paint-order="stroke" stroke-linejoin="round" letter-spacing="4">NOT ME.</text>`;
  g += `<rect width="1920" height="1080" fill="url(#vig)"/>`;
  document.getElementById('s').innerHTML = g;
});
await p.screenshot({ path: path.join(dir, 'thumb_raw.png') });
await b.close();
