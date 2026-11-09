// Anonymous funnel steps for the owner's IELTS growth report (marketing/UX analytics only, never academic evidence).
// Uses the landing page's visitor id; never records anything for team members or signed-in learners' answers.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

const isBot = (): boolean => Boolean(navigator.webdriver) || /bot|crawl|spider|headless|preview/i.test(navigator.userAgent || '');

const newId = (): string =>
  (crypto && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });

/**
 * Ads can link straight to /ielts/start, skipping the landing page that normally creates the anonymous visitor id
 * and stores the first campaign tags. Do the same here (never for team members or bots), so the growth report and
 * sign-up attribution still see these visitors.
 */
export const ensureIeltsEntry = (landing: string): void => {
  try {
    if (window.localStorage.getItem('bh_site_member') || isBot()) return;
    if (!window.localStorage.getItem('bh_site_visitor_id')) window.localStorage.setItem('bh_site_visitor_id', newId());
    if (!window.localStorage.getItem('bh_ielts_first_touch')) {
      const params = new URLSearchParams(window.location.search);
      const found: Record<string, string> = {};
      for (const key of [...UTM_KEYS, 'ref'] as const) {
        const v = params.get(key);
        if (v) found[key] = v.slice(0, 100);
      }
      if (Object.keys(found).length) {
        found['landing'] = landing;
        found['at'] = new Date().toISOString();
        window.localStorage.setItem('bh_ielts_first_touch', JSON.stringify(found));
      }
    }
  } catch { /* storage blocked: tracking is optional */ }
};

export const trackIeltsStep = (path: string, referrerHost?: string | null): void => {
  try {
    if (window.localStorage.getItem('bh_site_member') || isBot()) return;
    const visitorId = window.localStorage.getItem('bh_site_visitor_id');
    if (!visitorId || !navigator.sendBeacon) return;
    let utm: Record<string, unknown> = {};
    try { utm = JSON.parse(window.localStorage.getItem('bh_ielts_first_touch') || '{}'); } catch { utm = {}; }
    const clean: Record<string, string> = {};
    for (const key of UTM_KEYS) if (typeof utm[key] === 'string') clean[key] = (utm[key] as string).slice(0, 120);
    const body = JSON.stringify({
      visitorId,
      path,
      referrerHost: referrerHost ?? null,
      utm: clean,
      device: /mobi|iphone|android/i.test(navigator.userAgent) ? 'phone' : 'desktop',
      locale: (navigator.language || '').slice(0, 20),
    });
    navigator.sendBeacon('/api/site-visit', new Blob([body], { type: 'application/json' }));
  } catch { /* analytics is optional */ }
};

// Guest progress kept on the phone until the learner creates an account (UX recovery data only).
const GUEST_KEY = 'bh_ielts_guest_start';

export interface IeltsGuestProgress {
  quizScore?: number;
  quizTotal?: number;
  lessonDone?: boolean;
  unitId?: number;
  at?: string;
}

export const readIeltsGuestProgress = (): IeltsGuestProgress | null => {
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    return raw ? (JSON.parse(raw) as IeltsGuestProgress) : null;
  } catch { return null; }
};

export const saveIeltsGuestProgress = (patch: IeltsGuestProgress): void => {
  try {
    const next = { ...(readIeltsGuestProgress() || {}), ...patch, at: new Date().toISOString() };
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(next));
  } catch { /* storage blocked: the flow still works, it just can't carry progress over */ }
};

export const clearIeltsGuestProgress = (): void => {
  try { window.localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
};
