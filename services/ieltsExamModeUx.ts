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
    description: 'Ready for students, but the start time has not arrived.',
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

  const startMs = parseTime(startsAt);
  const endMs = parseTime(endsAt);
  if (endMs !== null && nowMs >= endMs) return 'ended';
  if (startMs !== null && nowMs < startMs) return 'scheduled';
  if (['live', 'live_now', 'started', 'in_progress', 'active', 'scheduled'].includes(normalized)) return 'live_now';
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
