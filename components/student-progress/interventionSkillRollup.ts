import type { InterventionRecommendation } from '../../services/studentInterventionService';

/**
 * Skill-level roll-up for the teacher support cycle (feature-flagged, presentation only).
 *
 * Problem: diagnostic evidence lands on atomic sub-skills. One assessed task can seed 30 leaf
 * focuses with one evidence item each, so none of them crosses the leaf threshold and the teacher
 * sees nothing actionable even when the student plainly needs support at the parent-skill level.
 *
 * This module groups leaf recommendations by primary skill and decides a group readiness. It
 * never relaxes a gate:
 *  - a group's readiness is the BEST of its leaves' own readiness (a reviewable leaf stays
 *    reviewable; a confirmed leaf stays ready);
 *  - a group whose leaves are all still collecting evidence becomes reviewable only when the
 *    leaves' qualifying evidence together meets the same threshold a single leaf needs today;
 *  - "ready for practice" is never granted by the roll-up itself. It only appears when a leaf
 *    already holds a confirmed professional review (readiness === 'ready').
 *
 * Every action still targets a real leaf skill_key, so existing RPC contracts are unchanged.
 */

export const DEFAULT_ROLLUP_EVIDENCE_THRESHOLD = 3;

export type RollupReadiness = InterventionRecommendation['readiness'];

/** A leaf as shown in a group. When the same atomic sub-skill is tracked under more than one key
 *  scheme (legacy `diagnostic:` and canonical `registry:`), the leaves are merged for display and
 *  `merged_skill_keys` lists every key that contributed. Actions still use `skill_key`. */
export type RollupLeaf = InterventionRecommendation & { merged_skill_keys?: string[] };

export interface SkillRollupGroup {
  key: string;
  subject: string;
  area: string | null;
  areaLabel: string | null;
  primarySkill: string;
  leaves: RollupLeaf[];
  /** The leaf a teacher action is routed to (review modal / targeted practice). */
  anchor: RollupLeaf;
  readiness: RollupReadiness;
  /** True when the group is reviewable only because its leaves' evidence was pooled. */
  promotedByRollup: boolean;
  evidenceItems: number;
  lastObservedAt: string;
  priority: string;
  availableExactQuestions: number;
  exactQuestionIds: string[];
  /** Exact questions from the anchor leaf first, then sibling leaves; capped like the page today. */
  recommendedQuestionIds: string[];
  diagnosticTargets: string[];
  unlockHint: string | null;
}

const readinessRank: Record<RollupReadiness, number> = {
  collect_evidence: 0,
  review_evidence: 1,
  ready: 2,
  open_plan: 3,
};

const areaLabels: Record<string, string> = {
  'use-of-english': 'Use of English',
  reading: 'Reading',
  writing: 'Writing',
  listening: 'Listening',
  speaking: 'Speaking',
};

const areaTaskNames: Record<string, string> = {
  'use-of-english': 'Use of English task',
  reading: 'reading task',
  writing: 'writing task',
  listening: 'listening task',
  speaking: 'speaking task',
};

const bestOf = (a: InterventionRecommendation, b: InterventionRecommendation) => {
  const ra = readinessRank[a.readiness];
  const rb = readinessRank[b.readiness];
  if (ra !== rb) return rb > ra ? b : a;
  if (b.evidence_items !== a.evidence_items) return b.evidence_items > a.evidence_items ? b : a;
  return new Date(b.last_observed_at).getTime() > new Date(a.last_observed_at).getTime() ? b : a;
};

const norm = (value?: string | null) => (value || '').trim().toLocaleLowerCase();

/**
 * Stable atomic sub-skill code behind a focus key, across key schemes:
 *  - `diagnostic:<scope>:<primary-skill-code>:<atomic-code>` (legacy)
 *  - `registry:<registry-version>:<atomic-code>` (canonical, see docs/academic-skill-registry.md)
 * Returns null for keys that carry no atomic code (objective:, free-text).
 */
export function atomicCodeFromKey(skillKey: string): string | null {
  const parts = skillKey.split(':');
  if (parts[0] === 'diagnostic' && parts.length >= 4) return parts[3] || null;
  if (parts[0] === 'registry' && parts.length >= 3) return parts[2] || null;
  return null;
}

/** The area segment (`use-of-english`, `reading`, …) of the atomic code, e.g. `eng.reading.inference.attitude` → `reading`. */
export function skillAreaFromKey(skillKey: string): string | null {
  const atomic = atomicCodeFromKey(skillKey);
  if (!atomic) return null;
  const segments = atomic.split('.');
  return segments.length >= 2 ? segments[1] : null;
}

/**
 * Merge leaves that are the same atomic sub-skill under different key schemes. The strongest leaf
 * (best readiness, then most evidence) keeps its skill_key so review/practice stay governed; the
 * evidence count, question sets and examples are pooled for display.
 */
