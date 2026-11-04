import { supabase } from './supabaseClient';
import { createIeltsViewCache } from '../src/lib/ieltsViewCache';

/**
 * IELTS course habit loop: streak, XP, daily goal and streak freezes. Everything is computed on the server from the
 * learner's real attempts (rpc_ielts_course_habit), so the browser cannot award itself XP. Motivation only: never a
 * score, a band or teacher evidence.
 */

export interface IeltsHabitDay { day: string; xp: number; frozen: boolean; today: boolean }

export interface IeltsBadge { id: string; family: 'streak' | 'xp' | 'perfect' | 'units' | 'league' | string; title: string; detail: string; goal: number; value: number; earned: boolean }

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
  league_tier?: number;
  league_name?: string;
  badges?: IeltsBadge[];
  exam?: IeltsExamPlan;
}

export interface IeltsExamPlan {
  module: 'academic' | 'general' | 'unsure' | null;
  date: string | null;
  days_left: number | null;
  target: number | null;
  onboarded: boolean;
}

/** Save the learner's own exam plan. The first campaign tags they arrived with (landing page) travel along once. */
export async function saveIeltsExamPlan(plan: { module: string | null; date: string | null; target: number | null }): Promise<IeltsCourseHabit> {
  let acquisition: Record<string, string> | null = null;
  try { acquisition = JSON.parse(localStorage.getItem('bh_ielts_first_touch') || 'null'); } catch { acquisition = null; }
  const { data, error } = await supabase.rpc('rpc_ielts_course_exam_profile', {
    p_module: plan.module,
    p_exam_date: plan.date,
    p_target: plan.target,
    p_acquisition: acquisition,
  });
  if (error || !data) throw new Error('Your plan could not be saved. Please try again.');
  habitCache.set(data as IeltsCourseHabit);
  return data as IeltsCourseHabit;
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
type Seen = { streakDay?: string; goalDay?: string; badges?: string[] };
const SEEN_KEY = 'bh_ielts_habit_seen_v1';
export const readHabitSeen = (): Seen => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Seen; } catch { return {}; }
};
export const markHabitSeen = (patch: Seen) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify({ ...readHabitSeen(), ...patch })); } catch { /* storage unavailable */ }
};

export type HabitCelebration =
  | { kind: 'streak'; streak: number; milestone: boolean }
  | { kind: 'goal'; xp: number; goal: number }
  | { kind: 'badge'; badge: IeltsBadge };

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
  const earned = (habit.badges ?? []).filter((b) => b.earned);
  // The first time badges load on a device, record them silently: only badges earned from now on celebrate.
  if (!seen.badges) { markHabitSeen({ badges: earned.map((b) => b.id) }); return null; }
  const fresh = earned.find((b) => !seen.badges!.includes(b.id));
  if (fresh) return { kind: 'badge', badge: fresh };
  return null;
}

/** Plain-language status line for the habit bar. Encouraging, never guilt. */
export function habitStatusLine(habit: IeltsCourseHabit): string {
  if (habit.today_done && habit.goal_done) return 'Daily goal done. See you tomorrow!';
  if (habit.today_done) return `${Math.max(habit.daily_goal_xp - habit.today_xp, 0)} XP to your daily goal.`;
  if (habit.streak > 0) return `One step today makes it ${habit.streak + 1} days in a row.`;
  return 'Start a streak today. One short step is enough.';
}

// ---------------------------------------------------------------------------
// Weekly leagues
// ---------------------------------------------------------------------------

export interface IeltsLeagueMember { rank: number; name: string; xp: number; me: boolean; hue: number }
export interface IeltsLeagueResult { week_start: string; tier: number; tier_name: string; rank: number; xp: number; result: 'promoted' | 'stayed' | 'demoted'; new_tier: number; new_tier_name: string }
export interface IeltsLeague {
  week_start: string;
  ends_at: string;
  tier: number;
  tier_name: string;
  joined: boolean;
  my_xp: number;
  members: IeltsLeagueMember[];
  size: number;
  promote_count: number;
  demote_count: number;
  last_week: IeltsLeagueResult | null;
}

const leagueCache = createIeltsViewCache<IeltsLeague>();
export const cachedIeltsLeague = () => leagueCache.get();

export async function fetchIeltsLeague(): Promise<IeltsLeague> {
  const { data, error } = await supabase.rpc('rpc_ielts_league');
  if (error || !data) throw new Error('The league could not load.');
  leagueCache.set(data as IeltsLeague);
  return data as IeltsLeague;
}

/** "2d 5h" / "5h 12m" until the league week ends. */
export function leagueTimeLeft(endsAt: string, now = Date.now()): string {
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

const LEAGUE_SEEN_KEY = 'bh_ielts_league_result_seen_v1';
export const leagueResultSeen = (week: string) => { try { return localStorage.getItem(LEAGUE_SEEN_KEY) === week; } catch { return true; } };
export const markLeagueResultSeen = (week: string) => { try { localStorage.setItem(LEAGUE_SEEN_KEY, week); } catch { /* storage unavailable */ } };
