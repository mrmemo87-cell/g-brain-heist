import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Observer } from 'gsap/Observer';
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
  listWritingPrompts,
  getTodayWritingTask,
  getWeeklyWritingReview,
  submitDailyWritingPractice,
  submitInitialWritingAssessment,
  getStudentPromptAttemptCount,
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
  sourceCategory?: string;
  sourceExactText?: string;
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

gsap.registerPlugin(DrawSVGPlugin, Observer);

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

type WritingHubThemeMode = 'dark' | 'light';
type ThemeVarStyle = Record<string, string | number>;

const getPageStyle = (_theme: WritingHubThemeMode) => ({
  padding: 12,
  display: 'grid',
  gap: 12,
  width: '100%',
  maxWidth: 1120,
  margin: '0 auto',
  color: 'var(--hub-text)',
  overflowX: 'clip' as const,
});

const getShellCardStyle = (_theme: WritingHubThemeMode) => ({
  borderRadius: 20,
  border: '1px solid var(--hub-border)',
  background: 'var(--hub-surface-card)',
  padding: 16,
  boxShadow: 'var(--hub-shadow-card)',
});

const getMissionCardStyle = (_theme: WritingHubThemeMode) => ({
  ...getShellCardStyle(_theme),
  background: 'var(--hub-surface-hero)',
  border: '1px solid var(--hub-border-strong)',
});

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
  border: '1px solid var(--hub-border)',
  background: 'var(--hub-muted-surface-soft)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.4,
};

const progressTrackStyle = {
  height: 10,
  background: 'var(--hub-progress-track)',
  borderRadius: 999,
  overflow: 'hidden',
};

