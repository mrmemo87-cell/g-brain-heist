import { useEffect, useState } from 'react';
import { learningWorkspace, type LearningAllocation } from '../../../../services/ieltsLearningService';
import { rpcIeltsPracticeStudentAssignments, type IeltsPracticeStudentAssignment } from '../../../../services/ieltsPracticeAssignmentService';

/**
 * One shared read of the student's work (targeted tasks and teacher assignment sets) for the IELTS student shell and
 * Home. Pages that mount together share one request, a tab switch within 15 seconds reuses it, and a retry forces a fresh one. Read-only.
 */
export type IeltsStudentWork = {
  tasks: LearningAllocation[] | null;
  tasksError: boolean;
  sets: IeltsPracticeStudentAssignment[] | null;
};

let state: IeltsStudentWork = { tasks: null, tasksError: false, sets: null };
let tasksInflight: Promise<void> | null = null;
let setsInflight: Promise<void> | null = null;
let tasksAt = 0;
let setsAt = 0;
const FRESH_MS = 15000;
const listeners = new Set<(s: IeltsStudentWork) => void>();
const publish = (next: Partial<IeltsStudentWork>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
};

export function loadIeltsStudentWork(force = false) {
  const now = Date.now();
  if (force || (!tasksInflight && (state.tasks === null || now - tasksAt > FRESH_MS))) {
    if (force) publish({ tasks: null, tasksError: false });
    tasksInflight = learningWorkspace()
      .then((w) => { tasksAt = Date.now(); publish({ tasks: w.allocations, tasksError: false }); })
      .catch(() => publish({ tasks: null, tasksError: true }))
      .finally(() => { setTimeout(() => { tasksInflight = null; }, 0); });
  }
  if (!setsInflight && (state.sets === null || now - setsAt > FRESH_MS)) {
    setsInflight = rpcIeltsPracticeStudentAssignments()
      .then((rows) => { setsAt = Date.now(); publish({ sets: rows }); })
      .catch(() => publish({ sets: [] }))
      .finally(() => { setTimeout(() => { setsInflight = null; }, 0); });
  }
}

export function useIeltsStudentWork() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    loadIeltsStudentWork();
    setSnapshot(state);
    return () => { listeners.delete(setSnapshot); };
  }, []);
  return { ...snapshot, reload: () => loadIeltsStudentWork(true) };
}

/** Feedback a student has opened at least once stops being "new" on Home. Kept on this device only. */
const SEEN_KEY = 'bh_ielts_seen_feedback';
export function seenFeedback(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
export function markFeedbackSeen(id: string) {
  try {
    const seen = seenFeedback();
    if (seen.has(id)) return;
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch { /* storage unavailable: feedback simply stays on Home */ }
}

export const openTargeted = (t: LearningAllocation) => t.status === 'assigned' || t.status === 'in_progress';
export const openSet = (a: IeltsPracticeStudentAssignment) => a.status !== 'closed' && a.student_status !== 'completed';

/** After a student opens a task its status may change, so the next Home or tab visit reads fresh data. */
export function invalidateIeltsStudentWork() { tasksAt = 0; setsAt = 0; }
