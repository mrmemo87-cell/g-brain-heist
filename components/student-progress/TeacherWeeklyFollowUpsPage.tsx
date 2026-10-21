import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchFollowUpsThisWeek,
  fetchPracticeResults,
  fetchTeacherFollowUps,
  logTeacherFollowUps,
  practiceStatus,
  type FlaggedStudent,
  type FollowUpTab,
  type PracticeResult,
  type PracticeStatus,
} from '../../services/teacherFollowUpService';
import {
  getAcademicProgressExperienceContext,
  type AcademicProgressExperienceContext,
} from '../../services/academicProgressExperienceService';
import { AcademicProgressHeader } from './AcademicProgressSuite';
import './TeacherWeeklyFollowUpsPage.css';

interface TeacherWeeklyFollowUpsPageProps {
  onBack?: () => void;
  /** Opens the existing Interventions workspace for one student, where targeted practice is created. */
  onPlanPractice?: (studentId: string) => void;
}

const TABS: Array<{ id: FollowUpTab; label: string; hint: string; empty: string }> = [
  { id: 'late', label: 'Didn’t finish', hint: 'Assignments overdue in the last 2 weeks', empty: 'Everyone finished their assignments. Nice.' },
  { id: 'low', label: 'Low scores', hint: 'Averaged under 50% on your assignments this week', empty: 'No one scored under 50% this week.' },
  { id: 'quiet', label: 'Went quiet', hint: 'Stopped practising, or only collects the daily reward', empty: 'No one has gone quiet this week.' },
];

const initials = (name: string) => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() || '')
  .join('') || '?';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const daysAgo = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

const STATUS_ORDER: Record<PracticeStatus, number> = { struggling: 0, waiting: 1, practising: 2, 'on-track': 3 };

const statusText = (row: PracticeResult, status: PracticeStatus) => {
  const score = `${row.correct} of ${row.answered} correct`;
  if (status === 'waiting') return `Not practised yet (set ${daysAgo(row.set_at)})`;
  if (status === 'on-track') return `On track: ${score}`;
  if (status === 'struggling') return `Still struggling: ${score}`;
  return `Practising: ${score}`;
};

