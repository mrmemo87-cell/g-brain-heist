const countWords = (text) => {
    const words = text.trim().match(/[A-Za-z0-9']+/g);
    return words ? words.length : 0;
};
const expectedRange = (expectedWordCount) => ({
    min: Math.max(1, Math.floor(expectedWordCount * 0.9)),
    max: Math.ceil(expectedWordCount * 1.1),
});
const hasFormalTone = (text) => /\btherefore|moreover|in conclusion|according to\b/i.test(text);
const hasInformalTone = (text) => /\bhey|cool|awesome|gonna|wanna\b/i.test(text);
const tagStillPresent = (tag, submission, genre) => {
    const text = submission.trim();
    if (tag === 'tense_error')
        return /\b(?:go|eat|play)\s+yesterday\b/i.test(text);
    if (tag === 'agreement_error')
        return /\bi\s+is\b|\bthey\s+was\b|\bhe\s+go\b/i.test(text);
    if (tag === 'weak_paragraphing')
        return text.split(/\n\s*\n/).filter(Boolean).length < 2;
    if (tag === 'poor_sequencing')
        return !/\bfirst|then|however|finally|therefore\b/i.test(text);
    if (tag === 'wrong_tone' || tag === 'weak_register_control') {
        if (genre === 'report' || genre === 'essay')
            return hasInformalTone(text);
        if (genre === 'story')
            return hasFormalTone(text);
    }
    if (tag === 'under_length')
        return countWords(text) < 40;
    return false;
};
const evaluateCriterion = (criterion, submission, genre, wordCountInRange) => {
    const normalized = criterion.toLowerCase();
    let met = false;
    if (normalized.includes('covers all required content points')) {
        met = /\b(because|therefore|suggest|recommend)\b/i.test(submission) && countWords(submission) > 40;
    }
    else if (normalized.includes('paragraphing') || normalized.includes('sequencing')) {
        met = submission.split(/\n\s*\n/).filter(Boolean).length >= 2 || /\bfirst|then|finally|however\b/i.test(submission);
    }
    else if (normalized.includes('tense')) {
        met = !/\b(?:go|eat|play)\s+yesterday\b/i.test(submission);
    }
    else if (normalized.includes('subject–verb') || normalized.includes('subject-verb')) {
        met = !/\bi\s+is\b|\bthey\s+was\b|\bhe\s+go\b/i.test(submission);
    }
    else if (normalized.includes('tone') || normalized.includes('register')) {
        if (genre === 'report' || genre === 'essay')
            met = !hasInformalTone(submission);
        else
            met = true;
    }
    else if (normalized.includes('opening and closing')) {
        met = /\b(dear|hi|hello)\b/i.test(submission) && /\b(regards|sincerely|best wishes)\b/i.test(submission);
    }
    else if (normalized.includes('word range')) {
        met = wordCountInRange;
    }
    else {
        met = countWords(submission) > 20;
    }
    return {
        criterion,
        met,
        comment: met ? 'Met.' : 'Not yet consistent in this area.',
    };
};
const buildFeedback = (metCount, total, next) => {
    if (metCount === total)
        return 'Great work. You met all task checks today—keep this standard tomorrow.';
    if (metCount >= Math.ceil(total * 0.6))
        return `Good progress. You met ${metCount}/${total} checks; focus on one missed point next.`;
    if (next === 'reduce_difficulty')
        return 'This task was heavy today. We will simplify the next step and rebuild control.';
    return `You met ${metCount}/${total} checks. Repeat this skill with tighter focus on the missing criteria.`;
};
const repeatedErrorsUnchanged = (memory, studentId, tags) => {
    const counts = memory.byStudent[studentId]?.tagCounts ?? {};
    return tags.some((tag) => (counts[tag] ?? 0) >= 2);
};
const threeStrongInRow = (memory, studentId, targetTags) => {
    const attempts = memory.byStudent[studentId]?.attempts ?? [];
    if (attempts.length < 3)
        return false;
    const recent = attempts.slice(-3);
    return recent.every((attempt) => targetTags.every((tag) => !attempt.result.weakness_tags.includes(tag)));
};
const mapTaskTypeSkillCheck = (task, criteriaResults) => {
    const met = criteriaResults.filter((item) => item.met).length;
    const ratio = criteriaResults.length === 0 ? 0 : met / criteriaResults.length;
    if (task.task_type === 'full exam-style response')
        return Math.round(ratio * 5);
    if (task.task_type === 'rewrite from feedback')
        return Math.round((ratio * 5 + (met >= 2 ? 1 : 0)) / 1.1);
    return Math.round(ratio * 5);
};
export const evaluateWritingPracticeTask = (input) => {
    const actualWords = countWords(input.student_submission);
    const range = expectedRange(input.daily_task.expected_word_count);
    const withinRange = actualWords >= range.min && actualWords <= range.max;
    const criteriaResults = input.daily_task.success_criteria.map((criterion) => evaluateCriterion(criterion, input.student_submission, input.genre, withinRange));
    const metCount = criteriaResults.filter((item) => item.met).length;
    const failedCount = criteriaResults.length - metCount;
    const targetSkillScore = Math.max(0, Math.min(5, mapTaskTypeSkillCheck(input.daily_task, criteriaResults)));
    const detectedWeakness = input.daily_task.target_tags.filter((tag) => tagStillPresent(tag, input.student_submission, input.genre));
    if ((input.genre === 'report' || input.genre === 'essay') && hasInformalTone(input.student_submission)) {
        if (!detectedWeakness.includes('wrong_tone'))
            detectedWeakness.push('wrong_tone');
        if (!detectedWeakness.includes('weak_register_control'))
            detectedWeakness.push('weak_register_control');
    }
    const detectedImprovement = input.daily_task.target_tags.filter((tag) => !detectedWeakness.includes(tag));
    const completionStatus = metCount >= Math.ceil(criteriaResults.length * 0.75) && withinRange
        ? 'complete'
        : metCount >= Math.ceil(criteriaResults.length * 0.4)
            ? 'partial'
            : 'incomplete';
    let recommendedNextAction = 'move_forward';
    if (failedCount >= 2)
        recommendedNextAction = 'repeat_skill';
    if (completionStatus === 'incomplete' && input.daily_task.support_level === 'low')
        recommendedNextAction = 'reduce_difficulty';
    if ((metCount >= Math.ceil(criteriaResults.length * 0.6) || (input.daily_task.task_mode === 'exam_style' && metCount >= 1)) &&
        threeStrongInRow(input.repeated_error_memory, input.student_id, input.daily_task.target_tags)) {
        recommendedNextAction = 'increase_difficulty';
    }
    if (repeatedErrorsUnchanged(input.repeated_error_memory, input.student_id, detectedWeakness)) {
        recommendedNextAction = recommendedNextAction === 'move_forward' ? 'repeat_skill' : recommendedNextAction;
    }
    if (input.daily_task.task_type === 'rewrite from feedback' && detectedWeakness.length === 0) {
        recommendedNextAction = metCount >= 2 ? 'move_forward' : recommendedNextAction;
    }
    if (['genre convention task', 'guided writing', 'full exam-style response'].includes(input.daily_task.task_type) &&
        detectedWeakness.some((tag) => ['wrong_tone', 'weak_register_control', 'weak_genre_convention'].includes(tag))) {
        recommendedNextAction = 'retry_same_genre';
    }
    return {
        day_number: input.daily_task.day_number,
        task_type: input.daily_task.task_type,
        task_mode: input.daily_task.task_mode,
        completion_status: completionStatus,
        target_skill_score: targetSkillScore,
        success_criteria_results: criteriaResults,
        detected_weakness_tags: detectedWeakness,
        detected_improvement_tags: detectedImprovement,
        word_count_result: {
            expected_min: range.min,
            expected_max: range.max,
            actual: actualWords,
            within_range: withinRange,
        },
        student_friendly_feedback: buildFeedback(metCount, criteriaResults.length, recommendedNextAction),
        memory_update_ready: true,
        recommended_next_action: recommendedNextAction,
    };
};