export function mergeLeavesAcrossSchemes(recommendations: InterventionRecommendation[]): RollupLeaf[] {
  const byAtomic = new Map<string, InterventionRecommendation[]>();
  const passthrough: RollupLeaf[] = [];
  recommendations.forEach((item) => {
    const atomic = atomicCodeFromKey(item.skill_key);
    if (!atomic) { passthrough.push(item); return; }
    const key = `${norm(item.subject)}|${atomic}`;
    const bucket = byAtomic.get(key) || [];
    bucket.push(item);
    byAtomic.set(key, bucket);
  });
  const merged: RollupLeaf[] = [];
  byAtomic.forEach((items) => {
    if (items.length === 1) { merged.push(items[0]); return; }
    const base = items.reduce(bestOf);
    const others = items.filter((item) => item !== base);
    merged.push({
      ...base,
      evidence_items: items.reduce((sum, item) => sum + (item.evidence_items || 0), 0),
      focus_occurrences: items.reduce((sum, item) => sum + (item.focus_occurrences || 0), 0),
      last_observed_at: items.map((item) => item.last_observed_at).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0],
      priority: items.some((item) => item.priority === 'high') ? 'high' : base.priority,
      exact_question_ids: [...new Set(items.flatMap((item) => item.exact_question_ids || []))],
      available_exact_questions: Math.max(...items.map((item) => item.available_exact_questions || 0)),
      diagnostic_targets: [...new Set(items.flatMap((item) => item.diagnostic_targets || []))],
      evidence_examples: [base, ...others].flatMap((item) => item.evidence_examples || []),
      merged_skill_keys: items.map((item) => item.skill_key),
    });
  });
  return [...merged, ...passthrough];
}

export function describeUnlock(group: Pick<SkillRollupGroup, 'area' | 'evidenceItems'>, threshold: number): string | null {
  const needed = threshold - group.evidenceItems;
  if (needed <= 0) return null;
  const task = (group.area && areaTaskNames[group.area]) || 'assessed task';
  const items = needed === 1 ? 'One more qualifying assessed item' : `${needed} more qualifying assessed items`;
  return `${items} in this skill — typically one more ${task} — would make this reviewable.`;
}


export function rollUpRecommendations(
  recommendations: InterventionRecommendation[],
  options: { evidenceThreshold?: number } = {},
): SkillRollupGroup[] {
  const threshold = options.evidenceThreshold ?? DEFAULT_ROLLUP_EVIDENCE_THRESHOLD;
  const groups = new Map<string, RollupLeaf[]>();

  mergeLeavesAcrossSchemes(recommendations).forEach((item) => {
    // Primary skill: the topic label for diagnostic keys, else the skill itself.
    const primary = item.topic && item.topic.trim() ? item.topic : item.skill;
    const key = `${norm(item.subject)}|${norm(primary)}`;
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  });

  const result: SkillRollupGroup[] = [];
  groups.forEach((leaves, key) => {
    const anchor = leaves.reduce(bestOf);
    const evidenceItems = leaves.reduce((sum, leaf) => sum + (leaf.evidence_items || 0), 0);
    const leafBest = anchor.readiness;
    let readiness: RollupReadiness = leafBest;
    let promotedByRollup = false;
    if (leafBest === 'collect_evidence' && evidenceItems >= threshold) {
      readiness = 'review_evidence';
      promotedByRollup = true;
    }

    const area = skillAreaFromKey(anchor.skill_key);
    const exactFromAnchor = anchor.exact_question_ids || [];
    const exactFromSiblings = leaves
      .filter((leaf) => leaf !== anchor)
      .flatMap((leaf) => leaf.exact_question_ids || []);
    const exactQuestionIds = [...new Set([...exactFromAnchor, ...exactFromSiblings])];
    const lastObservedAt = leaves
      .map((leaf) => leaf.last_observed_at)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    const priority = leaves.some((leaf) => leaf.priority === 'high') ? 'high'
      : leaves.some((leaf) => leaf.priority === 'medium') ? 'medium' : (anchor.priority || 'low');
    const group: SkillRollupGroup = {
      key,
      subject: anchor.subject,
      area,
      areaLabel: area ? (areaLabels[area] || area) : null,
      primarySkill: anchor.topic && anchor.topic.trim() ? anchor.topic : anchor.skill,
      leaves: [...leaves].sort((a, b) => (b.evidence_items - a.evidence_items) || a.skill.localeCompare(b.skill)),
      anchor,
      readiness,
      promotedByRollup,
      evidenceItems,
      lastObservedAt,
      priority,
      availableExactQuestions: leaves.reduce((sum, leaf) => sum + (leaf.available_exact_questions || 0), 0),
      exactQuestionIds,
      recommendedQuestionIds: exactQuestionIds.slice(0, 6),
      diagnosticTargets: [...new Set(leaves.flatMap((leaf) => leaf.diagnostic_targets || []))],
      unlockHint: null,
    };
    group.unlockHint = readiness === 'collect_evidence' ? describeUnlock(group, threshold) : null;
    result.push(group);
  });

  return result.sort((a, b) => {
    const r = readinessRank[b.readiness] - readinessRank[a.readiness];
    if (r !== 0) return r;
    if (b.evidenceItems !== a.evidenceItems) return b.evidenceItems - a.evidenceItems;
    return a.primarySkill.localeCompare(b.primarySkill);
  });
}

/**
 * A recommendation to hand to the targeted-practice workspace for a group: the anchor leaf
 * (which carries the governed skill_key and professional review), with the practice set widened
 * to exact matches from sibling leaves. Only meaningful when the anchor is already 'ready'.
 */
export function practiceRecommendationForGroup(group: SkillRollupGroup): InterventionRecommendation {
  return {
    ...group.anchor,
    exact_question_ids: group.exactQuestionIds,
    recommended_question_ids: group.recommendedQuestionIds,
    available_exact_questions: group.availableExactQuestions,
    diagnostic_targets: group.diagnosticTargets.length ? group.diagnosticTargets : group.anchor.diagnostic_targets,
  };
}
