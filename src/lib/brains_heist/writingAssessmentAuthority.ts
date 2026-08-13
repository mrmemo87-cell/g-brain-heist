import {
  SupportedGenre,
  TRUSTED_WRITING_EVALUATOR_VERSIONS,
  WeaknessTag,
  WRITING_EVALUATOR_VERSION,
  WRITING_RUBRIC_VERSION,
  WritingAssessmentResult,
  WritingCriterionAssessment,
  WritingCriterionKey,
  WritingEvidenceSpan,
  WritingPromptAssessmentDefinition,
} from './writingAssessment.js';

export const WRITING_CRITERIA: WritingCriterionKey[] = [
  'content',
  'communicative_achievement',
  'organisation',
  'language',
];

export const WRITING_STRENGTH_TAGS = [
  'strong_content_coverage',
  'strong_task_completion',
  'strong_idea_development',
  'strong_organisation',
  'strong_genre_convention',
  'strong_audience_awareness',
  'strong_vocabulary',
  'strong_sentence_control',
  'strong_language_accuracy',
  'strong_punctuation',
  'strong_spelling',
] as const;

export type WritingStrengthTag = typeof WRITING_STRENGTH_TAGS[number];
export interface WritingStrengthEvidence {
  strength_tag: WritingStrengthTag;
  evidence: string;
  explanation: string;
  start_char: number;
  end_char: number;
}

export interface AuthoritativeWritingFeedback {
  task_understanding: string;
  submission_read: string;
  alignment: 'on_task' | 'partially_on_task' | 'off_topic' | 'too_short' | 'underdeveloped' | 'mostly_correct_but_needs_polish';
  what_is_working: string[];
  what_is_missing: string[];
  grammar_fixes: unknown[];
  punctuation_fixes: unknown[];
  natural_phrase_upgrades: unknown[];
  style_tone_feedback: unknown[];
  next_move: string;
  example_revision_start: string;
  strengths: string[];
  strength_evidence: WritingStrengthEvidence[];
  weaknesses: string[];
  weakness_tags: WeaknessTag[];
  next_steps: string[];
  monthly_report_summary: string;
  anchor_version?: string;
  text_fingerprint: string;
  highlights?: unknown[];
  repair_steps?: unknown[];
}

export interface AuthoritativeWritingAssessmentPayload {
  assessment: WritingAssessmentResult;
  feedback: AuthoritativeWritingFeedback;
  meta?: {
    openai_request_id?: string | null;
    usage?: unknown;
  };
}

export interface AuthoritativeWritingAssessmentContext {
  grade: number;
  genre: SupportedGenre;
  targetWordCount: number;
  promptId: string | null;
  studentResponse: string;
}

export type AuthorityValidationResult =
  | { ok: true; data: AuthoritativeWritingAssessmentPayload }
  | { ok: false; error: string };

const allowedWeaknessTags = new Set<WeaknessTag>([
  'missed_content_point',
  'partial_content_coverage',
  'irrelevant_detail',
  'under_length',
  'wrong_tone',
  'weak_register_control',
  'weak_genre_convention',
  'weak_audience_awareness',
  'weak_paragraphing',
  'poor_sequencing',
  'weak_linking',
  'repetitive_flow',
  'tense_error',
  'agreement_error',
  'article_error',
  'preposition_error',
  'fragment',
  'run_on',
  'weak_word_choice',
  'spelling_error',
  'punctuation_error',
]);
const allowedStrengthTags = new Set<WritingStrengthTag>(WRITING_STRENGTH_TAGS);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const asStringArray = (value: unknown, minimum = 0): string[] | null => {
  if (!Array.isArray(value)) return null;
  const values = value.map(asNonEmptyString).filter((item): item is string => Boolean(item));
  return values.length >= minimum ? values : null;
};

export const normalizeWritingTextForFingerprint = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

export const buildWritingTextFingerprint = (value: string): string => {
  const normalized = normalizeWritingTextForFingerprint(value);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
};

