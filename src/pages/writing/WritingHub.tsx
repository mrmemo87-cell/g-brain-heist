import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getCurrentWeeklyPlan,
  getStudentGenrePathStatuses,
  getWritingHydrationStatus,
  getWritingPersistenceStatus,
  getMonthlyWritingReport,
  requestWritingAiAssist,
  persistInitialWritingRichFeedback,
  retryWritingHydration,
  subscribeToWritingPersistenceStatus,
  subscribeToWritingHydrationStatus,
  getStudentWritingState,
  getStudentWritingHubSnapshot,
  getSmartWritingPromptForStudent,
  getTodayWritingTask,
  getWeeklyWritingReview,
  submitDailyWritingPractice,
  submitInitialWritingAssessment,
} from '../../lib/brains_heist/writingIntegrationService.js';
import { FALLBACK_PROMPT_BY_GENRE, WEAKNESS_TAG_TO_MISSION_CATEGORY } from '../../lib/brains_heist/writingPromptProgression.js';
import { quest_get_missions, QuestMissionRow } from '../../../services/gameService.js';

interface WritingHubProps {
  studentId: string;
  studentName?: string;
  grade: number;
  genre: 'email' | 'article' | 'review' | 'story' | 'essay' | 'report' | 'paragraph';
  month?: string;
  onOpenQuestMission?: (missionId?: string) => void;
}
type SupportedGenre = WritingHubProps['genre'];

export interface WritingDashboardSnapshot {
  weekly_plan_summary: {
    primary: string;
    secondary: string;
    maintenance: string;
  } | null;
  todays_task_title: string | null;
  completed_tasks_count: number;
  latest_total_score: number | null;
  monthly_growth_summary: string | null;
}

interface WritingAiPlanAssist {
  focus?: string;
  coaching_points?: string[];
  rewritten_prompt?: string;
  daily_task?: string;
}

interface WritingAiFeedbackAssist {
  task_understanding?: string;
  submission_read?: string;
  alignment?: 'on_task' | 'partially_on_task' | 'off_topic' | 'too_short' | 'underdeveloped' | 'mostly_correct_but_needs_polish';
  what_is_working?: string[];
  what_is_missing?: string[];
  grammar_fixes?: Array<{ original: string; issue: string; better_version: string }>;
  punctuation_fixes?: Array<{ original: string; issue: string; better_version: string }>;
  natural_phrase_upgrades?: Array<{ original: string; better_version: string; why_it_helps: string }>;
  style_tone_feedback?: Array<{ evidence: string; issue: string; suggestion: string }>;
  next_move?: string;
  example_revision_start?: string;
  strengths?: string[];
  weaknesses?: string[];
  next_steps?: string[];
  monthly_report_summary?: string;
  anchor_version?: string;
  text_fingerprint?: string;
  highlights?: Array<{
    id?: string;
    polarity?: 'strong' | 'weak';
    category?: string;
    start_char?: number;
    end_char?: number;
    sentence_index?: number;
    paragraph_index?: number;
    exact_text?: string;
    confidence?: number;
  }>;
  repair_steps?: Array<{
    id?: string;
    highlight_id?: string;
    step_type?: string;
    title?: string;
    instruction?: string;
    source_field?: string;
    done_criteria?: string;
    evidence?: string;
  }>;
}

interface TextAnchorRange {
  start: number;
  end: number;
  polarity: 'strong' | 'weak';
  reason?: string;
}

interface RepairQueueItem {
  id: string;
  title: string;
  category: 'content' | 'grammar' | 'punctuation' | 'style' | 'next_step';
  explanation: string;
  evidenceSnippet?: string;
}

export type AnchorTrustMode = 'trusted' | 'missing_fingerprint' | 'stale_feedback' | 'no_anchors' | 'no_feedback';

interface AnchorTrustEvaluation {
  mode: AnchorTrustMode;
  localFingerprint: string | null;
  persistedFingerprint: string | null;
}

interface WritingMissionCategoryMeta {
  label: string;
  practiceTitle: string;
  reasonTemplate: string;
  keywordHints: string[];
}

interface WritingMissionRecommendation {
  weaknessTag: string;
  weaknessLabel: string;
  missionCategory: string;
  missionCategoryLabel: string;
  title: string;
  reason: string;
  source: 'quest' | 'category_fallback';
  mission?: Pick<QuestMissionRow, 'id' | 'title' | 'subject' | 'difficulty' | 'mission_type'>;
}

const toAlignmentLabel = (alignment?: WritingAiFeedbackAssist['alignment']): string => {
  const labels: Record<NonNullable<WritingAiFeedbackAssist['alignment']>, string> = {
    on_task: 'On task',
    partially_on_task: 'Partly on task',
    off_topic: 'Off topic',
    too_short: 'Too short',
    underdeveloped: 'Needs development',
    mostly_correct_but_needs_polish: 'Mostly correct, needs polish',
  };
  if (!alignment) return 'Needs closer review';
  return labels[alignment] ?? 'Needs closer review';
};

export const buildWritingDashboardSnapshot = (
  studentId: string,
  month: string,
  genre: SupportedGenre
): { ok: boolean; data?: WritingDashboardSnapshot; error?: string } => {
  const stateRes = getStudentWritingState(studentId, genre);
  if (!stateRes.ok || !stateRes.data) return { ok: false, error: stateRes.error ?? 'Unable to load writing state.' };

  const weeklyPlan = getCurrentWeeklyPlan(studentId, genre);
  const today = getTodayWritingTask(studentId, genre);
  const monthly = getMonthlyWritingReport(studentId, month, genre);

  return {
    ok: true,
    data: {
      weekly_plan_summary:
        weeklyPlan.ok && weeklyPlan.data
          ? {
              primary: weeklyPlan.data.primary_target,
              secondary: weeklyPlan.data.secondary_target,
              maintenance: weeklyPlan.data.maintenance_target,
            }
          : null,
      todays_task_title: today.ok && today.data ? today.data.title : null,
      completed_tasks_count: stateRes.data.completed_daily_tasks.length,
      latest_total_score: stateRes.data.latest_assessment?.total_score ?? null,
      monthly_growth_summary: monthly.ok && monthly.data ? monthly.data.student_facing_monthly_report.score_change : null,
    },
  };
};

const pageStyle = {
  padding: 12,
  display: 'grid',
  gap: 12,
  maxWidth: 1120,
  margin: '0 auto',
  color: '#e5e7eb',
};

const shellCardStyle = {
  borderRadius: 20,
  border: '1px solid rgba(59, 130, 246, 0.25)',
  background: 'linear-gradient(180deg, #0f172a 0%, #0b1224 100%)',
  padding: 16,
  boxShadow: '0 10px 30px rgba(2, 6, 23, 0.45)',
};

const missionCardStyle = {
  ...shellCardStyle,
  background: 'linear-gradient(155deg, #1d4ed8 0%, #312e81 55%, #0f172a 100%)',
  border: '1px solid rgba(147, 197, 253, 0.45)',
};

const dashboardSectionTitleStyle = {
  margin: 0,
  fontSize: 12,
  letterSpacing: 1.1,
  textTransform: 'uppercase' as const,
  fontWeight: 800,
};

const sectionLabelPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  padding: '5px 10px',
  border: '1px solid rgba(148, 163, 184, 0.4)',
  background: 'rgba(15, 23, 42, 0.45)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.4,
};

const progressTrackStyle = {
  height: 10,
  background: 'rgba(148, 163, 184, 0.24)',
  borderRadius: 999,
  overflow: 'hidden',
};

const fieldStyle = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid rgba(148, 163, 184, 0.4)',
  background: 'rgba(15, 23, 42, 0.88)',
  color: '#f8fafc',
  padding: '12px 14px',
  fontSize: 15,
  lineHeight: 1.5,
};

const primaryButtonStyle = {
  marginTop: 10,
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid rgba(191, 219, 254, 0.5)',
  background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
  color: '#ffffff',
  fontWeight: 800,
  fontSize: 16,
  cursor: 'pointer',
  transition: 'transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
  boxShadow: '0 10px 22px rgba(59, 130, 246, 0.38)',
};

const pillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 999,
  padding: '6px 10px',
  border: '1px solid rgba(191, 219, 254, 0.35)',
  background: 'rgba(15, 23, 42, 0.4)',
  fontSize: 12,
  color: '#dbeafe',
  fontWeight: 700,
};

const computeWordCountRange = (targetWords: number): { min: number; max: number } => ({
  min: Math.max(1, Math.floor(targetWords * 0.9)),
  max: Math.ceil(targetWords * 1.1),
});

const simplifyStudentLanguage = (text: string): string => {
  const replacements: Array<[RegExp, string]> = [
    [/genre convention task/gi, 'style and format practice'],
    [/missed content point/gi, 'you missed one part of the question'],
    [/partial content coverage/gi, 'you only answered part of the question'],
    [/viewpoint \+ support \+ progression/gi, 'clear opinion, useful detail, and clear flow'],
    [/genre focus:/gi, 'remember to:'],
    [/focus on/gi, 'work on'],
    [/reshelloponse/gi, 'response'],
  ];
  return replacements.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
};

const toWordCountLabel = (targetWords: number): string => {
  const range = computeWordCountRange(targetWords);
  return `${range.min}–${range.max} words`;
};

const countWords = (text: string): number => {
  const normalized = text.trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).length;
};

const normalizeTextForMatch = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

export const buildTextFingerprint = (value: string): string => {
  const normalized = normalizeTextForMatch(value);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
};

const normalizeTextWithIndexMap = (value: string): { normalized: string; map: number[] } => {
  let normalized = '';
  const map: number[] = [];
  let previousWasSpace = false;
  for (let i = 0; i < value.length; i += 1) {
    let char = value[i].toLowerCase();
    if (char === '“' || char === '”') char = '"';
    if (char === '‘' || char === '’') char = "'";
    if (/\s/.test(char)) {
      if (!previousWasSpace) {
        normalized += ' ';
        map.push(i);
      }
      previousWasSpace = true;
      continue;
    }
    previousWasSpace = false;
    normalized += char;
    map.push(i);
  }
  while (normalized.startsWith(' ')) {
    normalized = normalized.slice(1);
    map.shift();
  }
  while (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }
  return { normalized, map };
};

const extractQuotedSnippet = (value: string): string | null => {
  const quoted = value.match(/["“](.{6,180}?)["”]/);
  if (!quoted) return null;
  const snippet = quoted[1]?.trim();
  return snippet && snippet.length >= 6 ? snippet : null;
};

const findSafeSnippetRange = (text: string, snippet?: string | null): { start: number; end: number } | null => {
  if (!snippet) return null;
  const trimmed = snippet.trim();
  if (trimmed.length < 6) return null;
  const haystackWithMap = normalizeTextWithIndexMap(text);
  const haystack = haystackWithMap.normalized;
  const needle = normalizeTextForMatch(trimmed);
  if (!needle) return null;
  const firstIndex = haystack.indexOf(needle);
  if (firstIndex < 0) return null;
  const secondIndex = haystack.indexOf(needle, firstIndex + 1);
  if (secondIndex >= 0) return null;
  const mappedStart = haystackWithMap.map[firstIndex];
  const mappedEnd = haystackWithMap.map[firstIndex + needle.length - 1];
  if (typeof mappedStart === 'number' && typeof mappedEnd === 'number' && mappedEnd >= mappedStart) {
    return { start: mappedStart, end: mappedEnd + 1 };
  }
  const directStart = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (directStart >= 0) return { start: directStart, end: directStart + trimmed.length };
  return null;
};

