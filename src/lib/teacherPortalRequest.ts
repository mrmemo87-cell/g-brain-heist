/**
 * Lets another workspace (e.g. the School Head's programme cards) ask the Teacher Portal to open on a specific
 * view the next time it mounts. The request is read once and then cleared.
 */
const KEY = 'bh:teacher-requested-view';
const REQUESTABLE = ['writing-hub', 'writing-monitoring', 'writing-analytics', 'writing-export-center', 'reports', 'academic-profiles'] as const;
export type RequestableTeacherView = typeof REQUESTABLE[number];

export const requestTeacherPortalView = (view: RequestableTeacherView): void => {
  try { window.sessionStorage.setItem(KEY, view); } catch { /* storage unavailable: the portal opens on its dashboard */ }
};

export const consumeRequestedTeacherView = (): RequestableTeacherView | null => {
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (!value) return null;
    window.sessionStorage.removeItem(KEY);
    return (REQUESTABLE as readonly string[]).includes(value) ? value as RequestableTeacherView : null;
  } catch {
    return null;
  }
};
