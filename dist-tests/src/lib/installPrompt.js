// Decides when to show the "Add to Home Screen" guide.
// Pure functions only, so the rules are unit-testable without a browser.
import { isSnoozed, readSnooze, recordSnooze } from './promptSnooze.js';
export const INSTALL_GUIDE_DISMISSED_KEY = 'brains-heist:install-guide-dismissed:v1';
/** "Not now" hides the guide for this many days... */
export const INSTALL_GUIDE_SNOOZE_DAYS = 7;
/** ...and after this many "not now"s it stops appearing on its own (Settings → How to install still works). */
export const INSTALL_GUIDE_MAX_SNOOZES = 3;
/** Routes where a sheet over the content would interrupt timed or recorded work. */
const QUIET_PATH_PREFIXES = ['/ielts/exam/', '/ielts/session/', '/ielts/speaking', '/ielts/listening/', '/ielts/writing/', '/ielts/reading/', '/auth/', '/presentation', '/booked'];
/** iPhone/iPad Safari (not Chrome, Firefox or in-app browsers, which cannot add to Home Screen). */
export function isIosSafari(userAgent) {
    const ua = userAgent || '';
    const isIosDevice = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
    if (!isIosDevice)
        return false;
    const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/i.test(ua);
    const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|Telegram|WhatsApp|TikTok|Snapchat/i.test(ua);
    return /Safari/i.test(ua) && !isOtherBrowser && !isInAppBrowser;
}
export function isQuietPath(pathname) {
    return QUIET_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
export function shouldShowIosInstallGuide(env) {
    if (env.standalone || env.dismissed)
        return false;
    if (!isIosSafari(env.userAgent))
        return false;
    return !isQuietPath(env.pathname);
}
/** True while a "not now" is in effect (7 days), or after the student has said it 3 times. */
export function readInstallGuideDismissed(storage, now = Date.now()) {
    return isSnoozed(readSnooze(storage, INSTALL_GUIDE_DISMISSED_KEY), now, INSTALL_GUIDE_MAX_SNOOZES);
}
export function writeInstallGuideDismissed(storage, now = Date.now()) {
    recordSnooze(storage, INSTALL_GUIDE_DISMISSED_KEY, now, INSTALL_GUIDE_SNOOZE_DAYS);
}
export function detectStandalone(win) {
    if (!win)
        return false;
    try {
        if (win.matchMedia?.('(display-mode: standalone)').matches)
            return true;
    }
    catch { /* matchMedia may be missing in some WebViews. */ }
    return win.navigator?.standalone === true;
}
/** Fired by "How to install" in Settings; the guide listens and opens even if dismissed or installed. */
export const INSTALL_GUIDE_OPEN_EVENT = 'brains-heist:open-install-guide';
export function openInstallGuide(win = typeof window === 'undefined' ? undefined : window) {
    try {
        win?.dispatchEvent(new Event(INSTALL_GUIDE_OPEN_EVENT));
    }
    catch { /* Old WebViews without Event constructor. */ }
}
/** Which steps to show: iPhone/iPad (incl. "desktop website" mode), Android, or anything else. */
export function installGuidePlatform(userAgent, maxTouchPoints = 0) {
    const ua = userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (/Mobile/i.test(ua) || maxTouchPoints > 1)))
        return 'ios';
    if (/Android/i.test(ua))
        return 'android';
    return 'other';
}
export function iosShareLayout(userAgent, maxTouchPoints = 0) {
    const ua = userAgent || '';
    if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && (/Mobile/i.test(ua) || maxTouchPoints > 1)))
        return 'ipad-top';
    const version = /Version\/(\d+)/.exec(ua);
    return version && Number(version[1]) >= 26 ? 'iphone-more-menu' : 'iphone-share-bar';
}
/** Android browsers that offer one-tap install: show our "Install" sheet on its own (same snooze as iPhone). */
export function shouldAutoShowNativeInstall(env) {
    if (env.standalone || env.dismissed || !env.canInstall)
        return false;
    if (installGuidePlatform(env.userAgent) !== 'android')
        return false;
    return !isQuietPath(env.pathname);
}
