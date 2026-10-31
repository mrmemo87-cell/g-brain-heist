/** Task-specific observations. Never a calibrated score, a full Writing band or a persistence label. */
export const IELTS_WRITING_CRITERIA = [
    { key: 'task_response', label: 'Task Response', focus: 'Address both views, give a clear opinion and develop relevant reasons and examples.' },
    { key: 'coherence_cohesion', label: 'Coherence and Cohesion', focus: 'Organise ideas logically, use purposeful paragraphs and connect ideas clearly.' },
    { key: 'lexical_resource', label: 'Lexical Resource', focus: 'Use appropriate, precise vocabulary and natural combinations of words.' },
    { key: 'grammar_range_accuracy', label: 'Grammatical Range and Accuracy', focus: 'Use varied sentence structures with accurate grammar and punctuation.' },
];
export function countWritingWords(text) { return text.trim() ? text.trim().split(/\s+/u).length : 0; }
/** Database offsets count Unicode code points, not JavaScript UTF-16 units. No approximate anchoring. */
export function anchorWritingQuote(original, quote, fromChar = 0) {
    if (!quote || !Number.isInteger(fromChar) || fromChar < 0)
        return null;
    const points = Array.from(original);
    const prefix = points.slice(0, fromChar).join('');
    const index = original.indexOf(quote, prefix.length);
    if (index < 0)
        return null;
    const start_char = Array.from(original.slice(0, index)).length;
    return { quote, start_char, end_char: start_char + Array.from(quote).length };
}
export function writingEvidenceMatches(original, span) {
    return Number.isInteger(span.start_char) && Number.isInteger(span.end_char) && span.start_char >= 0
        && span.end_char > span.start_char && span.end_char <= Array.from(original).length
        && Array.from(original).slice(span.start_char, span.end_char).join('') === span.quote;
}
export function parseWritingScreenerResult(value) {
    if (value === null)
        return null;
    const v = value;
    if (!v || typeof v.response_text !== 'string' || typeof v.prompt !== 'string'
        || !/^[a-f0-9]{64}$/.test(v.response_sha256) || !Number.isInteger(v.word_count) || v.word_count < 0
        || !['answered', 'unanswered', 'invalid'].includes(v.response_state)
        || !['first_sitting', 'same_prompt_practice'].includes(v.evidence_kind)
        || !['pending', 'teacher_reviewed'].includes(v.review_status) || v.confidence !== 'low'
        || v.readiness_available !== false || v.persistent_weakness_available !== false
        || !v.criterion_observations || typeof v.criterion_observations !== 'object')
        throw new Error('Your essay is saved. The feedback needs review before it can be shown.');
    if (v.review_status === 'teacher_reviewed') {
        for (const { key } of IELTS_WRITING_CRITERIA) {
            const observation = v.criterion_observations[key];
            if (!observation || !['observed', 'developing', 'insufficient_evidence'].includes(observation.status)
                || typeof observation.comment !== 'string' || !Array.isArray(observation.evidence)
                || observation.evidence.some(span => !writingEvidenceMatches(v.response_text, span)))
                throw new Error('Your essay is saved. Please ask your teacher to check the feedback.');
        }
    }
    return v;
}
