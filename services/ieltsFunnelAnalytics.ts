import { supabase } from './supabaseClient';

export const IELTS_FUNNEL_EVENTS = [
  'landing_view',
  'start_free_assessment_click',
  'auth_required_for_diagnostic',
  'diagnostic_started',
  'diagnostic_completed',
  'result_viewed',
  'dashboard_viewed',
  'prime_dashboard_viewed',
  'diagnostic_retake_blocked',
  'prime_upsell_click',
  'checkout_started',
  'checkout_opened',
  'checkout_completed',
  'subscription_activated',
  'auth_required_for_result',
  'diagnostic_completed_pending_auth',
  'diagnostic_saved_after_auth',
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
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  event_id?: string | null;
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
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'landing_page', 'referrer', 'event_id',
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

const getStoredAttribution = () => {
  if (typeof window === 'undefined') return { source: null, medium: null, campaign: null, content: null, term: null };
  const search = new URLSearchParams(window.location.search);
  const key = 'ielts_funnel_attribution';
  const current = {
    source: search.get('utm_source'),
    medium: search.get('utm_medium'),
    campaign: search.get('utm_campaign'),
    content: search.get('utm_content'),
    term: search.get('utm_term'),
  };
  const fbclid = search.get('fbclid');
  if (fbclid && !document.cookie.includes('_fbc=')) {
    document.cookie = `_fbc=fb.1.${Date.now()}.${fbclid}; path=/; max-age=7776000; SameSite=Lax`;
  }
  if (Object.values(current).some(Boolean)) {
    window.localStorage.setItem(key, JSON.stringify(current));
    return current;
  }
  try {
    return { ...{ source: null, medium: null, campaign: null, content: null, term: null }, ...JSON.parse(window.localStorage.getItem(key) || '{}') };
  } catch {
    return { source: null, medium: null, campaign: null, content: null, term: null };
  }
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

const buildFunnelPayload = (metadata: IeltsFunnelEventMetadata = {}) => {
  const attribution = getStoredAttribution();
  const safeMetadata = sanitizeMetadata({
    ...metadata,
    landing_page: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : null,
    referrer: typeof document !== 'undefined' ? document.referrer || null : null,
    utm_source: attribution.source,
    utm_medium: attribution.medium,
    utm_campaign: attribution.campaign,
    utm_content: attribution.content,
    utm_term: attribution.term,
  });
  return { attribution, safeMetadata };
};

const META_PIXEL_ID = import.meta.env['VITE_META_PIXEL_ID'] as string | undefined;
let metaPixelLoaded = false;

const getCookie = (name: string) => typeof document === 'undefined' ? null : document.cookie.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1) || null;

const ensureMetaPixel = () => {
  if (typeof window === 'undefined' || !META_PIXEL_ID) return false;
  if (!metaPixelLoaded) {
    if (!window.fbq) {
      const fbq = (...args: unknown[]) => {
        const state = fbq as typeof fbq & { callMethod?: (...callArgs: unknown[]) => void; queue: unknown[] };
        if (state.callMethod) state.callMethod(...args);
        else state.queue.push(args);
      };
      (fbq as typeof fbq & { push: typeof fbq; loaded: boolean; version: string; queue: unknown[] }).push = fbq;
      (fbq as typeof fbq & { loaded: boolean }).loaded = true;
      (fbq as typeof fbq & { version: string }).version = '2.0';
      (fbq as typeof fbq & { queue: unknown[] }).queue = [];
      window.fbq = fbq;
    }
    const script = document.createElement('script');
    script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
    window.fbq('init', META_PIXEL_ID);
    metaPixelLoaded = true;
  }
  return true;
};

const metaEventMap: Partial<Record<IeltsFunnelEventName, { name: string; standard?: boolean; capi?: boolean }>> = {
  landing_view: { name: 'PageView', standard: true },
  start_free_assessment_click: { name: 'StartFreeAssessment' },
  diagnostic_started: { name: 'DiagnosticStarted', capi: true },
  diagnostic_completed: { name: 'Lead', standard: true, capi: true },
  prime_upsell_click: { name: 'PrimeUpsellClick' },
  checkout_started: { name: 'InitiateCheckout', standard: true, capi: true },
  checkout_opened: { name: 'CheckoutOpened', capi: true },
};

const getEventId = (eventName: IeltsFunnelEventName, metadata: IeltsFunnelEventMetadata) => {
  if (metadata.event_id) return String(metadata.event_id);
  return `${getSessionId() || 'session'}:${eventName}:${metadata.task_id || metadata.content_id || metadata.plan || window.location.pathname}:${Date.now()}`;
};

const trackMetaEvent = (eventName: IeltsFunnelEventName, safeMetadata: IeltsFunnelEventMetadata) => {
  const mapping = metaEventMap[eventName];
  if (!mapping) return;
  const eventId = getEventId(eventName, safeMetadata);
  const params = { ...safeMetadata, event_id: undefined };
  if (ensureMetaPixel()) {
    const method = mapping.standard ? 'track' : 'trackCustom';
    window.fbq?.(method, mapping.name, params, { eventID: eventId });
  }
  if (mapping.capi) {
    void supabase.functions.invoke('meta_capi', { body: { event_name: eventName, event_id: eventId, event_source_url: window.location.href, metadata: params, cookies: { fbp: getCookie('_fbp'), fbc: getCookie('_fbc') } } }).catch(() => undefined);
  }
};

const dispatchFunnelEvent = (eventName: IeltsFunnelEventName, safeMetadata: IeltsFunnelEventMetadata) => {
  const payload = { event: eventName, ...safeMetadata };
  window.dispatchEvent(new CustomEvent('ielts-funnel-event', { detail: payload }));
  window.dataLayer?.push(payload);
  window.gtag?.('event', eventName, safeMetadata);
  trackMetaEvent(eventName, safeMetadata);
};

const insertFunnelEvent = async (
  eventName: IeltsFunnelEventName,
  metadata: IeltsFunnelEventMetadata = {},
  options: { requireAuthenticatedUser?: boolean } = {}
): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const { attribution, safeMetadata } = buildFunnelPayload(metadata);
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;
  if (options.requireAuthenticatedUser && !userId) return false;

  const { error } = await supabase.from('ielts_funnel_events').insert({
    user_id: userId,
    session_id: getSessionId(),
    event_name: eventName,
    route: window.location.pathname,
    source: attribution.source,
    medium: attribution.medium,
    campaign: attribution.campaign,
    utm_source: attribution.source,
    utm_medium: attribution.medium,
    utm_campaign: attribution.campaign,
    utm_content: attribution.content,
    utm_term: attribution.term,
    referrer: document.referrer || null,
    landing_page: `${window.location.pathname}${window.location.search}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    event_idempotency_key: safeMetadata.event_id || null,
    metadata: safeMetadata,
  });
  if (error) {
    if (error.code === '23505') return true;
    if (import.meta.env.DEV) console.warn('[ielts-funnel] insert failed', error.message);
    return false;
  }
  return true;
};

export const trackIeltsFunnelEvent = (eventName: IeltsFunnelEventName, metadata: IeltsFunnelEventMetadata = {}): void => {
  if (typeof window === 'undefined') return;

  const { safeMetadata } = buildFunnelPayload(metadata);
  dispatchFunnelEvent(eventName, safeMetadata);

  void insertFunnelEvent(eventName, metadata).catch((error) => {
    if (import.meta.env.DEV) console.warn('[ielts-funnel] tracking failed', error);
  });
};

export const recordDiagnosticCompleted = async (metadata: IeltsFunnelEventMetadata): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const { safeMetadata } = buildFunnelPayload(metadata);
  try {
    const recorded = await insertFunnelEvent('diagnostic_completed', metadata, { requireAuthenticatedUser: true });
    if (!recorded) return false;
    dispatchFunnelEvent('diagnostic_completed', safeMetadata);
    return true;
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[ielts-funnel] diagnostic completion failed', error);
    return false;
  }
};

export interface PendingDiagnosticResult {
  task_id: 'trial-test-2';
  skill: 'listening';
  percentage: number;
  bandScore: number;
  completedAt: string;
  event_id: string;
}

const PENDING_DIAGNOSTIC_KEY = 'ielts_pending_diagnostic_result';

export const savePendingDiagnosticResult = (result: PendingDiagnosticResult): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PENDING_DIAGNOSTIC_KEY, JSON.stringify(result));
};

export const readPendingDiagnosticResult = (): PendingDiagnosticResult | null => {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_DIAGNOSTIC_KEY) || 'null') as PendingDiagnosticResult | null;
    return parsed?.task_id === 'trial-test-2' ? parsed : null;
  } catch { return null; }
};

export const clearPendingDiagnosticResult = (): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PENDING_DIAGNOSTIC_KEY);
};

export const persistPendingDiagnosticAfterAuth = async (): Promise<boolean> => {
  const pending = readPendingDiagnosticResult();
  if (!pending) return false;
  const recorded = await recordDiagnosticCompleted({
    skill: pending.skill,
    task_id: pending.task_id,
    estimated_band: pending.bandScore,
    user_type: 'independent',
    event_id: pending.event_id,
  });
  if (!recorded) return false;
  trackIeltsFunnelEvent('diagnostic_saved_after_auth', { skill: pending.skill, task_id: pending.task_id, estimated_band: pending.bandScore, user_type: 'independent' });
  clearPendingDiagnosticResult();
  window.localStorage.setItem('ielts_diagnostic_submitted_recently', String(Date.now()));
  return true;
};
