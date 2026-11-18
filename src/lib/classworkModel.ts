// Model behind the teacher Classwork view: one grid of students against class assignments (the old collective
// report, always open) and one timeline per student. Pure functions so the wording and counting can be tested.

export type ClassworkAssignment = {
  id: string;
  title?: string | null;
  topic_name?: string | null;
  subject_name?: string | null;
  assigned_at?: string | null;
  due_at?: string | null;
  student_count?: number;
  completed_count?: number;
  student_ids?: string[];
  subject_group_id?: string | null;
  subject_group_name?: string | null;
  batch?: string | null;
  assignment_mode?: 'batch' | 'custom';
  publish_status?: 'draft' | 'scheduled' | 'published';
  targeted_practice?: { student_id: string | null } | null;
};

export type ClassworkResult = { student_id: string; accuracy: number; completed_at?: string | null };
export type ClassworkResults = Record<string, ClassworkResult[] | undefined>;

export type ClassworkGroup = { id: string; name: string; studentIds: string[]; classCodes?: string[] };

export type ClassworkCell =
  | { kind: 'score'; accuracy: number }
  | { kind: 'missing' }
  | { kind: 'not-set' };

export type ClassworkColumn = {
  assignment: ClassworkAssignment;
  title: string;
  setCount: number;
  doneCount: number;
  average: number | null;
  pastDue: boolean;
};

export type ClassworkRow = {
  studentId: string;
  name: string;
  cells: ClassworkCell[];
  doneCount: number;
  setCount: number;
  average: number | null;
  missingCount: number;
  openTargeted: number;
};

export type ClassworkGrid = { columns: ClassworkColumn[]; rows: ClassworkRow[] };

const time = (value?: string | null) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};
const titleOf = (a: ClassworkAssignment) => a.title || a.topic_name || 'Untitled assignment';
const isLive = (a: ClassworkAssignment, now: Date) =>
  (a.publish_status ?? 'published') !== 'draft' && time(a.assigned_at) <= now.getTime();
const mean = (values: number[]) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null);

/** Class assignments (never targeted practice) that belong to a group, newest first. */
export function assignmentsForGroup<T extends ClassworkAssignment>(assignments: T[], group: ClassworkGroup): T[] {
  const codes = new Set((group.classCodes ?? []).map((code) => code.trim().toLowerCase()).filter(Boolean));
  return assignments
    .filter((a) => !a.targeted_practice)
    .filter((a) => (a.subject_group_id
      ? a.subject_group_id === group.id
      : a.assignment_mode !== 'custom' && !!a.batch && codes.has(a.batch.trim().toLowerCase())))
    .sort((a, b) => time(b.assigned_at) - time(a.assigned_at));
}

/**
 * Was this assignment set for this student? A recorded result always counts. Without a recipient list the
 * assignment is treated as set for the whole group.
 */
const wasSet = (a: ClassworkAssignment, studentId: string, hasResult: boolean) =>
  hasResult || !Array.isArray(a.student_ids) || a.student_ids.length === 0 || a.student_ids.includes(studentId);

