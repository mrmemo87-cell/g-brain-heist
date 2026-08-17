export type SupportedGenre =
  | 'email'
  | 'article'
  | 'review'
  | 'story'
  | 'essay'
  | 'report'
  | 'paragraph';

export type ScoreMode = 'A2_3_scale' | 'B1B2_4_scale';

export const WRITING_RUBRIC_VERSION = 'cambridge-esl-writing-rubric-v1' as const;
export const WRITING_EVALUATOR_VERSION = 'bh-writing-assessment-v4.0' as const;
export const WRITING_PREVIOUS_EVALUATOR_VERSION = 'bh-writing-assessment-v3.8' as const;
export const WRITING_EARLIER_EVALUATOR_VERSION = 'bh-writing-assessment-v3.7' as const;
export const WRITING_OLDER_EVALUATOR_VERSION = 'bh-writing-assessment-v3.5' as const;
export const WRITING_ARCHIVED_EVALUATOR_VERSIONS = [
  'bh-writing-assessment-v3.6',
  'bh-writing-assessment-v3.4',
  'bh-writing-assessment-v3.3',
  'bh-writing-assessment-v3.2',
] as const;
export const WRITING_LEGACY_EVALUATOR_VERSION = 'bh-writing-assessment-v2' as const;
export const TRUSTED_WRITING_EVALUATOR_VERSIONS = [
  WRITING_EVALUATOR_VERSION,
  WRITING_PREVIOUS_EVALUATOR_VERSION,
  WRITING_EARLIER_EVALUATOR_VERSION,
  WRITING_OLDER_EVALUATOR_VERSION,
  ...WRITING_ARCHIVED_EVALUATOR_VERSIONS,
  WRITING_LEGACY_EVALUATOR_VERSION,
] as const;

export type WritingAssessmentStatus = 'verified' | 'provisional' | 'needs_review' | 'failed' | 'legacy_estimate';
export type WritingCriterionKey = 'content' | 'communicative_achievement' | 'organisation' | 'language';

export interface WritingEvidenceSpan {
  quote: string;
  start_char: number;
  end_char: number;
}

export interface WritingCriterionAssessment {
  score: number;
  confidence: number;
  descriptor_id: string;
  justification: string;
  improvement_action: string;
  evidence: WritingEvidenceSpan[];
}

export interface WritingPromptAssessmentDefinition {
  prompt_id: string | null;
  prompt_definition_hash: string;
  grade: number;
  genre: SupportedGenre;
  target_word_count: number;
  audience: string;
  purpose: string;
  register: 'informal' | 'neutral' | 'formal' | 'mixed';
  difficulty_level: 'foundational' | 'core' | 'stretch';
}

export type ContentWeaknessTag =
  | 'missed_content_point'
  | 'partial_content_coverage'
  | 'irrelevant_detail'
  | 'under_length';

export type CommunicativeWeaknessTag =
  | 'wrong_tone'
  | 'weak_register_control'
  | 'weak_genre_convention'
  | 'weak_audience_awareness';

export type OrganisationWeaknessTag =
  | 'weak_paragraphing'
  | 'poor_sequencing'
  | 'weak_linking'
  | 'repetitive_flow';

export type LanguageWeaknessTag =
  | 'tense_error'
  | 'agreement_error'
  | 'article_error'
  | 'preposition_error'
  | 'fragment'
  | 'run_on'
  | 'weak_word_choice'
  | 'spelling_error'
  | 'punctuation_error';

export type WeaknessTag =
  | ContentWeaknessTag
  | CommunicativeWeaknessTag
  | OrganisationWeaknessTag
  | LanguageWeaknessTag;

export interface WritingAssessmentInput {
  promptText: string;
  grade: number;
  genre: SupportedGenre;
  targetWordCount: number;
  studentResponse: string;
}

export interface GradeDifficultyConfig {
  expectedCeiling: 'A2' | 'B1' | 'B2';
  strictness: number;
  minParagraphs: number;
  registerSensitivity: number;
  developmentWeight: number;
}

export const GRADE_TO_DIFFICULTY_CONFIG: Record<number, GradeDifficultyConfig> = {
  1: { expectedCeiling: 'A2', strictness: 0.28, minParagraphs: 1, registerSensitivity: 0.08, developmentWeight: 0.08 },
  2: { expectedCeiling: 'A2', strictness: 0.34, minParagraphs: 1, registerSensitivity: 0.1, developmentWeight: 0.1 },
  3: { expectedCeiling: 'A2', strictness: 0.42, minParagraphs: 1, registerSensitivity: 0.14, developmentWeight: 0.14 },
  4: { expectedCeiling: 'A2', strictness: 0.5, minParagraphs: 1, registerSensitivity: 0.18, developmentWeight: 0.18 },
  5: { expectedCeiling: 'A2', strictness: 0.58, minParagraphs: 1, registerSensitivity: 0.22, developmentWeight: 0.22 },
  6: { expectedCeiling: 'A2', strictness: 0.65, minParagraphs: 1, registerSensitivity: 0.25, developmentWeight: 0.25 },
  7: { expectedCeiling: 'A2', strictness: 0.72, minParagraphs: 2, registerSensitivity: 0.35, developmentWeight: 0.35 },
  8: { expectedCeiling: 'B1', strictness: 0.8, minParagraphs: 2, registerSensitivity: 0.5, developmentWeight: 0.5 },
  9: { expectedCeiling: 'B1', strictness: 0.86, minParagraphs: 3, registerSensitivity: 0.62, developmentWeight: 0.62 },
  10: { expectedCeiling: 'B2', strictness: 0.93, minParagraphs: 3, registerSensitivity: 0.78, developmentWeight: 0.8 },
  11: { expectedCeiling: 'B2', strictness: 0.97, minParagraphs: 4, registerSensitivity: 0.9, developmentWeight: 0.9 },
  12: { expectedCeiling: 'B2', strictness: 1, minParagraphs: 4, registerSensitivity: 1, developmentWeight: 1 },
};

