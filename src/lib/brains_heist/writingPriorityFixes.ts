/**
 * Chooses the few corrections a student should act on first.
 *
 * The assessor reports every genuine error, which can be 15 or more items for a short text. A learner acts on a short
 * list, so the hub leads with at most three: one example from each of the mistake patterns that occur most often,
 * because fixing a repeated pattern removes the most errors. The complete list stays available behind "see all".
 */

export type PriorityFixKind = 'grammar' | 'punctuation' | 'phrase' | 'style';

export interface PriorityFixInput {
  kind: PriorityFixKind;
  start: number;
  /** Canonical weakness tag from the assessor, when it supplied one (for example "tense_error"). */
  weaknessTag?: string;
}

export interface PriorityFix<T extends PriorityFixInput> {
  fix: T;
  /** How many corrections in this piece of writing share the same mistake pattern. */
  patternCount: number;
  /** Plain-language name of the pattern, safe to show to a student. */
  patternLabel: string;
}

export interface PriorityFixSelection<T extends PriorityFixInput> {
  priority: Array<PriorityFix<T>>;
  rest: T[];
}

const KIND_WEIGHT: Record<PriorityFixKind, number> = { grammar: 3, punctuation: 2, phrase: 1, style: 0 };

const PATTERN_LABELS: Record<string, string> = {
  tense_error: 'verb tense',
  agreement_error: 'subject and verb matching',
  article_error: 'a / an / the',
  preposition_error: 'small linking words (in, on, at, to)',
  fragment: 'incomplete sentences',
  run_on: 'sentences that run together',
  weak_word_choice: 'word choice',
  spelling_error: 'spelling',
  punctuation_error: 'punctuation and capital letters',
  weak_linking: 'linking ideas',
  weak_register_control: 'formal or informal style',
  wrong_tone: 'tone',
};

const KIND_LABELS: Record<PriorityFixKind, string> = {
  grammar: 'grammar',
  punctuation: 'punctuation and capital letters',
  phrase: 'word choice',
  style: 'style and tone',
};

const patternKey = (fix: PriorityFixInput): string => {
  const tag = fix.weaknessTag?.trim().toLowerCase();
  return tag ? `tag:${tag}` : `kind:${fix.kind}`;
};

export const describeFixPattern = (fix: PriorityFixInput): string => {
  const tag = fix.weaknessTag?.trim().toLowerCase();
  if (tag && PATTERN_LABELS[tag]) return PATTERN_LABELS[tag];
  if (tag) return tag.replace(/_error$/, '').replace(/_/g, ' ');
  return KIND_LABELS[fix.kind];
};

export const selectPriorityWritingFixes = <T extends PriorityFixInput>(
  fixes: readonly T[],
  limit = 3,
): PriorityFixSelection<T> => {
  const max = Math.max(0, Math.floor(limit));
  if (fixes.length === 0 || max === 0) return { priority: [], rest: [...fixes] };

  const groups = new Map<string, T[]>();
  fixes.forEach((fix) => {
    const key = patternKey(fix);
    const group = groups.get(key);
    if (group) group.push(fix);
    else groups.set(key, [fix]);
  });

  const ranked = [...groups.values()]
    .map((items) => [...items].sort((a, b) => a.start - b.start))
    .sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      const weight = Math.max(...b.map((item) => KIND_WEIGHT[item.kind])) - Math.max(...a.map((item) => KIND_WEIGHT[item.kind]));
      if (weight !== 0) return weight;
      return a[0]!.start - b[0]!.start;
    });

  // One example per pattern first; if there are fewer patterns than slots, take further examples in rank order.
  const chosen: Array<PriorityFix<T>> = [];
  for (let round = 0; chosen.length < max; round += 1) {
    let added = false;
    for (const group of ranked) {
      const fix = group[round];
      if (!fix) continue;
      chosen.push({ fix, patternCount: group.length, patternLabel: describeFixPattern(fix) });
      added = true;
      if (chosen.length >= max) break;
    }
    if (!added) break;
  }

  const chosenSet = new Set<T>(chosen.map((item) => item.fix));
  return { priority: chosen, rest: fixes.filter((fix) => !chosenSet.has(fix)) };
};
