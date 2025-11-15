export interface PvpQuestionInput {
  answerTimeSeconds: number;
  wasCorrect: boolean;
}

export interface PvpQuestionScoreBreakdown {
  baseScore: number;
  speedBonus: number;
  comboBonus: number;
  total: number;
  streakCount: number;
  answerTimeSeconds: number;
  wasCorrect: boolean;
}

export interface PvpParticipantBreakdown {
  totalScore: number;
  totalComboBonus: number;
  averageResponseTime: number;
  questions: PvpQuestionScoreBreakdown[];
}

export type PvpBattleWinner = 'PLAYER' | 'OPPONENT' | 'TIE';

export type PvpBattleResolutionReason = 'SCORE' | 'COMBO' | 'TIME' | 'SUDDEN_DEATH';

export interface PvpBattleResult {
  winner: PvpBattleWinner;
  reason: PvpBattleResolutionReason;
  player: PvpParticipantBreakdown;
  opponent: PvpParticipantBreakdown;
}

export interface PvpBattleOptions {
  suddenDeathWinner?: PvpBattleWinner;
}

const PVP_BASE_SCORE = 70;

const calculateSpeedBonus = (answerTimeSeconds: number): number => {
  const raw = 20 - 0.5 * answerTimeSeconds;
  return Math.max(0, raw);
};

const calculateComboBonus = (streak: number): number => {
  if (streak <= 1) return 0;
  return 15 * (streak - 1);
};

export const calculatePvpQuestionScore = (
  answerTimeSeconds: number,
  streak: number,
  wasCorrect: boolean
): PvpQuestionScoreBreakdown => {
  if (!wasCorrect) {
    return {
      baseScore: 0,
      speedBonus: 0,
      comboBonus: 0,
      total: 0,
      streakCount: streak,
      answerTimeSeconds,
      wasCorrect: false,
    };
  }

  const speedBonus = calculateSpeedBonus(answerTimeSeconds);
  const comboBonus = calculateComboBonus(streak);
  const total = PVP_BASE_SCORE + speedBonus + comboBonus;

  return {
    baseScore: PVP_BASE_SCORE,
    speedBonus,
    comboBonus,
    total,
    streakCount: streak,
    answerTimeSeconds,
    wasCorrect: true,
  };
};

const evaluateParticipant = (questions: PvpQuestionInput[]): PvpParticipantBreakdown => {
  const breakdown: PvpQuestionScoreBreakdown[] = [];
  let currentStreak = 0;

  questions.forEach((question) => {
    currentStreak = question.wasCorrect ? currentStreak + 1 : 0;
    breakdown.push(
      calculatePvpQuestionScore(question.answerTimeSeconds, currentStreak, question.wasCorrect)
    );
  });

  const totalScore = breakdown.reduce((sum, item) => sum + item.total, 0);
  const totalComboBonus = breakdown.reduce((sum, item) => sum + item.comboBonus, 0);
  const averageResponseTime = questions.length
    ? questions.reduce((sum, item) => sum + item.answerTimeSeconds, 0) / questions.length
    : 0;

  return {
    totalScore,
    totalComboBonus,
    averageResponseTime,
    questions: breakdown,
  };
};

export const calculatePvpBattleResult = (
  playerQuestions: PvpQuestionInput[],
  opponentQuestions: PvpQuestionInput[],
  options: PvpBattleOptions = {}
): PvpBattleResult => {
  const player = evaluateParticipant(playerQuestions);
  const opponent = evaluateParticipant(opponentQuestions);

  if (player.totalScore > opponent.totalScore) {
    return { winner: 'PLAYER', reason: 'SCORE', player, opponent };
  }

  if (player.totalScore < opponent.totalScore) {
    return { winner: 'OPPONENT', reason: 'SCORE', player, opponent };
  }

  if (player.totalComboBonus > opponent.totalComboBonus) {
    return { winner: 'PLAYER', reason: 'COMBO', player, opponent };
  }

  if (player.totalComboBonus < opponent.totalComboBonus) {
    return { winner: 'OPPONENT', reason: 'COMBO', player, opponent };
  }

  if (player.averageResponseTime < opponent.averageResponseTime) {
    return { winner: 'PLAYER', reason: 'TIME', player, opponent };
  }

  if (player.averageResponseTime > opponent.averageResponseTime) {
    return { winner: 'OPPONENT', reason: 'TIME', player, opponent };
  }

  if (options.suddenDeathWinner && options.suddenDeathWinner !== 'TIE') {
    return { winner: options.suddenDeathWinner, reason: 'SUDDEN_DEATH', player, opponent };
  }

  return { winner: 'TIE', reason: 'SUDDEN_DEATH', player, opponent };
};
