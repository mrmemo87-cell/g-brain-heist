/**
 * Lets another workspace (e.g. the School Head's programme cards) ask the Teacher Portal to open on a specific
 * view the next time it mounts. The request is read once and then cleared.
 */
const KEY = 'bh:teacher-requested-view';
const REQUESTABLE = ['writing-hub', 'writing-monitoring', 'writing-analytics', 'writing-export-center', 'reports', 'academic-profiles'];
export const requestTeacherPortalView = (view) => {
    try {
        window.sessionStorage.setItem(KEY, view);
    }
    catch { /* storage unavailable: the portal opens on its dashboard */ }
};
export const consumeRequestedTeacherView = () => {
    try {
        const value = window.sessionStorage.getItem(KEY);
        if (!value)
            return null;
        window.sessionStorage.removeItem(KEY);
        return REQUESTABLE.includes(value) ? value : null;
    }
    catch {
        return null;
    }
};
