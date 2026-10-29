import test from 'node:test';
import assert from 'node:assert/strict';
import { NATIVE_INSTALL_CHANGED_EVENT, createNativeInstall } from '../src/lib/nativeInstall';
import { iosShareLayout, shouldAutoShowNativeInstall } from '../src/lib/installPrompt';
import { shouldOfferOnFirstLaunch } from '../src/lib/pushMoment';

const fakePromptEvent = (outcome: 'accepted' | 'dismissed') => {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; prompted: number;
  };
  event.prompted = 0;
  event.prompt = async () => { event.prompted += 1; };
  event.userChoice = Promise.resolve({ outcome });
  return event;
};

test('Android one-tap install: captured early, used once by a tap, gone after install', async () => {
  const target = new EventTarget();
  let changes = 0;
  target.addEventListener(NATIVE_INSTALL_CHANGED_EVENT, () => { changes += 1; });
  const install = createNativeInstall(target);
  install.start();
  install.start(); // idempotent
  assert.equal(install.canInstall(), false);
  assert.equal(await install.prompt(), 'unavailable');

  const offer = fakePromptEvent('accepted');
  target.dispatchEvent(offer);
  assert.equal(offer.defaultPrevented, true, 'our button replaces the browser mini-bar');
  assert.equal(install.canInstall(), true);
  assert.equal(await install.prompt(), 'accepted');
  assert.equal(offer.prompted, 1);
  assert.equal(install.canInstall(), false, 'a captured prompt can be used only once');
  assert.equal(install.wasInstalled(), true);

  const again = fakePromptEvent('dismissed');
  target.dispatchEvent(again);
  assert.equal(await install.prompt(), 'dismissed');
  target.dispatchEvent(fakePromptEvent('dismissed'));
  target.dispatchEvent(new Event('appinstalled'));
  assert.equal(install.canInstall(), false);
  assert.ok(changes >= 5);
});

test('no window (server render) is safe', async () => {
  const install = createNativeInstall(undefined);
  assert.doesNotThrow(() => install.start());
  assert.equal(await install.prompt(), 'unavailable');
});

const IOS17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IOS26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

test('the arrow points at the right Safari button for each iPhone/iPad', () => {
  assert.equal(iosShareLayout(IOS26), 'iphone-more-menu');
  assert.equal(iosShareLayout(IOS17), 'iphone-share-bar');
  assert.equal(iosShareLayout(IPAD, 5), 'ipad-top');
  assert.equal(iosShareLayout(''), 'iphone-share-bar');
});

test('the Install sheet opens on its own only on Android, when the browser allows it', () => {
  const base = { userAgent: ANDROID, standalone: false, pathname: '/', dismissed: false, canInstall: true };
  assert.equal(shouldAutoShowNativeInstall(base), true);
  assert.equal(shouldAutoShowNativeInstall({ ...base, canInstall: false }), false);
  assert.equal(shouldAutoShowNativeInstall({ ...base, standalone: true }), false);
  assert.equal(shouldAutoShowNativeInstall({ ...base, dismissed: true }), false);
  assert.equal(shouldAutoShowNativeInstall({ ...base, pathname: '/ielts/exam/abc' }), false);
  assert.equal(shouldAutoShowNativeInstall({ ...base, userAgent: DESKTOP_CHROME }), false, 'no pop-up on teacher laptops');
});

test('first open from the Home Screen offers notifications once, only when signed in and useful', () => {
  const base = { standalone: true, pushAvailable: true, pushEnabled: false, signedIn: true, alreadyOffered: false, quietPath: false };
  assert.equal(shouldOfferOnFirstLaunch(base), true);
  assert.equal(shouldOfferOnFirstLaunch({ ...base, standalone: false }), false);
  assert.equal(shouldOfferOnFirstLaunch({ ...base, pushAvailable: false }), false);
  assert.equal(shouldOfferOnFirstLaunch({ ...base, pushEnabled: true }), false);
  assert.equal(shouldOfferOnFirstLaunch({ ...base, signedIn: false }), false);
  assert.equal(shouldOfferOnFirstLaunch({ ...base, alreadyOffered: true }), false);
  assert.equal(shouldOfferOnFirstLaunch({ ...base, quietPath: true }), false);
});
