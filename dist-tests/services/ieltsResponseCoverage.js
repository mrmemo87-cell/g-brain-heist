export function responseCoverage(answered, total) {
    if (typeof answered !== 'number' || typeof total !== 'number'
        || !Number.isInteger(answered) || !Number.isInteger(total)
        || total < 1 || answered < 0 || answered > total)
        return 'unknown';
    return answered === 0 ? 'empty' : answered < total ? 'partial' : 'complete';
}
export function coverageLabel(coverage) {
    return coverage === 'empty' ? 'No assessment evidence'
        : coverage === 'partial' ? 'Incomplete evidence'
            : coverage === 'complete' ? 'All questions answered' : 'Response coverage unavailable';
}
export function coverageNextStep(coverage, fallback) {
    return coverage === 'empty'
        ? 'No answers were recorded. This does not show your reading or listening ability. Ask your teacher to arrange a supervised fresh check; you can complete the other available screeners meanwhile.'
        : coverage === 'partial'
            ? 'Some questions were unanswered. Ask your teacher to review the missing evidence and arrange a fresh check. Continue with the other available screeners; repeating the same questions is practice, not an independent check.'
            : coverage === 'unknown'
                ? 'Your saved record needs a response-coverage check before it can be interpreted. Ask your teacher for help.' : fallback;
}