const TeacherWeeklyFollowUpsPage: React.FC<TeacherWeeklyFollowUpsPageProps> = ({ onBack, onPlanPractice }) => {
  const [rows, setRows] = useState<FlaggedStudent[]>([]);
  const [context, setContext] = useState<AcademicProgressExperienceContext | null>(null);
  const [weekCount, setWeekCount] = useState<number | null>(null);
  const [practice, setPractice] = useState<PracticeResult[]>([]);
  const [tab, setTab] = useState<FollowUpTab>('late');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, count, nextContext, results] = await Promise.all([
        fetchTeacherFollowUps(),
        fetchFollowUpsThisWeek().catch(() => null),
        getAcademicProgressExperienceContext().catch(() => null),
        fetchPracticeResults().catch(() => []),
      ]);
      setRows(list);
      setPractice(results);
      setWeekCount(count);
      setContext(nextContext);
      const firstWithStudents = TABS.find((item) => list.some((row) => row.tab === item.id));
      if (firstWithStudents) setTab(firstWithStudents.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not load this week’s follow-ups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const byTab = useMemo(() => {
    const groups: Record<FollowUpTab, FlaggedStudent[]> = { late: [], low: [], quiet: [] };
    rows.forEach((row) => groups[row.tab]?.push(row));
    (Object.keys(groups) as FollowUpTab[]).forEach((key) => groups[key].sort((a, b) => b.sort_key - a.sort_key));
    return groups;
  }, [rows]);

  const practiceRows = useMemo(() => practice
    .map((row) => ({ row, status: practiceStatus(row) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      || new Date(b.row.set_at).getTime() - new Date(a.row.set_at).getTime()), [practice]);

  const flaggedCount = useMemo(() => new Set(rows.map((row) => row.student_id)).size, [rows]);
  const current = byTab[tab];
  const currentTab = TABS.find((item) => item.id === tab) || TABS[0];
  const selectedInTab = current.filter((row) => selected.has(row.student_id));

  const switchTab = (next: FollowUpTab) => {
    setTab(next);
    setSelected(new Set());
    setNotice(null);
  };

  const toggle = (studentId: string) => {
    setNotice(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const selectAll = () => {
    setNotice(null);
    setSelected(new Set(current.map((row) => row.student_id)));
  };

  const sendReminder = async () => {
    if (!selectedInTab.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const logged = await logTeacherFollowUps(selectedInTab, 'reminder', tab);
      setReminded((prev) => {
        const next = new Set(prev);
        selectedInTab.forEach((row) => next.add(row.student_id));
        return next;
      });
      setWeekCount((prev) => (prev ?? 0) + logged);
      setSelected(new Set());
      setNotice(logged > 0
        ? `Reminder sent to ${plural(logged, 'student', 'students')}. They will see it next time they open Brains Heist${selectedInTab.some((row) => row.weak_topic) ? ', and for the next 7 days 3 of their 5 daily mission questions will practise their weak topic' : ''}.`
        : 'These students no longer need a follow-up. Refreshing the list.');
      if (logged === 0) void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not send the reminder.');
    } finally {
      setBusy(false);
    }
  };

  const planPractice = async (row: FlaggedStudent) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const logged = await logTeacherFollowUps([row], 'practice', row.tab);
      setWeekCount((prev) => (prev ?? 0) + logged);
    } catch {
      // Logging is best-effort here; still take the teacher to the practice workspace.
    } finally {
      setBusy(false);
    }
    onPlanPractice?.(row.student_id);
  };

  return (
    <div className="tfu-page">
      <AcademicProgressHeader
        context={context}
        eyebrow="Student Support"
        title="Who needs you this week"
        subtitle="Students who didn't finish, scored low, or stopped practising. Follow up in a few minutes."
        onBack={onBack}
        backLabel="Back to Teacher Workspace"
      />

      <main className="tfu-main">
        <section className="tfu-summary" aria-label="This week">
          <div>
            <strong>{loading ? '…' : flaggedCount}</strong>
            <span>students flagged</span>
          </div>
          <div>
            <strong>{weekCount ?? '—'}</strong>
            <span>follow-ups this week</span>
          </div>
          <button type="button" className="tfu-refresh" onClick={() => void load()} disabled={loading || busy}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </section>

        <div className="tfu-tabs" role="tablist" aria-label="Reason flagged">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tfu-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls="tfu-panel"
              className={tab === item.id ? 'is-active' : undefined}
              onClick={() => switchTab(item.id)}
            >
              <span>{item.label}</span>
              <b>{byTab[item.id].length}</b>
            </button>
          ))}
        </div>

        {error ? <div className="tfu-alert" role="alert">{error}</div> : null}
        {notice ? <div className="tfu-notice" role="status">{notice}</div> : null}

        <section id="tfu-panel" role="tabpanel" aria-labelledby={`tfu-tab-${tab}`} className="tfu-panel">
          <div className="tfu-panel-head">
            <span>{currentTab.hint}</span>
            {current.length > 0 ? (
              <button type="button" className="tfu-link" onClick={selectAll} disabled={busy}>Select all</button>
            ) : null}
          </div>

          {loading ? (
            <div className="tfu-empty">Finding students who need you…</div>
          ) : current.length === 0 ? (
            <div className="tfu-empty">{currentTab.empty}</div>
          ) : (
            <ul className="tfu-list">
              {current.map((row) => {
                const checked = selected.has(row.student_id);
                const inputId = `tfu-${row.tab}-${row.student_id}`;
                return (
                  <li key={`${row.tab}-${row.student_id}`} className={checked ? 'tfu-card is-selected' : 'tfu-card'}>
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(row.student_id)}
                      disabled={busy}
                    />
                    <label htmlFor={inputId} className="tfu-card-body">
                      <span className="tfu-name-row">
                        <span className="tfu-avatar" aria-hidden="true">{initials(row.display_name)}</span>
                        <strong>{row.display_name}</strong>
                        {reminded.has(row.student_id) ? <em className="tfu-badge">Reminded</em> : null}
                      </span>
                      <span className="tfu-reason">{row.reason}</span>
                      {row.weak_topic ? <span className="tfu-topic">Weak: {row.weak_topic}</span> : null}
                    </label>
                    {onPlanPractice ? (
                      <button
                        type="button"
                        className="tfu-practice"
                        onClick={() => void planPractice(row)}
                        disabled={busy}
                        aria-label={`Plan practice for ${row.display_name}`}
                      >
                        Plan practice
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {practiceRows.length > 0 ? (
          <section className="tfu-results" aria-labelledby="tfu-results-title">
            <div className="tfu-results-head">
              <h2 id="tfu-results-title">Practice you set</h2>
              <span>Daily mission answers on the topic you chose, last 14 days. Practice only: it does not change their profile.</span>
            </div>
            <ul className="tfu-list">
              {practiceRows.map(({ row, status }) => (
                <li key={`${row.student_id}-${row.topic}`} className={`tfu-result is-${status}`}>
                  <span className="tfu-avatar" aria-hidden="true">{initials(row.display_name)}</span>
                  <span className="tfu-result-body">
                    <strong>{row.display_name}</strong>
                    <span className="tfu-result-topic">{row.topic}</span>
                    <span className="tfu-result-status">
                      {statusText(row, status)}
                      {row.days_practised > 1 ? ` over ${row.days_practised} days` : ''}
                    </span>
                  </span>
                  {status === 'struggling' && onPlanPractice ? (
                    <button
                      type="button"
                      className="tfu-practice"
                      onClick={() => onPlanPractice(row.student_id)}
                      aria-label={`Plan more support for ${row.display_name}`}
                    >
                      Plan more support
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="tfu-actions">
        <span>{selectedInTab.length ? `${selectedInTab.length} selected` : 'Select students to remind'}</span>
        <button type="button" onClick={() => void sendReminder()} disabled={!selectedInTab.length || busy}>
          {busy ? 'Sending…' : 'Send reminder'}
        </button>
      </footer>
    </div>
  );
};

export default TeacherWeeklyFollowUpsPage;
