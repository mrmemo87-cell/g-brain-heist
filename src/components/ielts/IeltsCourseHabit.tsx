import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IELTS_DAILY_GOALS,
  readHabitSeen,
  IELTS_XP_RULES,
  cachedIeltsCourseHabit,
  dueHabitCelebration,
  fetchIeltsCourseHabit,
  habitStatusLine,
  markHabitSeen,
  saveIeltsCourseHabitSettings,
  type HabitCelebration,
  type IeltsCourseHabit,
} from '../../../services/ieltsCourseHabitService';
import { enablePushOnThisDevice, getPushAvailability, isPushEnabledOnThisDevice } from '../../../services/pushService';
import { BadgeMedal } from './IeltsGameArt';
import { BlazeLive } from './BlazeLive';
import { EffectsControl } from './AppEffectsControl';
import { isNativeApp } from '../../lib/nativePlatform';
import { haptic } from '../../native/effects/haptics';
import { playSfx } from '../../native/effects/sfx';
import { askNotificationPermission, notificationPermission, syncStreakState } from '../../native/effects/streakReminders';

const readHabitSeenBadges = () => readHabitSeen().badges ?? [];
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dayLetter = (iso: string) => WEEKDAY[new Date(`${iso}T12:00:00`).getDay()] ?? '';
const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Loads the habit state (cached first, then fresh). `refresh` returns the new state for before/after comparisons. */
export function useIeltsCourseHabit() {
  const [habit, setHabit] = useState<IeltsCourseHabit | null>(() => cachedIeltsCourseHabit());
  const refresh = useCallback(async () => {
    try {
      const next = await fetchIeltsCourseHabit();
      setHabit(next);
      return next;
    } catch {
      return null;
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { habit, setHabit, refresh };
}

function GoalRing({ xp, goal, size = 46 }: { xp: number; goal: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, goal ? xp / goal : 0);
  return (
    <svg className="ih-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ih-ring-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="ih-ring-value" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
    </svg>
  );
}

function WeekStrip({ habit }: { habit: IeltsCourseHabit }) {
  return (
    <ol className="ih-week" aria-label="This week">
      {habit.week.map((d) => {
        const state = d.xp > 0 ? 'done' : d.frozen ? 'frozen' : d.today ? 'today' : 'missed';
        return (
          <li key={d.day} className={`ih-day ih-day--${state}`} aria-label={`${d.day}: ${state === 'done' ? `${d.xp} XP` : state === 'frozen' ? 'streak freeze used' : state === 'today' ? 'today, not yet' : 'no practice'}`}>
            <span className="ih-day-dot" aria-hidden="true">{state === 'done' ? '🔥' : state === 'frozen' ? '🧊' : ''}</span>
            <span className="ih-day-letter" aria-hidden="true">{dayLetter(d.day)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The streak bar at the top of the Course tab. Tapping it opens goals, streak freezes and reminders. */
export function IeltsCourseHabitBar({ habit, onChange }: { habit: IeltsCourseHabit | null; onChange: (next: IeltsCourseHabit) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (habit) void syncStreakState(habit);
  }, [habit?.streak, habit?.today_done, habit?.reminders]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!habit) return <div className="ih-bar ih-bar--loading" aria-busy="true" />;
  const atRisk = !habit.today_done && habit.streak > 0;
  return (
    <>
      <button type="button" className={`ih-bar${habit.today_done ? ' is-lit' : ''}${atRisk ? ' is-waiting' : ''}`} onClick={() => setOpen(true)}
        aria-label={`${habit.streak}-day streak. ${habit.today_xp} of ${habit.daily_goal_xp} XP today. ${habit.freezes} streak freezes. Open streak details.`}>
        <span className="ih-flame" aria-hidden="true">
          <BlazeLive mood={habit.today_done ? 'happy' : 'sleepy'} size={58} streak={habit.streak} todayDone={habit.today_done} />
          <b>{habit.streak}</b>
        </span>
        <span className="ih-bar-text">
          <b>{habit.streak === 1 ? '1 day streak' : `${habit.streak} day streak`}</b>
          <small>{habitStatusLine(habit)}</small>
        </span>
        <span className="ih-goal" aria-hidden="true">
          <GoalRing xp={habit.today_xp} goal={habit.daily_goal_xp} />
          <small className={habit.goal_done ? 'is-done' : ''}>{habit.goal_done ? '✓' : `${habit.today_xp}/${habit.daily_goal_xp}`}</small>
        </span>
        {habit.freezes > 0 && <span className="ih-freeze" aria-hidden="true">🧊{habit.freezes}</span>}
      </button>
      {open && <IeltsCourseHabitSheet habit={habit} onClose={() => setOpen(false)} onChange={onChange} />}
    </>
  );
}

function ReminderControl({ habit, onChange }: { habit: IeltsCourseHabit; onChange: (next: IeltsCourseHabit) => void }) {
  const [device, setDevice] = useState<'checking' | 'unavailable' | 'off' | 'on' | 'busy'>('checking');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (isNativeApp()) {
      // In the app the reminder is scheduled on the phone itself (works offline, no server needed).
      void notificationPermission().then((p) => { if (alive) setDevice(p === 'granted' ? 'on' : 'off'); });
      return () => { alive = false; };
    }
    const availability = getPushAvailability();
    if (!availability.ok) { setDevice('unavailable'); return () => { alive = false; }; }
    void isPushEnabledOnThisDevice().then((on) => { if (alive) setDevice(on ? 'on' : 'off'); });
    return () => { alive = false; };
  }, []);
  const toggle = async (next: boolean) => {
    setNote(null);
    try { onChange(await saveIeltsCourseHabitSettings({ reminders: next })); } catch { setNote('Could not save. Please try again.'); }
  };
  const enableDevice = async () => {
    setDevice('busy');
    const result = isNativeApp()
      ? ((await askNotificationPermission()) ? { ok: true as const } : { ok: false as const, reason: 'denied' as const })
      : await enablePushOnThisDevice();
    setDevice(result.ok ? 'on' : 'off');
    if (!result.ok) setNote(result.reason === 'denied' ? 'Notifications are blocked in your phone settings.' : 'Could not turn on notifications. Please try again.');
    else if (!habit.reminders) await toggle(true);
    else if (isNativeApp()) void syncStreakState(habit);
  };
  return (
    <section className="ih-section">
      <h3>Evening reminder</h3>
      <p className="ih-muted">One message at about 7 pm, only on days you have not practised. Never at night.</p>
      {device === 'unavailable' ? (
        <p className="ih-muted">This browser cannot show notifications. On iPhone, add Brains Heist to your Home Screen first.</p>
      ) : device === 'on' ? (
        <label className="ih-switch">
          <input type="checkbox" role="switch" checked={habit.reminders} onChange={(e) => void toggle(e.target.checked)} />
          <span>{habit.reminders ? 'Reminder on' : 'Reminder off'}</span>
        </label>
      ) : (
        <button type="button" className="ic-btn ic-btn--ghost" disabled={device === 'busy' || device === 'checking'} onClick={() => void enableDevice()}>
          {device === 'busy' ? 'Turning on…' : 'Turn on reminders'}
        </button>
      )}
      {note && <p className="ih-note" role="alert">{note}</p>}
    </section>
  );
}

export function IeltsCourseHabitSheet({ habit, onClose, onChange }: { habit: IeltsCourseHabit; onClose: () => void; onChange: (next: IeltsCourseHabit) => void }) {
  const [saving, setSaving] = useState<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const chooseGoal = async (xp: number) => {
    setSaving(xp);
    try { onChange(await saveIeltsCourseHabitSettings({ goal: xp })); } finally { setSaving(null); }
  };
  return (
    <div className="ic-sheet-backdrop" onClick={onClose}>
      <div className="ic-sheet ih-sheet" role="dialog" aria-modal="true" aria-labelledby="ih-sheet-title" onClick={(e) => e.stopPropagation()}>
        <span className="ic-sheet-grip" aria-hidden="true" />
        <div className="ih-hero">
          <span className="ih-hero-flame"><BlazeLive mood={habit.today_done ? 'cheer' : 'sleepy'} size={84} streak={habit.streak} todayDone={habit.today_done} interactive /></span>
          <div>
            <h2 id="ih-sheet-title">{habit.streak} day streak</h2>
            <p>{habit.next_milestone ? `${habit.next_milestone - habit.streak} more ${habit.next_milestone - habit.streak === 1 ? 'day' : 'days'} to reach ${habit.next_milestone}.` : 'A legendary streak.'} Best: {habit.longest_streak} {habit.longest_streak === 1 ? 'day' : 'days'}.</p>
          </div>
        </div>
        <WeekStrip habit={habit} />
        <div className="ih-stats">
          <span><b>{habit.today_xp}</b> XP today</span>
          <span><b>{habit.total_xp}</b> XP total</span>
          <span><b>🧊 {habit.freezes}</b> {habit.freezes === 1 ? 'freeze' : 'freezes'}</span>
        </div>
        <p className="ih-muted">Streak freezes protect your streak on a day you miss. You earn one every 7 days in a row and can hold two.</p>

        <section className="ih-section">
          <h3>Daily goal</h3>
          <div className="ih-goals" role="radiogroup" aria-label="Daily goal">
            {IELTS_DAILY_GOALS.map((g) => (
              <button key={g.xp} type="button" role="radio" aria-checked={habit.daily_goal_xp === g.xp} disabled={saving !== null}
                className={`ih-goal-option${habit.daily_goal_xp === g.xp ? ' is-on' : ''}`} onClick={() => void chooseGoal(g.xp)}>
                <b>{g.label}</b><span>{g.xp} XP</span><small>{g.hint}</small>
              </button>
            ))}
          </div>
        </section>

        {habit.badges && habit.badges.length > 0 && (
          <section className="ih-section">
            <h3>Badges <small className="ih-count-chip">{habit.badges.filter((b) => b.earned).length}/{habit.badges.length}</small></h3>
            <ul className="ih-badges">
              {habit.badges.map((b) => (
                <li key={b.id} className={b.earned ? 'is-earned' : ''} title={b.detail}>
                  <BadgeMedal family={b.family} earned={b.earned} progress={b.goal ? b.value / b.goal : 0} size={62} />
                  <b>{b.title}</b>
                  <small>{b.earned ? b.detail : `${b.value}/${b.goal}`}</small>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ReminderControl habit={habit} onChange={onChange} />
        <EffectsControl />

        <details className="ih-section">
          <summary>How XP works</summary>
          <ul className="ih-rules">
            {IELTS_XP_RULES.map((r) => <li key={r.label}><span>{r.label}</span><b>{r.xp}</b></li>)}
          </ul>
          <p className="ih-muted">Each task counts once a day. XP and streaks are for motivation only, never an IELTS score.</p>
        </details>
        <button type="button" className="ic-btn ic-btn--ghost ic-btn--block" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

const streakLine = (streak: number, milestone: boolean) => {
  if (streak === 1) return 'Day one. Come back tomorrow to make it two.';
  if (milestone) return `${streak} days in a row. That is a real habit now.`;
  return `${streak} days in a row. Keep the fire going tomorrow.`;
};

/**
 * Full-screen celebration, once per day per device: first when today's practice extends the streak, then when the
 * daily goal is met. Shown on the course map, unit pages and after a vocabulary step.
 */
export function IeltsHabitCelebration({ habit }: { habit: IeltsCourseHabit | null }) {
  const [shown, setShown] = useState<HabitCelebration | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (shown) return;
    const due = dueHabitCelebration(habit);
    if (!due || !habit) return;
    markHabitSeen(due.kind === 'streak' ? { streakDay: habit.today }
      : due.kind === 'goal' ? { goalDay: habit.today }
        : { badges: [...new Set([...(readHabitSeenBadges()), due.badge.id])] });
    setShown(due);
    // App only (silent on the website): a strong buzz plus a victory or coin sound.
    void haptic('celebrate');
    playSfx(due.kind === 'streak' ? 'fanfare' : 'coin');
  }, [habit, shown]);
  useEffect(() => {
    if (!shown || shown.kind !== 'streak') return;
    if (reducedMotion()) { setCount(shown.streak); return; }
    setCount(Math.max(shown.streak - 1, 0));
    const t = window.setTimeout(() => setCount(shown.streak), 650);
    return () => window.clearTimeout(t);
  }, [shown]);
  const sparks = useMemo(() => Array.from({ length: 18 }).map((_, i) => ({ left: (i * 53) % 100, delay: (i % 6) * 90 })), []);
  if (!shown) return null;
  const close = () => setShown(null);
  return (
    <div className="ih-celebrate" role="dialog" aria-modal="true" aria-labelledby="ih-celebrate-title" onClick={close}>
      <div className={`ih-celebrate-card ih-celebrate-card--${shown.kind}`} onClick={(e) => e.stopPropagation()}>
        {!reducedMotion() && <div className="ih-sparks" aria-hidden="true">{sparks.map((s, i) => <i key={i} style={{ left: `${s.left}%`, animationDelay: `${s.delay}ms` }} />)}</div>}
        {shown.kind === 'streak' ? (
          <>
            <span className="ih-big-flame" aria-hidden="true"><BlazeLive mood="cheer" size={132} streak={shown.streak} todayDone /></span>
            <span className="ih-count" aria-live="polite">{count}</span>
            <h2 id="ih-celebrate-title">{shown.streak === 1 ? 'Streak started!' : shown.milestone ? `${shown.streak}-day milestone!` : 'Streak extended!'}</h2>
            <p>{streakLine(shown.streak, shown.milestone)}</p>
          </>
        ) : shown.kind === 'goal' ? (
          <>
            <span className="ih-big-flame" aria-hidden="true"><BlazeLive mood="cheer" size={120} hue={110} streak={habit?.streak ?? 1} todayDone /></span>
            <h2 id="ih-celebrate-title">Daily goal reached!</h2>
            <p>{shown.xp} XP today, goal {shown.goal}. Anything more is a bonus.</p>
          </>
        ) : (
          <>
            <span className="ih-medal-pop" aria-hidden="true"><BadgeMedal family={shown.badge.family} earned size={140} /></span>
            <p className="ih-celebrate-kicker">New badge</p>
            <h2 id="ih-celebrate-title">{shown.badge.title}</h2>
            <p>{shown.badge.detail}</p>
          </>
        )}
        <button type="button" className="ic-btn ic-btn--primary ic-btn--block ic-btn--glow" onClick={close} autoFocus>Continue</button>
      </div>
    </div>
  );
}
