// Rules for the app-only motivation layer (IELTS Visual & UX Bible §14): 3D Blaze, lighting, sound and haptics.
// Pure functions so they can be tested in Node; the React/native wiring lives in src/native/effects/.
/** A phone this weak gets the light version automatically so the app never lags or drains the battery. */
export function isLowEndDevice(env) {
    return (typeof env.memoryGb === 'number' && env.memoryGb > 0 && env.memoryGb <= 3)
        || (typeof env.cores === 'number' && env.cores > 0 && env.cores <= 4);
}
/**
 * The effective level. Reduce motion always wins (still pictures, no continuous animation); "auto" picks
 * light on low-end phones and full otherwise; an explicit student choice is respected.
 */
export function resolveEffectsLevel(choice, env) {
    if (choice === 'off')
        return 'off';
    if (env.reducedMotion)
        return 'off';
    if (choice === 'full' || choice === 'light')
        return choice;
    return isLowEndDevice(env) ? 'light' : 'full';
}
/**
 * Where the motivation layer may run. IELTS screeners, diagnostics, mocks, Exam Mode, practice tasks,
 * reviews and results stay calm (Bible §14.3): only the course map, unit pages, vocabulary steps, league,
 * growth and journey screens are allowed inside /ielts. The Brains Heist game side is allowed.
 */
const IELTS_MOTIVATION_PATHS = [/^\/ielts\/?$/, /^\/ielts\/course(\/[^/]+)?\/?$/, /^\/ielts\/vocabulary\/[^/]+\/?$/, /^\/ielts\/(league|growth|journey)\/?$/];
const QUIET_PATHS = [/^\/exam(\/|$)/, /^\/admission(\/|$)/, /^\/auth\//];
export function effectsAllowedOnPath(pathname) {
    const path = pathname || '/';
    if (QUIET_PATHS.some((re) => re.test(path)))
        return false;
    if (path === '/ielts' || path.startsWith('/ielts/'))
        return IELTS_MOTIVATION_PATHS.some((re) => re.test(path));
    return true;
}
export function blazeLook(streak) {
    const s = Math.max(0, Math.floor(streak || 0));
    if (s >= 100)
        return { tier: 'legend', scale: 1.35, core: '#e0f2fe', outer: '#6366f1', crown: true, embers: 34 };
    if (s >= 30)
        return { tier: 'blue', scale: 1.25, core: '#e0f2fe', outer: '#0ea5e9', crown: false, embers: 28 };
    if (s >= 7)
        return { tier: 'blaze', scale: 1.12, core: '#fff7ae', outer: '#f97316', crown: false, embers: 22 };
    if (s >= 1)
        return { tier: 'flame', scale: 1, core: '#fffbeb', outer: '#fb923c', crown: false, embers: 16 };
    return { tier: 'spark', scale: 0.8, core: '#fff7ed', outer: '#fdba74', crown: false, embers: 8 };
}
/** Evening hour (local) after which an at-risk streak makes Blaze weak and flickering. */
export const BLAZE_WEAK_FROM_HOUR = 18;
/** Blaze is getting cold: there is a streak to lose, today is not done yet, and it is evening. */
export function blazeIsWeak(input) {
    return input.streak > 0 && !input.todayDone && input.hour >= BLAZE_WEAK_FROM_HOUR;
}
/** Local reminder time: about 7 pm, never at night (matches the existing web-push reminder copy). */
export const STREAK_REMINDER_HOUR = 19;
/**
 * The next days (as Date objects at 19:00 local) that should carry a "Blaze is getting cold" reminder.
 * Today is included only when it is not done yet and 19:00 has not passed.
 */
export function upcomingReminderTimes(now, todayDone, days = 7) {
    const out = [];
    for (let i = 0; i < days; i += 1) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, STREAK_REMINDER_HOUR, 0, 0, 0);
        if (i === 0 && (todayDone || at.getTime() <= now.getTime()))
            continue;
        out.push(at);
    }
    return out;
}
export function streakReminderText(streak) {
    if (streak > 0) {
        return {
            title: 'Blaze is getting cold 🔥',
            body: streak === 1 ? 'One lesson today keeps your new streak alive.' : `One lesson today keeps your ${streak}-day streak alive.`,
        };
    }
    return { title: 'Blaze is waiting for you 🔥', body: 'Start a streak with one short lesson today.' };
}
