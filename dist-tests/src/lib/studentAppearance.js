// Which student screens take the Light appearance. Game screens (Game tab, battles, shop,
// Cursed Commander, Clan Wars…) keep their dark design whatever the setting.
export const SCHOOL_DASHBOARD_TABS = new Set(['home', 'learn', 'tasks', 'clan', 'leaderboard', 'more', 'tournaments']);
export const SCHOOL_VIEWS = new Set(['clan', 'leaderboard', 'writing']);
export function isStudentSchoolSurface(view, dashboardTab) {
    if (view === 'dashboard')
        return SCHOOL_DASHBOARD_TABS.has(dashboardTab);
    return SCHOOL_VIEWS.has(view);
}
/** Body class that switches the stylesheet on. Pure, so it can be unit-tested. */
export function studentLightBodyClass(appearance, isStudent, view, dashboardTab) {
    return appearance === 'light' && isStudent && isStudentSchoolSurface(view, dashboardTab);
}