export interface GenreExpectation {
  purpose: string;
  audienceSignalWords: string[];
  register: 'informal' | 'neutral' | 'formal' | 'mixed';
  requiresParagraphs: boolean;
  conventions: string[];
  preferredSequencers: string[];
}

export const GENRE_EXPECTATION_CONFIG: Record<SupportedGenre, GenreExpectation> = {
  email: {
    purpose: 'address recipient directly, respond clearly to each point, and close appropriately',
    audienceSignalWords: ['dear', 'hi', 'hello', 'regards', 'sincerely', 'best wishes'],
    register: 'mixed',
    requiresParagraphs: true,
    conventions: ['greeting', 'clear request/response', 'closing sign-off'],
    preferredSequencers: ['first', 'also', 'finally'],
  },
  article: {
    purpose: 'inform or persuade a broad readership with a clear angle and conclusion',
    audienceSignalWords: ['readers', 'you', 'our school', 'community'],
    register: 'neutral',
    requiresParagraphs: true,
    conventions: ['headline-style opening', 'balanced points', 'reader-focused ending'],
    preferredSequencers: ['firstly', 'in addition', 'however', 'overall'],
  },
  review: {
    purpose: 'evaluate strengths and weaknesses and provide a recommendation',
    audienceSignalWords: ['i recommend', 'worth', 'rating', 'overall'],
    register: 'neutral',
    requiresParagraphs: true,
    conventions: ['brief context', 'evaluation criteria', 'clear verdict'],
    preferredSequencers: ['to begin with', 'however', 'overall'],
  },
  story: {
    purpose: 'narrate events with sequence, development, and a clear ending',
    audienceSignalWords: ['suddenly', 'then', 'after that', 'in the end'],
    register: 'informal',
    requiresParagraphs: true,
    conventions: ['setting', 'problem/event', 'resolution'],
    preferredSequencers: ['one day', 'then', 'suddenly', 'finally'],
  },
  essay: {
    purpose: 'develop an argument with reasoned support and a formal conclusion',
    audienceSignalWords: ['this essay', 'in conclusion', 'therefore', 'moreover'],
    register: 'formal',
    requiresParagraphs: true,
    conventions: ['clear thesis', 'developed arguments', 'reasoned conclusion'],
    preferredSequencers: ['firstly', 'however', 'moreover', 'therefore'],
  },
  report: {
    purpose: 'present factual findings and recommendations in a structured formal style',
    audienceSignalWords: ['findings', 'evidence', 'data', 'recommendation'],
    register: 'formal',
    requiresParagraphs: true,
    conventions: ['objective overview', 'findings', 'recommendations'],
    preferredSequencers: ['according to', 'in addition', 'as a result'],
  },
  paragraph: {
    purpose: 'develop one central idea clearly in a compact format',
    audienceSignalWords: ['for example', 'this shows', 'in summary'],
    register: 'neutral',
    requiresParagraphs: false,
    conventions: ['topic sentence', 'supporting detail', 'closing sentence'],
    preferredSequencers: ['first', 'for example', 'finally'],
  },
};

interface CoachingSignals {
  communicativePurpose: number;
  register: number;
  audienceAwareness: number;
}

export interface WritingAssessmentResult {
  grade: string;
  genre: string;
  score_mode: ScoreMode;
  target_word_count: number;
  actual_word_count: number;
  subscores: {
    content: number;
    communicative_achievement: number | null;
    organisation: number;
    language: number;
  };
  total_score: number;
  band_justification: {
    content: string;
    communicative_achievement: string;
    organisation: string;
    language: string;
  };
  detected_content_points: string[];
  missed_content_points: string[];
  weakness_tags: WeaknessTag[];
  top_3_priorities: string[];
  monthly_tracking_ready: true;
  /**
   * Academic analytics may consume an assessment only when this is true.
   * Older records intentionally omit this field and remain legacy estimates.
   */
  academic_profile_ready?: boolean;
  assessment_id?: string;
  assessment_status?: WritingAssessmentStatus;
  needs_teacher_review?: boolean;
  rubric_version?: typeof WRITING_RUBRIC_VERSION | string;
  evaluator_version?: typeof WRITING_EVALUATOR_VERSION | string;
  evaluator_model?: string;
  text_fingerprint?: string;
  prompt_definition?: WritingPromptAssessmentDefinition;
  framework_profile?: Record<string, unknown>;
  task_rules?: Record<string, unknown>;
  task_compliance?: Record<string, unknown>;
  rubric_snapshot?: Record<string, unknown>;
  criteria?: Record<WritingCriterionKey, WritingCriterionAssessment>;
  shadow_heuristic_total?: number;
  adjudication_reason?: string | null;
  derived_from_assessment_id?: string;
  hidden_coaching_signals?: CoachingSignals;
}

export interface StoredAttempt {
  attemptedAt: string;
  result: WritingAssessmentResult;
}

export interface RepeatedErrorMemory {
  byStudent: Record<
    string,
    {
      attempts: StoredAttempt[];
      tagCounts: Partial<Record<WeaknessTag, number>>;
    }
  >;
}

export const createEmptyErrorMemory = (): RepeatedErrorMemory => ({ byStudent: {} });

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'with', 'in', 'on', 'at', 'of', 'is', 'are', 'be', 'this', 'that', 'it', 'as', 'by', 'from'
]);

const clampBand = (score: number): number => Math.max(0, Math.min(5, Math.round(score)));

