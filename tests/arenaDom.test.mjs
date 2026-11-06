import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';

const dir = fs.mkdtempSync(path.resolve('tests/.arena-dom-'));
const out = path.join(dir, 'arena.mjs');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://brainsheist.com' });
globalThis.window = dom.window; globalThis.document = dom.window.document; Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.localStorage = dom.window.localStorage;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
// jsdom has no canvas: hand the engine a context that accepts any call and any property.
const noopContext = new Proxy({}, { get: (target, key) => (key === 'canvas' ? null : () => undefined), set: () => true });
dom.window.HTMLCanvasElement.prototype.getContext = () => noopContext;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const calls = [];
globalThis.__arenaTest = {
  status: { available: true, reason: null, open_now: true, assignment_blocked: false, window_start: '15:00', window_end: '23:59', weekend_all_day: true, daily_cap: 5, played_today: 1, tickets: 0, trophies: 55,
    fighters: [{ id: 'rivet', power: 3, attempts: 40, correct: 20, unlocked: true }, { id: 'fizz', power: 1, attempts: 2, correct: 1, unlocked: true }, { id: 'vex', power: 1, attempts: 0, correct: 0, unlocked: true }, { id: 'boulder', power: 1, attempts: 0, correct: 0, unlocked: false }] },
  fetchArenaStatus: async () => globalThis.__arenaTest.status,
  startArenaMatch: async (fighter) => { calls.push(['start', fighter]); return { match_id: 'm1', fighter, power: 3, bot_power: 2, tickets: 0 }; },
  abandonArenaMatch: async () => ({ refunded: true, tickets: 1 }),
  sendArenaClientReport: async () => true,
  fetchRespawnQuestion: async () => ({ available: false }),
  answerRespawnQuestion: async () => ({ correct: false, xp: 0 }),
  finishArenaMatch: async () => ({ result: 'win', paid: true, trophies_delta: 8, trophies: 63, xp: 15, gems: 2, unlocked: [], played_today: 2, daily_cap: 5 }),
};

await build({
  stdin: { contents: "export { default as ArenaView } from './src/features/arena/ArenaView';", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, format: 'esm', outfile: out, platform: 'node', external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'empty' },
  plugins: [{ name: 'arena-fixture', setup(b) {
    b.onLoad({ filter: /services[\\/]arenaService\.ts$/ }, () => ({ contents: 'export const { fetchArenaStatus, startArenaMatch, abandonArenaMatch, sendArenaClientReport, fetchRespawnQuestion, answerRespawnQuestion, finishArenaMatch } = globalThis.__arenaTest; export const clearArenaStatusCache = () => {};', loader: 'js' }));
    b.onLoad({ filter: /LanguageContext\.tsx$/ }, () => ({ contents: "export const useLanguage = () => ({ t: (k, p) => p ? k.replace(/\\{(\\w+)\\}/g, (_, n) => String(p[n])) : k, language: 'en', direction: 'ltr' });", loader: 'js' }));
  } }],
});

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { ArenaView } = await import(out);

const flush = () => new Promise((r) => setTimeout(r, 20));
const text = () => document.getElementById('root').textContent;

test('lobby shows tickets, trophies, fighter power and blocks Battle without tickets', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => { root.render(React.createElement(ArenaView, { userId: 'u1', username: 'Gulzada' })); await flush(); });
    assert.match(text(), /Proving Grounds/);
    assert.match(text(), /No tickets\. Finish a quest, a quiz or an assignment to earn one\./);
    assert.match(text(), /Matches today: 1 of 5/);
    const battle = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Battle!');
    assert.ok(battle);
    assert.equal(battle.disabled, true);
    const cards = document.querySelectorAll('.arena-fighter');
    assert.equal(cards.length, 4);
    assert.equal(cards[0].querySelectorAll('.arena-pips .is-on').length, 3);
    assert.ok(cards[3].classList.contains('is-locked'));
    assert.match(cards[3].textContent, /Unlocks at 100 trophies/);
    assert.match(cards[1].textContent, /Answer more Chemistry questions to power up\./);
    assert.equal(document.querySelector('.arena-match'), null);
  } finally { await act(async () => { root.unmount(); }); }
});

test('with a ticket, Battle starts a match with the chosen fighter and opens the match overlay', async () => {
  globalThis.__arenaTest.status = { ...globalThis.__arenaTest.status, tickets: 2 };
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => { root.render(React.createElement(ArenaView, { userId: 'u1', username: 'Gulzada' })); await flush(); });
    const cards = document.querySelectorAll('.arena-fighter');
    await act(async () => { cards[2].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await flush(); });
    assert.equal(cards[2].getAttribute('aria-pressed'), 'true');
    const battle = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Battle!');
    assert.equal(battle.disabled, false);
    await act(async () => { battle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await flush(); });
    assert.deepEqual(calls, [['start', 'vex']]);
    assert.ok(document.querySelector('.arena-match'), 'match overlay opens');
  } finally { await act(async () => { root.unmount(); }); }
});

test('a closed arena explains why and keeps Battle disabled', async () => {
  globalThis.__arenaTest.status = { available: false, reason: 'class_off' };
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => { root.render(React.createElement(ArenaView, { userId: 'u1', username: 'Gulzada' })); await flush(); });
    assert.match(text(), /Your teacher has switched the arena off for your class\./);
    const battle = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Battle!');
    assert.equal(battle.disabled, true);
  } finally { await act(async () => { root.unmount(); }); }
});

test.after(() => { dom.window.close(); fs.rmSync(dir, { recursive: true, force: true }); });
