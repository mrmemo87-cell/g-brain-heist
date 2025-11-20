export type QuestionId = string;
export type PlayerId = string;

export enum QuestionDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

export enum QuestionRiskRoute {
  SAFE = 'SAFE',
  RISKY = 'RISKY',
  INSANE = 'INSANE',
}

export interface Question {
  id: QuestionId;
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: QuestionDifficulty;
  tags?: string[];
  explanation?: string;
  source?: string;
}

export interface QuestionBank {
  questions: Question[];
  byId: Record<QuestionId, Question>;
  order: QuestionId[];
}

const normalizeQuestion = (question: Question): Question => {
  const { options, correctIndex } = question;
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`Question ${question.id} must include at least one option.`);
  }
  if (correctIndex < 0 || correctIndex >= options.length) {
    throw new Error(`Question ${question.id} has an out-of-range correctIndex.`);
  }
  return { ...question, options: [...options] };
};

const hashPlayerId = (playerId: PlayerId, modulus: number): number => {
  const total = Array.from(playerId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return modulus === 0 ? 0 : total % modulus;
};

export const createQuestionBank = (questions: Question[]): QuestionBank => {
  const byId: Record<QuestionId, Question> = {};
  const order: QuestionId[] = [];

  questions.forEach((question) => {
    const normalized = normalizeQuestion(question);
    if (byId[normalized.id]) {
      throw new Error(`Duplicate question id detected: ${normalized.id}`);
    }
    byId[normalized.id] = normalized;
    order.push(normalized.id);
  });

  return { questions: order.map((id) => byId[id]), byId, order };
};

export const getRiskRouteForQuestion = (question: Question): QuestionRiskRoute => {
  switch (question.difficulty) {
    case QuestionDifficulty.EASY:
      return QuestionRiskRoute.SAFE;
    case QuestionDifficulty.MEDIUM:
      return QuestionRiskRoute.RISKY;
    case QuestionDifficulty.HARD:
    default:
      return QuestionRiskRoute.INSANE;
  }
};

export const getNextQuestion = (
  bank: QuestionBank,
  roundNumber: number,
  playerId?: PlayerId
): Question | null => {
  if (bank.questions.length === 0 || roundNumber <= 0) {
    return null;
  }

  const baseIndex = (roundNumber - 1) % bank.questions.length;
  const playerOffset = playerId ? hashPlayerId(playerId, bank.questions.length) : 0;
  const index = (baseIndex + playerOffset) % bank.questions.length;
  return bank.questions[index] ?? null;
};

export const demoQuestions: Question[] = [
  {
    id: 'ldc-001',
    prompt: 'What is the primary goal in Lockdown Countdown?',
    options: ['Collect keys', 'Defuse the device', 'Unlock avatars', 'Capture the flag'],
    correctIndex: 1,
    difficulty: QuestionDifficulty.EASY,
    tags: ['gameplay'],
  },
  {
    id: 'ldc-002',
    prompt: 'Which item extends the timer the most?',
    options: ['Time crystal', 'Recharge battery', 'Signal booster', 'Holo-map'],
    correctIndex: 0,
    difficulty: QuestionDifficulty.MEDIUM,
    tags: ['items'],
  },
  {
    id: 'ldc-003',
    prompt: 'How many players can join a Lockdown Countdown squad?',
    options: ['2', '3', '4', '6'],
    correctIndex: 2,
    difficulty: QuestionDifficulty.MEDIUM,
    tags: ['multiplayer'],
  },
  {
    id: 'ldc-004',
    prompt: 'What happens if all risk routes are exhausted?',
    options: ['Game ends instantly', 'Routes reset to SAFE', 'Overtime mode begins', 'Players lose all progress'],
    correctIndex: 2,
    difficulty: QuestionDifficulty.HARD,
    tags: ['rules'],
  },
];
