export const AUTH_CALLBACK_PATH = '/auth/callback';

export type AuthEventName =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | string;

export const isAuthCallbackPath = (pathname: string): boolean => {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === AUTH_CALLBACK_PATH;
};

export const resolvePostAuthPath = (pathname: string, fallback = '/'): string => {
  return isAuthCallbackPath(pathname) ? fallback : pathname;
};

export const shouldUseGlobalAuthLoader = (event: AuthEventName, alreadyAuthenticated: boolean): boolean => {
  if (!alreadyAuthenticated) return true;
  return event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY';
};

export const isResumeEvent = (event: Event): boolean => {
  if (event.type === 'focus') return true;
  if (event.type !== 'visibilitychange') return false;
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
};
