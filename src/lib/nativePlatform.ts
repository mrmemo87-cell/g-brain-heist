// Is this running inside the Brains Heist iPhone / Android app (Capacitor) instead of a browser?
//
// Capacitor injects `window.Capacitor` before any app script runs, so this check needs no import and
// works in Node tests with a fake window. Inside the app the page is served from a local origin
// (capacitor://localhost on iPhone, https://localhost on Android), so anything that must reach the real
// website — email links, OAuth return URLs, Vercel /api routes — goes through `publicSiteUrl()`.

// Same address the website uses for VITE_SITE_URL (see .env.example).
export const PUBLIC_SITE_URL = 'https://www.brainsheist.com';

export type NativePlatform = 'ios' | 'android' | 'web';

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

type WindowLike = { Capacitor?: CapacitorGlobal } | undefined;

const currentWindow = (): WindowLike =>
  (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }));

export function nativePlatform(win: WindowLike = currentWindow()): NativePlatform {
  try {
    const cap = win?.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return 'web';
    const platform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
    return platform === 'ios' || platform === 'android' ? platform : 'web';
  } catch {
    return 'web';
  }
}

/** True only inside the installed iPhone/Android app, never in a browser or home-screen web app. */
export const isNativeApp = (win: WindowLike = currentWindow()): boolean => nativePlatform(win) !== 'web';

/**
 * Absolute URL on the public website for a site-relative path. In a browser the relative path still
 * works, but inside the app it would point at the local bundle, so callers that need the live site
 * (API routes, files not shipped in the app) wrap paths with this.
 */
export function publicSiteUrl(path = '/', win: WindowLike = currentWindow()): string {
  if (!isNativeApp(win)) return path;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path; // already absolute
  return `${PUBLIC_SITE_URL}/${path.replace(/^\/+/, '')}`;
}

/** Map a link that opened the app (https://brainsheist.com/..., with or without www, or brainsheist://...) to an in-app path. */
export function inAppPathFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const bareHost = (host: string) => host.replace(/^www\./, '');
    const isSiteLink = url.protocol === 'https:' && bareHost(url.host) === bareHost(new URL(PUBLIC_SITE_URL).host);
    const isSchemeLink = url.protocol === 'brainsheist:';
    if (!isSiteLink && !isSchemeLink) return null;
    // brainsheist://auth/callback?x → host "auth", path "/callback"; join them back into /auth/callback.
    const path = isSchemeLink ? `/${url.host}${url.pathname}`.replace(/\/{2,}/g, '/') : url.pathname || '/';
    return `${path}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Custom URL scheme registered for the iPhone and Android apps (Info.plist / AndroidManifest.xml). */
export const NATIVE_URL_SCHEME = 'brainsheist';

/**
 * Turn a website auth return address (for example https://www.brainsheist.com/auth/callback?next=x) into the
 * app's own address (brainsheist://auth/callback?next=x), so the system browser hands the sign-in back to the app.
 * Must also be listed under Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function nativeAuthRedirect(webRedirectUrl: string | undefined): string {
  let path = '/auth/callback';
  let search = '';
  try {
    if (webRedirectUrl) {
      const url = new URL(webRedirectUrl, PUBLIC_SITE_URL);
      path = url.pathname || path;
      search = url.search;
    }
  } catch { /* fall back to the default callback */ }
  return `${NATIVE_URL_SCHEME}://${path.replace(/^\/+/, '')}${search}`;
}

/**
 * Home screens of the app. Android's back button on one of these sends the app to the background (like
 * every Android app) instead of walking browser history, which used to bounce between the Brains Heist
 * and IELTS homes because each switch is a full page load.
 */
const APP_ROOT_PATHS = new Set(['/', '/ielts', '/ielts/course']);

export function isAppRootPath(pathname: string): boolean {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return APP_ROOT_PATHS.has(clean || '/');
}