const buildRepairQueue = (
  ai: WritingAiFeedbackAssist | null,
  fallbackWeaknessTips: string[]
): RepairQueueItem[] => {
  if (!ai) {
    return fallbackWeaknessTips.slice(0, 3).map((tip, idx) => ({
      id: `fallback-${idx}`,
      title: `Revision focus ${idx + 1}`,
      category: 'content',
      explanation: simplifyStudentLanguage(tip),
    }));
  }

  const queue: RepairQueueItem[] = [];
  const mapRepairCategory = (stepType?: string): RepairQueueItem['category'] => {
    const normalized = (stepType ?? '').toLowerCase();
    if (normalized.includes('grammar')) return 'grammar';
    if (normalized.includes('punct')) return 'punctuation';
    if (normalized.includes('style') || normalized.includes('tone')) return 'style';
    if (normalized.includes('next')) return 'next_step';
    return 'content';
  };
  (ai.repair_steps ?? []).slice(0, 4).forEach((step, idx) => {
    const title = step.title?.trim() || step.instruction?.trim() || `Revision step ${idx + 1}`;
    const explanation = step.instruction?.trim() || step.done_criteria?.trim() || step.evidence?.trim() || 'Revise this part using the coaching guidance.';
    queue.push({
      id: step.id?.trim() || `repair-step-${idx}`,
      title: simplifyStudentLanguage(title),
      category: mapRepairCategory(step.step_type),
      explanation: simplifyStudentLanguage(explanation),
      evidenceSnippet: step.evidence?.trim() || undefined,
    });
  });
  const missingContentSignals = (ai.what_is_missing?.length ? ai.what_is_missing : ai.weaknesses ?? []).slice(0, 3);
  missingContentSignals.forEach((item, idx) => {
    queue.push({
      id: `missing-${idx}`,
      title: `Add a missing task point`,
      category: 'content',
      explanation: simplifyStudentLanguage(item),
      evidenceSnippet: extractQuotedSnippet(item) ?? undefined,
    });
  });
  (ai.grammar_fixes ?? []).slice(0, 3).forEach((item, idx) => {
    queue.push({
      id: `grammar-${idx}`,
      title: `Fix one grammar sentence`,
      category: 'grammar',
      explanation: `${simplifyStudentLanguage(item.issue)} → ${item.better_version}`,
      evidenceSnippet: item.original,
    });
  });
  (ai.punctuation_fixes ?? []).slice(0, 3).forEach((item, idx) => {
    queue.push({
      id: `punctuation-${idx}`,
      title: `Fix one punctuation spot`,
      category: 'punctuation',
      explanation: `${simplifyStudentLanguage(item.issue)} → ${item.better_version}`,
      evidenceSnippet: item.original,
    });
  });
  (ai.style_tone_feedback ?? []).slice(0, 2).forEach((item, idx) => {
    queue.push({
      id: `style-${idx}`,
      title: `Improve tone clarity`,
      category: 'style',
      explanation: `${simplifyStudentLanguage(item.issue)} → ${item.suggestion}`,
      evidenceSnippet: item.evidence,
    });
  });
  (ai.next_steps ?? []).slice(0, 2).forEach((item, idx) => {
    queue.push({
      id: `next-${idx}`,
      title: `Next revision move`,
      category: 'next_step',
      explanation: simplifyStudentLanguage(item),
      evidenceSnippet: extractQuotedSnippet(item) ?? undefined,
    });
  });

  const seen = new Set<string>();
  const deduped: RepairQueueItem[] = [];
  queue.forEach((item) => {
    const key = `${item.category}:${normalizeTextForMatch(item.title)}:${normalizeTextForMatch(item.explanation)}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(item);
  });
  return deduped.slice(0, 8);
};

const buildAnchorRanges = (text: string, ai: WritingAiFeedbackAssist | null): TextAnchorRange[] => {
  if (!ai) return [];
  const ranges: TextAnchorRange[] = [];
  (ai.highlights ?? []).forEach((item, idx) => {
    if (typeof item.start_char !== 'number' || typeof item.end_char !== 'number') return;
    if (!Number.isInteger(item.start_char) || !Number.isInteger(item.end_char)) return;
    if (item.start_char < 0 || item.end_char <= item.start_char || item.end_char > text.length) return;
    ranges.push({
      start: item.start_char,
      end: item.end_char,
      polarity: item.polarity === 'strong' ? 'strong' : 'weak',
      reason: item.category ?? `highlight-${idx + 1}`,
    });
  });
  return ranges;
};

export const evaluateAnchorTrust = (
  submissionText: string | null | undefined,
  feedback: WritingAiFeedbackAssist | null
): AnchorTrustEvaluation => {
  const safeSubmissionText = submissionText ?? '';
  const localFingerprint = safeSubmissionText ? buildTextFingerprint(safeSubmissionText) : null;
  const persistedFingerprint = typeof feedback?.text_fingerprint === 'string' && feedback.text_fingerprint.trim()
    ? feedback.text_fingerprint.trim()
    : null;
  if (!feedback) return { mode: 'no_feedback', localFingerprint, persistedFingerprint };
  if (!persistedFingerprint || !localFingerprint) return { mode: 'missing_fingerprint', localFingerprint, persistedFingerprint };
  if (persistedFingerprint !== localFingerprint) return { mode: 'stale_feedback', localFingerprint, persistedFingerprint };
  if (buildAnchorRanges(safeSubmissionText, feedback).length === 0) return { mode: 'no_anchors', localFingerprint, persistedFingerprint };
  return { mode: 'trusted', localFingerprint, persistedFingerprint };
};

const buildFallbackHighlightRanges = (text: string, ai: WritingAiFeedbackAssist | null): TextAnchorRange[] => {
  if (!text || !ai) return [];
  const lowerText = text.toLowerCase();
  const ranges: TextAnchorRange[] = [];
  const addSnippet = (snippet: string, polarity: 'strong' | 'weak', reason: string) => {
    const clean = snippet.trim();
    if (!clean || clean.length < 6) return;
    const start = lowerText.indexOf(clean.toLowerCase());
    if (start < 0) return;
    ranges.push({ start, end: start + clean.length, polarity, reason });
  };

  (ai.grammar_fixes ?? []).slice(0, 4).forEach((item) => addSnippet(item.original, 'weak', 'grammar_fix'));
  (ai.punctuation_fixes ?? []).slice(0, 4).forEach((item) => addSnippet(item.original, 'weak', 'punctuation_fix'));
  [...(ai.what_is_working ?? []), ...(ai.strengths ?? [])]
    .slice(0, 4)
    .forEach((item) => {
      const quoted = extractQuotedSnippet(item) ?? '';
      addSnippet(quoted, 'strong', 'strength');
    });

  if (!ranges.some((item) => item.polarity === 'strong')) {
    const firstSentenceEnd = text.indexOf('.') > 0 ? text.indexOf('.') + 1 : Math.min(text.length, 90);
    ranges.push({ start: 0, end: firstSentenceEnd, polarity: 'strong', reason: 'opening_strength' });
  }
  return ranges;
};

const renderAnnotatedText = (text: string, ranges: TextAnchorRange[], activeIndex: number | null = null): React.ReactNode => {
  if (!text) return text;
  const normalizedRanges = [...ranges]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .reduce<TextAnchorRange[]>((acc, range) => {
      const prev = acc[acc.length - 1];
      if (!prev || range.start >= prev.end) {
        acc.push(range);
        return acc;
      }
      return acc;
    }, []);
  if (normalizedRanges.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  normalizedRanges.forEach((range, idx) => {
    if (cursor < range.start) nodes.push(<span key={`plain-${idx}`}>{text.slice(cursor, range.start)}</span>);
    const segment = text.slice(range.start, range.end);
    const strong = range.polarity === 'strong';
    nodes.push(
      <span
        key={`mark-${idx}`}
        title={range.reason}
        style={{
          background: strong ? 'rgba(34,197,94,0.24)' : 'rgba(248,113,113,0.22)',
          color: strong ? '#bbf7d0' : '#fecaca',
          borderBottom: strong ? '1px solid rgba(74, 222, 128, 0.65)' : '1px solid rgba(248, 113, 113, 0.7)',
          borderRadius: 3,
          boxShadow: idx === activeIndex
            ? (strong ? '0 0 0 1px rgba(74,222,128,0.65), 0 0 18px rgba(74,222,128,0.42)' : '0 0 0 1px rgba(248,113,113,0.55), 0 0 16px rgba(248,113,113,0.35)')
            : (strong ? '0 0 0 1px rgba(34,197,94,0.22)' : '0 0 0 1px rgba(248,113,113,0.18)'),
          transition: 'background 220ms ease, box-shadow 220ms ease',
        }}
      >
        {segment}
      </span>
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(<span key="plain-tail">{text.slice(cursor)}</span>);
  return nodes;
};

const buildBalancedReviewSequence = (ranges: TextAnchorRange[], maxItems = 8): TextAnchorRange[] => {
  if (ranges.length === 0) return [];
  const strong = ranges.filter((item) => item.polarity === 'strong');
  const weak = ranges.filter((item) => item.polarity === 'weak');
  const ordered: TextAnchorRange[] = [];
  let strongIdx = 0;
  let weakIdx = 0;

  if (strong[strongIdx]) {
    ordered.push(strong[strongIdx]);
    strongIdx += 1;
  }

  while (ordered.length < maxItems && (strongIdx < strong.length || weakIdx < weak.length)) {
    if (weakIdx < weak.length) {
      ordered.push(weak[weakIdx]);
      weakIdx += 1;
      if (ordered.length >= maxItems) break;
    }
    if (strongIdx < strong.length) {
      ordered.push(strong[strongIdx]);
      strongIdx += 1;
    }
  }

  return ordered
    .slice(0, maxItems)
    .sort((a, b) => a.start - b.start || a.end - b.end);
};

const describeHighlight = (
  range: TextAnchorRange | null | undefined,
  text: string,
  ai: WritingAiFeedbackAssist | null
): { label: string; detail: string; correction?: string } => {
  if (!range) return { label: 'AI feedback', detail: 'Select a highlight to view detailed guidance.' };
  const snippet = text.slice(range.start, range.end).trim();
  const lowerSnippet = snippet.toLowerCase();
  if (!ai) {
    return {
      label: range.polarity === 'strong' ? 'Strong writing choice' : 'Needs correction',
      detail: snippet || 'Highlighted text from your submission.',
    };
  }

  const grammar = (ai.grammar_fixes ?? []).find((item) => item.original.toLowerCase().includes(lowerSnippet) || lowerSnippet.includes(item.original.toLowerCase()));
  if (grammar) return { label: 'Grammar fix', detail: grammar.issue, correction: grammar.better_version };
  const punctuation = (ai.punctuation_fixes ?? []).find((item) => item.original.toLowerCase().includes(lowerSnippet) || lowerSnippet.includes(item.original.toLowerCase()));
  if (punctuation) return { label: 'Punctuation fix', detail: punctuation.issue, correction: punctuation.better_version };
  const phrase = (ai.natural_phrase_upgrades ?? []).find((item) => item.original.toLowerCase().includes(lowerSnippet) || lowerSnippet.includes(item.original.toLowerCase()));
  if (phrase) return { label: 'Phrase upgrade', detail: phrase.why_it_helps, correction: phrase.better_version };
  const strength = [...(ai.what_is_working ?? []), ...(ai.strengths ?? [])].find((item) => (extractQuotedSnippet(item) ?? '').toLowerCase().includes(lowerSnippet) || item.toLowerCase().includes(lowerSnippet));
  if (strength) return { label: 'Why this is strong', detail: simplifyStudentLanguage(strength) };

  return {
    label: range.polarity === 'strong' ? 'Strong writing choice' : 'Needs correction',
    detail: range.polarity === 'strong'
      ? 'This part supports your story effectively. Keep this clarity and energy.'
      : 'This part needs clearer grammar, wording, or structure.',
  };
};

const SUPPORTED_GENRES: SupportedGenre[] = ['essay', 'story', 'article', 'review', 'report', 'email', 'paragraph'];

const defaultPromptByGenre: Record<SupportedGenre, string> = FALLBACK_PROMPT_BY_GENRE;

const toGenreLabel = (genre: SupportedGenre): string => genre.charAt(0).toUpperCase() + genre.slice(1);
const toGenreStateCopy = (
  status: 'not_started' | 'week_active' | 'week_complete',
  day: number | null,
  completed: number,
  total: number
): string => {
  if (status === 'not_started') return 'Not started yet';
  if (status === 'week_complete') return 'Week complete';
  if (day) return `Day ${day} ready`;
  if (total > 0) return `Week active • ${completed}/${total} tasks`;
  return 'Week active';
};

const buildReadableTaskSummary = (promptText: string): string => {
  const normalized = simplifyStudentLanguage(promptText).replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Your writing mission will appear here once a task is loaded.';
  return normalized.length > 220 ? `${normalized.slice(0, 217).trimEnd()}…` : normalized;
};

const masteryTargetByGenre: Record<SupportedGenre, string> = {
  essay: 'Mastery target: Build a clear claim, support it with relevant evidence, and evaluate one trade-off.',
  story: 'Mastery target: Develop character motivation, keep logical progression, and craft a meaningful resolution.',
  article: 'Mastery target: Inform a real audience with clear structure, reliable detail, and a practical takeaway.',
  review: 'Mastery target: Judge quality with criteria, justify ratings with evidence, and give actionable advice.',
  report: 'Mastery target: Present findings objectively, highlight impact, and recommend one evidence-based action.',
  email: 'Mastery target: Use audience-appropriate tone, clear purpose, and a concise actionable recommendation.',
  paragraph: 'Mastery target: Keep one main idea, strong supporting detail, and precise sentence control.',
};

const writingMissionCategoryMeta: Record<string, WritingMissionCategoryMeta> = {
  mission_content_planning: {
    label: 'Content coverage',
    practiceTitle: 'Answer every task point mission',
    reasonTemplate: 'Recommended because your writing needs stronger content coverage.',
    keywordHints: ['content', 'coverage', 'task', 'plan', 'planning', 'answer'],
  },
  mission_content_selection: {
    label: 'Idea relevance',
    practiceTitle: 'Keep ideas relevant mission',
    reasonTemplate: 'Recommended because your writing needs better idea selection.',
    keywordHints: ['relevant', 'focus', 'select', 'idea', 'content'],
  },
  mission_expansion_control: {
    label: 'Development and detail',
    practiceTitle: 'Expand with detail mission',
    reasonTemplate: 'Recommended because your writing needs more developed detail.',
    keywordHints: ['develop', 'detail', 'expand', 'elaborate', 'length'],
  },
  mission_tone_shift: {
    label: 'Tone control',
    practiceTitle: 'Audience tone mission',
    reasonTemplate: 'Recommended because your writing tone needs to match the audience.',
    keywordHints: ['tone', 'audience', 'formal', 'informal', 'register'],
  },
  mission_register_shift: {
    label: 'Register control',
    practiceTitle: 'Right register mission',
    reasonTemplate: 'Recommended because your wording needs better register control.',
    keywordHints: ['register', 'formal', 'style', 'audience'],
  },
  mission_genre_conventions: {
    label: 'Genre conventions',
    practiceTitle: 'Genre structure mission',
    reasonTemplate: 'Recommended because your response needs stronger genre conventions.',
    keywordHints: ['genre', 'format', 'structure', 'convention'],
  },
  mission_audience_targeting: {
    label: 'Audience awareness',
    practiceTitle: 'Audience targeting mission',
    reasonTemplate: 'Recommended because your writing should target the reader more clearly.',
    keywordHints: ['audience', 'reader', 'purpose', 'tone'],
  },
  mission_paragraph_build: {
    label: 'Paragraph structure',
    practiceTitle: 'Paragraph structure mission',
    reasonTemplate: 'Recommended because your paragraph structure needs improvement.',
    keywordHints: ['paragraph', 'organize', 'structure', 'topic sentence'],
  },
  mission_idea_ordering: {
    label: 'Sequencing',
    practiceTitle: 'Idea ordering mission',
    reasonTemplate: 'Recommended because your ideas need clearer sequencing.',
    keywordHints: ['sequence', 'order', 'flow', 'organization', 'linking'],
  },
  mission_linking_upgrade: {
    label: 'Linking and cohesion',
    practiceTitle: 'Linking words mission',
    reasonTemplate: 'Recommended because your linking and cohesion need work.',
    keywordHints: ['link', 'cohesion', 'connectors', 'transition'],
  },
  mission_flow_variation: {
    label: 'Flow variation',
    practiceTitle: 'Sentence flow mission',
    reasonTemplate: 'Recommended because your writing flow needs more variation.',
    keywordHints: ['flow', 'variety', 'sentence', 'rhythm'],
  },
  mission_grammar_repair: {
    label: 'Grammar control',
    practiceTitle: 'Grammar repair mission',
    reasonTemplate: 'Recommended because grammar accuracy is a current weakness.',
    keywordHints: ['grammar', 'tense', 'verb', 'agreement', 'accuracy'],
  },
  mission_sentence_clarity: {
    label: 'Sentence clarity',
    practiceTitle: 'Clear sentence mission',
    reasonTemplate: 'Recommended because sentence clarity needs improvement.',
    keywordHints: ['sentence', 'clarity', 'fragment', 'run-on', 'edit'],
  },
  mission_vocabulary_precision: {
    label: 'Vocabulary precision',
    practiceTitle: 'Precise vocabulary mission',
    reasonTemplate: 'Recommended because word choice needs more precision.',
    keywordHints: ['vocabulary', 'word choice', 'precise', 'language'],
  },
  mission_language_accuracy: {
    label: 'Language accuracy',
    practiceTitle: 'Language accuracy mission',
    reasonTemplate: 'Recommended because language accuracy is still a blocker.',
    keywordHints: ['spelling', 'punctuation', 'accuracy', 'edit'],
  },
};

const normalizeMissionText = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const scoreQuestMissionForCategory = (mission: QuestMissionRow, categoryMeta: WritingMissionCategoryMeta): number => {
  const subject = normalizeMissionText(mission.subject);
  const corpus = `${normalizeMissionText(mission.title)} ${normalizeMissionText(mission.description)} ${normalizeMissionText(mission.code)}`;
  const writingSubjectSignals = ['english', 'writing', 'language', 'grammar', 'reading'];
  const subjectBoost = writingSubjectSignals.some((signal) => subject.includes(signal)) ? 6 : 0;
  const keywordHits = categoryMeta.keywordHints.reduce((count, keyword) => (corpus.includes(keyword) ? count + 1 : count), 0);
  return subjectBoost + keywordHits;
};

const buildWritingMissionRecommendations = (input: {
  rankedWeaknessTags: string[];
  questMissions: QuestMissionRow[];
}): WritingMissionRecommendation[] => {
  const recommendations: WritingMissionRecommendation[] = [];
  const usedMissionIds = new Set<string>();
  const usedCategories = new Set<string>();

  for (const weaknessTag of input.rankedWeaknessTags) {
    const category = WEAKNESS_TAG_TO_MISSION_CATEGORY[weaknessTag as keyof typeof WEAKNESS_TAG_TO_MISSION_CATEGORY];
    if (!category || usedCategories.has(category)) continue;
    const categoryMeta = writingMissionCategoryMeta[category];
    if (!categoryMeta) continue;

    const bestMission = [...input.questMissions]
      .filter((mission) => !usedMissionIds.has(mission.id))
      .map((mission) => ({ mission, score: scoreQuestMissionForCategory(mission, categoryMeta) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.mission;

    const weaknessLabel = weaknessTag.replaceAll('_', ' ');
    if (bestMission) {
      recommendations.push({
        weaknessTag,
        weaknessLabel,
        missionCategory: category,
        missionCategoryLabel: categoryMeta.label,
        title: bestMission.title,
        reason: `${categoryMeta.reasonTemplate} Focus area: ${weaknessLabel}.`,
        source: 'quest',
        mission: {
          id: bestMission.id,
          title: bestMission.title,
          subject: bestMission.subject,
          difficulty: bestMission.difficulty,
          mission_type: bestMission.mission_type,
        },
      });
      usedMissionIds.add(bestMission.id);
      usedCategories.add(category);
    } else {
      recommendations.push({
        weaknessTag,
        weaknessLabel,
        missionCategory: category,
        missionCategoryLabel: categoryMeta.label,
        title: categoryMeta.practiceTitle,
        reason: `${categoryMeta.reasonTemplate} Focus area: ${weaknessLabel}.`,
        source: 'category_fallback',
      });
      usedCategories.add(category);
    }

    if (recommendations.length >= 3) break;
  }

  return recommendations.slice(0, 3);
};

const toStudentLabel = (text: string): string => {
  return simplifyStudentLanguage(text)
    .replace(/carry-forward primary/gi, 'next focus')
    .replace(/primary/gi, 'main focus')
    .replace(/maintain balanced writing control/gi, 'keep your writing clear and balanced')
    .replace(/raw delta-heavy technical phrasing/gi, 'technical progress notes')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizePromptForComparison = (prompt: string): string => prompt.replace(/\s+/g, ' ').trim().toLowerCase();

const getProgressTone = (score: number | null): { color: string; glow: string; label: string } => {
  if (score == null) return { color: '#64748b', glow: 'rgba(100, 116, 139, 0.35)', label: 'No score yet' };
  if (score >= 4) return { color: '#22c55e', glow: 'rgba(34, 197, 94, 0.45)', label: 'Strong' };
  if (score >= 3) return { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.45)', label: 'Building' };
  if (score >= 2) return { color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)', label: 'In progress' };
  return { color: '#f97316', glow: 'rgba(249, 115, 22, 0.45)', label: 'Needs attention' };
};

const parseSubscaleProgress = (entries: string[]): Record<string, number | null> => {
  const values: Record<string, number | null> = {
    content: null,
    organisation: null,
    language: null,
    communicative_achievement: null,
  };
  entries.forEach((entry) => {
    const contentMatch = entry.match(/content[:\s]*([+\-]?\d+(\.\d+)?)/i);
    if (contentMatch) values['content'] = Number(contentMatch[1]);
    const organisationMatch = entry.match(/organisation[:\s]*([+\-]?\d+(\.\d+)?)/i);
    if (organisationMatch) values['organisation'] = Number(organisationMatch[1]);
    const languageMatch = entry.match(/language[:\s]*([+\-]?\d+(\.\d+)?)/i);
    if (languageMatch) values['language'] = Number(languageMatch[1]);
    const achievementMatch = entry.match(/communicative achievement[:\s]*([+\-]?\d+(\.\d+)?)/i);
    if (achievementMatch) values['communicative_achievement'] = Number(achievementMatch[1]);
  });
  return values;
};

const taskTypeToFriendlyTitle = (taskType: string, day: number): string => {
  const map: Record<string, string> = {
    'sentence correction': 'Fix and improve sentences',
    'error spotting': 'Find and fix mistakes',
    'sentence combining': 'Connect ideas clearly',
    'paragraph ordering': 'Build better paragraph order',
    'linking words insertion': 'Add linking words',
    'paragraph writing': 'Write a stronger paragraph',
    'guided writing': 'Guided writing practice',
    'rewrite from feedback': 'Improve using feedback',
    'full exam-style response': 'Full writing practice',
    'genre convention task': 'Use the right writing style',
    'word-count control task': 'Stay close to word range',
  };
  return `Day ${day}: ${map[taskType] ?? 'Writing practice'}`;
};

const taskTypeToFriendlyInstruction = (taskType: string): string => {
  const map: Record<string, string> = {
    'sentence correction': 'Fix grammar and wording so each sentence is clear.',
    'error spotting': 'Find small mistakes and correct them carefully.',
    'sentence combining': 'Connect short ideas into smoother sentences.',
    'paragraph ordering': 'Put ideas in a clear order from start to finish.',
    'linking words insertion': 'Add linking words to guide your reader.',
    'paragraph writing': 'Write one paragraph with a clear main idea and detail.',
    'guided writing': 'Follow the steps and answer every part of the question.',
    'rewrite from feedback': 'Improve your last response using feedback.',
    'full exam-style response': 'Complete a full response like your real writing task.',
    'genre convention task': 'Use the right style for this type of writing.',
    'word-count control task': 'Keep your writing close to the word range.',
  };
  return map[taskType] ?? 'Focus on clear and complete writing.';
};

interface TaskTypeStudyGuide {
  objective: string;
  structure: string[];
  qualityChecks: string[];
  pitfalls: string[];
}

const taskTypeStudyGuideMap: Record<string, TaskTypeStudyGuide> = {
  'sentence correction': {
    objective: 'Correct grammar, punctuation, and wording so each sentence is accurate and easy to read.',
    structure: ['Read the sentence once for meaning.', 'Find one grammar issue at a time.', 'Rewrite only what is needed.'],
    qualityChecks: ['Verb tense matches the meaning.', 'Subject and verb agree.', 'Sentence sounds natural when read aloud.'],
    pitfalls: ['Changing the original meaning.', 'Fixing one error but creating another.', 'Ignoring punctuation and capitalization.'],
  },
  'error spotting': {
    objective: 'Identify mistakes quickly and explain or apply the correct version.',
    structure: ['Scan for obvious grammar signals.', 'Check word forms and word order.', 'Confirm the corrected version reads clearly.'],
    qualityChecks: ['Every correction has a clear reason.', 'No missed errors in short sentences.', 'Corrections keep the same idea.'],
    pitfalls: ['Guessing without checking context.', 'Only fixing spelling and missing grammar errors.', 'Over-correcting correct parts.'],
  },
  'sentence combining': {
    objective: 'Join short ideas into smoother, more fluent sentences without losing clarity.',
    structure: ['Choose the main idea sentence.', 'Use linking words or clauses to join support ideas.', 'Check punctuation after combining.'],
    qualityChecks: ['Combined sentence is not too long.', 'Linking words fit the relationship (because, but, although).', 'Meaning stays complete.'],
    pitfalls: ['Run-on sentences.', 'Too many connectors in one sentence.', 'Dropping important detail while combining.'],
  },
  'paragraph ordering': {
    objective: 'Arrange ideas so the paragraph flows logically from beginning to end.',
    structure: ['Start with a clear topic sentence.', 'Place supporting details in logical order.', 'End with a closing or linking sentence.'],
    qualityChecks: ['Each sentence connects to the previous one.', 'Examples follow the point they support.', 'The final order is easy to follow.'],
    pitfalls: ['Jumping between unrelated ideas.', 'Placing evidence before the main point.', 'Weak or missing paragraph ending.'],
  },
  'linking words insertion': {
    objective: 'Use linking words to guide the reader through contrast, reason, sequence, and result.',
    structure: ['Decide the relationship between two ideas.', 'Choose one suitable connector.', 'Read the full sentence to check flow.'],
    qualityChecks: ['Connector meaning is correct.', 'Grammar after the connector is correct.', 'Writing sounds smooth, not forced.'],
    pitfalls: ['Using formal connectors in simple contexts.', 'Repeating the same linker too often.', 'Using contrast linkers for addition ideas.'],
  },
  'paragraph writing': {
    objective: 'Write one focused paragraph with a clear main idea and strong supporting detail.',
    structure: ['Topic sentence with a clear point.', '2-3 supporting details or examples.', 'Final sentence that closes the idea.'],
    qualityChecks: ['One main idea only.', 'Details are specific, not vague.', 'Sentences are connected logically.'],
    pitfalls: ['Too many unrelated points.', 'General statements without examples.', 'No clear ending sentence.'],
  },
  'guided writing': {
    objective: 'Follow the writing instructions closely and answer every part of the task.',
    structure: ['Underline key task requirements.', 'Plan short points for each requirement.', 'Write in the requested format and tone.'],
    qualityChecks: ['Every instruction point is answered.', 'Tone fits audience and purpose.', 'Word count is within the target range.'],
    pitfalls: ['Ignoring one part of the prompt.', 'Wrong format (e.g., letter vs report style).', 'Too short responses with weak development.'],
  },
  'rewrite from feedback': {
    objective: 'Improve your earlier response by applying feedback directly and clearly.',
    structure: ['Review feedback tags before rewriting.', 'Prioritize 2-3 biggest weaknesses.', 'Rewrite and recheck against feedback points.'],
    qualityChecks: ['Previous errors are fixed.', 'Ideas are clearer and better organized.', 'Improvement is visible in structure and language.'],
    pitfalls: ['Copying old response with tiny edits.', 'Fixing grammar only and ignoring content gaps.', 'Not checking whether feedback was fully applied.'],
  },
  'full exam-style response': {
    objective: 'Complete a full response under realistic exam conditions with clear structure and task coverage.',
    structure: ['Plan quickly before writing.', 'Write full introduction-body-conclusion or full required format.', 'Leave time to revise key errors.'],
    qualityChecks: ['All prompt parts are covered.', 'Paragraphing is clear and controlled.', 'Language accuracy is consistent.'],
    pitfalls: ['Starting without planning.', 'Spending too long on one paragraph.', 'Finishing without revision.'],
  },
  'genre convention task': {
    objective: 'Use the correct style, tone, and structure for this specific writing type.',
    structure: ['Identify the genre and audience first.', 'Follow expected format features.', 'Use language that matches the genre purpose.'],
    qualityChecks: ['Tone matches audience (formal/informal).', 'Text includes expected genre elements.', 'Purpose is clear from beginning to end.'],
    pitfalls: ['Using essay style in a letter/report task.', 'Wrong greeting or ending conventions.', 'Mixing tone levels in one response.'],
  },
  'word-count control task': {
    objective: 'Write a complete response while staying close to the required word range.',
    structure: ['Plan paragraph lengths before writing.', 'Develop only the strongest points.', 'Count and trim/revise near the end.'],
    qualityChecks: ['Response stays near target word count.', 'Main points are still complete.', 'No rushed ending or missing conclusion.'],
    pitfalls: ['Writing too little and missing development.', 'Overwriting with repeated ideas.', 'Cutting words and damaging clarity.'],
  },
};

const getTaskTypeStudyGuide = (taskType: string): TaskTypeStudyGuide => {
  return (
    taskTypeStudyGuideMap[taskType] ?? {
      objective: 'Understand what the task asks, organize ideas clearly, and check language before submitting.',
      structure: ['Read the prompt carefully.', 'Plan main points before writing.', 'Review your response for clarity and accuracy.'],
      qualityChecks: ['All prompt parts are answered.', 'Ideas flow in logical order.', 'Grammar and word choice are clear.'],
      pitfalls: ['Skipping planning.', 'Ignoring one part of the task.', 'Submitting without checking your writing.'],
    }
  );
};

const weaknessTagToStudentTip = (tag: string): string => {
  const tipMap: Record<string, string> = {
    missed_content_point: 'Answer every part of the question.',
    partial_content_coverage: 'Include all key points so your response feels complete.',
    tense_error: 'Keep verb tense clear and consistent.',
    agreement_error: 'Check subject + verb agreement carefully.',
    weak_paragraphing: 'Split ideas into clear paragraphs with one main point each.',
    poor_sequencing: 'Use linking words so your ideas flow clearly.',
    wrong_tone: 'Use the right tone for the task type.',
    weak_register_control: 'Choose words that match your audience and task.',
    under_length: 'Add useful detail so you stay near the word range.',
  };
  return tipMap[tag] ?? `Focus on clearer ${tag.replaceAll('_', ' ')} in your next response.`;
};

const estimateWeeklyTargetScoreRange = (
  baselineScore: number | null,
  supportLevel: 'high' | 'medium' | 'low' | null
): { low: number; high: number } | null => {
  if (baselineScore == null) return null;
  const growthBySupport: Record<'high' | 'medium' | 'low', { min: number; max: number }> = {
    high: { min: 0.5, max: 1.2 },
    medium: { min: 0.8, max: 1.8 },
    low: { min: 1.0, max: 2.2 },
  };
  const growth = growthBySupport[supportLevel ?? 'medium'];
  return {
    low: Math.round(baselineScore + growth.min),
    high: Math.round(baselineScore + growth.max),
  };
};

export const WritingHub: React.FC<WritingHubProps> = ({ studentId, studentName, grade, genre, month = new Date().toISOString().slice(0, 7), onOpenQuestMission }) => {
  const [activeGenre, setActiveGenre] = useState<SupportedGenre>(genre);
  const [promptText, setPromptText] = useState(defaultPromptByGenre[genre]);
  const [targetWordCount] = useState(grade <= 7 ? 80 : grade <= 9 ? 120 : 160);
  const [initialResponse, setInitialResponse] = useState('');
  const [practiceResponse, setPracticeResponse] = useState('');
  const [feedback, setFeedback] = useState<string>('');
  const [aiFeedbackDetails, setAiFeedbackDetails] = useState<WritingAiFeedbackAssist | null>(null);
  const [uiNotice, setUiNotice] = useState<string>('');
  const [aiWeeklyFocus, setAiWeeklyFocus] = useState<string>('');
  const [aiCoachingPoints, setAiCoachingPoints] = useState<string[]>([]);
  const [aiTaskWording, setAiTaskWording] = useState<string>('');
  const [aiMonthlyWording, setAiMonthlyWording] = useState<string>('');
  const [aiBusy, setAiBusy] = useState(false);
  const [isAnalyzingRichFeedback, setIsAnalyzingRichFeedback] = useState(false);
  const [analysisStageIndex, setAnalysisStageIndex] = useState(0);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [hydrationStatus, setHydrationStatus] = useState(getWritingHydrationStatus());
  const [persistenceStatus, setPersistenceStatus] = useState(getWritingPersistenceStatus());
  const [isRefreshingProgress, setIsRefreshingProgress] = useState(false);
  const [isGenreSwitching, setIsGenreSwitching] = useState(false);
  const [showTaskTypeGuide, setShowTaskTypeGuide] = useState(false);
  const [showTaskContextModal, setShowTaskContextModal] = useState(false);
  const [showAiReviewModal, setShowAiReviewModal] = useState(false);
  const [submittedPracticeText, setSubmittedPracticeText] = useState('');
  const [reviewScanCount, setReviewScanCount] = useState(0);
  const [reviewScanComplete, setReviewScanComplete] = useState(false);
  const [reviewActiveIndex, setReviewActiveIndex] = useState<number | null>(null);
  const [activeRepairId, setActiveRepairId] = useState<string | null>(null);
  const [repairStatusMessage, setRepairStatusMessage] = useState<string>('');
  const [viewedRepairIds, setViewedRepairIds] = useState<string[]>([]);
  const closeModalButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstRepairButtonRef = useRef<HTMLButtonElement | null>(null);
  const practiceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackCardRef = useRef<HTMLElement | null>(null);
  const [questMissions, setQuestMissions] = useState<QuestMissionRow[]>([]);
  const initialResponseWordCount = countWords(initialResponse);
  const practiceResponseWordCount = countWords(practiceResponse);
  const initializing = hydrationStatus === 'idle' || hydrationStatus === 'loading';

  const dashboard = useMemo(() => buildWritingDashboardSnapshot(studentId, month, activeGenre), [studentId, month, activeGenre, feedback]);
  const stateRes = getStudentWritingState(studentId, activeGenre);
  const todayTask = getTodayWritingTask(studentId, activeGenre);
  const weeklyReview = getWeeklyWritingReview(studentId, activeGenre);
  const monthlyReport = getMonthlyWritingReport(studentId, month, activeGenre);
  const hubSnapshot = getStudentWritingHubSnapshot(studentId, activeGenre);
  const genreStatuses = getStudentGenrePathStatuses(studentId, SUPPORTED_GENRES);

  const totalPlannedTasks = stateRes.ok && stateRes.data ? stateRes.data.active_daily_tasks.length : 0;
  const completedTasksCount = stateRes.ok && stateRes.data ? stateRes.data.completed_daily_tasks.length : 0;
  const isEmptyWritingState = Boolean(
    stateRes.ok &&
      stateRes.data &&
      !stateRes.data.latest_assessment &&
      stateRes.data.active_daily_tasks.length === 0 &&
      stateRes.data.completed_daily_tasks.length === 0
  );
  const showNoWritingState = !stateRes.ok || isEmptyWritingState;
  const hasActiveWeek = totalPlannedTasks > 0;
  const isWeekComplete = hasActiveWeek && completedTasksCount >= totalPlannedTasks && (!todayTask.ok || !todayTask.data);
  const hasStartedAnyWeek = Boolean(stateRes.ok && stateRes.data && (stateRes.data.latest_assessment || completedTasksCount > 0));
  const isPreWeek = !hasActiveWeek && !hasStartedAnyWeek;
  const isActiveWeek = hasActiveWeek && !isWeekComplete;
  const hasTaskToday = Boolean(todayTask.ok && todayTask.data);
  const submittedHighlightRanges = useMemo(
    () => buildAnchorRanges(submittedPracticeText, aiFeedbackDetails),
    [submittedPracticeText, aiFeedbackDetails]
  );
  const fallbackHighlightRanges = useMemo(
    () => buildFallbackHighlightRanges(submittedPracticeText, aiFeedbackDetails),
    [submittedPracticeText, aiFeedbackDetails]
  );
  const reviewAnchorTrust = useMemo(
    () => evaluateAnchorTrust(submittedPracticeText, aiFeedbackDetails),
    [submittedPracticeText, aiFeedbackDetails]
  );
  const reviewScanPlan = useMemo(
    () => buildBalancedReviewSequence(reviewAnchorTrust.mode === 'trusted' ? submittedHighlightRanges : fallbackHighlightRanges, 8),
    [reviewAnchorTrust.mode, submittedHighlightRanges, fallbackHighlightRanges]
  );
  const visibleSubmittedHighlightRanges = useMemo(
    () => reviewScanPlan.slice(0, reviewScanCount),
    [reviewScanPlan, reviewScanCount]
  );
  const activeReviewRange = useMemo(
    () => (reviewActiveIndex != null ? visibleSubmittedHighlightRanges[reviewActiveIndex] ?? null : null),
    [visibleSubmittedHighlightRanges, reviewActiveIndex]
  );
  const activeReviewNote = useMemo(
    () => describeHighlight(activeReviewRange, submittedPracticeText, aiFeedbackDetails),
    [activeReviewRange, submittedPracticeText, aiFeedbackDetails]
  );

  const latestWeaknessTags = stateRes.ok && stateRes.data?.latest_assessment
    ? stateRes.data.latest_assessment.weakness_tags.slice(0, 3)
    : [];
  const repeatedTagCounts = stateRes.ok && stateRes.data
    ? stateRes.data.repeated_error_memory.byStudent[studentId]?.tagCounts ?? {}
    : {};
  const weeklyRemainingWeaknessTags = weeklyReview.ok && weeklyReview.data
    ? weeklyReview.data.weekly_review_summary.top_remaining_weaknesses
    : [];
  const rankedWeaknessTags = useMemo(() => {
    const scoreByTag = new Map<string, number>();
    latestWeaknessTags.forEach((tag, index) => scoreByTag.set(tag, (scoreByTag.get(tag) ?? 0) + (9 - index)));
    weeklyRemainingWeaknessTags.forEach((tag, index) => scoreByTag.set(tag, (scoreByTag.get(tag) ?? 0) + (6 - index)));
    Object.entries(repeatedTagCounts).forEach(([tag, count]) => {
      if (typeof count === 'number' && count > 0) scoreByTag.set(tag, (scoreByTag.get(tag) ?? 0) + count * 4);
    });
    return [...scoreByTag.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag).slice(0, 5);
  }, [latestWeaknessTags.join('|'), weeklyRemainingWeaknessTags.join('|'), JSON.stringify(repeatedTagCounts)]);
  const latestWeaknesses = latestWeaknessTags.map((tag) => tag.replaceAll('_', ' '));
  const firstAttemptAssessment = hubSnapshot.ok ? hubSnapshot.data?.first_attempt_assessment ?? null : null;
  const latestAssessment = stateRes.ok ? stateRes.data?.latest_assessment ?? null : null;
  const progressAssessment = latestAssessment ?? firstAttemptAssessment;
  const originalPromptText = hubSnapshot.ok ? hubSnapshot.data?.original_prompt_text ?? null : null;
  const firstAttemptSubmission = hubSnapshot.ok ? hubSnapshot.data?.first_attempt_submission ?? null : null;
  const firstAttemptWeaknesses = firstAttemptAssessment?.weakness_tags.slice(0, 3) ?? [];
  const firstAttemptRichFeedback = (hubSnapshot.ok ? hubSnapshot.data?.first_attempt_rich_feedback ?? null : null) as WritingAiFeedbackAssist | null;
  const studentFriendlyWeaknesses = (firstAttemptWeaknesses.length > 0 ? firstAttemptWeaknesses : latestWeaknessTags)
    .slice(0, 3)
    .map((tag) => weaknessTagToStudentTip(tag));
  const anchorTrustEvaluation = useMemo(
    () => evaluateAnchorTrust(firstAttemptSubmission, firstAttemptRichFeedback),
    [firstAttemptSubmission, firstAttemptRichFeedback]
  );
  const trustedAnchorMode = anchorTrustEvaluation.mode === 'trusted';
  const firstAttemptFeedbackForAnchors = trustedAnchorMode ? firstAttemptRichFeedback : null;
  const firstAttemptFeedbackForRepairQueue = anchorTrustEvaluation.mode === 'stale_feedback' ? null : firstAttemptRichFeedback;
  const firstAttemptAnchorRanges = useMemo(
    () => buildAnchorRanges(firstAttemptSubmission ?? '', firstAttemptFeedbackForAnchors),
    [firstAttemptSubmission, firstAttemptFeedbackForAnchors]
  );
  const repairQueue = useMemo(
    () => buildRepairQueue(firstAttemptFeedbackForRepairQueue, studentFriendlyWeaknesses),
    [firstAttemptFeedbackForRepairQueue, studentFriendlyWeaknesses.join('|')]
  );
  const activeRepairItem = useMemo(
    () => repairQueue.find((item) => item.id === activeRepairId) ?? repairQueue[0] ?? null,
    [repairQueue, activeRepairId]
  );
  const studentStrengths = useMemo(
    () =>
      (
        firstAttemptRichFeedback?.what_is_working?.length
          ? firstAttemptRichFeedback.what_is_working
          : firstAttemptRichFeedback?.strengths ?? []
      )
        .map((item) => simplifyStudentLanguage(item))
        .filter(Boolean)
        .slice(0, 2),
    [firstAttemptRichFeedback]
  );
  const sessionSeenRepairCount = useMemo(() => {
    if (repairQueue.length === 0) return 0;
    const seen = new Set(viewedRepairIds);
    if (activeRepairItem?.id) seen.add(activeRepairItem.id);
    return Math.min(repairQueue.length, seen.size);
  }, [viewedRepairIds, activeRepairItem?.id, repairQueue.length]);
  const activeRepairRange = useMemo(() => {
    if (!trustedAnchorMode) return null;
    if (!firstAttemptSubmission || !activeRepairItem?.evidenceSnippet) return null;
    return findSafeSnippetRange(firstAttemptSubmission, activeRepairItem.evidenceSnippet);
  }, [firstAttemptSubmission, activeRepairItem?.evidenceSnippet, trustedAnchorMode]);
  const primarySupportLevel = stateRes.ok && stateRes.data?.active_daily_tasks.length
    ? stateRes.data.active_daily_tasks[0].support_level
    : null;
  const estimatedTargetRange = estimateWeeklyTargetScoreRange(firstAttemptAssessment?.total_score ?? null, primarySupportLevel);
  const focusCoachingPoints = (aiCoachingPoints.length > 0
    ? aiCoachingPoints.slice(0, 3)
    : latestWeaknessTags.slice(0, 3).map((tag) => weaknessTagToStudentTip(tag))).slice(0, 3);
  const missionRecommendations = useMemo(
    () => buildWritingMissionRecommendations({ rankedWeaknessTags, questMissions }),
    [rankedWeaknessTags.join('|'), questMissions]
  );
  const monthlySubscaleDeltas = parseSubscaleProgress(monthlyReport.data?.student_facing_monthly_report.subscale_progress ?? []);
  const communicativeAchievementScore = (() => {
    const directScore = progressAssessment?.subscores.communicative_achievement;
    if (directScore != null) return directScore;
    const totalScore = progressAssessment?.total_score;
    const content = progressAssessment?.subscores.content;
    const organisation = progressAssessment?.subscores.organisation;
    const language = progressAssessment?.subscores.language;
    if (totalScore == null || content == null || organisation == null || language == null) return null;
    const inferred = Number((totalScore - content - organisation - language).toFixed(1));
    return Number.isFinite(inferred) ? Math.max(0, Math.min(5, inferred)) : null;
  })();
  const subscaleCards = [
    { key: 'content', label: 'Content', score: progressAssessment?.subscores.content ?? null, delta: monthlySubscaleDeltas['content'] },
    { key: 'organisation', label: 'Organisation', score: progressAssessment?.subscores.organisation ?? null, delta: monthlySubscaleDeltas['organisation'] },
    { key: 'language', label: 'Language', score: progressAssessment?.subscores.language ?? null, delta: monthlySubscaleDeltas['language'] },
    {
      key: 'communicative_achievement',
      label: 'Communicative Achievement',
      score: communicativeAchievementScore,
      delta: monthlySubscaleDeltas['communicative_achievement'],
    },
  ];

  const completionRatio =
    stateRes.ok && stateRes.data && stateRes.data.active_daily_tasks.length > 0
      ? stateRes.data.completed_daily_tasks.length / stateRes.data.active_daily_tasks.length
      : 0;

  const weeklyPlanStages = [
    { key: 'start', label: 'Start week' },
    { key: 'practice', label: 'Daily practice' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'complete', label: 'Week complete' },
  ];
  const currentStageIndex = isWeekComplete ? 3 : isActiveWeek ? (hasTaskToday ? 1 : 2) : 0;

  const weeklyGoals = [
    ...focusCoachingPoints.map((item) => simplifyStudentLanguage(item)),
    simplifyStudentLanguage(dashboard.data?.weekly_plan_summary?.primary ?? ''),
  ]
    .filter(Boolean)
    .slice(0, 3);
  const showWeeklyEvidence = Boolean(weeklyReview.ok && weeklyReview.data && weeklyReview.data.weekly_review_summary.completed_tasks > 0);
  const showMonthlyEvidence = Boolean(
    monthlyReport.ok &&
      monthlyReport.data &&
      (monthlyReport.data.monthly_comparison_summary.currentMonth?.attempts ?? 0) > 0 &&
      monthlyReport.data.monthly_comparison_summary.scoreDelta !== null
  );
  const weeklySummary = weeklyReview.ok && weeklyReview.data ? weeklyReview.data.weekly_review_summary : null;
  const nextWeekInputs = weeklyReview.ok && weeklyReview.data ? weeklyReview.data.next_week_planning_inputs : null;
  const monthlyFacingReport = monthlyReport.ok && monthlyReport.data ? monthlyReport.data.student_facing_monthly_report : null;

  const handleRetryLoad = () => {
    setUiNotice('Refreshing your Writing Hub…');
    setError('');
    setIsRefreshingProgress(true);
    void retryWritingHydration().finally(() => {
      window.setTimeout(() => setIsRefreshingProgress(false), 320);
    });
  };

  useEffect(() => {
    setActiveGenre(genre);
    setPromptText(defaultPromptByGenre[genre]);
  }, [genre]);

  useEffect(() => {
    setShowTaskTypeGuide(false);
  }, [activeGenre, todayTask.ok, todayTask.data?.task_type]);

  useEffect(() => {
    if (!showTaskContextModal) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTaskContextModal(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [showTaskContextModal]);

  useEffect(() => {
    if (!showTaskContextModal) return;
    setViewedRepairIds([]);
    setActiveRepairId(repairQueue[0]?.id ?? null);
  }, [showTaskContextModal, repairQueue]);

  useEffect(() => {
    if (!showTaskContextModal || !activeRepairItem?.id) return;
    setViewedRepairIds((current) => (current.includes(activeRepairItem.id) ? current : [...current, activeRepairItem.id]));
  }, [showTaskContextModal, activeRepairItem?.id]);

  useEffect(() => {
    if (!showTaskContextModal) return;
    const timer = window.setTimeout(() => {
      const focusTarget = firstRepairButtonRef.current ?? closeModalButtonRef.current;
      focusTarget?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [showTaskContextModal, repairQueue.length]);

  useEffect(() => {
    if (!showTaskContextModal) return;
    if (anchorTrustEvaluation.mode === 'stale_feedback') {
      setRepairStatusMessage('We are using safe coaching mode because this older feedback no longer matches your current draft.');
      return;
    }
    if (anchorTrustEvaluation.mode === 'missing_fingerprint') {
      setRepairStatusMessage('We can still coach you safely. This saved feedback has no trust fingerprint, so precise highlights stay off.');
      return;
    }
    if (anchorTrustEvaluation.mode === 'no_anchors') {
      setRepairStatusMessage('Guidance is ready. This feedback did not include precise anchors, so use each step to revise manually.');
      return;
    }
    if (!activeRepairItem) {
      setRepairStatusMessage('No guided repair steps are available yet.');
      return;
    }
    if (!activeRepairItem.evidenceSnippet) {
      setRepairStatusMessage('Good choice. This step has no direct quote, so follow the instruction and revise that part manually.');
      return;
    }
    if (!activeRepairRange) {
      setRepairStatusMessage('We could not safely match that phrase in your draft. Keep the step open and revise using the guidance text.');
      return;
    }
    setRepairStatusMessage('Trusted highlight active. Revise the marked phrase, then move to the next step.');
  }, [showTaskContextModal, activeRepairItem, activeRepairRange, anchorTrustEvaluation.mode]);

  useEffect(() => {
    if (!isAnalyzingRichFeedback) {
      setAnalysisStageIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setAnalysisStageIndex((prev) => (prev + 1) % 4);
    }, 1300);
    return () => window.clearInterval(timer);
  }, [isAnalyzingRichFeedback]);

  useEffect(() => {
    const unsubscribe = subscribeToWritingHydrationStatus((status) => setHydrationStatus(status));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToWritingPersistenceStatus((status) => setPersistenceStatus(status));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isGenreSwitching) return;
    if (initializing) return;
    if (genreStatuses.ok) {
      setIsGenreSwitching(false);
      setUiNotice((currentNotice) => (
        currentNotice.endsWith('Loading your progress for this writing path…') ? '' : currentNotice
      ));
    }
  }, [isGenreSwitching, initializing, genreStatuses.ok, activeGenre]);

  useEffect(() => {
    let cancelled = false;
    const loadSmartPrompt = async () => {
      if (initializing) return;
      if (!isPreWeek && !isWeekComplete) return;
      if (initialResponse.trim().length > 0) return;
      const shouldRefreshPrompt =
        !promptText.trim() || normalizePromptForComparison(promptText) === normalizePromptForComparison(defaultPromptByGenre[activeGenre]);
      if (!shouldRefreshPrompt) return;

      const nextPrompt = await getSmartWritingPromptForStudent({
        student_id: studentId,
        grade,
        genre: activeGenre,
        current_prompt_text: promptText,
        weakness_tags: latestWeaknessTags,
        use_ai_polish: false,
      });
      if (!cancelled && nextPrompt.ok && nextPrompt.data?.prompt_text?.trim()) {
        setPromptText(nextPrompt.data.prompt_text.trim());
      }
    };
    void loadSmartPrompt();
    return () => {
      cancelled = true;
    };
  }, [initializing, isPreWeek, isWeekComplete, promptText, activeGenre, studentId, grade, initialResponse, latestWeaknessTags.join('|')]);

  useEffect(() => {
    if (aiFeedbackDetails) return;
    if (!firstAttemptRichFeedback) return;
    if (!isActiveWeek) return;
    if (completedTasksCount > 0) return;
    setAiFeedbackDetails(firstAttemptRichFeedback);
    const fallbackSummary = [
      ...(firstAttemptRichFeedback.strengths ?? []).slice(0, 2).map((item) => `✅ ${item}`),
      ...(firstAttemptRichFeedback.weaknesses ?? []).slice(0, 2).map((item) => `⚠️ ${item}`),
      ...(firstAttemptRichFeedback.next_steps ?? []).slice(0, 1).map((item) => `➡️ ${item}`),
    ].join(' ');
    if (fallbackSummary) setFeedback((current) => current || fallbackSummary);
    if (firstAttemptRichFeedback.monthly_report_summary?.trim()) {
      setAiMonthlyWording((current) => current || firstAttemptRichFeedback.monthly_report_summary!.trim());
    }
  }, [aiFeedbackDetails, firstAttemptRichFeedback, isActiveWeek, completedTasksCount]);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: number | null = null;
    const loadAiPlanAssist = async () => {
      if (!stateRes.ok || !stateRes.data?.latest_assessment || aiBusy) return;
      setAiBusy(true);
      const planAssist = await requestWritingAiAssist({
        mode: 'plan_assist',
        prompt_text: promptText,
        weaknesses: latestWeaknesses,
        grade,
        genre: activeGenre,
      });
      if (!cancelled && planAssist.ok && planAssist.data) {
        const ai = (planAssist.data.result ?? {}) as WritingAiPlanAssist;
        if (ai.focus?.trim()) setAiWeeklyFocus(ai.focus.trim());
        if (Array.isArray(ai.coaching_points) && ai.coaching_points.length > 0) {
          setAiCoachingPoints(ai.coaching_points.slice(0, 3));
        }
        if (ai.daily_task?.trim()) setAiTaskWording(ai.daily_task.trim());
      } else if (!cancelled && planAssist.error) {
        setUiNotice(`AI coach unavailable right now: ${planAssist.error}`);
      }
      if (!cancelled) setAiBusy(false);
    };
    debounceTimer = window.setTimeout(() => {
      void loadAiPlanAssist();
    }, 700);
    return () => {
      cancelled = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
    };
  }, [studentId, month, stateRes.ok, stateRes.data?.latest_assessment?.total_score, activeGenre]);

  useEffect(() => {
    let cancelled = false;
    const hasWeaknessSignal = rankedWeaknessTags.length > 0;
    if (!hasWeaknessSignal) {
      setQuestMissions([]);
      return;
    }
    void quest_get_missions()
      .then((rows) => {
        if (!cancelled) setQuestMissions(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setQuestMissions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rankedWeaknessTags.join('|')]);

  const loadRichFeedback = async (
    submissionText: string,
    promptForFeedback: string,
    weaknessesForFeedback: string[],
    source: 'initial' | 'daily'
  ) => {
    setIsAnalyzingRichFeedback(true);
    const aiFeedback = await requestWritingAiAssist({
      mode: 'feedback',
      prompt_text: promptForFeedback,
      student_response: submissionText,
      weaknesses: weaknessesForFeedback,
      grade,
      genre: activeGenre,
    });
    if (aiFeedback.ok && aiFeedback.data) {
      const ai = (aiFeedback.data.result ?? {}) as WritingAiFeedbackAssist;
      setAiFeedbackDetails(ai);
      const refined = [
        ...(ai.strengths ?? []).slice(0, 2).map((item) => `✅ ${item}`),
        ...(ai.weaknesses ?? []).slice(0, 2).map((item) => `⚠️ ${item}`),
        ...(ai.next_steps ?? []).slice(0, 2).map((item) => `➡️ ${item}`),
      ].join(' ');
      if (refined) setFeedback(refined);
      if (ai.monthly_report_summary?.trim()) setAiMonthlyWording(ai.monthly_report_summary.trim());
      if (source === 'initial') {
        const persistResult = persistInitialWritingRichFeedback({
          student_id: studentId,
          genre: activeGenre,
          rich_feedback: ai,
        });
        if (!persistResult.ok) {
          console.warn('Initial rich feedback persistence skipped:', persistResult.error);
        }
      }
      return { ok: true as const };
    }
    return { ok: false as const, error: aiFeedback.error ?? 'AI analysis unavailable.' };
  };

  const handleStart = async (options?: { fromWeekComplete?: boolean }) => {
    const fromWeekComplete = Boolean(options?.fromWeekComplete);
    setLoading(true);
    setError('');
    setAiFeedbackDetails(null);
    setFeedback('');
    setAiMonthlyWording('');
    setIsAnalyzingRichFeedback(false);
    setUiNotice(fromWeekComplete ? 'Preparing a fresh writing mission…' : 'Checking your writing…');
    const safeInitialResponse = initialResponse.trim() || (fromWeekComplete
      ? 'I am ready to start a new writing week and improve my focus skills with clear writing.'
      : '');
    let promptForSubmission = promptText.trim();

    if (!promptForSubmission || !safeInitialResponse.trim() || targetWordCount < 20) {
      setError('Please add your first writing response so we can build your weekly plan.');
      setLoading(false);
      return;
    }

    if (fromWeekComplete) {
      try {
        const selection = await getSmartWritingPromptForStudent({
          student_id: studentId,
          grade,
          genre: activeGenre,
          current_prompt_text: promptForSubmission,
          weakness_tags: latestWeaknessTags,
          use_ai_polish: true,
        });
        if (selection.ok && selection.data) {
          const candidate = selection.data.prompt_text.trim();
          if (candidate && normalizePromptForComparison(candidate) !== normalizePromptForComparison(promptForSubmission)) {
            promptForSubmission = candidate;
            setPromptText(candidate);
            setUiNotice('Fresh writing mission ready. Building your weekly plan…');
          }
        }
      } catch (aiError) {
        console.error('Next-week writing prompt refresh failed:', aiError);
      }
    }

    const result = submitInitialWritingAssessment({
      student_id: studentId,
      student_name: studentName,
      grade,
      genre: activeGenre,
      prompt_text: promptForSubmission,
      target_word_count: targetWordCount,
      student_response: safeInitialResponse,
    });

    if (!result.ok) {
      setError('We could not start your week yet. Please try again.');
      setLoading(false);
      return;
    }

    setUiNotice('Building your weekly plan…');
    setSubmittedPracticeText(safeInitialResponse);
    setShowAiReviewModal(false);
    setReviewScanCount(0);
    setReviewScanComplete(false);
    setReviewActiveIndex(null);
    try {
      const aiResult = await loadRichFeedback(safeInitialResponse, promptForSubmission, latestWeaknesses, 'initial');
      if (aiResult.ok) {
        setShowAiReviewModal(true);
        setUiNotice('Your writing week is ready. Here is your first AI coaching feedback.');
      } else {
        setError(`Your week is ready, but AI feedback is unavailable: ${aiResult.error}`);
        setUiNotice('Your writing week is ready. You can continue with Day 1 now.');
      }
    } catch (aiError) {
      console.error('Initial writing feedback assist failed:', aiError);
      setError('Your week is ready, but first-submit AI feedback could not load. You can continue with Day 1.');
      setUiNotice('Your writing week is ready. You can continue with Day 1 now.');
    } finally {
      setIsAnalyzingRichFeedback(false);
      setLoading(false);
    }
  };

  const handleEnhancePrompt = async () => {
    setError('');
    setAiBusy(true);
    setUiNotice('Making this task clearer…');
    try {
      const response = await requestWritingAiAssist({
        mode: 'prompt_rewrite',
        prompt_text: promptText,
        weaknesses: latestWeaknesses,
        grade,
        genre: activeGenre,
      });
      if (response.ok && response.data) {
        const ai = (response.data.result ?? {}) as WritingAiPlanAssist;
        if (ai.rewritten_prompt?.trim()) setPromptText(ai.rewritten_prompt.trim());
        if (ai.daily_task?.trim()) setAiTaskWording(ai.daily_task.trim());
        if (ai.focus?.trim()) setAiWeeklyFocus(ai.focus.trim());
        if (Array.isArray(ai.coaching_points) && ai.coaching_points.length > 0) {
          setAiCoachingPoints(ai.coaching_points.slice(0, 3));
        }
        setUiNotice('Task wording updated.');
      } else {
        setError('Could not improve the task wording right now. Please try again.');
      }
    } catch (aiError) {
      console.error('Writing task wording assist failed:', aiError);
      setError('Could not improve the task wording right now. Please try again.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSubmitPractice = async () => {
    if (loading) return;
    if (!todayTask.ok || !todayTask.data) {
      setError('Today’s task is not ready yet. Please refresh in a moment.');
      return;
    }
    setLoading(true);
    setError('');
    setUiNotice('Checking your writing…');

    const result = submitDailyWritingPractice({
      student_id: studentId,
      genre: activeGenre,
      day_number: todayTask.data.day_number,
      submission_text: practiceResponse,
    });
    if (!result.ok || !result.data) {
      setError('We could not submit your writing. Please retry.');
      setLoading(false);
      return;
    }

    const deterministicFeedback = `Great work. ${result.data.evaluation.completion_status}. Skill score: ${result.data.evaluation.target_skill_score}/5.`;
    setFeedback(deterministicFeedback);
    setAiFeedbackDetails(null);
    setIsAnalyzingRichFeedback(false);
    setSubmittedPracticeText(practiceResponse.trim());
    setShowAiReviewModal(false);
    setReviewScanCount(0);
    setReviewScanComplete(false);
    setReviewActiveIndex(null);
    setUiNotice('Nice submit! Preparing your coaching feedback…');

    try {
      const aiResult = await loadRichFeedback(practiceResponse, promptText, latestWeaknesses, 'daily');
      if (!aiResult.ok) {
        setError(`Saved your submission, but AI analysis is unavailable: ${aiResult.error}`);
      } else {
        setShowAiReviewModal(true);
      }
    } catch (aiError) {
      console.error('Writing feedback assist failed:', aiError);
      setError('Your submission was saved, but feedback could not load. Please try again.');
    } finally {
      setIsAnalyzingRichFeedback(false);
    }

    setPracticeResponse('');
    setLoading(false);
    setIsRefreshingProgress(true);
    setUiNotice('Progress updated. Keep going!');
    window.setTimeout(() => setIsRefreshingProgress(false), 350);
  };

  const handleChangeWritingType = (nextGenre: SupportedGenre) => {
    if (nextGenre === activeGenre) return;
    setIsGenreSwitching(true);
    setActiveGenre(nextGenre);
    setPromptText(defaultPromptByGenre[nextGenre]);
    setInitialResponse('');
    setPracticeResponse('');
    setFeedback('');
    setAiFeedbackDetails(null);
    setAiWeeklyFocus('');
    setAiCoachingPoints([]);
    setAiTaskWording('');
    setAiMonthlyWording('');
    setIsAnalyzingRichFeedback(false);
    setShowAiReviewModal(false);
    setSubmittedPracticeText('');
    setReviewScanCount(0);
    setReviewScanComplete(false);
    setReviewActiveIndex(null);
    setUiNotice(`${toGenreLabel(nextGenre)} path selected. Loading your progress for this writing path…`);
  };

  useEffect(() => {
    if (!showAiReviewModal) {
      setReviewScanCount(0);
      setReviewScanComplete(false);
      setReviewActiveIndex(null);
      return;
    }
    if (reviewScanPlan.length === 0) {
      setReviewScanCount(0);
      setReviewScanComplete(true);
      setReviewActiveIndex(null);
      return;
    }
    setReviewScanCount(0);
    setReviewScanComplete(false);
    setReviewActiveIndex(0);
    let frame = 0;
    const timer = window.setInterval(() => {
      frame += 1;
      setReviewScanCount(frame);
      setReviewActiveIndex(Math.min(frame - 1, reviewScanPlan.length - 1));
      if (frame >= reviewScanPlan.length) {
        window.clearInterval(timer);
        setReviewScanComplete(true);
      }
    }, 520);
    return () => window.clearInterval(timer);
  }, [showAiReviewModal, reviewScanPlan.length]);

  const renderLoadingSkeleton = () => (
    <>
      <section className="writing-hub-card" style={missionCardStyle}>
        <p style={{ ...pillStyle, margin: 0 }}>Loading Writing Hub…</p>
        <div style={{ marginTop: 12, height: 18, borderRadius: 10, background: 'rgba(148,163,184,0.35)' }} />
        <div style={{ marginTop: 8, height: 12, borderRadius: 10, background: 'rgba(148,163,184,0.25)' }} />
      </section>
      <section className="writing-hub-card" style={shellCardStyle}>
        <div style={{ height: 12, borderRadius: 10, background: 'rgba(148,163,184,0.3)' }} />
        <div style={{ marginTop: 8, height: 100, borderRadius: 12, background: 'rgba(148,163,184,0.2)' }} />
      </section>
    </>
  );

  return (
    <div style={pageStyle}>
      <style>{`
        .writing-hub-card {
          animation: cardIn 340ms ease both;
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .writing-hub-card:hover {
          transform: translateY(-2px);
          border-color: rgba(125, 211, 252, 0.45);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.42);
        }
        .writing-primary-button:hover:enabled { transform: translateY(-1px) scale(1.01); }
        .writing-primary-button:active:enabled { transform: translateY(1px) scale(0.99); }
        .progress-fill { transition: width 560ms cubic-bezier(.34,1.56,.64,1); }
        .analysis-dot { width: 8px; height: 8px; border-radius: 999px; background: #67e8f9; opacity: 0.3; animation: analysisPulse 1.2s ease-in-out infinite; }
        .analysis-dot:nth-child(2) { animation-delay: 0.2s; }
        .analysis-dot:nth-child(3) { animation-delay: 0.4s; }
        .analysis-shimmer {
          position: relative;
          overflow: hidden;
        }
        .analysis-shimmer::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent 0%, rgba(125, 211, 252, 0.2) 50%, transparent 100%);
          animation: analysisSweep 2.2s ease-in-out infinite;
        }
        .ai-review-modal-shell {
          position: relative;
          overflow: hidden;
        }
        .ai-review-modal-shell::before {
          content: '';
          position: absolute;
          inset: -30% -10%;
          background: radial-gradient(circle at 20% 20%, rgba(59,130,246,0.24), transparent 45%),
            radial-gradient(circle at 80% 80%, rgba(16,185,129,0.18), transparent 40%);
          pointer-events: none;
        }
        .ai-review-scan {
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 0%, rgba(125, 211, 252, 0.18) 45%, transparent 70%);
          transform: translateX(-100%);
          animation: aiReviewSweep 1.45s ease-in-out infinite;
          pointer-events: none;
        }
        .ai-review-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #22d3ee;
          box-shadow: 0 0 14px rgba(34, 211, 238, 0.7);
          animation: analysisPulse 1.2s ease-in-out infinite;
        }
        .dashboard-grid { display: grid; gap: 12px; grid-template-columns: 1fr; }
        .focus-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .mini-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
        @media (min-width: 860px) {
          .dashboard-grid { grid-template-columns: minmax(0,1.45fr) minmax(0,1fr); align-items: start; }
          .mini-grid { grid-template-columns: repeat(4,minmax(0,1fr)); }
        }
        @media (min-width: 1120px) {
          .focus-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes analysisPulse {
          0%, 100% { opacity: 0.25; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes analysisSweep {
          100% { transform: translateX(100%); }
        }
        @keyframes aiReviewSweep {
          100% { transform: translateX(100%); }
        }
        @keyframes textScanFlow {
          100% { transform: translateX(100%); }
        }
      `}</style>

      {initializing || isGenreSwitching ? renderLoadingSkeleton() : (
        <>
          <section className="writing-hub-card" style={missionCardStyle}>
            <p style={{ margin: 0, color: '#dbeafe', fontWeight: 700, fontSize: 13 }}>
              {isWeekComplete ? 'Week complete' : isActiveWeek ? 'Week active' : 'First step'}
            </p>
            <h1 style={{ margin: '6px 0 10px', color: '#f8fafc', fontSize: 30, lineHeight: 1.1 }}>
              {isPreWeek ? 'Welcome to your Writing Hub' : isWeekComplete ? 'Great work — week finished' : 'Your Writing Hub'}
            </h1>
            <div style={{ margin: '0 0 10px', display: 'grid', gap: 8 }}>
              <label style={{ color: '#bfdbfe', fontSize: 13, fontWeight: 700 }}>
                Choose your writing path
              </label>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  overflowX: 'auto',
                  paddingBottom: 4,
                  scrollSnapType: 'x mandatory',
                  scrollbarWidth: 'thin',
                }}
              >
                {SUPPORTED_GENRES.map((item) => {
                  const status = genreStatuses.ok ? genreStatuses.data?.find((row) => row.genre === item) : null;
                  const isSelected = item === activeGenre;
                  const progress = status && status.total_tasks_count > 0
                    ? Math.min(100, Math.round((status.completed_tasks_count / status.total_tasks_count) * 100))
                    : 0;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleChangeWritingType(item)}
                      aria-pressed={isSelected}
                      aria-label={`${toGenreLabel(item)} writing path`}
                      style={{
                        minWidth: 180,
                        flex: '0 0 auto',
                        scrollSnapAlign: 'start',
                        textAlign: 'left',
                        borderRadius: 12,
                        border: `1px solid ${isSelected ? 'rgba(125, 211, 252, 0.95)' : 'rgba(148, 163, 184, 0.35)'}`,
                        background: isSelected ? 'rgba(30, 64, 175, 0.35)' : 'rgba(15, 23, 42, 0.75)',
                        padding: 10,
                        color: '#e2e8f0',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: 14 }}>{toGenreLabel(item)} path</div>
                      <div style={{ fontSize: 12, color: '#bfdbfe', marginTop: 4 }}>
                        {status ? toGenreStateCopy(status.status, status.current_day, status.completed_tasks_count, status.total_tasks_count) : 'Not started yet'}
                      </div>
                      {status && status.latest_score != null && (
                        <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 2 }}>Latest score: {status.latest_score}/20</div>
                      )}
                      <div
                        style={{ marginTop: 6, ...progressTrackStyle, height: 6 }}
                        role="progressbar"
                        aria-label={`${toGenreLabel(item)} path progress ${progress}%`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                      >
                        <div className="progress-fill" style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #38bdf8 0%, #22d3ee 100%)' }} />
                      </div>
                    </button>
                  );
                })}
              </div>
              {isWeekComplete && (
                <button
                  type="button"
                  onClick={() => void handleStart({ fromWeekComplete: true })}
                  disabled={loading || !promptText.trim() || targetWordCount < 20}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(147, 197, 253, 0.65)',
                    background: 'rgba(30, 41, 59, 0.95)',
                    color: '#dbeafe',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Starting new week…' : `Start new ${toGenreLabel(activeGenre)} week`}
                </button>
              )}
            </div>
            <p style={{ margin: 0, color: '#e2e8f0', fontSize: 15 }}>
              {isPreWeek
                ? 'Write one first response. We will find your weak areas and build your weekly writing plan.'
                : isWeekComplete
                  ? 'You completed your plan. Review what improved, then start a new week when you are ready.'
                  : 'Your weekly plan is active. Follow your focus goals and complete today’s task.'}
            </p>
            {showNoWritingState && <p style={{ margin: '8px 0 0', color: '#bfdbfe', fontSize: 13 }}>No writing state yet</p>}
            {!isWeekComplete && (
              <div style={{ marginTop: 12 }}>
                <div className="mini-grid">
                  {weeklyPlanStages.map((stage, index) => {
                    const isCurrent = index === currentStageIndex;
                    const isDone = index < currentStageIndex;
                    return (
                      <div
                        key={stage.key}
                        style={{
                          borderRadius: 12,
                          border: `1px solid ${isCurrent ? 'rgba(125,211,252,0.95)' : 'rgba(148,163,184,0.35)'}`,
                          background: isDone ? 'rgba(16,185,129,0.16)' : isCurrent ? 'rgba(30,64,175,0.35)' : 'rgba(15,23,42,0.65)',
                          padding: '10px 8px',
                          textAlign: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#dbeafe',
                        }}
                      >
                        <div>{isDone ? 'Done' : isCurrent ? 'Now' : 'Next'}</div>
                        <div style={{ opacity: 0.9 }}>{stage.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, ...progressTrackStyle }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, completionRatio * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #38bdf8 0%, #22d3ee 55%, #34d399 100%)',
                    }}
                  />
                </div>
              </div>
            )}
          </section>

          {isPreWeek && (
            <>
              <section className="writing-hub-card" style={shellCardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20, color: '#f8fafc' }}>What happens next</h3>
                <div className="mini-grid">
                  {['Write once', 'We find weak areas', 'You get your weekly plan', 'You improve day by day'].map((step, index) => (
                    <div key={step} style={{ borderRadius: 12, border: '1px solid rgba(147,197,253,0.45)', background: 'rgba(15,23,42,0.6)', padding: 10 }}>
                      <p style={{ margin: 0, fontSize: 11, color: '#93c5fd' }}>Step {index + 1}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 14, color: '#e2e8f0', fontWeight: 700 }}>{step}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="writing-hub-card" style={shellCardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20, color: '#f8fafc' }}>Your writing task</h3>
                <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Task summary</p>
                <p style={{ margin: '0 0 10px', color: '#e2e8f0', fontSize: 15 }}>{buildReadableTaskSummary(promptText)}</p>
                <p style={{ margin: '0 0 10px', color: '#bfdbfe', fontSize: 13 }}>{masteryTargetByGenre[activeGenre]}</p>
                <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Original prompt</p>
                <div style={{ ...fieldStyle, minHeight: 88, whiteSpace: 'pre-wrap' }}>{promptText}</div>
                <button
                  type="button"
                  onClick={() => void handleEnhancePrompt()}
                  disabled={aiBusy || !promptText.trim()}
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(147, 197, 253, 0.65)',
                    background: 'rgba(30, 41, 59, 0.95)',
                    color: '#dbeafe',
                    cursor: aiBusy ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    opacity: aiBusy ? 0.7 : 1,
                  }}
                >
                  {aiBusy ? 'Making this task clearer…' : 'Make this task clearer'}
                </button>
                <p style={{ margin: '6px 0 0', color: '#93c5fd', fontSize: 12 }}>
                  This explains the task more clearly. It does not change what you need to do.
                </p>
              </section>

              <section className="writing-hub-card" style={shellCardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 20, color: '#f8fafc' }}>Write your first response</h3>
                <p style={{ margin: '0 0 8px', color: '#bfdbfe', fontSize: 14 }}>
                  Word count: {toWordCountLabel(targetWordCount)}
                </p>
                <p style={{ margin: '0 0 8px', color: '#dbeafe', fontSize: 12, fontWeight: 700 }}>Typed so far: {initialResponseWordCount} words</p>
                <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12 }}>Try to stay close to this range.</p>
                <textarea
                  value={initialResponse}
                  onChange={(e: { target: { value: string } }) => setInitialResponse(e.target.value)}
                  placeholder="Write your first response here. This helps us understand your starting point and build your weekly coaching plan."
                  style={{ ...fieldStyle, minHeight: 130 }}
                />
                <button
                  onClick={() => void handleStart()}
                  disabled={loading || !promptText.trim() || !initialResponse.trim() || targetWordCount < 20}
                  className="writing-primary-button"
                  style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                  aria-label="Start Writing Week"
                >
                  {loading ? 'Building your weekly plan…' : 'Submit and build my plan'}
                </button>
              </section>
            </>
          )}

          {isActiveWeek && (
            <>
              <div className="dashboard-grid">
                <section className="writing-hub-card" style={{ ...missionCardStyle, borderColor: 'rgba(125, 211, 252, 0.8)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <p style={{ ...dashboardSectionTitleStyle, color: '#dbeafe' }}>Today</p>
                    <span style={{ ...sectionLabelPillStyle, color: '#bfdbfe', borderColor: 'rgba(147, 197, 253, 0.55)' }}>Action now</span>
                  </div>
                  <h3 style={{ margin: '0 0 10px', fontSize: 24, color: '#f8fafc' }}>Today’s writing mission</h3>
                {!todayTask.ok || !todayTask.data ? (
                  <div>
                    <p style={{ margin: 0, color: '#cbd5e1' }}>Preparing today’s task…</p>
                    <p style={{ margin: '6px 0 0', color: '#93c5fd', fontSize: 12 }}>If this takes longer, refresh and try again.</p>
                  </div>
                ) : (
                  <>
                      <h4 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: 18 }}>{taskTypeToFriendlyTitle(todayTask.data.task_type, todayTask.data.day_number)}</h4>
                    <p style={{ margin: '0 0 6px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Today’s goal</p>
                    <p style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: 15 }}>{simplifyStudentLanguage(aiTaskWording || taskTypeToFriendlyInstruction(todayTask.data.task_type))}</p>
                    <p style={{ margin: '0 0 6px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Focus on this</p>
                    <p style={{ margin: '0 0 8px', color: '#cbd5e1', fontSize: 14 }}>
                      This helps you improve your weekly focus areas and raise your writing score step by step.
                    </p>
                    <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 13 }}>Word count: {toWordCountLabel(todayTask.data.expected_word_count)}</p>
                    <p style={{ margin: '0 0 8px', color: '#dbeafe', fontSize: 12, fontWeight: 700 }}>Typed so far: {practiceResponseWordCount} words</p>
                    <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12 }}>Try to stay close to this range.</p>
                    <p style={{ margin: '0 0 6px', color: '#93c5fd', fontSize: 13, fontWeight: 700 }}>Try to do these 2 things</p>
                    <ul style={{ margin: '0 0 10px', paddingLeft: 18, color: '#cbd5e1', fontSize: 14 }}>
                      {todayTask.data.success_criteria.slice(0, 2).map((item) => (
                        <li key={item} style={{ marginBottom: 4 }}>{simplifyStudentLanguage(item)}</li>
                      ))}
                    </ul>
                    <textarea
                      ref={practiceTextareaRef}
                      value={practiceResponse}
                      onChange={(e: { target: { value: string } }) => setPracticeResponse(e.target.value)}
                      placeholder="Write today’s response here. Focus on today’s goal and your weekly coaching points."
                      style={{ ...fieldStyle, minHeight: 120 }}
                    />
                    <button
                      onClick={() => void handleSubmitPractice()}
                      disabled={loading || !practiceResponse.trim()}
                      className="writing-primary-button"
                      style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                      aria-label="Submit Today’s Task"
                    >
                      {loading ? 'Submitting today’s writing…' : 'Submit Today’s Task'}
                    </button>
                  </>
                )}
                </section>

                <section ref={feedbackCardRef} className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(16, 185, 129, 0.42)', background: 'linear-gradient(168deg, #0f172a 0%, #122034 60%, #0b1224 100%)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <p style={{ ...dashboardSectionTitleStyle, color: '#86efac' }}>Your Feedback</p>
                    <span style={{ ...sectionLabelPillStyle, color: '#6ee7b7', borderColor: 'rgba(52, 211, 153, 0.4)' }}>Coaching</span>
                  </div>
                  <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 22, color: '#f8fafc' }}>Quick coaching snapshot</h3>
                {isAnalyzingRichFeedback ? (
                  <div
                    className="analysis-shimmer"
                    role="status"
                    aria-live="polite"
                    style={{
                      border: '1px solid rgba(56, 189, 248, 0.45)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'linear-gradient(140deg, rgba(30,41,59,0.85) 0%, rgba(17,24,39,0.9) 55%, rgba(30,27,75,0.8) 100%)',
                      boxShadow: '0 0 28px rgba(56, 189, 248, 0.18)',
                    }}
                  >
                    <p style={{ margin: '0 0 6px', color: '#67e8f9', fontWeight: 800, fontSize: 16 }}>Analyzing your writing…</p>
                    <p style={{ margin: '0 0 10px', color: '#c4b5fd', fontSize: 14 }}>
                      {['Reading your answer…', 'Checking task match…', 'Finding grammar fixes…', 'Preparing your next step…'][analysisStageIndex]}
                    </p>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-hidden="true">
                      <span className="analysis-dot" />
                      <span className="analysis-dot" />
                      <span className="analysis-dot" />
                    </div>
                  </div>
                ) : aiFeedbackDetails ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <p style={{ margin: 0, color: '#a7f3d0', fontSize: 14 }}>
                      AI review is ready. Open the cinematic feedback view to see strengths, corrections, and your next move.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowAiReviewModal(true)}
                      className="writing-primary-button"
                      style={{ ...primaryButtonStyle, marginTop: 0 }}
                    >
                      Open cinematic AI review
                    </button>
                    <p style={{ margin: 0, color: '#93c5fd', fontSize: 13 }}>
                      {feedback || (completedTasksCount > 0 ? `Great consistency. You completed ${completedTasksCount} task${completedTasksCount === 1 ? '' : 's'} this week.` : 'Great start. Your progress grows every day you submit.')}
                    </p>
                  </div>
                ) : (
                  <p style={{ margin: 0, color: feedback ? '#a7f3d0' : '#94a3b8', fontSize: 15 }}>
                    {feedback || (completedTasksCount > 0 ? `Great consistency. You completed ${completedTasksCount} task${completedTasksCount === 1 ? '' : 's'} this week.` : 'Great start. Your progress grows every day you submit.')}
                  </p>
                )}
                </section>
              </div>

              <div className="dashboard-grid">
                <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(96, 165, 250, 0.55)', background: 'linear-gradient(180deg, #0f172a 0%, #111b34 100%)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <p style={{ ...dashboardSectionTitleStyle, color: '#93c5fd' }}>Your Progress</p>
                    <span style={{ ...sectionLabelPillStyle, color: '#bfdbfe', borderColor: 'rgba(147, 197, 253, 0.45)' }}>Snapshot</span>
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 21, color: '#f8fafc' }}>Progress at a glance</h3>
                  <p style={{ margin: '0 0 8px', color: '#dbeafe', fontSize: 15 }}>
                    Current score: <strong>{progressAssessment?.total_score != null ? `${progressAssessment.total_score}/20` : 'Waiting for first score'}</strong>
                  </p>
                  <p style={{ margin: '0 0 8px', color: '#bfdbfe', fontSize: 14 }}>
                    Weekly focus: {aiWeeklyFocus || 'We picked your focus areas based on your first writing.'}
                  </p>
                  <p style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: 14 }}>
                    What’s improving: {showWeeklyEvidence
                      ? `You completed ${weeklySummary?.completed_tasks} task${weeklySummary?.completed_tasks === 1 ? '' : 's'} this week.`
                      : 'You are building consistency. Keep submitting daily tasks.'}
                  </p>
                  <p style={{ margin: '0 0 10px', color: '#93c5fd', fontSize: 14 }}>
                    What to work on today: {toStudentLabel(nextWeekInputs?.carry_forward_primary_target ?? weeklyGoals[0] ?? 'Keep building your weekly focus skills.')}
                  </p>
                  <p style={{ margin: '0 0 10px', color: '#86efac', fontSize: 14 }}>
                    Next step: {toStudentLabel(nextWeekInputs?.carry_forward_primary_target ?? 'Keep building your weekly focus skills.')}
                  </p>
                  <details style={{ border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: 10, padding: 10, background: 'rgba(15,23,42,0.4)' }}>
                    <summary style={{ cursor: 'pointer', color: '#cbd5e1', fontWeight: 700 }}>View full progress details</summary>
                    <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                      <div className="focus-grid">
                        {subscaleCards.map((item) => {
                          const tone = getProgressTone(item.score);
                          const scorePercent = item.score == null ? 0 : Math.max(0, Math.min(100, (item.score / 5) * 100));
                          return (
                            <div
                              key={item.key}
                              style={{
                                borderRadius: 12,
                                border: `1px solid ${tone.glow}`,
                                background: 'rgba(15, 23, 42, 0.55)',
                                padding: 10,
                                display: 'grid',
                                gap: 6,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                                <p style={{ margin: 0, color: '#dbeafe', fontSize: 13, fontWeight: 700 }}>{item.label}</p>
                                <p style={{ margin: 0, color: '#f8fafc', fontSize: 13, fontWeight: 800 }}>
                                  {item.score == null ? '— / 5' : `${item.score}/5`}
                                </p>
                              </div>
                              <div style={{ ...progressTrackStyle, height: 8 }}>
                                <div className="progress-fill" style={{ width: `${scorePercent}%`, height: '100%', background: tone.color }} />
                              </div>
                              <p style={{ margin: 0, fontSize: 12, color: '#93c5fd' }}>
                                {tone.label}
                                {item.delta != null ? ` · ${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)} this month` : ''}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      <p style={{ margin: 0, color: '#bfdbfe' }}>Main focus: {toStudentLabel(dashboard.data?.weekly_plan_summary?.primary ?? 'Not set yet')}</p>
                      <details style={{ border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: 10, padding: 10, background: 'rgba(2, 6, 23, 0.45)' }}>
                        <summary style={{ cursor: 'pointer', color: '#93c5fd', fontWeight: 700 }}>Grammar, punctuation & style details</summary>
                        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                          <details style={{ border: '1px solid rgba(244, 114, 182, 0.35)', borderRadius: 10, padding: 8, background: 'rgba(30,27,75,0.35)' }}>
                            <summary style={{ cursor: 'pointer', color: '#f9a8d4', fontWeight: 700 }}>Grammar fixes</summary>
                            <div style={{ marginTop: 8 }}>
                              {(aiFeedbackDetails?.grammar_fixes?.length ?? 0) > 0 ? (aiFeedbackDetails?.grammar_fixes ?? []).map((item, idx) => (
                                <div key={`progress-grammar-${idx}`} style={{ marginBottom: 8 }}>
                                  <p style={{ margin: 0, color: '#e2e8f0' }}><strong>Original:</strong> “{item.original}”</p>
                                  <p style={{ margin: 0, color: '#cbd5e1' }}><strong>Issue:</strong> {item.issue}</p>
                                  <p style={{ margin: 0, color: '#a7f3d0' }}><strong>Better:</strong> {item.better_version}</p>
                                </div>
                              )) : <p style={{ margin: 0, color: '#94a3b8' }}>No grammar fixes were flagged in this pass.</p>}
                            </div>
                          </details>

                          <details style={{ border: '1px solid rgba(250, 204, 21, 0.35)', borderRadius: 10, padding: 8, background: 'rgba(51, 65, 85, 0.45)' }}>
                            <summary style={{ cursor: 'pointer', color: '#fde68a', fontWeight: 700 }}>Punctuation fixes</summary>
                            <div style={{ marginTop: 8 }}>
                              {(aiFeedbackDetails?.punctuation_fixes?.length ?? 0) > 0 ? (aiFeedbackDetails?.punctuation_fixes ?? []).map((item, idx) => (
                                <div key={`progress-punctuation-${idx}`} style={{ marginBottom: 8 }}>
                                  <p style={{ margin: 0, color: '#e2e8f0' }}><strong>Original:</strong> “{item.original}”</p>
                                  <p style={{ margin: 0, color: '#cbd5e1' }}><strong>Issue:</strong> {item.issue}</p>
                                  <p style={{ margin: 0, color: '#a7f3d0' }}><strong>Better:</strong> {item.better_version}</p>
                                </div>
                              )) : <p style={{ margin: 0, color: '#94a3b8' }}>No punctuation fixes were flagged in this pass.</p>}
                            </div>
                          </details>

                          <details style={{ border: '1px solid rgba(167, 139, 250, 0.35)', borderRadius: 10, padding: 8, background: 'rgba(30,27,75,0.35)' }}>
                            <summary style={{ cursor: 'pointer', color: '#c4b5fd', fontWeight: 700 }}>Natural phrase upgrades</summary>
                            <div style={{ marginTop: 8 }}>
                              {(aiFeedbackDetails?.natural_phrase_upgrades?.length ?? 0) > 0 ? (aiFeedbackDetails?.natural_phrase_upgrades ?? []).map((item, idx) => (
                                <div key={`progress-phrase-${idx}`} style={{ marginBottom: 8 }}>
                                  <p style={{ margin: 0, color: '#e2e8f0' }}><strong>Original:</strong> “{item.original}”</p>
                                  <p style={{ margin: 0, color: '#a7f3d0' }}><strong>Upgrade:</strong> {item.better_version}</p>
                                  <p style={{ margin: 0, color: '#cbd5e1' }}><strong>Why:</strong> {item.why_it_helps}</p>
                                </div>
                              )) : <p style={{ margin: 0, color: '#94a3b8' }}>No phrase upgrades were flagged in this pass.</p>}
                            </div>
                          </details>
                        </div>
                      </details>
                      {!showMonthlyEvidence ? (
                        <p style={{ margin: 0, color: '#94a3b8' }}>Complete more writing this month to unlock your growth view.</p>
                      ) : (
                        <>
                          <p style={{ margin: 0, color: '#bfdbfe' }}>Monthly growth</p>
                          <p style={{ margin: 0 }}>{toStudentLabel(monthlyFacingReport?.score_change ?? '')}</p>
                          {aiMonthlyWording && <p style={{ margin: 0, color: '#bfdbfe' }}>{aiMonthlyWording}</p>}
                          <p style={{ margin: 0, color: '#94a3b8' }}>{monthlyFacingReport?.subscale_progress.join(' ')}</p>
                          <p style={{ margin: 0, color: '#86efac' }}>Strongest gains: {monthlyFacingReport?.strongest_gains.map((item) => toStudentLabel(item)).join(', ')}</p>
                          <p style={{ margin: 0, color: '#fca5a5' }}>Main blocker: {toStudentLabel(monthlyFacingReport?.remaining_blockers[0] ?? 'None right now')}</p>
                          <p style={{ margin: 0, color: '#93c5fd' }}>Next step: {toStudentLabel(monthlyFacingReport?.next_month_priorities[0] ?? 'Keep completing your weekly writing tasks.')}</p>
                        </>
                      )}
                    </div>
                  </details>
                </section>

                <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(168, 85, 247, 0.42)', background: 'linear-gradient(175deg, #0f172a 0%, #171432 58%, #0b1224 100%)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <p style={{ ...dashboardSectionTitleStyle, color: '#c4b5fd' }}>More Help</p>
                    <span style={{ ...sectionLabelPillStyle, color: '#d8b4fe', borderColor: 'rgba(192, 132, 252, 0.35)' }}>Optional support</span>
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 21, color: '#f8fafc' }}>Deep guides & references</h3>
                  {missionRecommendations.length > 0 && (
                    <div style={{ marginBottom: 12, borderRadius: 12, border: '1px solid rgba(196, 181, 253, 0.45)', background: 'rgba(30, 27, 75, 0.35)', padding: 10 }}>
                      <p style={{ margin: '0 0 6px', color: '#d8b4fe', fontSize: 12, fontWeight: 800, letterSpacing: 0.2 }}>RECOMMENDED PRACTICE MISSIONS</p>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {missionRecommendations.map((item, index) => (
                          <div key={`${item.missionCategory}-${item.title}-${index}`} style={{ borderRadius: 10, border: '1px solid rgba(147, 197, 253, 0.35)', background: 'rgba(15, 23, 42, 0.52)', padding: 9 }}>
                            <p style={{ margin: 0, color: '#f8fafc', fontSize: 14, fontWeight: 700 }}>{item.title}</p>
                            <p style={{ margin: '3px 0 0', color: '#bfdbfe', fontSize: 12 }}>
                              {item.missionCategoryLabel}
                              {item.mission?.difficulty ? ` · ${item.mission.difficulty}` : ''}
                              {item.source === 'category_fallback' ? ' · Practice card' : ' · Mission'}
                            </p>
                            <p style={{ margin: '6px 0 0', color: '#e2e8f0', fontSize: 13 }}>{item.reason}</p>
                            <button
                              type="button"
                              onClick={() => {
                                if (item.source === 'quest') {
                                  onOpenQuestMission?.(item.mission?.id);
                                  setUiNotice(`Opening mission: ${item.title}`);
                                  return;
                                }
                                onOpenQuestMission?.();
                                setUiNotice(`Practice this skill next: ${item.missionCategoryLabel}.`);
                              }}
                              style={{
                                marginTop: 7,
                                padding: '7px 10px',
                                borderRadius: 8,
                                border: '1px solid rgba(167, 139, 250, 0.5)',
                                background: 'rgba(76, 29, 149, 0.35)',
                                color: '#ddd6fe',
                                fontWeight: 700,
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              {item.source === 'quest' ? 'Start mission' : 'Practice this skill'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p style={{ margin: '0 0 8px', color: '#bfdbfe', fontSize: 14 }}>{masteryTargetByGenre[activeGenre]}</p>
                  <p style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: 14 }}>
                    Target score range: {estimatedTargetRange ? `${estimatedTargetRange.low}–${estimatedTargetRange.high} / 20` : 'Will appear after first scoring'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowTaskTypeGuide((prev) => !prev)}
                    style={{
                      margin: '0 0 10px',
                      padding: '8px 11px',
                      borderRadius: 10,
                      border: '1px solid rgba(147, 197, 253, 0.65)',
                      background: 'rgba(30, 41, 59, 0.95)',
                      color: '#dbeafe',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {showTaskTypeGuide ? 'Hide detailed task guide' : 'Show detailed task guide'}
                  </button>
                  {showTaskTypeGuide && todayTask.ok && todayTask.data && (
                    <div style={{ borderRadius: 12, border: '1px solid rgba(147, 197, 253, 0.45)', background: 'rgba(15, 23, 42, 0.45)', padding: 12, marginBottom: 10 }}>
                      <p style={{ margin: '0 0 6px', color: '#93c5fd', fontSize: 12, fontWeight: 800 }}>How to answer this task type</p>
                      <p style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: 14 }}>
                        <strong>Goal:</strong> {getTaskTypeStudyGuide(todayTask.data.task_type).objective}
                      </p>
                      <p style={{ margin: '0 0 4px', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Best structure</p>
                      <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: '#cbd5e1', fontSize: 13 }}>
                        {getTaskTypeStudyGuide(todayTask.data.task_type).structure.map((item) => (
                          <li key={item} style={{ marginBottom: 3 }}>{item}</li>
                        ))}
                      </ul>
                      <p style={{ margin: '0 0 4px', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Check before you submit</p>
                      <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: '#cbd5e1', fontSize: 13 }}>
                        {getTaskTypeStudyGuide(todayTask.data.task_type).qualityChecks.map((item) => (
                          <li key={item} style={{ marginBottom: 3 }}>{item}</li>
                        ))}
                      </ul>
                      <p style={{ margin: '0 0 4px', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Common mistakes to avoid</p>
                      <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 13 }}>
                        {getTaskTypeStudyGuide(todayTask.data.task_type).pitfalls.map((item) => (
                          <li key={item} style={{ marginBottom: 3 }}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTaskContextModal(true)}
                    style={{
                      margin: 0,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(168, 85, 247, 0.45)',
                      background: 'rgba(30, 27, 75, 0.45)',
                      color: '#ddd6fe',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Open task + starter context
                  </button>
                </section>
              </div>
            </>
          )}

          {isWeekComplete && (
            <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(250, 204, 21, 0.45)', background: 'linear-gradient(175deg,#1f2937 0%, #0b1224 80%)' }}>
              <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 22, color: '#fde68a' }}>Week complete 🎯</h3>
              <p style={{ margin: '0 0 8px', color: '#fef3c7', fontSize: 15 }}>You finished your writing mission. Nice consistency and progress. All tasks submitted for now.</p>
              <p style={{ margin: '0 0 8px', color: '#dbeafe', fontSize: 14 }}>Tasks completed: {completedTasksCount}/{totalPlannedTasks}</p>
              <p style={{ margin: '0 0 8px', color: '#bfdbfe', fontSize: 14 }}>
                What improved: {studentFriendlyWeaknesses.length > 0 ? studentFriendlyWeaknesses.slice(0, 2).join(' · ') : 'Your writing control and task focus improved.'}
              </p>
              <button
                onClick={() => void handleStart({ fromWeekComplete: true })}
                disabled={loading || !promptText.trim() || targetWordCount < 20}
                className="writing-primary-button"
                style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                aria-label="Start New Week"
              >
                {loading ? 'Starting new week…' : 'Start New Week'}
              </button>
            </section>
          )}

          {!isActiveWeek && (
            <details className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(148, 163, 184, 0.28)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#e2e8f0' }}>View your progress details</summary>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <div className="focus-grid">
                {subscaleCards.map((item) => {
                  const tone = getProgressTone(item.score);
                  const scorePercent = item.score == null ? 0 : Math.max(0, Math.min(100, (item.score / 5) * 100));
                  return (
                    <div
                      key={item.key}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${tone.glow}`,
                        background: 'rgba(15, 23, 42, 0.55)',
                        padding: 10,
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <p style={{ margin: 0, color: '#dbeafe', fontSize: 13, fontWeight: 700 }}>{item.label}</p>
                        <p style={{ margin: 0, color: '#f8fafc', fontSize: 13, fontWeight: 800 }}>
                          {item.score == null ? '— / 5' : `${item.score}/5`}
                        </p>
                      </div>
                      <div style={{ ...progressTrackStyle, height: 8 }}>
                        <div className="progress-fill" style={{ width: `${scorePercent}%`, height: '100%', background: tone.color }} />
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: '#93c5fd' }}>
                        {tone.label}
                        {item.delta != null ? ` · ${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)} this month` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>

              <p style={{ margin: 0, color: '#bfdbfe' }}>Main focus: {toStudentLabel(dashboard.data?.weekly_plan_summary?.primary ?? 'Not set yet')}</p>
              {!showWeeklyEvidence ? (
                <>
                  <p style={{ margin: 0, color: '#94a3b8' }}>You’re just getting started this week.</p>
                  <p style={{ margin: 0, color: '#94a3b8' }}>Complete today’s task to unlock clearer progress feedback.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, color: '#bfdbfe' }}>What’s improving: You completed {weeklySummary?.completed_tasks} task{weeklySummary?.completed_tasks === 1 ? '' : 's'} this week.</p>
                  <p style={{ margin: 0, color: '#94a3b8' }}>
                    What to work on today: {weeklySummary?.top_remaining_weaknesses.map((item) => toStudentLabel(item)).join(', ') || 'Keep practising your weekly goals.'}
                  </p>
                  <p style={{ margin: 0, color: '#86efac' }}>
                    Next step: {toStudentLabel(nextWeekInputs?.carry_forward_primary_target ?? 'Keep building your weekly focus skills.')}
                  </p>
                </>
              )}

              {!showMonthlyEvidence ? (
                <p style={{ margin: 0, color: '#94a3b8' }}>Complete more writing this month to unlock your growth view.</p>
              ) : (
                <>
                  <p style={{ margin: 0, color: '#bfdbfe' }}>Monthly growth</p>
                  <p style={{ margin: 0 }}>{toStudentLabel(monthlyFacingReport?.score_change ?? '')}</p>
                  {aiMonthlyWording && <p style={{ margin: 0, color: '#bfdbfe' }}>{aiMonthlyWording}</p>}
                  <p style={{ margin: 0, color: '#94a3b8' }}>{monthlyFacingReport?.subscale_progress.join(' ')}</p>
                  <p style={{ margin: 0, color: '#86efac' }}>Strongest gains: {monthlyFacingReport?.strongest_gains.map((item) => toStudentLabel(item)).join(', ')}</p>
                  <p style={{ margin: 0, color: '#fca5a5' }}>Main blocker: {toStudentLabel(monthlyFacingReport?.remaining_blockers[0] ?? 'None right now')}</p>
                  <p style={{ margin: 0, color: '#93c5fd' }}>Next step: {toStudentLabel(monthlyFacingReport?.next_month_priorities[0] ?? 'Keep completing your weekly writing tasks.')}</p>
                </>
              )}
              </div>
            </details>
          )}

          {(uiNotice || isRefreshingProgress) && (
            <p style={{ ...shellCardStyle, margin: 0, color: '#bfdbfe', borderColor: 'rgba(96, 165, 250, 0.45)' }}>
              {isRefreshingProgress ? 'Loading progress updates…' : uiNotice}
            </p>
          )}

          {persistenceStatus.state === 'saving' && (
            <p style={{ ...shellCardStyle, margin: 0, color: '#bfdbfe', borderColor: 'rgba(56, 189, 248, 0.45)' }}>
              Saving your writing progress…
            </p>
          )}

          {persistenceStatus.state === 'failed' && (
            <section style={{ ...shellCardStyle, margin: 0, color: '#fecaca', borderColor: 'rgba(248, 113, 113, 0.55)' }}>
              <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Progress save failed.</p>
              <p style={{ margin: 0, color: '#fee2e2', fontSize: 13 }}>
                {persistenceStatus.message || 'Your latest changes may only be stored locally on this device.'}
              </p>
            </section>
          )}

          {error && (
            <section style={{ ...shellCardStyle, margin: 0, color: '#fecaca', borderColor: 'rgba(248, 113, 113, 0.45)' }}>
              <p style={{ margin: 0 }}>{error}</p>
              <button
                type="button"
                onClick={handleRetryLoad}
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(248, 113, 113, 0.6)',
                  background: 'rgba(127, 29, 29, 0.4)',
                  color: '#fecaca',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </section>
          )}

          {dashboard.ok && dashboard.data && (
            <p style={{ margin: 0, color: '#64748b', fontSize: 12, textAlign: 'center' }}>
              Mission progress: {dashboard.data.completed_tasks_count} completed · latest score {dashboard.data.latest_total_score ?? '--'}
            </p>
          )}

          {!stateRes.ok && (
            <section className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'rgba(248,113,113,0.5)' }}>
              <h3 style={{ marginTop: 0, marginBottom: 8, color: '#fecaca' }}>We’re having trouble loading your writing data.</h3>
              <p style={{ margin: 0, color: '#fecaca' }}>Please refresh and try again. Your writing progress is safe.</p>
              <button
                type="button"
                onClick={handleRetryLoad}
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(248, 113, 113, 0.6)',
                  background: 'rgba(127, 29, 29, 0.4)',
                  color: '#fecaca',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Retry loading
              </button>
            </section>
          )}

          {showNoWritingState && !isPreWeek && (
            <section className="writing-hub-card" style={shellCardStyle}>
              <h3 style={{ marginTop: 0, marginBottom: 8, color: '#f8fafc' }}>No active writing task yet</h3>
              <p style={{ margin: 0, color: '#cbd5e1' }}>Start your first week to unlock your mission board and daily coaching.</p>
            </section>
          )}
        </>
      )}

      {showAiReviewModal && submittedPracticeText.trim() && createPortal((
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AI feedback review"
          onClick={() => setShowAiReviewModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1150,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(2, 6, 23, 0.78)',
            padding: 16,
          }}
        >
          <div
            className="ai-review-modal-shell"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            style={{
              width: 'min(840px, 100%)',
              borderRadius: 18,
              border: '1px solid rgba(125, 211, 252, 0.4)',
              background: 'linear-gradient(180deg, rgba(10,18,35,0.98) 0%, rgba(11,15,28,0.98) 100%)',
              boxShadow: '0 28px 60px rgba(2, 6, 23, 0.75)',
              padding: 16,
              overflow: 'hidden',
              display: 'grid',
              gap: 12,
            }}
          >
            <div className="ai-review-scan" aria-hidden="true" />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <p style={{ margin: 0, color: '#93c5fd', fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>AI FEEDBACK</p>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 22 }}>Submitted · Smart review in progress</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiReviewModal(false)}
                style={{
                  borderRadius: 999,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: '#e2e8f0',
                  width: 34,
                  height: 34,
                  fontSize: 18,
                  lineHeight: '18px',
                  cursor: 'pointer',
                }}
                aria-label="Close AI feedback modal"
              >
                ×
              </button>
            </div>

            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ borderRadius: 999, padding: '4px 10px', border: '1px solid rgba(16,185,129,0.45)', color: '#bbf7d0', fontSize: 12, fontWeight: 700 }}>Submitted ✓</span>
              <span style={{ borderRadius: 999, padding: '4px 10px', border: '1px solid rgba(56,189,248,0.45)', color: '#bae6fd', fontSize: 12, fontWeight: 700 }}>
                {reviewScanComplete ? 'Review complete ✓' : 'AI review scanning…'}
              </span>
              {reviewAnchorTrust.mode === 'trusted' ? (
                <span style={{ borderRadius: 999, padding: '4px 10px', border: '1px solid rgba(125,211,252,0.45)', color: '#dbeafe', fontSize: 12, fontWeight: 700 }}>
                  Trusted anchors
                </span>
              ) : (
                <span style={{ borderRadius: 999, padding: '4px 10px', border: '1px solid rgba(148,163,184,0.45)', color: '#cbd5e1', fontSize: 12, fontWeight: 700 }}>
                  Guided highlights
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#67e8f9', fontSize: 12 }}>
                <span className="ai-review-status-dot" />
                {reviewScanComplete ? 'Highlights locked' : 'Live analysis'}
              </span>
            </div>

            <div
              style={{
                position: 'relative',
                zIndex: 1,
                borderRadius: 14,
                border: '1px solid rgba(148, 163, 184, 0.32)',
                background: 'rgba(15, 23, 42, 0.75)',
                padding: 14,
                color: '#e2e8f0',
                lineHeight: 1.7,
                fontSize: 15,
                whiteSpace: 'pre-wrap',
              }}
            >
              {!reviewScanComplete && reviewScanPlan.length > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.16) 45%, transparent 78%)',
                    transform: 'translateX(-100%)',
                    animation: 'textScanFlow 1.2s ease-in-out infinite',
                  }}
                />
              )}
              {renderAnnotatedText(submittedPracticeText, visibleSubmittedHighlightRanges, reviewActiveIndex)}
            </div>

            <p style={{ position: 'relative', zIndex: 1, margin: 0, color: '#94a3b8', fontSize: 12 }}>
              Green glow = strong writing choices. Red glow = corrections (grammar, awkward wording, or spelling).
            </p>

            {activeReviewRange && (
              <div style={{ position: 'relative', zIndex: 1, borderRadius: 10, border: `1px solid ${activeReviewRange.polarity === 'strong' ? 'rgba(74,222,128,0.45)' : 'rgba(248,113,113,0.45)'}`, background: 'rgba(15,23,42,0.62)', padding: 10 }}>
                <p style={{ margin: '0 0 4px', color: activeReviewRange.polarity === 'strong' ? '#86efac' : '#fca5a5', fontWeight: 700, fontSize: 13 }}>
                  {activeReviewNote.label}
                </p>
                <p style={{ margin: 0, color: '#e2e8f0', fontSize: 14 }}>{activeReviewNote.detail}</p>
                {activeReviewNote.correction && (
                  <p style={{ margin: '6px 0 0', color: '#bbf7d0', fontSize: 14 }}>
                    Better version: {activeReviewNote.correction}
                  </p>
                )}
              </div>
            )}

            {reviewScanPlan.length > 0 && (
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setReviewActiveIndex((prev) => Math.max(0, (prev ?? 0) - 1))}
                  disabled={(reviewActiveIndex ?? 0) <= 0}
                  style={{
                    borderRadius: 10,
                    border: '1px solid rgba(148,163,184,0.45)',
                    background: 'rgba(15,23,42,0.72)',
                    color: '#e2e8f0',
                    padding: '7px 11px',
                    cursor: (reviewActiveIndex ?? 0) <= 0 ? 'not-allowed' : 'pointer',
                    opacity: (reviewActiveIndex ?? 0) <= 0 ? 0.55 : 1,
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setReviewActiveIndex((prev) => Math.min(Math.max(0, visibleSubmittedHighlightRanges.length - 1), (prev ?? 0) + 1))}
                  disabled={(reviewActiveIndex ?? 0) >= Math.max(0, visibleSubmittedHighlightRanges.length - 1)}
                  style={{
                    borderRadius: 10,
                    border: '1px solid rgba(148,163,184,0.45)',
                    background: 'rgba(15,23,42,0.72)',
                    color: '#e2e8f0',
                    padding: '7px 11px',
                    cursor: (reviewActiveIndex ?? 0) >= Math.max(0, visibleSubmittedHighlightRanges.length - 1) ? 'not-allowed' : 'pointer',
                    opacity: (reviewActiveIndex ?? 0) >= Math.max(0, visibleSubmittedHighlightRanges.length - 1) ? 0.55 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            )}

            {reviewScanComplete && (
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  borderRadius: 12,
                  border: '1px solid rgba(16,185,129,0.35)',
                  background: 'rgba(6, 78, 59, 0.25)',
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <p style={{ margin: 0, color: '#d1fae5', fontWeight: 700 }}>Next action</p>
                <p style={{ margin: 0, color: '#ecfdf5', fontSize: 14 }}>
                  {aiFeedbackDetails?.next_move || (aiFeedbackDetails?.next_steps ?? []).slice(0, 1)[0] || 'Pick one red highlight and revise that sentence now.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPracticeResponse(submittedPracticeText);
                    setShowAiReviewModal(false);
                    setUiNotice('Revision mode is on. Review Your Feedback card, then improve one highlighted sentence and submit again.');
                    window.setTimeout(() => {
                      feedbackCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 40);
                  }}
                  style={{
                    justifySelf: 'start',
                    borderRadius: 10,
                    border: '1px solid rgba(110,231,183,0.55)',
                    background: 'linear-gradient(135deg, rgba(5,150,105,0.5), rgba(14,116,144,0.45))',
                    color: '#ecfdf5',
                    padding: '8px 12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Start revision
                </button>
              </div>
            )}
          </div>
        </div>
      ), document.body)}

      {showTaskContextModal && createPortal((
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Task and first attempt"
          onClick={() => setShowTaskContextModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(2, 6, 23, 0.72)',
            padding: 16,
          }}
        >
          <div
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            style={{
              width: 'min(980px, 100%)',
              maxHeight: 'calc(100vh - 32px)',
              borderRadius: 16,
              border: '1px solid rgba(125, 211, 252, 0.35)',
              background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
              boxShadow: '0 24px 50px rgba(2, 6, 23, 0.6)',
              padding: 14,
              overflow: 'auto',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ margin: 0, color: '#dbeafe', fontSize: 16, fontWeight: 800 }}>Your first coaching session</p>
                <p style={{ margin: '4px 0 0', color: '#93c5fd', fontSize: 12 }}>
                  We start with what worked, then fix one thing at a time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTaskContextModal(false)}
                aria-label="Close task context modal"
                ref={closeModalButtonRef}
                style={{
                  borderRadius: 999,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: 'rgba(15, 23, 42, 0.7)',
                  color: '#e2e8f0',
                  width: 32,
                  height: 32,
                  fontSize: 18,
                  lineHeight: '18px',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ borderRadius: 999, padding: '3px 9px', border: '1px solid rgba(125, 211, 252, 0.45)', color: '#bae6fd', fontSize: 11 }}>1) Understand task</span>
              <span style={{ borderRadius: 999, padding: '3px 9px', border: '1px solid rgba(74, 222, 128, 0.45)', color: '#bbf7d0', fontSize: 11 }}>2) Keep strengths</span>
              <span style={{ borderRadius: 999, padding: '3px 9px', border: '1px solid rgba(248, 113, 113, 0.45)', color: '#fecaca', fontSize: 11 }}>3) Repair step by step</span>
            </div>
            <div className="focus-grid" style={{ gap: 12 }}>
              <div style={{ ...fieldStyle, background: 'rgba(15, 23, 42, 0.46)', minHeight: 200 }}>
                <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Step 1 · What the task asked</p>
                <p style={{ margin: 0, fontSize: 14, color: '#e2e8f0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {originalPromptText ?? promptText}
                </p>
                <div style={{ marginTop: 10, borderTop: '1px solid rgba(148, 163, 184, 0.25)', paddingTop: 10 }}>
                  <p style={{ margin: '0 0 6px', color: '#86efac', fontSize: 12, fontWeight: 700 }}>Step 2 · Keep these strengths</p>
                  {studentStrengths.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 18, color: '#dcfce7', fontSize: 13, display: 'grid', gap: 4 }}>
                      {studentStrengths.map((item, idx) => (
                        <li key={`first-strength-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, color: '#bbf7d0', fontSize: 13 }}>
                      You already have a useful starting idea. Keep that clarity while you revise.
                    </p>
                  )}
                </div>
              </div>
              <div style={{ ...fieldStyle, background: 'rgba(15, 23, 42, 0.46)', minHeight: 200, display: 'grid', gap: 10 }}>
                <div>
                  <p style={{ margin: '0 0 8px', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Your first attempt (coached view)</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(74, 222, 128, 0.4)', color: '#86efac', fontSize: 11 }}>
                      Strong signals
                    </span>
                    <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(248, 113, 113, 0.45)', color: '#fca5a5', fontSize: 11 }}>
                      Repair targets
                    </span>
                    {anchorTrustEvaluation.mode === 'trusted' ? (
                      <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(96, 165, 250, 0.45)', color: '#bfdbfe', fontSize: 11 }}>
                        Trusted anchor highlight mode
                      </span>
                    ) : anchorTrustEvaluation.mode === 'stale_feedback' ? (
                      <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(248,113,113,0.45)', color: '#fca5a5', fontSize: 11 }}>
                        Anchors blocked (out-of-sync feedback)
                      </span>
                    ) : anchorTrustEvaluation.mode === 'missing_fingerprint' ? (
                      <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(250, 204, 21, 0.45)', color: '#fde68a', fontSize: 11 }}>
                        Anchors unavailable (missing fingerprint)
                      </span>
                    ) : anchorTrustEvaluation.mode === 'no_anchors' ? (
                      <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(148, 163, 184, 0.4)', color: '#cbd5e1', fontSize: 11 }}>
                        Guidance-only mode (no anchors provided)
                      </span>
                    ) : (
                      <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(148, 163, 184, 0.4)', color: '#cbd5e1', fontSize: 11 }}>
                        Safe fallback mode
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      borderRadius: 10,
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      padding: 10,
                      background: 'rgba(15, 23, 42, 0.55)',
                      minHeight: 170,
                      fontSize: 14,
                      color: '#e2e8f0',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      lineHeight: 1.6,
                    }}
                  >
                    {(() => {
                      const text = firstAttemptSubmission || 'Your first response is saved and used as your starting point.';
                      if (!firstAttemptSubmission) return text;
                      const ranges = [...firstAttemptAnchorRanges];
                      if (activeRepairRange) {
                        ranges.push({
                          start: activeRepairRange.start,
                          end: activeRepairRange.end,
                          polarity: 'weak',
                          reason: activeRepairItem?.title ?? 'repair focus',
                        });
                      }
                      return renderAnnotatedText(text, ranges);
                    })()}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.25)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12, fontWeight: 700 }}>
                      Step 3 · Let’s fix one thing at a time
                    </p>
                    {repairQueue.length > 0 && (
                      <span style={{ color: '#bfdbfe', fontSize: 11 }}>
                        Step {Math.min(repairQueue.length, sessionSeenRepairCount || 1)} of {repairQueue.length} · session progress
                      </span>
                    )}
                  </div>
                  {repairQueue.length > 0 && (
                    <div style={{ height: 6, borderRadius: 999, background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.3)', marginBottom: 10 }}>
                      <div style={{ height: '100%', borderRadius: 999, width: `${(sessionSeenRepairCount / repairQueue.length) * 100}%`, background: 'linear-gradient(90deg, #38bdf8 0%, #34d399 100%)', transition: 'width 180ms ease' }} />
                    </div>
                  )}
                  <p style={{ margin: '0 0 8px', color: '#94a3b8', fontSize: 12 }}>
                    Pick one step, revise that part, then move to the next.
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {repairQueue.length === 0 ? (
                      <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
                        No repair steps available yet. Submit feedback to unlock targeted fixes.
                      </p>
                    ) : repairQueue.map((item, idx) => {
                      const active = item.id === activeRepairItem?.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveRepairId(item.id)}
                          ref={idx === 0 ? firstRepairButtonRef : undefined}
                          style={{
                            textAlign: 'left',
                            borderRadius: 10,
                            border: active ? '1px solid rgba(248,113,113,0.68)' : '1px solid rgba(148,163,184,0.35)',
                            background: active ? 'rgba(127,29,29,0.32)' : 'rgba(15,23,42,0.45)',
                            padding: '8px 10px',
                            cursor: 'pointer',
                            color: '#e2e8f0',
                          }}
                        >
                          <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', fontWeight: 700 }}>
                            {active ? 'Start here' : `Step ${idx + 1}`} · {item.category.replace('_', ' ')}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700 }}>{item.title}</p>
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#cbd5e1' }}>{item.explanation}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p style={{ margin: 0, color: '#bfdbfe', fontSize: 12 }}>{repairStatusMessage}</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowTaskContextModal(false)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                  background: 'rgba(15, 23, 42, 0.78)',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export const seedWritingHubForDemo = (studentId: string, grade: number, genre: WritingHubProps['genre']): void => {
  submitInitialWritingAssessment({
    student_id: studentId,
    grade,
    genre,
    prompt_text: defaultPromptByGenre[genre],
    target_word_count: grade <= 7 ? 80 : grade <= 9 ? 120 : 160,
    student_response:
      'This response describes the event, explains why it mattered, and gives one practical suggestion for next time.',
  });
};

export default WritingHub;
