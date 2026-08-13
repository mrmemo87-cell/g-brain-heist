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
const normalizeForNoOp = (value: string) => value.trim().replace(/\s+/g, " ");

export const isGroundedCorrection = (
  correction: CanonicalCorrection,
  source: string,
): boolean => correction.start_char >= 0
  && correction.end_char === correction.start_char + correction.original.length
  && source.slice(correction.start_char, correction.end_char) === correction.original
  && normalizeForNoOp(correction.original) !== normalizeForNoOp(correction.better_version)
  && correction.explanation.trim().length >= 4;

/**
 * Model-generated offsets are advisory. A correction is still safely
 * recoverable when its verbatim original occurs exactly once in the source.
 * Repeated text remains fail-closed because choosing an occurrence would be
 * ambiguous and could highlight or rewrite the wrong student passage.
 */
export const groundCanonicalCorrection = (
  correction: CanonicalCorrection,
  source: string,
): CanonicalCorrection | null => {
  if (!correction || typeof correction !== "object") return null;
  if (typeof correction.original !== "string" || correction.original.length === 0) return null;
  if (typeof correction.better_version !== "string" || correction.better_version.length === 0) return null;
  if (typeof correction.explanation !== "string" || correction.explanation.trim().length < 4) return null;
  if (normalizeForNoOp(correction.original) === normalizeForNoOp(correction.better_version)) return null;

  if (isGroundedCorrection(correction, source)) return correction;

  const first = source.indexOf(correction.original);
  if (first < 0) return null;
  const repeated = source.indexOf(correction.original, first + Math.max(1, correction.original.length)) >= 0;
  if (repeated) return null;

  const grounded = {
    ...correction,
    start_char: first,
    end_char: first + correction.original.length,
  };
  return isGroundedCorrection(grounded, source) ? grounded : null;
};

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
  corrections
    .map((item) => groundCanonicalCorrection(item, source))
    .filter((item): item is CanonicalCorrection => Boolean(item))
    .forEach((item) => {
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
      const conflicts = accepted.filter((item) => overlaps(item, candidate));
      if (conflicts.length === 0) return [...accepted, candidate];
      const candidateRank = CATEGORY_PRIORITY[candidate.category];
      const candidateWinsEveryConflict = conflicts.every((current) => {
        const currentRank = CATEGORY_PRIORITY[current.category];
        return candidateRank > currentRank || (
          candidateRank === currentRank
          && candidate.original.length < current.original.length
        );
      });
      if (!candidateWinsEveryConflict) return accepted;
      return [...accepted.filter((item) => !overlaps(item, candidate)), candidate];
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
