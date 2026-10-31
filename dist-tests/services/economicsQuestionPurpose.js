/** Assessment roles guide selection; server-side provenance determines eligibility. */
export function isReservedReassessmentQuestion(question) {
    return Boolean(question.tags?.includes('purpose:reassessment'));
}
export function questionPurposeLabel(question) {
    if (isReservedReassessmentQuestion(question))
        return 'Reassessment candidate';
    if (question.tags?.includes('purpose:practice'))
        return 'Targeted practice';
    return null;
}
