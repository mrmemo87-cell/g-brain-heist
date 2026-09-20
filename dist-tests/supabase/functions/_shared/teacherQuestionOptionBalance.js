const normalizedAnswer = (value) => value.trim().toLowerCase();
const stableHash32 = (value) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};
const shuffledBalancedTargets = (questionCount, optionCount, seed) => {
    const offset = stableHash32(`${seed}|offset|${optionCount}|${questionCount}`) % optionCount;
    const targets = Array.from({ length: questionCount }, (_, index) => (index + offset) % optionCount);
    let state = stableHash32(`${seed}|shuffle|${optionCount}|${questionCount}`) || 0x9e3779b9;
    const nextRandom = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
    };
    for (let index = targets.length - 1; index > 0; index -= 1) {
        const swapIndex = nextRandom() % (index + 1);
        [targets[index], targets[swapIndex]] = [targets[swapIndex], targets[index]];
    }
    return targets;
};
const findCorrectOptionIndex = (question) => {
    const answer = normalizedAnswer(question.correct_answer);
    if (!answer)
        return -1;
    return question.options.findIndex((option) => normalizedAnswer(option) === answer);
};
/**
 * Repositions the correct option for AI-generated multiple-choice questions only.
 *
 * Questions are grouped by option count so every available answer position is used
 * as evenly as mathematically possible. The target positions are then shuffled with
 * a stable seeded PRNG, avoiding a visible A/B/C/D cycle while remaining reproducible.
 * Extracted source questions, true/false questions, short-answer questions, and
 * malformed generated MCQs are intentionally left unchanged.
 */
export const balanceGeneratedMultipleChoiceOptions = (questions, seed) => {
    const balanced = questions.map((question) => ({
        ...question,
        options: [...question.options],
    }));
    const groups = new Map();
    balanced.forEach((question, questionIndex) => {
        if (question.candidate_origin !== 'ai_generated_from_source')
            return;
        if (question.question_type !== 'multiple_choice')
            return;
        if (question.options.length < 2 || question.options.length > 6)
            return;
        if (findCorrectOptionIndex(question) < 0)
            return;
        const group = groups.get(question.options.length) ?? [];
        group.push(questionIndex);
        groups.set(question.options.length, group);
    });
    for (const [optionCount, questionIndexes] of groups.entries()) {
        const targets = shuffledBalancedTargets(questionIndexes.length, optionCount, seed);
        questionIndexes.forEach((questionIndex, groupIndex) => {
            const question = balanced[questionIndex];
            const currentCorrectIndex = findCorrectOptionIndex(question);
            const targetCorrectIndex = targets[groupIndex];
            if (currentCorrectIndex < 0 || currentCorrectIndex === targetCorrectIndex)
                return;
            [question.options[currentCorrectIndex], question.options[targetCorrectIndex]] = [
                question.options[targetCorrectIndex],
                question.options[currentCorrectIndex],
            ];
        });
    }
    return balanced;
};
export const generatedMultipleChoiceAnswerPositionCounts = (questions) => {
    const groups = new Map();
    for (const question of questions) {
        if (question.candidate_origin !== 'ai_generated_from_source')
            continue;
        if (question.question_type !== 'multiple_choice')
            continue;
        if (question.options.length < 2 || question.options.length > 6)
            continue;
        const correctIndex = findCorrectOptionIndex(question);
        if (correctIndex < 0)
            continue;
        const counts = groups.get(question.options.length)
            ?? Array.from({ length: question.options.length }, () => 0);
        counts[correctIndex] += 1;
        groups.set(question.options.length, counts);
    }
    return groups;
};
export const hasBalancedGeneratedMultipleChoiceAnswers = (questions) => {
    for (const counts of generatedMultipleChoiceAnswerPositionCounts(questions).values()) {
        if (counts.length === 0)
            continue;
        const highest = Math.max(...counts);
        const lowest = Math.min(...counts);
        if (highest - lowest > 1)
            return false;
    }
    return true;
};
