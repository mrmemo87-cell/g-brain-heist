// Decides when to show the "Add to Home Screen" guide.
// Pure functions only, so the rules are unit-testable without a browser.
import { isSnoozed, readSnooze, recordSnooze } from './promptSnooze';

export const INSTALL_GUIDE_DISMISSED_KEY = 'brains-heist:install-guide-dismissed:v1';
/** "Not now" hides the guide for this many days... */
export const INSTALL_GUIDE_SNOOZE_DAYS = 7;
/** ...and after this many "not now"s it stops appearing on its own (Settings → How to install still works). */
export const INSTALL_GUIDE_MAX_SNOOZES = 3;

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

/** True while a "not now" is in effect (7 days), or after the student has said it 3 times. */
export function readInstallGuideDismissed(storage?: Pick<Storage, 'getItem'>, now: number = Date.now()): boolean {
  return isSnoozed(readSnooze(storage, INSTALL_GUIDE_DISMISSED_KEY), now, INSTALL_GUIDE_MAX_SNOOZES);
}

export function writeInstallGuideDismissed(storage?: Pick<Storage, 'getItem' | 'setItem'>, now: number = Date.now()): void {
  recordSnooze(storage, INSTALL_GUIDE_DISMISSED_KEY, now, INSTALL_GUIDE_SNOOZE_DAYS);
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

/**
 * Where Safari's Share button lives, so the guide can point at it.
 * - Safari 26+ on iPhone (default "Compact" tabs): Share sits inside the ⋯ menu at the bottom right.
 * - Older iPhone Safari: Share is in the bottom toolbar, in the middle.
 * - iPad: Share is at the top right.
 */
export type IosShareLayout = 'iphone-more-menu' | 'iphone-share-bar' | 'ipad-top';

export function iosShareLayout(userAgent: string, maxTouchPoints = 0): IosShareLayout {
  const ua = userAgent || '';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && (/Mobile/i.test(ua) || maxTouchPoints > 1))) return 'ipad-top';
  const version = /Version\/(\d+)/.exec(ua);
  return version && Number(version[1]) >= 26 ? 'iphone-more-menu' : 'iphone-share-bar';
}

/** Android browsers that offer one-tap install: show our "Install" sheet on its own (same snooze as iPhone). */
export function shouldAutoShowNativeInstall(env: InstallEnvironment & { canInstall: boolean }): boolean {
  if (env.standalone || env.dismissed || !env.canInstall) return false;
  if (installGuidePlatform(env.userAgent) !== 'android') return false;
  return !isQuietPath(env.pathname);
}
