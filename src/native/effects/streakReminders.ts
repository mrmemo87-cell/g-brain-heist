// "Blaze is getting cold" evening reminders, scheduled on the phone itself (IELTS Visual & UX Bible §14.4),
// plus the home-screen widget state. App only: on the website the existing web-push reminder is used.
// Reminders are local, so they work offline and never need a server; they are rebuilt every time the
// streak changes or the app comes back to the front.

import { streakReminderText, upcomingReminderTimes } from '../../lib/appEffects';
import { isNativeApp } from '../../lib/nativePlatform';
import { registerPlugin } from '@capacitor/core';

const STATE_KEY = 'bh:streak-state';
const FIRST_ID = 7101;
const DAYS = 7;

export interface StreakState {
  streak: number;
  todayDone: boolean;
  /** Learner's local day the state was saved (YYYY-MM-DD). */
  day: string;
  reminders: boolean;
}

interface BlazeWidgetPlugin {
  update(options: { streak: number; todayDone: boolean; day: string }): Promise<void>;
}
const BlazeWidget = registerPlugin<BlazeWidgetPlugin>('BlazeWidget');

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function readState(): StreakState | null {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null') as StreakState | null;
    return s && typeof s.streak === 'number' ? s : null;
  } catch { return null; }
}

/** A saved "done today" only counts for the day it was saved. */
function stateForToday(s: StreakState): StreakState {
  return s.day === localDay() ? s : { ...s, todayDone: false, day: localDay() };
}

type LocalNotificationsModule = typeof import('@capacitor/local-notifications');
const loadLN = () => import('@capacitor/local-notifications').catch(() => null as LocalNotificationsModule | null);

export async function notificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  const mod = await loadLN();
  if (!mod) return 'denied';
  try {
    const { display } = await mod.LocalNotifications.checkPermissions();
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
  } catch { return 'denied'; }
}

export async function askNotificationPermission(): Promise<boolean> {
  const mod = await loadLN();
  if (!mod) return false;
  try { return (await mod.LocalNotifications.requestPermissions()).display === 'granted'; } catch { return false; }
}

async function schedule(state: StreakState): Promise<void> {
  const mod = await loadLN();
  if (!mod) return;
  const { LocalNotifications } = mod;
  try {
    await LocalNotifications.cancel({ notifications: Array.from({ length: DAYS }, (_, i) => ({ id: FIRST_ID + i })) });
    if (!state.reminders) return;
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    const times = upcomingReminderTimes(new Date(), state.todayDone, DAYS);
    // After tonight the streak may have grown by one if the learner practises; keep the copy honest by
    // naming the current streak only for tonight and a generic line later.
    await LocalNotifications.schedule({
      notifications: times.map((at, i) => {
        const tonight = at.getDate() === new Date().getDate();
        const text = streakReminderText(state.streak);
        return {
          id: FIRST_ID + i,
          title: tonight ? text.title : 'Blaze is getting cold 🔥',
          body: tonight ? text.body : 'One short lesson keeps Blaze burning.',
          schedule: { at, allowWhileIdle: true },
          smallIcon: 'ic_stat_blaze',
          iconColor: '#F97316',
          extra: { path: '/ielts/course' },
        };
      }),
    });
  } catch { /* reminders are optional */ }
}

async function updateWidget(state: StreakState): Promise<void> {
  try { await BlazeWidget.update({ streak: state.streak, todayDone: state.todayDone, day: state.day }); } catch { /* iPhone or older build: no widget yet */ }
}

/** Called whenever the IELTS habit loads or changes inside the app. */
export async function syncStreakState(habit: { streak: number; today_done: boolean; reminders: boolean }): Promise<void> {
  if (!isNativeApp()) return;
  const state: StreakState = { streak: habit.streak, todayDone: habit.today_done, day: localDay(), reminders: habit.reminders };
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  await Promise.all([schedule(state), updateWidget(state)]);
}

let resumeInstalled = false;
/** Rebuild reminders and the widget from the last known state whenever the app returns to the front. */
export async function refreshStreakRemindersOnResume(): Promise<void> {
  if (!isNativeApp() || resumeInstalled) return;
  resumeInstalled = true;
  const refresh = () => {
    const s = readState();
    if (!s) return;
    const today = stateForToday(s);
    void schedule(today);
    void updateWidget(today);
  };
  refresh();
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('resume', refresh);
  } catch { /* ignore */ }
  // Tapping a reminder opens the course map.
  const mod = await loadLN();
  try {
    await mod?.LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      const path = (notification.extra as { path?: string } | undefined)?.path;
      if (path && path.startsWith('/')) window.location.assign(path);
    });
  } catch { /* ignore */ }
}
