import { BIOLOGY_MASTER_ANSWER_KEY } from './biologyMasterAnswerKey.js';
export const BIOLOGY_MASTER_ANSWER_SOURCE = 'BIOLOGY_MASTER_ANSWER_KEY';
export const parseSavedAnswersPayload = (answers) => {
    if (!answers)
        return {};
    if (typeof answers === 'string') {
        try {
            const parsed = JSON.parse(answers);
            return parsed && typeof parsed === 'object' ? parsed : {};
        }
        catch {
            return {};
        }
    }
    return typeof answers === 'object' ? answers : {};
};
export const isBiologyCambridgeQuiz = (quizName) => (quizName || '').toLowerCase().includes('biology');
export const buildBiologyAnswerKeyFromSavedMetadata = (answers) => {
    const payload = parseSavedAnswersPayload(answers);
    const questionKeys = payload.question_keys;
    if (!questionKeys || typeof questionKeys !== 'object') {
        return { answerKey: {}, hasMetadata: false, missingKeys: [] };
    }
    const answerKey = {};
    const missingKeys = [];
    Object.entries(questionKeys).forEach(([questionNumber, rawKey]) => {
        const numericQuestion = Number(questionNumber);
        const key = String(rawKey || '').trim();
        if (!Number.isInteger(numericQuestion) || numericQuestion < 1 || !key)
            return;
        const answer = BIOLOGY_MASTER_ANSWER_KEY[key];
        if (answer) {
            answerKey[numericQuestion] = answer;
        }
        else {
            missingKeys.push(key);
        }
    });
    if (missingKeys.length > 0) {
        return { answerKey: {}, hasMetadata: Object.keys(questionKeys).length > 0, missingKeys };
    }
    return { answerKey, hasMetadata: Object.keys(questionKeys).length > 0, missingKeys };
};