const countWords = (text: string): number => {
  const matches = text.trim().match(/[A-Za-z0-9']+/g);
  return matches ? matches.length : 0;
};

const normalize = (text: string): string => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const splitKeywords = (text: string): string[] =>
  normalize(text)
    .split(' ')
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

const extractContentPoints = (promptText: string): string[] => {
  const lines = promptText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bullets = lines
    .filter((line) => /^([-*•]|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, '').trim());

  if (bullets.length > 0) {
    return bullets
      .flatMap((point) => point.split(/;|\s+\band\b\s+/i).map((chunk) => chunk.trim()).filter((chunk) => chunk.split(/\s+/).length >= 3))
      .slice(0, 10);
  }

  return promptText
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length >= 4)
    .slice(0, 8);
};

interface CoverageResult {
  full: string[];
  partial: string[];
  missed: string[];
}

const detectCoverage = (contentPoints: string[], response: string): CoverageResult => {
  const responseNormalized = normalize(response);
  const responseTokens = new Set(splitKeywords(response));

  const full: string[] = [];
  const partial: string[] = [];
  const missed: string[] = [];

  for (const point of contentPoints) {
    const pointTokens = splitKeywords(point);
    const pointNorm = normalize(point);

    if (pointNorm.length > 10 && responseNormalized.includes(pointNorm)) {
      full.push(point);
      continue;
    }

    const overlap = pointTokens.filter((token) => responseTokens.has(token)).length;
    const overlapRatio = pointTokens.length > 0 ? overlap / pointTokens.length : 0;

    if (overlapRatio >= 0.66 || (overlap >= 2 && pointTokens.length <= 4)) full.push(point);
    else if (overlapRatio >= 0.33 || overlap >= 1) partial.push(point);
    else missed.push(point);
  }

  return { full, partial, missed };
};

interface BandScore {
  band: number;
  comment: string;
}

const scoreContentBand = (
  coverage: CoverageResult,
  targetWordCount: number,
  actualWordCount: number,
  grade: number
): BandScore => {
  const total = Math.max(1, coverage.full.length + coverage.partial.length + coverage.missed.length);
  const fullRatio = coverage.full.length / total;
  const partialRatio = coverage.partial.length / total;
  const lengthRatio = actualWordCount / Math.max(1, targetWordCount);

  let band = 0;
  if (fullRatio >= 0.9 && partialRatio <= 0.1) band = 5;
  else if (fullRatio >= 0.7 && partialRatio <= 0.3) band = 4;
  else if (fullRatio >= 0.45 || fullRatio + partialRatio >= 0.7) band = 3;
  else if (fullRatio + partialRatio >= 0.4) band = 2;
  else if (fullRatio + partialRatio > 0) band = 1;

  if (lengthRatio < 0.75 && band > 0) band -= 1;
  if (grade >= 10 && coverage.partial.length >= 2 && band > 0) band -= 1;

  band = clampBand(band);

  const comment =
    band >= 5
      ? 'All content points are addressed clearly and developed with relevant detail.'
      : band === 4
        ? 'Most content points are covered; development is generally relevant with minor omission.'
        : band === 3
          ? 'The response addresses the task in part, but some points are only partially developed.'
          : band === 2
            ? 'Task coverage is uneven, with several points only touched on briefly.'
            : band === 1
              ? 'Only limited task content is communicated and key points are missing.'
              : 'The response does not address the required content points.';

  return { band, comment };
};

const scoreOrganisationBand = (response: string, grade: number, genre: SupportedGenre): BandScore => {
  const paragraphs = response.split(/\n\s*\n/).filter((chunk) => chunk.trim().length > 0).length;
  const sequencers = GENRE_EXPECTATION_CONFIG[genre].preferredSequencers;
  const sequencingHits = sequencers.filter((marker) => new RegExp(`\\b${marker.replace(/\s+/g, '\\s+')}\\b`, 'i').test(response)).length;
  const hasBasicLinks = /\b(and|but|because|then|however|therefore|finally)\b/i.test(response);
  const sentenceCount = response.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean).length;

  let band = 0;
  if (paragraphs >= GRADE_TO_DIFFICULTY_CONFIG[grade].minParagraphs && sequencingHits >= 2 && hasBasicLinks) band = 5;
  else if (paragraphs >= Math.max(1, GRADE_TO_DIFFICULTY_CONFIG[grade].minParagraphs - 1) && sequencingHits >= 1 && hasBasicLinks) band = 4;
  else if (sentenceCount >= 4 && hasBasicLinks) band = 3;
  else if (sentenceCount >= 3) band = 2;
  else if (sentenceCount >= 1) band = 1;

  if (grade >= 10 && paragraphs < GRADE_TO_DIFFICULTY_CONFIG[grade].minParagraphs && band > 0) band -= 1;
  band = clampBand(band);

  const comment =
    band >= 5
      ? 'Ideas are sequenced effectively with clear paragraphing and cohesive links.'
      : band === 4
        ? 'Organisation is generally clear, though linking or paragraph control is not fully consistent.'
        : band === 3
          ? 'There is a basic structure, but progression between ideas is sometimes mechanical.'
          : band === 2
            ? 'Some organisation is visible, but sequencing and cohesion are weak.'
            : band === 1
              ? 'Organisation is very limited and ideas are difficult to follow.'
              : 'There is no clear organisational structure.';

  return { band, comment };
};

