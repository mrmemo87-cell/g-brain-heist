import type { VercelRequest, VercelResponse } from '@vercel/node';

// Approximate location of the current request, from the headers Vercel adds at the edge.
// Used only by the demo entry form so the Brains Heist team knows which countries and
// cities try the demo. No IP address is returned or stored.
const header = (request: VercelRequest, name: string): string | null => {
  const value = request.headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return raw; }
};

export default function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ ok: false });
  }
  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({
    ok: true,
    country: header(request, 'x-vercel-ip-country'),
    region: header(request, 'x-vercel-ip-country-region'),
    city: header(request, 'x-vercel-ip-city'),
    timezone: header(request, 'x-vercel-ip-timezone'),
  });
}
