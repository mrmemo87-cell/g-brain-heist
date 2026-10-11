import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Card from './components/teacher/AssignmentCard';
    const actions = Object.fromEntries(['Report','Print','Record','Edit','Delete'].map(name => ['on'+name, () => window.calls.push(name)]));
    createRoot(document.getElementById('root')).render(<Card {...window.props} {...actions}/>);`, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' }, logLevel: 'silent',
});
const assignment = {
  id: 'test-assignment', teacher_id: 'test-teacher', subject_name: 'ESL', topic_name: 'Quick diagnostic',
  title: 'TEST Diagnostic · Grade 7 ESL', subject_group_name: 'Grade 7 ESL', batch: '7A',
  assigned_at: '2026-10-05T06:00:00Z', due_at: '2020-10-05T06:00:00Z', student_count: 14,
  completed_count: 9, question_count: 30, delivery_mode: 'online', publish_status: 'published',
};
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
async function setup(overrides = {}, props = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  dom.window.calls = [];
  dom.window.props = { assignment: { ...assignment, ...overrides }, canManage: true, printing: false, printDisabled: false, deleting: false, deleteDisabled: false, ...props };
  dom.window.eval(bundle.outputFiles[0].text);
  for (let attempt = 0; attempt < 50 && !dom.window.document.querySelector('article'); attempt++) await pause();
  assert.ok(dom.window.document.querySelector('article'));
  return { dom, document: dom.window.document, errors };
}

test('completion is separate from deadlines; finished assignments stop being overdue', async () => {
  for (const [overrides, completion, remaining, status] of [
    [{}, '9 of 14 completed', '5 remaining', 'Overdue'],
    [{ completed_count: 13, due_at: null }, '13 of 14 completed', '1 remaining', 'No deadline'],
    [{ completed_count: 14 }, '14 of 14 completed', 'All students finished', 'Completed'],
    [{ close_submissions_after_due: true }, '9 of 14 completed', '5 remaining', 'Closed'],
    [{ publish_status: 'draft' }, '9 of 14 completed', '5 remaining', 'Draft'],
    [{ publish_status: 'scheduled', assigned_at: '2099-01-01T06:00:00Z' }, '9 of 14 completed', '5 remaining', 'Scheduled'],
  ]) {
    const t = await setup(overrides);
    try {
      assert.equal(t.document.querySelector('.assignment-card__completed').textContent, completion);
      assert.match(t.document.querySelector('.assignment-card__status-row').textContent, new RegExp(remaining));
      assert.match(t.document.querySelector('.assignment-card__status-row').textContent, new RegExp(status));
      if (status === 'Completed' || status === 'Draft' || status === 'Scheduled') assert.doesNotMatch(t.document.querySelector('.assignment-card__status-row').textContent, /Overdue/);
      assert.deepEqual(t.errors, []);
    } finally { t.dom.window.close(); }
  }
});

test('each action retains its callback; options close on action, Escape, and outside interaction', async () => {
  const t = await setup();
  try {
    const menu = t.document.querySelector('details');
    for (const selector of ['.assignment-card__report', '.assignment-card__paper button:first-of-type', '.assignment-card__paper button:last-of-type']) t.document.querySelector(selector).click();
    menu.open = true; await pause();
    t.document.querySelector('.assignment-card__options-panel button:first-of-type').click();
    assert.equal(menu.open, false);
    menu.open = true; await pause();
    t.document.querySelector('.assignment-card__delete').click();
    assert.deepEqual(t.dom.window.calls, ['Report', 'Print', 'Record', 'Edit', 'Delete']);
    menu.open = true; await pause();
    t.document.dispatchEvent(new t.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(menu.open, false);
    assert.equal(t.document.activeElement, menu.querySelector('summary'));
    menu.open = true; await pause();
    t.document.body.dispatchEvent(new t.dom.window.Event('pointerdown', { bubbles: true }));
    assert.equal(menu.open, false);
    assert.deepEqual(t.errors, []);
  } finally { t.dom.window.close(); }
});

test('management remains creator-only while reports remain available; in-flight operations cannot repeat', async () => {
  for (const props of [{ canManage: false }, { printing: true, printDisabled: true, deleting: true, deleteDisabled: true }]) {
    const t = await setup({}, props);
    try {
      assert.equal(t.document.querySelector('.assignment-card__report').disabled, false);
      assert.equal(t.document.querySelector('.assignment-card__paper button').disabled, true);
      assert.equal(t.document.querySelector('.assignment-card__delete').disabled, true);
      t.document.querySelector('.assignment-card__paper button').click();
      t.document.querySelector('.assignment-card__delete').click();
      if (props.canManage === false) {
        assert.equal(t.document.querySelector('.assignment-card__options-panel button').disabled, true);
        assert.equal(t.document.querySelector('.assignment-card__paper button:last-of-type').disabled, true);
      }
      assert.deepEqual(t.dom.window.calls, []);
    } finally { t.dom.window.close(); }
  }
});

test('delivery modes stay explicit; empty rosters and invalid dates produce readable states', async () => {
  for (const mode of ['online', 'paper', 'mixed']) {
    const t = await setup({ delivery_mode: mode });
    try { assert.equal(t.document.querySelector('.assignment-card__mode').textContent.toLowerCase(), mode); }
    finally { t.dom.window.close(); }
  }
  const t = await setup({ student_count: 0, completed_count: 0, assigned_at: 'invalid', due_at: 'invalid' });
  try {
    assert.match(t.document.body.textContent, /No students assigned/);
    assert.doesNotMatch(t.document.body.textContent, /NaN|Invalid Date|Overdue/);
    assert.equal(t.document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '0');
  } finally { t.dom.window.close(); }
});