const countWords = (value: string): number => value.trim().match(/[A-Za-z0-9']+/g)?.length ?? 0;

const normalizeEvidence = (value: unknown, studentResponse: string): WritingEvidenceSpan[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const spans: WritingEvidenceSpan[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const quote = asNonEmptyString(record?.['quote']);
    const start = record?.['start_char'];
    const end = record?.['end_char'];
    if (!quote || !Number.isInteger(start) || !Number.isInteger(end)) return null;
    const startChar = Number(start);
    const endChar = Number(end);
    if (startChar < 0 || endChar !== startChar + quote.length) return null;
    if (studentResponse.slice(startChar, endChar) !== quote) return null;
    spans.push({ quote, start_char: startChar, end_char: endChar });
  }
  return spans.slice(0, 6);
};

const normalizeCriterion = (value: unknown, studentResponse: string): WritingCriterionAssessment | null => {
  const record = asRecord(value);
  if (!record) return null;
  const score = record['score'];
  const confidence = record['confidence'];
  const descriptorId = asNonEmptyString(record['descriptor_id']);
  const justification = asNonEmptyString(record['justification']);
  const evidence = normalizeEvidence(record['evidence'], studentResponse);
  if (!Number.isInteger(score) || Number(score) < 0 || Number(score) > 5) return null;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  if (!descriptorId || !justification || justification.length < 12 || !evidence) return null;
  return {
    score: Number(score),
    confidence,
    descriptor_id: descriptorId,
    justification,
    evidence,
  };
};

const normalizePromptDefinition = (
  value: unknown,
  context: AuthoritativeWritingAssessmentContext
): WritingPromptAssessmentDefinition | null => {
  const record = asRecord(value);
  if (!record) return null;
  const grade = record['grade'];
  const targetWordCount = record['target_word_count'];
  const genre = record['genre'];
  const register = record['register'];
  const difficulty = record['difficulty_level'];
  const promptId = record['prompt_id'];
  // `public.users.grade` is a text column in the deployed schema. Some route
  // callers therefore pass a numeric-looking string at runtime even though the
  // TypeScript contract is numeric. Normalize that trusted route value before
  // comparing it with the Edge Function's canonical numeric grade, while
  // keeping every other provenance field exact and fail-closed.
  const contextGrade = Number(context.grade);
  const validRegister = register === 'informal' || register === 'neutral' || register === 'formal' || register === 'mixed';
  const validDifficulty = difficulty === 'foundational' || difficulty === 'core' || difficulty === 'stretch';
  if (!Number.isInteger(contextGrade) || contextGrade < 6 || contextGrade > 12) return null;
  if (grade !== contextGrade || genre !== context.genre || targetWordCount !== context.targetWordCount) return null;
  if (promptId !== context.promptId || !validRegister || !validDifficulty) return null;
  const promptDefinitionHash = asNonEmptyString(record['prompt_definition_hash']);
  const audience = asNonEmptyString(record['audience']);
  const purpose = asNonEmptyString(record['purpose']);
  if (!promptDefinitionHash || !audience || !purpose) return null;
  return {
    prompt_id: promptId as string | null,
    prompt_definition_hash: promptDefinitionHash,
    grade: contextGrade,
    genre: context.genre,
    target_word_count: context.targetWordCount,
    audience,
    purpose,
    register,
    difficulty_level: difficulty,
  };
};

const normalizeFeedback = (value: unknown, fingerprint: string, studentResponse: string): AuthoritativeWritingFeedback | null => {
  const record = asRecord(value);
  if (!record || record['text_fingerprint'] !== fingerprint) return null;
  const alignment = record['alignment'];
  const validAlignment = alignment === 'on_task'
    || alignment === 'partially_on_task'
    || alignment === 'off_topic'
    || alignment === 'too_short'
    || alignment === 'underdeveloped'
    || alignment === 'mostly_correct_but_needs_polish';
  const taskUnderstanding = asNonEmptyString(record['task_understanding']);
  const submissionRead = asNonEmptyString(record['submission_read']);
  const nextMove = asNonEmptyString(record['next_move']);
  const monthlySummary = asNonEmptyString(record['monthly_report_summary']);
  const strengths = asStringArray(record['strengths'], 1);
  const strengthEvidence = Array.isArray(record['strength_evidence'])
    ? record['strength_evidence'].flatMap((item): WritingStrengthEvidence[] => {
        const evidenceRecord = asRecord(item);
        const tag = evidenceRecord?.['strength_tag'];
        const evidence = asNonEmptyString(evidenceRecord?.['evidence']);
        const explanation = asNonEmptyString(evidenceRecord?.['explanation']);
        const start = evidenceRecord?.['start_char'];
        const end = evidenceRecord?.['end_char'];
        if (!allowedStrengthTags.has(tag as WritingStrengthTag) || !evidence || !explanation) return [];
        if (!Number.isInteger(start) || !Number.isInteger(end) || Number(start) < 0 || Number(end) <= Number(start)) return [];
        if (studentResponse.slice(Number(start), Number(end)) !== evidence) return [];
        return [{ strength_tag: tag as WritingStrengthTag, evidence, explanation, start_char: Number(start), end_char: Number(end) }];
      })
    : [];
  const weaknesses = asStringArray(record['weaknesses'], 0);
  const nextSteps = asStringArray(record['next_steps'], 1);
  const whatIsWorking = asStringArray(record['what_is_working'], 1);
  const whatIsMissing = asStringArray(record['what_is_missing'], 0);
  if (!validAlignment || !taskUnderstanding || !submissionRead || !nextMove || !monthlySummary) return null;
  if (!strengths || strengthEvidence.length === 0 || !weaknesses || !nextSteps || !whatIsWorking || !whatIsMissing) return null;
  const weaknessTags = Array.isArray(record['weakness_tags'])
    ? [...new Set(record['weakness_tags'].map(String).filter((tag): tag is WeaknessTag => allowedWeaknessTags.has(tag as WeaknessTag)))].slice(0, 12)
    : [];
  return {
    task_understanding: taskUnderstanding,
    submission_read: submissionRead,
    alignment,
    what_is_working: whatIsWorking,
    what_is_missing: whatIsMissing,
    grammar_fixes: Array.isArray(record['grammar_fixes']) ? record['grammar_fixes'] : [],
    punctuation_fixes: Array.isArray(record['punctuation_fixes']) ? record['punctuation_fixes'] : [],
    natural_phrase_upgrades: Array.isArray(record['natural_phrase_upgrades']) ? record['natural_phrase_upgrades'] : [],
    style_tone_feedback: Array.isArray(record['style_tone_feedback']) ? record['style_tone_feedback'] : [],
    next_move: nextMove,
    example_revision_start: typeof record['example_revision_start'] === 'string' ? record['example_revision_start'] : '',
    strengths,
    strength_evidence: strengthEvidence,
    weaknesses,
    weakness_tags: weaknessTags,
    next_steps: nextSteps,
    monthly_report_summary: monthlySummary,
    anchor_version: typeof record['anchor_version'] === 'string' ? record['anchor_version'] : undefined,
    text_fingerprint: fingerprint,
    highlights: Array.isArray(record['highlights']) ? record['highlights'] : [],
    repair_steps: Array.isArray(record['repair_steps']) ? record['repair_steps'] : [],
  };
};

export const normalizeAuthoritativeWritingAssessment = (
  raw: unknown,
  context: AuthoritativeWritingAssessmentContext
): AuthorityValidationResult => {
  const payload = asRecord(raw);
  const assessmentRecord = asRecord(payload?.['assessment']);
  if (!payload || !assessmentRecord) return { ok: false, error: 'Assessment response is incomplete.' };
  const fingerprint = buildWritingTextFingerprint(context.studentResponse);
  if (assessmentRecord['text_fingerprint'] !== fingerprint) {
    return { ok: false, error: 'Assessment response does not match this draft.' };
  }
  const evaluatorVersion = assessmentRecord['evaluator_version'];
  if (
    assessmentRecord['rubric_version'] !== WRITING_RUBRIC_VERSION
    || !TRUSTED_WRITING_EVALUATOR_VERSIONS.includes(evaluatorVersion as typeof TRUSTED_WRITING_EVALUATOR_VERSIONS[number])
  ) {
    return { ok: false, error: 'Assessment version is not trusted.' };
  }
  const assessmentId = asNonEmptyString(assessmentRecord['assessment_id']);
  const evaluatorModel = asNonEmptyString(assessmentRecord['evaluator_model']);
  const promptDefinition = normalizePromptDefinition(assessmentRecord['prompt_definition'], context);
  if (!assessmentId || !evaluatorModel || !promptDefinition) {
    return { ok: false, error: 'Assessment provenance is incomplete.' };
  }
  const criteriaRecord = asRecord(assessmentRecord['criteria']);
  if (!criteriaRecord) return { ok: false, error: 'Criterion evidence is missing.' };
  const criteria = {} as Record<WritingCriterionKey, WritingCriterionAssessment>;
  for (const key of WRITING_CRITERIA) {
    const criterion = normalizeCriterion(criteriaRecord[key], context.studentResponse);
    if (!criterion) return { ok: false, error: `${key} evidence could not be verified.` };
    criteria[key] = criterion;
  }
  const totalScore = WRITING_CRITERIA.reduce((sum, key) => sum + criteria[key].score, 0);
  if (assessmentRecord['total_score'] !== totalScore) {
    return { ok: false, error: 'Assessment total does not match its criterion scores.' };
  }
  const confidences = WRITING_CRITERIA.map((key) => criteria[key].confidence);
  const averageConfidence = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  const assessmentStatus = assessmentRecord['assessment_status'];
  if (assessmentStatus !== 'verified' && assessmentStatus !== 'needs_review') {
    return { ok: false, error: 'Assessment status is not trusted.' };
  }
  const releaseGatePassed = confidences.every((value) => value >= 0.65) && averageConfidence >= 0.75;
  if (assessmentStatus === 'verified' && !releaseGatePassed) {
    return { ok: false, error: 'Verified assessment confidence does not pass the release gate.' };
  }
  const feedback = normalizeFeedback(payload['feedback'], fingerprint, context.studentResponse);
  if (!feedback) return { ok: false, error: 'Cinematic feedback evidence is incomplete.' };
  const actualWordCount = countWords(context.studentResponse);
  const assessment: WritingAssessmentResult = {
    grade: String(context.grade),
    genre: context.genre,
    score_mode: 'B1B2_4_scale',
    target_word_count: context.targetWordCount,
    actual_word_count: actualWordCount,
    subscores: {
      content: criteria.content.score,
      communicative_achievement: criteria.communicative_achievement.score,
      organisation: criteria.organisation.score,
      language: criteria.language.score,
    },
    total_score: totalScore,
    band_justification: {
      content: criteria.content.justification,
      communicative_achievement: criteria.communicative_achievement.justification,
      organisation: criteria.organisation.justification,
      language: criteria.language.justification,
    },
    detected_content_points: Array.isArray(assessmentRecord['detected_content_points'])
      ? assessmentRecord['detected_content_points'].map(String)
      : [],
    missed_content_points: Array.isArray(assessmentRecord['missed_content_points'])
      ? assessmentRecord['missed_content_points'].map(String)
      : [],
    weakness_tags: feedback.weakness_tags,
    top_3_priorities: feedback.next_steps.slice(0, 3),
    monthly_tracking_ready: true,
    academic_profile_ready: assessmentStatus === 'verified',
    assessment_id: assessmentId,
    assessment_status: assessmentStatus,
    rubric_version: WRITING_RUBRIC_VERSION,
    evaluator_version: String(evaluatorVersion),
    evaluator_model: evaluatorModel,
    text_fingerprint: fingerprint,
    prompt_definition: promptDefinition,
    criteria,
    shadow_heuristic_total: Number.isInteger(assessmentRecord['shadow_heuristic_total'])
      ? Number(assessmentRecord['shadow_heuristic_total'])
      : undefined,
    adjudication_reason: typeof assessmentRecord['adjudication_reason'] === 'string'
      ? assessmentRecord['adjudication_reason']
      : null,
  };
  return {
    ok: true,
    data: {
      assessment,
      feedback,
      meta: asRecord(payload['meta']) as AuthoritativeWritingAssessmentPayload['meta'],
    },
  };
};

export const isAcademicProfileWritingAssessment = (assessment: WritingAssessmentResult | null | undefined): boolean =>
  Boolean(
    assessment
    && assessment.academic_profile_ready === true
    && assessment.assessment_status === 'verified'
    && assessment.rubric_version === WRITING_RUBRIC_VERSION
    && TRUSTED_WRITING_EVALUATOR_VERSIONS.includes(
      assessment.evaluator_version as typeof TRUSTED_WRITING_EVALUATOR_VERSIONS[number]
    )
  );
