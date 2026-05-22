export interface RawScoreInput {
  rawScore?: number | null;
  totalQuestions?: number | null;
  percent?: number | null;
  estBand?: number | null;
}

export interface NormalizedRawScore {
  raw_score: number;
  total_questions: number;
  percent: number;
  est_band: number;
}

export interface RawScoreResult {
  correct: number;
  total: number;
  percentage: number;
  bandScore: number;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100;

const roundToHalfBand = (value: number): number => Math.round(value * 2) / 2;


const normalizeComparableAnswer = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const parsePossibleJsonArray = (value: string): string[] | null => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item ?? ''));
    }
  } catch {
    return null;
  }

  return null;
};

export const doesAnswerMatchCorrectAnswer = (studentAnswer: unknown, correctAnswer: unknown): boolean => {
  const normalizedStudentAnswer = normalizeComparableAnswer(studentAnswer);
  if (normalizedStudentAnswer.length === 0) {
    return false;
  }

  let acceptedAnswers: string[] = [];

  if (Array.isArray(correctAnswer)) {
    acceptedAnswers = correctAnswer.map((item) => String(item ?? ''));
  } else if (typeof correctAnswer === 'string') {
    const parsedArray = parsePossibleJsonArray(correctAnswer);
    acceptedAnswers = parsedArray ?? [correctAnswer];
  } else if (correctAnswer == null) {
    acceptedAnswers = [];
  } else {
    acceptedAnswers = [String(correctAnswer)];
  }

  return acceptedAnswers
    .map((answer) => normalizeComparableAnswer(answer))
    .filter((answer) => answer.length > 0)
    .some((answer) => answer === normalizedStudentAnswer);
};

export const estimateIeltsBandFromPercent = (percentage: number): number => {
  const normalizedPercentage = isFiniteNumber(percentage) ? percentage : 0;
  if (normalizedPercentage >= 90) return 8.5;
  if (normalizedPercentage >= 80) return 7.5;
  if (normalizedPercentage >= 70) return 6.5;
  if (normalizedPercentage >= 60) return 5.5;
  if (normalizedPercentage >= 50) return 5.0;
  return 4.5;
};

export const normalizeIeltsRawScore = (input: RawScoreInput): NormalizedRawScore | null => {
  if (!isFiniteNumber(input.rawScore)) {
    return null;
  }

  const rawScore = Math.max(0, Math.round(input.rawScore));
  const totalQuestions = isFiniteNumber(input.totalQuestions) ? Math.max(0, Math.round(input.totalQuestions)) : 0;
  if (totalQuestions <= 0) {
    return null;
  }

  const boundedRawScore = Math.min(rawScore, totalQuestions);
  const derivedPercent = roundToTwoDecimals((boundedRawScore / totalQuestions) * 100);
  const percent = isFiniteNumber(input.percent) ? roundToTwoDecimals(Math.min(100, Math.max(0, input.percent))) : derivedPercent;
  const estBand = isFiniteNumber(input.estBand) ? roundToHalfBand(Math.min(9, Math.max(0, input.estBand))) : estimateIeltsBandFromPercent(percent);

  return {
    raw_score: boundedRawScore,
    total_questions: totalQuestions,
    percent,
    est_band: estBand,
  };
};

export const toRawScoreResult = (rawScore: number, totalQuestions: number): RawScoreResult => {
  const normalized = normalizeIeltsRawScore({ rawScore, totalQuestions });
  if (!normalized) {
    return { correct: 0, total: 0, percentage: 0, bandScore: estimateIeltsBandFromPercent(0) };
  }

  return {
    correct: normalized.raw_score,
    total: normalized.total_questions,
    percentage: normalized.percent,
    bandScore: normalized.est_band,
  };
};

export const normalizeIeltsBand = (band?: number | null): number | null => {
  if (!isFiniteNumber(band)) {
    return null;
  }
  return roundToHalfBand(Math.min(9, Math.max(0, band)));
};

export const buildReadingAttemptPayload = (basePayload: Record<string, unknown>, score: RawScoreInput): Record<string, unknown> => {
  const normalizedScore = normalizeIeltsRawScore(score);
  return {
    ...basePayload,
    ...(normalizedScore ?? {}),
  };
};

export const buildListeningAttemptPayload = (basePayload: Record<string, unknown>, score: RawScoreInput): Record<string, unknown> => {
  const normalizedScore = normalizeIeltsRawScore(score);
  return {
    ...basePayload,
    ...(normalizedScore ?? {}),
  };
};

export const buildWritingAttemptPayload = (
  basePayload: Record<string, unknown>,
  score: { bandOverall?: number | null } = {},
): Record<string, unknown> => {
  const bandOverall = normalizeIeltsBand(score.bandOverall);
  return {
    review_status: 'pending',
    ...basePayload,
    ...(bandOverall === null ? {} : { band_overall: bandOverall }),
  };
};

export const buildSpeakingAttemptPayload = (
  basePayload: Record<string, unknown>,
  score: { bandOverall?: number | null } = {},
): Record<string, unknown> => {
  const bandOverall = normalizeIeltsBand(score.bandOverall);
  return {
    ...basePayload,
    ...(bandOverall === null ? {} : { band_overall: bandOverall }),
  };
};
