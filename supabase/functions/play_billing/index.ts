import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

// ============================================================================
// play_billing — IELTS Prime bought with Google Play Billing (Android app)
// ============================================================================
// POST { purchaseToken, productId }  verify a new purchase and unlock Prime
// POST {}                            re-check this user's stored Play purchases
//                                    (renewals, cancellations, refunds)
//
// Every token is checked with the Google Play Developer API. The purchase
// must carry the caller's user id as obfuscatedExternalAccountId, so a token
// can never unlock a different account.
//
// Env vars:
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  service account key (JSON) with access
//                                     to this app in Play Console
//   GOOGLE_PLAY_PACKAGE_NAME          default com.brainsheist.app
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

const PRODUCT_ID = "ielts_prime";
const PLAN_BY_BASE_PLAN: Record<string, "monthly" | "quarterly" | "yearly"> = {
  monthly: "monthly",
  quarterly: "quarterly",
  yearly: "yearly",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const packageName = () => Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") || "com.brainsheist.app";

// ── Google service-account access token (RS256 JWT, cached) ──

let cachedToken: { value: string; expires: number } | null = null;

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;

  const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured");
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; token_uri?: string };
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));

  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64url(signature)}`;

  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) throw new Error(`Google auth failed (${resp.status})`);
  cachedToken = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

// ── Google Play Developer API ──

interface PlaySubscription {
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string };
  }>;
  startTime?: string;
}

async function fetchSubscription(token: string): Promise<PlaySubscription | null> {
  const access = await googleAccessToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName()}` +
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (resp.status === 404 || resp.status === 410) return null;
  if (!resp.ok) throw new Error(`Play API error ${resp.status}`);
  return await resp.json();
}

async function acknowledge(productId: string, token: string) {
  const access = await googleAccessToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName()}` +
    `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`;
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => undefined);
}

function mapStatus(state: string | undefined): string {
  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      return "active";
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "grace";
    case "SUBSCRIPTION_STATE_CANCELED":
      return "cancelled";
    case "SUBSCRIPTION_STATE_ON_HOLD":
      return "on_hold";
    case "SUBSCRIPTION_STATE_PAUSED":
      return "paused";
    case "SUBSCRIPTION_STATE_PENDING":
      return "pending";
    default:
      return "expired";
  }
}

function rowFromSubscription(sub: PlaySubscription) {
  const item = sub.lineItems?.find((li) => li.productId === PRODUCT_ID) ?? sub.lineItems?.[0];
  const basePlan = item?.offerDetails?.basePlanId ?? "";
  return {
    productId: item?.productId ?? null,
    basePlan,
    plan: PLAN_BY_BASE_PLAN[basePlan] ?? null,
    status: mapStatus(sub.subscriptionState),
    expiry: item?.expiryTime ?? null,
    autoRenew: item?.autoRenewingPlan?.autoRenewEnabled ?? false,
    orderId: sub.latestOrderId ?? null,
    account: sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    start: sub.startTime ?? null,
  };
}

// ── Handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await userClient.auth.getUser();
  const user = auth?.user;
  if (!user) return json(401, { error: "Please sign in first." });

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({})) as { purchaseToken?: string; productId?: string };

  try {
    // Refresh mode: re-check every stored Play purchase for this user.
    if (!body.purchaseToken) {
      const { data: rows } = await admin
        .from("ielts_prime_subscriptions")
        .select("id, google_purchase_token")
        .eq("user_id", user.id)
        .eq("provider", "google_play");
      for (const row of rows ?? []) {
        if (!row.google_purchase_token) continue;
        const sub = await fetchSubscription(row.google_purchase_token);
        const info = sub ? rowFromSubscription(sub) : null;
        await admin
          .from("ielts_prime_subscriptions")
          .update({
            status: info?.status ?? "expired",
            current_period_end: info?.expiry ?? null,
            cancel_at_period_end: info ? !info.autoRenew : false,
            google_order_id: info?.orderId ?? null,
            last_event_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
      const { data: active } = await admin.rpc("has_active_ielts_prime_subscription", { p_user_id: user.id });
      return json(200, { ok: true, active: Boolean(active) });
    }

    // Verify mode: a purchase the app just made.
    const token = String(body.purchaseToken);
    const sub = await fetchSubscription(token);
    if (!sub) return json(400, { error: "Google Play could not find this purchase." });

    const info = rowFromSubscription(sub);
    if (info.productId !== PRODUCT_ID || !info.plan) {
      return json(400, { error: "This purchase is not an IELTS Prime plan." });
    }
    if (info.account && info.account !== user.id) {
      return json(403, { error: "This purchase belongs to a different Brains Heist account." });
    }

    const { data: existing } = await admin
      .from("ielts_prime_subscriptions")
      .select("id, user_id")
      .eq("google_purchase_token", token)
      .maybeSingle();
    if (existing && existing.user_id !== user.id) {
      return json(403, { error: "This purchase is already linked to another account." });
    }

    const now = new Date().toISOString();
    const record = {
      user_id: user.id,
      provider: "google_play",
      plan: info.plan,
      status: info.status,
      current_period_start: info.start,
      current_period_end: info.expiry,
      cancel_at_period_end: !info.autoRenew,
      google_purchase_token: token,
      google_product_id: info.productId,
      google_base_plan_id: info.basePlan,
      google_order_id: info.orderId,
      last_event_at: now,
      updated_at: now,
    };

    if (existing) {
      await admin.from("ielts_prime_subscriptions").update(record).eq("id", existing.id);
    } else {
      const { error } = await admin.from("ielts_prime_subscriptions").insert({ ...record, created_at: now });
      if (error) throw new Error(error.message);
    }

    if (sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      await acknowledge(PRODUCT_ID, token);
    }

    const { data: active } = await admin.rpc("has_active_ielts_prime_subscription", { p_user_id: user.id });
    return json(200, { ok: true, active: Boolean(active), plan: info.plan, expires: info.expiry });
  } catch (err) {
    console.error("play_billing error", err);
    return json(500, { error: "Could not confirm the purchase with Google Play. Try again in a minute." });
  }
});