const fieldStyle = {
  width: '100%',
  borderRadius: 12,
  border: '1px solid var(--hub-border)',
  background: 'var(--hub-overlay-strong)',
  color: 'var(--hub-text-strong)',
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
  border: '1px solid var(--hub-border-strong)',
  background: 'var(--hub-muted-surface-soft)',
  fontSize: 12,
  color: 'var(--hub-text-soft)',
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

const getHighlightAnimationDurationMs = (segmentLength: number): number => Math.max(140, Math.min(360, segmentLength * 14));

const getWordCounterTone = (
  typedWords: number,
  targetWords: number
): { label: string; accent: string; glow: string; track: string; progress: number; microcopy: string } => {
  const safeTarget = Math.max(1, targetWords);
  const targetRange = computeWordCountRange(safeTarget);
  const nearStart = Math.max(1, targetRange.min - Math.ceil(safeTarget * 0.12));
  const overLong = Math.ceil(targetRange.max * 1.18);
  const progress = Math.max(0, Math.min(100, Math.round((typedWords / safeTarget) * 100)));
  if (typedWords < nearStart) {
    return {
      label: 'Too short',
      accent: '#60a5fa',
      glow: 'rgba(96,165,250,0.35)',
      track: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)',
      progress,
      microcopy: 'Add key ideas and one supporting detail.',
    };
  }
  if (typedWords < targetRange.min) {
    return {
      label: 'Almost there',
      accent: '#22d3ee',
      glow: 'rgba(34,211,238,0.35)',
      track: 'linear-gradient(90deg, #0891b2 0%, #22d3ee 100%)',
      progress,
      microcopy: 'Great pace—add a few lines to reach target.',
    };
  }
  if (typedWords <= targetRange.max) {
    return {
      label: 'On target',
      accent: '#4ade80',
      glow: 'rgba(74,222,128,0.35)',
      track: 'linear-gradient(90deg, #22c55e 0%, #34d399 100%)',
      progress,
      microcopy: 'Perfect range. Focus on clarity and accuracy.',
    };
  }
  if (typedWords <= overLong) {
    return {
      label: 'Slightly long',
      accent: '#fb923c',
      glow: 'rgba(251,146,60,0.35)',
      track: 'linear-gradient(90deg, #f59e0b 0%, #fb923c 100%)',
      progress,
      microcopy: 'Trim repeated points to stay sharp.',
    };
  }
  return {
    label: 'Too long',
    accent: '#f97316',
    glow: 'rgba(249,115,22,0.35)',
    track: 'linear-gradient(90deg, #f59e0b 0%, #f97316 100%)',
    progress,
    microcopy: 'Cut repetition and keep your strongest ideas.',
  };
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
  const classifyPolarity = (category: string | undefined, fallback: 'strong' | 'weak'): 'strong' | 'weak' => {
    const normalized = (category ?? '').toLowerCase();
    if (!normalized) return fallback;
    if (normalized.includes('strong') || normalized.includes('strength') || normalized.includes('what_is_working')) return 'strong';
    if (
      normalized.includes('grammar')
      || normalized.includes('punct')
      || normalized.includes('spelling')
      || normalized.includes('phrase')
      || normalized.includes('style')
      || normalized.includes('fix')
      || normalized.includes('error')
    ) return 'weak';
    return fallback;
  };
  (ai.highlights ?? []).forEach((item, idx) => {
    if (typeof item.start_char !== 'number' || typeof item.end_char !== 'number') return;
    if (!Number.isInteger(item.start_char) || !Number.isInteger(item.end_char)) return;
    if (item.start_char < 0 || item.end_char <= item.start_char || item.end_char > text.length) return;
    const basePolarity = item.polarity === 'strong' ? 'strong' : 'weak';
    ranges.push({
      start: item.start_char,
      end: item.end_char,
      polarity: classifyPolarity(item.category, basePolarity),
      reason: item.category ?? `highlight-${idx + 1}`,
      sourceCategory: item.category,
      sourceExactText: item.exact_text?.trim() || undefined,
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

const hasConflictingAnchorOverlap = (ranges: TextAnchorRange[]): boolean => {
  if (ranges.length < 2) return false;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    const overlapStart = Math.max(prev.start, current.start);
    const overlapEnd = Math.min(prev.end, current.end);
    if (overlapEnd <= overlapStart) continue;
    const overlapSize = overlapEnd - overlapStart;
    const smallerRangeSize = Math.max(1, Math.min(prev.end - prev.start, current.end - current.start));
    const overlapRatio = overlapSize / smallerRangeSize;
    if (overlapRatio >= 0.4 && prev.polarity !== current.polarity) return true;
  }
  return false;
};

const buildFallbackHighlightRanges = (text: string, ai: WritingAiFeedbackAssist | null): TextAnchorRange[] => {
  if (!text || !ai) return [];
  const lowerText = text.toLowerCase();
  const ranges: TextAnchorRange[] = [];
  const claimedRanges: Array<{ start: number; end: number }> = [];
  const isOverlappingClaim = (start: number, end: number) =>
    claimedRanges.some((claimed) => start < claimed.end && end > claimed.start);
  const findBestUnclaimedOccurrence = (needle: string): { start: number; end: number } | null => {
    const search = needle.toLowerCase();
    if (!search) return null;
    let fromIndex = 0;
    while (fromIndex < lowerText.length) {
      const start = lowerText.indexOf(search, fromIndex);
      if (start < 0) return null;
      const end = start + search.length;
      if (!isOverlappingClaim(start, end)) return { start, end };
      fromIndex = start + 1;
    }
    return null;
  };
  const addSnippet = (
    snippet: string,
    polarity: 'strong' | 'weak',
    reason: string,
    sourceCategory?: string
  ) => {
    const clean = snippet.trim();
    if (!clean || clean.length < 6) return;
    const match = findBestUnclaimedOccurrence(clean);
    if (!match) return;
    claimedRanges.push(match);
    ranges.push({
      start: match.start,
      end: match.end,
      polarity,
      reason,
      sourceCategory,
      sourceExactText: clean,
    });
  };

  (ai.grammar_fixes ?? []).slice(0, 4).forEach((item) => addSnippet(item.original, 'weak', 'grammar_fix', 'grammar'));
  (ai.punctuation_fixes ?? []).slice(0, 4).forEach((item) => addSnippet(item.original, 'weak', 'punctuation_fix', 'punctuation'));
  [...(ai.what_is_working ?? []), ...(ai.strengths ?? [])]
    .slice(0, 4)
    .forEach((item) => {
      const quoted = extractQuotedSnippet(item) ?? '';
      addSnippet(quoted, 'strong', 'strength', 'strength');
    });

  if (!ranges.some((item) => item.polarity === 'strong')) {
    const firstSentenceEnd = text.indexOf('.') > 0 ? text.indexOf('.') + 1 : Math.min(text.length, 90);
    ranges.push({ start: 0, end: firstSentenceEnd, polarity: 'strong', reason: 'opening_strength', sourceCategory: 'strength' });
  }
  if (!ranges.some((item) => item.polarity === 'weak')) {
    const midpoint = Math.max(0, Math.floor(text.length * 0.4));
    const fallbackStart = text.lastIndexOf(' ', midpoint);
    const fallbackEndWord = text.indexOf(' ', Math.min(text.length - 1, midpoint + 40));
    const start = fallbackStart > 0 ? fallbackStart : Math.max(0, midpoint - 20);
    const end = fallbackEndWord > start ? fallbackEndWord : Math.min(text.length, start + 45);
    if (end - start >= 8) {
      ranges.push({ start, end, polarity: 'weak', reason: 'revision_focus', sourceCategory: 'fallback' });
    }
  }
  return ranges;
};

interface ReviewHighlightSpanProps {
  index: number;
  range: TextAnchorRange;
  segment: string;
  isActive: boolean;
  onMount?: (index: number, element: HTMLSpanElement | null) => void;
}

const ReviewHighlightSpan: React.FC<ReviewHighlightSpanProps> = ({ index, range, segment, isActive, onMount }) => {
  const strong = range.polarity === 'strong';

  const highlightStyle = {
    background: isActive
      ? (strong ? 'rgba(74, 222, 128, 0.35)' : 'rgba(248, 113, 113, 0.34)')
      : (strong ? 'rgba(74, 222, 128, 0.18)' : 'rgba(248, 113, 113, 0.16)'),
    borderBottom: isActive
      ? (strong ? '2px solid rgba(74, 222, 128, 0.9)' : '2px solid rgba(248, 113, 113, 0.9)')
      : (strong ? '2px solid rgba(74, 222, 128, 0.45)' : '2px solid rgba(248, 113, 113, 0.42)'),
    color: isActive
      ? (strong ? 'var(--hub-highlight-strong-active, #d9f99d)' : 'var(--hub-highlight-weak-active, #fecaca)')
      : (strong ? 'var(--hub-highlight-strong-idle, rgba(187,247,208,0.9))' : 'var(--hub-highlight-weak-idle, rgba(254,202,202,0.9))'),
    boxShadow: isActive ? (strong ? '0 0 0 1px rgba(74, 222, 128, 0.5)' : '0 0 0 1px rgba(248, 113, 113, 0.5)') : 'none',
    textShadow: 'none',
    borderRadius: 4,
    padding: '0 2px',
    transition: 'color 180ms ease, background 180ms ease, box-shadow 180ms ease',
  };

  return (
    <span
      ref={(element: HTMLSpanElement | null) => onMount?.(index, element)}
      data-review-highlight-index={index}
      className={`review-highlight ${strong ? 'review-highlight--strong' : 'review-highlight--weak'} ${isActive ? 'review-highlight--active' : 'review-highlight--inactive'}`}
      title={range.reason}
      style={highlightStyle}
    >
      <span className="review-highlight__ink-base" aria-hidden="true" />
      <span className="review-highlight__text">{segment}</span>
    </span>
  );
};

const renderAnnotatedText = (
  text: string,
  ranges: TextAnchorRange[],
  activeIndex: number | null = null,
  onHighlightMount?: (index: number, element: HTMLSpanElement | null) => void
): React.ReactNode => {
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
    nodes.push(
      <ReviewHighlightSpan
        index={idx}
        range={range}
        segment={segment}
        isActive={idx === activeIndex}
        onMount={onHighlightMount}
      />
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

type VisualLineRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const getVisualLineRectsForHighlight = (
  scrollContainer: HTMLElement | null,
  highlightElement: HTMLElement | null
): VisualLineRect[] => {
  if (!scrollContainer || !highlightElement) return [];
  const textElement = highlightElement.querySelector('.review-highlight__text');
  if (!textElement) return [];
  const textNode = textElement.firstChild;
  if (!textNode) return [];

  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, textNode.textContent?.length ?? 0);
  const clientRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0.5 && rect.height > 0.5);
  range.detach?.();
  if (clientRects.length === 0) return [];

  const containerRect = scrollContainer.getBoundingClientRect();
  const grouped: Array<{ top: number; bottom: number; left: number; right: number; height: number }> = [];
  const LINE_MERGE_THRESHOLD = 3;
  const MIN_RECT_WIDTH = 7;
  const MIN_RECT_AREA = 90;

  clientRects
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .forEach((rect) => {
      const top = rect.top - containerRect.top + scrollContainer.scrollTop;
      const left = rect.left - containerRect.left + scrollContainer.scrollLeft;
      const right = left + rect.width;
      const bottom = top + rect.height;
      const existing = grouped.find((line) => Math.abs(line.top - top) <= LINE_MERGE_THRESHOLD);
      if (existing) {
        existing.left = Math.min(existing.left, left);
        existing.right = Math.max(existing.right, right);
        existing.top = Math.min(existing.top, top);
        existing.bottom = Math.max(existing.bottom, bottom);
        existing.height = Math.max(existing.height, rect.height);
        return;
      }
      grouped.push({ top, bottom, left, right, height: rect.height });
    });

  return grouped
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .map((line) => {
      const width = Math.max(1, line.right - line.left);
      const height = Math.max(1, line.height);
      return {
        top: line.top,
        left: line.left,
        width,
        height,
      };
    })
    .filter((line) => line.width >= MIN_RECT_WIDTH && line.width * line.height >= MIN_RECT_AREA);
};

const scrollLineIntoComfortZone = (scrollContainer: HTMLElement | null, line: VisualLineRect | null) => {
  if (!scrollContainer || !line) return;
  const viewHeight = scrollContainer.clientHeight;
  const scrollTop = scrollContainer.scrollTop;
  const comfortTop = scrollTop + viewHeight * 0.2;
  const comfortBottom = scrollTop + viewHeight * 0.78;
  const lineTop = line.top;
  const lineBottom = line.top + line.height;
  let nextTop: number | null = null;

  if (lineTop < comfortTop) {
    nextTop = lineTop - viewHeight * 0.28;
  } else if (lineBottom > comfortBottom) {
    nextTop = lineBottom - viewHeight * 0.72;
  }

  if (nextTop == null) return;
  const clamped = Math.max(0, Math.min(nextTop, scrollContainer.scrollHeight - viewHeight));
  scrollContainer.scrollTo({ top: clamped, behavior: 'smooth' });
};

const describeHighlight = (
  range: TextAnchorRange | null | undefined,
  text: string,
  ai: WritingAiFeedbackAssist | null
): { label: string; detail: string; correction?: string } => {
  if (!range) return { label: 'AI feedback', detail: 'Select a highlight to view detailed guidance.' };
  const snippet = text.slice(range.start, range.end).trim();
  if (!ai) {
    return {
      label: range.polarity === 'strong' ? 'Strong writing choice' : 'Needs correction',
      detail: snippet || 'Highlighted text from your submission.',
    };
  }

  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  const toTeacherDetail = (kind: 'grammar' | 'punctuation' | 'phrase', issue: string, original?: string, betterVersion?: string): string => {
    const simpleIssue = simplifyStudentLanguage(issue || '').trim();
    const quotedOriginal = original?.trim() ? `"${original.trim()}"` : '';
    if (kind === 'grammar') {
      if (quotedOriginal && betterVersion?.trim()) return `You wrote ${quotedOriginal} — ${simpleIssue || 'this needs a grammar fix'}. Better: "${betterVersion.trim()}".`;
      if (quotedOriginal && simpleIssue) return `You wrote ${quotedOriginal} — ${simpleIssue}.`;
      if (simpleIssue) return simpleIssue;
      return 'Check the grammar in this sentence — look at word form, subject-verb agreement, or sentence structure.';
    }
    if (kind === 'punctuation') {
      if (quotedOriginal && betterVersion?.trim()) return `You wrote ${quotedOriginal} — ${simpleIssue || 'punctuation needs fixing'}. Better: "${betterVersion.trim()}".`;
      if (quotedOriginal && simpleIssue) return `You wrote ${quotedOriginal} — ${simpleIssue}.`;
      if (simpleIssue) return simpleIssue;
      return 'Check punctuation here — look at capitals, full stops, or commas.';
    }
    if (quotedOriginal && betterVersion?.trim()) return `You wrote ${quotedOriginal} — ${simpleIssue || 'this can sound more natural'}. Try: "${betterVersion.trim()}".`;
    if (quotedOriginal && simpleIssue) return `You wrote ${quotedOriginal} — ${simpleIssue}.`;
    if (simpleIssue) return simpleIssue;
    return 'This phrasing can sound more natural — try rephrasing for clarity.';
  };
  const normalizedSnippet = normalize(snippet);
  const isOriginalMatch = (value: string) => {
    const normalized = normalize(value);
    if (!normalized || !normalizedSnippet) return false;
    if (normalizedSnippet === normalized) return true;
    if (normalizedSnippet.includes(normalized) || normalized.includes(normalizedSnippet)) return true;
    if (!snippet && range.sourceExactText) {
      const normalizedSource = normalize(range.sourceExactText);
      return normalizedSource === normalized;
    }
    return false;
  };
  const isCorrectedMatch = (value: string) => {
    const normalized = normalize(value);
    return normalizedSnippet === normalized;
  };

  const normalizedCategory = (range.sourceCategory ?? range.reason ?? '').toLowerCase();
  const prefersGrammar = normalizedCategory.includes('grammar');
  const prefersPunctuation = normalizedCategory.includes('punct');
  const prefersPhrase = normalizedCategory.includes('phrase') || normalizedCategory.includes('style');
  const prefersStrength = normalizedCategory.includes('strong') || normalizedCategory.includes('strength') || range.polarity === 'strong';
  const lowerText = text.toLowerCase();
  const scoreOriginalMatch = (value: string): number => {
    const normalized = normalize(value);
    if (!normalized || !normalizedSnippet) return 0;
    if (normalizedSnippet === normalized) return 100;
    if (normalizedSnippet.includes(normalized)) return Math.min(95, 50 + normalized.length);
    if (normalized.includes(normalizedSnippet)) return Math.min(90, 40 + normalizedSnippet.length);
    const rawNeedle = value.trim().toLowerCase();
    if (rawNeedle && lowerText.includes(rawNeedle)) {
      const occurrenceStart = lowerText.indexOf(rawNeedle);
      const distance = Math.abs(occurrenceStart - range.start);
      return Math.max(15, 82 - Math.min(distance, 67));
    }
    return 0;
  };
  const pickBestByOriginal = <T extends { original: string }>(items: T[]): T | null => {
    let best: T | null = null;
    let bestScore = 0;
    items.forEach((item) => {
      const score = scoreOriginalMatch(item.original);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    });
    return best;
  };

  const grammar = pickBestByOriginal(ai.grammar_fixes ?? []);
  const punctuation = pickBestByOriginal(ai.punctuation_fixes ?? []);
  const phrase = pickBestByOriginal(ai.natural_phrase_upgrades ?? []);

  if (prefersPunctuation && punctuation) {
    return { label: 'Punctuation fix', detail: toTeacherDetail('punctuation', punctuation.issue), correction: punctuation.better_version };
  }
  if (prefersGrammar && grammar) {
    return { label: 'Grammar fix', detail: toTeacherDetail('grammar', grammar.issue), correction: grammar.better_version };
  }
  if (prefersPhrase && phrase) {
    return { label: 'Phrase upgrade', detail: toTeacherDetail('phrase', phrase.why_it_helps), correction: phrase.better_version };
  }
  const strength = [...(ai.what_is_working ?? []), ...(ai.strengths ?? [])].find((item) => {
    const quoted = extractQuotedSnippet(item) ?? '';
    const normalizedQuoted = normalize(quoted);
    if (normalizedQuoted && normalizedQuoted === normalizedSnippet) return true;
    return normalize(item).includes(normalizedSnippet) && normalizedSnippet.length > 10;
  });
  if (prefersStrength && strength) return { label: 'Why this is strong', detail: simplifyStudentLanguage(strength) };
if (!prefersStrength && grammar) return { label: 'Grammar fix', detail: toTeacherDetail('grammar', grammar.issue, grammar.original, grammar.better_version), correction: grammar.better_version };
    if (!prefersStrength && punctuation) return { label: 'Punctuation fix', detail: toTeacherDetail('punctuation', punctuation.issue, punctuation.original, punctuation.better_version), correction: punctuation.better_version };
    if (!prefersStrength && phrase) return { label: 'Phrase upgrade', detail: toTeacherDetail('phrase', phrase.why_it_helps, phrase.original, phrase.better_version), correction: phrase.better_version };

  if (isOriginalMatch(range.sourceExactText ?? '')) {
    if (prefersGrammar) {
      return {
        label: 'Grammar fix',
        detail: `This sentence has a grammar mistake. Check this exact part: "${snippet || range.sourceExactText || 'selected text'}".`,
      };
    }
    if (prefersPunctuation) {
      return {
        label: 'Punctuation fix',
        detail: `This sentence has a punctuation mistake. Check this exact part: "${snippet || range.sourceExactText || 'selected text'}".`,
      };
    }
  }

  const correctedGrammar = (ai.grammar_fixes ?? []).find((item) => isCorrectedMatch(item.better_version));
  if (correctedGrammar) {
    return {
      label: 'Grammar correction applied',
      detail: `This highlight is already showing the improved sentence. Original wording: "${correctedGrammar.original}"`,
      correction: correctedGrammar.better_version,
    };
  }
  const correctedPunctuation = (ai.punctuation_fixes ?? []).find((item) => isCorrectedMatch(item.better_version));
  if (correctedPunctuation) {
    return {
      label: 'Punctuation correction applied',
      detail: `This highlight already reflects the corrected punctuation. Original wording: "${correctedPunctuation.original}"`,
      correction: correctedPunctuation.better_version,
    };
  }
  const correctedPhrase = (ai.natural_phrase_upgrades ?? []).find((item) => isCorrectedMatch(item.better_version));
  if (correctedPhrase) {
    return {
      label: 'Phrase upgrade applied',
      detail: `This highlight is showing the improved phrase. Original wording: "${correctedPhrase.original}"`,
      correction: correctedPhrase.better_version,
    };
  }
  if (strength) return { label: 'Why this is strong', detail: simplifyStudentLanguage(strength) };

  if (prefersGrammar) {
    return {
      label: 'Grammar fix',
      detail: `Check grammar in this exact snippet: "${snippet || 'selected text'}".`,
    };
  }
  if (prefersPunctuation) {
    return {
      label: 'Punctuation fix',
      detail: `Check punctuation in this exact snippet: "${snippet || 'selected text'}".`,
    };
  }
  if (prefersPhrase) {
    return {
      label: 'Phrase upgrade',
      detail: `Refine wording in this exact snippet: "${snippet || 'selected text'}".`,
    };
  }
  if (prefersStrength) {
    return {
      label: 'Strong writing choice',
      detail: `Keep this exact snippet as a strength: "${snippet || 'selected text'}".`,
    };
  }

  return {
    label: range.polarity === 'strong' ? 'Strong writing choice' : 'Needs correction',
    detail: `Selected snippet: "${snippet || 'highlighted text'}".`,
  };
};

const normalizeComparisonText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

const normalizeForComparison = (text: string): string => text
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;:!?])/g, '$1')
  .replace(/([,.;:!?])(?=\S)/g, '$1 ')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const stripOuterPunctuation = (text: string): string => text.replace(/^[\s"'“”‘’.,;:!?()[\]{}-]+|[\s"'“”‘’.,;:!?()[\]{}-]+$/g, '');

const isMeaningfullyDifferent = (a: string, b: string): boolean => {
  const normalizedA = stripOuterPunctuation(normalizeForComparison(a));
  const normalizedB = stripOuterPunctuation(normalizeForComparison(b));
  if (!normalizedA && !normalizedB) return false;
  return normalizedA !== normalizedB;
};

type GuidedIssueKind = 'grammar' | 'punctuation' | 'phrase' | 'strength' | 'support' | 'clarity';

type GuidedReviewIssue = {
  id: string;
  kind: GuidedIssueKind;
  label: string;
  originalSentence: string;
  diagnosis: string;
  improvedSentence: string | null;
  whyThisIsStronger: string;
  coachingNote: string | null;
  evidenceSpan: string;
};

const bannedFeedbackPatterns = [
  /^this sentence has a grammar mistake\.?$/i,
  /^this sentence needs a small grammar fix\.?$/i,
  /^this is better\.?$/i,
  /^this is unclear\.?$/i,
];

const containsMeaningfulTokenOverlap = (source: string, target: string): boolean => {
  const sourceTokens = new Set(
    normalizeForComparison(source)
      .split(' ')
      .map((token) => token.replace(/[^a-z0-9]/gi, '').trim())
      .filter((token) => token.length >= 4)
  );
  if (sourceTokens.size === 0) return true;
  const targetTokens = normalizeForComparison(target)
    .split(' ')
    .map((token) => token.replace(/[^a-z0-9]/gi, '').trim())
    .filter((token) => token.length >= 4);
  return targetTokens.some((token) => sourceTokens.has(token));
};

const validateIssueConsistency = (issue: GuidedReviewIssue): { valid: boolean; reason?: string } => {
  if (!issue.originalSentence.trim()) return { valid: false, reason: 'missing_original_sentence' };
  const consistencyFields = [issue.diagnosis, issue.whyThisIsStronger, issue.coachingNote ?? ''].join(' ').trim();
  if (!consistencyFields) return { valid: false, reason: 'missing_explanation_fields' };
  if (!containsMeaningfulTokenOverlap(issue.originalSentence, consistencyFields)) {
    return { valid: false, reason: 'explanation_not_grounded_in_sentence' };
  }
  if (issue.improvedSentence && !isMeaningfullyDifferent(issue.originalSentence, issue.improvedSentence)) {
    return { valid: false, reason: 'non_meaningful_rewrite' };
  }
  return { valid: true };
};

const remapIssueType = (issue: GuidedReviewIssue): GuidedReviewIssue => {
  if (issue.kind === 'grammar') {
    if (!issue.improvedSentence || !isMeaningfullyDifferent(issue.originalSentence, issue.improvedSentence)) {
      return {
        ...issue,
        kind: 'clarity',
        label: 'Clearer phrasing',
        improvedSentence: null,
        whyThisIsStronger: 'No grammar rewrite is needed here. Focus on making the idea clearer or more specific.',
      };
    }
  }
  return issue;
};

const getSafeIssueExplanation = (issue: GuidedReviewIssue): GuidedReviewIssue => {
  const diagnosis = issue.diagnosis.trim();
  const hasBannedCopy = bannedFeedbackPatterns.some((pattern) => pattern.test(diagnosis));
  if (!hasBannedCopy) return issue;
  const fallbackDiagnosis = issue.kind === 'grammar'
    ? `Adjust this sentence for grammar accuracy: "${issue.originalSentence}".`
    : issue.kind === 'support'
      ? `Develop this idea with one specific reason or example: "${issue.originalSentence}".`
      : `Clarify what you mean in this sentence: "${issue.originalSentence}".`;
  return {
    ...issue,
    diagnosis: fallbackDiagnosis,
  };
};

const pickLessonFixForRange = (
  range: TextAnchorRange | null,
  snippet: string,
  ai: WritingAiFeedbackAssist | null
): { kind: 'grammar' | 'punctuation' | 'phrase'; original: string; betterVersion: string; why: string } | null => {
  if (!range || !ai) return null;
  const needle = normalizeComparisonText(snippet || range.sourceExactText || '');
  if (!needle) return null;
  const sourceHint = normalizeComparisonText(range.sourceCategory ?? range.reason ?? '');
  const preferGrammar = sourceHint.includes('grammar');
  const preferPunctuation = sourceHint.includes('punct');
  const preferPhrase = sourceHint.includes('phrase') || sourceHint.includes('style');

  const score = (original: string) => {
    const normalized = normalizeComparisonText(original);
    if (!normalized) return 0;
    if (normalized === needle) return 100;
    if (needle.includes(normalized)) return Math.min(95, 45 + normalized.length);
    if (normalized.includes(needle)) return Math.min(88, 40 + needle.length);
    return 0;
  };

  const grammar = (ai.grammar_fixes ?? []).map((item) => ({ ...item, kind: 'grammar' as const, why: item.issue }));
  const punctuation = (ai.punctuation_fixes ?? []).map((item) => ({ ...item, kind: 'punctuation' as const, why: item.issue }));
  const phrase = (ai.natural_phrase_upgrades ?? []).map((item) => ({ ...item, kind: 'phrase' as const, better_version: item.better_version, why: item.why_it_helps }));
  const candidates = [...grammar, ...punctuation, ...phrase]
    .map((item) => ({ item, points: score(item.original) }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points);
  const best = candidates[0]?.item;
  if (!best) return null;
  if (preferGrammar && best.kind !== 'grammar') {
    const fallback = grammar.find((entry) => score(entry.original) > 0);
    if (fallback) return { kind: 'grammar', original: fallback.original, betterVersion: fallback.better_version, why: fallback.why };
  }
  if (preferPunctuation && best.kind !== 'punctuation') {
    const fallback = punctuation.find((entry) => score(entry.original) > 0);
    if (fallback) return { kind: 'punctuation', original: fallback.original, betterVersion: fallback.better_version, why: fallback.why };
  }
  if (preferPhrase && best.kind !== 'phrase') {
    const fallback = phrase.find((entry) => score(entry.original) > 0);
    if (fallback) return { kind: 'phrase', original: fallback.original, betterVersion: fallback.better_version, why: fallback.why };
  }
  return { kind: best.kind, original: best.original, betterVersion: best.better_version, why: best.why };
};

const renderPhraseComparison = (
  text: string,
  phrase: string | null,
  tone: 'warning' | 'success'
): React.ReactNode => {
  const snippet = text || '';
  const target = phrase?.trim() ?? '';
  if (!snippet) return 'No snippet available.';
  if (!target) return snippet;
  const source = snippet.toLowerCase();
  const idx = source.indexOf(target.toLowerCase());
  const toneStyle = tone === 'warning'
    ? {
        color: '#fca5a5',
        background: 'linear-gradient(135deg, rgba(248,113,113,0.2), rgba(251,113,133,0.18))',
        border: '1px solid rgba(248,113,113,0.38)',
        boxShadow: '0 0 0 1px rgba(248,113,113,0.12) inset',
      }
    : {
        color: '#86efac',
        background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(45,212,191,0.16))',
        border: '1px solid rgba(74,222,128,0.38)',
        boxShadow: '0 0 0 1px rgba(74,222,128,0.14) inset',
      };
  if (idx < 0) {
    return (
      <>
        {snippet}
        <span style={{ ...toneStyle, borderRadius: 8, padding: '1px 6px', fontWeight: 700, marginLeft: 8 }}>{target}</span>
      </>
    );
  }
  const before = snippet.slice(0, idx);
  const match = snippet.slice(idx, idx + target.length);
  const after = snippet.slice(idx + target.length);
  return (
    <>
      {before}
      <span style={{ ...toneStyle, borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>{match}</span>
      {after}
    </>
  );
};

const buildRubricReason = (
  key: string,
  score: number,
  weaknessTags: string[],
  ai: WritingAiFeedbackAssist | null
): string | null => {
  const tags = weaknessTags.map((t) => t.toLowerCase());
  const strengths = [...(ai?.what_is_working ?? []), ...(ai?.strengths ?? [])];
  const issues = [...(ai?.what_is_missing ?? []), ...(ai?.weaknesses ?? [])];

  if (key === 'content') {
    if (score >= 4) return strengths.find((s) => /point|detail|idea|argument|reason/i.test(s)) ? simplifyStudentLanguage(strengths.find((s) => /point|detail|idea|argument|reason/i.test(s))!) : 'Strong coverage of the task with clear ideas and supporting detail.';
    if (score >= 3) return 'Most task points addressed, but some ideas need more supporting detail.';
    if (tags.includes('missing_content_point') || tags.includes('partial_content_coverage')) return 'Key parts of the question were not answered or not developed with reasons.';
    if (score >= 2) return 'Some relevant ideas, but important task points are missing or undeveloped.';
    return 'The response does not cover enough of what the task asks for.';
  }
  if (key === 'organisation') {
    if (score >= 4) return 'Ideas flow logically with clear connections between sentences.';
    if (score >= 3) return 'Generally organized, but some transitions between ideas are missing.';
    if (tags.includes('weak_organisation') || tags.includes('no_paragraph_structure')) return 'Ideas are not grouped or connected in a clear order.';
    if (score >= 2) return 'Some structure, but the argument or narrative jumps between points.';
    return 'No clear structure — ideas feel randomly ordered.';
  }
  if (key === 'language') {
    const grammarCount = (ai?.grammar_fixes ?? []).length + (ai?.punctuation_fixes ?? []).length;
    if (score >= 4) return 'Good range of vocabulary and mostly accurate grammar.';
    if (score >= 3) return grammarCount > 0 ? `Meaning is clear, but ${grammarCount} language issue${grammarCount > 1 ? 's' : ''} reduce${grammarCount === 1 ? 's' : ''} accuracy.` : 'Meaning is mostly clear, with some grammar or vocabulary issues.';
    if (score >= 2) return grammarCount > 2 ? `Several grammar mistakes (${grammarCount} found) make some sentences hard to follow.` : 'Grammar errors reduce clarity in places.';
    return 'Frequent language errors make the meaning difficult to understand.';
  }
  if (key === 'communicative_achievement') {
    if (score >= 4) return 'Tone, register, and format match the task well.';
    if (score >= 3) return 'Mostly appropriate tone, but some sections feel too informal or too formal.';
    if (tags.includes('wrong_register') || tags.includes('tone_mismatch')) return 'The tone or style does not match what the task requires.';
    if (score >= 2) return 'The writing communicates meaning, but the tone needs adjustment for this genre.';
    return 'The style and tone do not match the expected format.';
  }
  return null;
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

const keepHorizontalItemInView = (
  container: HTMLElement | null,
  item: HTMLElement | null,
  behavior: ScrollBehavior = 'smooth'
) => {
  if (!container || !item) return;
  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const leftOverflow = itemRect.left < containerRect.left;
  const rightOverflow = itemRect.right > containerRect.right;
  if (!leftOverflow && !rightOverflow) return;

  const targetLeft = item.offsetLeft - Math.max(0, (container.clientWidth - item.clientWidth) / 2);
  container.scrollTo({
    left: Math.max(0, targetLeft),
    behavior,
  });
};

const getMissionRecommendationKey = (item: WritingMissionRecommendation) =>
  `${item.missionCategory}-${item.title}`;

const WritingHubLegacy: React.FC<WritingHubProps> = ({ studentId, studentName, grade, genre, month = new Date().toISOString().slice(0, 7), onOpenQuestMission }) => {
  const [themeMode, setThemeMode] = useState<WritingHubThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    const saved = window.localStorage.getItem('writing-hub-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
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
  const [showTaskTypeGuide, setShowTaskTypeGuide] = useState(false);
  const [showTaskContextModal, setShowTaskContextModal] = useState(false);
  const [showAiReviewModal, setShowAiReviewModal] = useState(false);
  const [aiReviewViewMode, setAiReviewViewMode] = useState<'full' | 'cinematic'>('full');
  const [showProgressDetailsModal, setShowProgressDetailsModal] = useState(false);
  const [submittedPracticeText, setSubmittedPracticeText] = useState('');
  const [reviewScanComplete, setReviewScanComplete] = useState(false);
  const [reviewActiveIndex, setReviewActiveIndex] = useState<number | null>(null);
  const [activeLineMeasure, setActiveLineMeasure] = useState<{ index: number | null; rects: VisualLineRect[] }>({
    index: null,
    rects: [],
  });
  const [activeRepairId, setActiveRepairId] = useState<string | null>(null);
  const [repairStatusMessage, setRepairStatusMessage] = useState<string>('');
  const [viewedRepairIds, setViewedRepairIds] = useState<string[]>([]);
  const closeModalButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeProgressDetailsButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstRepairButtonRef = useRef<HTMLButtonElement | null>(null);
  const practiceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackCardRef = useRef<HTMLElement | null>(null);
  const todayMissionCardRef = useRef<HTMLElement | null>(null);
  const progressCardRef = useRef<HTMLElement | null>(null);
  const preWeekComposeCardRef = useRef<HTMLElement | null>(null);
  const preWeekResponseRef = useRef<HTMLTextAreaElement | null>(null);
  const writingPathCarouselRef = useRef<HTMLDivElement | null>(null);
  const reviewEssayPanelRef = useRef<HTMLDivElement | null>(null);
  const writingHubRootRef = useRef<HTMLDivElement | null>(null);
  const highlightSpanRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const activeLineOverlayRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const reviewAutoplaySessionRef = useRef<string | null>(null);
  const reviewAnimationStepRef = useRef<number | null>(null);
  const reviewAnimationForIndexRef = useRef<number | null>(null);
  const aiPlanAssistRequestIdRef = useRef<number | null>(0);
  const writingPathButtonRefs: MutableRefObject<Partial<Record<SupportedGenre, HTMLButtonElement | null>> | null> =
    useRef<Partial<Record<SupportedGenre, HTMLButtonElement | null>>>({});
  const missionsCarouselRef = useRef<HTMLDivElement | null>(null);
  const missionCardRefs: MutableRefObject<Record<string, HTMLDivElement | null> | null> =
    useRef<Record<string, HTMLDivElement | null>>({});
  const [questMissions, setQuestMissions] = useState<QuestMissionRow[]>([]);
  const [selectedMissionKey, setSelectedMissionKey] = useState<string | null>(null);
  const [nonCriticalReady, setNonCriticalReady] = useState(false);
  const initialResponseWordCount = countWords(initialResponse);
  const practiceResponseWordCount = countWords(practiceResponse);
  const initializing = hydrationStatus === 'idle' || hydrationStatus === 'loading';
  const pageStyle = useMemo(() => getPageStyle(themeMode), [themeMode]);
  const shellCardStyle = useMemo(() => getShellCardStyle(themeMode), [themeMode]);
  const missionCardStyle = useMemo(() => getMissionCardStyle(themeMode), [themeMode]);
  const modalThemeVars = useMemo<ThemeVarStyle>(() => {
    if (themeMode === 'light') {
      return {
        '--hub-bg': '#eef4ff',
        '--hub-text': '#0f172a',
        '--hub-text-strong': '#0b1220',
        '--hub-text-soft': '#1e3a5f',
        '--hub-text-muted': '#334155',
        '--hub-text-accent': '#1d4ed8',
        '--hub-text-accent-2': '#2563eb',
        '--hub-subtext': '#475569',
        '--hub-panel': 'rgba(255, 255, 255, 0.96)',
        '--hub-overlay-soft': 'rgba(248, 250, 255, 0.96)',
        '--hub-overlay-strong': 'rgba(255, 255, 255, 0.98)',
        '--hub-muted-surface': 'rgba(237, 245, 255, 0.94)',
        '--hub-muted-surface-soft': 'rgba(223, 235, 252, 0.82)',
        '--hub-accent-surface': 'rgba(191, 219, 254, 0.62)',
        '--hub-border': 'rgba(148, 163, 184, 0.46)',
        '--hub-border-strong': 'rgba(59, 130, 246, 0.42)',
        '--hub-shadow-card': '0 12px 24px rgba(15, 23, 42, 0.1)',
        '--hub-hud-bg': 'rgba(255, 255, 255, 0.92)',
        '--hub-hud-border': 'rgba(59, 130, 246, 0.3)',
        '--hub-glass-blur': 'blur(8px)',
        '--hub-modal-overlay': 'color-mix(in srgb, #eff6ff 84%, #94a3b8 16%)',
        '--hub-feedback-weak': '#dc2626',
        '--hub-next-border': 'rgba(16, 185, 129, 0.36)',
        '--hub-next-bg': 'rgba(220, 252, 231, 0.86)',
        '--hub-next-heading': '#065f46',
        '--hub-next-text': '#14532d',
        '--hub-nav-button-bg': 'rgba(255, 255, 255, 0.94)',
        '--hub-nav-button-border': 'rgba(59,130,246,0.38)',
        '--hub-cta-border': 'rgba(16,185,129,0.42)',
        '--hub-cta-bg': 'linear-gradient(135deg, rgba(59,130,246,0.22), rgba(16,185,129,0.2))',
        '--hub-cta-text': '#065f46',
        '--hub-marker-strong': 'rgba(22, 163, 74, 0.36)',
        '--hub-marker-weak': 'rgba(185, 28, 28, 0.34)',
        '--hub-highlight-strong-active': '#166534',
        '--hub-highlight-strong-idle': '#14532d',
        '--hub-highlight-weak-active': '#991b1b',
        '--hub-highlight-weak-idle': '#7f1d1d',
        '--marker-strong-base': 'rgba(22, 163, 74, 0.32)',
        '--marker-strong-mid': 'rgba(22, 163, 74, 0.46)',
        '--marker-weak-base': 'rgba(185, 28, 28, 0.3)',
        '--marker-weak-mid': 'rgba(185, 28, 28, 0.42)',
      } as ThemeVarStyle;
    }
    return {
      '--hub-bg': '#020617',
      '--hub-text': '#dbe7ff',
      '--hub-text-strong': '#f8fbff',
      '--hub-text-soft': '#c5dcff',
      '--hub-text-muted': '#cbd5e1',
      '--hub-text-accent': '#bfdbfe',
      '--hub-text-accent-2': '#93c5fd',
      '--hub-subtext': '#94a3b8',
      '--hub-panel': 'rgba(10, 17, 32, 0.92)',
      '--hub-overlay-soft': 'rgba(18, 30, 52, 0.92)',
      '--hub-overlay-strong': 'rgba(10, 17, 32, 0.95)',
      '--hub-muted-surface': 'rgba(13, 27, 50, 0.86)',
      '--hub-muted-surface-soft': 'rgba(30, 48, 79, 0.62)',
      '--hub-accent-surface': 'rgba(34, 75, 198, 0.36)',
      '--hub-border': 'rgba(148, 163, 184, 0.32)',
      '--hub-border-strong': 'rgba(125, 211, 252, 0.5)',
      '--hub-shadow-card': '0 16px 36px rgba(2, 6, 23, 0.5)',
      '--hub-hud-bg': 'rgba(8, 15, 30, 0.92)',
      '--hub-hud-border': 'rgba(125, 211, 252, 0.35)',
      '--hub-glass-blur': 'blur(6px)',
      '--hub-modal-overlay': 'color-mix(in srgb, #020617 72%, #000 28%)',
      '--hub-feedback-weak': '#ef4444',
      '--hub-next-border': 'rgba(16,185,129,0.35)',
      '--hub-next-bg': 'rgba(6, 78, 59, 0.2)',
      '--hub-next-heading': '#d1fae5',
      '--hub-next-text': '#ecfdf5',
      '--hub-nav-button-bg': 'rgba(15,23,42,0.82)',
      '--hub-nav-button-border': 'rgba(148,163,184,0.45)',
      '--hub-cta-border': 'rgba(110,231,183,0.55)',
      '--hub-cta-bg': 'linear-gradient(135deg, rgba(5,150,105,0.5), rgba(14,116,144,0.45))',
      '--hub-cta-text': '#ecfdf5',
      '--hub-marker-strong': 'rgba(34,197,94,0.38)',
      '--hub-marker-weak': 'rgba(220,38,38,0.36)',
      '--hub-highlight-strong-active': '#4ade80',
      '--hub-highlight-strong-idle': 'rgba(34,197,94,0.9)',
      '--hub-highlight-weak-active': '#f87171',
      '--hub-highlight-weak-idle': 'rgba(239,68,68,0.9)',
      '--marker-strong-base': 'rgba(34, 197, 94, 0.34)',
      '--marker-strong-mid': 'rgba(34, 197, 94, 0.5)',
      '--marker-weak-base': 'rgba(220, 38, 38, 0.32)',
      '--marker-weak-mid': 'rgba(220, 38, 38, 0.48)',
    } as ThemeVarStyle;
  }, [themeMode]);
  const headingColor = 'var(--hub-text-strong)';
  const headingSubtle = 'var(--hub-text-soft)';
  const supportPanelStyle = useMemo(() => (
    themeMode === 'light'
      ? {
          ...shellCardStyle,
          borderColor: 'rgba(147, 51, 234, 0.28)',
          background: 'linear-gradient(175deg, #ffffff 0%, #f6f0ff 58%, #edf4ff 100%)',
        }
      : {
          ...shellCardStyle,
          borderColor: 'rgba(168, 85, 247, 0.42)',
          background: 'linear-gradient(175deg, #0f172a 0%, #171432 58%, #0b1224 100%)',
        }
  ), [themeMode, shellCardStyle]);

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
  const scrollToSection = <T extends HTMLElement>(ref: MutableRefObject<T | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
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
  const shouldUseFallbackRanges = useMemo(
    () => reviewAnchorTrust.mode !== 'trusted' || hasConflictingAnchorOverlap(submittedHighlightRanges),
    [reviewAnchorTrust.mode, submittedHighlightRanges]
  );
  const reviewScanPlan = useMemo(
    () => buildBalancedReviewSequence(shouldUseFallbackRanges ? fallbackHighlightRanges : submittedHighlightRanges, 8),
    [shouldUseFallbackRanges, submittedHighlightRanges, fallbackHighlightRanges]
  );
  const reviewAnimationTimelineMs = useMemo(
    () => reviewScanPlan.reduce((total, range) => {
      const segment = submittedPracticeText.slice(range.start, range.end);
      return total + getHighlightAnimationDurationMs(segment.length) + 36;
    }, 0),
    [reviewScanPlan, submittedPracticeText]
  );
  const visibleSubmittedHighlightRanges = useMemo(
    () => reviewScanPlan,
    [reviewScanPlan]
  );
  const reviewSessionKey = useMemo(
    () =>
      `${submittedPracticeText.length}:${visibleSubmittedHighlightRanges
        .map((range) => `${range.start}-${range.end}-${range.reason ?? ''}-${range.sourceCategory ?? ''}`)
        .join('|')}`,
    [submittedPracticeText, visibleSubmittedHighlightRanges]
  );
  const activeReviewRange = useMemo(
    () => (reviewActiveIndex != null ? visibleSubmittedHighlightRanges[reviewActiveIndex] ?? null : null),
    [visibleSubmittedHighlightRanges, reviewActiveIndex]
  );
  const activeReviewNote = useMemo(
    () => describeHighlight(activeReviewRange, submittedPracticeText, aiFeedbackDetails),
    [activeReviewRange, submittedPracticeText, aiFeedbackDetails]
  );
  const fullFeedbackStrengths = useMemo(
    () => (aiFeedbackDetails?.what_is_working ?? aiFeedbackDetails?.strengths ?? []).filter((item) => Boolean(item?.trim())),
    [aiFeedbackDetails]
  );
  const fullFeedbackImprovements = useMemo(
    () => (aiFeedbackDetails?.what_is_missing ?? aiFeedbackDetails?.weaknesses ?? []).filter((item) => Boolean(item?.trim())),
    [aiFeedbackDetails]
  );
  const fullFeedbackGrammarFixes = useMemo(
    () => [
      ...(aiFeedbackDetails?.grammar_fixes ?? []).map((item) => ({ ...item, category: 'Grammar' as const })),
      ...(aiFeedbackDetails?.punctuation_fixes ?? []).map((item) => ({ ...item, category: 'Punctuation' as const })),
    ].filter((item) => item.original?.trim() && item.better_version?.trim()),
    [aiFeedbackDetails]
  );
  const fullFeedbackPhraseUpgrades = useMemo(
    () => (aiFeedbackDetails?.natural_phrase_upgrades ?? []).filter((item) => item.original?.trim() && item.better_version?.trim()),
    [aiFeedbackDetails]
  );
  const fullFeedbackStyleTone = useMemo(
    () => (aiFeedbackDetails?.style_tone_feedback ?? []).filter((item) => item.evidence?.trim() || item.suggestion?.trim()),
    [aiFeedbackDetails]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('writing-hub-theme', themeMode);
  }, [themeMode]);
  const handleReviewHighlightMount = (index: number, element: HTMLSpanElement | null) => {
    const currentRefs = highlightSpanRefs.current ?? {};
    currentRefs[index] = element;
    highlightSpanRefs.current = currentRefs;
  };

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
    const pathRefs = writingPathButtonRefs.current;
    if (!pathRefs) return;
    keepHorizontalItemInView(writingPathCarouselRef.current, pathRefs[activeGenre] ?? null);
  }, [activeGenre, initializing]);

  useEffect(() => {
    if (missionRecommendations.length === 0) {
      setSelectedMissionKey(null);
      return;
    }
    setSelectedMissionKey((current) => {
      if (current && missionRecommendations.some((item) => getMissionRecommendationKey(item) === current)) return current;
      return getMissionRecommendationKey(missionRecommendations[0]);
    });
  }, [missionRecommendations]);

  useEffect(() => {
    if (!selectedMissionKey) return;
    const missionRefs = missionCardRefs.current;
    if (!missionRefs) return;
    keepHorizontalItemInView(missionsCarouselRef.current, missionRefs[selectedMissionKey] ?? null);
  }, [selectedMissionKey, missionRecommendations]);

  useEffect(() => {
    if (!showTaskContextModal) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTaskContextModal(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [showTaskContextModal]);

  useEffect(() => {
    if (!showAiReviewModal) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAiReviewModal(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [showAiReviewModal]);

  useEffect(() => {
    if (!showAiReviewModal || reviewActiveIndex == null) {
      setActiveLineMeasure({ index: null, rects: [] });
      return;
    }
    const measureActiveStep = () => {
      const container = reviewEssayPanelRef.current;
      const activeHighlight = (highlightSpanRefs.current ?? {})[reviewActiveIndex] ?? null;
      setActiveLineMeasure({
        index: reviewActiveIndex,
        rects: getVisualLineRectsForHighlight(container, activeHighlight),
      });
    };
    measureActiveStep();
    const onResize = () => {
      window.requestAnimationFrame(() => measureActiveStep());
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [showAiReviewModal, reviewActiveIndex, reviewSessionKey]);

  useEffect(() => {
    highlightSpanRefs.current = {};
  }, [submittedPracticeText, visibleSubmittedHighlightRanges]);

  useEffect(() => {
    if (!showAiReviewModal || reviewActiveIndex == null || activeLineMeasure.rects.length === 0) return;
    if (activeLineMeasure.index !== reviewActiveIndex) return;
    if (reviewAnimationForIndexRef.current === reviewActiveIndex && reviewAnimationStepRef.current === reviewActiveIndex) return;
    reviewAnimationForIndexRef.current = reviewActiveIndex;
    reviewAnimationStepRef.current = reviewActiveIndex;
    const overlayElements = activeLineOverlayRefs.current ?? [];
    if (!overlayElements.length) return;
    const timeline = gsap.timeline();
    scrollLineIntoComfortZone(reviewEssayPanelRef.current, activeLineMeasure.rects[0] ?? null);
    overlayElements.forEach((element, idx) => {
      if (!element) return;
      gsap.set(element, {
        opacity: 0.82,
        clipPath: 'inset(0 100% 0 0)',
        transformOrigin: 'left center',
      });
      const lineDuration = Math.max(0.22, Math.min(0.7, activeLineMeasure.rects[idx].width / 220));
      timeline.to(element, {
        opacity: 0.9,
        clipPath: 'inset(0 0% 0 0)',
        duration: lineDuration,
        ease: 'power1.out',
      });
      timeline.to(element, {
        opacity: 0.74,
        duration: 0.08,
        ease: 'power1.out',
      }, '>');
    });
    return () => {
      timeline.kill();
      overlayElements.forEach((element) => element && gsap.killTweensOf(element));
    };
  }, [showAiReviewModal, reviewActiveIndex, activeLineMeasure]);

  useEffect(() => {
    activeLineOverlayRefs.current = (activeLineOverlayRefs.current ?? []).slice(0, activeLineMeasure.rects.length);
  }, [activeLineMeasure.rects.length]);

  useEffect(() => {
    if (!showAiReviewModal) {
      reviewAnimationForIndexRef.current = null;
      reviewAnimationStepRef.current = null;
    }
  }, [showAiReviewModal, reviewSessionKey]);

  useEffect(() => {
    if (!showProgressDetailsModal) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowProgressDetailsModal(false);
    };
    window.addEventListener('keydown', onEscape);
    const timer = window.setTimeout(() => closeProgressDetailsButtonRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onEscape);
      window.clearTimeout(timer);
    };
  }, [showProgressDetailsModal]);

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
    if (initializing) {
      setNonCriticalReady(false);
      return;
    }
    let cancelled = false;
    let timeoutId: number | null = null;
    const idleCallback = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    const cancelIdleCallback = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).cancelIdleCallback;
    let idleId: number | null = null;
    const markReady = () => {
      if (!cancelled) setNonCriticalReady(true);
    };
    if (typeof idleCallback === 'function') {
      idleId = idleCallback(markReady, { timeout: 900 });
      timeoutId = window.setTimeout(markReady, 1200);
    } else {
      timeoutId = window.setTimeout(markReady, 900);
    }
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (idleId && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
    };
  }, [initializing, activeGenre]);

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
    setAiFeedbackDetails(firstAttemptRichFeedback);
    if (!submittedPracticeText.trim() && firstAttemptSubmission?.trim()) {
      setSubmittedPracticeText(firstAttemptSubmission.trim());
    }
    const fallbackSummary = [
      ...(firstAttemptRichFeedback.strengths ?? []).slice(0, 2).map((item) => `✅ ${item}`),
      ...(firstAttemptRichFeedback.weaknesses ?? []).slice(0, 2).map((item) => `⚠️ ${item}`),
      ...(firstAttemptRichFeedback.next_steps ?? []).slice(0, 1).map((item) => `➡️ ${item}`),
    ].join(' ');
    if (fallbackSummary) setFeedback((current) => current || fallbackSummary);
    if (firstAttemptRichFeedback.monthly_report_summary?.trim()) {
      setAiMonthlyWording((current) => current || firstAttemptRichFeedback.monthly_report_summary!.trim());
    }
  }, [aiFeedbackDetails, firstAttemptRichFeedback, isActiveWeek, submittedPracticeText, firstAttemptSubmission]);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: number | null = null;
    const loadAiPlanAssist = async () => {
      if (!nonCriticalReady) return;
      if (!stateRes.ok || !stateRes.data?.latest_assessment || aiBusy) return;
      const requestId = (aiPlanAssistRequestIdRef.current ?? 0) + 1;
      aiPlanAssistRequestIdRef.current = requestId;
      setAiBusy(true);
      try {
        const planAssist = await requestWritingAiAssist({
          mode: 'plan_assist',
          prompt_text: promptText,
          weaknesses: latestWeaknesses,
          grade,
          genre: activeGenre,
        });
        const activeRequestId = aiPlanAssistRequestIdRef.current;
        if (cancelled || activeRequestId == null || activeRequestId !== requestId) return;
        if (planAssist.ok && planAssist.data) {
          const ai = (planAssist.data.result ?? {}) as WritingAiPlanAssist;
          if (ai.focus?.trim()) setAiWeeklyFocus(ai.focus.trim());
          if (Array.isArray(ai.coaching_points) && ai.coaching_points.length > 0) {
            setAiCoachingPoints(ai.coaching_points.slice(0, 3));
          }
          if (ai.daily_task?.trim()) setAiTaskWording(ai.daily_task.trim());
        } else if (planAssist.error) {
          setUiNotice(`AI coach unavailable right now: ${planAssist.error}`);
        }
      } finally {
        const activeRequestId = aiPlanAssistRequestIdRef.current;
        if (activeRequestId != null && activeRequestId === requestId) {
          setAiBusy(false);
        }
      }
    };
    debounceTimer = window.setTimeout(() => {
      void loadAiPlanAssist();
    }, 700);
    return () => {
      cancelled = true;
      aiPlanAssistRequestIdRef.current = (aiPlanAssistRequestIdRef.current ?? 0) + 1;
      setAiBusy(false);
      if (debounceTimer) window.clearTimeout(debounceTimer);
    };
  }, [studentId, month, stateRes.ok, stateRes.data?.latest_assessment?.total_score, activeGenre, nonCriticalReady]);

  useEffect(() => {
    let cancelled = false;
    if (!nonCriticalReady) return;
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
  }, [rankedWeaknessTags.join('|'), nonCriticalReady]);

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
    setReviewScanComplete(false);
    setReviewActiveIndex(null);
    try {
      const aiResult = await loadRichFeedback(safeInitialResponse, promptForSubmission, latestWeaknesses, 'initial');
      if (aiResult.ok) {
        setAiReviewViewMode('full');
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
    setReviewScanComplete(false);
    setReviewActiveIndex(null);
    setUiNotice('Nice submit! Preparing your coaching feedback…');

    try {
      const aiResult = await loadRichFeedback(practiceResponse, promptText, latestWeaknesses, 'daily');
      if (!aiResult.ok) {
        setError(`Saved your submission, but AI analysis is unavailable: ${aiResult.error}`);
      } else {
        setAiReviewViewMode('full');
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
    setReviewScanComplete(false);
    setReviewActiveIndex(null);
    setUiNotice(`${toGenreLabel(nextGenre)} path selected.`);
  };

  const handleReviewStepNavigation = (direction: 'previous' | 'next') => {
    setReviewScanComplete(true);
    setReviewActiveIndex((prev) => {
      const current = prev ?? 0;
      if (direction === 'previous') return Math.max(0, current - 1);
      return Math.min(Math.max(0, visibleSubmittedHighlightRanges.length - 1), current + 1);
    });
  };

  useEffect(() => {
    if (!showAiReviewModal) {
      reviewAutoplaySessionRef.current = null;
      setReviewScanComplete(false);
      setReviewActiveIndex(null);
      return;
    }
    if (reviewScanPlan.length === 0) {
      setReviewScanComplete(true);
      setReviewActiveIndex(null);
      return;
    }
    if (reviewAutoplaySessionRef.current === reviewSessionKey) {
      if (reviewActiveIndex == null) setReviewActiveIndex(0);
      return;
    }
    reviewAutoplaySessionRef.current = reviewSessionKey;
    setReviewScanComplete(false);
    setReviewActiveIndex(0);
    let cancelled = false;
    const timers: number[] = [];
    let elapsed = 0;
    reviewScanPlan.forEach((range, idx) => {
      const segment = submittedPracticeText.slice(range.start, range.end);
      const stepDelay = getHighlightAnimationDurationMs(segment.length) + 36;
      timers.push(window.setTimeout(() => {
        if (cancelled) return;
        setReviewActiveIndex(idx);
      }, elapsed));
      elapsed += stepDelay;
    });
    timers.push(window.setTimeout(() => {
      if (!cancelled) setReviewScanComplete(true);
    }, Math.max(reviewAnimationTimelineMs, 0)));
    return () => {
      cancelled = true;
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [
    showAiReviewModal,
    reviewScanPlan,
    reviewSessionKey,
    reviewActiveIndex,
    submittedPracticeText,
    reviewAnimationTimelineMs,
  ]);

  const handlePasteCapture = (event: any) => {
    const target = event?.target;
    const isTextInput =
      target instanceof HTMLTextAreaElement
      || (target instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel', 'password', ''].includes(target.type || 'text'))
      || Boolean(target?.isContentEditable);
    if (!isTextInput) return;
    event.preventDefault();
    setUiNotice('Pasting is disabled in Writing Hub. Please type your own response.');
  };

  const handleCopyCapture = (event: any) => {
    event.preventDefault();
    setUiNotice('Copying is disabled on this page.');
  };

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
    <div
      ref={writingHubRootRef}
      style={pageStyle}
      className={`writing-hub-root writing-hub-theme-${themeMode}`}
      onPasteCapture={handlePasteCapture}
      onCopyCapture={handleCopyCapture}
    >
      <style>{`
        .writing-hub-root {
          --hub-bg: #020617;
          --hub-text: #dbe7ff;
          --hub-text-strong: #f8fbff;
          --hub-text-soft: #c5dcff;
          --hub-text-muted: #cbd5e1;
          --hub-text-accent: #bfdbfe;
          --hub-text-accent-2: #93c5fd;
          --hub-subtext: #94a3b8;
          --hub-panel: rgba(10, 17, 32, 0.92);
          --hub-overlay-soft: rgba(18, 30, 52, 0.92);
          --hub-overlay-strong: rgba(10, 17, 32, 0.95);
          --hub-surface-card: linear-gradient(180deg, #0e1a30 0%, #0a1326 100%);
          --hub-surface-hero: linear-gradient(145deg, #1a47b8 0%, #38257f 55%, #0b1428 100%);
          --hub-muted-surface: rgba(13, 27, 50, 0.86);
          --hub-muted-surface-soft: rgba(30, 48, 79, 0.62);
          --hub-accent-surface: rgba(34, 75, 198, 0.36);
          --hub-progress-track: rgba(30, 41, 59, 0.9);
          --hub-border: rgba(148, 163, 184, 0.32);
          --hub-border-strong: rgba(125, 211, 252, 0.5);
          --hub-shadow-card: 0 16px 36px rgba(2, 6, 23, 0.5);
          --hub-shadow-hover: 0 18px 36px rgba(8, 47, 73, 0.42);
          --hub-hud-bg: rgba(8, 15, 30, 0.92);
          --hub-hud-border: rgba(125, 211, 252, 0.35);
          --hub-glass-blur: blur(6px);
          --marker-strong-base: rgba(74, 222, 128, 0.3);
          --marker-strong-mid: rgba(74, 222, 128, 0.44);
          --marker-weak-base: rgba(248, 113, 113, 0.28);
          --marker-weak-mid: rgba(248, 113, 113, 0.42);
        }
        .writing-hub-theme-light {
          --hub-bg: #eef4ff;
          --hub-text: #0f172a;
          --hub-text-strong: #0b1220;
          --hub-text-soft: #1e3a5f;
          --hub-text-muted: #334155;
          --hub-text-accent: #1d4ed8;
          --hub-text-accent-2: #2563eb;
          --hub-subtext: #475569;
          --hub-panel: rgba(255, 255, 255, 0.96);
          --hub-overlay-soft: rgba(248, 250, 255, 0.96);
          --hub-overlay-strong: rgba(255, 255, 255, 0.98);
          --hub-surface-card: linear-gradient(180deg, #ffffff 0%, #f5f9ff 100%);
          --hub-surface-hero: linear-gradient(145deg, #dbeafe 0%, #ede9fe 52%, #f7f9ff 100%);
          --hub-muted-surface: rgba(237, 245, 255, 0.94);
          --hub-muted-surface-soft: rgba(223, 235, 252, 0.82);
          --hub-accent-surface: rgba(191, 219, 254, 0.62);
          --hub-progress-track: rgba(203, 213, 225, 0.72);
          --hub-border: rgba(148, 163, 184, 0.46);
          --hub-border-strong: rgba(59, 130, 246, 0.42);
          --hub-shadow-card: 0 12px 24px rgba(15, 23, 42, 0.1);
          --hub-shadow-hover: 0 14px 28px rgba(37, 99, 235, 0.16);
          --hub-hud-bg: rgba(255, 255, 255, 0.92);
          --hub-hud-border: rgba(59, 130, 246, 0.3);
          --hub-glass-blur: blur(8px);
          --marker-strong-base: rgba(74, 222, 128, 0.24);
          --marker-strong-mid: rgba(74, 222, 128, 0.34);
          --marker-weak-base: rgba(248, 113, 113, 0.22);
          --marker-weak-mid: rgba(248, 113, 113, 0.32);
        }
        .writing-hub-card {
          animation: cardIn 340ms ease both;
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .writing-hub-card:hover {
          transform: translateY(-2px);
          border-color: var(--hub-border-strong);
          box-shadow: var(--hub-shadow-hover);
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
          background: radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--hub-text-accent-2) 26%, transparent), transparent 45%),
            radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--hub-next-heading) 20%, transparent), transparent 40%);
          pointer-events: none;
        }
        .ai-review-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--hub-text-accent-2);
          box-shadow: 0 0 14px color-mix(in srgb, var(--hub-text-accent-2) 70%, transparent);
          animation: analysisPulse 1.2s ease-in-out infinite;
        }
        .ai-review-brand {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          border-radius: 999px;
          border: 1px solid var(--hub-border-strong);
          background: var(--hub-accent-surface, var(--hub-muted-surface-soft));
          color: var(--hub-text-accent-2);
          padding: 4px 10px 4px 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .review-highlight {
          position: relative;
          display: inline;
          border-radius: 2px;
          padding: 0 1px;
          isolation: isolate;
          transition: opacity 160ms ease, filter 160ms ease;
        }
        .review-highlight__ink-base {
          position: absolute;
          inset: 0.1em -1px 0.05em -1px;
          border-radius: 4px;
          background: linear-gradient(180deg, var(--marker-strong-base) 0%, var(--marker-strong-mid) 55%, var(--marker-strong-base) 100%);
          opacity: 0.24;
          z-index: 0;
          pointer-events: none;
        }
        .review-highlight__text {
          position: relative;
          z-index: 2;
          vertical-align: baseline;
          display: inline;
          line-height: inherit;
        }
        .review-highlight--weak .review-highlight__ink-base {
          background: linear-gradient(180deg, var(--marker-weak-base) 0%, var(--marker-weak-mid) 55%, var(--marker-weak-base) 100%);
        }
        .review-highlight--inactive {
          opacity: 0.9;
          filter: saturate(0.72);
        }
        .review-highlight--inactive .review-highlight__ink-base {
          opacity: 0.03;
        }
        .review-highlight--active .review-highlight__ink-base {
          opacity: 0.36;
        }
        .review-highlight--active {
          opacity: 1;
          filter: saturate(1);
        }
        .ai-review-body {
          min-height: 0;
          display: grid;
          grid-template-rows: minmax(210px, 1fr) auto auto;
          gap: 14px;
          overflow-y: hidden;
          overflow-x: hidden;
          padding: 4px 2px 2px;
          overscroll-behavior: contain;
        }
        .ai-review-essay-panel {
          min-height: 0;
          height: 100%;
        }
        .ai-review-feedback-card,
        .ai-review-next-card {
          box-shadow: 0 8px 18px color-mix(in srgb, var(--hub-text) 8%, transparent);
        }
        @media (max-width: 640px) {
          .ai-review-modal-shell {
            border-radius: 14px !important;
            padding: 12px !important;
            min-height: calc(100dvh - (env(safe-area-inset-top) + env(safe-area-inset-bottom) + 16px)) !important;
            max-height: calc(100dvh - (env(safe-area-inset-top) + env(safe-area-inset-bottom) + 16px)) !important;
          }
          .ai-review-body {
            grid-template-rows: minmax(180px, 1fr) auto auto;
            gap: 10px;
            padding-right: 0;
          }
          .ai-review-essay-panel {
            min-height: 0;
          }
          .ai-review-feedback-card {
            padding: 10px 11px !important;
          }
        }
        .week-stage-wrap {
          display: grid;
          gap: 10px;
        }
        .week-stage-track {
          height: 8px;
          border-radius: 999px;
          background: rgba(30,41,59,0.85);
          border: 1px solid rgba(148,163,184,0.35);
          overflow: hidden;
        }
        .week-stage-nodes {
          display: grid;
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap: 8px;
        }
        .week-stage-node {
          border-radius: 12px;
          border: 1px solid rgba(148,163,184,0.35);
          background: rgba(15,23,42,0.65);
          padding: 10px 8px;
          text-align: center;
        }
        .dashboard-grid { display: grid; gap: 12px; grid-template-columns: 1fr; }
        .focus-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .mini-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
        .phone-quick-nav {
          position: sticky;
          top: 8px;
          z-index: 30;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          padding: 8px;
          border: 1px solid var(--hub-hud-border);
          border-radius: 12px;
          background: var(--hub-hud-bg);
          backdrop-filter: var(--hub-glass-blur);
        }
        .phone-quick-nav button {
          min-height: 42px;
          border-radius: 9px;
          border: 1px solid var(--hub-border-strong);
          background: var(--hub-accent-surface);
          color: var(--hub-text-soft);
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        .phone-submit-bar {
          position: fixed;
          left: 10px;
          right: 10px;
          bottom: max(8px, env(safe-area-inset-bottom));
          z-index: 48;
          margin-top: 0;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid var(--hub-hud-border);
          background: var(--hub-hud-bg);
          backdrop-filter: var(--hub-glass-blur);
          box-shadow: var(--hub-shadow-card);
        }
        .phone-submit-bar .writing-primary-button {
          margin-top: 0 !important;
          font-size: 15px;
          padding: 12px 14px;
        }
        .quick-submit-button {
          border: 1px solid color-mix(in srgb, var(--hub-border-strong) 85%, transparent) !important;
          background: color-mix(in srgb, var(--hub-nav-button-bg) 80%, var(--hub-accent-surface) 20%) !important;
          color: var(--hub-text-strong) !important;
        }
        .cinematic-trigger-button {
          border: 1px dashed color-mix(in srgb, var(--hub-border-strong) 85%, transparent) !important;
          background: linear-gradient(120deg, color-mix(in srgb, var(--hub-text-accent-2) 24%, transparent), color-mix(in srgb, var(--hub-next-heading) 18%, transparent)) !important;
        }
        .help-node-button {
          width: 100%;
          text-align: left;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hub-border) 42%, transparent);
          transition: transform 160ms ease, box-shadow 160ms ease;
        }
        .help-node-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px color-mix(in srgb, var(--hub-text-accent-2) 18%, transparent);
        }
        .help-node-button--guide::after,
        .help-node-button--context::after {
          content: '→';
          margin-left: auto;
          font-weight: 900;
          opacity: 0.85;
        }
        .touch-friendly-field {
          font-size: 16px !important;
          min-height: 150px !important;
        }
        @media (min-width: 860px) {
          .dashboard-grid { grid-template-columns: minmax(0,1.45fr) minmax(0,1fr); align-items: start; }
          .mini-grid { grid-template-columns: repeat(4,minmax(0,1fr)); }
          .phone-quick-nav,
          .phone-submit-bar { display: none; }
          .touch-friendly-field { min-height: 120px !important; }
        }
        @media (max-width: 859px) {
          .writing-hub-card { min-width: 0; }
          .writing-hub-root { padding-bottom: max(110px, calc(env(safe-area-inset-bottom) + 96px)); }
        }
        @media (min-width: 1120px) {
          .focus-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .writing-hub-card,
          .progress-fill,
          .analysis-dot,
          .analysis-shimmer::after,
          .ai-review-modal-shell::before,
          .ai-review-status-dot,
          .review-highlight {
            animation: none !important;
            transition: none !important;
            transform: none !important;
          }
          .analysis-shimmer::after {
            background: transparent !important;
          }
          .review-highlight {
            background-size: 100% 100% !important;
          }
          .review-highlight__ink-base,
          .review-highlight__text {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            clip-path: none !important;
          }
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

      {initializing ? renderLoadingSkeleton() : (
        <>
          <section className="writing-hub-card" style={missionCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, color: headingSubtle, fontWeight: 700, fontSize: 13 }}>
                {isWeekComplete ? 'Week complete' : isActiveWeek ? 'Week active' : 'First step'}
              </p>
              <button
                type="button"
                onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
                aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
                style={{
                  borderRadius: 999,
                  border: '1px solid var(--hub-border-strong)',
                  background: 'var(--hub-hud-bg)',
                  color: 'var(--hub-text-strong)',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
              >
                {themeMode === 'dark' ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>
            <h1 style={{ margin: '6px 0 10px', color: headingColor, fontSize: 30, lineHeight: 1.1 }}>
              {isPreWeek ? 'Welcome to your Writing Hub' : isWeekComplete ? 'Great work — week finished' : 'Your Writing Hub'}
            </h1>
            <div style={{ margin: '0 0 10px', display: 'grid', gap: 8 }}>
              <label style={{ color: 'var(--hub-text-accent)', fontSize: 13, fontWeight: 700 }}>
                Choose your writing path
              </label>
              <div
                ref={writingPathCarouselRef}
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
                      ref={(node: HTMLButtonElement | null) => {
                        const pathRefs = writingPathButtonRefs.current;
                        if (!pathRefs) return;
                        pathRefs[item] = node;
                      }}
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
                        border: `1px solid ${isSelected ? 'var(--hub-border-strong)' : 'var(--hub-border)'}`,
                        background: isSelected ? 'var(--hub-accent-surface)' : 'var(--hub-panel)',
                        padding: 10,
                        color: 'var(--hub-text)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: 'var(--hub-text-strong)', fontSize: 14 }}>{toGenreLabel(item)} path</div>
                      <div style={{ fontSize: 12, color: 'var(--hub-text-accent)', marginTop: 4 }}>
                        {status ? toGenreStateCopy(status.status, status.current_day, status.completed_tasks_count, status.total_tasks_count) : 'Not started yet'}
                      </div>
                      {status && status.latest_score != null && (
                        <div style={{ fontSize: 11, color: 'var(--hub-text-accent-2)', marginTop: 2 }}>Latest score: {status.latest_score}/20</div>
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
                    background: 'var(--hub-overlay-soft)',
                    color: 'var(--hub-text-soft)',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? 'Starting new week…' : `Start new ${toGenreLabel(activeGenre)} week`}
                </button>
              )}
            </div>
            <p style={{ margin: 0, color: 'var(--hub-text)', fontSize: 15 }}>
              {isPreWeek
                ? 'Write one first response. We will find your weak areas and build your weekly writing plan.'
                : isWeekComplete
                  ? 'You completed your plan. Review what improved, then start a new week when you are ready.'
                  : 'Your weekly plan is active. Follow your focus goals and complete today’s task.'}
            </p>
            {isPreWeek && (
              <div className="phone-quick-nav" aria-label="Quick actions for phone users">
                <button type="button" onClick={() => scrollToSection(preWeekResponseRef)}>Go to task</button>
                <button type="button" onClick={() => scrollToSection(preWeekResponseRef)}>Start writing</button>
                <button type="button" onClick={() => preWeekResponseRef.current?.focus()}>Focus input</button>
              </div>
            )}
            {isActiveWeek && (
              <div className="phone-quick-nav" aria-label="Quick actions for phone users">
                <button type="button" onClick={() => scrollToSection(todayMissionCardRef)}>Today task</button>
                <button type="button" onClick={() => scrollToSection(feedbackCardRef)}>Feedback</button>
                <button type="button" onClick={() => scrollToSection(progressCardRef)}>Progress</button>
              </div>
            )}
            {showNoWritingState && <p style={{ margin: '8px 0 0', color: 'var(--hub-text-accent)', fontSize: 13 }}>No writing state yet</p>}
            {!isWeekComplete && (
              <div style={{ marginTop: 12 }} className="week-stage-wrap">
                <div className="week-stage-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, completionRatio * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #38bdf8 0%, #22d3ee 55%, #34d399 100%)',
                    }}
                  />
                </div>
                <div className="week-stage-nodes">
                  {weeklyPlanStages.map((stage, index) => {
                    const isCurrent = index === currentStageIndex;
                    const isDone = index < currentStageIndex;
                    return (
                      <div
                        key={stage.key}
                        className="week-stage-node"
                        style={{
                          borderColor: isCurrent ? 'rgba(125,211,252,0.95)' : 'rgba(148,163,184,0.35)',
                          background: isDone ? 'rgba(16,185,129,0.18)' : isCurrent ? 'var(--hub-accent-surface)' : 'var(--hub-muted-surface)',
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 800, color: isDone ? '#86efac' : isCurrent ? '#7dd3fc' : 'var(--hub-subtext)' }}>
                          {isDone ? '✓ Done' : isCurrent ? 'Now' : 'Next'}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 12, fontWeight: 700, color: 'var(--hub-text-soft)' }}>{stage.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {isPreWeek && (
            <>
              <section ref={preWeekComposeCardRef} className="writing-hub-card" style={shellCardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20, color: 'var(--hub-text-strong)' }}>Your writing task</h3>
                <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent-2)', fontSize: 13, fontWeight: 700 }}>Task summary</p>
                <p style={{ margin: '0 0 10px', color: 'var(--hub-text)', fontSize: 15 }}>{buildReadableTaskSummary(promptText)}</p>
                <div style={{ ...fieldStyle, minHeight: 88, whiteSpace: 'pre-wrap' }}>{promptText}</div>
              </section>

              <section className="writing-hub-card" style={shellCardStyle}>
                <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 20, color: 'var(--hub-text-strong)' }}>Write your first response</h3>
                <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent)', fontSize: 14 }}>
                  Word count target: {toWordCountLabel(targetWordCount)}
                </p>
                <div style={{ margin: '0 0 8px', borderRadius: 12, border: `1px solid ${getWordCounterTone(initialResponseWordCount, targetWordCount).glow}`, background: 'var(--hub-muted-surface)', padding: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <p style={{ margin: 0, color: 'var(--hub-text-soft)', fontSize: 12, fontWeight: 800 }}>Typed so far: {initialResponseWordCount} words</p>
                    <span style={{ borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 800, color: getWordCounterTone(initialResponseWordCount, targetWordCount).accent, border: `1px solid ${getWordCounterTone(initialResponseWordCount, targetWordCount).glow}` }}>
                      {getWordCounterTone(initialResponseWordCount, targetWordCount).label}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, height: 7, borderRadius: 999, background: 'rgba(51,65,85,0.8)', overflow: 'hidden' }}>
                    <div className="progress-fill" style={{ width: `${getWordCounterTone(initialResponseWordCount, targetWordCount).progress}%`, height: '100%', background: getWordCounterTone(initialResponseWordCount, targetWordCount).track }} />
                  </div>
                </div>
                <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent-2)', fontSize: 12 }}>Try to stay close to this range.</p>
                <textarea
                  ref={preWeekResponseRef}
                  value={initialResponse}
                  onChange={(e: { target: { value: string } }) => setInitialResponse(e.target.value)}
                  placeholder="Write your first response here. This helps us understand your starting point and build your weekly coaching plan."
                  className="touch-friendly-field"
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
                <section ref={todayMissionCardRef} className="writing-hub-card" style={{ ...missionCardStyle, borderColor: 'rgba(125, 211, 252, 0.8)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <p style={{ ...dashboardSectionTitleStyle, color: 'var(--hub-text-soft)' }}>Today</p>
                    <span style={{ ...sectionLabelPillStyle, color: 'var(--hub-text-accent)', borderColor: 'rgba(147, 197, 253, 0.55)' }}>Action now</span>
                  </div>
                  <h3 style={{ margin: '0 0 10px', fontSize: 24, color: 'var(--hub-text-strong)' }}>Today’s writing mission</h3>
                {!todayTask.ok || !todayTask.data ? (
                  <div>
                    <p style={{ margin: 0, color: 'var(--hub-text-muted)' }}>Preparing today’s task…</p>
                    <p style={{ margin: '6px 0 0', color: 'var(--hub-text-accent-2)', fontSize: 12 }}>If this takes longer, refresh and try again.</p>
                  </div>
                ) : (
                  <>
                      <h4 style={{ margin: '0 0 8px', color: 'var(--hub-text-strong)', fontSize: 18 }}>{taskTypeToFriendlyTitle(todayTask.data.task_type, todayTask.data.day_number)}</h4>
                    <p style={{ margin: '0 0 6px', color: 'var(--hub-text-accent-2)', fontSize: 13, fontWeight: 700 }}>Today’s goal</p>
                    <p style={{ margin: '0 0 8px', color: 'var(--hub-text)', fontSize: 15 }}>{simplifyStudentLanguage(aiTaskWording || taskTypeToFriendlyInstruction(todayTask.data.task_type))}</p>
                    <p style={{ margin: '0 0 6px', color: 'var(--hub-text-accent-2)', fontSize: 13, fontWeight: 700 }}>Focus on this</p>
                    <p style={{ margin: '0 0 8px', color: 'var(--hub-text-muted)', fontSize: 14 }}>
                      This helps you improve your weekly focus areas and raise your writing score step by step.
                    </p>
                    <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent-2)', fontSize: 13 }}>Word count target: {toWordCountLabel(todayTask.data.expected_word_count)}</p>
                    <div style={{ margin: '0 0 8px', borderRadius: 12, border: `1px solid ${getWordCounterTone(practiceResponseWordCount, todayTask.data.expected_word_count).glow}`, background: 'var(--hub-muted-surface)', padding: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <p style={{ margin: 0, color: 'var(--hub-text-soft)', fontSize: 12, fontWeight: 800 }}>Typed so far: {practiceResponseWordCount} words</p>
                        <span style={{ borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 800, color: getWordCounterTone(practiceResponseWordCount, todayTask.data.expected_word_count).accent, border: `1px solid ${getWordCounterTone(practiceResponseWordCount, todayTask.data.expected_word_count).glow}` }}>
                          {getWordCounterTone(practiceResponseWordCount, todayTask.data.expected_word_count).label}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, height: 7, borderRadius: 999, background: 'var(--hub-progress-track)', overflow: 'hidden' }}>
                        <div className="progress-fill" style={{ width: `${getWordCounterTone(practiceResponseWordCount, todayTask.data.expected_word_count).progress}%`, height: '100%', background: getWordCounterTone(practiceResponseWordCount, todayTask.data.expected_word_count).track }} />
                      </div>
                    </div>
                    <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent-2)', fontSize: 12 }}>Try to stay close to this range.</p>
                    <p style={{ margin: '0 0 6px', color: 'var(--hub-text-accent-2)', fontSize: 13, fontWeight: 700 }}>Try to do these 2 things</p>
                    <ul style={{ margin: '0 0 10px', paddingLeft: 18, color: 'var(--hub-text-muted)', fontSize: 14 }}>
                      {todayTask.data.success_criteria.slice(0, 2).map((item) => (
                        <li key={item} style={{ marginBottom: 4 }}>{simplifyStudentLanguage(item)}</li>
                      ))}
                    </ul>
                    <textarea
                      ref={practiceTextareaRef}
                      value={practiceResponse}
                      onChange={(e: { target: { value: string } }) => setPracticeResponse(e.target.value)}
                      placeholder="Write today’s response here. Focus on today’s goal and your weekly coaching points."
                      className="touch-friendly-field"
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
                {hasTaskToday && (
                  <div className="phone-submit-bar" role="region" aria-label="Quick submit bar for phone users">
                    <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent)', fontSize: 12, fontWeight: 700 }}>
                      {practiceResponseWordCount} words typed · Keep going and submit when ready.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleSubmitPractice()}
                      disabled={loading || !practiceResponse.trim()}
                      className="writing-primary-button quick-submit-button"
                      style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                    >
                      {loading ? 'Submitting…' : 'Quick submit'}
                    </button>
                  </div>
                )}

                <section ref={feedbackCardRef} className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'var(--hub-border-strong)', background: 'var(--hub-surface-card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <p style={{ ...dashboardSectionTitleStyle, color: 'var(--hub-text-accent-2)' }}>Your Feedback</p>
                    <span style={{ ...sectionLabelPillStyle, color: 'var(--hub-text-accent)', borderColor: 'var(--hub-border-strong)' }}>Coaching</span>
                  </div>
                  <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 22, color: 'var(--hub-text-strong)' }}>Quick coaching snapshot</h3>
                {isAnalyzingRichFeedback ? (
                  <div
                    className="analysis-shimmer"
                    role="status"
                    aria-live="polite"
                    style={{
                      border: '1px solid var(--hub-border-strong)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'var(--hub-overlay-soft)',
                      boxShadow: 'var(--hub-shadow-card)',
                    }}
                  >
                    <p style={{ margin: '0 0 6px', color: 'var(--hub-text-accent-2)', fontWeight: 800, fontSize: 16 }}>Analyzing your writing…</p>
                    <p style={{ margin: '0 0 10px', color: 'var(--hub-text-accent)', fontSize: 14 }}>
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
                    <p style={{ margin: 0, color: 'var(--hub-text-accent-2)', fontSize: 14 }}>
                      AI review is ready. Open the cinematic feedback view to see strengths, corrections, and your next move.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAiReviewViewMode('full');
                        setShowAiReviewModal(true);
                      }}
                      className="writing-primary-button cinematic-trigger-button"
                      style={{ ...primaryButtonStyle, marginTop: 0 }}
                    >
                      Open detailed AI feedback
                    </button>
                    <p style={{ margin: 0, color: 'var(--hub-text-accent-2)', fontSize: 13 }}>
                      {feedback || (completedTasksCount > 0 ? `Great consistency. You completed ${completedTasksCount} task${completedTasksCount === 1 ? '' : 's'} this week.` : 'Great start. Your progress grows every day you submit.')}
                    </p>
                  </div>
                ) : (
                  <p style={{ margin: 0, color: feedback ? 'var(--hub-text-accent-2)' : 'var(--hub-subtext)', fontSize: 15 }}>
                    {feedback || (completedTasksCount > 0 ? `Great consistency. You completed ${completedTasksCount} task${completedTasksCount === 1 ? '' : 's'} this week.` : 'Great start. Your progress grows every day you submit.')}
                  </p>
                )}
                </section>
              </div>

              <div className="dashboard-grid">
                <section ref={progressCardRef} className="writing-hub-card" style={{ ...shellCardStyle, borderColor: 'var(--hub-border-strong)', background: 'var(--hub-surface-card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <p style={{ ...dashboardSectionTitleStyle, color: 'var(--hub-text-accent-2)' }}>Your Progress</p>
                    <span style={{ ...sectionLabelPillStyle, color: 'var(--hub-text-accent)', borderColor: 'var(--hub-border-strong)' }}>Snapshot</span>
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 21, color: 'var(--hub-text-strong)' }}>Progress at a glance</h3>
                  <p style={{ margin: '0 0 8px', color: 'var(--hub-text-soft)', fontSize: 15 }}>
                    Current score: <strong>{progressAssessment?.total_score != null ? `${progressAssessment.total_score}/20` : 'Waiting for first score'}</strong>
                  </p>
                  <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent)', fontSize: 14 }}>
                    Weekly focus: {aiWeeklyFocus || 'We picked your focus areas based on your first writing.'}
                  </p>
                  <p style={{ margin: '0 0 8px', color: 'var(--hub-text)', fontSize: 14 }}>
                    What’s improving: {showWeeklyEvidence
                      ? `You completed ${weeklySummary?.completed_tasks} task${weeklySummary?.completed_tasks === 1 ? '' : 's'} this week.`
                      : 'You are building consistency. Keep submitting daily tasks.'}
                  </p>
                  <p style={{ margin: '0 0 10px', color: 'var(--hub-text-accent-2)', fontSize: 14 }}>
                    What to work on today: {toStudentLabel(nextWeekInputs?.carry_forward_primary_target ?? weeklyGoals[0] ?? 'Keep building your weekly focus skills.')}
                  </p>
                  <p style={{ margin: '0 0 10px', color: 'var(--hub-text-accent-2)', fontSize: 14 }}>
                    Next step: {toStudentLabel(nextWeekInputs?.carry_forward_primary_target ?? 'Keep building your weekly focus skills.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowProgressDetailsModal(true)}
                    style={{
                      marginTop: 2,
                      padding: '10px 12px',
                      width: '100%',
                      borderRadius: 10,
                      border: '1px solid var(--hub-border)',
                      background: 'var(--hub-muted-surface-soft)',
                      color: 'var(--hub-text-muted)',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Open full progress details
                  </button>
                </section>

                <section className="writing-hub-card" style={supportPanelStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <p style={{ ...dashboardSectionTitleStyle, color: themeMode === 'light' ? '#7c3aed' : '#c4b5fd' }}>More Help</p>
                    <span style={{ ...sectionLabelPillStyle, color: themeMode === 'light' ? '#7c3aed' : '#d8b4fe', borderColor: themeMode === 'light' ? 'rgba(167, 139, 250, 0.5)' : 'rgba(192, 132, 252, 0.35)' }}>Optional support</span>
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 21, color: 'var(--hub-text-strong)' }}>Deep guides & references</h3>
                  {missionRecommendations.length > 0 && (
                    <div style={{ marginBottom: 12, borderRadius: 12, border: '1px solid rgba(196, 181, 253, 0.45)', background: themeMode === 'light' ? 'rgba(243, 232, 255, 0.72)' : 'rgba(30, 27, 75, 0.35)', padding: 10 }}>
                      <p style={{ margin: '0 0 6px', color: themeMode === 'light' ? '#7c3aed' : '#d8b4fe', fontSize: 12, fontWeight: 800, letterSpacing: 0.2 }}>RECOMMENDED PRACTICE MISSIONS</p>
                      <div
                        ref={missionsCarouselRef}
                        style={{
                          display: 'flex',
                          gap: 8,
                          overflowX: 'auto',
                          paddingBottom: 4,
                          scrollSnapType: 'x mandatory',
                          scrollbarWidth: 'thin',
                        }}
                      >
                        {missionRecommendations.map((item) => (
                          <div
                            key={getMissionRecommendationKey(item)}
                            ref={(node: HTMLDivElement | null) => {
                              const missionRefs = missionCardRefs.current;
                              if (!missionRefs) return;
                              missionRefs[getMissionRecommendationKey(item)] = node;
                            }}
                            style={{
                              borderRadius: 10,
                              border: `1px solid ${selectedMissionKey === getMissionRecommendationKey(item) ? 'rgba(196, 181, 253, 0.9)' : 'rgba(147, 197, 253, 0.35)'}`,
                              background: selectedMissionKey === getMissionRecommendationKey(item)
                                ? (themeMode === 'light' ? 'rgba(196, 181, 253, 0.38)' : 'rgba(76, 29, 149, 0.28)')
                                : (themeMode === 'light' ? 'rgba(255,255,255,0.78)' : 'rgba(15, 23, 42, 0.52)'),
                              padding: 9,
                              minWidth: 250,
                              maxWidth: 320,
                              flex: '0 0 auto',
                              scrollSnapAlign: 'start',
                            }}
                          >
                            <p style={{ margin: 0, color: 'var(--hub-text-strong)', fontSize: 14, fontWeight: 700 }}>{item.title}</p>
                            <p style={{ margin: '3px 0 0', color: 'var(--hub-text-accent)', fontSize: 12 }}>
                              {item.missionCategoryLabel}
                              {item.mission?.difficulty ? ` · ${item.mission.difficulty}` : ''}
                              {item.source === 'category_fallback' ? ' · Practice card' : ' · Mission'}
                            </p>
                            <p style={{ margin: '6px 0 0', color: 'var(--hub-text)', fontSize: 13 }}>{item.reason}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMissionKey(getMissionRecommendationKey(item));
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
                                background: themeMode === 'light' ? 'rgba(233, 213, 255, 0.8)' : 'rgba(76, 29, 149, 0.35)',
                                color: themeMode === 'light' ? '#581c87' : '#ddd6fe',
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
                  <p style={{ margin: '0 0 8px', color: 'var(--hub-text)', fontSize: 14 }}>
                    Target score range: {estimatedTargetRange ? `${estimatedTargetRange.low}–${estimatedTargetRange.high} / 20` : 'Will appear after first scoring'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowTaskTypeGuide((prev) => !prev)}
                    className="help-node-button help-node-button--guide"
                    style={{
                      margin: '0 0 10px',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid color-mix(in srgb, var(--hub-text-accent-2) 48%, transparent)',
                      background: 'linear-gradient(120deg, color-mix(in srgb, var(--hub-text-accent-2) 16%, transparent), color-mix(in srgb, var(--hub-next-heading) 12%, transparent))',
                      color: 'var(--hub-text-strong)',
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span aria-hidden="true">{showTaskTypeGuide ? '▾' : '▸'}</span>
                    {showTaskTypeGuide ? 'Hide detailed task guide' : 'Show detailed task guide'}
                  </button>
                  {showTaskTypeGuide && todayTask.ok && todayTask.data && (
                    <div style={{ borderRadius: 12, border: '1px solid rgba(147, 197, 253, 0.45)', background: 'var(--hub-muted-surface-soft)', padding: 12, marginBottom: 10 }}>
                      <p style={{ margin: '0 0 6px', color: 'var(--hub-text-accent-2)', fontSize: 12, fontWeight: 800 }}>How to answer this task type</p>
                      <p style={{ margin: '0 0 8px', color: 'var(--hub-text)', fontSize: 14 }}>
                        <strong>Goal:</strong> {getTaskTypeStudyGuide(todayTask.data.task_type).objective}
                      </p>
                      <p style={{ margin: '0 0 4px', color: 'var(--hub-text-accent-2)', fontSize: 12, fontWeight: 700 }}>Best structure</p>
                      <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: 'var(--hub-text-muted)', fontSize: 13 }}>
                        {getTaskTypeStudyGuide(todayTask.data.task_type).structure.map((item) => (
                          <li key={item} style={{ marginBottom: 3 }}>{item}</li>
                        ))}
                      </ul>
                      <p style={{ margin: '0 0 4px', color: 'var(--hub-text-accent-2)', fontSize: 12, fontWeight: 700 }}>Check before you submit</p>
                      <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: 'var(--hub-text-muted)', fontSize: 13 }}>
                        {getTaskTypeStudyGuide(todayTask.data.task_type).qualityChecks.map((item) => (
                          <li key={item} style={{ marginBottom: 3 }}>{item}</li>
                        ))}
                      </ul>
                      <p style={{ margin: '0 0 4px', color: 'var(--hub-text-accent-2)', fontSize: 12, fontWeight: 700 }}>Common mistakes to avoid</p>
                      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--hub-text-muted)', fontSize: 13 }}>
                        {getTaskTypeStudyGuide(todayTask.data.task_type).pitfalls.map((item) => (
                          <li key={item} style={{ marginBottom: 3 }}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTaskContextModal(true)}
                    className="help-node-button help-node-button--context"
                    style={{
                      margin: 0,
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid color-mix(in srgb, #a855f7 54%, transparent)',
                      background: 'linear-gradient(120deg, color-mix(in srgb, #a855f7 24%, transparent), color-mix(in srgb, var(--hub-text-accent-2) 14%, transparent))',
                      color: themeMode === 'light' ? '#581c87' : '#ede9fe',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span aria-hidden="true">◉</span>
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
              <p style={{ margin: '0 0 8px', color: 'var(--hub-text-soft)', fontSize: 14 }}>Tasks completed: {completedTasksCount}/{totalPlannedTasks}</p>
              <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent)', fontSize: 14 }}>
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
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--hub-text)' }}>View your progress details</summary>
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
                        <p style={{ margin: 0, color: 'var(--hub-text-soft)', fontSize: 13, fontWeight: 700 }}>{item.label}</p>
                        <p style={{ margin: 0, color: 'var(--hub-text-strong)', fontSize: 13, fontWeight: 800 }}>
                          {item.score == null ? '— / 5' : `${item.score}/5`}
                        </p>
                      </div>
                      <div style={{ ...progressTrackStyle, height: 8 }}>
                        <div className="progress-fill" style={{ width: `${scorePercent}%`, height: '100%', background: tone.color }} />
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--hub-text-accent-2)' }}>
                        {tone.label}
                        {item.delta != null ? ` · ${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)} this month` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>

              <p style={{ margin: 0, color: 'var(--hub-text-accent)' }}>Main focus: {toStudentLabel(dashboard.data?.weekly_plan_summary?.primary ?? 'Not set yet')}</p>
              {!showWeeklyEvidence ? (
                <>
                  <p style={{ margin: 0, color: 'var(--hub-subtext)' }}>You’re just getting started this week.</p>
                  <p style={{ margin: 0, color: 'var(--hub-subtext)' }}>Complete today’s task to unlock clearer progress feedback.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, color: 'var(--hub-text-accent)' }}>What’s improving: You completed {weeklySummary?.completed_tasks} task{weeklySummary?.completed_tasks === 1 ? '' : 's'} this week.</p>
                  <p style={{ margin: 0, color: 'var(--hub-subtext)' }}>
                    What to work on today: {weeklySummary?.top_remaining_weaknesses.map((item) => toStudentLabel(item)).join(', ') || 'Keep practising your weekly goals.'}
                  </p>
                  <p style={{ margin: 0, color: '#86efac' }}>
                    Next step: {toStudentLabel(nextWeekInputs?.carry_forward_primary_target ?? 'Keep building your weekly focus skills.')}
                  </p>
                </>
              )}

              {!showMonthlyEvidence ? (
                <p style={{ margin: 0, color: 'var(--hub-subtext)' }}>Complete more writing this month to unlock your growth view.</p>
              ) : (
                <>
                  <p style={{ margin: 0, color: 'var(--hub-text-accent)' }}>Monthly growth</p>
                  <p style={{ margin: 0 }}>{toStudentLabel(monthlyFacingReport?.score_change ?? '')}</p>
                  {aiMonthlyWording && <p style={{ margin: 0, color: 'var(--hub-text-accent)' }}>{aiMonthlyWording}</p>}
                  <p style={{ margin: 0, color: 'var(--hub-subtext)' }}>{monthlyFacingReport?.subscale_progress.join(' ')}</p>
                  <p style={{ margin: 0, color: '#86efac' }}>Strongest gains: {monthlyFacingReport?.strongest_gains.map((item) => toStudentLabel(item)).join(', ')}</p>
                  <p style={{ margin: 0, color: '#fca5a5' }}>Main blocker: {toStudentLabel(monthlyFacingReport?.remaining_blockers[0] ?? 'None right now')}</p>
                  <p style={{ margin: 0, color: 'var(--hub-text-accent-2)' }}>Next step: {toStudentLabel(monthlyFacingReport?.next_month_priorities[0] ?? 'Keep completing your weekly writing tasks.')}</p>
                </>
              )}
              </div>
            </details>
          )}

          {(uiNotice || isRefreshingProgress) && (
            <p style={{ ...shellCardStyle, margin: 0, color: 'var(--hub-text-accent)', borderColor: 'rgba(96, 165, 250, 0.45)' }}>
              {isRefreshingProgress ? 'Loading progress updates…' : uiNotice}
            </p>
          )}

          {persistenceStatus.state === 'saving' && (
            <p style={{ ...shellCardStyle, margin: 0, color: 'var(--hub-text-accent)', borderColor: 'rgba(56, 189, 248, 0.45)' }}>
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
              <h3 style={{ marginTop: 0, marginBottom: 8, color: 'var(--hub-text-strong)' }}>No active writing task yet</h3>
              <p style={{ margin: 0, color: 'var(--hub-text-muted)' }}>Start your first week to unlock your mission board and daily coaching.</p>
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
            ...modalThemeVars,
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'color-mix(in srgb, var(--hub-modal-overlay) 68%, transparent)',
            backdropFilter: 'blur(12px) saturate(1.15)',
            WebkitBackdropFilter: 'blur(12px) saturate(1.15)',
            padding: 'max(12px, calc(env(safe-area-inset-top) + 8px)) 10px max(12px, calc(env(safe-area-inset-bottom) + 8px))',
            overflow: 'hidden',
          }}
        >
          <div
            className="ai-review-modal-shell"
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            style={{
              width: 'min(840px, 100%)',
              maxHeight: 'calc(100dvh - (max(20px, env(safe-area-inset-top) + env(safe-area-inset-bottom) + 16px)))',
              minHeight: 'min(620px, calc(100dvh - (max(20px, env(safe-area-inset-top) + env(safe-area-inset-bottom) + 16px))))',
              borderRadius: 18,
              border: '1px solid var(--hub-border-strong)',
              background: 'var(--hub-overlay-strong)',
              boxShadow: 'var(--hub-shadow-card)',
              padding: 16,
              overflow: 'hidden',
              overscrollBehavior: 'contain',
              display: 'grid',
              gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
              gap: 10,
            }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div className="ai-review-brand">
                  <img src="/logo.png" alt="Brains Heist" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                  <span>Brains Heist</span>
                </div>
                <p style={{ margin: 0, color: 'var(--hub-text-accent-2)', fontSize: 12, fontWeight: 900, letterSpacing: 0.9, textTransform: 'uppercase' }}>AI Feedback</p>
                <h3 style={{ margin: 0, color: 'var(--hub-text-strong)', fontSize: 22, textShadow: '0 1px 0 color-mix(in srgb, var(--hub-text) 14%, transparent)' }}>
                  {aiReviewViewMode === 'full' ? 'Submitted · Full feedback report' : 'Submitted · Smart review in progress'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiReviewModal(false)}
                style={{
                  borderRadius: 999,
                  border: '1px solid var(--hub-border)',
                  background: 'var(--hub-panel)',
                  color: 'var(--hub-text)',
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
              <span style={{ borderRadius: 999, padding: '4px 10px', border: '1px solid var(--hub-border-strong)', color: 'var(--hub-text-accent-2)', background: 'var(--hub-accent-surface)', fontSize: 12, fontWeight: 800 }}>Submitted ✓</span>
              <span style={{ borderRadius: 999, padding: '4px 10px', border: '1px solid var(--hub-border-strong)', color: 'var(--hub-text-accent-2)', background: 'var(--hub-accent-surface)', fontSize: 12, fontWeight: 800 }}>
                {reviewScanComplete ? 'Review complete ✓' : 'AI review scanning…'}
              </span>
              {!shouldUseFallbackRanges ? (
                <span style={{ borderRadius: 999, padding: '4px 10px', border: '1px solid var(--hub-border-strong)', color: 'var(--hub-text-soft)', background: 'var(--hub-muted-surface-soft)', fontSize: 12, fontWeight: 800 }}>
                  Trusted anchors
                </span>
              ) : (
                <span style={{ borderRadius: 999, padding: '4px 10px', border: '1px solid var(--hub-border)', color: 'var(--hub-text-muted)', background: 'var(--hub-muted-surface-soft)', fontSize: 12, fontWeight: 800 }}>
                  Guided highlights
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--hub-text-accent-2)', fontSize: 12 }}>
                <span className="ai-review-status-dot" />
                {reviewScanComplete ? 'Highlights locked' : 'Live analysis'}
              </span>
              <div style={{ marginLeft: 'auto', display: 'inline-flex', borderRadius: 999, border: '1px solid var(--hub-border)', background: 'var(--hub-panel)', padding: 3, gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setAiReviewViewMode('full')}
                  style={{
                    borderRadius: 999,
                    border: 'none',
                    background: aiReviewViewMode === 'full' ? 'var(--hub-accent-surface)' : 'transparent',
                    color: aiReviewViewMode === 'full' ? 'var(--hub-text-strong)' : 'var(--hub-text-muted)',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '6px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Full feedback
                </button>
                <button
                  type="button"
                  onClick={() => setAiReviewViewMode('cinematic')}
                  style={{
                    borderRadius: 999,
                    border: 'none',
                    background: aiReviewViewMode === 'cinematic' ? 'var(--hub-accent-surface)' : 'transparent',
                    color: aiReviewViewMode === 'cinematic' ? 'var(--hub-text-strong)' : 'var(--hub-text-muted)',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '6px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Cinematic
                </button>
              </div>
            </div>

            {aiReviewViewMode === 'full' ? (
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  borderRadius: 14,
                  border: '1px solid var(--hub-border)',
                  background: 'var(--hub-panel)',
                  padding: '18px 18px 24px',
                  color: 'var(--hub-text-strong)',
                  display: 'grid',
                  gap: 18,
                }}
              >
                <section style={{ borderRadius: 12, background: 'var(--hub-muted-surface)', border: '1px solid var(--hub-border-strong)', padding: '14px 14px' }}>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--hub-text-accent)', fontWeight: 800 }}>Overall</p>
                  <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 900, color: 'var(--hub-text-strong)' }}>
                    {progressAssessment?.total_score != null ? `${progressAssessment.total_score}/20` : '—'}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 16, lineHeight: 1.6, color: 'var(--hub-text)' }}>
                    {aiFeedbackDetails?.task_understanding || toAlignmentLabel(aiFeedbackDetails?.alignment)}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 16, lineHeight: 1.7, color: 'var(--hub-text)' }}>
                    {aiFeedbackDetails?.submission_read || 'You completed your writing attempt. Keep your ideas and now polish precision and clarity.'}
                  </p>
                </section>

                <section style={{ display: 'grid', gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: 'var(--hub-text-strong)' }}>What’s good</h4>
                  {fullFeedbackStrengths.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 30, display: 'grid', gap: 8 }}>
                      {fullFeedbackStrengths.map((item, idx) => (
                        <li key={`full-good-${idx}`} style={{ fontSize: 20, lineHeight: 1.8, fontWeight: 600, color: 'var(--hub-text)' }}>
                          {simplifyStudentLanguage(item)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, fontSize: 18, lineHeight: 1.8, color: 'var(--hub-subtext)' }}>You have a clear starting point. Keep your key idea and structure.</p>
                  )}
                </section>

                <section style={{ display: 'grid', gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: 'var(--hub-text-strong)' }}>Main things to improve</h4>
                  {fullFeedbackImprovements.length > 0 ? (
                    <ol style={{ margin: 0, paddingLeft: 30, display: 'grid', gap: 10 }}>
                      {fullFeedbackImprovements.map((item, idx) => (
                        <li key={`full-improve-${idx}`} style={{ fontSize: 20, lineHeight: 1.8, fontWeight: 700, color: 'var(--hub-text)' }}>
                          {simplifyStudentLanguage(item)}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p style={{ margin: 0, fontSize: 18, lineHeight: 1.8, color: 'var(--hub-subtext)' }}>Focus on one section at a time and make each sentence more precise.</p>
                  )}
                </section>

                {fullFeedbackGrammarFixes.length > 0 && (
                  <section style={{ display: 'grid', gap: 8 }}>
                    <h4 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: 'var(--hub-text-strong)' }}>Grammar & punctuation</h4>
                    <ul style={{ margin: 0, paddingLeft: 30, display: 'grid', gap: 12 }}>
                      {fullFeedbackGrammarFixes.slice(0, 6).map((item, idx) => (
                        <li key={`full-fix-${idx}`} style={{ fontSize: 18, lineHeight: 1.75, color: 'var(--hub-text)' }}>
                          <p style={{ margin: 0, fontWeight: 800 }}>{item.category}</p>
                          <p style={{ margin: '4px 0 0' }}>
                            <strong>{item.original}</strong>
                          </p>
                          <p style={{ margin: '2px 0 0', fontWeight: 800, color: 'var(--hub-text-accent-2)' }}>→ better: {item.better_version}</p>
                          {item.issue && <p style={{ margin: '4px 0 0', color: 'var(--hub-subtext)' }}>{item.issue}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {(fullFeedbackPhraseUpgrades.length > 0 || fullFeedbackStyleTone.length > 0) && (
                  <section style={{ display: 'grid', gap: 8 }}>
                    <h4 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: 'var(--hub-text-strong)' }}>Word choice / phrasing</h4>
                    <ul style={{ margin: 0, paddingLeft: 30, display: 'grid', gap: 10 }}>
                      {fullFeedbackPhraseUpgrades.slice(0, 5).map((item, idx) => (
                        <li key={`full-phrase-${idx}`} style={{ fontSize: 18, lineHeight: 1.75, color: 'var(--hub-text)' }}>
                          <p style={{ margin: 0 }}><strong>{item.original}</strong></p>
                          <p style={{ margin: '2px 0 0', fontWeight: 800, color: 'var(--hub-text-accent-2)' }}>→ better: {item.better_version}</p>
                          {item.why_it_helps && <p style={{ margin: '4px 0 0', color: 'var(--hub-subtext)' }}>{item.why_it_helps}</p>}
                        </li>
                      ))}
                      {fullFeedbackStyleTone.slice(0, 3).map((item, idx) => (
                        <li key={`full-style-${idx}`} style={{ fontSize: 18, lineHeight: 1.75, color: 'var(--hub-text)' }}>
                          <p style={{ margin: 0 }}><strong>{item.evidence || 'Style/tone note'}</strong></p>
                          {item.issue && <p style={{ margin: '4px 0 0' }}>{item.issue}</p>}
                          {item.suggestion && <p style={{ margin: '2px 0 0', fontWeight: 800, color: 'var(--hub-text-accent-2)' }}>→ better: {item.suggestion}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section style={{ borderRadius: 12, border: '1px solid var(--hub-next-border)', background: 'var(--hub-next-bg)', padding: '14px 14px', display: 'grid', gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: 'var(--hub-next-heading)' }}>Improvement point</h4>
                  <p style={{ margin: 0, fontSize: 18, lineHeight: 1.8, color: 'var(--hub-next-text)' }}>
                    {aiFeedbackDetails?.next_move || (aiFeedbackDetails?.next_steps ?? [])[0] || 'Pick one improvement item and rewrite that sentence first.'}
                  </p>
                  {(aiFeedbackDetails?.next_steps ?? []).slice(0, 3).length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 26, display: 'grid', gap: 6 }}>
                      {(aiFeedbackDetails?.next_steps ?? []).slice(0, 3).map((item, idx) => (
                        <li key={`full-next-${idx}`} style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--hub-next-text)' }}>{item}</li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : (
              <div className="ai-review-body" style={{ position: 'relative', zIndex: 1 }}>
                <div
                  className="ai-review-essay-panel"
                  ref={reviewEssayPanelRef}
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    borderRadius: 14,
                    border: '1px solid var(--hub-border)',
                    background: 'var(--hub-panel)',
                    padding: 12,
                    color: 'var(--hub-text)',
                    lineHeight: 1.74,
                    fontSize: 'clamp(16px, 3.2vw, 18px)',
                    whiteSpace: 'pre-wrap',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                  }}
                >
                {renderAnnotatedText(submittedPracticeText, visibleSubmittedHighlightRanges, reviewActiveIndex, handleReviewHighlightMount)}
                {activeLineMeasure.rects.map((line, idx) => {
                  return (
                    <span
                      key={`line-overlay-${idx}`}
                      ref={(element: HTMLSpanElement | null) => {
                        const currentRefs = activeLineOverlayRefs.current ?? [];
                        currentRefs[idx] = element;
                        activeLineOverlayRefs.current = currentRefs;
                      }}
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: line.left - 2,
                        top: line.top + 1,
                        width: line.width + 4,
                        height: Math.max(8, line.height - 1),
                        borderRadius: 4,
                        pointerEvents: 'none',
                        mixBlendMode: 'multiply',
                        background: activeReviewRange?.polarity === 'strong'
                          ? 'linear-gradient(180deg, color-mix(in srgb, var(--hub-marker-strong) 88%, transparent) 0%, var(--hub-marker-strong) 45%, color-mix(in srgb, var(--hub-marker-strong) 86%, transparent) 100%)'
                          : 'linear-gradient(180deg, color-mix(in srgb, var(--hub-marker-weak) 88%, transparent) 0%, var(--hub-marker-weak) 45%, color-mix(in srgb, var(--hub-marker-weak) 86%, transparent) 100%)',
                        boxShadow: 'none',
                      }}
                    />
                  );
                })}
                </div>

                <div className="ai-review-feedback-card" style={{ position: 'relative', zIndex: 1, borderRadius: 12, border: `1px solid ${activeReviewRange?.polarity === 'strong' ? 'var(--hub-border-strong)' : 'var(--hub-border)'}`, background: 'var(--hub-muted-surface)', padding: '12px 12px' }}>
                  {activeReviewRange ? (
                    <>
                      <p style={{ margin: '0 0 8px', color: activeReviewRange.polarity === 'strong' ? 'var(--hub-text-accent-2)' : 'var(--hub-feedback-weak)', fontWeight: 800, fontSize: 'clamp(15px, 2.6vw, 17px)' }}>
                        {activeReviewNote.label}
                      </p>
                      <p style={{ margin: 0, color: 'var(--hub-text)', fontSize: 'clamp(15px, 2.8vw, 17px)', lineHeight: 1.7 }}>{activeReviewNote.detail}</p>
                      {activeReviewNote.correction && (
                        <p style={{ margin: '10px 0 0', color: 'var(--hub-text-accent-2)', fontSize: 'clamp(15px, 2.7vw, 17px)', lineHeight: 1.7 }}>
                          Better version: {activeReviewNote.correction}
                        </p>
                      )}
                    </>
                  ) : (
                    <p style={{ margin: 0, color: 'var(--hub-subtext)', fontSize: 13 }}>Select a highlight to view detailed guidance.</p>
                  )}
                </div>

                {reviewScanComplete && (
                  <div
                    className="ai-review-next-card"
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      borderRadius: 12,
                      border: '1px solid var(--hub-next-border)',
                      background: 'var(--hub-next-bg)',
                      padding: '12px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <p style={{ margin: 0, color: 'var(--hub-next-heading)', fontWeight: 800, fontSize: 'clamp(14px, 2.3vw, 16px)' }}>Next action</p>
                    <p style={{ margin: 0, color: 'var(--hub-next-text)', fontSize: 'clamp(14px, 2.4vw, 16px)', lineHeight: 1.6, flex: '1 1 280px' }}>
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
                      border: '1px solid var(--hub-cta-border)',
                      background: 'var(--hub-cta-bg)',
                      color: 'var(--hub-cta-text)',
                      padding: '9px 12px',
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                    >
                      Start revision
                    </button>
                  </div>
                )}
              </div>
            )}
            <div style={{ position: 'relative', zIndex: 1, borderTop: '1px solid var(--hub-border)', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              {aiReviewViewMode === 'cinematic' ? (
                <>
                  <p style={{ margin: 0, color: 'var(--hub-text-strong)', fontSize: 12, fontWeight: 800 }}>
                    {reviewScanPlan.length > 0
                      ? `Highlight ${(reviewActiveIndex ?? 0) + 1} of ${visibleSubmittedHighlightRanges.length}`
                      : 'No highlights available yet'}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleReviewStepNavigation('previous')}
                      disabled={reviewScanPlan.length === 0 || (reviewActiveIndex ?? 0) <= 0}
                      style={{
                        borderRadius: 10,
                        border: '1px solid var(--hub-nav-button-border)',
                        background: 'var(--hub-nav-button-bg)',
                        color: 'var(--hub-text)',
                        padding: '7px 12px',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: reviewScanPlan.length === 0 || (reviewActiveIndex ?? 0) <= 0 ? 'not-allowed' : 'pointer',
                        opacity: reviewScanPlan.length === 0 || (reviewActiveIndex ?? 0) <= 0 ? 0.55 : 1,
                      }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewStepNavigation('next')}
                      disabled={reviewScanPlan.length === 0 || (reviewActiveIndex ?? 0) >= Math.max(0, visibleSubmittedHighlightRanges.length - 1)}
                      style={{
                        borderRadius: 10,
                        border: '1px solid var(--hub-nav-button-border)',
                        background: 'var(--hub-nav-button-bg)',
                        color: 'var(--hub-text)',
                        padding: '7px 12px',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: reviewScanPlan.length === 0 || (reviewActiveIndex ?? 0) >= Math.max(0, visibleSubmittedHighlightRanges.length - 1) ? 'not-allowed' : 'pointer',
                        opacity: reviewScanPlan.length === 0 || (reviewActiveIndex ?? 0) >= Math.max(0, visibleSubmittedHighlightRanges.length - 1) ? 0.55 : 1,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, color: 'var(--hub-text-soft)', fontSize: 13, fontWeight: 700 }}>
                    Clear structure + larger text mode for easier review.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPracticeResponse(submittedPracticeText);
                      setShowAiReviewModal(false);
                      setUiNotice('Revision mode is on. Use your full feedback notes to rewrite clearly.');
                    }}
                    style={{
                      borderRadius: 10,
                      border: '1px solid var(--hub-cta-border)',
                      background: 'var(--hub-cta-bg)',
                      color: 'var(--hub-cta-text)',
                      padding: '9px 12px',
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    Start revision
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {showProgressDetailsModal && createPortal((
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full progress details"
          onClick={() => setShowProgressDetailsModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1125, display: 'grid', placeItems: 'center', background: 'rgba(2, 6, 23, 0.78)', padding: 16 }}
        >
          <div
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            style={{ width: 'min(900px, 100%)', maxHeight: 'calc(100vh - 32px)', borderRadius: 16, border: '1px solid rgba(148,163,184,0.4)', background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)', padding: 14, overflowY: 'auto', display: 'grid', gap: 10 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <p style={{ margin: 0, color: 'var(--hub-text)', fontSize: 17, fontWeight: 800 }}>Full progress details</p>
              <button
                type="button"
                ref={closeProgressDetailsButtonRef}
                onClick={() => setShowProgressDetailsModal(false)}
                aria-label="Close full progress details"
                style={{ borderRadius: 999, border: '1px solid rgba(148,163,184,0.45)', background: 'rgba(15,23,42,0.75)', color: 'var(--hub-text)', width: 34, height: 34, fontSize: 18, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            <div className="focus-grid">
              {subscaleCards.map((item) => {
                const tone = getProgressTone(item.score);
                const scorePercent = item.score == null ? 0 : Math.max(0, Math.min(100, (item.score / 5) * 100));
                return (
                  <div key={item.key} style={{ borderRadius: 12, border: `1px solid ${tone.glow}`, background: 'rgba(15, 23, 42, 0.55)', padding: 10, display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <p style={{ margin: 0, color: 'var(--hub-text-soft)', fontSize: 13, fontWeight: 700 }}>{item.label}</p>
                      <p style={{ margin: 0, color: 'var(--hub-text-strong)', fontSize: 13, fontWeight: 800 }}>{item.score == null ? '— / 5' : `${item.score}/5`}</p>
                    </div>
                    <div style={{ ...progressTrackStyle, height: 8 }}>
                      <div className="progress-fill" style={{ width: `${scorePercent}%`, height: '100%', background: tone.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ margin: 0, color: 'var(--hub-text-accent)' }}>Main focus: {toStudentLabel(dashboard.data?.weekly_plan_summary?.primary ?? 'Not set yet')}</p>
            {!showMonthlyEvidence ? (
              <p style={{ margin: 0, color: 'var(--hub-subtext)' }}>Complete more writing this month to unlock your growth view.</p>
            ) : (
              <>
                <p style={{ margin: 0, color: 'var(--hub-text-accent)' }}>Monthly growth</p>
                <p style={{ margin: 0 }}>{toStudentLabel(monthlyFacingReport?.score_change ?? '')}</p>
              </>
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
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            background: 'rgba(2, 6, 23, 0.72)',
            padding: '16px 16px 24px',
            overflowY: 'auto',
          }}
        >
          <div
            onClick={(event: { stopPropagation: () => void }) => event.stopPropagation()}
            style={{
              width: 'min(980px, 100%)',
              height: 'min(820px, calc(100vh - 40px))',
              borderRadius: 16,
              border: '1px solid rgba(125, 211, 252, 0.35)',
              background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
              boxShadow: '0 24px 50px rgba(2, 6, 23, 0.6)',
              padding: 14,
              overflow: 'hidden',
              display: 'grid',
              gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ margin: 0, color: 'var(--hub-text-soft)', fontSize: 16, fontWeight: 800 }}>Your first coaching session</p>
                <p style={{ margin: '4px 0 0', color: 'var(--hub-text-accent-2)', fontSize: 12 }}>
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
                  color: 'var(--hub-text)',
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
            <div style={{ minHeight: 0, overflowY: 'auto', paddingRight: 2, display: 'grid', gap: 10, alignContent: 'start' }}>
              <div className="focus-grid" style={{ gap: 12 }}>
                <div style={{ ...fieldStyle, background: 'rgba(15, 23, 42, 0.46)', minHeight: 200 }}>
                <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent-2)', fontSize: 12, fontWeight: 700 }}>Step 1 · What the task asked</p>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--hub-text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
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
                  <p style={{ margin: '0 0 8px', color: 'var(--hub-text-accent-2)', fontSize: 12, fontWeight: 700 }}>Your first attempt (coached view)</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(74, 222, 128, 0.4)', color: '#86efac', fontSize: 11 }}>
                      Strong signals
                    </span>
                    <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(248, 113, 113, 0.45)', color: '#fca5a5', fontSize: 11 }}>
                      Repair targets
                    </span>
                    {anchorTrustEvaluation.mode === 'trusted' ? (
                      <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(96, 165, 250, 0.45)', color: 'var(--hub-text-accent)', fontSize: 11 }}>
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
                      <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(148, 163, 184, 0.4)', color: 'var(--hub-text-muted)', fontSize: 11 }}>
                        Guidance-only mode (no anchors provided)
                      </span>
                    ) : (
                      <span style={{ borderRadius: 999, padding: '2px 8px', border: '1px solid rgba(148, 163, 184, 0.4)', color: 'var(--hub-text-muted)', fontSize: 11 }}>
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
                      color: 'var(--hub-text)',
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
                  <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.25)', paddingTop: 10, minHeight: 230 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <p style={{ margin: 0, color: 'var(--hub-text-muted)', fontSize: 12, fontWeight: 700 }}>
                      Step 3 · Let’s fix one thing at a time
                    </p>
                    {repairQueue.length > 0 && (
                      <span style={{ color: 'var(--hub-text-accent)', fontSize: 11 }}>
                        Step {Math.min(repairQueue.length, sessionSeenRepairCount || 1)} of {repairQueue.length} · session progress
                      </span>
                    )}
                  </div>
                  {repairQueue.length > 0 && (
                    <div style={{ height: 6, borderRadius: 999, background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.3)', marginBottom: 10 }}>
                      <div style={{ height: '100%', borderRadius: 999, width: `${(sessionSeenRepairCount / repairQueue.length) * 100}%`, background: 'linear-gradient(90deg, #38bdf8 0%, #34d399 100%)', transition: 'width 180ms ease' }} />
                    </div>
                  )}
                  <p style={{ margin: '0 0 8px', color: 'var(--hub-subtext)', fontSize: 12 }}>
                    Pick one step, revise that part, then move to the next.
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {repairQueue.length === 0 ? (
                      <p style={{ margin: 0, color: 'var(--hub-subtext)', fontSize: 13 }}>
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
                            background: active ? 'rgba(127,29,29,0.32)' : 'var(--hub-muted-surface-soft)',
                            padding: '8px 10px',
                            cursor: 'pointer',
                            color: 'var(--hub-text)',
                          }}
                        >
                          <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', fontWeight: 700 }}>
                            {active ? 'Start here' : `Step ${idx + 1}`} · {item.category.replace('_', ' ')}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700 }}>{item.title}</p>
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--hub-text-muted)' }}>{item.explanation}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                  <p style={{ margin: 0, color: 'var(--hub-text-accent)', fontSize: 12, minHeight: 18 }}>{repairStatusMessage}</p>
                </div>
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
                  color: 'var(--hub-text)',
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

const WRITING_HUB_FORCE_LEGACY_FLAG = 'writing_hub_legacy_ui';

const isLegacyForced = (): boolean => {
  const envFlag = typeof import.meta !== 'undefined' && (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ? (import.meta as ImportMeta & { env?: Record<string, string> }).env?.['VITE_WRITING_HUB_FORCE_LEGACY_UI']
    : undefined;
  if (typeof envFlag === 'string' && ['1', 'true', 'on', 'yes'].includes(envFlag.toLowerCase())) return true;
  if (typeof window === 'undefined') return false;
  const localFlag = window.localStorage.getItem(WRITING_HUB_FORCE_LEGACY_FLAG);
  return typeof localFlag === 'string' && ['1', 'true', 'on', 'yes'].includes(localFlag.toLowerCase());
};

const createRevisionCycleId = (): string => `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const buildWritingDraftStorageKey = (studentId: string, genre: SupportedGenre, promptText: string): string =>
  `writing_hub_draft:${studentId}:${genre}:${normalizePromptForComparison(promptText).slice(0, 120)}`;

const WritingHubSimpleLoop: React.FC<WritingHubProps> = ({ studentId, studentName, grade, genre }) => {
  const [activeGenre, setActiveGenre] = useState<SupportedGenre>(genre);
  const [promptText, setPromptText] = useState(defaultPromptByGenre[genre]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Write your response, submit for feedback, then choose retry or a new prompt.');
  const [assessment, setAssessment] = useState<{
    total_score: number;
    weakness_tags: string[];
    subscores: {
      content: number;
      communicative_achievement: number | null;
      organisation: number;
      language: number;
    };
  } | null>(null);
  const [aiFeedback, setAiFeedback] = useState<WritingAiFeedbackAssist | null>(null);
  const [submittedText, setSubmittedText] = useState('');
  const [showCinematicFeedback, setShowCinematicFeedback] = useState(false);
  const [cinematicIndex, setCinematicIndex] = useState<number | null>(null);
  const [cinematicDone, setCinematicDone] = useState(false);
  const [showFullEssayContext, setShowFullEssayContext] = useState(false);
  const [showPromptChooser, setShowPromptChooser] = useState(false);
  const [revisionCycleId, setRevisionCycleId] = useState<string>(() => createRevisionCycleId());
  const [attemptNumber, setAttemptNumber] = useState<number>(1);
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [lastRetryKind, setLastRetryKind] = useState<'same_prompt' | 'new_prompt'>('new_prompt');
  const [promptHistoryCount, setPromptHistoryCount] = useState<number>(0);
  const responseFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const cinematicTextPanelRef = useRef<HTMLDivElement | null>(null);
  const cinematicRangeRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const cinematicTracePathRef = useRef<SVGPathElement | null>(null);
  const observerCleanupRef = useRef<(() => void) | null>(null);
  const targetWordCount = grade <= 7 ? 80 : grade <= 9 ? 120 : 160;
  const wordCount = countWords(draft);
  const wordTone = useMemo(() => getWordCounterTone(wordCount, targetWordCount), [wordCount, targetWordCount]);
  const isVeryShortDraft = wordCount > 0 && wordCount < Math.max(10, Math.floor(targetWordCount * 0.2));
  const availablePromptCount = useMemo(() => {
    const promptRes = listWritingPrompts({ genre: activeGenre, grade, is_active: true });
    if (!promptRes.ok || !promptRes.data) return 1;
    return Math.max(1, promptRes.data.length);
  }, [activeGenre, grade]);
  const hasPromptRotation = availablePromptCount > 1;
  const draftStorageKey = useMemo(
    () => buildWritingDraftStorageKey(studentId, activeGenre, promptText),
    [studentId, activeGenre, promptText]
  );

  useEffect(() => {
    setActiveGenre(genre);
    setPromptText(defaultPromptByGenre[genre]);
    setDraft('');
    setAssessment(null);
    setAiFeedback(null);
    setSubmittedText('');
    setShowCinematicFeedback(false);
    setShowPromptChooser(false);
    setShowFullEssayContext(false);
    setCinematicIndex(null);
    setCinematicDone(false);
    setRevisionCycleId(createRevisionCycleId());
    setAttemptNumber(1);
    setLastAttemptId(null);
    setLastRetryKind('new_prompt');
  }, [genre]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedPayload = window.localStorage.getItem(draftStorageKey);
      if (!savedPayload) return;
      const parsed = JSON.parse(savedPayload) as { draft?: string };
      const recovered = parsed?.draft?.trim() ? parsed.draft : '';
      if (!recovered) return;
      setDraft((current) => (current.trim() ? current : recovered));
      setNotice('Recovered your draft. Keep going — your progress is safe.');
    } catch {
      // Ignore malformed local draft payload.
    }
  }, [draftStorageKey]);

  useEffect(() => {
    const result = getStudentPromptAttemptCount({
      student_id: studentId,
      genre: activeGenre,
      prompt_text: promptText,
    });
    if (!result.ok || !result.data) {
      setPromptHistoryCount(0);
      return;
    }
    setPromptHistoryCount(result.data.count);
  }, [studentId, activeGenre, promptText, assessment?.total_score]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      try {
        if (!draft.trim()) {
          window.localStorage.removeItem(draftStorageKey);
          return;
        }
        window.localStorage.setItem(
          draftStorageKey,
          JSON.stringify({
            draft,
            updated_at: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore storage quota / access failures.
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!draft.trim()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [draft]);

  const beginRetrySamePrompt = () => {
    setLastRetryKind('same_prompt');
    setDraft('');
    setAssessment(null);
    setAiFeedback(null);
    setSubmittedText('');
    setShowCinematicFeedback(false);
    setCinematicDone(false);
    setCinematicIndex(null);
    setShowFullEssayContext(false);
    setNotice('Retry this prompt: write an improved version, then submit.');
    setTimeout(() => responseFieldRef.current?.focus(), 0);
  };

  const loadFreshPrompt = async (genreOverride?: SupportedGenre) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice(hasPromptRotation ? 'Loading a new prompt…' : 'Checking for a different prompt…');
    try {
      const nextGenre = genreOverride ?? activeGenre;
      if (nextGenre !== activeGenre) setActiveGenre(nextGenre);
      const stateRes = getStudentWritingState(studentId, nextGenre);
      const weaknessTags = stateRes.ok && stateRes.data?.latest_assessment ? stateRes.data.latest_assessment.weakness_tags.slice(0, 4) : [];
      const previousPrompt = promptText;
      const nextPrompt = await getSmartWritingPromptForStudent({
        student_id: studentId,
        grade,
        genre: nextGenre,
        current_prompt_text: promptText,
        weakness_tags: weaknessTags,
        use_ai_polish: true,
      });
      let resolvedPrompt = defaultPromptByGenre[nextGenre];
      if (nextPrompt.ok && nextPrompt.data?.prompt_text?.trim()) {
        resolvedPrompt = nextPrompt.data.prompt_text.trim();
      }
      if (normalizePromptForComparison(resolvedPrompt) === normalizePromptForComparison(previousPrompt)) {
        setNotice(
          hasPromptRotation
            ? 'Prompt pool returned the same task. You can still retry this prompt now, and we will rotate on the next request.'
            : `Only one active ${toGenreLabel(nextGenre).toLowerCase()} prompt is enabled, so New prompt keeps the same task.`
        );
      } else {
        setNotice('New prompt ready. Write and submit.');
      }
      setPromptText(resolvedPrompt);
      setDraft('');
      setAssessment(null);
      setAiFeedback(null);
      setSubmittedText('');
      setShowCinematicFeedback(false);
      setCinematicIndex(null);
      setCinematicDone(false);
      setRevisionCycleId(createRevisionCycleId());
      setAttemptNumber(1);
      setLastAttemptId(null);
      setLastRetryKind('new_prompt');
      setShowPromptChooser(false);
      setTimeout(() => responseFieldRef.current?.focus(), 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load a new prompt.');
      setNotice('Using your current prompt. You can still submit safely.');
    } finally {
      setBusy(false);
    }
  };

  const submitAttempt = async (retryKind: 'same_prompt' | 'new_prompt') => {
    if (!draft.trim()) {
      setError('Please write your response before submitting.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('Checking your writing…');

    const currentCycleId = retryKind === 'new_prompt' ? createRevisionCycleId() : revisionCycleId;
    const currentAttemptNumber = retryKind === 'new_prompt' ? 1 : attemptNumber;

    const result = submitInitialWritingAssessment({
      student_id: studentId,
      student_name: studentName,
      grade,
      genre: activeGenre,
      prompt_text: promptText,
      target_word_count: targetWordCount,
      student_response: draft,
      revision_cycle_id: currentCycleId,
      attempt_number: currentAttemptNumber,
      retry_kind: retryKind,
      parent_attempt_id: retryKind === 'same_prompt' ? lastAttemptId : null,
    });

    if (!result.ok || !result.data) {
      setError(result.error ?? 'Submission failed. Please retry.');
      setBusy(false);
      return;
    }

    setAssessment(result.data.assessment_result);
    setSubmittedText(draft);
    setLastAttemptId(result.data.attempt_id ?? null);
    setRevisionCycleId(currentCycleId);
    setAttemptNumber(currentAttemptNumber + 1);
    setLastRetryKind(retryKind);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(draftStorageKey);
    }

    try {
      const ai = await requestWritingAiAssist({
        mode: 'feedback',
        prompt_text: promptText,
        student_response: draft,
        weaknesses: result.data.assessment_result.weakness_tags.slice(0, 5),
        grade,
        genre: activeGenre,
      });
      if (ai.ok && ai.data) {
        setAiFeedback((ai.data.result ?? null) as WritingAiFeedbackAssist | null);
      } else {
        setAiFeedback(null);
      }
    } catch {
      setAiFeedback(null);
    } finally {
      setBusy(false);
      setNotice('Feedback ready. Choose Retry this prompt or New prompt.');
      setShowCinematicFeedback(true);
      setCinematicDone(false);
      setCinematicIndex(null);
      setShowFullEssayContext(false);
    }
  };

  const trustedRanges = useMemo(
    () => buildAnchorRanges(submittedText, aiFeedback),
    [submittedText, aiFeedback]
  );
  const fallbackRanges = useMemo(
    () => buildFallbackHighlightRanges(submittedText, aiFeedback),
    [submittedText, aiFeedback]
  );
  const cinematicTrust = useMemo(
    () => evaluateAnchorTrust(submittedText, aiFeedback),
    [submittedText, aiFeedback]
  );
  const cinematicRanges = useMemo(
    () => buildBalancedReviewSequence(
      cinematicTrust.mode === 'trusted' && !hasConflictingAnchorOverlap(trustedRanges) ? trustedRanges : fallbackRanges,
      8
    ),
    [cinematicTrust.mode, trustedRanges, fallbackRanges]
  );
  const improvementGuidance = useMemo(
    () => [
      aiFeedback?.next_move,
      ...(aiFeedback?.next_steps ?? []),
    ].filter(Boolean).join(' ') || 'Focus on the mistake tags, then rewrite for clearer task coverage and language control.',
    [aiFeedback]
  );
  const cinematicModeLabel =
    cinematicTrust.mode === 'trusted'
      ? 'Precision review mode'
      : cinematicTrust.mode === 'stale_feedback'
        ? 'Guided review mode'
        : 'Guided review mode';
  const activeCinematicRange = cinematicIndex != null ? cinematicRanges[cinematicIndex] ?? null : null;
  const activeCinematicDetail = useMemo(
    () => describeHighlight(activeCinematicRange, submittedText, aiFeedback),
    [activeCinematicRange, submittedText, aiFeedback]
  );
  const activeSnippet = useMemo(() => {
    if (!activeCinematicRange) return '';
    return submittedText.slice(activeCinematicRange.start, activeCinematicRange.end).trim() || activeCinematicRange.sourceExactText?.trim() || '';
  }, [activeCinematicRange, submittedText]);
  const activeLessonFix = useMemo(
    () => pickLessonFixForRange(activeCinematicRange, activeSnippet, aiFeedback),
    [activeCinematicRange, activeSnippet, aiFeedback]
  );
  const activeReviewIssue = useMemo((): GuidedReviewIssue => {
    const originalSentence = activeSnippet || activeCinematicRange?.sourceExactText || 'No snippet available.';
    const candidateImproved = activeLessonFix?.betterVersion || activeCinematicDetail.correction || '';
    const improvedSentence = candidateImproved && isMeaningfullyDifferent(originalSentence, candidateImproved)
      ? candidateImproved
      : null;
    const kind: GuidedIssueKind = activeCinematicRange?.polarity === 'strong'
      ? 'strength'
      : activeLessonFix?.kind === 'grammar'
        ? 'grammar'
        : activeLessonFix?.kind === 'punctuation'
          ? 'punctuation'
          : activeLessonFix?.kind === 'phrase'
            ? /support|evidence|example|reason|detail/i.test(activeLessonFix?.why ?? '')
              ? 'support'
              : 'clarity'
            : 'clarity';
    const label =
      kind === 'grammar' ? 'Grammar issue' :
        kind === 'punctuation' ? 'Punctuation issue' :
          kind === 'support' ? 'Develop the idea' :
            kind === 'clarity' ? 'Make it clearer' :
              kind === 'strength' ? 'Strong example' : 'Writing issue';
    const diagnosis = simplifyStudentLanguage(activeLessonFix?.why || activeCinematicDetail.detail).trim() || `Improve this sentence: "${originalSentence}"`;
    const whyThisIsStronger = kind === 'grammar'
      ? `The revision fixes grammar so the sentence reads correctly: "${originalSentence}".`
      : kind === 'punctuation'
        ? `The revision improves punctuation, which makes your sentence easier to read.`
        : kind === 'support'
          ? 'Adding a concrete detail or example makes your point more convincing.'
          : kind === 'strength'
            ? 'Keep this sentence style in future paragraphs because it is clear and purposeful.'
            : improvedSentence
              ? 'The revised version is clearer and easier for the reader to follow.'
              : 'This sentence already works; refine it only if you can add more precision.';
    const scopedCoaching = kind === 'strength'
      ? null
      : simplifyStudentLanguage(activeLessonFix?.why || '').trim() || null;

    return {
      id: `${activeCinematicRange?.start ?? 'none'}-${activeCinematicRange?.end ?? 'none'}-${kind}`,
      kind,
      label,
      originalSentence,
      diagnosis,
      improvedSentence,
      whyThisIsStronger,
      coachingNote: scopedCoaching,
      evidenceSpan: `${activeCinematicRange?.start ?? 0}:${activeCinematicRange?.end ?? 0}`,
    };
  }, [activeSnippet, activeLessonFix, activeCinematicDetail, activeCinematicRange]);
  const normalizedReviewIssue = useMemo(() => getSafeIssueExplanation(remapIssueType(activeReviewIssue)), [activeReviewIssue]);
  const issueConsistency = useMemo(() => validateIssueConsistency(normalizedReviewIssue), [normalizedReviewIssue]);
  const issueTypeLabel = normalizedReviewIssue.label;
  const whatToImproveText = normalizedReviewIssue.diagnosis;
  const betterVersionText = normalizedReviewIssue.improvedSentence;
  const whyItMattersText = issueConsistency.valid
    ? normalizedReviewIssue.whyThisIsStronger
    : `Focus on this sentence only: "${normalizedReviewIssue.originalSentence}". Improve clarity with one concrete edit.`;

  useEffect(() => {
    if (issueConsistency.valid || process.env['NODE_ENV'] === 'production') return;
    console.warn('Guided review issue consistency check failed', {
      reason: issueConsistency.reason,
      issueId: normalizedReviewIssue.id,
      evidenceSpan: normalizedReviewIssue.evidenceSpan,
    });
  }, [issueConsistency, normalizedReviewIssue.id, normalizedReviewIssue.evidenceSpan]);
  const rubricRows = useMemo(
    () => [
      { key: 'content', label: 'Content', value: assessment?.subscores.content ?? null },
      { key: 'organisation', label: 'Organization', value: assessment?.subscores.organisation ?? null },
      { key: 'language', label: 'Language', value: assessment?.subscores.language ?? null },
      { key: 'communicative_achievement', label: 'Communicative Achievement', value: assessment?.subscores.communicative_achievement ?? null },
    ],
    [assessment]
  );

  const handleRangeMount = (index: number, element: HTMLSpanElement | null) => {
    const refs = cinematicRangeRefs.current ?? {};
    refs[index] = element;
    cinematicRangeRefs.current = refs;
  };

  useEffect(() => {
    if (!assessment) return;
    const card = document.querySelector('.feedback-result-card');
    if (!card) return;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo(card, { opacity: 0, y: 20, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.45 });
    tl.fromTo(
      card.querySelectorAll('.feedback-insight-row'),
      { opacity: 0, x: -10 },
      { opacity: 1, x: 0, duration: 0.3, stagger: 0.1 },
      '-=0.15'
    );
    return () => { tl.kill(); };
  }, [assessment]);

  useEffect(() => {
    if (!showCinematicFeedback) return;
    const panel = document.querySelector('.simple-cinematic-panel');
    if (!panel) return;

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo(panel, { opacity: 0, scale: 0.97, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.5 });
    tl.fromTo(panel.querySelector('.cinematic-text-panel'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4 }, '-=0.2');
    tl.fromTo('.cinematic-detail-card', { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.35 }, '-=0.15');
    tl.fromTo('.cinematic-rubric-section', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35 }, '-=0.1');
    tl.fromTo('.cinematic-nav-bar', { opacity: 0 }, { opacity: 1, duration: 0.25 }, '-=0.1');
    tl.add(() => {
      const bars = document.querySelectorAll('.rubric-bar-fill');
      bars.forEach((bar) => {
        const target = (bar as HTMLElement).style.width || '0%';
        gsap.fromTo(bar, { width: '0%' }, { width: target, duration: 0.8, ease: 'power2.out', delay: 0.05 });
      });
    }, '-=0.15');

    if (cinematicRanges.length === 0) {
      setCinematicDone(true);
      setCinematicIndex(null);
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    let elapsed = 600;
    cinematicRanges.forEach((range, idx) => {
      const segment = submittedText.slice(range.start, range.end);
      const delay = getHighlightAnimationDurationMs(segment.length) + 80;
      timers.push(window.setTimeout(() => {
        if (!cancelled) setCinematicIndex(idx);
      }, elapsed));
      elapsed += delay;
    });
    timers.push(window.setTimeout(() => {
      if (!cancelled) setCinematicDone(true);
    }, elapsed + 200));
    return () => {
      cancelled = true;
      tl.kill();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [showCinematicFeedback, cinematicRanges, submittedText]);

  useEffect(() => {
    if (!showCinematicFeedback || cinematicIndex == null) return;
    const panel = cinematicTextPanelRef.current;
    const activeRangeEl = (cinematicRangeRefs.current ?? {})[cinematicIndex];
    const pathEl = cinematicTracePathRef.current;
    if (!panel || !activeRangeEl || !pathEl) return;

    const lineRects = getVisualLineRectsForHighlight(panel, activeRangeEl);
    if (lineRects.length === 0) return;

    const isStrong = activeCinematicRange?.polarity === 'strong';
    const accentColor = isStrong ? '#4ade80' : '#f87171';
    const glowColor = isStrong ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)';
    const softGlow = isStrong ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)';

    const pathParts = lineRects.map((rect) => {
      const y = rect.top + rect.height + 4;
      const x1 = Math.max(4, rect.left - 4);
      const x2 = Math.min(panel.scrollWidth - 4, rect.left + rect.width + 4);
      return `M ${x1} ${y} L ${x2} ${y}`;
    });
    pathEl.setAttribute('d', pathParts.join(' '));
    pathEl.setAttribute('stroke', accentColor);

    const stepTl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    stepTl.fromTo(pathEl, { drawSVG: '0% 0%', opacity: 0 }, { drawSVG: '0% 100%', opacity: 1, duration: 0.6 });

    stepTl.fromTo(
      activeRangeEl,
      { backgroundColor: 'rgba(15,23,42,0.1)', boxShadow: `0 0 0px ${glowColor}` },
      { backgroundColor: softGlow, boxShadow: `0 0 18px ${glowColor}`, duration: 0.4 },
      '-=0.35'
    );

    stepTl.to(activeRangeEl, { boxShadow: `0 0 6px ${glowColor}`, duration: 0.8, ease: 'power1.inOut' });

    const detailCard = document.querySelector('.cinematic-detail-card');
    if (detailCard) {
      stepTl.fromTo(detailCard, { opacity: 0.3, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, '-=0.6');
    }

    scrollLineIntoComfortZone(panel, lineRects[0] ?? null);

    return () => { stepTl.kill(); };
  }, [showCinematicFeedback, cinematicIndex, submittedText, activeCinematicRange?.polarity]);

  useEffect(() => {
    if (typeof document === 'undefined' || !showCinematicFeedback) return;
    const { style } = document.body;
    const previousOverflow = style.overflow;
    const previousOverscrollBehaviorY = style.overscrollBehaviorY;
    style.overflow = 'hidden';
    style.overscrollBehaviorY = 'none';
    return () => {
      style.overflow = previousOverflow;
      style.overscrollBehaviorY = previousOverscrollBehaviorY;
    };
  }, [showCinematicFeedback]);

  useEffect(() => {
    observerCleanupRef.current?.();
    observerCleanupRef.current = null;
    if (!showCinematicFeedback || cinematicRanges.length === 0) return;
    const panel = cinematicTextPanelRef.current;
    if (!panel || typeof window === 'undefined') return;
    const observer = Observer.create({
      target: panel,
      wheelSpeed: -1,
      tolerance: 8,
      preventDefault: false,
      type: 'wheel,touch,pointer',
      onUp: () => setCinematicIndex((prev) => Math.max(0, (prev ?? 0) - 1)),
      onDown: () => setCinematicIndex((prev) => Math.min(cinematicRanges.length - 1, (prev ?? 0) + 1)),
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setCinematicIndex((prev) => Math.min(cinematicRanges.length - 1, (prev ?? 0) + 1));
      if (event.key === 'ArrowLeft') setCinematicIndex((prev) => Math.max(0, (prev ?? 0) - 1));
    };
    window.addEventListener('keydown', onKeyDown);
    observerCleanupRef.current = () => {
      observer.kill();
      window.removeEventListener('keydown', onKeyDown);
    };
    return observerCleanupRef.current;
  }, [showCinematicFeedback, cinematicRanges.length]);

  const handlePasteCapture = (event: any) => {
    const target = event?.target;
    const isTextInput =
      target instanceof HTMLTextAreaElement
      || (target instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'tel', 'password', ''].includes(target.type || 'text'))
      || Boolean(target?.isContentEditable);
    if (!isTextInput) return;
    event.preventDefault();
    setNotice('Pasting is disabled in Writing Hub. Please type your own response.');
  };

  const handleCopyCapture = (event: any) => {
    event.preventDefault();
    setNotice('Copying is disabled on this page.');
  };

  return (
    <div style={{ ...getPageStyle('dark'), gap: 14 }} onPasteCapture={handlePasteCapture} onCopyCapture={handleCopyCapture}>
      <section className="writing-hub-card" style={getMissionCardStyle('dark')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 50%, #2563eb 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, boxShadow: '0 0 28px rgba(99,102,241,0.35), 0 4px 12px rgba(0,0,0,0.2)', flexShrink: 0 }}>✍️</div>
          <div>
            <h2 style={{ margin: 0, color: '#f8fbff', fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>Your Writing Space</h2>
            <p style={{ margin: '4px 0 0', color: '#a5b4fc', fontSize: 14, lineHeight: 1.4 }}>Write your best, get expert feedback, and level up</p>
          </div>
        </div>
        {notice && <p style={{ margin: '14px 0 0', color: '#a5b4fc', fontSize: 14, lineHeight: 1.5, padding: '10px 14px', borderRadius: 12, background: 'rgba(30,58,138,0.18)', border: '1px solid rgba(147,197,253,0.2)' }}>{notice}</p>}
        {error && <p style={{ margin: '8px 0 0', color: '#fca5a5', fontSize: 14, lineHeight: 1.5, padding: '10px 14px', borderRadius: 12, background: 'rgba(127,29,29,0.15)', border: '1px solid rgba(248,113,113,0.25)' }}>{error}</p>}
      </section>

      <section className="writing-hub-card" style={{ ...getShellCardStyle('dark'), padding: '22px 22px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#e0e7ff', fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' as const }}>📝 Today's Prompt</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 10, padding: '6px 12px', background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(99,102,241,0.1))', border: '1px solid rgba(167,139,250,0.25)', color: '#c4b5fd', fontSize: 13, fontWeight: 700 }}>
              {toGenreLabel(activeGenre)}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 10, padding: '6px 12px', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: '#67e8f9', fontSize: 13, fontWeight: 700 }}>
              🎯 {toWordCountLabel(targetWordCount)}
            </span>
            <span
              title="How many times you already attempted this exact prompt"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 10, padding: '6px 12px', background: 'rgba(148,163,184,0.14)', border: '1px solid rgba(148,163,184,0.25)', color: '#cbd5e1', fontSize: 12, fontWeight: 700 }}
            >
              🕘 Prompt history: {promptHistoryCount}
            </span>
            <button
              type="button"
              onClick={() => setShowPromptChooser(true)}
              style={{ borderRadius: 10, border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(30,41,59,0.4)', color: '#94a3b8', fontSize: 13, fontWeight: 600, padding: '6px 14px', cursor: 'pointer', transition: 'all 180ms ease' }}
            >
              Switch genre
            </button>
          </div>
        </div>
        <div style={{ borderRadius: 14, background: 'linear-gradient(135deg, rgba(15,23,42,0.6) 0%, rgba(30,41,59,0.3) 100%)', border: '1px solid rgba(148,163,184,0.12)', padding: '18px 20px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 10, left: 14, color: 'rgba(148,163,184,0.2)', fontSize: 36, lineHeight: 1, fontFamily: 'Georgia, serif', pointerEvents: 'none' }}>"</div>
          <p style={{ margin: 0, color: '#e2e8f0', whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.75, paddingLeft: 8 }}>{promptText}</p>
        </div>
      </section>

      <section className="writing-hub-card" style={{ ...getShellCardStyle('dark'), padding: '22px 22px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0, color: '#e0e7ff', fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' as const }}>✏️ Your Response</h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, padding: '6px 14px', borderRadius: 12, background: `${wordTone.glow}`, border: `1px solid ${wordTone.accent}33`, transition: 'all 250ms ease' }}>
            <span style={{ color: wordTone.accent, fontSize: 22, fontWeight: 800, lineHeight: 1, transition: 'color 200ms ease' }}>{wordCount}</span>
            <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>/ {toWordCountLabel(targetWordCount)}</span>
          </div>
        </div>

        <div style={{ marginBottom: 14, borderRadius: 12, background: 'rgba(15,23,42,0.35)', border: '1px solid rgba(148,163,184,0.1)', padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>Word count progress</span>
            <span style={{ color: wordTone.accent, fontSize: 13, fontWeight: 700, transition: 'color 250ms ease' }}>{wordTone.microcopy}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'rgba(71,85,105,0.3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${wordTone.progress}%`, background: wordTone.track, borderRadius: 999, transition: 'width 400ms cubic-bezier(0.34, 1.56, 0.64, 1)', boxShadow: `0 0 12px ${wordTone.accent}50` }} />
          </div>
        </div>

        {isVeryShortDraft && (
          <div style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.18)' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
            <p style={{ margin: 0, color: '#fde68a', fontSize: 14, lineHeight: 1.5 }}>
              Keep going! More detail = better feedback for you.
            </p>
          </div>
        )}

        <textarea
          ref={responseFieldRef}
          value={draft}
          onChange={(e: { target: { value: string } }) => setDraft(e.target.value)}
          placeholder={"Start writing here…\n\nTake your time — your ideas matter more than perfect grammar."}
          style={{ ...fieldStyle, marginTop: 0, minHeight: 260, resize: 'vertical', lineHeight: 1.85, fontSize: 16, borderRadius: 16, border: '1px solid rgba(148,163,184,0.15)', background: 'rgba(8,14,28,0.65)', padding: '18px 20px', transition: 'border-color 200ms ease, box-shadow 200ms ease', color: '#f1f5f9' }}
          aria-label="Writing response"
        />

        <button
          type="button"
          onClick={() => void submitAttempt(lastRetryKind)}
          disabled={busy || !draft.trim()}
          className="writing-primary-button"
          style={{
            ...primaryButtonStyle,
            marginTop: 14,
            padding: '16px 20px',
            borderRadius: 14,
            fontSize: 16,
            fontWeight: 800,
            background: busy ? 'rgba(71,85,105,0.5)' : 'linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #a855f7 100%)',
            opacity: (!draft.trim() && !busy) ? 0.5 : 1,
            cursor: busy || !draft.trim() ? 'not-allowed' : 'pointer',
            boxShadow: draft.trim() && !busy ? '0 8px 32px rgba(99,102,241,0.4), 0 0 0 1px rgba(167,139,250,0.3)' : 'none',
            transition: 'all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            letterSpacing: 0.3,
          }}
        >
          {busy ? '✨ Analyzing your writing…' : 'Submit for Feedback →'}
        </button>
        <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
          Tip: You can switch genre from the prompt card above before your next try.
        </p>
      </section>

      {assessment && (
        <section className="writing-hub-card feedback-result-card" style={{ ...getShellCardStyle('dark'), padding: '24px 22px', borderRadius: 22, border: '1px solid rgba(99,102,241,0.3)', overflow: 'hidden', position: 'relative', background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(10,17,32,0.98) 100%)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% -10%, rgba(99,102,241,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(6,182,212,0.06) 0%, transparent 50%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #a855f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(99,102,241,0.4), 0 4px 12px rgba(0,0,0,0.3)' }}>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, lineHeight: 1 }}>{assessment.total_score}</span>
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, color: '#f8fafc', fontWeight: 800, fontSize: 20 }}>Your Feedback is Ready! 🎉</h3>
                <p style={{ margin: '4px 0 0', color: '#a5b4fc', fontSize: 14 }}>
                  {toAlignmentLabel(aiFeedback?.alignment)} · Score {assessment.total_score} out of {rubricRows.reduce((sum, r) => sum + 5, 0)}
                </p>
              </div>
            </div>

            {((aiFeedback?.what_is_working ?? aiFeedback?.strengths ?? []).length > 0 || (aiFeedback?.what_is_missing ?? aiFeedback?.weaknesses ?? []).length > 0) && (
              <div style={{ display: 'grid', gap: 10 }}>
                {(() => {
                  const topStrength = (aiFeedback?.what_is_working ?? aiFeedback?.strengths ?? [])[0];
                  if (!topStrength) return null;
                  return (
                    <div className="feedback-insight-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderRadius: 14, background: 'rgba(6,78,59,0.18)', border: '1px solid rgba(74,222,128,0.25)', padding: '14px 16px' }}>
                      <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, rgba(74,222,128,0.25), rgba(34,197,94,0.15))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✅</span>
                      <div>
                        <p style={{ margin: 0, color: '#86efac', fontSize: 13, fontWeight: 700, marginBottom: 3 }}>What you did well</p>
                        <p style={{ margin: 0, color: '#d1fae5', fontSize: 15, lineHeight: 1.6 }}>{simplifyStudentLanguage(topStrength)}</p>
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  const topIssue = (aiFeedback?.what_is_missing ?? aiFeedback?.weaknesses ?? [])[0];
                  if (!topIssue) return null;
                  return (
                    <div className="feedback-insight-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderRadius: 14, background: 'rgba(127,29,29,0.12)', border: '1px solid rgba(248,113,113,0.2)', padding: '14px 16px' }}>
                      <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, rgba(248,113,113,0.2), rgba(239,68,68,0.1))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🔧</span>
                      <div>
                        <p style={{ margin: 0, color: '#fca5a5', fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Focus on next</p>
                        <p style={{ margin: 0, color: '#fecaca', fontSize: 15, lineHeight: 1.6 }}>{simplifyStudentLanguage(topIssue)}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowCinematicFeedback(true)}
              disabled={busy}
              className="writing-primary-button cinematic-trigger-button"
              style={{ ...primaryButtonStyle, marginTop: 4, padding: '18px 20px', borderRadius: 14, background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 50%, #06b6d4 100%)', boxShadow: '0 0 36px rgba(99,102,241,0.3), 0 6px 20px rgba(0,0,0,0.3)', fontSize: 17, fontWeight: 800, letterSpacing: 0.3 }}
            >
              📖 See Your Detailed Feedback
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
              <button
                type="button"
                onClick={beginRetrySamePrompt}
                disabled={busy}
                style={{ ...primaryButtonStyle, marginTop: 0, background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', fontSize: 14, padding: '14px 14px', borderRadius: 12, boxShadow: '0 4px 14px rgba(14,165,233,0.25)' }}
              >
                ✍️ Retry this prompt
              </button>
              <button
                type="button"
                onClick={() => setShowPromptChooser(true)}
                disabled={busy}
                style={{ ...primaryButtonStyle, marginTop: 0, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', fontSize: 14, padding: '14px 14px', borderRadius: 12, boxShadow: '0 4px 14px rgba(16,185,129,0.25)' }}
              >
                🆕 New prompt
              </button>
            </div>
          </div>
        </section>
      )}

      {showCinematicFeedback && assessment && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(2,6,23,0.88)',
            backdropFilter: 'blur(6px)',
            display: 'grid',
            placeItems: 'center',
            padding: 14,
          }}
          onClick={(e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) setShowCinematicFeedback(false); }}
        >
          <div
            className="simple-cinematic-panel"
            style={{
              width: 'min(940px, 100%)',
              height: 'calc(100dvh - (env(safe-area-inset-top) + env(safe-area-inset-bottom) + 12px))',
              maxHeight: 'calc(100dvh - (env(safe-area-inset-top) + env(safe-area-inset-bottom) + 12px))',
              minHeight: 0,
              overflow: 'hidden',
              borderRadius: 24,
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'linear-gradient(180deg, #0c1527 0%, #080e1c 100%)',
              padding: 'max(16px, calc(12px + env(safe-area-inset-top))) 18px max(14px, calc(10px + env(safe-area-inset-bottom)))',
              color: '#e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 0 80px rgba(99,102,241,0.15), 0 25px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'grid', gap: 3 }}>
                <p style={{ margin: 0, color: '#93c5fd', fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  {cinematicModeLabel}
                </p>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 20, fontWeight: 800 }}>Writing Coach Review</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
                    Issue {(cinematicIndex ?? 0) + 1} of {Math.max(1, cinematicRanges.length)}
                  </p>
                  <span style={{ color: '#f5d0fe', fontSize: 11, borderRadius: 999, border: '1px solid rgba(192,132,252,0.35)', padding: '2px 8px' }}>{issueTypeLabel}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCinematicFeedback(false)}
                style={{ borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.9)', color: '#e2e8f0', padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                ✕ Close
              </button>
            </div>

            <div
              style={{
                minHeight: 0,
                flex: '1 1 auto',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                display: 'grid',
                gap: 12,
                alignContent: 'start',
                paddingBottom: 'calc(130px + env(safe-area-inset-bottom))',
              }}
            >
              <div className="cinematic-detail-card" style={{ borderRadius: 18, border: '1px solid rgba(99,102,241,0.32)', background: 'linear-gradient(180deg, rgba(15,23,42,0.9), rgba(12,20,36,0.92))', padding: '18px 16px', display: 'grid', gap: 14, boxShadow: '0 10px 30px rgba(2,6,23,0.45)' }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#bfdbfe', fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>Original sentence</span>
                    <span style={{ color: '#fca5a5', fontSize: 11, border: '1px solid rgba(248,113,113,0.35)', padding: '3px 8px', borderRadius: 999 }}>
                      {normalizedReviewIssue.improvedSentence ? 'Needs fix' : 'No rewrite needed'}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: '#f8fafc', fontSize: 22, lineHeight: 1.75, fontWeight: 500 }}>
                    {renderPhraseComparison(normalizedReviewIssue.originalSentence || 'No snippet available.', activeLessonFix?.original ?? null, 'warning')}
                  </p>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <p style={{ margin: 0, color: '#fbcfe8', fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>What to improve</p>
                  <p style={{ margin: 0, color: '#e2e8f0', fontSize: 15, lineHeight: 1.65 }}>{whatToImproveText}</p>
                </div>

                {betterVersionText ? (
                  <div style={{ borderRadius: 14, border: '1px solid rgba(74,222,128,0.35)', background: 'linear-gradient(180deg, rgba(6,78,59,0.3), rgba(6,95,70,0.16))', padding: '14px 14px', display: 'grid', gap: 7 }}>
                    <p style={{ margin: 0, color: '#86efac', fontSize: 12, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>Better version</p>
                    <p style={{ margin: 0, color: '#ecfdf5', fontSize: 21, lineHeight: 1.75, fontWeight: 500 }}>
                      {renderPhraseComparison(betterVersionText, activeLessonFix?.betterVersion ?? null, 'success')}
                    </p>
                  </div>
                ) : (
                  <div style={{ borderRadius: 14, border: '1px solid rgba(125,211,252,0.3)', background: 'linear-gradient(180deg, rgba(15,23,42,0.55), rgba(15,23,42,0.32))', padding: '12px 14px' }}>
                    <p style={{ margin: 0, color: '#bae6fd', fontSize: 14, lineHeight: 1.6 }}>
                      {normalizedReviewIssue.kind === 'grammar' ? 'No grammar rewrite needed here.' : 'This sentence is already clear. Improve it only if you can add more specific detail.'}
                    </p>
                  </div>
                )}

                <div style={{ display: 'grid', gap: 8 }}>
                  <p style={{ margin: 0, color: '#c4b5fd', fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>Why this matters</p>
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.65 }}>{whyItMattersText}</p>
                </div>
              </div>

              <div style={{ borderRadius: 14, border: '1px solid rgba(148,163,184,0.24)', background: 'rgba(15,23,42,0.5)', padding: '12px 14px' }}>
                <button
                  type="button"
                  onClick={() => setShowFullEssayContext((prev) => !prev)}
                  style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: '#93c5fd', fontSize: 13, fontWeight: 700, padding: 0, cursor: 'pointer' }}
                >
                  {showFullEssayContext ? 'Hide full essay context' : 'Show full essay context'}
                </button>
                {showFullEssayContext && (
                  <div
                    ref={cinematicTextPanelRef}
                    className="cinematic-text-panel"
                    style={{ marginTop: 10, position: 'relative', borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(2,6,23,0.45)', padding: '12px 14px', lineHeight: 1.75, fontSize: 15 }}
                  >
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden="true">
                      <path ref={cinematicTracePathRef} d="" stroke={activeCinematicRange?.polarity === 'strong' ? '#4ade80' : '#f87171'} strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    </svg>
                    {submittedText ? renderAnnotatedText(submittedText, cinematicRanges, cinematicIndex, handleRangeMount) : 'No submission text available.'}
                  </div>
                )}
              </div>

              <details className="cinematic-rubric-section" style={{ borderRadius: 14, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.35)', padding: '12px 14px' }}>
                <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: 13, fontWeight: 700 }}>More coaching details (rubric + starter + actions)</summary>
                <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                  {(() => {
                    const model = aiFeedback?.example_revision_start?.trim();
                    if (!model) return null;
                    return <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}><strong style={{ color: '#bfdbfe' }}>Revision starter:</strong> “{model}”</p>;
                  })()}
                  <div style={{ display: 'grid', gap: 8 }}>
                    {rubricRows.map((row) => {
                      if (row.value == null) return <p key={row.key} style={{ margin: 0, color: '#64748b', fontSize: 12 }}>{row.label}: not assessed</p>;
                      const rubricReason = buildRubricReason(row.key, row.value, assessment?.weakness_tags ?? [], aiFeedback);
                      return <p key={row.key} style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>{row.label}: {row.value}/5{rubricReason ? ` — ${rubricReason}` : ''}</p>;
                    })}
                  </div>
                  {improvementGuidance && <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13 }}>{improvementGuidance}</p>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                    <button
                      type="button"
                      onClick={beginRetrySamePrompt}
                      style={{ ...primaryButtonStyle, marginTop: 0, background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', fontSize: 14, padding: '11px 12px', borderRadius: 11 }}
                    >
                      ✍️ Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCinematicFeedback(false);
                        setShowPromptChooser(true);
                      }}
                      style={{ ...primaryButtonStyle, marginTop: 0, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', fontSize: 14, padding: '11px 12px', borderRadius: 11 }}
                    >
                      🆕 New prompt
                    </button>
                  </div>
                </div>
              </details>
            </div>

            <div className="cinematic-nav-bar" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', width: 'min(900px, calc(100vw - 24px))', bottom: 'max(8px, calc(env(safe-area-inset-bottom) + 6px))', borderRadius: 16, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(12px) saturate(1.2)', WebkitBackdropFilter: 'blur(12px) saturate(1.2)', boxShadow: '0 -8px 30px rgba(2,6,23,0.4), 0 0 24px rgba(99,102,241,0.15)', padding: '12px 14px calc(12px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, zIndex: 5 }}>
              <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>
                {cinematicRanges.length > 0 ? `${(cinematicIndex ?? 0) + 1} / ${cinematicRanges.length}` : '0 / 0'}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setCinematicIndex((prev) => Math.max(0, (prev ?? 0) - 1))}
                  disabled={cinematicRanges.length === 0 || (cinematicIndex ?? 0) <= 0}
                  style={{ borderRadius: 11, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(30,41,59,0.6)', color: '#e2e8f0', padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setCinematicIndex((prev) => Math.min(cinematicRanges.length - 1, (prev ?? 0) + 1))}
                  disabled={cinematicRanges.length === 0 || (cinematicIndex ?? 0) >= cinematicRanges.length - 1}
                  style={{ borderRadius: 11, border: '1px solid rgba(96,165,250,0.4)', background: 'linear-gradient(135deg, rgba(37,99,235,0.32), rgba(30,41,59,0.8))', color: '#e2e8f0', padding: '12px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}
                >
                  Next →
                </button>
              </div>
            </div>
            {!cinematicDone && <p style={{ margin: 0, color: '#93c5fd', fontSize: 12 }}>Review animation in progress…</p>}
          </div>
        </div>
      )}

      {showPromptChooser && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 122, background: 'rgba(2,6,23,0.8)', display: 'grid', placeItems: 'center', padding: 14 }}>
          <div style={{ width: 'min(820px, 100%)', borderRadius: 18, border: '1px solid rgba(148,163,184,0.45)', background: 'linear-gradient(180deg,#0b1224,#07101f)', padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <p style={{ margin: 0, color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>Choose your next challenge</p>
                <h3 style={{ margin: '4px 0 0', color: '#f8fafc' }}>Pick a genre, then load a fresh prompt</h3>
              </div>
              <button type="button" onClick={() => setShowPromptChooser(false)} style={{ borderRadius: 8, border: '1px solid rgba(148,163,184,0.45)', background: 'rgba(15,23,42,0.9)', color: '#e2e8f0', padding: '8px 10px' }}>
                Close
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
              {SUPPORTED_GENRES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    void loadFreshPrompt(item);
                    setShowCinematicFeedback(false);
                  }}
                  disabled={busy}
                  style={{
                    borderRadius: 12,
                    border: item === activeGenre ? '1px solid rgba(74,222,128,0.7)' : '1px solid rgba(148,163,184,0.35)',
                    background: item === activeGenre ? 'rgba(6,78,59,0.35)' : 'rgba(15,23,42,0.75)',
                    color: '#e2e8f0',
                    padding: '12px 10px',
                    textAlign: 'left',
                  }}
                >
                  <strong style={{ display: 'block' }}>{toGenreLabel(item)}</strong>
                  <span style={{ fontSize: 12, color: '#93c5fd' }}>{item === activeGenre ? 'Current genre' : 'Switch and load prompt'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const WritingHub: React.FC<WritingHubProps> = (props) => {
  const [legacyForced] = useState<boolean>(() => isLegacyForced());
  if (legacyForced) return <WritingHubLegacy {...props} />;
  return <WritingHubSimpleLoop {...props} />;
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

export {
  getSafeIssueExplanation,
  isMeaningfullyDifferent,
  normalizeForComparison,
  remapIssueType,
  validateIssueConsistency,
};

export default WritingHub;
