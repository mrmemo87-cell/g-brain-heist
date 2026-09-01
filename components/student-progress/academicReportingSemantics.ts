import type {
  LearningObservationType,
  LearningStatus,
} from '../../services/studentAcademicProfileService';

export type ComparableTrendEvent = {
  observedAt: string;
  score: number;
  comparableKey: string;
};

export const isActiveSupportStatus = (status: LearningStatus): boolean =>
  status === 'new_focus' || status === 'recurring' || status === 'persistent';

export const isEvidenceToConfirmStatus = (status: LearningStatus): boolean =>
  status === 'insufficient_evidence';

export const isTeacherReviewStatus = (status: LearningStatus): boolean =>
  status === 'contradictory';

export const calendarDayKey = (value?: string | null): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
};

export const observationDisplayLabel = (type: LearningObservationType): string => {
  if (type === 'focus') return 'Needs support';
  if (type === 'strength') return 'Positive evidence';
  return 'Developing evidence';
};

export const evidenceConfirmationLabel = (latestType?: LearningObservationType | null): string => {
  if (latestType === 'strength') return 'Positive evidence · more evidence needed';
  if (latestType === 'developing') return 'Developing evidence · more evidence needed';
  if (latestType === 'focus') return 'Potential support signal · more evidence needed';
  return 'More evidence needed';
};

export const focusStatusLabel = (
  status: LearningStatus,
  latestType?: LearningObservationType | null,
  firstObservedAt?: string | null,
  lastObservedAt?: string | null,
): string => {
  switch (status) {
    case 'insufficient_evidence':
      return evidenceConfirmationLabel(latestType);
    case 'contradictory':
      return 'Teacher review needed';
    case 'new_focus':
      return 'New focus area';
    case 'recurring':
      return calendarDayKey(firstObservedAt) === calendarDayKey(lastObservedAt)
        ? 'Repeated focus area'
        : 'Recurring focus area';
    case 'persistent':
      return 'Persistent focus area';
    case 'improving':
      return 'Making progress';
    case 'resolved':
      return 'Now secure';
    case 'emerging_strength':
      return 'Emerging strength';
    case 'consistent_strength':
      return 'Established strength';
  }
};

export const reportingStatusTone = (
  status: LearningStatus,
  latestType?: LearningObservationType | null,
): 'critical' | 'focus' | 'improving' | 'resolved' | 'strong' | 'neutral' | 'review' => {
  if (status === 'contradictory') return 'review';
  if (status === 'persistent') return 'critical';
  if (status === 'new_focus' || status === 'recurring') return 'focus';
  if (status === 'insufficient_evidence') {
    return latestType === 'strength' ? 'strong' : latestType === 'focus' ? 'neutral' : 'neutral';
  }
  if (status === 'improving') return 'improving';
  if (status === 'resolved') return 'resolved';
  return 'strong';
};

export const comparableTrendSegments = <T extends ComparableTrendEvent>(events: T[]): Array<[T, T]> => {
  const ordered = [...events].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const bySkill = new Map<string, T[]>();
  ordered.forEach((event) => {
    const rows = bySkill.get(event.comparableKey) || [];
    rows.push(event);
    bySkill.set(event.comparableKey, rows);
  });
  const segments: Array<[T, T]> = [];
  bySkill.forEach((rows) => {
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (calendarDayKey(previous.observedAt) !== calendarDayKey(current.observedAt)) {
        segments.push([previous, current]);
      }
    }
  });
  return segments;
};

export const summarizeComparableTrend = (events: ComparableTrendEvent[]): string => {
  if (!events.length) return 'No evidence in this period';
  if (events.length === 1) return 'One evidence point so far';

  const bySkill = new Map<string, ComparableTrendEvent[]>();
  events.forEach((event) => {
    const rows = bySkill.get(event.comparableKey) || [];
    rows.push(event);
    bySkill.set(event.comparableKey, rows);
  });

  const deltas: number[] = [];
  bySkill.forEach((rows) => {
    const latestByDay = new Map<string, ComparableTrendEvent>();
    [...rows].sort((a, b) => a.observedAt.localeCompare(b.observedAt)).forEach((row) => {
      latestByDay.set(calendarDayKey(row.observedAt), row);
    });
    const distinctDays = [...latestByDay.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    if (distinctDays.length >= 2) {
      deltas.push(distinctDays[distinctDays.length - 1].score - distinctDays[0].score);
    }
  });

  if (!deltas.length) return 'Not enough comparable evidence yet';
  const movingUp = deltas.some((delta) => delta >= 10);
  const movingDown = deltas.some((delta) => delta <= -10);
  if (movingUp && movingDown) return 'Mixed movement across comparable skills';
  if (movingUp) return 'Comparable evidence shows positive movement';
  if (movingDown) return 'Recent comparable evidence needs attention';
  return 'Comparable evidence is broadly steady';
};

export const buildAcademicSnapshot = (input: {
  studentName: string;
  completedAssignments: number;
  supportLabels: string[];
  positiveEvidenceLabels: string[];
  teacherReviewCount: number;
}): string => {
  const name = input.studentName || 'This student';
  const sentences: string[] = [];
  if (input.completedAssignments < 3) {
    sentences.push(`${name} has limited completed-assignment evidence so far, so conclusions are kept deliberately cautious.`);
  } else {
    sentences.push(`${name}'s profile is based on ${input.completedAssignments} completed assignments plus qualified skill-level evidence.`);
  }
  if (input.supportLabels.length) {
    sentences.push(`The main current support area is ${input.supportLabels[0]}.`);
  } else {
    sentences.push('No current support area is established from the available evidence.');
  }
  if (input.positiveEvidenceLabels.length) {
    sentences.push(`${input.positiveEvidenceLabels[0]} shows positive recent evidence, but needs more evidence before it is treated as an established strength.`);
  }
  if (input.teacherReviewCount) {
    sentences.push(`${input.teacherReviewCount === 1 ? 'One area needs' : `${input.teacherReviewCount} areas need`} teacher review because the evidence points in different directions.`);
  }
  return sentences.join(' ');
};
