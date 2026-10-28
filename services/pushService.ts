import { supabase } from './supabaseClient';
import { getEnvVar } from './env';
import { detectStandalone } from '../src/lib/installPrompt';
import { platformLabel, pushAvailability, urlBase64ToUint8Array, type PushAvailability } from '../src/lib/pushSupport';

// The VAPID public key is public by design (it is sent to the browser on subscribe).
// VITE_VAPID_PUBLIC_KEY overrides it so the key can be rotated without a code change.
const DEFAULT_VAPID_PUBLIC_KEY = 'BLeVbWXqJxp1nsijqPk9Z1bTKm4bI2RDmoxCPzVTF9g3BL0wPvvMbmZWp2hlGlrAqaowtW-DxsoWT7_FVKtNiOc';

export const getVapidPublicKey = (): string | null => {
  const key = getEnvVar('VITE_VAPID_PUBLIC_KEY') || DEFAULT_VAPID_PUBLIC_KEY;
  return key && !key.startsWith('__') ? key : null;
};

export function getPushAvailability(): PushAvailability {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' };
  if (!getVapidPublicKey()) return { ok: false, reason: 'unsupported' };
  return pushAvailability({
    secureContext: window.isSecureContext,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unknown',
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    standalone: detectStandalone(window as unknown as Parameters<typeof detectStandalone>[0]),
  });
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** True when this device already has a live subscription saved for the signed-in user. */
export async function isPushEnabledOnThisDevice(): Promise<boolean> {
  try {
    if (!getPushAvailability().ok) return false;
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    return Boolean(sub);
  } catch { return false; }
}

/** Must be called from a user gesture (tap), as iOS requires for Notification.requestPermission. */
export async function enablePushOnThisDevice(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const availability = getPushAvailability();
  if (!availability.ok) return { ok: false, reason: availability.reason };
  const vapid = getVapidPublicKey();
  if (!vapid) return { ok: false, reason: 'unsupported' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'signed_out' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) }));
  const json = sub.toJSON();
  const p256dh = json.keys?.['p256dh'];
  const authKey = json.keys?.['auth'];
  if (!json.endpoint || !p256dh || !authKey) return { ok: false, reason: 'bad_subscription' };

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: json.endpoint,
    p256dh,
    auth: authKey,
    user_agent: navigator.userAgent.slice(0, 300),
    platform: platformLabel(navigator.userAgent),
    last_seen_at: new Date().toISOString(),
    disabled_at: null,
    disabled_reason: null,
  }, { onConflict: 'endpoint' });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function disablePushOnThisDevice(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  } catch { /* Best effort: the dispatcher disables dead endpoints on 404/410. */ }
}

/** "Game alerts" (PvP and streak reminders). No saved row means on. */
export async function getGameAlertsEnabled(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return true;
    const { data } = await supabase.from('push_preferences').select('game_events').eq('user_id', user.id).maybeSingle();
    return data ? Boolean((data as { game_events: boolean }).game_events) : true;
  } catch { return true; }
}

export async function setGameAlertsEnabled(enabled: boolean): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase.from('push_preferences')
    .upsert({ user_id: user.id, game_events: enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return !error;
}
