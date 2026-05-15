import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  rpcIeltsExamMonitoring,
  rpcIeltsExtendAttempt,
  rpcIeltsForceSubmitAttempt,
  rpcIeltsPauseExam,
  rpcIeltsResumeExam,
  rpcIeltsVoidAttempt,
  type IeltsExamMonitoringRow,
} from '../../../services/ieltsExamModeService';

type MonitorFilter = 'all' | 'not_started' | 'in_progress' | 'submitted' | 'offline' | 'incidents';
type ControlState = 'idle' | 'working';

const POLL_MS = 10_000;
const HEARTBEAT_STALE_SECONDS = 45;
const SAVE_STALE_SECONDS = 30;
const ALMOST_OVER_SECONDS = 300;

const statusLabels: Record<string, string> = {
  assigned: 'Not started',
  not_started: 'Not started',
  started: 'Started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  auto_submitted: 'Auto-submitted',
  locked: 'Locked',
  void: 'Void',
};

const filterLabels: Record<MonitorFilter, string> = {
  all: 'All',
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  offline: 'Offline / stale',
  incidents: 'Incidents',
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatSeconds = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
};

const secondsSince = (value: string | null | undefined, nowMs: number): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 1000));
};

const isSubmittedStatus = (status: string | null | undefined) => status === 'submitted' || status === 'auto_submitted';
const isNotStartedStatus = (status: string | null | undefined) => !status || status === 'assigned' || status === 'not_started';

const statusBadgeClass = (status: string | null | undefined): string => {
  if (isSubmittedStatus(status)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'in_progress' || status === 'started') return 'bg-blue-50 text-blue-700 ring-blue-200';
  if (status === 'void' || status === 'locked') return 'bg-slate-100 text-slate-700 ring-slate-300';
  return 'bg-amber-50 text-amber-700 ring-amber-200';
};

const getDisplayName = (row: IeltsExamMonitoringRow) => row.name || row.username || 'Unnamed student';

