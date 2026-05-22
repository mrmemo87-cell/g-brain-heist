export const COMMUNICATIVE_ACHIEVEMENT_ALIAS_KEYS = [
    'communicativeAchievement',
    'communicative_achievement',
    'communicative achievement',
];
const normalizeLookupKey = (value) => value.toLowerCase().replace(/[\s_-]+/g, '');
const CANONICAL_CA_KEY = normalizeLookupKey('communicativeAchievement');
export const isPlaceholderValue = (value) => {
    if (typeof value !== 'string')
        return false;
    const trimmed = value.trim();
    return trimmed.length === 0 || /^_+$/.test(trimmed);
};
const getAliasValue = (container) => {
    if (!container || typeof container !== 'object')
        return undefined;
    for (const [key, value] of Object.entries(container)) {
        if (normalizeLookupKey(key) === CANONICAL_CA_KEY) {
            return value;
        }
    }
    return undefined;
};
const setCanonicalValue = (container, value) => {
    if (!container || typeof container !== 'object')
        return container;
    for (const key of Object.keys(container)) {
        if (normalizeLookupKey(key) === CANONICAL_CA_KEY && key !== 'communicativeAchievement') {
            delete container[key];
        }
    }
    container['communicativeAchievement'] = value;
    return container;
};
const coerceCommunicativeAchievementScore = (value) => {
    if (typeof value === 'number') {
        if (Number.isInteger(value) && value >= 0 && value <= 5) {
            return value;
        }
        return null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^[0-5]$/.test(trimmed)) {
            return Number(trimmed);
        }
    }
    return null;
};
export const normalizePart2CommunicativeAchievement = (part2) => {
    const errors = [];
    let repaired = false;
    if (!part2 || typeof part2 !== 'object') {
        return { repaired: false, errors };
    }
    const mutablePart2 = part2;
    const suggestedMarks = (mutablePart2['suggestedMarks'] ?? null);
    const suggestedRaw = getAliasValue(suggestedMarks);
    const score = coerceCommunicativeAchievementScore(suggestedRaw);
    if (!suggestedMarks) {
        errors.push('part2.suggestedMarks is missing');
    }
    else if (score === null) {
        errors.push('part2.suggestedMarks.communicativeAchievement must be an integer 0-5');
    }
    else {
        if (suggestedRaw !== score)
            repaired = true;
        setCanonicalValue(suggestedMarks, score);
    }
    const markJustifications = (mutablePart2['markJustifications'] ?? null);
    const justificationRaw = getAliasValue(markJustifications);
    if (!markJustifications) {
        errors.push('part2.markJustifications is missing');
    }
    else if (typeof justificationRaw !== 'string' || isPlaceholderValue(justificationRaw)) {
        errors.push('part2.markJustifications.communicativeAchievement must be a meaningful non-empty string');
    }
    else {
        const normalizedText = justificationRaw.trim();
        if (normalizedText !== justificationRaw)
            repaired = true;
        setCanonicalValue(markJustifications, normalizedText);
    }
    return { repaired, errors };
};
export const sanitizeCommunicativeAchievementText = (value, fallback = '') => {
    if (typeof value !== 'string')
        return fallback;
    const trimmed = value.trim();
    if (isPlaceholderValue(trimmed))
        return fallback;
    return trimmed;
};
