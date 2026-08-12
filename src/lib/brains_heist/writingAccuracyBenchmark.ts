import { WritingAssessmentResult, WritingCriterionKey } from './writingAssessment.js';

export interface WritingAccuracyBenchmarkExpectation {
  min_total?: number;
  max_total?: number;
  min_criterion?: Partial<Record<WritingCriterionKey, number>>;
  max_criterion?: Partial<Record<WritingCriterionKey, number>>;
  required_status?: 'verified' | 'needs_review';
}

export interface WritingAccuracyBenchmarkCase {
  id: string;
  category: string;
  grade: number;
  genre: string;
  prompt: string;
  target_word_count: number;
  response: string;
  expectation: WritingAccuracyBenchmarkExpectation;
  teacher_scores?: Partial<Record<WritingCriterionKey, number>>;
}

export interface WritingAccuracyBenchmarkCheck {
  passed: boolean;
  failures: string[];
}

export const evaluateWritingBenchmarkResult = (
  benchmark: WritingAccuracyBenchmarkCase,
  assessment: WritingAssessmentResult
): WritingAccuracyBenchmarkCheck => {
  const failures: string[] = [];
  const expectation = benchmark.expectation;
  if (expectation.min_total !== undefined && assessment.total_score < expectation.min_total) {
    failures.push(`total ${assessment.total_score} is below ${expectation.min_total}`);
  }
  if (expectation.max_total !== undefined && assessment.total_score > expectation.max_total) {
    failures.push(`total ${assessment.total_score} is above ${expectation.max_total}`);
  }
  const scoreByCriterion: Record<WritingCriterionKey, number> = {
    content: assessment.subscores.content,
    communicative_achievement: assessment.subscores.communicative_achievement ?? 0,
    organisation: assessment.subscores.organisation,
    language: assessment.subscores.language,
  };
  for (const [criterion, minimum] of Object.entries(expectation.min_criterion ?? {})) {
    const key = criterion as WritingCriterionKey;
    if (scoreByCriterion[key] < Number(minimum)) failures.push(`${key} is below ${minimum}`);
  }
  for (const [criterion, maximum] of Object.entries(expectation.max_criterion ?? {})) {
    const key = criterion as WritingCriterionKey;
    if (scoreByCriterion[key] > Number(maximum)) failures.push(`${key} is above ${maximum}`);
  }
  if (expectation.required_status && assessment.assessment_status !== expectation.required_status) {
    failures.push(`status ${assessment.assessment_status ?? 'missing'} is not ${expectation.required_status}`);
  }
  return { passed: failures.length === 0, failures };
};

export const writingTeacherAgreementError = (
  benchmark: WritingAccuracyBenchmarkCase,
  assessment: WritingAssessmentResult
): Partial<Record<WritingCriterionKey, number>> => {
  const teacherScores = benchmark.teacher_scores ?? {};
  const automated: Record<WritingCriterionKey, number> = {
    content: assessment.subscores.content,
    communicative_achievement: assessment.subscores.communicative_achievement ?? 0,
    organisation: assessment.subscores.organisation,
    language: assessment.subscores.language,
  };
  return Object.fromEntries(
    Object.entries(teacherScores).map(([criterion, score]) => [
      criterion,
      Math.abs(automated[criterion as WritingCriterionKey] - Number(score)),
    ])
  );
};
