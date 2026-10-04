import type { StudentAcademicProfile } from '../../services/studentAcademicProfileService';

type Evidence = StudentAcademicProfile['timeline'][number];
const assignmentSource = (source: string) => ['assignment_result', 'registry_verified_assignment'].includes(source);
export const assessmentKey = (item: Evidence) => `${item.source_type}:${item.source_id || item.id}`;
export const skillEvidenceKey = (item: Pick<Evidence, 'subject' | 'skill' | 'subskill'>) =>
  `${item.subject.trim().toLowerCase()}|${item.skill.toLowerCase()}|${String(item.subskill || '').toLowerCase()}`;

/** Keep source assessments separate; questions within one assessment are not repeated assessments. */
export const aggregateAssessmentEvidence = (items: Evidence[]): Evidence[] => {
  const groups = new Map<string, Evidence[]>();
  for (const item of items) {
    const key = assignmentSource(item.source_type) ? `${assessmentKey(item)}:${skillEvidenceKey(item)}` : item.id;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.values()].map((members) => {
    const latest = [...members].sort((a, b) => b.observed_at.localeCompare(a.observed_at) || a.id.localeCompare(b.id))[0];
    if (!assignmentSource(latest.source_type)) return latest;
    const count = members.reduce((sum, item) => sum + item.evidence_count, 0);
    const allScored = members.every((item) => item.evidence_percentage != null && Number.isFinite(Number(item.evidence_percentage)));
    const score = allScored && count > 0 ? members.reduce((sum, item) => sum + Number(item.evidence_percentage) * item.evidence_count, 0) / count : null;
    const hasCounts = members.every((item) => typeof item.evidence?.['correct'] === 'number' && typeof item.evidence?.['incorrect'] === 'number');
    const correct = hasCounts ? members.reduce((sum, item) => sum + Number(item.evidence?.['correct']), 0) : null;
    const incorrect = hasCounts ? members.reduce((sum, item) => sum + Number(item.evidence?.['incorrect']), 0) : null;
    const exactScore = correct != null && incorrect != null && correct + incorrect > 0 ? 100 * correct / (correct + incorrect) : score;
    return { ...latest, id: `${assessmentKey(latest)}:${skillEvidenceKey(latest)}`, evidence_count: count,
      evidence_percentage: exactScore == null ? null : Math.round(exactScore * 100) / 100,
      observation_type: exactScore == null ? latest.observation_type : exactScore < 60 ? 'focus' as const : exactScore >= 80 ? 'strength' as const : 'developing' as const,
      evidence: { ...latest.evidence, correct, incorrect, assessment_items: members,
        focus_signature: [...new Set(members.map((item) => String(item.evidence?.['evidence_focus_code'] || item.skill)))].sort().join('|') },
    };
  }).sort((a, b) => b.observed_at.localeCompare(a.observed_at) || a.id.localeCompare(b.id));
};

export const assessmentResultLabel = (item: Evidence) => {
  const correct = item.evidence?.['correct'];
  const incorrect = item.evidence?.['incorrect'];
  if (typeof correct === 'number' && typeof incorrect === 'number') return `${correct}/${correct + incorrect} correct`;
  return item.evidence_percentage == null ? 'Result not scored' : `${Math.round(item.evidence_percentage)}%`;
};

export const assessmentSnapshot = (profile: StudentAcademicProfile, evidence: Evidence[]) => {
  const latest = new Map<string, Evidence>();
  for (const item of evidence) if (!latest.has(skillEvidenceKey(item))) latest.set(skillEvidenceKey(item), item);
  const rows = [...latest.values()].filter((item) => assignmentSource(item.source_type) && item.evidence_percentage != null);
  const priorities = rows.filter((item) => Number(item.evidence_percentage) < 60)
    .sort((a, b) => b.evidence_count - a.evidence_count || Number(a.evidence_percentage) - Number(b.evidence_percentage)).slice(0, 3);
  const positive = rows.filter((item) => Number(item.evidence_percentage) >= 80).sort((a, b) => b.evidence_count - a.evidence_count).slice(0, 3);
  const dates = new Set(evidence.map((item) => item.observed_at.slice(0, 10)));
  const parts = [profile.summary.completed_assignments ? `${profile.summary.completed_assignments} completed assignment${profile.summary.completed_assignments === 1 ? '' : 's'}; average ${profile.summary.assignment_average == null ? 'not available' : `${Math.round(profile.summary.assignment_average)}%`}.` : 'No completed assignment results in this period.'];
  if (priorities.length) parts.push(`Check next: ${priorities.map((item) => `${item.subskill || item.skill} (${assessmentResultLabel(item)})`).join('; ')}.`);
  if (positive.length) parts.push(`Positive initial results: ${positive.map((item) => `${item.subskill || item.skill} (${assessmentResultLabel(item)})`).join('; ')}.`);
  if (dates.size === 1) parts.push('This is a starting point. Further assessment dates are needed to establish progress or consistent strengths.');
  return { text: parts.join(' '), priorities, positive, baseline: dates.size <= 1 };
};
