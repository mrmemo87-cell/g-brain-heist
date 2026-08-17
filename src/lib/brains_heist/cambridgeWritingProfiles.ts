import type { SupportedGenre, WritingCriterionKey } from './writingAssessment.js';

export const CAMBRIDGE_WRITING_BANK_VERSION = 'cambridge-esl-writing-bank-v1' as const;
export const CAMBRIDGE_WRITING_RUBRIC_VERSION = 'cambridge-esl-writing-rubric-v1' as const;

export interface CambridgeWritingProfile {
  grade: number;
  stage: number | null;
  programme: 'Cambridge Primary English as a Second Language' | 'Cambridge Lower Secondary English as a Second Language' | 'Cambridge IGCSE English as a Second Language';
  syllabus_code: '0057' | '0876' | '0510';
  syllabus_year: '2024-2026' | null;
  framework_version: 'teaching-from-2021' | 'syllabus-2024-2026';
  minimum_word_count: number;
  target_word_count: number;
  maximum_word_count: number;
  time_limit_seconds: number;
  rubric_version: typeof CAMBRIDGE_WRITING_RUBRIC_VERSION;
  criterion_max_scores: Record<WritingCriterionKey, 5>;
}

const WORD_RULES: Record<number, readonly [number, number, number, number]> = {
  1: [15, 25, 40, 15], 2: [25, 40, 60, 18], 3: [40, 60, 80, 20],
  4: [55, 80, 105, 25], 5: [70, 100, 130, 30], 6: [85, 120, 150, 35],
  7: [100, 130, 160, 35], 8: [110, 145, 180, 40], 9: [120, 160, 200, 45],
  10: [120, 140, 160, 30], 11: [120, 140, 160, 30], 12: [120, 140, 160, 30],
};

export const getCambridgeWritingProfile = (grade: number, _genre?: SupportedGenre): CambridgeWritingProfile => {
  const normalizedGrade = Math.min(12, Math.max(1, Math.round(grade)));
  const [minimum, target, maximum, minutes] = WORD_RULES[normalizedGrade];
  const programme = normalizedGrade <= 6
    ? 'Cambridge Primary English as a Second Language'
    : normalizedGrade <= 9
      ? 'Cambridge Lower Secondary English as a Second Language'
      : 'Cambridge IGCSE English as a Second Language';
  return {
    grade: normalizedGrade,
    stage: normalizedGrade <= 9 ? normalizedGrade : null,
    programme,
    syllabus_code: normalizedGrade <= 6 ? '0057' : normalizedGrade <= 9 ? '0876' : '0510',
    syllabus_year: normalizedGrade <= 9 ? null : '2024-2026',
    framework_version: normalizedGrade <= 9 ? 'teaching-from-2021' : 'syllabus-2024-2026',
    minimum_word_count: minimum, target_word_count: target, maximum_word_count: maximum,
    time_limit_seconds: minutes * 60,
    rubric_version: CAMBRIDGE_WRITING_RUBRIC_VERSION,
    criterion_max_scores: { content: 5, communicative_achievement: 5, organisation: 5, language: 5 },
  };
};

export const isOfficialIgcseWritingGenre = (genre: SupportedGenre): boolean =>
  ['email', 'article', 'review', 'essay', 'report'].includes(genre);

export const getCambridgeWritingTaskLabel = (grade: number, genre: SupportedGenre): string => {
  const profile = getCambridgeWritingProfile(grade, genre);
  if (profile.syllabus_code === '0510' && !isOfficialIgcseWritingGenre(genre)) {
    return `${profile.programme} (${profile.syllabus_code}) aligned skill task`;
  }
  return `${profile.programme} (${profile.syllabus_code})`;
};