export function buildClassworkGrid(input: {
  group: ClassworkGroup;
  assignments: ClassworkAssignment[];
  results: ClassworkResults;
  nameOf: (studentId: string) => string;
  now?: Date;
}): ClassworkGrid {
  const now = input.now ?? new Date();
  const classAssignments = assignmentsForGroup(input.assignments, input.group).filter((a) => isLive(a, now));
  const scoreMaps = classAssignments.map((a) => new Map((input.results[a.id] ?? []).map((r) => [r.student_id, r.accuracy])));
  const targetedOpen = new Map<string, number>();
  input.assignments.forEach((a) => {
    const studentId = a.targeted_practice?.student_id;
    if (!studentId || !isLive(a, now)) return;
    if ((a.completed_count || 0) >= Math.max(1, a.student_count || 1)) return;
    targetedOpen.set(studentId, (targetedOpen.get(studentId) || 0) + 1);
  });

  const rows: ClassworkRow[] = input.group.studentIds.map((studentId) => {
    const cells = classAssignments.map((a, i): ClassworkCell => {
      const accuracy = scoreMaps[i].get(studentId);
      if (accuracy !== undefined) return { kind: 'score', accuracy: Math.round(accuracy) };
      return wasSet(a, studentId, false) ? { kind: 'missing' } : { kind: 'not-set' };
    });
    const scores = cells.filter((c): c is { kind: 'score'; accuracy: number } => c.kind === 'score').map((c) => c.accuracy);
    const setCount = cells.filter((c) => c.kind !== 'not-set').length;
    return {
      studentId,
      name: input.nameOf(studentId),
      cells,
      doneCount: scores.length,
      setCount,
      average: mean(scores),
      missingCount: setCount - scores.length,
      openTargeted: targetedOpen.get(studentId) || 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const columns: ClassworkColumn[] = classAssignments.map((assignment, i) => {
    const cells = rows.map((row) => row.cells[i]);
    const scores = cells.filter((c): c is { kind: 'score'; accuracy: number } => c.kind === 'score').map((c) => c.accuracy);
    const setCount = cells.filter((c) => c.kind !== 'not-set').length;
    const due = time(assignment.due_at);
    return {
      assignment,
      title: titleOf(assignment),
      setCount,
      doneCount: scores.length,
      average: mean(scores),
      pastDue: due > 0 && due < now.getTime() && scores.length < setCount,
    };
  });
  return { columns, rows };
}

export type ClassworkAttention = {
  pastDue: number;
  mostMissing: { title: string; missing: number; set: number } | null;
  repeatMissing: { count: number; names: string[] };
};

/** The three things worth a teacher's attention first. Counts come straight from the grid. */
export function classworkAttention(grid: ClassworkGrid): ClassworkAttention {
  const mostMissing = grid.columns
    .map((c) => ({ title: c.title, missing: c.setCount - c.doneCount, set: c.setCount }))
    .filter((c) => c.missing > 0 && c.set > 1)
    .sort((a, b) => b.missing - a.missing)[0] ?? null;
  const repeat = grid.rows.filter((r) => r.missingCount >= 3).sort((a, b) => b.missingCount - a.missingCount);
  return {
    pastDue: grid.columns.filter((c) => c.pastDue).length,
    mostMissing,
    repeatMissing: { count: repeat.length, names: repeat.slice(0, 3).map((r) => r.name) },
  };
}

export type TimelineKind = 'class' | 'targeted';
export type TimelineStatus = 'done' | 'missing' | 'past-due' | 'not-started';
export type TimelineItem = {
  assignment: ClassworkAssignment;
  kind: TimelineKind;
  title: string;
  groupName: string | null;
  status: TimelineStatus;
  accuracy: number | null;
  date: string | null;
};

/** Everything set for one student, class work and targeted practice together, newest first. */
export function studentTimeline(input: {
  studentId: string;
  assignments: ClassworkAssignment[];
  results: ClassworkResults;
  now?: Date;
}): TimelineItem[] {
  const now = input.now ?? new Date();
  return input.assignments
    .filter((a) => isLive(a, now))
    .map((a): TimelineItem | null => {
      const result = (input.results[a.id] ?? []).find((r) => r.student_id === input.studentId);
      const targeted = !!a.targeted_practice;
      const set = targeted
        ? a.targeted_practice?.student_id === input.studentId || (a.student_ids ?? []).includes(input.studentId)
        : !!result || (Array.isArray(a.student_ids) && a.student_ids.includes(input.studentId));
      if (!set) return null;
      const due = time(a.due_at);
      const status: TimelineStatus = result
        ? 'done'
        : due > 0 && due < now.getTime()
          ? 'past-due'
          : targeted ? 'not-started' : 'missing';
      return {
        assignment: a,
        kind: targeted ? 'targeted' : 'class',
        title: titleOf(a).replace(/\s*·\s*Targeted Practice\s*$/i, ''),
        groupName: a.subject_group_name || a.batch || null,
        status,
        accuracy: result ? Math.round(result.accuracy) : null,
        date: result?.completed_at || a.assigned_at || null,
      };
    })
    .filter((item): item is TimelineItem => item !== null)
    .sort((a, b) => time(b.assignment.assigned_at) - time(a.assignment.assigned_at));
}

export const scoreBand = (accuracy: number): 'strong' | 'developing' | 'support' =>
  accuracy >= 80 ? 'strong' : accuracy >= 60 ? 'developing' : 'support';
