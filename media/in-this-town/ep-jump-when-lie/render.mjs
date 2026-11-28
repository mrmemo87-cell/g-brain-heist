// Usage: node render.mjs stills 1,5,9   |   node render.mjs frames <workers>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const url = 'file://' + path.join(dir, process.env.SCENE || 'page.html');
const [mode, arg] = process.argv.slice(2);
const browser = await chromium.launch();
const open = async () => {
  const p = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.error('PAGEERR', e.message));
  await p.goto(url);
  await p.evaluate(() => window.ready);
  return p;
};
if (mode === 'stills') {
  const p = await open();
  fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });
  for (const t of arg.split(',')) {
    await p.evaluate((t) => window.renderAt(t), +t);
    await p.screenshot({ path: path.join(dir, 'stills', `t${t}.jpg`), type: 'jpeg', quality: 80 });
  }
} else {
  const { fps, total } = await (await open()).evaluate(() => window.DATA);
  const N = Math.round(fps * total), W = +(arg || 4);
  fs.rmSync(path.join(dir, process.env.FRAMES || 'frames'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, process.env.FRAMES || 'frames'));
  await Promise.all(Array.from({ length: W }, async (_, w) => {
    const p = await open();
    for (let i = w; i < N; i += W) {
      await p.evaluate((t) => window.renderAt(t), i / fps);
      await p.screenshot({ path: path.join(dir, process.env.FRAMES || 'frames', String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 95 });
    }
  }));
  console.log('frames', N);
}
await browser.close();
