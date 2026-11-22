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
test('interview: teacher questions are shown in grey and never marked; legacy feedback hides the colour key', async () => {
  const m = await mount({ transcript: 'What do you like? I like the quiet streets. Thank you.', teacherLines: ['What do you like?', 'Thank you.'],
    highlights: [{ criterion: 'lexical_resource', kind: 'strength', quote: 'quiet streets', note: 'Good.' }],
    pronunciationWords: [{ word: 'like', tip: 'Long i.', ipa: 'laɪk' }] });
  try {
    const teacher = [...m.doc.querySelectorAll('.st-teacher')];
    assert.equal(teacher.length, 2);
    assert.match(teacher[0].textContent, /What do you like\?/);
    assert.equal(teacher[0].querySelectorAll('mark').length, 0, 'teacher words are never marked');
    assert.equal(m.doc.querySelectorAll('mark.st-pron').length, 1, 'only the student\'s "like" is marked');
    assert.match(m.doc.querySelector('.st-legend').textContent, /Teacher's questions/);
  } finally { m.close(); }
  const legacy = await mount({ highlights: undefined, pronunciationWords: undefined });
  try {
    assert.equal(legacy.doc.querySelector('.st-legend'), null);
    assert.match(legacy.doc.body.textContent, /made before colour highlights were added/);
    assert.match(legacy.doc.body.textContent, /Word-by-word pronunciation was not checked/);
    assert.doesNotMatch(legacy.doc.body.textContent, /👏/);
  } finally { legacy.close(); }
});
// Diagnostic Bible 2.7.2 section 10.7: a teacher corrects words speech-to-text got wrong.
const click = async (w, el) => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 20)); };
test('teacher correction: pick the wrong words, type what was said, add the name to the school word list', async () => {
  const m = await mount({
    audience: 'teacher', highlights: [], pronunciationWords: [],
    transcript: "When I came to my new school, it's so cold, I saw that they're studying by Cambridge system.",
    fixing: { marks: [], canEdit: true, canAddTerm: true, onFix: async (fix) => { m.w.saved = fix; } },
  });
  try {
    assert.equal(m.doc.querySelectorAll('.st-fixbox').length, 0);
    await click(m.w, [...m.doc.querySelectorAll('.st-fix-toggle')].find((b) => /Correct words/.test(b.textContent)));
    const word = (t) => [...m.doc.querySelectorAll('.st-w')].find((s) => s.textContent === t);
    await click(m.w, word("it's"));
    await click(m.w, word('cold,'));
    assert.match(m.doc.querySelector('.st-fix-heard').textContent, /it's so cold,/);
    const input = m.doc.querySelector('.st-fix-input');
    assert.equal(input.value, "it's so cold,");
    const setter = Object.getOwnPropertyDescriptor(m.w.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Silk Road,');
    input.dispatchEvent(new m.w.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    const term = m.doc.querySelector('.st-fix-term');
    assert.match(term.textContent, /Add “Silk Road” to the school's word list/);
    await click(m.w, term.querySelector('input'));
    await click(m.w, m.doc.querySelector('.st-fix-save'));
    assert.deepEqual(JSON.parse(JSON.stringify(m.w.saved)), { from: 7, count: 3, said: 'Silk Road,', addTerm: true, startSeconds: null, endSeconds: null });
  } finally { m.close(); }
});
test('teacher correction: corrected words are marked for teachers, never for students, and editing can be off', async () => {
  const transcript = 'When I came to my new school, Silk Road, I saw that.';
  const t = await mount({ audience: 'teacher', transcript, highlights: [], pronunciationWords: [], fixing: { marks: [[7, 2]], canEdit: false, onFix: async () => {} } });
  try {
    assert.deepEqual([...t.doc.querySelectorAll('.st-fixed')].map((s) => s.textContent), ['Silk', 'Road,']);
    assert.equal(t.doc.querySelectorAll('.st-fix-toggle').length, 0, 'no editing when the teacher may not correct');
  } finally { t.close(); }
  const s = await mount({ audience: 'student', transcript, highlights: [], pronunciationWords: [], fixing: { marks: [[7, 2]], canEdit: true, onFix: async () => {} } });
  try {
    assert.equal(s.doc.querySelectorAll('.st-fixed, .st-fix-toggle').length, 0);
    assert.match(s.doc.querySelector('.st-text').textContent, /new school, Silk Road, I saw/);
  } finally { s.close(); }
});