const countLanguageIssues = (response: string): { total: number; severe: number; tags: WeaknessTag[] } => {
  const tags = new Set<WeaknessTag>();
  const normalized = response.trim();

  if (/\bi\s+is\b|\bthey\s+was\b|\bhe\s+go\b/i.test(normalized)) tags.add('agreement_error');
  if (/\b(?:go|eat|play)\s+yesterday\b|\btoday i went and tomorrow i go\b/i.test(normalized)) tags.add('tense_error');
  if (/\b(informations|advices|peoples|goed)\b/i.test(normalized)) tags.add('weak_word_choice');
  if (/\b(a|an)\s+[aeiou]\w*\b/i.test(normalized)) tags.add('article_error');
  if (/\bdiscuss about\b|\bmarried with\b/i.test(normalized)) tags.add('preposition_error');
  if (/\b[A-Z][^.!?\n]{80,}\b/.test(normalized)) tags.add('run_on');
  if (/\b(because|although)\s+[a-z]+\.$/i.test(normalized)) tags.add('fragment');
  if (/[^.!?\n]$/.test(normalized)) tags.add('punctuation_error');
  if (/\bteh\b|\brecieve\b|\bseperate\b/i.test(normalized)) tags.add('spelling_error');

  const severe = [...tags].filter((tag) => ['fragment', 'run_on', 'agreement_error', 'tense_error'].includes(tag)).length;
  return { total: tags.size, severe, tags: [...tags] };
};

const scoreLanguageBand = (response: string, grade: number, contentBand: number): BandScore & { tags: WeaknessTag[] } => {
  const issues = countLanguageIssues(response);
  const strictness = GRADE_TO_DIFFICULTY_CONFIG[grade].strictness;

  let band = 5;
  if (issues.total >= 1) band = 4;
  if (issues.total >= 3 || issues.severe >= 1) band = 3;
  if (issues.total >= 5 || issues.severe >= 2) band = 2;
  if (issues.total >= 7 || issues.severe >= 3) band = 1;
  if (issues.total >= 9) band = 0;

  if (grade >= 10) {
    band = clampBand(band - Math.round((strictness - 0.8) * 2));
  }

  const communicatesClearly = contentBand >= 3 && countWords(response) >= 60;
  if (grade <= 7 && communicatesClearly && issues.severe <= 1) {
    band = Math.max(3, band);
  }

  const comment =
    band >= 5
      ? 'Language is accurate and controlled, with good range for the task.'
      : band === 4
        ? 'Language is generally accurate; minor errors do not reduce clarity.'
        : band === 3
          ? 'Language control is adequate, though recurring errors are noticeable.'
          : band === 2
            ? 'Frequent errors limit precision and occasionally affect clarity.'
            : band === 1
              ? 'Persistent errors often obscure meaning and reduce control.'
              : 'Language control is very limited and meaning is often unclear.';

  return { band, comment, tags: issues.tags };
};

const scoreCommunicativeBand = (
  genre: SupportedGenre,
  response: string,
  grade: number,
  coverage: CoverageResult
): BandScore & { toneWeak: boolean; audienceWeak: boolean; conventionWeak: boolean } => {
  const expectation = GENRE_EXPECTATION_CONFIG[genre];
  const responseLower = response.toLowerCase();

  const audienceHits = expectation.audienceSignalWords.filter((token) => responseLower.includes(token)).length;
  const conventionHits = expectation.conventions.filter((c) => {
    if (c.includes('greeting')) return /\b(dear|hi|hello)\b/i.test(response);
    if (c.includes('sign-off')) return /\b(regards|sincerely|best wishes)\b/i.test(response);
    if (c.includes('recommend')) return /\brecommend|should\b/i.test(response);
    if (c.includes('thesis')) return /\bthis essay|i believe|in my view\b/i.test(response);
    if (c.includes('conclusion')) return /\bin conclusion|overall|to sum up\b/i.test(response);
    if (c.includes('findings')) return /\bfindings|evidence|results\b/i.test(response);
    if (c.includes('resolution')) return /\bin the end|finally|resolved\b/i.test(response);
    if (c.includes('topic sentence')) return response.split(/[.!?]/)[0]?.split(/\s+/).length >= 5;
    return responseLower.includes(c.split(' ')[0]);
  }).filter(Boolean).length;

  const formalMarkers = /\btherefore|moreover|in conclusion|it is evident|according to\b/i.test(response);
  const informalMarkers = /\bhey|awesome|cool|gonna|wanna\b/i.test(response);

  const toneWeak = (expectation.register === 'formal' && informalMarkers) || (expectation.register === 'informal' && formalMarkers && grade <= 9);
  const audienceWeak = audienceHits === 0;
  const conventionWeak = conventionHits < 2;

  const totalContent = Math.max(1, coverage.full.length + coverage.partial.length + coverage.missed.length);
  const taskAddressed = (coverage.full.length + coverage.partial.length) / totalContent;

  let band = 0;
  if (!toneWeak && !audienceWeak && !conventionWeak && taskAddressed >= 0.8) band = 5;
  else if ((!toneWeak || grade <= 7) && audienceHits >= 1 && conventionHits >= 2 && taskAddressed >= 0.65) band = 4;
  else if (audienceHits >= 1 && conventionHits >= 1 && taskAddressed >= 0.5) band = 3;
  else if (taskAddressed >= 0.35) band = 2;
  else if (taskAddressed > 0) band = 1;

  if (grade >= 10 && toneWeak && band > 0) band -= 1;
  if (grade >= 10 && taskAddressed < 0.7 && band > 0) band -= 1;

  band = clampBand(band);

  const comment =
    band >= 5
      ? 'Communicative purpose is fully achieved with appropriate register and strong audience awareness.'
      : band === 4
        ? 'Purpose is clear and mostly appropriate for audience and genre, with only minor lapses in tone.'
        : band === 3
          ? 'The task purpose is partly achieved, but control of register or audience is inconsistent.'
          : band === 2
            ? 'Awareness of genre and audience is limited, reducing overall task impact.'
            : band === 1
              ? 'Communicative achievement is minimal and genre expectations are rarely met.'
              : 'The response does not achieve the communicative purpose of the task.';

  return { band, comment, toneWeak, audienceWeak, conventionWeak };
};

