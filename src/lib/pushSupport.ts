// Pure rules for when Web Push can be offered. Testable without a browser.

export type PushAvailability =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'ios_needs_home_screen' | 'denied' | 'insecure_context' };

export interface PushEnvironment {
  secureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: 'default' | 'granted' | 'denied' | 'unknown';
  userAgent: string;
  standalone: boolean;
  /** navigator.maxTouchPoints — iPhone/iPad in "desktop website" mode report a Mac user agent with touch. */
  maxTouchPoints?: number;
}

export const isIosDevice = (ua: string, maxTouchPoints = 0) =>
  /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (/Mobile/i.test(ua) || maxTouchPoints > 1));

export function pushAvailability(env: PushEnvironment): PushAvailability {
  if (!env.secureContext) return { ok: false, reason: 'insecure_context' };
  if (env.permission === 'denied') return { ok: false, reason: 'denied' };
  // iOS exposes PushManager only inside a Home Screen app (iOS 16.4+). In Safari tabs it is absent.
  if (isIosDevice(env.userAgent, env.maxTouchPoints) && !env.standalone) return { ok: false, reason: 'ios_needs_home_screen' };
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return { ok: false, reason: 'unsupported' };
  return { ok: true };
}

/** Converts a base64url VAPID public key into the Uint8Array PushManager.subscribe expects. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function platformLabel(ua: string): string {
  if (isIosDevice(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}
