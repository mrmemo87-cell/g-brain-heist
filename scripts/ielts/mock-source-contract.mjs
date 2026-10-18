#!/usr/bin/env node
// Structural and answer-key contract for full paper mock tests (schema bh-ielts-mock-source/1).
// Automated checks support, but never replace, human editorial/key/difficulty/originality review.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, wordCount, currentBibleVersions, COPYRIGHT_NOTICE } from './lesson-source-contract.mjs';

export const MOCK_SCHEMA = 'bh-ielts-mock-source/1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HARDCODED_SCHOOLS = [/\bsobhy\b/i, /\bSRIS\b/, /silk\s*road/i];
const OVERCLAIMS = [/(?<!not a |no )certified band/i, /guaranteed? (a )?band/i, /official (ielts )?examiner/i, /\b\d{1,2}\s*(?:\/|out of)\s*40\s*(?:=|→|is|equals)\s*band/i, /band score (?:table|conversion)/i,
  /\b\d{1,2}\s*(?:correct(?: answers)?|marks?|points?)\s*(?:=|→|is|equals|gives?|means?)\s*(?:a\s+)?band/i];
const LETTERED = ['mcq', 'matching', 'endings', 'summary_box'];
const letterOf = (option) => String(option).trim().split(/\s+/)[0];
const speechOf = (line) => line.replace(/^[A-Z][A-Z .']*:\s*/, '');

function itemsOf(groups) {
  const out = [];
  for (const g of groups ?? []) {
    if (g.type === 'multi') {
      for (let n = g.range[0]; n <= g.range[1]; n += 1) out.push({ n, group: g });
    } else for (const it of g.items ?? []) out.push({ n: it.n, group: g, item: it });
  }
  return out;
}

function checkNumbering(label, groups, errors) {
  const ns = itemsOf(groups).map((x) => x.n).sort((a, b) => a - b);
  const expected = Array.from({ length: 40 }, (_, i) => i + 1);
  if (JSON.stringify(ns) !== JSON.stringify(expected)) errors.push(`${label}: questions must be numbered 1-40 exactly once (found ${ns.length})`);
  for (const g of groups) {
    const inGroup = itemsOf([g]).map((x) => x.n);
    if (inGroup[0] !== g.range[0] || inGroup[inGroup.length - 1] !== g.range[1] || inGroup.length !== g.range[1] - g.range[0] + 1) errors.push(`${label} ${g.range.join('-')}: range does not match its items`);
  }
}

function checkGroup(label, g, source, errors, paragraphs) {
  const where = `${label} Q${g.range.join('-')}`;
  if (!g.instructions) errors.push(`${where}: missing instructions`);
  if (g.type === 'multi') {
    const letters = (g.options ?? []).map(letterOf);
    const k = g.range[1] - g.range[0] + 1;
    if (!g.stem) errors.push(`${where}: choose-two needs a question stem`);
    if ((g.answer ?? []).length !== k || new Set(g.answer).size !== k) errors.push(`${where}: needs ${k} distinct answers`);
    for (const a of g.answer ?? []) if (!letters.includes(a)) errors.push(`${where}: answer ${a} is not an option`);
    if (!/choose two|choose three/i.test(g.instructions ?? '')) errors.push(`${where}: instructions must say how many to choose`);
    for (const ev of g.evidence ?? []) if (!source.includes(normalize(ev))) errors.push(`${where}: evidence is not verbatim in the source: ${ev.slice(0, 50)}`);
    if ((g.evidence ?? []).length !== k) errors.push(`${where}: one evidence quotation per correct answer`);
    return;
  }
  const options = g.options ?? null;
  for (const it of g.items ?? []) {
    const at = `${label} Q${it.n}`;
    for (const f of ['prompt', 'answer', 'evidence']) if (!it[f] && it[f] !== 0) errors.push(`${at}: missing ${f}`);
    const absent = it.answer === 'NOT GIVEN';
    if (!absent && it.evidence && !source.includes(normalize(it.evidence))) errors.push(`${at}: evidence is not a verbatim quotation from the source`);
    if (absent && !it.note && !it.evidence) errors.push(`${at}: NOT GIVEN needs an explanation`);
    switch (g.type) {
      case 'completion': {
        const limit = Number(g.word_limit);
        if (!limit) errors.push(`${at}: completion group needs word_limit`);
        if (limit && wordCount(it.answer) > limit) errors.push(`${at}: answer "${it.answer}" exceeds ${limit}-word limit`);
        if (!String(it.prompt).includes('______')) errors.push(`${at}: completion prompt needs a ______ gap`);
        // The keyed answer is the word(s) actually heard or printed, not a paraphrase.
        if (!source.includes(normalize(it.answer).replace(/^(\d+)$/, '$1')) && !(it.accept ?? []).some((a) => source.includes(normalize(a)))) errors.push(`${at}: answer "${it.answer}" (or an accepted variant) does not appear in the source`);
        break;
      }
      case 'tfng': if (!['TRUE', 'FALSE', 'NOT GIVEN'].includes(it.answer)) errors.push(`${at}: answer must be TRUE/FALSE/NOT GIVEN`); break;
      case 'ynng': if (!['YES', 'NO', 'NOT GIVEN'].includes(it.answer)) errors.push(`${at}: answer must be YES/NO/NOT GIVEN`); break;
      case 'headings': {
        if (!options?.map(letterOf).includes(it.answer)) errors.push(`${at}: heading ${it.answer} not in the list`);
        const idx = String(it.paragraph ?? '').charCodeAt(0) - 65;
        if (!paragraphs?.[idx] || !normalize(paragraphs[idx]).includes(normalize(it.evidence))) errors.push(`${at}: evidence is not in paragraph ${it.paragraph}`);
        break;
      }
      case 'mcq': {
        const letters = (it.options ?? []).map(letterOf);
        if (letters.length < 3) errors.push(`${at}: multiple choice needs at least three options`);
        if (!letters.includes(it.answer)) errors.push(`${at}: answer ${it.answer} is not an option`);
        break;
      }
      case 'matching': case 'endings': case 'summary_box': {
        if (!options?.map(letterOf).includes(it.answer)) errors.push(`${at}: answer ${it.answer} is not in the option list`);
        break;
      }
      case 'short': {
        const limit = Number(g.word_limit);
        if (!limit || wordCount(it.answer) > limit) errors.push(`${at}: short answer needs a word limit it respects`);
        break;
      }
      default: errors.push(`${at}: unknown question type ${g.type}`);
    }
  }
  if (['matching', 'endings', 'headings', 'summary_box'].includes(g.type)) {
    const letters = (options ?? []).map(letterOf);
    if (letters.length <= (g.items ?? []).length && g.type !== 'matching') errors.push(`${where}: give more options than questions`);
    const pos = (g.items ?? []).map((it) => letters.indexOf(it.answer));
    if (pos.length >= 4 && pos.every((p, i) => i === 0 || p === pos[i - 1] + 1)) errors.push(`${where}: answers run in option order; reorder the options`);
  }
  if (g.type === 'summary_box' && !g.summary) errors.push(`${where}: summary text missing`);
  if (g.type === 'summary_box') for (const it of g.items ?? []) if (!g.summary.includes(`(${it.n})`)) errors.push(`${where}: summary has no gap (${it.n})`);
}

export function validateMockSource(mock, { bibles = currentBibleVersions() } = {}) {
  const errors = [];
  if (mock.schema !== MOCK_SCHEMA) errors.push(`schema must be ${MOCK_SCHEMA}`);
  if (!/^IELTS-M[1-9]$/.test(mock.code ?? '') || Number(mock.code?.slice(7)) !== mock.number) errors.push('code must be IELTS-M<number>');
  if (mock.test_type !== 'Academic') errors.push('programme route is IELTS Academic only');
  if (!/draft/i.test(mock.status ?? '') && !mock.approval_record) errors.push('status must remain a draft until a human approval record is attached');
  if (mock.approval_record && (mock.approval_record.version !== mock.version || !mock.approval_record.approved_by || !mock.approval_record.basis)) errors.push('approval record must name approver, basis and the exact version');
  for (const key of ['diagnostic', 'lessons', 'visual']) if (mock.bibles?.[key] !== bibles[key]) errors.push(`bibles.${key} does not match the current Bible`);
  const t = mock.timing ?? {};
  if (t.listening_minutes !== 30 || t.reading_minutes !== 60 || t.writing_minutes !== 60) errors.push('timing must follow the full test: Listening 30, Reading 60, Writing 60 minutes');
  if (!/no validated/i.test(mock.scoring?.bands ?? '')) errors.push('scoring.bands must state that no validated band conversion exists');

  // Listening: four parts, forty questions, verbatim evidence, voices for every speaker, real pauses.
  const L = mock.listening ?? {};
  if (L.notice !== COPYRIGHT_NOTICE) errors.push('listening must open with the spoken copyright notice');
  if ((L.parts ?? []).length !== 4) errors.push('listening needs four parts');
  const lGroups = (L.parts ?? []).flatMap((p) => p.groups ?? []);
  checkNumbering('Listening', lGroups, errors);
  for (const p of L.parts ?? []) {
    const lines = (p.segments ?? []).flatMap((s) => s.lines ?? []);
    const source = normalize(lines.map(speechOf).join(' '));
    const words = wordCount(lines.map(speechOf).join(' '));
    if (words < 450 || words > 950) errors.push(`Listening Part ${p.part}: ${words} words of speech; aim for a full-length part (450-950)`);
    for (const line of lines) {
      const speaker = line.match(/^([A-Z][A-Z .']*):/)?.[1];
      if (!speaker) errors.push(`Listening Part ${p.part}: line without a speaker: ${line.slice(0, 40)}`);
      else if (!p.voices?.[speaker]) errors.push(`Listening Part ${p.part}: no voice for ${speaker}`);
    }
    if (!p.voices?.instruction) errors.push(`Listening Part ${p.part}: needs an instruction voice`);
    for (const s of p.segments ?? []) if (!(s.reading_seconds >= 30)) errors.push(`Listening Part ${p.part}: each segment needs at least 30 seconds of reading time`);
    for (const g of p.groups ?? []) checkGroup(`Listening Part ${p.part}`, g, source, errors);
    if (p.part === 1 && !(p.voices && Object.keys(p.voices).length >= 3)) errors.push('Listening Part 1 is a conversation (two speakers plus instructions)');
    if (p.part === 4 && Object.keys(p.voices ?? {}).length !== 2) errors.push('Listening Part 4 is a monologue');
  }

  // Reading: three passages, forty questions, verbatim evidence.
  const passages = mock.reading?.passages ?? [];
  if (passages.length !== 3) errors.push('reading needs three passages');
  checkNumbering('Reading', passages.flatMap((p) => p.groups ?? []), errors);
  for (const p of passages) {
    const words = wordCount(p.paragraphs.join(' '));
    if (words < 700 || words > 1100) errors.push(`Reading Passage ${p.n}: ${words} words; Academic passages are about 700-1000 words`);
    const source = normalize(p.paragraphs.join(' '));
    for (const g of p.groups ?? []) {
      checkGroup(`Reading Passage ${p.n}`, g, source, errors, p.paragraphs);
      if (g.type === 'completion') for (const it of g.items ?? []) if (!source.includes(normalize(it.answer))) errors.push(`Reading Q${it.n}: completion answer must be taken from the passage`);
      if (g.type === 'headings' && !p.labelled) errors.push(`Reading Passage ${p.n}: headings need lettered paragraphs`);
    }
  }

  // Writing and speaking.
  const W = mock.writing ?? {};
  for (const [task, min] of [['task1', 150], ['task2', 250]]) {
    const w = W[task] ?? {};
    if (!w.prompt || !w.model || !w.checklist?.length) errors.push(`writing.${task} needs prompt, model and checklist`);
    if (!/illustrative/i.test(w.model_label ?? '')) errors.push(`writing.${task} model must be labelled illustrative`);
    if (w.model && wordCount(w.model) < min) errors.push(`writing.${task} model is under ${min} words`);
    if (w.prompt && !w.prompt.includes(`at least ${min} words`)) errors.push(`writing.${task} prompt must state the ${min}-word minimum`);
  }
  if (!W.task1?.figure?.alt || !/illustrative|fictional/i.test(W.task1?.figure?.note ?? '')) errors.push('writing.task1 needs a figure with alt text and a fictional-data note');
  const S = mock.speaking ?? {};
  if ((S.part1 ?? []).length < 2) errors.push('speaking Part 1 needs at least two topics');
  if (!S.part2?.card || (S.part2?.points ?? []).length < 3) errors.push('speaking Part 2 needs a cue card with at least three points');
  if ((S.part3?.questions ?? []).length < 4) errors.push('speaking Part 3 needs at least four questions');

  if (!Array.isArray(mock.release_blockers)) errors.push('release_blockers must be listed explicitly');
  const serialized = JSON.stringify(mock);
  for (const pattern of HARDCODED_SCHOOLS) if (pattern.test(serialized)) errors.push(`hardcoded school identity matches ${pattern}`);
  for (const pattern of OVERCLAIMS) if (pattern.test(serialized)) errors.push(`overclaiming language matches ${pattern}`);
  return errors;
}

export function mockSourcePaths(root = ROOT) {
  const base = join(root, 'docs/ielts/mocks');
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(base, e.name, 'mock.json')).filter((p) => existsSync(p)).sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2).length ? process.argv.slice(2) : mockSourcePaths();
  let failed = 0;
  for (const path of paths) {
    const errors = validateMockSource(JSON.parse(readFileSync(path, 'utf8')));
    console.log(`${errors.length ? 'FAIL' : 'ok  '} ${path}`);
    for (const e of errors) console.log(`     - ${e}`);
    if (errors.length) failed += 1;
  }
  process.exit(failed ? 1 : 0);
}
