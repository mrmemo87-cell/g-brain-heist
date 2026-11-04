import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_SITE_URL, inAppPathFromUrl, isNativeApp, nativePlatform, publicSiteUrl } from '../src/lib/nativePlatform';

const nativeWindow = (platform: string, native = true) => ({
  Capacitor: { isNativePlatform: () => native, getPlatform: () => platform },
});

test('native platform: browser and home-screen web app count as web', () => {
  assert.equal(nativePlatform(undefined), 'web');
  assert.equal(nativePlatform({}), 'web');
  assert.equal(nativePlatform(nativeWindow('web', false)), 'web');
  assert.equal(isNativeApp({}), false);
});

test('native platform: iPhone and Android apps are detected', () => {
  assert.equal(nativePlatform(nativeWindow('ios')), 'ios');
  assert.equal(nativePlatform(nativeWindow('android')), 'android');
  assert.equal(isNativeApp(nativeWindow('ios')), true);
  assert.equal(nativePlatform(nativeWindow('electron')), 'web', 'unknown native shells fall back to web behaviour');
});

test('native platform: a broken Capacitor global never throws', () => {
  const broken = { Capacitor: { isNativePlatform: () => { throw new Error('boom'); } } };
  assert.equal(nativePlatform(broken), 'web');
});

test('publicSiteUrl keeps relative paths on the web and points the app at brainsheist.com', () => {
  assert.equal(publicSiteUrl('/api/site-visit', {}), '/api/site-visit');
  assert.equal(publicSiteUrl('/api/site-visit', nativeWindow('android')), `${PUBLIC_SITE_URL}/api/site-visit`);
  assert.equal(publicSiteUrl('privacy.html', nativeWindow('ios')), `${PUBLIC_SITE_URL}/privacy.html`);
  assert.equal(publicSiteUrl('https://example.org/x', nativeWindow('ios')), 'https://example.org/x');
});

test('inAppPathFromUrl maps site and scheme links to in-app paths and ignores others', () => {
  assert.equal(inAppPathFromUrl('https://brainsheist.com/auth/callback?code=abc#x'), '/auth/callback?code=abc#x');
  assert.equal(inAppPathFromUrl('https://www.brainsheist.com/ielts/course'), '/ielts/course');
  assert.equal(inAppPathFromUrl('brainsheist://auth/callback?code=abc'), '/auth/callback?code=abc');
  assert.equal(inAppPathFromUrl('brainsheist://'), '/');
  assert.equal(inAppPathFromUrl('https://evil.example/auth/callback'), null);
  assert.equal(inAppPathFromUrl('http://brainsheist.com/'), null, 'plain http is never trusted');
  assert.equal(inAppPathFromUrl('not a url'), null);
});
