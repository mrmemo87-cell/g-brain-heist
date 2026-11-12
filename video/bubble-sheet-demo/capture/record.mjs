// Records the real Brains Heist paper-assignment flow with Playwright.
//
//   node capture/record.mjs desktop   -> capture/out/desktop/{page.webm, print.webm, timeline.json, photos/}
//   node capture/record.mjs mobile    -> capture/out/mobile/...
//
// Requires the app running at APP_URL (default http://127.0.0.1:4180) against the
// demo Supabase project, with the demo teacher login. Every click is logged with a
// timestamp (ms from the start of the recording) so the Remotion composition can
// cut and zoom to the exact moment.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const launchOptions = process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {};
// The photo renderer must not inherit the phone take's device-scale flag: at 3x its 1800x2400
// canvas paints too slowly and screenshots come out half blank.
const shooterLaunchOptions = { ...launchOptions };

const mode = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:4180/';
const EMAIL = process.env.DEMO_TEACHER_EMAIL || 'demo.teacher@example.com';
const PASSWORD = process.env.DEMO_TEACHER_PASSWORD || 'BrainsHeistDemo2026';
const TITLE = process.env.ASSIGNMENT_TITLE || `Adjectives quiz · Unit 4`;
const PHOTO_COUNT = 4;

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out', mode);
mkdirSync(join(out, 'sheets'), { recursive: true });
mkdirSync(join(out, 'photos'), { recursive: true });

const PHONE = { width: 393, height: 852, scale: 3 };
const size = mode === 'mobile' ? { width: PHONE.width * PHONE.scale, height: PHONE.height * PHONE.scale } : { width: 1920, height: 1080 };
// Desktop uses Playwright's recorder. Phone frames are pulled from Chrome's screencast
// instead, because the recorder captures emulated phones at CSS size only; with an
// OS-level scale factor the screencast delivers true 3x frames.
const contextOptions = mode === 'mobile'
  ? { ...devices['iPhone 14 Pro'], viewport: { width: PHONE.width, height: PHONE.height }, deviceScaleFactor: PHONE.scale }
  : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir: join(out, 'raw'), size } };
if (mode === 'mobile') launchOptions.args = [...(launchOptions.args ?? []), `--force-device-scale-factor=${PHONE.scale}`, '--high-dpi-support=1'];

// Pointer overlay: a cursor arrow on desktop, a tap ring on mobile, drawn inside the page
// so the recording shows where the teacher clicks.
const overlay = `
(() => {
  // Headless print windows fire afterprint immediately and may close themselves; keep them open for the recording.
  window.print = function () {};
  window.close = function () {};
  const mobile = ${mode === 'mobile'};
  const init = () => {
    if (document.getElementById('__bh_cursor')) return;
    const style = document.createElement('style');
    style.textContent = '#__bh_cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-9999px,-9999px);transition:transform .05s linear}' +
      '.__bh_tap{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(37,99,235,.28);border:3px solid rgba(37,99,235,.9);animation:__bh_tap .55s ease-out forwards}' +
      '@keyframes __bh_tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.6);opacity:0}}';
    document.head.appendChild(style);
    if (!mobile) {
      const c = document.createElement('div');
      c.id = '__bh_cursor';
      c.innerHTML = '<svg width="34" height="38" viewBox="0 0 20 22"><path d="M2 1 L2 17 L6.5 13 L9.5 20 L12.5 18.5 L9.5 12 L15.5 12 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      c.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,.45))';
      document.body.appendChild(c);
      window.addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    }
    const ring = (x, y) => { const r = document.createElement('div'); r.className = '__bh_tap'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); };
    window.addEventListener('mousedown', (e) => ring(e.clientX, e.clientY), true);
    window.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) ring(t.clientX, t.clientY); }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();`;

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext(contextOptions);
await context.addInitScript(overlay);
const page = await context.newPage();
const t0 = Date.now();
const timeline = [];
const mark = (label, extra = {}) => { const t = Date.now() - t0; timeline.push({ t, label, ...extra }); console.log(String(t).padStart(6), label); };
const pause = (ms) => page.waitForTimeout(ms);

