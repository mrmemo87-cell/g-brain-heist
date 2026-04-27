export const COMMUNICATIVE_ACHIEVEMENT_ALIAS_KEYS = [
  'communicativeAchievement',
  'communicative_achievement',
  'communicative achievement',
] as const;

const normalizeLookupKey = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, '');
const CANONICAL_CA_KEY = normalizeLookupKey('communicativeAchievement');

export const isPlaceholderValue = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length === 0 || /^_+$/.test(trimmed);
};

const getAliasValue = (container: Record<string, unknown> | null | undefined): unknown => {
  if (!container || typeof container !== 'object') return undefined;

  for (const [key, value] of Object.entries(container)) {
    if (normalizeLookupKey(key) === CANONICAL_CA_KEY) {
      return value;
    }
  }

  return undefined;
};

const setCanonicalValue = (
  container: Record<string, unknown> | null | undefined,
  value: unknown,
): Record<string, unknown> | null | undefined => {
  if (!container || typeof container !== 'object') return container;

  for (const key of Object.keys(container)) {
    if (normalizeLookupKey(key) === CANONICAL_CA_KEY && key !== 'communicativeAchievement') {
      delete container[key];
    }
  }

  container['communicativeAchievement'] = value;
  return container;
};

const coerceCommunicativeAchievementScore = (value: unknown): number | null => {
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

export type CaNormalizationResult = {
  repaired: boolean;
  errors: string[];
};

export const normalizePart2CommunicativeAchievement = (part2: unknown): CaNormalizationResult => {
  const errors: string[] = [];
  let repaired = false;

  if (!part2 || typeof part2 !== 'object') {
    return { repaired: false, errors };
  }

  const mutablePart2 = part2 as Record<string, unknown>;

  const suggestedMarks = (mutablePart2['suggestedMarks'] ?? null) as Record<string, unknown> | null;
  const suggestedRaw = getAliasValue(suggestedMarks);
  const score = coerceCommunicativeAchievementScore(suggestedRaw);

  if (!suggestedMarks) {
    errors.push('part2.suggestedMarks is missing');
  } else if (score === null) {
    errors.push('part2.suggestedMarks.communicativeAchievement must be an integer 0-5');
  } else {
    if (suggestedRaw !== score) repaired = true;
    setCanonicalValue(suggestedMarks, score);
  }

  const markJustifications = (mutablePart2['markJustifications'] ?? null) as Record<string, unknown> | null;
  const justificationRaw = getAliasValue(markJustifications);

  if (!markJustifications) {
    errors.push('part2.markJustifications is missing');
  } else if (typeof justificationRaw !== 'string' || isPlaceholderValue(justificationRaw)) {
    errors.push('part2.markJustifications.communicativeAchievement must be a meaningful non-empty string');
  } else {
    const normalizedText = justificationRaw.trim();
    if (normalizedText !== justificationRaw) repaired = true;
    setCanonicalValue(markJustifications, normalizedText);
  }

  return { repaired, errors };
};

export const sanitizeCommunicativeAchievementText = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (isPlaceholderValue(trimmed)) return fallback;
  return trimmed;
};
