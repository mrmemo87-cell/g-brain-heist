import type { BatchLearningLoop, LearningState, LoopConstruct, LoopPractice } from '../../../services/ieltsBatchService';

/** Teacher-facing state names (Visual & UX Bible 13.2). Each is shown with "(provisional policy v1)". */
export const stateLabel: Record<LearningState, string> = {
  possible_difficulty: 'Possible difficulty',
  repeated_difficulty: 'Repeated difficulty',
  persistent_candidate: 'Still difficult after practice — confirm',
  difficulty_observed_again: 'Difficulty observed again',
  mixed: 'Mixed evidence — teacher review',
  improvement_observed: 'Improvement observed',
  improvement_sustained: 'Improvement sustained',
  possible_strength: 'Possible strength',
  repeated_strength: 'Repeated strength',
  no_concern: 'No concern in current evidence',
};

const difficulty = new Set<LearningState>(['persistent_candidate', 'repeated_difficulty', 'difficulty_observed_again', 'possible_difficulty', 'mixed']);
const improving = new Set<LearningState>(['improvement_observed', 'improvement_sustained']);

export interface StudentTargets { id: string; name: string; targets: LoopConstruct[] }
export interface SharedTarget { node_id: string; name: string; code: string; skill: string; students: { id: string; name: string }[]; extension: string | null; practice: LoopPractice[] }

/** Groups the server projection into the four weekly-loop groups (Diagnostic Bible 15B.5). At most two targets per student. */
export function groupLearningLoop(data: BatchLearningLoop, maxTargets = 2) {
  const needs: StudentTargets[] = [], improvingList: StudentTargets[] = [], stuck: StudentTargets[] = [], noEvidence: { id: string; name: string }[] = [];
  const shared = new Map<string, SharedTarget>();
  for (const s of data.students) {
    if (!s.has_evidence) { noEvidence.push({ id: s.id, name: s.name }); continue; }
    const targets = s.constructs.filter(c => difficulty.has(c.state));
    if (targets.length) needs.push({ id: s.id, name: s.name, targets: targets.slice(0, maxTargets) });
    const up = s.constructs.filter(c => improving.has(c.state));
    if (up.length) improvingList.push({ id: s.id, name: s.name, targets: up });
    const after = s.constructs.filter(c => c.state === 'persistent_candidate');
    if (after.length) stuck.push({ id: s.id, name: s.name, targets: after });
    for (const t of targets.slice(0, maxTargets)) {
      const entry = shared.get(t.node_id) ?? { node_id: t.node_id, name: t.name, code: t.code, skill: t.skill, students: [], extension: t.extension, practice: t.practice };
      entry.students.push({ id: s.id, name: s.name });
      shared.set(t.node_id, entry);
    }
  }
  const sharedTargets = [...shared.values()].sort((a, b) => b.students.length - a.students.length || a.name.localeCompare(b.name));
  return { needs, improving: improvingList, stuck, noEvidence, shared: sharedTargets, gaps: data.gaps };
}
