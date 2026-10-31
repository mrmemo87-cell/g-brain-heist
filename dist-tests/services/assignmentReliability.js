/** Only retry transient failures, and only for server-idempotent assignment RPCs. */
export const isTransientAssignmentError = (error) => {
    const value = error;
    return ['57014', '40001', '40P01', 'PGRST000', 'PGRST001', 'PGRST002'].includes(value?.code || '')
        || [408, 429, 502, 503, 504].includes(value?.status || 0)
        || /failed to fetch|networkerror|network request failed|statement timeout|connection.*(closed|reset)|load failed/i.test(value?.message || '');
};
export async function retryAssignmentOperation(operation, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    for (let attempt = 0;; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            if (attempt >= 2 || !isTransientAssignmentError(error))
                throw error;
            await wait(400 * 2 ** attempt + Math.floor(Math.random() * 300));
        }
    }
}
/** Synchronous guard: a completed answer stays locked until an explicit transition. */
export class QuestionInputGuard {
    constructor() {
        this.busy = false;
        this.answered = false;
        this.blockedUntil = 0;
    }
    claim(now = Date.now()) {
        if (this.busy || this.answered || now < this.blockedUntil)
            return false;
        this.busy = true;
        return true;
    }
    finish(saved) { this.busy = false; this.answered = saved; }
    advance(now = Date.now()) {
        if (this.busy || !this.answered)
            return false;
        this.answered = false;
        this.blockedUntil = now + 500;
        return true;
    }
    reset() { this.busy = false; this.answered = false; this.blockedUntil = 0; }
}
export const assignmentDraftStorage = () => {
    try {
        return window.localStorage;
    }
    catch {
        return null;
    }
};
const key = (userId, assignmentId, questionId) => `bh:assignment-draft:v1:${userId}:${assignmentId}:${questionId}`;
export function readAssignmentDraft(storage, userId, assignmentId, questionId) {
    try {
        const value = JSON.parse(storage?.getItem(key(userId, assignmentId, questionId)) || 'null');
        if (!value || typeof value.answer !== 'string' || !Number.isFinite(value.timeTakenMs)
            || !Number.isFinite(value.savedAt) || value.savedAt <= 0) {
            storage?.removeItem(key(userId, assignmentId, questionId));
            return null;
        }
        return value;
    }
    catch {
        return null;
    }
}
export function writeAssignmentDraft(storage, userId, assignmentId, questionId, draft) {
    try {
        if (!storage)
            return false;
        storage.setItem(key(userId, assignmentId, questionId), JSON.stringify(draft));
        return true;
    }
    catch {
        return false;
    }
}
export function clearAssignmentDraft(storage, userId, assignmentId, questionId) {
    try {
        storage?.removeItem(key(userId, assignmentId, questionId));
    }
    catch { /* Private browsing may block storage. */ }
}
// Typing drafts: text a student is still composing (short answers). Kept separate from the
// pre-submit draft above so an unfinished sentence never shows as "ready to retry".
const typingKey = (userId, assignmentId, questionId) => `bh:assignment-typing:v1:${userId}:${assignmentId}:${questionId}`;
export const TYPING_DRAFT_MAX_CHARS = 2000;
export function readTypingDraft(storage, userId, assignmentId, questionId) {
    try {
        const value = storage?.getItem(typingKey(userId, assignmentId, questionId));
        return typeof value === 'string' && value.length > 0 ? value.slice(0, TYPING_DRAFT_MAX_CHARS) : null;
    }
    catch {
        return null;
    }
}
export function writeTypingDraft(storage, userId, assignmentId, questionId, text) {
    try {
        if (!storage)
            return false;
        if (!text.trim()) {
            storage.removeItem(typingKey(userId, assignmentId, questionId));
            return true;
        }
        storage.setItem(typingKey(userId, assignmentId, questionId), text.slice(0, TYPING_DRAFT_MAX_CHARS));
        return true;
    }
    catch {
        return false;
    }
}
export function clearTypingDraft(storage, userId, assignmentId, questionId) {
    try {
        storage?.removeItem(typingKey(userId, assignmentId, questionId));
    }
    catch { /* Private browsing may block storage. */ }
}
const submissionKey = (userId, assignmentId) => `bh:assignment-submit:v1:${userId}:${assignmentId}`;
export function setAssignmentSubmissionIntent(storage, userId, assignmentId, pending) {
    try {
        if (!storage)
            return false;
        if (pending)
            storage.setItem(submissionKey(userId, assignmentId), 'pending');
        else
            storage.removeItem(submissionKey(userId, assignmentId));
        return true;
    }
    catch {
        return false;
    }
}
export function hasAssignmentSubmissionIntent(storage, userId, assignmentId) {
    try {
        return storage?.getItem(submissionKey(userId, assignmentId)) === 'pending';
    }
    catch {
        return false;
    }
}
