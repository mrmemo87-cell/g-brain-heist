/**
 * Writing essay annotations (Diagnostic Bible 2.4.0 section 10.9).
 *
 * 1. Highlights: short phrases copied exactly from the student's essay, each tagged with ONE Writing criterion and
 *    marked as done well ("strength") or to improve ("fix"), with one short note and, for language fixes, the corrected
 *    wording. The client colours them by criterion. Quotes not found in the essay are dropped on the server.
 * 2. AI estimated task band: worked out by the SERVER from the four criterion practice ranges (never written by the
 *    AI): the mean of the range midpoints, rounded to the nearest half band, shown with its +/- 0.5 range. It is
 *    practice feedback until the teacher confirms or changes it as the task band.
 *
 * Invalid highlights are dropped rather than failing the whole feedback: a missing highlight is better than none.
 */

export const WRITING_HIGHLIGHT_CRITERIA = ['task_achievement', 'task_response', 'coherence_cohesion', 'lexical_resource', 'grammar_range_accuracy'] as const;
export type WritingHighlightCriterion = typeof WRITING_HIGHLIGHT_CRITERIA[number];
export type WritingHighlight = {
  criterion: WritingHighlightCriterion; kind: 'strength' | 'fix'; quote: string; note: string; correction: string | null;
  start_char: number; end_char: number;
};
export type TaskEstimate = { band: number; low: number; high: number };

export const MAX_WRITING_HIGHLIGHTS = 16;
const taskKey = (task: 1 | 2): WritingHighlightCriterion => (task === 1 ? 'task_achievement' : 'task_response');
export const writingHighlightCriteria = (task: 1 | 2) =>
  [taskKey(task), 'coherence_cohesion', 'lexical_resource', 'grammar_range_accuracy'] as WritingHighlightCriterion[];

export const writingHighlightInstructions = (task: 1 | 2) => `Also return highlights: short phrases copied EXACTLY (same characters, same order) from the STUDENT'S WRITING so the teacher and student can see them coloured in the essay.
First mark the student's clearest problems as kind "fix" (up to 12, most important first): grammar errors (verb form, tense, agreement, articles, plurals, prepositions, word order, sentence fragments, run-on sentences, punctuation that changes meaning), wrong word choice or collocation, spelling mistakes, informal or repeated words, missing or wrong linking words, a sentence or idea that does not answer the task.
For every language fix give correction: the corrected version of exactly the quoted words, as short as possible (for example quote "peoples is" -> correction "people are"). For a fix about ideas or organisation where no short rewrite fits, correction is null and the note says what to do.
Then mark up to 4 kind "strength" phrases. A strength must be correct, natural English that is genuinely good for this task; never praise a phrase that has any mistake. Strengths have correction null.
Each highlight has criterion (${taskKey(task)} for answering the task${task === 1 ? ', key features, overview and comparisons' : ', position and idea development'}; coherence_cohesion for linking words, paragraphing, referencing and the logical order of ideas; lexical_resource for word choice, collocation, spelling and word form; grammar_range_accuracy for grammar, sentence structure and punctuation), kind, quote (1-15 words copied exactly from the student's writing, never your correction), note (one short simple sentence written to the student) and correction.
Cover all four criteria when the writing allows. Never highlight the task prompt, names or numbers copied from the task.`;

export const writingHighlightSchema = (task: 1 | 2) => ({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      criterion: { type: 'string', enum: writingHighlightCriteria(task) },
      kind: { type: 'string', enum: ['strength', 'fix'] },
      quote: { type: 'string' },
      note: { type: 'string' },
      correction: { type: ['string', 'null'] },
    },
    required: ['criterion', 'kind', 'quote', 'note', 'correction'],
    additionalProperties: false,
  },
});

const banned = /\b(?:overall\s+(?:band|score)|band\s*score|your\s+band\s+is|official\s+(?:examiner|result|score)|guarantee[ds]?)\b/i;
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const codePoints = (s: string) => Array.from(s).length;