const detectWeaknessTags = (
  input: WritingAssessmentInput,
  coverage: CoverageResult,
  actualWordCount: number,
  organisationBand: number,
  languageTags: WeaknessTag[],
  communicative: { toneWeak: boolean; audienceWeak: boolean; conventionWeak: boolean }
): WeaknessTag[] => {
  const tags = new Set<WeaknessTag>();
  const response = input.studentResponse;

  if (coverage.missed.length > 0) tags.add('missed_content_point');
  if (coverage.partial.length > 0) tags.add('partial_content_coverage');
  if (actualWordCount < input.targetWordCount * 0.85) tags.add('under_length');

  const addressedRatio = (coverage.full.length + coverage.partial.length) / Math.max(1, coverage.full.length + coverage.partial.length + coverage.missed.length);
  if (addressedRatio < 0.5 && actualWordCount > input.targetWordCount * 1.4) tags.add('irrelevant_detail');

  if (organisationBand <= 2) {
    tags.add('weak_paragraphing');
    tags.add('poor_sequencing');
  }
  if (!/\b(and|but|because|then|however|therefore|finally|in addition)\b/i.test(response)) tags.add('weak_linking');

  if (communicative.toneWeak) {
    tags.add('wrong_tone');
    tags.add('weak_register_control');
  }
  if (communicative.audienceWeak) tags.add('weak_audience_awareness');
  if (communicative.conventionWeak) tags.add('weak_genre_convention');

  for (const tag of languageTags) tags.add(tag);

  return [...tags];
};

const buildPriorities = (tags: WeaknessTag[]): string[] => {
  const priorityMap: Partial<Record<WeaknessTag, string>> = {
    missed_content_point: 'Answer every part of the question before adding extra ideas.',
    partial_content_coverage: 'Add one clear supporting detail to each main point.',
    under_length: 'Add useful detail so your response stays close to the word-count range.',
    wrong_tone: 'Match your tone to the task and reader.',
    weak_register_control: 'Keep your style consistent (formal or informal) from start to end.',
    weak_genre_convention: 'Use the expected format for this writing type (clear opening, middle, and ending).',
    weak_audience_awareness: 'Write with the reader in mind and explain ideas clearly.',
    weak_paragraphing: 'Use clear paragraphs, each with one main idea.',
    poor_sequencing: 'Put ideas in a clear order from beginning to end.',
    weak_linking: 'Use linking words to connect ideas smoothly.',
    agreement_error: 'Check subject–verb agreement while editing.',
    tense_error: 'Keep tense choices consistent across the response.',
    punctuation_error: 'Review sentence boundaries and end punctuation.',
  };

  return tags.slice(0, 3).map((tag) => priorityMap[tag] ?? `Improve control of ${tag.replaceAll('_', ' ')}.`);
};

export const assessWritingExam = (input: WritingAssessmentInput): WritingAssessmentResult => {
  const difficulty = GRADE_TO_DIFFICULTY_CONFIG[input.grade];
  if (!difficulty) {
    throw new Error(`Unsupported grade: ${input.grade}. Expected 1-12.`);
  }

  const scoreMode: ScoreMode = 'B1B2_4_scale';
  const actualWordCount = countWords(input.studentResponse);
  const contentPoints = extractContentPoints(input.promptText);
  const coverage = detectCoverage(contentPoints, input.studentResponse);

  const contentScored = scoreContentBand(coverage, input.targetWordCount, actualWordCount, input.grade);
  const organisationScored = scoreOrganisationBand(input.studentResponse, input.grade, input.genre);
  const communicativeScored = scoreCommunicativeBand(input.genre, input.studentResponse, input.grade, coverage);
  const languageScored = scoreLanguageBand(input.studentResponse, input.grade, contentScored.band);

  if (input.grade >= 10) {
    if (communicativeScored.band >= 4 && contentScored.band <= 2) {
      communicativeScored.band = 3;
      communicativeScored.comment = 'Purpose is evident, but weak task development limits communicative impact.';
    }
  }

  const weaknessTags = detectWeaknessTags(
    input,
    coverage,
    actualWordCount,
    organisationScored.band,
    languageScored.tags,
    communicativeScored
  );

  const communicativeScore = communicativeScored.band;
  const totalScore = contentScored.band + organisationScored.band + languageScored.band + communicativeScore;

  const result: WritingAssessmentResult = {
    grade: String(input.grade),
    genre: input.genre,
    score_mode: scoreMode,
    target_word_count: input.targetWordCount,
    actual_word_count: actualWordCount,
    subscores: {
      content: contentScored.band,
      communicative_achievement: communicativeScore,
      organisation: organisationScored.band,
      language: languageScored.band,
    },
    total_score: totalScore,
    band_justification: {
      content: contentScored.comment,
      communicative_achievement: communicativeScored.comment,
      organisation: organisationScored.comment,
      language: languageScored.comment,
    },
    detected_content_points: [...coverage.full, ...coverage.partial],
    missed_content_points: coverage.missed,
    weakness_tags: weaknessTags,
    top_3_priorities: buildPriorities(weaknessTags),
    monthly_tracking_ready: true,
  };

  if (input.grade === 8 || input.grade === 9) {
    result.hidden_coaching_signals = {
      communicativePurpose: communicativeScored.band,
      register: communicativeScored.toneWeak ? 2 : Math.max(3, communicativeScored.band),
      audienceAwareness: communicativeScored.audienceWeak ? 2 : Math.max(3, communicativeScored.band),
    };
  }

  return result;
};

export const storeAttemptInErrorMemory = (
  memory: RepeatedErrorMemory,
  studentId: string,
  result: WritingAssessmentResult,
  attemptedAt = new Date().toISOString()
): RepeatedErrorMemory => {
  const existing = memory.byStudent[studentId] ?? { attempts: [], tagCounts: {} };
  const attempts = [...existing.attempts, { attemptedAt, result }];
  const tagCounts = { ...existing.tagCounts };

  for (const tag of result.weakness_tags) {
    tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }

  return {
    byStudent: {
      ...memory.byStudent,
      [studentId]: {
        attempts,
        tagCounts,
      },
    },
  };
};

