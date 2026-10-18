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
export const COPYRIGHT_NOTICE = 'This recording is copyright Brains Heist LLC. All rights reserved.';
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
  if (item.paragraph && block.stimulus?.type === 'passage') {
    // Heading and purpose items name the paragraph they test; the evidence must come from that paragraph.
    const paragraph = normalize(block.stimulus.paragraphs?.[item.paragraph.charCodeAt(0) - 65]);
    if (!paragraph.includes(normalize(item.evidence))) errors.push(`${label}: evidence is not in paragraph ${item.paragraph}`);
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

function checkFigure(block, errors, label) {
  const fig = block.figure;
  if (!['line', 'bar', 'table', 'plan'].includes(fig.type)) errors.push(`${label}: figure type must be line, bar, table or plan`);
  if (fig.type === 'plan') {
    for (const field of ['title', 'alt', 'note']) if (!fig[field]) errors.push(`${label}: figure needs ${field}`);
    const letters = (fig.areas ?? []).filter((a) => a.letter).map((a) => a.letter);
    if (new Set(letters).size !== letters.length) errors.push(`${label}: plan letters must be unique`);
    // Map-labelling keys: the answer must be a lettered place, and its hidden name must be stated in the transcript or passage.
    const stim = stimulusText(block);
    for (const item of block.items ?? []) {
      const area = (fig.areas ?? []).find((a) => a.letter === item.answer);
      if (item.type === 'matching' && item.options?.every((o) => letters.includes(o))) {
        if (!area) errors.push(`${label} ${item.id}: answer ${item.answer} is not a lettered place on the plan`);
        else if (area.hidden_name && !normalize(item.prompt).includes(normalize(area.hidden_name))) errors.push(`${label} ${item.id}: prompt does not name the place hidden at ${item.answer}`);
      }
    }
    for (const area of fig.areas ?? []) {
      if (area.letter && area.hidden_name && stim && !stim.includes(normalize(area.hidden_name)) && !area.distractor) errors.push(`${label}: hidden place '${area.hidden_name}' is never mentioned in the script`);
    }
    return;
  }
  for (const field of ['title', 'alt', 'note']) if (!fig[field]) errors.push(`${label}: figure needs ${field}`);
  if (fig.note && !/fictional|illustrative/i.test(fig.note)) errors.push(`${label}: figure note must state the data are fictional practice data`);
  const n = (fig.x ?? []).length;
  if (!n) errors.push(`${label}: figure needs x values`);
  for (const series of fig.series ?? []) {
    if ((series.values ?? []).length !== n || series.values.some((v) => typeof v !== 'number')) errors.push(`${label}: series ${series.name} must have ${n} numeric values`);
  }
  const lookup = (series, x) => fig.series.find((s) => s.name === series)?.values[fig.x.map(String).indexOf(String(x))];
  for (const item of block.items ?? []) {
    for (const fact of item.facts ?? []) {
      const actual = lookup(fact.series, fact.x);
      if (actual !== fact.value) errors.push(`${label} ${item.id}: fact ${fact.series} ${fact.x} = ${fact.value} but the figure shows ${actual}`);
    }
  }
  if (block.model) {
    // Every number quoted in a model answer must come from the figure, so models never invent data.
    const allowed = new Set([...fig.x.map(String), ...fig.series.map((s) => String(s.name)), ...fig.series.flatMap((s) => s.values.map(String)), ...(block.model_derived_numbers ?? []).map(String)]);
    for (const number of block.model.match(/\d+(?:\.\d+)?/g) ?? []) {
      if (!allowed.has(number)) errors.push(`${label}: model quotes ${number}, which is not in the figure (declare genuine calculations in model_derived_numbers)`);
    }
  }
}

function checkBlock(block, code, errors, where, seenIds) {
  const label = `${where} ${block.id}`;
  if (block.figure) checkFigure(block, errors, label);
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
    // Matching keys must not simply follow the option order (1-A, 2-B, 3-C ...): learners could answer without the skill.
    const matching = (block.items ?? []).filter((i) => ['matching', 'paragraph_match'].includes(i.type) && Array.isArray(i.options));
    if (matching.length >= 4) {
      const pos = matching.map((i) => i.options.indexOf(i.answer));
      if (pos.every((p, k) => p >= 0 && (k === 0 || p === pos[k - 1] + 1))) errors.push(`${label}: matching answers run in option order; reorder the options`);
    }
  } else if (block.kind === 'writing') {
    // A withheld fresh-check task may deliberately have no model (block.no_model states why); every other writing task has one.
    for (const field of block.no_model ? ['prompt', 'conditions', 'checklist'] : ['prompt', 'conditions', 'model', 'model_label', 'checklist']) {
      if (!block[field] || (Array.isArray(block[field]) && block[field].length === 0)) errors.push(`${label}: missing ${field}`);
    }
    if (block.no_model && (block.model || where !== 'fresh check')) errors.push(`${label}: no_model is only for a fresh-check task without a model`);
    if (block.model_label && !/illustrative/i.test(block.model_label)) errors.push(`${label}: model_label must say the model is illustrative, not a certified band answer`);
    if (block.min_words && wordCount(block.model) < block.min_words) errors.push(`${label}: model has ${wordCount(block.model)} words, below the ${block.min_words}-word task minimum`);
    if (block.task === 'task2' && block.min_words !== 250) errors.push(`${label}: Academic Task 2 minimum is 250 words`);
    if (block.task === 'task1' && block.min_words !== 150) errors.push(`${label}: Academic Task 1 minimum is 150 words`);
    if (block.task === 'task1' && !block.figure) errors.push(`${label}: Academic Task 1 needs a visual (figure)`);
  } else if (block.kind === 'speaking') {
    for (const field of ['prompts', 'instructions', 'observation']) {
      if (!block[field] || (Array.isArray(block[field]) && block[field].length === 0)) errors.push(`${label}: missing ${field}`);
    }
    for (const model of block.models ?? []) {
      if (!model.label || !model.text) errors.push(`${label}: each spoken model needs a label and text`);
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

// Standard IELTS task rubric sentences legitimately repeat across prompts and are ignored for overlap.
const RUBRIC = [
  'to what extent do you agree or disagree?',
  'give reasons for your answer and include any relevant examples from your own knowledge or experience.',
  'write at least 250 words.',
  'write at least 150 words.',
  'discuss both views and give your own opinion.',
  'do the advantages of this development outweigh the disadvantages?',
  'summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
];
const stripRubric = (text) => RUBRIC.reduce((acc, sentence) => acc.split(sentence).join(' '), normalize(text));

function jaccard(a, b) {
  a = stripRubric(a);
  b = stripRubric(b);
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
  if (lesson.approval_record) {
    const r = lesson.approval_record;
    if (!r.approved_by || !r.date || !r.basis) errors.push('approval record needs approved_by, date and basis');
    if (r.version !== lesson.version) errors.push('approval record must name the exact approved version');
  }
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

  // Lessons 1-4 were approved as finished packs before this factory existed. A conversion record names the
  // approved source so wording, keys and recordings can be carried over unchanged and audited.
  const conversion = lesson.conversion;
  if (conversion) {
    if (!/^IELTS-0[1-4]$/.test(code ?? '')) errors.push('conversion records are only for Lessons 1-4, approved before the lesson factory');
    for (const field of ['source_pack', 'source_version', 'approved_content', 'additions']) {
      if (!conversion[field] || (Array.isArray(conversion[field]) && conversion[field].length === 0)) errors.push(`conversion.${field} is required`);
    }
  }

  const seen = new Set();
  const blocks = new Map();
  for (const block of lesson.blocks ?? []) {
    checkBlock(block, code, errors, 'lesson', seen);
    blocks.set(block.id, block);
  }
  // Optional support resources (Plan B, targeted support) are teacher-chosen, printed separately and not timed.
  if (lesson.support) {
    if (!lesson.support.title || !lesson.support.file || !/^[A-Za-z0-9_]+$/.test(lesson.support.file)) errors.push('support needs a title and a simple file name');
    if (!lesson.support.blocks?.length) errors.push('support needs at least one block');
    for (const block of lesson.support.blocks ?? []) checkBlock(block, code, errors, 'support', seen);
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
    if (block.kind === 'items' && block.homework) {
      // Homework is set in class and checked later, so its answers are not revealed in the lesson.
      if (parts.includes('answers')) errors.push(`homework block ${block.id} must not be revealed in class`);
    } else if (block.kind === 'items') {
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
    else {
      // Production order follows Diagnostic Bible 6.1/6.1.1: notice, directions, measured reading silence, passage, measured response silence.
      const segs = recording.segments ?? [];
      const kinds = segs.map((x) => (x.type === 'silence' ? `silence:${x.seconds}` : x.type));
      if (!segs.length) errors.push(`recording ${block.id} needs ordered production segments`);
      else {
        if (segs[0].type !== 'speech' || segs[0].voice !== 'instruction' || segs[0].text !== COPYRIGHT_NOTICE) errors.push(`recording ${block.id} must open with the spoken copyright notice in the instruction voice`);
        // A recording may be played in parts (as in IELTS Part 2), each preceded by its own reading time.
        const passages = segs.map((x, i) => (x.type === 'passage' ? i : -1)).filter((i) => i >= 0);
        const lastPassage = passages[passages.length - 1];
        if (!passages.length) errors.push(`recording ${block.id} needs a passage segment`);
        for (const [n, at] of passages.entries()) {
          const from = n === 0 ? 0 : passages[n - 1] + 1;
          if (!kinds.slice(from, at).includes('silence:30')) errors.push(`recording ${block.id} needs a measured 30-second reading silence before passage part ${n + 1}`);
        }
        if (passages.length > 1) {
          const lines = block.stimulus.paragraphs.length;
          const starts = passages.map((at) => segs[at].from_line ?? 0);
          if (starts[0] !== 0 || starts.some((v, i) => i && v <= starts[i - 1]) || starts[starts.length - 1] >= lines) errors.push(`recording ${block.id} passage parts need increasing from_line values covering the transcript`);
        }
        if (!kinds.slice(lastPassage + 1).includes('silence:15')) errors.push(`recording ${block.id} needs a measured 15-second response silence after the passage`);
      }
      const speakers = new Set((block.stimulus.paragraphs ?? []).map((line) => line.split(':')[0].trim()));
      for (const speaker of speakers) if (!recording.voices?.[speaker]) errors.push(`recording ${block.id} has no voice assigned for ${speaker}`);
      if (!recording.voices?.instruction) errors.push(`recording ${block.id} needs a distinct instruction voice`);
      if (!/^owner approved/i.test(recording.status) && !(lesson.release_blockers ?? []).some((b) => b.includes(block.id))) {
        errors.push(`unapproved recording ${block.id} must be listed in release_blockers`);
      }
    }
  }

  // Withheld fresh check: distinct identities and genuinely different content.
  const followup = lesson.followup;
  const noFreshCheck = conversion && followup?.absent_reason && !followup?.blocks?.length;
  if (noFreshCheck) {
    // Only an approved pre-factory lesson may lack one, and it must say what independent evidence it uses instead.
    if (!/screener|independent/i.test(followup.absent_reason)) errors.push('followup.absent_reason must name the independent evidence used instead');
  } else if (!followup?.blocks?.length) errors.push('a separate withheld fresh check is required');
  else {
    if (!/withh/i.test(followup.status ?? '')) errors.push('fresh check status must state that it is withheld');
    if (!followup.delivery || !followup.review) errors.push('fresh check needs delivery conditions and a review rule');
    const lessonPrompts = new Set((lesson.blocks ?? []).flatMap((b) => (b.items ?? []).map((i) => normalize(i.prompt))));
    const lessonText = (lesson.blocks ?? []).map((b) => [...(b.stimulus?.paragraphs ?? []), b.prompt ?? '', ...(b.prompts ?? [])].join(' ')).join(' ');
    for (const block of followup.blocks) {
      checkBlock(block, code, errors, 'fresh check', seen);
      for (const item of block.items ?? []) {
        // Short structural prompts such as 'Paragraph A' may repeat; substantive prompts may not.
        if (wordCount(item.prompt) >= 4 && lessonPrompts.has(normalize(item.prompt))) errors.push(`fresh check ${item.id} repeats a lesson prompt`);
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
