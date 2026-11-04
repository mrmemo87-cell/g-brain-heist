import { supabase } from './supabaseClient';
import { createIeltsViewCache } from '../src/lib/ieltsViewCache';

/**
 * IELTS course habit loop: streak, XP, daily goal and streak freezes. Everything is computed on the server from the
 * learner's real attempts (rpc_ielts_course_habit), so the browser cannot award itself XP. Motivation only: never a
 * score, a band or teacher evidence.
 */

export interface IeltsHabitDay { day: string; xp: number; frozen: boolean; today: boolean }

export interface IeltsCourseHabit {
  streak: number;
  today_done: boolean;
  longest_streak: number;
  freezes: number;
  today: string;
  today_xp: number;
  daily_goal_xp: number;
  goal_done: boolean;
  total_xp: number;
  next_milestone: number | null;
  week: IeltsHabitDay[];
  time_zone: string;
  reminders: boolean;
}

export const IELTS_DAILY_GOALS = [
  { xp: 10, label: 'Casual', hint: 'About one step a day' },
  { xp: 20, label: 'Regular', hint: 'Two short steps a day' },
  { xp: 30, label: 'Serious', hint: 'A lesson and practice' },
  { xp: 50, label: 'Intense', hint: 'For exam weeks' },
] as const;

/** What each kind of work is worth. Mirrors private.ielts_course_daily_xp. */
export const IELTS_XP_RULES = [
  { label: 'Vocabulary step', xp: '10 XP, 15 if every answer is right' },
  { label: 'Reading or Listening set', xp: '15 XP' },
  { label: 'Writing or Speaking task', xp: '20 XP' },
  { label: 'Opening a course lesson', xp: '5 XP' },
] as const;

const habitCache = createIeltsViewCache<IeltsCourseHabit>();

export function cachedIeltsCourseHabit(): IeltsCourseHabit | null {
  return habitCache.get();
}

const browserTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
};

export async function fetchIeltsCourseHabit(): Promise<IeltsCourseHabit> {
  const { data, error } = await supabase.rpc('rpc_ielts_course_habit', { p_tz: browserTimeZone() });
  if (error || !data) throw new Error('Your streak could not load.');
  habitCache.set(data as IeltsCourseHabit);
  return data as IeltsCourseHabit;
}

export async function saveIeltsCourseHabitSettings(settings: { goal?: number; reminders?: boolean }): Promise<IeltsCourseHabit> {
  const { data, error } = await supabase.rpc('rpc_ielts_course_habit_settings', {
    p_goal: settings.goal ?? null,
    p_reminders: settings.reminders ?? null,
  });
  if (error || !data) throw new Error('Your settings could not be saved.');
  habitCache.set(data as IeltsCourseHabit);
  return data as IeltsCourseHabit;
}

/** Celebrations show once per day per device: the first time the streak is extended, and when the goal is met. */
type Seen = { streakDay?: string; goalDay?: string };
const SEEN_KEY = 'bh_ielts_habit_seen_v1';
export const readHabitSeen = (): Seen => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Seen; } catch { return {}; }
};
export const markHabitSeen = (patch: Seen) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readHabitSeen(), ...patch })); } catch { /* storage unavailable */ }
};

export type HabitCelebration = { kind: 'streak'; streak: number; milestone: boolean } | { kind: 'goal'; xp: number; goal: number };

/** Which celebration (if any) is due for this habit state. A day with no earlier visit still celebrates once. */
export function dueHabitCelebration(habit: IeltsCourseHabit | null): HabitCelebration | null {
  if (!habit) return null;
  const seen = readHabitSeen();
  if (habit.today_done && seen.streakDay !== habit.today) {
    return { kind: 'streak', streak: habit.streak, milestone: [3, 7, 14, 30, 50, 100, 200, 365].includes(habit.streak) };
  }
  if (habit.goal_done && seen.goalDay !== habit.today) {
    return { kind: 'goal', xp: habit.today_xp, goal: habit.daily_goal_xp };
  }
  return null;
}

/** Plain-language status line for the habit bar. Encouraging, never guilt. */
export function habitStatusLine(habit: IeltsCourseHabit): string {
  if (habit.today_done && habit.goal_done) return 'Daily goal done. See you tomorrow!';
  if (habit.today_done) return `${Math.max(habit.daily_goal_xp - habit.today_xp, 0)} XP to your daily goal.`;
  if (habit.streak > 0) return `One step today makes it ${habit.streak + 1} days in a row.`;
  return 'Start a streak today. One short step is enough.';
}