interface MonthlyComparisonSummary {
  month: string;
  attempts: number;
  avgScore: number;
  topWeaknessTags: WeaknessTag[];
}

export interface MonthlyComparisonResult {
  studentId: string;
  currentMonth: MonthlyComparisonSummary | null;
  previousMonth: MonthlyComparisonSummary | null;
  scoreDelta: number | null;
}

const monthKey = (isoDate: string): string => isoDate.slice(0, 7);

const summarizeMonth = (attempts: StoredAttempt[], month: string): MonthlyComparisonSummary | null => {
  const inMonth = attempts.filter((attempt) => monthKey(attempt.attemptedAt) === month);
  if (inMonth.length === 0) return null;

  const avgScore = inMonth.reduce((sum, attempt) => sum + attempt.result.total_score, 0) / inMonth.length;
  const tagCounts = new Map<WeaknessTag, number>();
  for (const attempt of inMonth) {
    for (const tag of attempt.result.weakness_tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const topWeaknessTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  return { month, attempts: inMonth.length, avgScore: Number(avgScore.toFixed(2)), topWeaknessTags };
};

const previousMonthKey = (month: string): string => {
  const [yearString, monthString] = month.split('-');
  const year = Number(yearString);
  const monthNumber = Number(monthString);
  if (monthNumber === 1) return `${year - 1}-12`;
  return `${year}-${String(monthNumber - 1).padStart(2, '0')}`;
};

export const generateMonthlyComparison = (
  memory: RepeatedErrorMemory,
  studentId: string,
  month: string
): MonthlyComparisonResult => {
  const attempts = memory.byStudent[studentId]?.attempts ?? [];
  const currentMonth = summarizeMonth(attempts, month);
  const previousMonth = summarizeMonth(attempts, previousMonthKey(month));

  const scoreDelta =
    currentMonth && previousMonth
      ? Number((currentMonth.avgScore - previousMonth.avgScore).toFixed(2))
      : null;

  return {
    studentId,
    currentMonth,
    previousMonth,
    scoreDelta,
  };
};

type WritableSubscale = 'content' | 'communicative_achievement' | 'organisation' | 'language';

const TAG_TO_SUBSCALE: Partial<Record<WeaknessTag, WritableSubscale>> = {
  missed_content_point: 'content',
  partial_content_coverage: 'content',
  irrelevant_detail: 'content',
  under_length: 'content',
  wrong_tone: 'communicative_achievement',
  weak_register_control: 'communicative_achievement',
  weak_genre_convention: 'communicative_achievement',
  weak_audience_awareness: 'communicative_achievement',
  weak_paragraphing: 'organisation',
  poor_sequencing: 'organisation',
  weak_linking: 'organisation',
  repetitive_flow: 'organisation',
  tense_error: 'language',
  agreement_error: 'language',
  article_error: 'language',
  preposition_error: 'language',
  fragment: 'language',
  run_on: 'language',
  weak_word_choice: 'language',
  spelling_error: 'language',
  punctuation_error: 'language',
};

export interface WeeklyPlanDay {
  day: string;
  task: string;
  expected_outcome: string;
}

export interface WeeklyImprovementPlan {
  primary_target: string;
  secondary_target: string;
  maintenance_target: string;
  daily_tasks: WeeklyPlanDay[];
}

const computeSubscaleWeaknessScore = (
  result: WritingAssessmentResult,
  repeatedTagCounts: Partial<Record<WeaknessTag, number>>
): Record<WritableSubscale, number> => {
  const base: Record<WritableSubscale, number> = {
    content: 5 - result.subscores.content,
    communicative_achievement:
      result.subscores.communicative_achievement === null ? 0 : 5 - result.subscores.communicative_achievement,
    organisation: 5 - result.subscores.organisation,
    language: 5 - result.subscores.language,
  };

  for (const tag of result.weakness_tags) {
    const scale = TAG_TO_SUBSCALE[tag];
    if (!scale) continue;
    base[scale] += Math.min(2, (repeatedTagCounts[tag] ?? 0) * 0.5);
  }
  return base;
};

const subscaleLabel = (scale: WritableSubscale): string => {
  if (scale === 'communicative_achievement') return 'communicative achievement';
  return scale;
};

const targetFromTagOrSubscale = (
  tag: WeaknessTag | null,
  subscale: WritableSubscale
): string => {
  if (tag) return tag.replaceAll('_', ' ');
  return `improve ${subscaleLabel(subscale)}`;
};

const buildDailyTaskSet = (
  primary: string,
  secondary: string,
  maintenance: string,
  includeLengthControl: boolean,
  assignedGenre: SupportedGenre
): WeeklyPlanDay[] => {
  const lengthNote = includeLengthControl
    ? ' Keep to ±10% of target word count.'
    : '';

  return [
    {
      day: 'Day 1',
      task: `Write a short ${assignedGenre} plan focusing on ${primary}.`,
      expected_outcome: 'Clear focus for the week and fewer repeated mistakes in the target area.',
    },
    {
      day: 'Day 2',
      task: `Complete one timed paragraph drill on ${primary}.${lengthNote}`,
      expected_outcome: 'Better control under exam timing.',
    },
    {
      day: 'Day 3',
      task: `Revise yesterday’s work and add one improvement pass for ${secondary}.`,
      expected_outcome: 'Stronger support and fewer blocking errors.',
    },
    {
      day: 'Day 4',
      task: `Write a full response in ${assignedGenre} with checklist items for ${primary} and ${secondary}.`,
      expected_outcome: 'More consistent task completion across subscales.',
    },
    {
      day: 'Day 5',
      task: `Maintenance drill: keep ${maintenance} stable while editing for accuracy.`,
      expected_outcome: 'Existing strengths remain reliable while weaker areas improve.',
    },
    {
      day: 'Day 6',
      task: `Self-assess using three questions: coverage, organisation, and language control.`,
      expected_outcome: 'Improved self-monitoring before submission.',
    },
    {
      day: 'Day 7',
      task: `Submit one final timed ${assignedGenre} response and compare with Day 1.`,
      expected_outcome: 'Visible week-over-week improvement and a clear next target.',
    },
  ];
};

const getStudentAttempts = (memory: RepeatedErrorMemory, studentId: string): StoredAttempt[] =>
  memory.byStudent[studentId]?.attempts ?? [];

const lastAttemptsContainTag = (attempts: StoredAttempt[], tag: WeaknessTag, count: number): boolean =>
  attempts
    .slice(-count)
    .every((attempt) => attempt.result.weakness_tags.includes(tag));

const tagImprovedAcrossThreeAttempts = (attempts: StoredAttempt[], tag: WeaknessTag): boolean => {
  if (attempts.length < 4) return false;
  const recent = attempts.slice(-3);
  const prior = attempts.slice(0, -3);
  const absentRecently = recent.every((attempt) => !attempt.result.weakness_tags.includes(tag));
  const existedBefore = prior.some((attempt) => attempt.result.weakness_tags.includes(tag));
  return absentRecently && existedBefore;
};

export interface WeeklyPlanInput {
  assessment: WritingAssessmentResult;
  grade: number;
  genre: SupportedGenre;
  repeatedErrorMemory: RepeatedErrorMemory;
  studentId: string;
}

export const generateWeeklyImprovementPlan = (input: WeeklyPlanInput): WeeklyImprovementPlan => {
  const attempts = getStudentAttempts(input.repeatedErrorMemory, input.studentId);
  const tagCounts = input.repeatedErrorMemory.byStudent[input.studentId]?.tagCounts ?? {};

  const weaknessBySubscale = computeSubscaleWeaknessScore(input.assessment, tagCounts);
  const sortedSubscales = (Object.keys(weaknessBySubscale) as WritableSubscale[]).sort(
    (a, b) => weaknessBySubscale[b] - weaknessBySubscale[a]
  );

  const recentlyObservedTags = new Set(
    attempts.slice(-3).flatMap((attempt) => attempt.result.weakness_tags)
  );
  const historicalTags = (Object.entries(tagCounts) as Array<[WeaknessTag, number | undefined]>)
    .filter(([tag, count]) => (count ?? 0) > 0 && recentlyObservedTags.has(tag))
    .sort((left, right) => {
      const countDelta = (right[1] ?? 0) - (left[1] ?? 0);
      if (countDelta !== 0) return countDelta;
      const leftLatestIndex = attempts.map((attempt) => attempt.result.weakness_tags.includes(left[0])).lastIndexOf(true);
      const rightLatestIndex = attempts.map((attempt) => attempt.result.weakness_tags.includes(right[0])).lastIndexOf(true);
      return rightLatestIndex - leftLatestIndex;
    })
    .map(([tag]) => tag);
  const weaknessTags = [...new Set([
    ...input.assessment.weakness_tags,
    ...historicalTags,
  ])];
  const repeatedPrimaryTag = weaknessTags.find((tag) => (tagCounts[tag] ?? 0) >= 2);
  const primarySubscale = sortedSubscales[0];
  const primaryTag =
    repeatedPrimaryTag ??
    weaknessTags.find((tag) => TAG_TO_SUBSCALE[tag] === primarySubscale) ??
    null;

  const secondarySubscale = sortedSubscales.find((scale) => scale !== primarySubscale) ?? 'organisation';
  const secondaryTag =
    weaknessTags.find((tag) => tag !== primaryTag && TAG_TO_SUBSCALE[tag] === secondarySubscale) ?? null;

  const strengths: Array<{ key: WritableSubscale; value: number }> = [
    { key: 'content', value: input.assessment.subscores.content },
    { key: 'organisation', value: input.assessment.subscores.organisation },
    { key: 'language', value: input.assessment.subscores.language },
  ];
  if (input.assessment.subscores.communicative_achievement !== null) {
    strengths.push({ key: 'communicative_achievement', value: input.assessment.subscores.communicative_achievement });
  }
  strengths.sort((a, b) => b.value - a.value);

  let maintenance = `maintain ${subscaleLabel(strengths[0].key)}`;
  const improvedTag = weaknessTags.find((tag) => tagImprovedAcrossThreeAttempts(attempts, tag));
  if (improvedTag) maintenance = `maintain recent gain in ${improvedTag.replaceAll('_', ' ')}`;

  const sameGenreNeeded = weaknessTags.some((tag) =>
    ['weak_genre_convention', 'wrong_tone', 'weak_register_control'].includes(tag)
  );
  const assignedGenre = sameGenreNeeded ? input.genre : input.genre;

  const poorWordCountControl = weaknessTags.includes('under_length') && lastAttemptsContainTag(attempts, 'under_length', 2);

  const primaryTarget = targetFromTagOrSubscale(primaryTag, primarySubscale);
  const secondaryTarget = targetFromTagOrSubscale(secondaryTag, secondarySubscale);

  return {
    primary_target: primaryTarget,
    secondary_target: secondaryTarget,
    maintenance_target: maintenance,
    daily_tasks: buildDailyTaskSet(primaryTarget, secondaryTarget, maintenance, poorWordCountControl, assignedGenre),
  };
};

export interface StudentFacingFeedback {
  total_score: number;
  subscale_summary: string[];
  top_3_weaknesses: string[];
  what_you_did_well: string[];
  what_to_improve_next: string[];
  motivational_next_step: string;
}

export const buildStudentFacingFeedback = (assessment: WritingAssessmentResult): StudentFacingFeedback => {
  const subscaleSummary = [
    `Content: ${assessment.subscores.content}/5`,
    `Organisation: ${assessment.subscores.organisation}/5`,
    `Language: ${assessment.subscores.language}/5`,
  ];
  if (assessment.subscores.communicative_achievement !== null) {
    subscaleSummary.splice(1, 0, `Communicative Achievement: ${assessment.subscores.communicative_achievement}/5`);
  }

  const strengths: string[] = [];
  if (assessment.subscores.content >= 4) strengths.push('You covered the task points clearly.');
  if (assessment.subscores.organisation >= 4) strengths.push('Your ideas were easy to follow.');
  if (assessment.subscores.language >= 4) strengths.push('Your language was mostly accurate and clear.');
  if (assessment.subscores.communicative_achievement !== null && assessment.subscores.communicative_achievement >= 4) {
    strengths.push('Your tone and style matched the task well.');
  }
  if (strengths.length === 0) strengths.push('You communicated key ideas and stayed on task.');

  const topWeaknesses = assessment.weakness_tags.slice(0, 3).map((tag) => tag.replaceAll('_', ' '));

  return {
    total_score: assessment.total_score,
    subscale_summary: subscaleSummary,
    top_3_weaknesses: topWeaknesses,
    what_you_did_well: strengths,
    what_to_improve_next: assessment.top_3_priorities,
    motivational_next_step: 'Keep your next draft focused on one main target—you are closer than you think.',
  };
};

export interface MonthlyGrowthReport {
  score_change: string;
  subscale_progress: string[];
  repeated_mistakes_reduced: string[];
  strongest_gains: string[];
  remaining_blockers: string[];
  next_month_priorities: string[];
}

const averageSubscaleScores = (attempts: StoredAttempt[]): Record<WritableSubscale, number> => {
  if (attempts.length === 0) {
    return { content: 0, communicative_achievement: 0, organisation: 0, language: 0 };
  }
  const totals = attempts.reduce(
    (acc, attempt) => {
      acc.content += attempt.result.subscores.content;
      acc.organisation += attempt.result.subscores.organisation;
      acc.language += attempt.result.subscores.language;
      acc.communicative_achievement += attempt.result.subscores.communicative_achievement ?? 0;
      return acc;
    },
    { content: 0, communicative_achievement: 0, organisation: 0, language: 0 }
  );
  return {
    content: totals.content / attempts.length,
    communicative_achievement: totals.communicative_achievement / attempts.length,
    organisation: totals.organisation / attempts.length,
    language: totals.language / attempts.length,
  };
};

export const formatMonthlyGrowthReport = (
  summary: MonthlyComparisonResult,
  memory: RepeatedErrorMemory
): MonthlyGrowthReport => {
  const attempts = memory.byStudent[summary.studentId]?.attempts ?? [];
  const currentMonthKey = summary.currentMonth?.month ?? '';
  const previousMonthKeyValue = summary.previousMonth?.month ?? '';
  const currentAttempts = attempts.filter((attempt) => monthKey(attempt.attemptedAt) === currentMonthKey);
  const previousAttempts = attempts.filter((attempt) => monthKey(attempt.attemptedAt) === previousMonthKeyValue);

  const currentAvg = averageSubscaleScores(currentAttempts);
  const previousAvg = averageSubscaleScores(previousAttempts);

  const subscaleProgress = (['content', 'organisation', 'language', 'communicative_achievement'] as WritableSubscale[])
    .map((key) => {
      const delta = currentAvg[key] - previousAvg[key];
      const rounded = Math.round(delta * 10) / 10;
      if (Math.abs(rounded) < 0.1) return `${subscaleLabel(key)} is stable this month.`;
      return `${subscaleLabel(key)} ${rounded > 0 ? 'improved' : 'dipped'} by ${Math.abs(rounded).toFixed(1)} point${Math.abs(rounded) === 1 ? '' : 's'}.`;
    });

  const prevTop = new Set(summary.previousMonth?.topWeaknessTags ?? []);
  const currentTop = new Set(summary.currentMonth?.topWeaknessTags ?? []);
  const reduced = [...prevTop].filter((tag) => !currentTop.has(tag)).map((tag) => tag.replaceAll('_', ' '));
  const remaining = [...currentTop].map((tag) => tag.replaceAll('_', ' '));

  const strongestGains = (['content', 'organisation', 'language', 'communicative_achievement'] as WritableSubscale[])
    .map((key) => ({ key, value: currentAvg[key] - previousAvg[key] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((item) => `${subscaleLabel(item.key)}: ${item.value > 0.05 ? 'showing clear improvement' : 'still building'}`);

  const nextPriorities = remaining.slice(0, 3).map((item) => `Keep improving: ${item}.`);

  return {
    score_change:
      summary.scoreDelta === null
        ? 'You are just getting started, so we do not have a month-to-month comparison yet.'
        : summary.scoreDelta >= 0
          ? `Your average score is up by about ${Math.round(summary.scoreDelta)} point${Math.round(summary.scoreDelta) === 1 ? '' : 's'} this month.`
          : `This month was harder: your average score is down by about ${Math.abs(Math.round(summary.scoreDelta))} point${Math.abs(Math.round(summary.scoreDelta)) === 1 ? '' : 's'}.`,
    subscale_progress: subscaleProgress,
    repeated_mistakes_reduced: reduced.length > 0 ? reduced : ['No clear reductions yet — keep practising to unlock this trend.'],
    strongest_gains: strongestGains.length > 0 ? strongestGains : ['No clear gains yet — complete more tasks to see improvement signals.'],
    remaining_blockers: remaining.length > 0 ? remaining : ['No major recurring blockers right now.'],
    next_month_priorities: nextPriorities.length > 0 ? nextPriorities : ['Keep your weekly writing habit to build steady progress.'],
  };
};