const IeltsExamMonitor: React.FC = () => {
  const { examEventId } = useParams<{ examEventId: string }>();
  const [rows, setRows] = useState<IeltsExamMonitoringRow[]>([]);
  const [filter, setFilter] = useState<MonitorFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [controlState, setControlState] = useState<ControlState>('idle');

  const loadMonitoring = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (!examEventId) return;
    if (mode === 'initial') setIsLoading(true);
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await rpcIeltsExamMonitoring(examEventId);
      setRows(data);
      setLastUpdatedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load IELTS exam monitoring.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [examEventId]);

  useEffect(() => {
    void loadMonitoring('initial');
    const timer = window.setInterval(() => void loadMonitoring('refresh'), POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadMonitoring]);

  const nowMs = Date.now();

  const rowHealth = useCallback((row: IeltsExamMonitoringRow) => {
    const heartbeatAge = secondsSince(row.last_heartbeat_at, nowMs);
    const heartbeatStale = (row.status === 'in_progress' || row.status === 'started') && (heartbeatAge === null || heartbeatAge > HEARTBEAT_STALE_SECONDS);
    const saveStale = row.status === 'in_progress' && row.last_save_age_seconds !== null && row.last_save_age_seconds !== undefined && row.last_save_age_seconds > SAVE_STALE_SECONDS;
    const timeAlmostOver = row.remaining_seconds !== null && row.remaining_seconds !== undefined && row.remaining_seconds > 0 && row.remaining_seconds < ALMOST_OVER_SECONDS;
    const hasIncidents = Number(row.incident_count ?? 0) > 0;
    return { heartbeatAge, heartbeatStale, saveStale, timeAlmostOver, hasIncidents };
  }, [nowMs]);

  const summary = useMemo(() => {
    const total = rows.length;
    const notStarted = rows.filter((row) => isNotStartedStatus(row.status)).length;
    const inProgress = rows.filter((row) => row.status === 'in_progress' || row.status === 'started').length;
    const submitted = rows.filter((row) => isSubmittedStatus(row.status)).length;
    const incidents = rows.filter((row) => Number(row.incident_count ?? 0) > 0).length;
    const stale = rows.filter((row) => rowHealth(row).heartbeatStale).length;
    return { total, notStarted, inProgress, submitted, incidents, stale };
  }, [rowHealth, rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const health = rowHealth(row);
    if (filter === 'not_started') return isNotStartedStatus(row.status);
    if (filter === 'in_progress') return row.status === 'in_progress' || row.status === 'started';
    if (filter === 'submitted') return isSubmittedStatus(row.status);
    if (filter === 'offline') return health.heartbeatStale;
    if (filter === 'incidents') return health.hasIncidents;
    return true;
  }), [filter, rowHealth, rows]);

  const runExamControl = async (action: 'pause' | 'resume') => {
    if (!examEventId) return;
    const message = action === 'pause'
      ? 'Pause this IELTS exam for all students? Autosave may continue while the exam is paused.'
      : 'Resume this IELTS exam and allow students to continue?';
    if (!window.confirm(message)) return;
    const reason = window.prompt('Optional reason for the audit log:', action === 'pause' ? 'Teacher paused exam' : 'Teacher resumed exam');
    setControlState('working');
    setError(null);
    try {
      if (action === 'pause') {
        await rpcIeltsPauseExam({ examEventId, reason });
      } else {
        await rpcIeltsResumeExam({ examEventId, reason });
      }
      await loadMonitoring('refresh');
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : `Failed to ${action} exam.`);
    } finally {
      setControlState('idle');
    }
  };

  const runAttemptControl = async (row: IeltsExamMonitoringRow, action: 'extend' | 'force_submit' | 'void') => {
    if (!row.attempt_id) {
      setError('This student does not have an active attempt yet, so attempt controls are unavailable.');
      return;
    }

    const studentLabel = getDisplayName(row);
    if (action === 'extend') {
      const minutesRaw = window.prompt(`Extend ${studentLabel}'s attempt by how many minutes?`, '5');
      if (!minutesRaw) return;
      const extraMinutes = Number.parseInt(minutesRaw, 10);
      if (!Number.isFinite(extraMinutes) || extraMinutes <= 0) {
        setError('Extension minutes must be a positive number.');
        return;
      }
      const reason = window.prompt('Optional reason for the audit log:', `Extended ${studentLabel}'s IELTS exam`);
      setControlState('working');
      setError(null);
      try {
        await rpcIeltsExtendAttempt({ attemptId: row.attempt_id, extraMinutes, reason });
        await loadMonitoring('refresh');
      } catch (controlError) {
        setError(controlError instanceof Error ? controlError.message : 'Failed to extend attempt.');
      } finally {
        setControlState('idle');
      }
      return;
    }

    const confirmMessage = action === 'force_submit'
      ? `Force submit ${studentLabel}'s current saved answers?`
      : `Void ${studentLabel}'s attempt? This should only be used for invalid attempts.`;
    if (!window.confirm(confirmMessage)) return;
    const reason = window.prompt('Required/optional reason for the audit log:', action === 'force_submit' ? 'Teacher force submitted attempt' : 'Teacher voided attempt');
    setControlState('working');
    setError(null);
    try {
      if (action === 'force_submit') {
        await rpcIeltsForceSubmitAttempt({ attemptId: row.attempt_id, reason });
      } else {
        await rpcIeltsVoidAttempt({ attemptId: row.attempt_id, reason });
      }
      await loadMonitoring('refresh');
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : `Failed to ${action.replace('_', ' ')}.`);
    } finally {
      setControlState('idle');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-5 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">IELTS Exam Monitoring</p>
            <h1 className="text-2xl font-semibold text-slate-950">Controlled Exam Monitor</h1>
            <p className="mt-1 text-sm text-slate-600">Live roster, heartbeat, autosave, incident, and emergency controls for this exam.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadMonitoring('refresh')}
              disabled={isRefreshing}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
            <button
              type="button"
              onClick={() => void runExamControl('pause')}
              disabled={controlState === 'working'}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Pause exam
            </button>
            <button
              type="button"
              onClick={() => void runExamControl('resume')}
              disabled={controlState === 'working'}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Resume exam
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <SummaryCard label="Assigned" value={summary.total} />
          <SummaryCard label="Not started" value={summary.notStarted} tone="amber" />
          <SummaryCard label="In progress" value={summary.inProgress} tone="blue" />
          <SummaryCard label="Submitted" value={summary.submitted} tone="green" />
          <SummaryCard label="Stale heartbeat" value={summary.stale} tone={summary.stale > 0 ? 'red' : 'slate'} />
          <SummaryCard label="With incidents" value={summary.incidents} tone={summary.incidents > 0 ? 'red' : 'slate'} />
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Roster</h2>
              <p className="text-sm text-slate-500">
                Polling every 10 seconds. Last updated {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(filterLabels) as MonitorFilter[]).map((nextFilter) => (
                <button
                  key={nextFilter}
                  type="button"
                  onClick={() => setFilter(nextFilter)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filter === nextFilter ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {filterLabels[nextFilter]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">Loading monitoring roster…</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">No students match this filter.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Timer</th>
                    <th className="px-4 py-3">Heartbeat</th>
                    <th className="px-4 py-3">Save</th>
                    <th className="px-4 py-3">Incidents</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((row) => (
                    <RosterRow key={`${row.student_id}-${row.attempt_id ?? 'no-attempt'}`} row={row} health={rowHealth(row)} onAction={runAttemptControl} busy={controlState === 'working'} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 lg:hidden">
              {filteredRows.map((row) => (
                <RosterCard key={`${row.student_id}-${row.attempt_id ?? 'no-attempt'}`} row={row} health={rowHealth(row)} onAction={runAttemptControl} busy={controlState === 'working'} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: number; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'red' }> = ({ label, value, tone = 'slate' }) => {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-950',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
};

const RosterRow: React.FC<{
  row: IeltsExamMonitoringRow;
  health: ReturnType<typeof buildHealthShape>;
  onAction: (row: IeltsExamMonitoringRow, action: 'extend' | 'force_submit' | 'void') => Promise<void>;
  busy: boolean;
}> = ({ row, health, onAction, busy }) => (
  <tr className="align-top hover:bg-slate-50/80">
    <td className="px-4 py-3">
      <div className="font-semibold text-slate-950">{getDisplayName(row)}</div>
      <div className="text-xs text-slate-500">{row.username ?? row.student_id}</div>
    </td>
    <td className="px-4 py-3 text-slate-700">{row.class_name ?? '—'}</td>
    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
    <td className="px-4 py-3">
      <WarningText active={health.timeAlmostOver} normal={formatSeconds(row.remaining_seconds)} warning={`${formatSeconds(row.remaining_seconds)} left`} />
      <div className="text-xs text-slate-500">Ends {formatDateTime(row.ends_at)}</div>
    </td>
    <td className="px-4 py-3"><WarningText active={health.heartbeatStale} normal={health.heartbeatAge === null ? '—' : `${health.heartbeatAge}s ago`} warning="Stale" /></td>
    <td className="px-4 py-3"><WarningText active={health.saveStale} normal={row.last_save_age_seconds == null ? '—' : `${row.last_save_age_seconds}s ago`} warning={`${row.last_save_age_seconds}s ago`} /></td>
    <td className="px-4 py-3"><WarningText active={health.hasIncidents} normal={String(row.incident_count ?? 0)} warning={`${row.incident_count} incident${row.incident_count === 1 ? '' : 's'}`} /></td>
    <td className="px-4 py-3 text-slate-700">{formatDateTime(row.submitted_at)}</td>
    <td className="px-4 py-3"><ActionButtons row={row} onAction={onAction} busy={busy} /></td>
  </tr>
);

const RosterCard: React.FC<{
  row: IeltsExamMonitoringRow;
  health: ReturnType<typeof buildHealthShape>;
  onAction: (row: IeltsExamMonitoringRow, action: 'extend' | 'force_submit' | 'void') => Promise<void>;
  busy: boolean;
}> = ({ row, health, onAction, busy }) => (
  <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold text-slate-950">{getDisplayName(row)}</h3>
        <p className="text-sm text-slate-500">{row.class_name ?? 'No class'} · {row.username ?? row.student_id}</p>
      </div>
      <StatusBadge status={row.status} />
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
      <Metric label="Time" value={<WarningText active={health.timeAlmostOver} normal={formatSeconds(row.remaining_seconds)} warning={`${formatSeconds(row.remaining_seconds)} left`} />} />
      <Metric label="Heartbeat" value={<WarningText active={health.heartbeatStale} normal={health.heartbeatAge === null ? '—' : `${health.heartbeatAge}s ago`} warning="Stale" />} />
      <Metric label="Last save" value={<WarningText active={health.saveStale} normal={row.last_save_age_seconds == null ? '—' : `${row.last_save_age_seconds}s ago`} warning={`${row.last_save_age_seconds}s ago`} />} />
      <Metric label="Incidents" value={<WarningText active={health.hasIncidents} normal={String(row.incident_count ?? 0)} warning={`${row.incident_count}`} />} />
      <Metric label="Started" value={formatDateTime(row.started_at)} />
      <Metric label="Submitted" value={formatDateTime(row.submitted_at)} />
    </div>
    <div className="mt-4"><ActionButtons row={row} onAction={onAction} busy={busy} /></div>
  </article>
);

const buildHealthShape = () => ({
  heartbeatAge: null as number | null,
  heartbeatStale: false,
  saveStale: false,
  timeAlmostOver: false,
  hasIncidents: false,
});

const StatusBadge: React.FC<{ status: string | null | undefined }> = ({ status }) => (
  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(status)}`}>
    {statusLabels[status ?? 'assigned'] ?? status ?? 'Not started'}
  </span>
);

const WarningText: React.FC<{ active: boolean; normal: string; warning: string }> = ({ active, normal, warning }) => (
  <span className={active ? 'font-semibold text-red-700' : 'text-slate-700'}>{active ? warning : normal}</span>
);

const Metric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <div className="mt-1 text-slate-800">{value}</div>
  </div>
);

const ActionButtons: React.FC<{
  row: IeltsExamMonitoringRow;
  onAction: (row: IeltsExamMonitoringRow, action: 'extend' | 'force_submit' | 'void') => Promise<void>;
  busy: boolean;
}> = ({ row, onAction, busy }) => {
  const disabled = busy || !row.attempt_id || row.status === 'void' || isSubmittedStatus(row.status);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          void onAction(row, 'extend');
        }}
        className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Extend
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onAction(row, 'force_submit')}
        className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Force submit
      </button>
      <button
        type="button"
        disabled={busy || !row.attempt_id || row.status === 'void'}
        onClick={() => void onAction(row, 'void')}
        className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Void
      </button>
    </div>
  );
};

export default IeltsExamMonitor;
