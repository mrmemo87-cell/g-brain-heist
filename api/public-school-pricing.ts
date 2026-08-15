import type { VercelRequest, VercelResponse } from '@vercel/node';

const jsonHeaders = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
} as const;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ success: false, error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'];
  const publishableKey = process.env['SUPABASE_ANON_KEY'] || process.env['VITE_SUPABASE_ANON_KEY'];

  if (!supabaseUrl || !publishableKey) {
    response.setHeader('Cache-Control', 'no-store');
    return response.status(503).json({ success: false, error: 'Pricing is temporarily unavailable.' });
  }

  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/get_public_school_pricing`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const payload = await upstream.json().catch(() => null);

    if (!upstream.ok || !payload?.success) {
      console.error('[public-school-pricing] catalogue request failed', {
        status: upstream.status,
        code: payload?.code,
      });
      response.setHeader('Cache-Control', 'no-store');
      return response.status(503).json({ success: false, error: 'Pricing is temporarily unavailable.' });
    }

    for (const [key, value] of Object.entries(jsonHeaders)) response.setHeader(key, value);
    if (request.method === 'HEAD') return response.status(200).end();
    return response.status(200).json(payload);
  } catch (error) {
    console.error('[public-school-pricing] unexpected failure', error instanceof Error ? error.message : 'unknown');
    response.setHeader('Cache-Control', 'no-store');
    return response.status(503).json({ success: false, error: 'Pricing is temporarily unavailable.' });
  }
}