/** Saves every screencast frame of a page as JPEG with its page-time stamp. */
const screencast = async (target, dir) => {
  mkdirSync(dir, { recursive: true });
  const cdp = await context.newCDPSession(target);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    const name = `f${String(frames.length).padStart(6, '0')}.jpg`;
    writeFileSync(join(dir, name), Buffer.from(data, 'base64'));
    frames.push({ t: Date.now() - t0, name });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
  return {
    stop: async () => {
      await cdp.send('Page.stopScreencast').catch(() => {});
      writeFileSync(join(dir, 'frames.json'), JSON.stringify({ frames, end: Date.now() - t0 }));
    },
  };
};
const pageCast = mode === 'mobile' ? await screencast(page, join(out, 'frames')) : null;
let printCast = null;

let mouse = { x: 200, y: 200 };
const glide = async (x, y) => {
  const steps = Math.max(12, Math.min(40, Math.round(Math.hypot(x - mouse.x, y - mouse.y) / 25)));
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
};
const reveal = async (locator) => {
  await locator.first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })).catch(() => {});
  await pause(650);
};
const press = async (locator, label, { settle = 900, reveal: doReveal = true } = {}) => {
  const target = locator.first();
  await target.waitFor({ timeout: 20000 });
  if (doReveal) await reveal(target);
  const point = async () => {
    const box = await target.boundingBox();
    if (!box) throw new Error(`No box for ${label}`);
    return { x: box.x + Math.min(box.width - 8, Math.max(8, box.width * 0.42)), y: box.y + box.height * 0.5 };
  };
  let { x, y } = await point();
  if (mode === 'mobile') {
    await page.touchscreen.tap(x, y);
  } else {
    await glide(x, y);
    await pause(140);
    // Layout can shift while the pointer travels (banners, lists); re-aim before pressing.
    const again = await point();
    if (Math.hypot(again.x - x, again.y - y) > 2) { ({ x, y } = again); await glide(x, y); await pause(80); }
    await page.mouse.down(); await pause(70); await page.mouse.up();
  }
  mark(label, { x: Math.round(x), y: Math.round(y) });
  await pause(settle);
};
const type = async (locator, text, label) => {
  await press(locator, `${label}-focus`, { settle: 250 });
  await locator.first().pressSequentially(text, { delay: 45 });
  mark(label);
};

// Same geometry as src/lib/paperScan/layout.ts, for pencil marks on the issued sheets.
const bubble = (row, choice) => ({ x: (row < 20 ? 210 : 650) + choice * 48, y: 395 + (row % 20) * 39 });
const seeded = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

/**
 * Answer key per issued sheet, read through the app's own session: the latest scan
 * session's sheets (options in the printed order) joined with the question bank's
 * correct answers. Returns { [sheetIdPrefix8]: number[] } (option index per row).
 */
let issuedSession = null;
const readAnswerKeys = async () => {
  const anonKey = (() => {
    try {
      const env = readFileSync(join(here, '..', '..', '..', '.env.local'), 'utf8');
      return env.match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim() || '';
    } catch { return ''; }
  })();
  const sheets = issuedSession?.sheets ?? [];
  if (!sheets.length) return {};
  return page.evaluate(async ({ anonKey, sheets }) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return {};
    const token = JSON.parse(localStorage.getItem(key)).access_token;
    const ref = key.slice(3, -'-auth-token'.length);
    const ids = [...new Set(sheets.flatMap((s) => s.questions.map((q) => q.questionId)))];
    const res = await fetch(`https://${ref}.supabase.co/rest/v1/questions?select=id,correct_answer&id=in.(${ids.join(',')})`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
    const questions = res.ok ? await res.json() : [];
    const correct = Object.fromEntries(questions.map((q) => [q.id, q.correct_answer]));
    const keys = {};
    for (const sheet of sheets) {
      keys[sheet.id.slice(0, 8).toUpperCase()] = [...sheet.questions]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((q) => q.options.findIndex((o) => o === correct[q.questionId]));
    }
    return keys;
  }, { anonKey, sheets });
};

