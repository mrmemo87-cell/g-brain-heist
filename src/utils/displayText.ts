// Small, pure helpers for turning stored names and labels into polished display text.

const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof|sir|dame)\.?$/i;

/**
 * Name to greet someone by.
 * "Ms. Sarah Mitchell" -> "Ms. Mitchell"; "Sarah Mitchell" -> "Sarah"; empty -> fallback.
 */
export const greetingName = (fullName?: string | null, fallback = 'School Head'): string => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  if (HONORIFIC.test(parts[0])) return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : fallback;
  return parts[0];
};

// Acronyms that title-cased content sometimes stores as ordinary words ("Ielts", "(Esl)").
const ACRONYMS: Record<string, string> = {
  esl: 'ESL',
  efl: 'EFL',
  ielts: 'IELTS',
  igcse: 'IGCSE',
  cefr: 'CEFR',
  ks3: 'KS3',
};

/** Fixes known acronyms inside a topic or programme label; everything else is unchanged. */
export const formatTopicLabel = (label?: string | null): string => {
  if (!label) return '';
  return label.replace(/\b[A-Za-z][A-Za-z0-9]*\b/g, (word) => ACRONYMS[word.toLowerCase()] ?? word);
};

/** "1 question" / "2 questions". */
export const countLabel = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;
