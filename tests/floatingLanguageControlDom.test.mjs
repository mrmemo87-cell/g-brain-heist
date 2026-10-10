import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Layer from './src/components/AppLocalizationLayer';const root=createRoot(document.getElementById('root'));window.renderScope=(scope='public')=>root.render(<Layer language="en" setLanguage={value=>window.chosenLanguage=value}><main data-ielts-route={scope==='embedded'?'embedded':undefined} className={scope==='admin'?'school-admin-ielts-tab':undefined}><p data-language-lock="en">English assessment</p></main></Layer>);window.unmount=()=>root.unmount();window.renderScope();`, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' }, logLevel: 'silent',
});
const key = 'brains-heist-language-dock-v1';
async function mount(path = '/', saved = null, blocked = false) {
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' + path, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const w = dom.window;
  if (saved) w.localStorage.setItem(key, JSON.stringify(saved));
  if (blocked) Object.defineProperty(w, 'localStorage', { get() { throw Error('Storage blocked'); } });
  w.eval(bundle.outputFiles[0].text);
  const wait = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error('UI did not settle'); };
  await wait(() => w.document.querySelector('main'));
  const control = () => w.document.querySelector('[data-global-language-control]');
  const button = () => w.document.querySelector('.language-dock-trigger');
  const point = () => control().style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/).slice(1).map(Number);
  const pointer = async (type, x, y, { id = 1, pointerType = 'mouse', primary = true } = {}) => {
    const event = new w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: pointerType }, isPrimary: { value: primary } });
    button().dispatchEvent(event); await new Promise(resolve => setTimeout(resolve, 10));
  };
  const keyboard = async key => { button().dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 10)); };
  const close = () => { w.unmount(); assert.deepEqual(errors, []); w.close(); };
  return { w, wait, control, button, point, pointer, keyboard, close };
}

test('a tap opens native language choices, selects language and restores focus', async () => {
  const m = await mount(); try {
    await m.pointer('pointerdown', 30, 380); await m.pointer('pointermove', 32, 381); await m.pointer('pointerup', 32, 381);
    m.button().click(); await m.wait(() => m.w.document.querySelector('.language-dock-panel'));
    assert.equal(m.w.document.activeElement.getAttribute('aria-label'), 'English');
    const russian = m.w.document.querySelector('[aria-label="Русский"]'); russian.click();
    await m.wait(() => !m.w.document.querySelector('.language-dock-panel'));
    assert.equal(m.w.chosenLanguage, 'ru'); assert.equal(m.w.document.activeElement, m.button());
    assert.equal(m.w.document.querySelector('[data-language-lock]').textContent, 'English assessment');
  } finally { m.close(); }
});

test('drag follows the pointer freely, docks to nearest edge and suppresses the release click', async () => {
  const m = await mount(); try {
    const start = m.point(); await m.pointer('pointerdown', 30, 380);
    await m.pointer('pointermove', 600, 300);
    assert.deepEqual(m.point(), [start[0] + 570, start[1] - 80]);
    assert.match(m.control().className, /is-dragging/);
    await m.pointer('pointerup', 600, 300); m.button().click();
    await m.wait(() => !m.control().classList.contains('is-dragging'));
    assert.equal(m.point()[0], 958); assert.equal(m.point()[1], start[1] - 80);
    assert.equal(m.w.document.querySelector('.language-dock-panel'), null);
    const saved = JSON.parse(m.w.localStorage.getItem(key)); assert.equal(saved.side, 'right'); assert.ok(saved.ratio > 0 && saved.ratio < 1);
    m.w.renderScope('embedded'); await m.wait(() => !m.control());
    m.w.renderScope(); await m.wait(() => m.control()); assert.equal(m.point()[0], 958); assert.equal(m.point()[1], start[1] - 80);
  } finally { m.close(); }
});

test('touch drag clamps to visible bounds and cancellation never leaves the control dragging', async () => {
  const m = await mount(); try {
    await m.pointer('pointerdown', 30, 380, { pointerType: 'touch' });
    await m.pointer('pointermove', -500, -500, { pointerType: 'touch' }); assert.deepEqual(m.point(), [12, 12]);
    await m.pointer('pointercancel', -500, -500, { pointerType: 'touch' }); assert.doesNotMatch(m.control().className, /is-dragging/);
    await m.pointer('pointerdown', 30, 30); await m.pointer('pointermove', 3000, 3000); assert.deepEqual(m.point(), [958, 702]);
    await m.pointer('pointerup', 3000, 3000); assert.equal(JSON.parse(m.w.localStorage.getItem(key)).side, 'right');
  } finally { m.close(); }
});

test('secondary pointers cannot move an active primary drag', async () => {
  const m = await mount(); try {
    const start = m.point(); await m.pointer('pointerdown', 30, 380);
    await m.pointer('pointerdown', 90, 500, { id: 2, primary: false });
    await m.pointer('pointermove', 800, 600, { id: 2 }); assert.deepEqual(m.point(), start);
    await m.pointer('pointermove', 50, 400); assert.deepEqual(m.point(), [start[0] + 20, start[1] + 20]);
    await m.pointer('pointerup', 50, 400);
  } finally { m.close(); }
});

test('keyboard docking remains usable with storage disabled and Escape closes the menu', async () => {
  const m = await mount('/', null, true); try {
    await m.keyboard('ArrowRight'); assert.equal(m.point()[0], 958);
    await m.keyboard('Home'); assert.equal(m.point()[1], 12);
    await m.keyboard('ArrowDown'); assert.equal(m.point()[1], 36);
    await m.keyboard('End'); assert.equal(m.point()[1], 702);
    await m.keyboard('ArrowLeft'); assert.equal(m.point()[0], 12);
    m.button().click(); await m.wait(() => m.w.document.querySelector('.language-dock-panel'));
    m.w.document.activeElement.dispatchEvent(new m.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await m.wait(() => !m.w.document.querySelector('.language-dock-panel')); assert.equal(m.w.document.activeElement, m.button());
  } finally { m.close(); }
});

test('saved docking adapts to mobile resizing and a moving visual viewport', async () => {
  const m = await mount('/', { side: 'right', ratio: 1 }); try {
    Object.defineProperties(m.w, { innerWidth: { value: 375, configurable: true }, innerHeight: { value: 667, configurable: true } });
    m.w.dispatchEvent(new m.w.Event('resize')); await m.wait(() => m.point()[0] === 309); assert.deepEqual(m.point(), [309, 601]);
    // Mount again so viewport listeners bind to the browser viewport object.
    m.w.renderScope('embedded'); await m.wait(() => !m.control());
    const viewport = new m.w.EventTarget(); Object.assign(viewport, { width: 320, height: 400, offsetLeft: 20, offsetTop: 60 });
    Object.defineProperty(m.w, 'visualViewport', { value: viewport, configurable: true });
    m.w.renderScope(); await m.wait(() => m.control()); assert.deepEqual(m.point(), [274, 394]);
    viewport.height = 300; viewport.offsetTop = 80; viewport.dispatchEvent(new m.w.Event('resize'));
    await m.wait(() => m.point()[1] === 314); assert.deepEqual(m.point(), [274, 314]);
  } finally { m.close(); }
});

for (const path of ['/ielts', '/ielts/results/attempt', '/?view=ielts', '/?view=school_admin&adminTab=ielts']) {
  test(`IELTS scope ${path} never mounts the language button`, async () => {
    const m = await mount(path); try { assert.equal(m.control(), null); } finally { m.close(); }
  });
}
test('route and embedded school-admin transitions remove the control and restore it elsewhere', async () => {
  const m = await mount('/ielts-news'); try {
    assert.ok(m.control()); m.w.history.pushState(null, '', '/ielts/practice'); m.w.dispatchEvent(new m.w.PopStateEvent('popstate')); await m.wait(() => !m.control());
    m.w.history.pushState(null, '', '/dashboard'); m.w.dispatchEvent(new m.w.PopStateEvent('popstate')); await m.wait(() => m.control());
    for (const scope of ['admin', 'embedded']) { m.w.renderScope(scope); await m.wait(() => !m.control()); m.w.renderScope(); await m.wait(() => m.control()); }
  } finally { m.close(); }
});
