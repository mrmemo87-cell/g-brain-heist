export type IeltsFunnelEventName =
  | 'ielts_landing_view'
  | 'ielts_start_free_assessment_click'
  | 'ielts_auth_required_for_diagnostic'
  | 'ielts_diagnostic_started'
  | 'ielts_diagnostic_completed'
  | 'ielts_result_viewed'
  | 'ielts_prime_upsell_click'
  | 'ielts_prime_checkout_autostart'
  | 'ielts_prime_checkout_started'
  | 'ielts_prime_checkout_error';

export type IeltsFunnelUserType = 'independent' | 'school';

export interface IeltsFunnelEventMetadata {
  skill?: 'reading' | 'listening' | 'writing' | 'speaking';
  content_id?: string | number;
  task_id?: string | number;
  estimated_band?: number | string | null;
  plan?: string | null;
  user_type?: IeltsFunnelUserType;
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

const allowedMetadataKeys = new Set<keyof IeltsFunnelEventMetadata>([
  'skill',
  'content_id',
  'task_id',
  'estimated_band',
  'plan',
  'user_type',
]);

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

export const trackIeltsFunnelEvent = (
  eventName: IeltsFunnelEventName,
  metadata: IeltsFunnelEventMetadata = {},
): void => {
  if (typeof window === 'undefined') return;

  const safeMetadata = sanitizeMetadata(metadata);
  const payload = {
    event: eventName,
    ...safeMetadata,
  };

  window.dispatchEvent(new CustomEvent('ielts-funnel-event', { detail: payload }));
  window.dataLayer?.push(payload);
  window.gtag?.('event', eventName, safeMetadata);
  window.fbq?.('trackCustom', eventName, safeMetadata);

  if (import.meta.env.DEV) {
    console.info('[ielts-funnel]', eventName, safeMetadata);
  }
};
