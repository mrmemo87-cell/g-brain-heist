import { SubjectProgress, RecommendedDifficulty, SoloDifficulty } from '../../types';

/**
 * Determines the recommended difficulty for a subject based on NEW, UNREWARDED questions.
 * 
 * Logic:
 * - If Easy has new questions (not yet rewarded), recommend Easy
 * - Else if Medium has new questions, recommend Medium  
 * - Else if Hard has new questions, recommend Hard
 * - Otherwise, mark as "done" (all questions have been rewarded)
 * 
 * @param subject - Subject progress data with easy/medium/hard stats
 * @returns The recommended difficulty level or "done"
 */
export function getRecommendedDifficulty(subject: SubjectProgress): RecommendedDifficulty {
  const easyLeft = subject.easy.newLeft > 0;
  const mediumLeft = subject.medium.newLeft > 0;
  const hardLeft = subject.hard.newLeft > 0;

  if (easyLeft) return 'easy';
  if (mediumLeft) return 'medium';
  if (hardLeft) return 'hard';
  return 'done';
}

/**
 * Returns Tailwind CSS classes for styling based on recommended difficulty.
 */
export const difficultyColorClasses: Record<RecommendedDifficulty, string> = {
  easy: 'border-green-400 shadow-[0_0_25px_rgba(34,197,94,0.6)] hover:border-green-300',
  medium: 'border-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.6)] hover:border-amber-300',
  hard: 'border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.7)] hover:border-rose-400',
  done: 'border-slate-600 opacity-70 hover:border-slate-500'
};

/**
 * Returns display text for the recommended difficulty label.
 */
export function getRecommendedLabel(recommended: RecommendedDifficulty): string {
  if (recommended === 'done') return 'All questions completed';
  return `Focus: ${recommended.charAt(0).toUpperCase() + recommended.slice(1)}`;
}

/**
 * Checks if a student has completed enough warm-up questions before attempting Hard.
 * Used for soft guardrails (not blocking, just advisory).
 * Based on questions that have been rewarded (not just practiced).
 */
export function hasMinimumWarmup(subject: SubjectProgress): boolean {
  return subject.easy.answeredWithRewards >= 5 || subject.medium.answeredWithRewards >= 3;
}

/**
 * Returns reward preview for a given difficulty level.
 * These are base values - actual rewards may vary by question.
 */
export function getRewardPreview(difficulty: SoloDifficulty): { xp: number; coins: number } {
  switch (difficulty) {
    case 'easy':
      return { xp: 10, coins: 15 };
    case 'medium':
      return { xp: 15, coins: 22 };
    case 'hard':
      return { xp: 25, coins: 35 };
  }
}
