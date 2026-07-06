import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';
import { buildMetaUserData, sendMetaCapiEvent } from '../_shared/metaCapiClient.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const allowed = new Set(['diagnostic_started', 'diagnostic_completed', 'checkout_started', 'checkout_opened']);
const metaNames: Record<string, string> = { diagnostic_started: 'DiagnosticStarted', diagnostic_completed: 'Lead', checkout_started: 'InitiateCheckout', checkout_opened: 'CheckoutOpened' };
const allowedCustom = new Set(['skill', 'task_id', 'content_id', 'estimated_band', 'plan', 'user_type', 'checkout_surface', 'price_id', 'product_id', 'subscription_id', 'interval', 'route', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'landing_page', 'referrer']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  try {
    const body = await req.json();
    if (!allowed.has(body.event_name) || !body.event_id) return new Response(JSON.stringify({ ok: false }), { status: 400, headers: corsHeaders });
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user } } = await supabase.auth.getUser();
    const customData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.metadata || {})) if (allowedCustom.has(k) && (typeof v === 'string' || typeof v === 'number' || v === null)) customData[k] = v;
    await sendMetaCapiEvent({ eventName: metaNames[body.event_name], eventId: body.event_id, eventSourceUrl: body.event_source_url, userData: await buildMetaUserData(req, user ? { id: user.id, email: user.email } : null, body.cookies || {}), customData });
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'content-type': 'application/json' } });
  } catch (err) {
    console.warn('meta_capi failed', err);
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }
});
