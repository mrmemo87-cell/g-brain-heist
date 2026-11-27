import { useEffect, useState } from 'react';
import { studentLearningWorkspace, type LearningAllocation } from '../../../../services/ieltsLearningService';
import { rpcIeltsPracticeStudentAssignments, type IeltsPracticeStudentAssignment } from '../../../../services/ieltsPracticeAssignmentService';
import { supabase } from '../../../../services/supabaseClient';

/**
 * One shared read of the student's work (targeted tasks and teacher assignment sets) for the IELTS student shell and
 * Home. Pages that mount together share one request, a tab switch within 15 seconds reuses it, and a retry forces a fresh one. Read-only.
 */
export type IeltsStudentWork = {
  tasks: LearningAllocation[] | null;
  tasksError: boolean;
  sets: IeltsPracticeStudentAssignment[] | null;
  /** Batch tasks queued by a teacher that appear once the Listening, Reading and Writing screeners are done. */
  waiting: number;
};

let state: IeltsStudentWork = { tasks: null, tasksError: false, sets: null, waiting: 0 };
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
    tasksInflight = studentLearningWorkspace()
      .then((w) => { tasksAt = Date.now(); publish({ tasks: w.allocations, tasksError: false, waiting: w.waiting }); })
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

/** `enabled` is false for learners without a school IELTS seat: they have no school work, so nothing is requested. */
export function useIeltsStudentWork(enabled = true) {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setSnapshot);
    loadIeltsStudentWork();
    setSnapshot(state);
    return () => { listeners.delete(setSnapshot); };
  }, [enabled]);
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

/**
 * The student's own Writing and Speaking practice that a teacher has finalized (most recent first). Practice
 * assignment reviews are not part of the targeted-task feed above, so without this Home said "0 Feedback" and
 * Journey said "Your feedback will appear here" while finalized reviews were waiting. Read-only; own rows via RLS.
 */
export type IeltsPracticeReview = { id: string; skill: 'writing' | 'speaking'; title: string; reviewed_at: string | null };

export async function loadIeltsPracticeReviews(): Promise<IeltsPracticeReview[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  const [writing, speaking] = await Promise.all([
    supabase.from('ielts_writing_attempts').select('id, task_id, reviewed_at').eq('user_id', userId).eq('review_status', 'finalized').order('reviewed_at', { ascending: false }).limit(20),
    supabase.from('ielts_speaking_attempts').select('id, task_id, reviewed_at').eq('user_id', userId).eq('review_status', 'finalized').order('reviewed_at', { ascending: false }).limit(20),
  ]);
  const ids = (rows: Array<{ task_id: unknown }>) => [...new Set(rows.map((r) => r.task_id).filter((v) => v != null))] as never[];
  const w = (writing.data ?? []) as Array<{ id: string; task_id: unknown; reviewed_at: string | null }>;
  const s = (speaking.data ?? []) as Array<{ id: string; task_id: unknown; reviewed_at: string | null }>;
  const [wTasks, sTasks] = await Promise.all([
    ids(w).length ? supabase.from('ielts_writing_tasks').select('id, title').in('id', ids(w)) : Promise.resolve({ data: [] }),
    ids(s).length ? supabase.from('ielts_speaking_tasks').select('id, part').in('id', ids(s)) : Promise.resolve({ data: [] }),
  ]);
  const wt = new Map(((wTasks.data ?? []) as Array<{ id: unknown; title: string | null }>).map((t) => [String(t.id), t.title ?? '']));
  // Writing from a computer rewrite of a mock has its own title ("… (computer rewrite)"); never fatal if unavailable.
  let rewriteTitles: Record<string, string> = {};
  if (w.length) {
    const labels = await supabase.rpc('rpc_ielts_writing_attempt_labels', { p_attempts: w.map((r) => r.id) });
    if (!labels.error && labels.data && typeof labels.data === 'object') rewriteTitles = labels.data as Record<string, string>;
  }
  const st = new Map(((sTasks.data ?? []) as Array<{ id: unknown; part: number | null }>).map((t) => [String(t.id), t.part ? `Speaking Part ${t.part}` : '']));
  return [
    ...w.map((r) => ({ id: r.id, skill: 'writing' as const, title: rewriteTitles[r.id] || wt.get(String(r.task_id)) || 'Writing practice', reviewed_at: r.reviewed_at })),
    ...s.map((r) => ({ id: r.id, skill: 'speaking' as const, title: st.get(String(r.task_id)) || 'Speaking practice', reviewed_at: r.reviewed_at })),
  ].sort((a, b) => String(b.reviewed_at ?? '').localeCompare(String(a.reviewed_at ?? '')));
}

export function useIeltsPracticeReviews(enabled = true): IeltsPracticeReview[] | null {
  const [reviews, setReviews] = useState<IeltsPracticeReview[] | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    loadIeltsPracticeReviews().then((r) => { if (alive) setReviews(r); }).catch(() => { if (alive) setReviews([]); });
    return () => { alive = false; };
  }, [enabled]);
  return reviews;
}
