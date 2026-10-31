import { IELTS_WRITING_CRITERIA } from './ieltsWritingScreener.js';
export function isWritingObservationComplete(value) {
    return value.comment.trim().length >= 20 && (value.status === 'insufficient_evidence' || value.evidence.length > 0);
}
export function getWritingReviewReadiness(observations, nextStep, delivery, incidentCount) {
    const incomplete = IELTS_WRITING_CRITERIA.find(({ key }) => !isWritingObservationComplete(observations[key]));
    const completed = IELTS_WRITING_CRITERIA.filter(({ key }) => isWritingObservationComplete(observations[key])).length;
    return {
        completed,
        incompleteCriterion: incomplete?.key ?? null,
        message: incomplete ? `Finish ${incomplete.label}: add a clear note and an excerpt when needed.`
            : nextStep.trim().length < 10 ? 'Add one practical next step for the student.'
                : incidentCount > 0 && delivery.trim().length < 10 ? 'Add a note about the recorded interruptions before sharing feedback.' : null,
    };
}
