import { supabase } from './supabaseClient';

export const IELTS_FUNNEL_EVENTS = [
  'landing_view',
  'start_free_assessment_click',
  'auth_required_for_diagnostic',
  'diagnostic_started',
  'diagnostic_completed',
  'result_viewed',
  'prime_upsell_click',
  'checkout_started',
  'checkout_opened',
  'checkout_completed',
  'subscription_activated',
  'funnel_error',
] as const;

export type IeltsFunnelEventName = typeof IELTS_FUNNEL_EVENTS[number];
export type IeltsFunnelUserType = 'independent' | 'school';

export interface IeltsFunnelEventMetadata {
  skill?: 'reading' | 'listening' | 'writing' | 'speaking';
  content_id?: string | number;
  task_id?: string | number;
  estimated_band?: number | string | null;
  plan?: string | null;
  user_type?: IeltsFunnelUserType;
  checkout_surface?: string;
  error_code?: string;
  price_id?: string | null;
  product_id?: string | null;
  subscription_id?: string | null;
  interval?: string | null;
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

const allowedMetadataKeys = new Set<keyof IeltsFunnelEventMetadata>([
  'skill', 'content_id', 'task_id', 'estimated_band', 'plan', 'user_type',
  'checkout_surface', 'error_code', 'price_id', 'product_id', 'subscription_id', 'interval',
]);

const getSessionId = () => {
  if (typeof window === 'undefined') return null;
  const key = 'ielts_funnel_session_id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
};

const sanitizeMetadata = (metadata: IeltsFunnelEventMetadata = {}): IeltsFunnelEventMetadata => {
  const safe: IeltsFunnelEventMetadata = {};
  for (const [key, value] of Object.entries(metadata) as Array<[keyof IeltsFunnelEventMetadata, unknown]>) {
    if (!allowedMetadataKeys.has(key) || value === undefined || value === '') continue;
    if (typeof value === 'string' || typeof value === 'number' || value === null) {
      (safe as Record<string, string | number | null>)[key] = value;
    }
  }
  return safe;
};

export const trackIeltsFunnelEvent = (eventName: IeltsFunnelEventName, metadata: IeltsFunnelEventMetadata = {}): void => {
  if (typeof window === 'undefined') return;

  const safeMetadata = sanitizeMetadata(metadata);
  const search = new URLSearchParams(window.location.search);
  const payload = { event: eventName, ...safeMetadata };

  window.dispatchEvent(new CustomEvent('ielts-funnel-event', { detail: payload }));
  window.dataLayer?.push(payload);
  window.gtag?.('event', eventName, safeMetadata);
  window.fbq?.('trackCustom', eventName, safeMetadata);

  void (async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from('ielts_funnel_events').insert({
        user_id: auth.user?.id ?? null,
        session_id: getSessionId(),
        event_name: eventName,
        route: window.location.pathname,
        source: search.get('utm_source'),
        medium: search.get('utm_medium'),
        campaign: search.get('utm_campaign'),
        metadata: safeMetadata,
      });
      if (error && import.meta.env.DEV) console.warn('[ielts-funnel] insert failed', error.message);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[ielts-funnel] tracking failed', error);
    }
  })();
};
