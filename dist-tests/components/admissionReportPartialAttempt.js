import React from 'react';
const firstNumeric = (...values) => {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value))
            return value;
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed))
                return parsed;
        }
    }
    return null;
};
export const resolveAdmissionReportPartialAttempt = (report) => {
    const answers = Array.isArray(report?.answers) ? report.answers : [];
    const rawAttempt = report?.['attempt'];
    const answeredCount = firstNumeric(report?.['answeredCount'], report?.answered_count, answers.length) ?? 0;
    const totalQuestions = firstNumeric(report?.['totalQuestions'], report?.total_questions, report?.['totalQuestionCount'], rawAttempt?.['total_questions'], report?.['maxScore'], report?.max_score, rawAttempt?.['max_score'], answeredCount) ?? answeredCount;
    const totalScore = firstNumeric(report?.['totalScore'], report?.total_score, rawAttempt?.['total_score']);
    const answeredQuestionAccuracy = firstNumeric(report?.['answeredQuestionAccuracy'], report?.answered_question_accuracy)
        ?? (answeredCount > 0 && totalScore != null ? Math.round((totalScore / answeredCount) * 100) : null);
    const partialAttempt = answeredCount > 0 && totalQuestions > answeredCount;
    return { answeredCount, totalQuestions, totalScore, answeredQuestionAccuracy, partialAttempt };
};
export const resolveAdmissionReportVisiblePartialAttempt = ({ totalScore, totalQuestions, answeredCount, }) => {
    const resolvedTotalScore = firstNumeric(totalScore);
    const resolvedTotalQuestions = firstNumeric(totalQuestions) ?? 0;
    const resolvedAnsweredCount = firstNumeric(answeredCount) ?? 0;
    const answeredQuestionAccuracy = resolvedAnsweredCount > 0 && resolvedTotalScore != null
        ? Math.round((resolvedTotalScore / resolvedAnsweredCount) * 100)
        : null;
    return {
        answeredCount: resolvedAnsweredCount,
        totalQuestions: resolvedTotalQuestions,
        totalScore: resolvedTotalScore,
        answeredQuestionAccuracy,
        partialAttempt: resolvedAnsweredCount > 0 && resolvedTotalQuestions > resolvedAnsweredCount,
    };
};
export const AdmissionReportPartialAttemptNotice = ({ metrics }) => {
    if (!metrics.partialAttempt)
        return null;
    return React.createElement('div', { className: 'rounded-xl border border-sky-500/30 bg-sky-900/10 p-3 text-xs text-sky-100' }, `Answered ${metrics.answeredCount} of ${metrics.totalQuestions} questions. Unanswered questions were marked incorrect.`, React.createElement('span', { className: 'block mt-1 text-sky-100/80' }, 'This result is based on a partial attempt.'), metrics.answeredQuestionAccuracy != null
        ? React.createElement('span', { className: 'block mt-1 text-sky-100/70' }, `Answered-question accuracy: ${metrics.answeredQuestionAccuracy}%`)
        : null);
};
