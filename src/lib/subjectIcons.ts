export const SUBJECT_ICON_PATHS = {
  biology: '/subject-icons/biology_drawn_detailed.svg',
  chemistry: '/subject-icons/chemistry_drawn_detailed.svg',
  english: '/subject-icons/english_drawn_detailed.svg',
  esl: '/subject-icons/esl_drawn_detailed.svg',
  geography: '/subject-icons/geography_drawn_detailed.svg',
  'global perspectives': '/subject-icons/global_perspectives_drawn_detailed.svg',
  ict: '/subject-icons/ict_drawn_detailed.svg',
  'kyrgyz language': '/subject-icons/kyrgyz_language_drawn_detailed.svg',
  mathematics: '/subject-icons/mathematics_drawn_detailed.svg',
  physics: '/subject-icons/physics_drawn_detailed.svg',
  'russian language': '/subject-icons/russian_language_drawn_detailed.svg',
  science: '/subject-icons/science_drawn_detailed.svg',
  'travel & tourism': '/subject-icons/travel_tourism_drawn_detailed.svg',
} as const;

const SUBJECT_ALIASES: Record<string, keyof typeof SUBJECT_ICON_PATHS> = {
  math: 'mathematics',
  maths: 'mathematics',
  mathematics: 'mathematics',
  'global perspective': 'global perspectives',
  'global perspectives': 'global perspectives',
  biology: 'biology',
  chemistry: 'chemistry',
  english: 'english',
  esl: 'esl',
  geography: 'geography',
  ict: 'ict',
  'kyrgyz language': 'kyrgyz language',
  physics: 'physics',
  'russian language': 'russian language',
  science: 'science',
  'travel & tourism': 'travel & tourism',
  'travel and tourism': 'travel & tourism',
};

export const normalizeSubjectIconKey = (subject?: string | null): string =>
  (subject || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const getSubjectIconPath = (subject?: string | null): string | null => {
  const normalized = normalizeSubjectIconKey(subject);
  const canonical = SUBJECT_ALIASES[normalized] || normalized;
  return SUBJECT_ICON_PATHS[canonical as keyof typeof SUBJECT_ICON_PATHS] || null;
};
