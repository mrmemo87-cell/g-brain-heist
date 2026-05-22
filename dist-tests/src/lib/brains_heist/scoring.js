const BASE_SCORES = {
    easy: 60,
    medium: 80,
    hard: 100,
};
const DIFFICULTY_MULTIPLIERS = {
    easy: 1,
    medium: 1.25,
    hard: 1.5,
};
const clamp = (value, min, max) => {
    if (value < min)
        return min;
    if (value > max)
        return max;
    return value;
};
export const calculateSoloQuestionScore = (input) => {
    const timeLimit = Math.max(1, input.timeLimitSeconds);
    const base = BASE_SCORES[input.difficulty];
    const multiplier = DIFFICULTY_MULTIPLIERS[input.difficulty];
    const effectiveBase = base * multiplier;
    if (!input.wasCorrect) {
        return {
            difficulty: input.difficulty,
            baseScore: base,
            difficultyMultiplier: multiplier,
            effectiveBase,
            speedBonus: 0,
            streakBonus: 0,
            total: 0,
            streakCount: input.streakCount,
            wasCorrect: false,
            answerTimeSeconds: input.answerTimeSeconds,
            timeLimitSeconds: timeLimit,
        };
    }
    const timeRatio = input.answerTimeSeconds / timeLimit;
    const rawSpeed = 40 - 40 * timeRatio;
    const speedBonus = clamp(rawSpeed, 0, 40);
    const rawStreakBonus = 10 * Math.max(0, input.streakCount - 2);
    const streakBonus = clamp(rawStreakBonus, 0, Number.POSITIVE_INFINITY);
    const total = effectiveBase + speedBonus + streakBonus;
    return {
        difficulty: input.difficulty,
        baseScore: base,
        difficultyMultiplier: multiplier,
        effectiveBase,
        speedBonus,
        streakBonus,
        total,
        streakCount: input.streakCount,
        wasCorrect: true,
        answerTimeSeconds: input.answerTimeSeconds,
        timeLimitSeconds: timeLimit,
    };
};
export const calculateMissionScore = (questions) => questions.reduce((sum, question) => sum + question.total, 0);
export const buildMissionSummary = (topicId, branchId, difficulty, performances, missionScore) => {
    const questionCount = performances.length;
    const correctCount = performances.filter((item) => item.wasCorrect).length;
    const accuracy = questionCount > 0 ? correctCount / questionCount : 0;
    const accumulatedTime = performances.reduce((total, item) => total + item.answerTimeSeconds, 0);
    const accumulatedLimit = performances.reduce((total, item) => total + item.timeLimitSeconds, 0);
    const avgTimeRatio = accumulatedLimit > 0 ? accumulatedTime / accumulatedLimit : 0;
    return {
        topicId,
        branchId,
        difficulty,
        questionCount,
        correctCount,
        missionScore,
        accuracy,
        avgTimeRatio,
        recordedAt: new Date().toISOString(),
    };
};
export const normalizeDifficulty = (value) => {
    if (!value)
        return 'medium';
    const formatted = value.toLowerCase();
    if (formatted === 'easy')
        return 'easy';
    if (formatted === 'hard')
        return 'hard';
    return 'medium';
};
