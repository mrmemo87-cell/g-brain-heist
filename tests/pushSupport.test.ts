import test from 'node:test';
import assert from 'node:assert/strict';
import { platformLabel, pushAvailability, urlBase64ToUint8Array } from '../src/lib/pushSupport';

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36';
const base = { secureContext: true, hasServiceWorker: true, hasPushManager: true, hasNotification: true, permission: 'default' as const, userAgent: ANDROID, standalone: false };

test('push is offered on Android/desktop browsers, and on iPhone only from the Home Screen app', () => {
  assert.deepEqual(pushAvailability(base), { ok: true });
  assert.deepEqual(pushAvailability({ ...base, userAgent: IOS, standalone: false, hasPushManager: false }), { ok: false, reason: 'ios_needs_home_screen' });
  assert.deepEqual(pushAvailability({ ...base, userAgent: IOS, standalone: true }), { ok: true });
});

test('blocked permission, missing APIs and insecure pages are reported, not attempted', () => {
  assert.deepEqual(pushAvailability({ ...base, permission: 'denied' }), { ok: false, reason: 'denied' });
  assert.deepEqual(pushAvailability({ ...base, hasPushManager: false }), { ok: false, reason: 'unsupported' });
  assert.deepEqual(pushAvailability({ ...base, hasServiceWorker: false }), { ok: false, reason: 'unsupported' });
  assert.deepEqual(pushAvailability({ ...base, secureContext: false }), { ok: false, reason: 'insecure_context' });
});

test('VAPID key decoding and platform labels', () => {
  const bytes = urlBase64ToUint8Array('AQID_-8'); // 01 02 03 FF EF
  assert.deepEqual(Array.from(bytes), [1, 2, 3, 255, 239]);
  assert.equal(platformLabel(IOS), 'ios');
  assert.equal(platformLabel(ANDROID), 'android');
  assert.equal(platformLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/125'), 'web');
});
