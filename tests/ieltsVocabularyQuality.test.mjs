import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lessonSourcePaths, validateLessonSource, itemEvidenceOverlap, VOCABULARY_LEVEL, wordCount } from '../scripts/ielts/lesson-source-contract.mjs';

// A 275,000-word English list (British and American spellings). Every lower-case word that students read in the
// vocabulary lessons must be a real English word, except text that is deliberately misspelt to teach spelling.
const dictionary = new Set(JSON.parse(readFileSync(new URL('../node_modules/an-array-of-english-words/index.json', import.meta.url), 'utf8')));
const vocab = lessonSourcePaths().map((p) => JSON.parse(readFileSync(p, 'utf8'))).filter((l) => /^IELTS-V[1-6]$/.test(l.code));

function nonWords(text) {
  const out = [];
  const clean = String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'")
    .replace(/\b(\w+)n't\b/gi, '$1').replace(/'(s|ve|ll|re|d|m)\b/gi, '').replace(/(^|\s)-\w+/g, ' ').replace(/\b\w+-(?=[\s/,]|$)/g, ' '); // affix notation such as '-tion' or 'im-'
  for (const token of clean.split(/[^A-Za-z'-]+/)) {
    for (const part of token.split('-')) {
      const w = part.replace(/^'+|'+$/g, '');
      if (w.length > 1 && w === w.toLowerCase() && !dictionary.has(w) && !['ca', 'wo', "o'clock"].includes(w)) out.push(w);
    }
  }
  return out;
}

function studentText(lesson) {
  const texts = [];
  for (const b of [...lesson.blocks, ...lesson.followup.blocks]) {
    texts.push(b.title, b.instructions ?? '', b.prompt ?? '', ...(b.prompts ?? []), ...(b.follow_ups ?? []), b.model ?? '', ...(b.models ?? []).map((m) => m.text));
    if (b.stimulus?.paragraphs && !b.deliberate_errors) texts.push(...b.stimulus.paragraphs);
    for (const e of b.examples ?? []) if (!e.deliberate_error) texts.push(e.text);
    for (const it of b.items ?? []) {
      if (b.deliberate_errors || it.deliberate_errors) continue;
      texts.push(it.prompt, ...(it.options ?? []).map((o) => String(o).replace(/^[A-H]\s+/, '')));
    }
  }
  for (const w of lesson.word_bank) texts.push(w.item, w.meaning, w.example);
  return texts;
}

test('vocabulary lessons contain only real English words (except deliberate spelling tasks)', () => {
  assert.equal(vocab.length, 6);
  for (const lesson of vocab) {
    const bad = studentText(lesson).flatMap(nonWords);
    assert.deepEqual([...new Set(bad)], [], `${lesson.code}: non-words in student-facing text`);
  }
});

test('deliberately misspelt tasks are marked, and the made-up distractors from v1.0.0 are gone', () => {
  for (const lesson of vocab) {
    const serialized = JSON.stringify(lesson);
    for (const old of ['lazy-ly', 'goodly', 'easy-going-ly', 'breathtaken', 'deep-ly', 'sitting lifestyle']) assert.ok(!serialized.includes(old), `${lesson.code}: ${old}`);
    for (const b of lesson.blocks) {
      if (/spelling traps|error check/i.test(b.title)) assert.equal(b.deliberate_errors, true, `${b.id} must be marked deliberate_errors`);
    }
  }
});

test('every vocabulary lesson meets the Band 6.5-7.5 level gates', () => {
  for (const lesson of vocab) {
    assert.deepEqual(validateLessonSource(lesson), [], lesson.code);
    assert.equal(lesson.version, '1.1.0');
    assert.equal(lesson.approval_record.version, '1.1.0');
    assert.equal(lesson.previous_approval_record.version, '1.0.0');
    const mcq = [...lesson.blocks, ...lesson.followup.blocks].flatMap((b) => (b.items ?? []).filter((i) => i.type === 'mcq'));
    assert.ok(mcq.every((i) => i.options.length === 4), lesson.code);
    // Keys are spread across A-D: no letter is the answer more than 40% of the time.
    const counts = mcq.reduce((a, i) => ((a[i.answer] = (a[i.answer] ?? 0) + 1), a), {});
    for (const [letter, n] of Object.entries(counts)) assert.ok(n / mcq.length <= 0.4, `${lesson.code}: ${letter} is the key ${n}/${mcq.length} times`);
    for (const b of lesson.blocks.filter((x) => x.stimulus?.type === 'passage')) {
      assert.ok(wordCount(b.stimulus.paragraphs.join(' ')) >= VOCABULARY_LEVEL.minPassageWords, b.id);
      for (const it of b.items) if (it.answer !== 'NOT GIVEN') assert.ok(itemEvidenceOverlap(it.prompt, it.evidence) <= VOCABULARY_LEVEL.maxItemOverlap, it.id);
    }
    for (const b of lesson.blocks.filter((x) => x.kind === 'speaking')) assert.ok(b.follow_ups.length >= 3, b.id);
  }
  // V6 is the lesson the external review examined: it now has an interactive Part 3, a writing task and a longer passage.
  const v6 = vocab.find((l) => l.code === 'IELTS-V6');
  assert.ok(v6.blocks.some((b) => b.kind === 'speaking' && b.follow_ups.length >= 5));
  assert.ok(v6.blocks.some((b) => b.kind === 'writing' && wordCount(b.model) >= 140));
});

test('the gates reject the weaknesses found in the review', () => {
  const v6 = structuredClone(vocab.find((l) => l.code === 'IELTS-V6'));
  const p1 = v6.blocks.find((b) => b.id === 'IELTS-V6-P1');
  p1.items[0].options = p1.items[0].options.slice(0, 3);
  const s1 = v6.blocks.find((b) => b.id === 'IELTS-V6-S1');
  s1.follow_ups = []; s1.instructions += ' Use at least four collocations.';
  const p2 = v6.blocks.find((b) => b.id === 'IELTS-V6-P2');
  p2.items[0].prompt = p2.items[0].evidence;
  const errors = validateLessonSource(v6).join('\n');
  assert.match(errors, /four plausible options/);
  assert.match(errors, /examiner follow-up questions/);
  assert.match(errors, /quota of phrases/);
  assert.match(errors, /paraphrase it/);
});
