export interface MetaCapiEventInput {
  eventName: string;
  eventId: string;
  eventTime?: number;
  actionSource?: 'website';
  eventSourceUrl?: string | null;
  userData?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}

const sha256Hex = async (value: string): Promise<string> => {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export async function sendMetaCapiEvent(input: MetaCapiEventInput): Promise<void> {
  const pixelId = Deno.env.get('META_PIXEL_ID');
  const token = Deno.env.get('META_CAPI_ACCESS_TOKEN');
  if (!pixelId || !token) return;

  const payload: Record<string, unknown> = {
    data: [{
      event_name: input.eventName,
      event_time: input.eventTime || Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: input.actionSource || 'website',
      event_source_url: input.eventSourceUrl || undefined,
      user_data: input.userData || {},
      custom_data: input.customData || {},
    }],
  };
  const testCode = Deno.env.get('META_TEST_EVENT_CODE');
  if (testCode) payload.test_event_code = testCode;

  const res = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!res.ok) console.warn('Meta CAPI failed', res.status, await res.text());
}

export async function buildMetaUserData(req: Request, user?: { id?: string | null; email?: string | null } | null, extra?: Record<string, string | null | undefined>) {
  const cookie = req.headers.get('cookie') || '';
  const findCookie = (name: string) => cookie.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || null;
  const userData: Record<string, unknown> = {
    client_ip_address: ip || undefined,
    client_user_agent: req.headers.get('user-agent') || undefined,
    fbp: extra?.fbp || findCookie('_fbp') || undefined,
    fbc: extra?.fbc || findCookie('_fbc') || undefined,
  };
  if (user?.email) userData.em = [await sha256Hex(user.email)];
  if (user?.id) userData.external_id = [await sha256Hex(user.id)];
  return userData;
}
