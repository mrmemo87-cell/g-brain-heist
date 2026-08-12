export type CorrectionCategory =
  | "grammar"
  | "punctuation"
  | "spelling"
  | "capitalization"
  | "sentence_structure"
  | "word_choice";

export type CanonicalCorrection = {
  category: CorrectionCategory;
  original: string;
  better_version: string;
  explanation: string;
  start_char: number;
  end_char: number;
  weakness_tag: string;
};

const CATEGORY_PRIORITY: Record<CorrectionCategory, number> = {
  sentence_structure: 6,
  grammar: 5,
  spelling: 4,
  capitalization: 3,
  punctuation: 2,
  word_choice: 1,
};

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const isGroundedCorrection = (
  correction: CanonicalCorrection,
  source: string,
): boolean => correction.start_char >= 0
  && correction.end_char === correction.start_char + correction.original.length
  && source.slice(correction.start_char, correction.end_char) === correction.original
  && normalize(correction.original) !== normalize(correction.better_version)
  && correction.explanation.trim().length >= 4;

const overlaps = (a: CanonicalCorrection, b: CanonicalCorrection): boolean =>
  a.start_char < b.end_char && b.start_char < a.end_char;

const correctionKey = (correction: CanonicalCorrection): string => [
  correction.start_char,
  correction.end_char,
  correction.category,
  normalize(correction.better_version),
].join(":");

/**
 * Establishes one deterministic correction inventory after AI adjudication.
 * Invalid spans, exact duplicates and competing overlapping rewrites cannot
 * leak into cinematic feedback or longitudinal analytics.
 */
export const reconcileCanonicalCorrections = (
  corrections: CanonicalCorrection[],
  source: string,
): CanonicalCorrection[] => {
  const exact = new Map<string, CanonicalCorrection>();
  corrections.filter((item) => isGroundedCorrection(item, source)).forEach((item) => {
    const key = correctionKey(item);
    const current = exact.get(key);
    if (!current || item.explanation.length > current.explanation.length) exact.set(key, item);
  });

  return [...exact.values()]
    .sort((a, b) => {
      if (a.start_char !== b.start_char) return a.start_char - b.start_char;
      if (a.end_char !== b.end_char) return b.end_char - a.end_char;
      return CATEGORY_PRIORITY[b.category] - CATEGORY_PRIORITY[a.category];
    })
    .reduce<CanonicalCorrection[]>((accepted, candidate) => {
      const conflictIndex = accepted.findIndex((item) => overlaps(item, candidate));
      if (conflictIndex < 0) return [...accepted, candidate];
      const current = accepted[conflictIndex];
      const candidateRank = CATEGORY_PRIORITY[candidate.category];
      const currentRank = CATEGORY_PRIORITY[current.category];
      if (candidateRank > currentRank || (
        candidateRank === currentRank
        && candidate.original.length < current.original.length
      )) {
        return accepted.map((item, index) => index === conflictIndex ? candidate : item);
      }
      return accepted;
    }, []);
};

export const applyCanonicalCorrections = (
  source: string,
  corrections: CanonicalCorrection[],
): string => [...corrections]
  .sort((a, b) => b.start_char - a.start_char)
  .reduce((text, item) =>
    `${text.slice(0, item.start_char)}${item.better_version}${text.slice(item.end_char)}`,
  source);
