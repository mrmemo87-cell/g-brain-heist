export const AUTH_CALLBACK_PATH = '/auth/callback';
export const isAuthCallbackPath = (pathname) => {
    const normalized = pathname.replace(/\/+$/, '') || '/';
    return normalized === AUTH_CALLBACK_PATH;
};
export const resolvePostAuthPath = (pathname, fallback = '/') => {
    return isAuthCallbackPath(pathname) ? fallback : pathname;
};
export const shouldUseGlobalAuthLoader = (event, alreadyAuthenticated) => {
    if (!alreadyAuthenticated)
        return true;
    // Supabase may emit SIGNED_IN when an existing session is re-confirmed,
    // including when a browser tab regains focus. Treat that as a silent auth
    // event for already-authenticated users so tab switching does not remount the
    // app behind the global loader.
    return event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY';
};
export const isResumeEvent = (event) => {
    if (event.type === 'focus')
        return true;
    if (event.type !== 'visibilitychange')
        return false;
    if (typeof document === 'undefined')
        return true;
    return document.visibilityState === 'visible';
};
