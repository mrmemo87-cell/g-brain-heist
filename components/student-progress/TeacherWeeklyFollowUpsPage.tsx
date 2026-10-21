import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchFollowUpsThisWeek,
  fetchTeacherFollowUps,
  logTeacherFollowUps,
  type FlaggedStudent,
  type FollowUpTab,
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

const TeacherWeeklyFollowUpsPage: React.FC<TeacherWeeklyFollowUpsPageProps> = ({ onBack, onPlanPractice }) => {
  const [rows, setRows] = useState<FlaggedStudent[]>([]);
  const [context, setContext] = useState<AcademicProgressExperienceContext | null>(null);
  const [weekCount, setWeekCount] = useState<number | null>(null);
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
      const [list, count, nextContext] = await Promise.all([
        fetchTeacherFollowUps(),
        fetchFollowUpsThisWeek().catch(() => null),
        getAcademicProgressExperienceContext().catch(() => null),
      ]);
      setRows(list);
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
        ? `Reminder sent to ${plural(logged, 'student', 'students')}. They will see it next time they open Brains Heist.`
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
