export type IeltsExamLifecycleState = 'draft' | 'scheduled' | 'live_now' | 'paused' | 'ended' | 'archived';

export interface IeltsExamLifecycleMeta {
  state: IeltsExamLifecycleState;
  label: string;
  description: string;
  badgeClass: string;
}

const LIFECYCLE_META: Record<IeltsExamLifecycleState, Omit<IeltsExamLifecycleMeta, 'state'>> = {
  draft: {
    label: 'Draft',
    description: 'Teachers can still configure the exam. Students cannot start yet.',
    badgeClass: 'bg-slate-100 text-slate-700 ring-slate-300',
  },
  scheduled: {
    label: 'Scheduled',
    description: 'Awaiting confirmed launch. Students cannot start yet.',
    badgeClass: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  },
  live_now: {
    label: 'Live now',
    description: 'Students can start or continue the exam now.',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  paused: {
    label: 'Paused',
    description: 'Teacher paused the exam. Students should wait for resume.',
    badgeClass: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  ended: {
    label: 'Ended',
    description: 'The exam window is over. Students cannot start new attempts.',
    badgeClass: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  archived: {
    label: 'Archived',
    description: 'Hidden from day-to-day pilot operations.',
    badgeClass: 'bg-zinc-100 text-zinc-700 ring-zinc-300',
  },
};

const parseTime = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getIeltsExamLifecycleMeta = (state: IeltsExamLifecycleState): IeltsExamLifecycleMeta => ({
  state,
  ...LIFECYCLE_META[state],
});

export const resolveIeltsExamLifecycleState = (
  rawStatus?: string | null,
  startsAt?: string | null,
  endsAt?: string | null,
  nowMs = Date.now(),
): IeltsExamLifecycleState => {
  const normalized = (rawStatus ?? '').toLowerCase().trim();
  if (normalized === 'archived') return 'archived';
  if (normalized === 'paused') return 'paused';
  if (['ended', 'closed', 'complete', 'completed'].includes(normalized)) return 'ended';
  if (normalized === 'draft') return 'draft';
  // Scheduled is an explicit waiting state. Reaching starts_at does not make an
  // exam live; only the confirmed server-side launch transition may do that.
  if (normalized === 'scheduled') {
    const scheduledEndMs = parseTime(endsAt);
    return scheduledEndMs !== null && nowMs >= scheduledEndMs ? 'ended' : 'scheduled';
  }

  const startMs = parseTime(startsAt);
  const endMs = parseTime(endsAt);
  if (endMs !== null && nowMs >= endMs) return 'ended';
  if (startMs !== null && nowMs < startMs) return 'scheduled';
  if (['live', 'live_now', 'started', 'in_progress', 'active'].includes(normalized)) return 'live_now';
  return normalized ? 'scheduled' : 'draft';
};

export const resolveIeltsExamLifecycleMeta = (
  rawStatus?: string | null,
  startsAt?: string | null,
  endsAt?: string | null,
  nowMs = Date.now(),
): IeltsExamLifecycleMeta => getIeltsExamLifecycleMeta(resolveIeltsExamLifecycleState(rawStatus, startsAt, endsAt, nowMs));

export const formatIeltsCountdown = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

export const getIeltsAttemptOperationalLabel = (status?: string | null, hasConnectionIssue = false): string => {
  if (hasConnectionIssue) return 'Possible connection issue';
  const normalized = (status ?? '').toLowerCase();
  if (!normalized || normalized === 'assigned' || normalized === 'not_started') return 'Not started';
  if (normalized === 'submitted' || normalized === 'auto_submitted') return 'Submitted';
  if (normalized === 'in_progress' || normalized === 'started') return 'Active';
  if (normalized === 'paused') return 'Paused';
  return normalized.replace(/_/g, ' ');
};

export type IeltsStudentExamSyncState = 'active' | 'paused' | 'teacher_submitted' | 'voided' | 'ended' | 'not_in_progress';

const normalizeExamStatus = (status?: string | null): string => (status ?? '').toLowerCase().trim();

export interface IeltsStudentStartEligibility {
  allowed?: boolean | null;
  assignmentId?: string | null;
  eventStatus?: string | null;
  hasAttempt: boolean;
  isSubmitted: boolean;
  isBeforeStart: boolean;
  isAfterExamWindow: boolean;
  isPaused: boolean;
}

/**
 * Client-side defense in depth for the start button. The database remains the
 * authority, but a stale or malformed bootstrap response must never present a
 * scheduled exam as startable before the confirmed launch transition.
 */
export const canStartIeltsExamAttempt = ({
  allowed,
  assignmentId,
  eventStatus,
  hasAttempt,
  isSubmitted,
  isBeforeStart,
  isAfterExamWindow,
  isPaused,
}: IeltsStudentStartEligibility): boolean => (
  Boolean(allowed)
  && Boolean(assignmentId)
  && normalizeExamStatus(eventStatus) === 'live'
  && !hasAttempt
  && !isSubmitted
  && !isBeforeStart
  && !isAfterExamWindow
  && !isPaused
);

export const isIeltsExamEventPaused = (eventStatus?: string | null, reason?: string | null): boolean => (
  normalizeExamStatus(eventStatus) === 'paused' || normalizeExamStatus(reason) === 'exam_paused'
);

export const isIeltsTerminalAttemptStatus = (status?: string | null): boolean => (
  ['submitted', 'auto_submitted', 'force_submitted', 'void', 'voided', 'locked', 'not_in_progress'].includes(normalizeExamStatus(status))
);

export const isIeltsTeacherSubmittedStatus = (status?: string | null): boolean => (
  ['submitted', 'auto_submitted', 'force_submitted'].includes(normalizeExamStatus(status))
);

export const isIeltsVoidedAttemptStatus = (status?: string | null, reason?: string | null): boolean => (
  ['void', 'voided'].includes(normalizeExamStatus(status)) || normalizeExamStatus(reason) === 'assignment_void'
);

export const resolveIeltsStudentExamSyncState = (
  attemptStatus?: string | null,
  eventStatus?: string | null,
  reason?: string | null,
): IeltsStudentExamSyncState => {
  if (isIeltsVoidedAttemptStatus(attemptStatus, reason)) return 'voided';
  if (isIeltsTeacherSubmittedStatus(attemptStatus)) return 'teacher_submitted';
  if (normalizeExamStatus(attemptStatus) === 'not_in_progress' || normalizeExamStatus(attemptStatus) === 'locked') return 'not_in_progress';
  if (isIeltsExamEventPaused(eventStatus, reason)) return 'paused';
  if (['ended', 'closed', 'complete', 'completed'].includes(normalizeExamStatus(eventStatus))) return 'ended';
  return 'active';
};

export const getIeltsStudentExamSyncMessage = (state: IeltsStudentExamSyncState): string | null => {
  if (state === 'teacher_submitted') return 'Your exam has been submitted by your teacher.';
  if (state === 'voided') return 'This attempt was voided by the teacher.';
  if (state === 'paused') return 'This exam is paused by the teacher.';
  if (state === 'not_in_progress') return 'Your exam is no longer in progress.';
  if (state === 'ended') return 'This IELTS exam is closed.';
  return null;
};

export const shouldIeltsAutosaveRun = (state: IeltsStudentExamSyncState): boolean => state === 'active';
