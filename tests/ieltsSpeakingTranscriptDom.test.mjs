import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
// Diagnostic Bible 2.2.0 section 10.7; Visual & UX Bible 13.9: colour + text tags, notes, IPA and a play button.
const props = {
  transcript: 'Well, I have live here since two years and I really enjoy the quiet streets near the vegetable market.',
  highlights: [
    { criterion: 'grammar_range_accuracy', kind: 'fix', quote: 'have live here since two years', note: 'Say: I have lived here for two years.' },
    { criterion: 'lexical_resource', kind: 'strength', quote: 'quiet streets', note: 'Precise, natural words.' },
    { criterion: 'fluency_coherence', kind: 'fix', quote: 'not in the text', note: 'Ignored.' },
  ],
  pronunciationWords: [{ word: 'vegetable', tip: 'Stress the first part: VEJ-tuh-bul.', ipa: 'ˈvɛdʒtəbəl' }, { word: 'market', tip: 'Say the final t.', ipa: null }],
};
async function mount(extra = {}) {
  const code = (await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import C from './src/components/ielts/SpeakingTranscript';window.root=createRoot(document.getElementById('root'));window.root.render(<C {...window.props}/>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, format: 'iife', write: false, logLevel: 'silent', plugins: [{ name: 'css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })); } }] })).outputFiles[0].text;
  const dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.spoken = [];
  w.SpeechSynthesisUtterance = function (text) { this.text = text; };
  w.speechSynthesis = { cancel() {}, getVoices: () => [{ lang: 'en-US' }], speak: (u) => w.spoken.push(u.text) };
  w.props = { ...props, ...extra };
  w.eval(code);
  await new Promise((r) => setTimeout(r, 40));
  return { w, doc: w.document, close: () => { w.root.unmount(); w.close(); } };
}
test('highlights carry a criterion colour class AND a text tag, with a numbered note; unknown quotes are skipped', async () => {
  const m = await mount();
  try {
    const marks = [...m.doc.querySelectorAll('mark.st-hl')];
    assert.equal(marks.length, 2);
    assert.match(marks[0].className, /st-c-grammar_range_accuracy/);
    assert.match(marks[0].className, /st-fix/);
    assert.match(marks[0].textContent, /have live here since two years/);
    assert.match(marks[0].querySelector('.st-tag').textContent, /^GR1$/);
    assert.match(marks[1].querySelector('.st-tag').textContent, /^LR2$/);
    const legend = m.doc.querySelector('.st-legend').textContent;
    assert.match(legend, /Fluency & Coherence/); assert.match(legend, /Pronunciation/);
    const notes = m.doc.querySelector('.st-notes').textContent;
    assert.match(notes, /To improve/); assert.match(notes, /Say: I have lived here for two years\./); assert.doesNotMatch(notes, /Ignored/);
    marks[1].click();
    await new Promise((r) => setTimeout(r, 20));
    assert.match(m.doc.querySelector('.st-callout').textContent, /Done well · Vocabulary/);
  } finally { m.close(); }
});
test('pronunciation words show dictionary IPA and play the word with the device voice', async () => {
  const m = await mount();
  try {
    assert.equal(m.doc.querySelectorAll('mark.st-pron').length, 2, 'both words are marked in the transcript');
    const cards = [...m.doc.querySelectorAll('.st-word')];
    assert.match(cards[0].textContent, /vegetable/); assert.match(cards[0].textContent, /\/ˈvɛdʒtəbəl\//);
    assert.match(cards[1].textContent, /no dictionary entry/);
    cards[0].querySelector('button.st-play').click();
    assert.deepEqual(m.w.spoken, ['vegetable']);
    assert.match(m.doc.body.textContent, /CMU Pronouncing Dictionary/);
  } finally { m.close(); }
});
test('when pronunciation was not assessed, no word corrections are invented', async () => {
  const m = await mount({ pronunciationWords: [], pronunciationAssessed: false });
  try { assert.match(m.doc.body.textContent, /Pronunciation was not assessed for this recording/); assert.equal(m.doc.querySelectorAll('.st-play').length, 0); }
  finally { m.close(); }
});
