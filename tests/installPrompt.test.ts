import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTALL_GUIDE_DISMISSED_KEY,
  detectStandalone,
  isIosSafari,
  isQuietPath,
  readInstallGuideDismissed,
  shouldShowIosInstallGuide,
  writeInstallGuideDismissed,
} from '../src/lib/installPrompt';

const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0 Mobile/15E148 Safari/604.1';
const IOS_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0 Safari/604.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

test('only iPhone/iPad Safari qualifies; other iOS browsers, in-app browsers, Android and desktop do not', () => {
  assert.equal(isIosSafari(IOS_SAFARI), true);
  assert.equal(isIosSafari(IPAD_SAFARI_DESKTOP_UA), true);
  assert.equal(isIosSafari(IOS_CHROME), false);
  assert.equal(isIosSafari(IOS_INSTAGRAM), false);
  assert.equal(isIosSafari(ANDROID_CHROME), false);
  assert.equal(isIosSafari(MAC_SAFARI), false);
  assert.equal(isIosSafari(''), false);
});

test('timed, recorded and auth routes are quiet; dashboard and IELTS home are not', () => {
  for (const quiet of ['/ielts/exam/abc', '/ielts/session/1', '/ielts/speaking/9', '/ielts/speaking-pilot', '/ielts/listening/3', '/ielts/writing/4', '/ielts/reading/5', '/auth/callback', '/auth/reset', '/presentation', '/booked']) {
    assert.equal(isQuietPath(quiet), true, quiet);
  }
  for (const open of ['/', '/ielts', '/ielts/journey', '/ielts/practice/assigned']) {
    assert.equal(isQuietPath(open), false, open);
  }
});

test('the guide shows once, on iOS Safari, in the browser, outside quiet routes', () => {
  const base = { userAgent: IOS_SAFARI, standalone: false, pathname: '/', dismissed: false };
  assert.equal(shouldShowIosInstallGuide(base), true);
  assert.equal(shouldShowIosInstallGuide({ ...base, standalone: true }), false, 'already installed');
  assert.equal(shouldShowIosInstallGuide({ ...base, dismissed: true }), false, 'dismissed earlier');
  assert.equal(shouldShowIosInstallGuide({ ...base, pathname: '/ielts/exam/x' }), false, 'quiet route');
  assert.equal(shouldShowIosInstallGuide({ ...base, userAgent: ANDROID_CHROME }), false, 'Android has its own install prompt');
});

test('"not now" snoozes the guide for 7 days, and it stops after 3 times; blocked storage is safe', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  const day = 24 * 60 * 60 * 1000;
  const t0 = Date.UTC(2026, 9, 29);
  assert.equal(readInstallGuideDismissed(storage, t0), false);
  writeInstallGuideDismissed(storage, t0);
  assert.equal(JSON.parse(store.get(INSTALL_GUIDE_DISMISSED_KEY) as string).count, 1);
  assert.equal(readInstallGuideDismissed(storage, t0 + 6 * day), true, 'still snoozed after 6 days');
  assert.equal(readInstallGuideDismissed(storage, t0 + 8 * day), false, 'back after a week');
  writeInstallGuideDismissed(storage, t0 + 8 * day);
  writeInstallGuideDismissed(storage, t0 + 16 * day);
  assert.equal(readInstallGuideDismissed(storage, t0 + 400 * day), true, 'stops after the 3rd "not now"');
  store.set(INSTALL_GUIDE_DISMISSED_KEY, '1');
  assert.equal(readInstallGuideDismissed(storage, t0), false, 'old permanent dismissals get one more chance');
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(readInstallGuideDismissed(blocked), false);
  assert.doesNotThrow(() => writeInstallGuideDismissed(blocked));
  assert.equal(readInstallGuideDismissed(undefined), false);
});

test('standalone detection accepts the display-mode media query or navigator.standalone', () => {
  assert.equal(detectStandalone({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(detectStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }), true);
  assert.equal(detectStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: false } }), false);
  assert.equal(detectStandalone({ matchMedia: () => { throw new Error('no matchMedia'); }, navigator: {} }), false);
  assert.equal(detectStandalone(undefined), false);
});

test('"How to install" picks iPhone, Android or generic steps', async () => {
  const { installGuidePlatform, openInstallGuide, INSTALL_GUIDE_OPEN_EVENT } = await import('../src/lib/installPrompt');
  assert.equal(installGuidePlatform(IOS_SAFARI), 'ios');
  assert.equal(installGuidePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5), 'ios');
  assert.equal(installGuidePlatform(ANDROID_CHROME), 'android');
  assert.equal(installGuidePlatform('Mozilla/5.0 (Windows NT 10.0) Chrome/125'), 'other');
  const fired: string[] = [];
  openInstallGuide({ dispatchEvent: (e: Event) => { fired.push(e.type); return true; } });
  assert.deepEqual(fired, [INSTALL_GUIDE_OPEN_EVENT]);
});
