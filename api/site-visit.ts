import type { VercelRequest, VercelResponse } from '@vercel/node';

// Records one anonymous page view on brainsheist.com for the superadmin "Site Visitors" tab.
// Only people who are not signed in are tracked (the browser decides that before calling).
// Approximate country and city come from Vercel's edge headers; no IP address is stored.

const header = (request: VercelRequest, name: string): string | null => {
  const value = request.headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return raw; }
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|scanner|facebookexternalhit|embedly|quora link|whatsapp|telegram/i;

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ ok: false });
  }

  const userAgent = header(request, 'user-agent') || '';
  if (!userAgent || BOT.test(userAgent)) return response.status(204).end();

  const url = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'];
  const key = process.env['SUPABASE_ANON_KEY'] || process.env['VITE_SUPABASE_ANON_KEY'];
  if (!url || !key) return response.status(204).end();

  let body: Record<string, unknown> = {};
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body ?? {});
  } catch {
    return response.status(400).json({ ok: false });
  }

  const visitorId = text(body['visitorId'], 36);
  const sessionId = text(body['sessionId'], 36);
  if (!visitorId || !UUID.test(visitorId)) return response.status(400).json({ ok: false });

  const utmInput = body['utm'];
  const utm: Record<string, string> = {};
  if (utmInput && typeof utmInput === 'object') {
    for (const [name, value] of Object.entries(utmInput as Record<string, unknown>)) {
      const clean = text(value, 120);
      if (/^utm_(source|medium|campaign|content|term)$/.test(name) && clean) utm[name] = clean;
    }
  }

  try {
    await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/rpc_site_visit`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_visitor_id: visitorId,
        p_session_id: sessionId && UUID.test(sessionId) ? sessionId : null,
        p_path: text(body['path'], 200),
        p_referrer_host: text(body['referrerHost'], 120),
        p_utm: utm,
        p_country: header(request, 'x-vercel-ip-country'),
        p_city: header(request, 'x-vercel-ip-city'),
        p_device: text(body['device'], 10),
        p_locale: text(body['locale'], 20),
      }),
    });
  } catch (error) {
    console.error('[site-visit] insert failed', error instanceof Error ? error.message : error);
  }
  return response.status(204).end();
}
