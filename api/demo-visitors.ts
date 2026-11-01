import type { VercelRequest, VercelResponse } from '@vercel/node';

// Demo visitor report for the main site's superadmin panel.
// Demo visitors are stored in the separate demo Supabase project, so the main site cannot
// read them directly. This function:
//   1. checks the caller's session on the MAIN project and that they are a superadmin,
//   2. reads the demo report with the DEMO project's service-role key (server-side only).
// Required env vars on the main Vercel project:
//   DEMO_SUPABASE_SERVICE_ROLE_KEY  (secret, never exposed to the browser)
//   DEMO_SUPABASE_URL               (optional, defaults to the demo project URL)

const DEFAULT_DEMO_URL = 'https://lvkmkgjpcbdyzdkbqcgc.supabase.co';

const noStore = (response: VercelResponse) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
};

const rpc = async (baseUrl: string, apiKey: string, bearer: string, name: string, body: Record<string, unknown>) => {
  const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: apiKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await upstream.json().catch(() => null);
  return { ok: upstream.ok, status: upstream.status, payload };
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  noStore(response);
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const mainUrl = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'];
  const mainKey = process.env['SUPABASE_ANON_KEY'] || process.env['VITE_SUPABASE_ANON_KEY'];
  const demoUrl = process.env['DEMO_SUPABASE_URL'] || DEFAULT_DEMO_URL;
  const demoServiceKey = process.env['DEMO_SUPABASE_SERVICE_ROLE_KEY'];

  if (!mainUrl || !mainKey) return response.status(503).json({ ok: false, error: 'not_configured', detail: 'Main Supabase settings are missing.' });
  if (!demoServiceKey) {
    return response.status(503).json({ ok: false, error: 'not_configured', detail: 'Add DEMO_SUPABASE_SERVICE_ROLE_KEY to this Vercel project.' });
  }

  const header = request.headers['authorization'];
  const token = (Array.isArray(header) ? header[0] : header || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return response.status(401).json({ ok: false, error: 'Sign in first.' });

  try {
    // 1. Only superadmins of the main platform may see demo visitors.
    const check = await rpc(mainUrl, mainKey, token, 'is_superadmin', {});
    if (check.status === 401) return response.status(401).json({ ok: false, error: 'Your session has expired. Sign in again.' });
    if (!check.ok || check.payload !== true) return response.status(403).json({ ok: false, error: 'Platform administrator required.' });

    // 2. Read the demo project's report and entry-page funnel.
    const rawDays = Number(Array.isArray(request.query['days']) ? request.query['days'][0] : request.query['days']);
    const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, Math.round(rawDays))) : 30;
    const [report, funnel] = await Promise.all([
      rpc(demoUrl, demoServiceKey, demoServiceKey, 'rpc_demo_visitor_report', { p_days: days }),
      rpc(demoUrl, demoServiceKey, demoServiceKey, 'rpc_demo_landing_funnel', { p_days: days }),
    ]);
    if (!report.ok) {
      console.error('[demo-visitors] demo report failed', { status: report.status, code: report.payload?.code });
      return response.status(502).json({ ok: false, error: 'Could not read the demo visitor report.' });
    }
    return response.status(200).json({ ok: true, days, report: report.payload, funnel: funnel.ok ? funnel.payload : null });
  } catch (cause) {
    console.error('[demo-visitors] unexpected error', cause instanceof Error ? cause.message : cause);
    return response.status(500).json({ ok: false, error: 'Something went wrong.' });
  }
}
