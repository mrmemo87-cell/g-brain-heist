// Decides when to show the one-time "Add to Home Screen" guide.
// Pure functions only, so the rules are unit-testable without a browser.

export const INSTALL_GUIDE_DISMISSED_KEY = 'brains-heist:install-guide-dismissed:v1';

/** Routes where a sheet over the content would interrupt timed or recorded work. */
const QUIET_PATH_PREFIXES = ['/ielts/exam/', '/ielts/session/', '/ielts/speaking', '/ielts/listening/', '/ielts/writing/', '/ielts/reading/', '/auth/', '/presentation', '/booked'];

export interface InstallEnvironment {
  userAgent: string;
  /** `display-mode: standalone` media query, or `navigator.standalone` on iOS Safari. */
  standalone: boolean;
  pathname: string;
  dismissed: boolean;
}

/** iPhone/iPad Safari (not Chrome, Firefox or in-app browsers, which cannot add to Home Screen). */
export function isIosSafari(userAgent: string): boolean {
  const ua = userAgent || '';
  const isIosDevice = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
  if (!isIosDevice) return false;
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/i.test(ua);
  const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|Telegram|WhatsApp|TikTok|Snapchat/i.test(ua);
  return /Safari/i.test(ua) && !isOtherBrowser && !isInAppBrowser;
}

export function isQuietPath(pathname: string): boolean {
  return QUIET_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function shouldShowIosInstallGuide(env: InstallEnvironment): boolean {
  if (env.standalone || env.dismissed) return false;
  if (!isIosSafari(env.userAgent)) return false;
  return !isQuietPath(env.pathname);
}

export function readInstallGuideDismissed(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return storage?.getItem(INSTALL_GUIDE_DISMISSED_KEY) === '1'; } catch { return false; }
}

export function writeInstallGuideDismissed(storage?: Pick<Storage, 'setItem'>): void {
  try { storage?.setItem(INSTALL_GUIDE_DISMISSED_KEY, '1'); } catch { /* Blocked storage: the guide may show again next visit. */ }
}

export function detectStandalone(win: { matchMedia?: (q: string) => { matches: boolean }; navigator?: { standalone?: boolean } } | undefined): boolean {
  if (!win) return false;
  try {
    if (win.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch { /* matchMedia may be missing in some WebViews. */ }
  return win.navigator?.standalone === true;
}

/** Fired by "How to install" in Settings; the guide listens and opens even if dismissed or installed. */
export const INSTALL_GUIDE_OPEN_EVENT = 'brains-heist:open-install-guide';

export function openInstallGuide(win: Pick<Window, 'dispatchEvent'> | undefined = typeof window === 'undefined' ? undefined : window): void {
  try { win?.dispatchEvent(new Event(INSTALL_GUIDE_OPEN_EVENT)); } catch { /* Old WebViews without Event constructor. */ }
}

export type InstallGuidePlatform = 'ios' | 'android' | 'other';

/** Which steps to show: iPhone/iPad (incl. "desktop website" mode), Android, or anything else. */
export function installGuidePlatform(userAgent: string, maxTouchPoints = 0): InstallGuidePlatform {
  const ua = userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (/Mobile/i.test(ua) || maxTouchPoints > 1))) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}
