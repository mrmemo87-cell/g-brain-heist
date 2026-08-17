export type WritingIntegrityMode = 'formal' | 'practice' | 'independent' | 'supervised';

export type WritingIntegrityReviewStatus =
  | 'practice_mode'
  | 'no_concerns_observed'
  | 'review_recommended';

export interface WritingCompositionTelemetry {
  mode: WritingIntegrityMode;
  started_at: string | null;
  submitted_at: string | null;
  elapsed_seconds: number;
  typed_characters: number;
  pasted_characters: number;
  paste_events: number;
  blocked_paste_events: number;
  largest_paste_characters: number;
  deleted_characters: number;
  focus_loss_count: number;
  visibility_hidden_count: number;
  tab_change_count: number;
  tab_change_warning_count: number;
  prompt_restart_count: number;
  time_limit_seconds: number | null;
  full_replacement_count: number;
  revision_origin_attempt_id: string | null;
  revision_changed_word_percent: number | null;
  paste_ratio: number;
  review_status: WritingIntegrityReviewStatus;
  review_reasons: string[];
}

const countWords = (value: string): number =>
  value.trim().match(/[A-Za-z0-9']+/g)?.length ?? 0;

const normalizeWords = (value: string): string[] =>
  (value.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(Boolean);

const calculateChangedWordPercent = (original: string, revised: string): number | null => {
  const before = normalizeWords(original);
  const after = normalizeWords(revised);
  if (before.length === 0 || after.length === 0) return null;
  const beforeCounts = new Map<string, number>();
  before.forEach((word) => beforeCounts.set(word, (beforeCounts.get(word) ?? 0) + 1));
  let shared = 0;
  after.forEach((word) => {
    const remaining = beforeCounts.get(word) ?? 0;
    if (remaining <= 0) return;
    shared += 1;
    beforeCounts.set(word, remaining - 1);
  });
  const denominator = Math.max(before.length, after.length);
  return Math.round((1 - shared / denominator) * 100);
};

export const createWritingCompositionTelemetry = (
  mode: WritingIntegrityMode,
  revisionOriginAttemptId: string | null = null,
  timeLimitSeconds: number | null = null
): WritingCompositionTelemetry => ({
  mode,
  started_at: mode === 'formal' ? new Date().toISOString() : null,
  submitted_at: null,
  elapsed_seconds: 0,
  typed_characters: 0,
  pasted_characters: 0,
  paste_events: 0,
  blocked_paste_events: 0,
  largest_paste_characters: 0,
  deleted_characters: 0,
  focus_loss_count: 0,
  visibility_hidden_count: 0,
  tab_change_count: 0,
  tab_change_warning_count: 0,
  prompt_restart_count: 0,
  time_limit_seconds: timeLimitSeconds,
  full_replacement_count: 0,
  revision_origin_attempt_id: revisionOriginAttemptId,
  revision_changed_word_percent: null,
  paste_ratio: 0,
  review_status: mode === 'practice' ? 'practice_mode' : 'no_concerns_observed',
  review_reasons: [],
});

const ensureStarted = (
  telemetry: WritingCompositionTelemetry,
  occurredAt: Date
): WritingCompositionTelemetry =>
  telemetry.started_at
    ? telemetry
    : { ...telemetry, started_at: occurredAt.toISOString() };

export const recordWritingInput = (
  telemetry: WritingCompositionTelemetry,
  previousValue: string,
  nextValue: string,
  occurredAt = new Date(),
  pastedCharactersToIgnore = 0
): WritingCompositionTelemetry => {
  const started = ensureStarted(telemetry, occurredAt);
  const added = Math.max(0, nextValue.length - previousValue.length - pastedCharactersToIgnore);
  const deleted = Math.max(0, previousValue.length - nextValue.length);
  const replacedNearlyAll =
    previousValue.length >= 80 &&
    nextValue.length >= 80 &&
    Math.abs(previousValue.length - nextValue.length) < Math.max(20, previousValue.length * 0.25) &&
    previousValue.slice(0, 40) !== nextValue.slice(0, 40);
  return {
    ...started,
    typed_characters: started.typed_characters + added,
    deleted_characters: started.deleted_characters + deleted,
    full_replacement_count: started.full_replacement_count + (replacedNearlyAll ? 1 : 0),
  };
};

export const recordWritingPaste = (
  telemetry: WritingCompositionTelemetry,
  characterCount: number,
  blocked: boolean,
  occurredAt = new Date()
): WritingCompositionTelemetry => {
  const started = ensureStarted(telemetry, occurredAt);
  return {
    ...started,
    pasted_characters: started.pasted_characters + (blocked ? 0 : Math.max(0, characterCount)),
    paste_events: started.paste_events + 1,
    blocked_paste_events: started.blocked_paste_events + (blocked ? 1 : 0),
    largest_paste_characters: Math.max(started.largest_paste_characters, Math.max(0, characterCount)),
  };
};

export const recordWritingFocusLoss = (
  telemetry: WritingCompositionTelemetry
): WritingCompositionTelemetry => ({
  ...telemetry,
  focus_loss_count: telemetry.focus_loss_count + 1,
});

export const recordWritingVisibilityHidden = (
  telemetry: WritingCompositionTelemetry
): WritingCompositionTelemetry => ({
  ...telemetry,
  visibility_hidden_count: telemetry.visibility_hidden_count + 1,
  tab_change_count: telemetry.tab_change_count + 1,
  tab_change_warning_count: telemetry.tab_change_warning_count + (telemetry.tab_change_count === 0 ? 1 : 0),
});

export const finalizeWritingCompositionTelemetry = (
  telemetry: WritingCompositionTelemetry,
  submission: string,
  revisionOriginText = '',
  submittedAt = new Date()
): WritingCompositionTelemetry => {
  const startedAt = telemetry.started_at ? new Date(telemetry.started_at).getTime() : submittedAt.getTime();
  const elapsedSeconds = Math.max(0, Math.round((submittedAt.getTime() - startedAt) / 1000));
  const submissionCharacters = Math.max(1, submission.length);
  const pasteRatio = Math.min(1, telemetry.pasted_characters / submissionCharacters);
  const reasons: string[] = [];

  if (telemetry.pasted_characters >= 120 || pasteRatio >= 0.35) reasons.push('substantial_paste');
  if (telemetry.blocked_paste_events > 0) reasons.push('blocked_paste_attempt');
  if (elapsedSeconds < 45 && countWords(submission) >= 100) reasons.push('very_fast_completion');
  if (telemetry.full_replacement_count > 0) reasons.push('large_text_replacement');
  if (telemetry.tab_change_count > 0) reasons.push('left_writing_page');
  if (telemetry.mode === 'supervised' && telemetry.visibility_hidden_count > 0) reasons.push('left_supervised_page');

  const reviewStatus: WritingIntegrityReviewStatus =
    reasons.length > 0
      ? 'review_recommended'
      : telemetry.mode === 'practice'
        ? 'practice_mode'
        : 'no_concerns_observed';

  return {
    ...telemetry,
    submitted_at: submittedAt.toISOString(),
    elapsed_seconds: elapsedSeconds,
    paste_ratio: Number(pasteRatio.toFixed(2)),
    revision_changed_word_percent: revisionOriginText
      ? calculateChangedWordPercent(revisionOriginText, submission)
      : null,
    review_status: reviewStatus,
    review_reasons: reasons,
  };
};

export const toWritingIntegrityModeLabel = (mode: WritingIntegrityMode): string => {
  if (mode === 'formal') return 'Formal Cambridge-aligned assessment';
  if (mode === 'supervised') return 'Supervised assessment';
  if (mode === 'independent') return 'Independent writing';
  return 'Practice mode';
};

export const toWritingIntegrityReviewLabel = (
  status: WritingIntegrityReviewStatus
): string => {
  if (status === 'review_recommended') return 'Teacher review recommended';
  if (status === 'no_concerns_observed') return 'No integrity concerns observed';
  return 'Practice mode - authorship not verified';
};
