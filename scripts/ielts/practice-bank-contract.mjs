// Contract for AI-drafted practice-bank batches (Diagnostic Bible 2.0.0 sections 7.5 and 15E.2A).
// Automated gates run on every item before a named administrator reviews a sample.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const bankPaths = (root = ROOT) => readdirSync(join(root, 'docs/ielts/practice-bank')).filter(f => /^batch-\d+\.json$/.test(f)).map(f => join(root, 'docs/ielts/practice-bank', f)).sort();
const words = s => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const norm = s => String(s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');
const BANNED = /\b(band\s*\d|band score|official ielts|guarantee)/i;

export function validateBank(bank, { constructs }) {
  const errors = []; const keys = new Set();
  const err = (k, m) => errors.push(`${k}: ${m}`);
  if (bank.schema !== 'bh-ielts-practice-bank/1') errors.push('schema must be bh-ielts-practice-bank/1');
  if (!/pending/i.test(bank.status ?? '')) errors.push('a new batch must be a pending review draft');
  const known = c => constructs.has(c);
  for (const r of bank.reading ?? []) {
    if (keys.has(r.key)) err(r.key, 'duplicate key'); keys.add(r.key);
    const w = words(r.passage); if (w < 280 || w > 520) err(r.key, `passage has ${w} words (280-520)`);
    const paras = r.passage.split(/\n\n/); if (!paras.every((p, i) => p.startsWith(String.fromCharCode(65 + i) + '. '))) err(r.key, 'paragraphs must be labelled A., B., ...');
    if ((r.questions ?? []).length < 6) err(r.key, 'at least 6 questions');
    const types = new Set(r.questions.map(q => q.type));
    if (!types.has('true_false_ng') || !types.has('multiple_choice')) err(r.key, 'mix TRUE/FALSE/NOT GIVEN and multiple choice');
    const tf = r.questions.filter(q => q.type === 'true_false_ng').map(q => q.key);
    if (tf.length && !tf.includes('Not Given')) err(r.key, 'include at least one NOT GIVEN');
    r.questions.forEach((q, i) => {
      const id = `${r.key}.q${i + 1}`;
      if (!known(q.construct)) err(id, `unknown construct ${q.construct}`);
      if (q.supporting && !known(q.supporting)) err(id, `unknown supporting construct ${q.supporting}`);
      if (!q.evidence || q.evidence.length < 10) err(id, 'evidence is required');
      if (q.type === 'multiple_choice') { if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.includes(q.key)) err(id, 'multiple choice needs 4 options including the key'); }
      else if (q.type === 'true_false_ng') { if (JSON.stringify(q.options) !== JSON.stringify(['True', 'False', 'Not Given']) || !q.options.includes(q.key)) err(id, 'TFNG options/key'); }
      else if (q.type === 'fill_blank') {
        if (!Array.isArray(q.key) || !q.key.length) err(id, 'fill_blank key must be a list');
        else if (!norm(r.passage).includes(norm(q.key[0]))) err(id, 'fill_blank answer must appear in the passage');
        if (!q.q.includes('_____')) err(id, 'fill_blank needs a gap');
      } else err(id, `unsupported type ${q.type}`);
      // quoted evidence after "X:" must appear in the passage
      const m = /^[A-E]: (.+)$/.exec(q.evidence ?? '');
      if (m) for (const part of m[1].split(' ... ')) if (!norm(r.passage).includes(norm(part.replace(/\.\.\.$/, '').trim()))) err(id, `evidence not found in passage: "${part}"`);
    });
  }
  for (const t of bank.writing ?? []) {
    if (keys.has(t.key)) err(t.key, 'duplicate key'); keys.add(t.key);
    if (!/Write at least 250 words\./.test(t.prompt)) err(t.key, 'Task 2 prompt must state the 250-word minimum');
    if (BANNED.test(t.prompt)) err(t.key, 'no band or official claims');
    if (!t.constructs?.some(c => c[1] === 'primary')) err(t.key, 'a primary construct is required');
    for (const [c] of t.constructs ?? []) if (!known(c)) err(t.key, `unknown construct ${c}`);
  }
  for (const s of bank.speaking ?? []) {
    if (keys.has(s.key)) err(s.key, 'duplicate key'); keys.add(s.key);
    if (![1, 2, 3].includes(s.part)) err(s.key, 'part 1-3');
    if (s.part === 2 && !/You should say:/.test(s.prompt)) err(s.key, 'Part 2 needs a cue card');
    if (!Array.isArray(s.follow_ups) || s.follow_ups.length < 2) err(s.key, 'follow-up questions required');
    if (!s.constructs?.some(c => c[1] === 'primary')) err(s.key, 'a primary construct is required');
    for (const [c] of s.constructs ?? []) if (!known(c)) err(s.key, `unknown construct ${c}`);
  }
  return errors;
}

// Construct codes available in the live registry (bh-english-core-v1, bh-ielts-listening-v1, bh-ielts-core-v1) used by banks.
export const KNOWN_CONSTRUCTS = new Set(JSON.parse(readFileSync(join(ROOT, 'docs/ielts/practice-bank/constructs.json'), 'utf8')));

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = false;
  for (const p of bankPaths()) { const e = validateBank(JSON.parse(readFileSync(p, 'utf8')), { constructs: KNOWN_CONSTRUCTS }); console.log(e.length ? `FAIL ${p}\n  ${e.join('\n  ')}` : `ok   ${p}`); failed ||= e.length > 0; }
  process.exit(failed ? 1 : 0);
}
