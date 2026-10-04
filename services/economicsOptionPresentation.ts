import plans from './economicsOptionPresentation.json' with { type: 'json' };

type TextOption = string | { text: string };
const presentationPlans: Record<string, { fingerprint: number; order: number[] }> = plans;

/** Display-only ordering. Canonical content, hashes, answer text and snapshots stay intact. */
export function economicsDisplayOptions<T extends TextOption>(questionId: string, options: T[]): T[] {
  const plan = presentationPlans[questionId];
  if (!plan || options.length !== 4) return options;
  let fingerprint = 0x811c9dc5;
  for (const char of JSON.stringify(options.map(option => typeof option === 'string' ? option : option.text))) {
    fingerprint ^= char.charCodeAt(0);
    fingerprint = Math.imul(fingerprint, 0x01000193);
  }
  // This also makes repeated normalization idempotent and fails closed on revisions.
  if ((fingerprint >>> 0) !== plan.fingerprint) return options;
  return plan.order.map(index => options[index]);
}

/** Matches the existing difficulty-based game economy for one-mark verified items. */
export function questionGameXp(question: { points?: number | null; difficulty?: string | null; verification_status?: string | null; analytics_eligible?: boolean | null }): number {
  if (question.points === 1 && question.verification_status === 'verified' && question.analytics_eligible) {
    return question.difficulty === 'easy' ? 15 : question.difficulty === 'hard' ? 30 : 20;
  }
  return question.points ?? 20;
}