const makePhotos = async (svgDir, photoDir, count, answerKeys = {}) => {
  const files = readdirSync(svgDir).filter((f) => f.endsWith('.svg')).sort().slice(0, count);
  const shooter = await chromium.launch(shooterLaunchOptions);
  const shot = await shooter.newPage({ viewport: { width: 1800, height: 2400 } });
  for (const [index, file] of files.entries()) {
    const rand = seeded(index + 11);
    let svg = readFileSync(join(svgDir, file), 'utf8');
    const questions = Math.floor(((svg.match(/<circle cx=/g) || []).length - 1) / 4);
    const sheetPrefix = svg.match(/Sheet ([0-9A-F]{8})/)?.[1];
    const key = (sheetPrefix && answerKeys[sheetPrefix]) || [];
    // Each student gets a couple of wrong answers so the report looks like a real class.
    const wrongRows = new Set([Math.floor(rand() * questions), Math.floor(rand() * questions)]);
    const marks = [];
    for (let row = 0; row < questions; row++) {
      const right = key[row] ?? -1;
      const choice = right >= 0 && !wrongRows.has(row) ? right : (right + 1 + Math.floor(rand() * 3)) % 4;
      const p = bubble(row, choice);
      marks.push(`<circle cx="${p.x + (rand() - 0.5) * 3}" cy="${p.y + (rand() - 0.5) * 3}" r="${10 + rand() * 1.5}" fill="#23272e" opacity="0.92"/>`);
      if (index === 0 && row === 6) {
        const q = bubble(row, (choice + 1) % 4);
        marks.push(`<circle cx="${q.x}" cy="${q.y}" r="9" fill="#5b6270" opacity="0.45"/>`);
      }
    }
    svg = svg.replace('</svg>', marks.join('') + '</svg>').replace(/width="210mm" height="297mm"/, 'width="1000" height="1414"');
    // Mild perspective: enough to look like a hand-held photo, well inside what the corner detector accepts.
    const tilt = (rand() - 0.5) * 5, rotX = 2.5 + rand() * 3, rotY = (rand() - 0.5) * 3;
    await shot.setContent(`<!doctype html><html><body style="margin:0;width:1800px;height:2400px;overflow:hidden;background:radial-gradient(circle at 30% 20%, #8a6a4a 0%, #5e4530 60%, #3f2d1e 100%);">
      <div style="position:absolute;inset:0;background:repeating-linear-gradient(95deg, rgba(255,255,255,0.03) 0 6px, rgba(0,0,0,0.03) 6px 14px);"></div>
      <div style="position:absolute;left:300px;top:260px;width:1200px;height:1697px;perspective:2600px;">
        <div style="width:100%;height:100%;transform:rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${tilt}deg);box-shadow:0 40px 90px rgba(0,0,0,0.55);background:#fbfbf9;">
          ${svg.replace('<svg', '<svg style="width:100%;height:100%;display:block"')}
          <div style="position:absolute;inset:0;background:linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.08) 100%);"></div>
        </div>
      </div>
      <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 40%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%);"></div>
    </body></html>`);
    await shot.waitForTimeout(700);
    await shot.screenshot({ path: join(photoDir, file.replace('.svg', '.jpg')), type: 'jpeg', quality: 86 });
  }
  await shooter.close();
  return readdirSync(photoDir).filter((f) => f.endsWith('.jpg')).sort().map((f) => join(photoDir, f));
};

