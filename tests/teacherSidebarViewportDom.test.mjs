import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const bundle = await build({
  stdin: { contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{useTeacherSidebarViewport}from'./src/hooks/useTeacherSidebarViewport';function App(){const ref=useTeacherSidebarViewport();const[ready,setReady]=useState(!window.startLoading);window.showSidebar=()=>setReady(true);return ready?<div className="teacher-portal-container"><aside ref={ref}>Navigation</aside></div>:<p>Loading portal</p>;}const root=createRoot(document.getElementById('root'));window.unmount=()=>root.unmount();root.render(<App/>);`, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, format: 'iife', write: false, logLevel: 'silent',
});

async function fixture(startLoading = false) {
  const errors = [], observers = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const w = dom.window;
  w.startLoading = startLoading;
  const media = new w.EventTarget(); media.matches = true;
  w.matchMedia = () => media;
  Object.defineProperty(w, 'innerHeight', { value: 640, writable: true });
  let top = 300;
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ top });
  w.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  const wait = async predicate => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Sidebar measurement did not settle');
  };
  w.eval(bundle.outputFiles[0].text);
  if (startLoading) {
    await wait(() => w.document.querySelector('p'));
    assert.equal(observers.length, 0);
    w.showSidebar();
  }
  await wait(() => w.document.querySelector('aside')?.style.getPropertyValue('--teacher-sidebar-available-height') === '328px');
  const aside = w.document.querySelector('aside');
  const height = () => aside.style.getPropertyValue('--teacher-sidebar-available-height');
  return { dom, w, media, observers, errors, aside, height, wait, setTop: value => { top = value; } };
}

test('initial position, page scrolling, viewport resizing and content shifts keep the sidebar within visible space', async () => {
  const t = await fixture();
  try {
    assert.equal(t.height(), '328px');
    t.setTop(12); t.w.dispatchEvent(new t.w.Event('scroll'));
    await t.wait(() => t.height() === '616px');
    t.w.innerHeight = 480; t.w.dispatchEvent(new t.w.Event('resize'));
    await t.wait(() => t.height() === '456px');
    t.setTop(220); t.observers[0].callback();
    await t.wait(() => t.height() === '248px');
    t.setTop(500); t.observers[0].callback();
    await t.wait(() => t.height() === '0px');
    assert.deepEqual(t.errors, []);
  } finally { t.dom.window.close(); }
});

test('tablet layout clears the desktop limit and returning to desktop measures again', async () => {
  const t = await fixture();
  try {
    t.media.matches = false; t.media.dispatchEvent(new t.w.Event('change'));
    await t.wait(() => t.height() === '');
    t.media.matches = true; t.media.dispatchEvent(new t.w.Event('change'));
    await t.wait(() => t.height() === '328px');
  } finally { t.dom.window.close(); }
});

test('navigation that mounts after the loading screen receives measurement and scroll listeners', async () => {
  const t = await fixture(true);
  try {
    assert.equal(t.height(), '328px');
    t.setTop(12); t.w.dispatchEvent(new t.w.Event('scroll'));
    await t.wait(() => t.height() === '616px');
  } finally { t.dom.window.close(); }
});

test('visual viewport changes account for browser zoom and unmount cancels pending work', async () => {
  const t = await fixture();
  try {
    const viewport = new t.w.EventTarget(); viewport.height = 400; viewport.offsetTop = 30;
    Object.defineProperty(t.w, 'visualViewport', { value: viewport, configurable: true });
    t.setTop(12); t.w.dispatchEvent(new t.w.Event('resize'));
    await t.wait(() => t.height() === '388px');
    t.w.dispatchEvent(new t.w.Event('scroll'));
    t.w.unmount();
    assert.equal(t.height(), '');
    assert.equal(t.observers[0].disconnected, true);
    t.w.dispatchEvent(new t.w.Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(t.height(), '');
    assert.deepEqual(t.errors, []);
  } finally { t.dom.window.close(); }
});
