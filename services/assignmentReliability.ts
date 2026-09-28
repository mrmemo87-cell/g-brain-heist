/** Only retry transient failures, and only for server-idempotent assignment RPCs. */
export const isTransientAssignmentError = (error: unknown): boolean => {
  const value = error as { code?: string; message?: string; status?: number } | null;
  return ['57014', '40001', '40P01', 'PGRST000', 'PGRST001', 'PGRST002'].includes(value?.code || '')
    || [408, 429, 502, 503, 504].includes(value?.status || 0)
    || /failed to fetch|networkerror|network request failed|statement timeout|connection.*(closed|reset)|load failed/i.test(value?.message || '');
};

export async function retryAssignmentOperation<T>(
  operation: () => PromiseLike<T>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); } catch (error) {
      if (attempt >= 2 || !isTransientAssignmentError(error)) throw error;
      await wait(400 * 2 ** attempt + Math.floor(Math.random() * 300));
    }
  }
}

/** Synchronous guard: a completed answer stays locked until an explicit transition. */
export class QuestionInputGuard {
  private busy = false;
  private answered = false;
  private blockedUntil = 0;
  claim(now = Date.now()): boolean {
    if (this.busy || this.answered || now < this.blockedUntil) return false;
    this.busy = true;
    return true;
  }
  finish(saved: boolean) { this.busy = false; this.answered = saved; }
  advance(now = Date.now()): boolean {
    if (this.busy || !this.answered) return false;
    this.answered = false;
    this.blockedUntil = now + 500;
    return true;
  }
  reset() { this.busy = false; this.answered = false; this.blockedUntil = 0; }
}

export type AssignmentDraft = { answer: string; timeTakenMs: number; savedAt: number };
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const assignmentDraftStorage = (): DraftStorage | null => {
  try { return window.localStorage; } catch { return null; }
};
const key = (userId: string, assignmentId: string, questionId: string) =>
  `bh:assignment-draft:v1:${userId}:${assignmentId}:${questionId}`;

export function readAssignmentDraft(storage: DraftStorage | null, userId: string, assignmentId: string, questionId: string): AssignmentDraft | null {
  try {
    const value = JSON.parse(storage?.getItem(key(userId, assignmentId, questionId)) || 'null');
    if (!value || typeof value.answer !== 'string' || !Number.isFinite(value.timeTakenMs)
      || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > 7 * 86400000) {
      storage?.removeItem(key(userId, assignmentId, questionId));
      return null;
    }
    return value;
  } catch { return null; }
}
export function writeAssignmentDraft(storage: DraftStorage | null, userId: string, assignmentId: string, questionId: string, draft: AssignmentDraft): boolean {
  try { if (!storage) return false; storage.setItem(key(userId, assignmentId, questionId), JSON.stringify(draft)); return true; } catch { return false; }
}
export function clearAssignmentDraft(storage: DraftStorage | null, userId: string, assignmentId: string, questionId: string) {
  try { storage?.removeItem(key(userId, assignmentId, questionId)); } catch { /* Private browsing may block storage. */ }
}
