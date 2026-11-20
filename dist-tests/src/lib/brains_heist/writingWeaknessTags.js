const ALIASES = {
    agreement: 'agreement_error',
    subject_verb_agreement: 'agreement_error',
    subject_verb_agreement_error: 'agreement_error',
    sv_agreement: 'agreement_error',
    verb_agreement: 'agreement_error',
    noun_verb_agreement: 'agreement_error',
    tense: 'tense_error',
    verb_tense: 'tense_error',
    verb_tense_error: 'tense_error',
    article: 'article_error',
    articles: 'article_error',
    missing_article: 'article_error',
    wrong_article: 'article_error',
    preposition: 'preposition_error',
    wrong_preposition: 'preposition_error',
    sentence_fragment: 'fragment',
    incomplete_sentence: 'fragment',
    run_on_sentence: 'run_on',
    comma_splice: 'run_on',
    spelling: 'spelling_error',
    misspelling: 'spelling_error',
    word_choice: 'weak_word_choice',
    punctuation: 'punctuation_error',
    missing_comma: 'punctuation_error',
    comma: 'punctuation_error',
    comma_error: 'punctuation_error',
    missing_full_stop: 'punctuation_error',
    apostrophe: 'punctuation_error',
    capitalisation: 'punctuation_error',
    capitalization: 'punctuation_error',
};
/** Canonical tag for a model-supplied label, or null when it is unknown. */
export function normalizeWeaknessTag(raw, canonical) {
    if (typeof raw !== 'string')
        return null;
    const key = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key)
        return null;
    if (canonical.has(key))
        return key;
    return ALIASES[key] ?? null;
}
/**
 * Language tag for a grammar correction without a usable label, from its explanation (`issue`) and
 * the before/after text. Returns null when nothing matches, so the caller can try its other checks.
 */
export function classifyGrammarFix(issue, original, better) {
    const combined = `${issue} ${original} ${better}`;
    if (/\bagree(?:s|ment)?\b|subject.?verb|\bthere is\b.*\bthere are\b|\bthere are\b.*\bthere is\b|\bhas\b.*\bhave\b|\bhave\b.*\bhas\b/i.test(combined))
        return 'agreement_error';
    if (/tense|past tense|present tense|verb time/i.test(combined))
        return 'tense_error';
    if (/\barticles?\b|['"‘“](?:a|an|the)['"’”]/i.test(issue))
        return 'article_error';
    if (/preposition/i.test(issue))
        return 'preposition_error';
    if (/fragment|incomplete sentence/i.test(issue))
        return 'fragment';
    if (/run.?on|sentence boundary/i.test(issue))
        return 'run_on';
    return null;
}