try {
  // 1. Login
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await pause(2500);
  mark('login-screen');
  await type(page.getByLabel('Email', { exact: true }), EMAIL, 'email');
  await type(page.getByLabel('Password', { exact: true }), PASSWORD, 'password');
  await press(page.getByRole('button', { name: /Enter/ }), 'login', { settle: 500 });
  const portal = page.locator('button, a, [role=button]').filter({ hasText: 'Teacher Portal' }).first();
  const notNow = page.getByRole('button', { name: 'Not now' });
  // The iOS install guide can cover the workspace chooser; dismiss it as soon as it shows.
  const enter = page.getByRole('button', { name: /Enter/ });
  let dismissed = false;
  for (let waited = 0; waited < 45000; waited += 500) {
    if (await notNow.isVisible().catch(() => false)) { await press(notNow, 'dismiss-install-guide', { settle: 600, reveal: false }); dismissed = true; }
    if (await portal.isVisible().catch(() => false)) break;
    // The guide can swallow the Enter tap; if the form is still there after dismissing it, submit again.
    if (dismissed && (await enter.isVisible().catch(() => false))) { await press(enter, 'login-again', { settle: 500 }); dismissed = false; }
    await pause(500);
  }
  await portal.waitFor({ timeout: 5000 });
  await pause(800);
  mark('workspace-chooser');
  await press(portal, 'open-teacher-portal', { settle: 4500 });
  mark('portal');

  // 2. Assignments
  if (mode === 'mobile') await press(page.getByRole('button', { name: 'Assignments' }), 'nav-assignments', { settle: 3500 });
  else await press(page.locator('button, a').filter({ hasText: 'Assign Work to Students' }), 'nav-assignments', { settle: 3500 });
  mark('assignments');

  // 3. Wizard
  await press(page.getByRole('button', { name: 'Create' }), 'create-menu', { settle: 900 });
  await press(page.getByText('New assignment', { exact: true }), 'new-assignment', { settle: 2500 });
  mark('wizard-subject');
  await press(page.getByText('English', { exact: true }), 'subject-english', { settle: 600 });
  await press(page.getByRole('button', { name: /Next/ }), 'next-1', { settle: 1800 });
  mark('wizard-audience');
  await press(page.locator('.aw-class-card').filter({ hasText: '7A' }), 'audience-7a', { settle: 900 });
  await press(page.getByRole('button', { name: /Next/ }), 'next-2', { settle: 2500 });
  mark('wizard-questions');
  const topic = page.locator('select').nth(1);
  await press(topic, 'topic-open', { settle: 300 });
  await topic.selectOption({ label: 'Adjectives' });
  mark('topic-adjectives');
  await pause(1400);
  await press(page.getByRole('button', { name: 'Select all shown' }), 'select-all', { settle: 1600 });
  await press(page.getByRole('button', { name: /Next/ }), 'next-3', { settle: 2000 });
  mark('wizard-details');
  await press(page.getByText('Paper', { exact: true }).first(), 'delivery-paper', { settle: 900 });
  await type(page.getByPlaceholder(/e\.g\. Fractions/), TITLE, 'title');
  await press(page.getByText('Quiz', { exact: true }).first(), 'type-quiz', { settle: 700 });
  await press(page.getByRole('button', { name: /Next/ }), 'next-4', { settle: 2000 });
  mark('wizard-due');
  await press(page.getByText('1 week', { exact: true }).first(), 'due-1-week', { settle: 800 });
  await press(page.getByRole('button', { name: /Next/ }), 'next-5', { settle: 2200 });
  mark('wizard-review');
  await press(page.getByText('I have reviewed this assignment'), 'review-checkbox', { settle: 700 });
  await press(page.getByRole('button', { name: 'Publish assignment' }), 'publish', { settle: 1500 });
  const ok = page.getByRole('button', { name: 'OK' });
  await ok.waitFor({ timeout: 30000 });
  await pause(1200);
  mark('published-dialog');
  await press(ok, 'published-ok', { settle: 3000, reveal: false });
  mark('assignments-after-publish');

  // 4. Print
  await press(page.getByRole('button', { name: `Print papers for ${TITLE}` }).first(), 'print-papers', { settle: 4500 });
  mark('paper-workspace');
  await press(page.getByText('Bubble sheets only'), 'bubble-sheets-only', { settle: 1200 });
  let popup = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const popupPromise = context.waitForEvent('page', { timeout: 30000 });
    const issuePromise = page.waitForResponse((r) => r.url().includes('rpc_teacher_issue_scan_sheets'), { timeout: 60000 }).then((r) => r.json()).catch(() => null);
    await press(page.getByRole('button', { name: 'Preview print order' }), attempt === 1 ? 'preview-print-order' : 'preview-print-order-retry', { settle: 500 });
    popup = await popupPromise;
    mark('print-window-open');
    if (mode === 'mobile') printCast = await screencast(popup, join(out, 'print-frames'));
    issuedSession = (await issuePromise) ?? issuedSession;
    const rendered = await popup.waitForFunction(() => document.querySelectorAll('svg[aria-label^="Answer sheet"]').length > 0, null, { timeout: 25000 }).then(() => true).catch(() => false);
    if (rendered) break;
    console.warn('print window did not render; workspace says:', (await page.locator('.psc').innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 400));
    console.warn('popup body:', (await popup.content().catch(() => '')).slice(0, 200));
    if (attempt === 2) throw new Error('Print window never rendered the sheets');
    await popup.close().catch(() => {});
    await pause(1500);
  }
  await popup.waitForTimeout(2500);
  mark('print-window-ready');
  const svgs = await popup.$$eval('svg[aria-label^="Answer sheet"]', (nodes) => nodes.map((n) => ({ label: n.getAttribute('aria-label'), html: n.outerHTML })));
  svgs.forEach((s, i) => writeFileSync(join(out, 'sheets', `sheet-${String(i + 1).padStart(2, '0')}.svg`), s.html));
  writeFileSync(join(out, 'sheets', 'labels.json'), JSON.stringify(svgs.map((s) => s.label), null, 2));
  // Scroll the print preview slowly so the recording of that window shows several sheets.
  await popup.evaluate(() => window.scrollTo({ top: 1200, behavior: 'smooth' }));
  await popup.waitForTimeout(2500);
  mark('print-window-scrolled');
  if (printCast) await printCast.stop();
  await popup.close();
  await pause(800);
  mark('print-window-closed');

  // 5. Photos of the issued sheets (not recorded; the main page idles here)
  const answerKeys = await readAnswerKeys().catch((error) => { console.warn('answer key unavailable', error.message); return {}; });
  const photos = await makePhotos(join(out, 'sheets'), join(out, 'photos'), PHOTO_COUNT, answerKeys);
  mark('photos-generated', { count: photos.length, keyed: Object.keys(answerKeys).length });

  // 6. Scan
  await press(page.getByRole('tab', { name: /Scan & review/ }), 'scan-tab', { settle: 1800 });
  mark('scan-empty');
  const addPhotos = page.getByRole('button', { name: /Choose photos|Add photos/ }).first();
  await reveal(addPhotos);
  await glide(...(await addPhotos.boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2])));
  await pause(300);
  await page.locator('input[aria-label="Choose answer sheet photos"]').setInputFiles(photos);
  mark('photos-added');
  const startReview = page.getByRole('button', { name: /Start review/ });
  await startReview.waitFor({ timeout: 120000 });
  // The green 'Photos are ready' banner lands after the last photo and shifts the tray down.
  await page.getByText('Photos are ready').waitFor({ timeout: 120000 });
  await pause(1500);
  mark('photos-read');
  await press(startReview, 'start-review', { settle: 3000 });
  mark('review-page-1');
  const flagged = page.getByText('Question 7', { exact: false }).first();
  if (await flagged.count()) { await reveal(flagged); mark('flag-visible'); await pause(1800); }
  const choiceC = page.getByRole('button', { name: 'C', exact: true });
  if (await choiceC.count()) await press(choiceC.last(), 'choose-c', { settle: 1200 });
  await press(page.getByText("I checked this page’s answers."), 'checked-1', { settle: 600 });
  await press(page.getByRole('button', { name: /Save page/ }), 'save-1', { settle: 2600 });
  for (let p = 2; p <= PHOTO_COUNT; p++) {
    mark(`review-page-${p}`);
    const checkbox = page.getByText("I checked this page’s answers.");
    if (!(await checkbox.isVisible().catch(() => false))) {
      // Back on the tray (a page needed another look): open the next page that is ready.
      const next = page.getByRole('button', { name: /Start review|Review page/ }).first();
      if (!(await next.isVisible().catch(() => false))) break;
      await press(next, `open-page-${p}`, { settle: 2500 });
    }
    await press(checkbox, `checked-${p}`, { settle: 500 });
    await press(page.getByRole('button', { name: /Save page/ }), `save-${p}`, { settle: 2400 });
  }
  mark('tray-reviewed');
  await pause(1200);
  await press(page.getByRole('button', { name: /Confirm \d+ student results/ }), 'confirm-results', { settle: 5000 });
  mark('confirmed');
  await press(page.getByRole('button', { name: 'Close paper workspace' }), 'close-workspace', { settle: 800, reveal: false });
  await page.getByRole('button', { name: 'Close paper workspace' }).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await pause(2200);
  mark('assignments-after-confirm');
  const card = page.locator('article').filter({ hasText: TITLE }).first();
  await reveal(card);
  mark('card-progress');
  await pause(2000);
  await press(card.getByRole('button', { name: /View report/ }), 'view-report', { settle: 5000 });
  mark('report');
  await page.mouse.wheel(0, 500).catch(() => {});
  await pause(2500);
  mark('end');
} catch (error) {
  mark('ERROR', { message: error.message.split('\n')[0] });
  console.error(error);
} finally {
  if (pageCast) await pageCast.stop();
  const pageVideo = mode === 'mobile' ? null : page.video();
  await context.close();
  if (pageVideo) {
    renameSync(await pageVideo.path(), join(out, 'page.webm'));
    // Playwright names popup videos by page id; the only other file left in raw/ is the print window.
    for (const f of readdirSync(join(out, 'raw'))) if (f.endsWith('.webm')) renameSync(join(out, 'raw', f), join(out, 'print.webm'));
  }
  const viewport = mode === 'mobile' ? { width: PHONE.width, height: PHONE.height } : { width: 1920, height: 1080 };
  writeFileSync(join(out, 'timeline.json'), JSON.stringify({ mode, size, viewport, title: TITLE, timeline }, null, 2));
  await browser.close();
  console.log('saved', join(out, 'page.webm'), 'and timeline.json');
}