/** Locates a quote in the essay: exact first, then case- and whitespace-tolerant. Returns the essay's own text. */
export function locateQuote(essay: string, quote: string, taken: Array<[number, number]> = []): { text: string; start: number; end: number } | null {
  const free = (s: number, e: number) => taken.every(([a, b]) => e <= a || s >= b);
  for (let at = essay.indexOf(quote); at >= 0 && quote; at = essay.indexOf(quote, at + 1)) {
    if (free(at, at + quote.length)) return { text: quote, start: at, end: at + quote.length };
  }
  const words = quote.trim().split(/\s+/).filter(Boolean).map(escapeRegex);
  if (!words.length) return null;
  const re = new RegExp(words.join('\\s+'), 'giu');
  for (let m = re.exec(essay); m; m = re.exec(essay)) {
    if (free(m.index, m.index + m[0].length)) return { text: m[0], start: m.index, end: m.index + m[0].length };
    re.lastIndex = m.index + 1;
  }
  return null;
}

/**
 * Keeps highlights whose quote appears in the essay, with a valid criterion for this task, kind, note and correction.
 * Overlapping and duplicate quotes are dropped. Character offsets are Unicode code points into the essay. Never throws.
 */
export function cleanWritingHighlights(value: unknown, essay: string, task: 1 | 2): WritingHighlight[] {
  if (!Array.isArray(value) || !essay) return [];
  const allowed = writingHighlightCriteria(task);
  const taken: Array<[number, number]> = [];
  const out: WritingHighlight[] = [];
  for (const raw of value) {
    if (out.length >= MAX_WRITING_HIGHLIGHTS) break;
    if (!raw || typeof raw !== 'object') continue;
    const h = raw as { criterion?: unknown; kind?: unknown; quote?: unknown; note?: unknown; correction?: unknown };
    const criterion = String(h.criterion) as WritingHighlightCriterion;
    const kind = h.kind === 'strength' || h.kind === 'fix' ? h.kind : null;
    const quote = typeof h.quote === 'string' ? h.quote.trim().replace(/^["“”]+|["“”]+$/g, '') : '';
    const note = typeof h.note === 'string' ? squash(h.note) : '';
    let correction = typeof h.correction === 'string' ? squash(h.correction).replace(/^["“”]+|["“”]+$/g, '') : null;
    if (!allowed.includes(criterion) || !kind) continue;
    if (quote.length < 1 || quote.length > 200 || quote.split(/\s+/).length > 20) continue;
    if (note.length < 3 || note.length > 260 || banned.test(note)) continue;
    if (kind === 'strength') correction = null;
    if (correction !== null && (!correction || correction.length > 220 || banned.test(correction) || squash(correction).toLowerCase() === squash(quote).toLowerCase())) correction = null;
    const found = locateQuote(essay, quote, taken);
    if (!found) continue;
    taken.push([found.start, found.end]);
    const start_char = codePoints(essay.slice(0, found.start));
    out.push({ criterion, kind, quote: found.text, note, correction, start_char, end_char: start_char + codePoints(found.text) });
  }
  return out.sort((a, b) => a.start_char - b.start_char);
}

/**
 * AI estimated task band from the four criterion practice ranges: mean of the midpoints, rounded to the nearest half
 * band (halves round up, as in the IELTS overall rule), +/- 0.5. Null unless every criterion has a range.
 */
export function taskEstimate(criteria: Record<string, { indication: { low: number; high: number } | null } | undefined>, task: 1 | 2): TaskEstimate | null {
  const keys = writingHighlightCriteria(task);
  const mids: number[] = [];
  for (const key of keys) {
    const i = criteria[key]?.indication;
    if (!i) return null;
    mids.push((i.low + i.high) / 2);
  }
  const mean = mids.reduce((s, n) => s + n, 0) / mids.length;
  const band = Math.min(9, Math.max(0, Math.floor(mean * 2 + 0.5 + 1e-9) / 2));
  return { band, low: Math.max(0, band - 0.5), high: Math.min(9, band + 0.5) };
}
