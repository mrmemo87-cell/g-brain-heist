/**
 * The question RPC is the authority for ownership. Official questions can have
 * a teacher_id because they were imported by a platform content account, so a
 * non-null teacher_id does not mean that a question belongs in My Pool.
 */
export const isMyPoolQuestion = (question, teacherId) => question.content_origin !== 'brain_heist' && (question.is_mine === true ||
    (question.is_mine === undefined && Boolean(teacherId) && question.teacher_id === teacherId));
export const isBrainsHeistPoolQuestion = (question, teacherId) => !isMyPoolQuestion(question, teacherId) &&
    question.content_origin === 'brain_heist' &&
    question.verification_status === 'verified' &&
    question.analytics_eligible === true;
