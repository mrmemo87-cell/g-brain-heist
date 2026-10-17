#!/usr/bin/env node
// Structural and answer-key contract for IELTS lesson sources (schema bh-ielts-lesson-source/2).
// Automated checks support, but never replace, human editorial/key/mapping/difficulty/originality review.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'bh-ielts-lesson-source/2';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HARDCODED_SCHOOLS = [/\bsobhy\b/i, /\bSRIS\b/, /silk\s*road/i];
const OVERCLAIMS = [/(?<!not a |no )certified band/i, /guaranteed? (a )?band/i, /official (ielts )?examiner/i, /band\s*[5-9](\.5)?\s+(essay|answer|response|model)\b/i];
const TFNG = ['TRUE', 'FALSE', 'NOT GIVEN'];
const YNNG = ['YES', 'NO', 'NOT GIVEN'];

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export const words = (text) => normalize(text).split(/[^a-z0-9'.:-]+/).filter(Boolean);
export const wordCount = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

export function currentBibleVersions(root = ROOT) {
  const read = (file) => {
    const text = readFileSync(join(root, 'docs/ielts', file), 'utf8');
    const match = text.match(/\*\*Version:\*\*\s*([0-9.]+)/) || text.match(/Version[^0-9]*([0-9]+\.[0-9]+\.[0-9]+)/);
    return match?.[1];
  };
  return {
    diagnostic: read('IELTS_DIAGNOSTIC_BIBLE.md'),
    lessons: read('IELTS_LESSONS_BIBLE.md'),
    visual: read('IELTS_VISUAL_UX_BIBLE.md'),
  };
}

function stimulusText(block) {
  return normalize((block.stimulus?.paragraphs ?? []).join(' '));
}

function checkItem(item, block, errors, where) {
  const label = `${where} ${item.id}`;
  for (const field of ['id', 'prompt', 'answer', 'evidence', 'reason', 'focus', 'type']) {
    if (!item[field] || String(item[field]).trim() === '') errors.push(`${label}: missing ${field}`);
  }
  if (!String(item.id ?? '').startsWith(`${block.id}-`)) errors.push(`${label}: item id must start with block id ${block.id}`);
  const answer = String(item.answer ?? '');
  const stimulusType = block.stimulus?.type;
  const evidenceMustBeQuoted = ['transcript', 'passage', 'teacher_script'].includes(stimulusType);
  const stim = stimulusText(block);
  const answerIsAbsence = answer === 'NOT GIVEN';
  if (evidenceMustBeQuoted && !answerIsAbsence && item.evidence && !stim.includes(normalize(item.evidence))) {
    errors.push(`${label}: evidence is not a verbatim quotation from the ${stimulusType}`);
  }
  switch (item.type) {
    case 'mcq': {
      const letters = (item.options ?? []).map((o) => String(o).trim().charAt(0));
      if ((item.options ?? []).length < 3) errors.push(`${label}: multiple choice needs at least three options`);
      if (!letters.includes(answer)) errors.push(`${label}: answer ${answer} is not one of the option letters`);
      if (new Set(letters).size !== letters.length) errors.push(`${label}: duplicate option letters`);
      break;
    }
    case 'matching':
    case 'paragraph_match': {
      if (!(item.options ?? []).includes(answer)) errors.push(`${label}: answer ${answer} is not one of the options`);
      if (item.type === 'paragraph_match' && block.stimulus?.type === 'passage') {
        const index = answer.charCodeAt(0) - 65;
        const paragraph = normalize(block.stimulus.paragraphs?.[index]);
        if (!paragraph.includes(normalize(item.evidence))) errors.push(`${label}: evidence is not in paragraph ${answer}`);
      }
      break;
    }
    case 'completion': {
      const limit = Number(item.word_limit);
      if (!limit) errors.push(`${label}: completion item needs word_limit`);
      for (const candidate of [answer, ...(item.accept ?? [])]) {
        if (limit && candidate === answer && wordCount(candidate) > limit) errors.push(`${label}: answer "${candidate}" exceeds ${limit}-word limit`);
      }
      if (block.stimulus?.type === 'passage') {
        // Reading completion answers must be taken from the passage verbatim.
        if (!stim.includes(normalize(answer))) errors.push(`${label}: completion answer "${answer}" does not appear verbatim in the passage`);
      }
      break;
    }
    case 'tfng':
    case 'ynng': {
      const allowed = item.type === 'tfng' ? TFNG : YNNG;
      if (!allowed.includes(answer)) errors.push(`${label}: answer must be one of ${allowed.join('/')}`);
      break;
    }
    case 'choice':
    case 'short':
      break;
    default:
      errors.push(`${label}: unknown item type ${item.type}`);
  }
}

function checkBlock(block, code, errors, where, seenIds) {
  const label = `${where} ${block.id}`;
  if (!block.id?.startsWith(`${code}-`)) errors.push(`${label}: block id must start with ${code}-`);
  if (seenIds.has(block.id)) errors.push(`${label}: duplicate id`);
  seenIds.add(block.id);
  if (!block.title) errors.push(`${label}: missing title`);
  if (!block.mode) errors.push(`${label}: missing mode (practice/assessment conditions)`);
  if (block.kind === 'items') {
    if (!block.instructions) errors.push(`${label}: missing instructions`);
    if (!Array.isArray(block.items) || block.items.length === 0) errors.push(`${label}: no items`);
    for (const item of block.items ?? []) {
      if (seenIds.has(item.id)) errors.push(`${label}: duplicate item id ${item.id}`);
      seenIds.add(item.id);
      checkItem(item, block, errors, where);
    }
  } else if (block.kind === 'writing') {
    for (const field of ['prompt', 'conditions', 'model', 'model_label', 'checklist']) {
      if (!block[field] || (Array.isArray(block[field]) && block[field].length === 0)) errors.push(`${label}: missing ${field}`);
    }
    if (block.model_label && !/illustrative/i.test(block.model_label)) errors.push(`${label}: model_label must say the model is illustrative, not a certified band answer`);
    if (block.min_words && wordCount(block.model) < block.min_words) errors.push(`${label}: model has ${wordCount(block.model)} words, below the ${block.min_words}-word task minimum`);
    if (block.task === 'task2' && block.min_words !== 250) errors.push(`${label}: Academic Task 2 minimum is 250 words`);
    if (block.task === 'task1' && block.min_words !== 150) errors.push(`${label}: Academic Task 1 minimum is 150 words`);
  } else if (block.kind === 'speaking') {
    for (const field of ['prompts', 'instructions', 'observation']) {
      if (!block[field] || (Array.isArray(block[field]) && block[field].length === 0)) errors.push(`${label}: missing ${field}`);
    }
    if (block.observation && !/(audio|heard|live)/i.test(block.observation)) errors.push(`${label}: observation must restrict pronunciation judgments to audio or live hearing`);
  } else if (block.kind === 'contrast') {
    if (!Array.isArray(block.examples) || block.examples.length < 2) errors.push(`${label}: contrast needs at least two examples`);
    for (const example of block.examples ?? []) {
      if (!example.text || !example.comment || !example.label) errors.push(`${label}: contrast example needs label, text and comment`);
    }
  } else {
    errors.push(`${label}: unknown block kind ${block.kind}`);
  }
}

function jaccard(a, b) {
  const A = new Set(words(a).filter((w) => w.length > 3));
  const B = new Set(words(b).filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared += 1;
  return shared / (A.size + B.size - shared);
}

export function validateLessonSource(lesson, { bibles = currentBibleVersions() } = {}) {
  const errors = [];
  const code = lesson.code;
  if (lesson.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
  if (!/^IELTS-\d{2}$/.test(code ?? '')) errors.push('code must look like IELTS-05');
  if (Number(code?.slice(6)) !== lesson.number) errors.push('number must match the lesson code');
  if (lesson.duration !== 60) errors.push('core lessons are 60 minutes; schedule longer assessments separately');
  if (lesson.test_type !== 'Academic') errors.push('programme route is IELTS Academic only');
  if (!/draft/i.test(lesson.status ?? '') && !lesson.approval_record) errors.push('status must remain a draft until a human approval record is attached');
  for (const key of ['diagnostic', 'lessons', 'visual']) {
    if (lesson.bibles?.[key] !== bibles[key]) errors.push(`bibles.${key} ${lesson.bibles?.[key]} does not match current Bible ${bibles[key]}`);
  }
  for (const key of ['foundation', 'core', 'extension', 'high_band']) {
    if (!lesson.levels?.[key]) errors.push(`levels.${key} differentiation is required`);
  }
  if (!Array.isArray(lesson.objectives) || lesson.objectives.length === 0) errors.push('objectives are required');
  if (!Array.isArray(lesson.prerequisites) || lesson.prerequisites.length === 0) errors.push('prerequisites are required');
  if (!Array.isArray(lesson.homework) || lesson.homework.length === 0) errors.push('homework is required');
  if (!Array.isArray(lesson.exit_ticket) || lesson.exit_ticket.length === 0) errors.push('exit ticket is required');
  if (!lesson.delayed_followup) errors.push('delayed follow-up plan is required');
  if (!Array.isArray(lesson.release_blockers)) errors.push('release_blockers must be listed explicitly (may be empty only after approval)');

  const seen = new Set();
  const blocks = new Map();
  for (const block of lesson.blocks ?? []) {
    checkBlock(block, code, errors, 'lesson', seen);
    blocks.set(block.id, block);
  }

  // Timed plan: contiguous, complete, and every block taught with questions before answers.
  let cursor = 0;
  const shown = new Map();
  (lesson.stages ?? []).forEach((stage, index) => {
    const label = `stage ${index + 1} (${stage.title})`;
    if (stage.start !== cursor) errors.push(`${label}: starts at ${stage.start}, expected ${cursor}`);
    if (!(stage.end > stage.start)) errors.push(`${label}: end must be after start`);
    cursor = stage.end;
    for (const field of ['title', 'student', 'teacher', 'say', 'check']) if (!stage[field]) errors.push(`${label}: missing ${field}`);
    for (const ref of stage.show ?? []) {
      if (!blocks.has(ref.block)) errors.push(`${label}: unknown block ${ref.block}`);
      const parts = shown.get(ref.block) ?? [];
      parts.push(ref.part);
      shown.set(ref.block, parts);
    }
  });
  if (cursor !== lesson.duration) errors.push(`stages end at ${cursor}, expected ${lesson.duration}`);
  for (const block of blocks.values()) {
    const parts = shown.get(block.id) ?? [];
    if (!parts.length) errors.push(`block ${block.id} is never shown in the timed plan`);
    if (block.kind === 'items') {
      const q = parts.indexOf('questions');
      const a = parts.indexOf('answers');
      if (q === -1 || a === -1) errors.push(`block ${block.id} needs both a questions and an answers stage`);
      else if (a < q) errors.push(`block ${block.id} reveals answers before questions`);
    }
  }

  // Audio honesty: every transcript needs a recording entry, and unapproved recordings block release.
  const transcriptBlocks = [...(lesson.blocks ?? []), ...(lesson.followup?.blocks ?? [])].filter((b) => b.stimulus?.type === 'transcript');
  const recordings = new Map((lesson.audio?.recordings ?? []).map((r) => [r.block, r]));
  if (transcriptBlocks.length && !lesson.audio?.required) errors.push('audio.required must be true when the lesson uses recordings');
  if (!transcriptBlocks.length && lesson.audio?.required) errors.push('audio.required is true but no transcript block exists');
  for (const block of transcriptBlocks) {
    const recording = recordings.get(block.id);
    if (!recording) errors.push(`recording entry missing for ${block.id}`);
    else if (!/approved/i.test(recording.status) && !(lesson.release_blockers ?? []).some((b) => b.includes(block.id))) {
      errors.push(`unapproved recording ${block.id} must be listed in release_blockers`);
    }
  }

  // Withheld fresh check: distinct identities and genuinely different content.
  const followup = lesson.followup;
  if (!followup?.blocks?.length) errors.push('a separate withheld fresh check is required');
  else {
    if (!/withh/i.test(followup.status ?? '')) errors.push('fresh check status must state that it is withheld');
    if (!followup.delivery || !followup.review) errors.push('fresh check needs delivery conditions and a review rule');
    const lessonPrompts = new Set((lesson.blocks ?? []).flatMap((b) => (b.items ?? []).map((i) => normalize(i.prompt))));
    const lessonText = (lesson.blocks ?? []).map((b) => [...(b.stimulus?.paragraphs ?? []), b.prompt ?? '', ...(b.prompts ?? [])].join(' ')).join(' ');
    for (const block of followup.blocks) {
      checkBlock(block, code, errors, 'fresh check', seen);
      for (const item of block.items ?? []) {
        if (lessonPrompts.has(normalize(item.prompt))) errors.push(`fresh check ${item.id} repeats a lesson prompt`);
      }
      const freshText = [...(block.stimulus?.paragraphs ?? []), block.prompt ?? '', ...(block.prompts ?? [])].join(' ');
      const overlap = jaccard(freshText, lessonText);
      if (overlap > 0.35) errors.push(`fresh check ${block.id} overlaps lesson content too heavily (${overlap.toFixed(2)})`);
    }
  }

  const serialized = JSON.stringify(lesson);
  for (const pattern of HARDCODED_SCHOOLS) if (pattern.test(serialized)) errors.push(`hardcoded school identity matches ${pattern}`);
  for (const pattern of OVERCLAIMS) if (pattern.test(serialized)) errors.push(`overclaiming language matches ${pattern}`);
  if (/workbook page \d/i.test(serialized)) errors.push('refer to workbook sections by name; page numbers depend on the generated layout');
  return errors;
}

export function lessonSourcePaths(root = ROOT) {
  const base = join(root, 'docs/ielts/lessons');
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(base, entry.name, 'lesson.json'))
    .filter((path) => existsSync(path) && JSON.parse(readFileSync(path, 'utf8')).schema === SCHEMA)
    .sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2).length ? process.argv.slice(2) : lessonSourcePaths();
  let failed = 0;
  for (const path of paths) {
    const errors = validateLessonSource(JSON.parse(readFileSync(path, 'utf8')));
    console.log(`${errors.length ? 'FAIL' : 'ok  '} ${path}`);
    for (const error of errors) console.log(`     - ${error}`);
    if (errors.length) failed += 1;
  }
  process.exit(failed ? 1 : 0);
}
