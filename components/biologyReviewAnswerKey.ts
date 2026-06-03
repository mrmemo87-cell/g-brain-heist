import { BIOLOGY_MASTER_ANSWER_KEY } from './biologyMasterAnswerKey.js';

export const BIOLOGY_MASTER_ANSWER_SOURCE = 'BIOLOGY_MASTER_ANSWER_KEY';

type SavedAnswersPayload = {
  responses?: unknown;
  question_keys?: Record<string, unknown>;
  answer_source?: unknown;
  missing_answer_keys?: unknown;
};

export type BiologyAnswerKeyResult = {
  answerKey: Record<number, string>;
  hasMetadata: boolean;
  missingKeys: string[];
};

export const parseSavedAnswersPayload = (answers: unknown): SavedAnswersPayload => {
  if (!answers) return {};
  if (typeof answers === 'string') {
    try {
      const parsed = JSON.parse(answers);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof answers === 'object' ? answers as SavedAnswersPayload : {};
};

export const isBiologyCambridgeQuiz = (quizName?: string | null) =>
  (quizName || '').toLowerCase().includes('biology');

export const buildBiologyAnswerKeyFromSavedMetadata = (answers: unknown): BiologyAnswerKeyResult => {
  const payload = parseSavedAnswersPayload(answers);
  const questionKeys = payload.question_keys;

  if (!questionKeys || typeof questionKeys !== 'object') {
    return { answerKey: {}, hasMetadata: false, missingKeys: [] };
  }

  const answerKey: Record<number, string> = {};
  const missingKeys: string[] = [];

  Object.entries(questionKeys).forEach(([questionNumber, rawKey]) => {
    const numericQuestion = Number(questionNumber);
    const key = String(rawKey || '').trim();
    if (!Number.isInteger(numericQuestion) || numericQuestion < 1 || !key) return;

    const answer = BIOLOGY_MASTER_ANSWER_KEY[key];
    if (answer) {
      answerKey[numericQuestion] = answer;
    } else {
      missingKeys.push(key);
    }
  });

  if (missingKeys.length > 0) {
    return { answerKey: {}, hasMetadata: Object.keys(questionKeys).length > 0, missingKeys };
  }

  return { answerKey, hasMetadata: Object.keys(questionKeys).length > 0, missingKeys };
};
