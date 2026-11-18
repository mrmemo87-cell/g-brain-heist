// Targeted practice is one-student work created from a learning intervention.
// The teacher portal shows it apart from class assignments, grouped by student,
// so a class list is not crowded with one-student tasks.

export type TargetedPracticeLink = {
  assignment_id: string;
  intervention_id?: string | null;
  student_id?: string | null;
  student_name?: string | null;
  diagnostic_targets?: string[] | null;
};

export type TargetedPracticeInfo = {
  student_id: string | null;
  student_name: string | null;
  diagnostic_targets: string[];
};

export type TargetedPracticeAssignment = {
  id: string;
  title?: string | null;
  topic_name?: string | null;
  student_count?: number;
  completed_count?: number;
  due_at?: string | null;
  assigned_at?: string | null;
  subject_group_name?: string | null;
  student_ids?: string[];
  targeted_practice?: TargetedPracticeInfo | null;
};

const TITLE_SUFFIX = /\s*·\s*Targeted Practice\s*$/i;

/** Title convention used when the authoritative link could not be loaded. */
const looksLikeTargetedPractice = (assignment: TargetedPracticeAssignment) =>
  (assignment.student_count || 0) <= 1 && TITLE_SUFFIX.test(assignment.title || '');

/**
 * Attach targeted-practice details to each assignment. `links` is the
 * authoritative list from the database; pass null when it could not be loaded
 * to fall back to the title convention.
 */
export const markTargetedPractice = <T extends TargetedPracticeAssignment>(
  assignments: T[],
  links: TargetedPracticeLink[] | null,
): T[] => {
  const byAssignment = new Map((links || []).map((link) => [link.assignment_id, link]));
  return assignments.map((assignment) => {
    const link = byAssignment.get(assignment.id);
    if (link) {
      return {
        ...assignment,
        targeted_practice: {
          student_id: link.student_id ?? assignment.student_ids?.[0] ?? null,
          student_name: link.student_name ?? null,
          diagnostic_targets: Array.isArray(link.diagnostic_targets) ? link.diagnostic_targets : [],
        },
      };
    }
    if (links === null && looksLikeTargetedPractice(assignment)) {
      return {
        ...assignment,
        targeted_practice: {
          student_id: assignment.student_ids?.[0] ?? null,
          student_name: null,
          diagnostic_targets: [],
        },
      };
    }
    return assignment;
  });
};

export const isTargetedPractice = (assignment: TargetedPracticeAssignment): boolean =>
  !!assignment.targeted_practice;

/** "Verb aspect · Targeted Practice" → "Verb aspect". */
export const targetedPracticeSkill = (assignment: TargetedPracticeAssignment): string =>
  (assignment.title || assignment.topic_name || 'Practice').replace(TITLE_SUFFIX, '').trim() || 'Practice';

export type TargetedPracticeStatus = 'completed' | 'overdue' | 'not-started';

export const targetedPracticeStatus = (
  assignment: TargetedPracticeAssignment,
  now: Date = new Date(),
): TargetedPracticeStatus => {
  if ((assignment.student_count || 0) > 0 && (assignment.completed_count || 0) >= (assignment.student_count || 0)) return 'completed';
  if (assignment.due_at) {
    const due = new Date(assignment.due_at);
    if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime()) return 'overdue';
  }
  return 'not-started';
};

export type TargetedPracticeStudentGroup<T extends TargetedPracticeAssignment> = {
  key: string;
  studentName: string;
  groupName: string | null;
  tasks: T[];
  openCount: number;
};

/**
 * One group per student, students with open tasks first (most open first),
 * then alphabetical. Tasks inside a group are newest first.
 */
export const groupTargetedPracticeByStudent = <T extends TargetedPracticeAssignment>(
  assignments: T[],
  resolveName: (studentId: string | null) => string | null = () => null,
  now: Date = new Date(),
): Array<TargetedPracticeStudentGroup<T>> => {
  const groups = new Map<string, TargetedPracticeStudentGroup<T>>();
  assignments.filter(isTargetedPractice).forEach((assignment) => {
    const info = assignment.targeted_practice as TargetedPracticeInfo;
    const studentName = resolveName(info.student_id) || info.student_name || 'Student';
    const key = info.student_id || `name:${studentName}`;
    const group = groups.get(key) || {
      key,
      studentName,
      groupName: assignment.subject_group_name || null,
      tasks: [],
      openCount: 0,
    };
    group.tasks.push(assignment);
    if (targetedPracticeStatus(assignment, now) !== 'completed') group.openCount += 1;
    if (!group.groupName && assignment.subject_group_name) group.groupName = assignment.subject_group_name;
    groups.set(key, group);
  });
  const time = (value?: string | null) => (value ? new Date(value).getTime() || 0 : 0);
  return [...groups.values()]
    .map((group) => ({ ...group, tasks: [...group.tasks].sort((a, b) => time(b.assigned_at) - time(a.assigned_at)) }))
    .sort((a, b) => b.openCount - a.openCount || a.studentName.localeCompare(b.studentName));
};
