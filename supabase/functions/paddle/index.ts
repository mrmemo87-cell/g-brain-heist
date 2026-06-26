import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

// ============================================================================
// Paddle Edge Function — School Subscription Checkout + Webhook
// ============================================================================
// Routes:
//   POST /paddle/create-checkout   — school admin → Paddle checkout URL
//   POST /paddle/webhook           — Paddle → updates subscription in DB
//   POST /paddle/get-portal-url    — returns Paddle subscription management URL
//
// Env vars required:
//   PADDLE_API_KEY              — Paddle API key (live or sandbox)
//   PADDLE_WEBHOOK_SECRET       — Paddle webhook signature secret (pdl_ntfset_xxx)
//   PADDLE_PRICE_CORE_MONTHLY   — Paddle price ID (pri_xxx)
//   PADDLE_PRICE_CORE_YEARLY
//   PADDLE_PRICE_STANDARD_MONTHLY
//   PADDLE_PRICE_STANDARD_YEARLY
//   PADDLE_PRICE_PRO_MONTHLY
//   PADDLE_PRICE_PRO_YEARLY
//   PADDLE_PRICE_IELTS_PRIME_MONTHLY
//   PADDLE_PRICE_IELTS_PRIME_QUARTERLY
//   PADDLE_PRICE_IELTS_PRIME_YEARLY
//   PADDLE_DISCOUNT_IELTS_LAUNCH_50  — optional Paddle discount ID
//   PADDLE_ENVIRONMENT           — 'sandbox' or 'production' (default: production)
//   APP_URL
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, paddle-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// ── Paddle API helper ──

function getPaddleBaseUrl(): string {
  const env = Deno.env.get("PADDLE_ENVIRONMENT") || "production";
  return env === "sandbox"
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

async function paddleRequest(
  endpoint: string,
  body: Record<string, unknown>,
  method = "POST",
): Promise<unknown> {
  const apiKey = Deno.env.get("PADDLE_API_KEY");
  if (!apiKey) throw new Error("PADDLE_API_KEY not configured");

  const resp = await fetch(`${getPaddleBaseUrl()}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `Paddle error: ${data?.error?.detail || data?.error?.type || resp.statusText}`,
    );
  }
  return data;
}

// ── Verify Paddle webhook signature (HMAC-SHA256 / ts;h1=xxx format) ──

async function verifyPaddleWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  // Paddle signature format: ts=1234567890;h1=abc123def456...
  const parts: Record<string, string> = {};
  for (const segment of signatureHeader.split(";")) {
    const [key, val] = segment.split("=");
    if (key && val) parts[key.trim()] = val.trim();
  }

  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;

  // Check timestamp freshness (5 min tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > 300) return false;

  // Compute HMAC-SHA256 of "ts:rawBody"
  const signedPayload = `${ts}:${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return h1 === expected;
}

// ── Resolve plan name from Paddle price_id ──

function resolvePlanFromPriceId(priceId: string): { plan: string; interval: string } | null {
  const envMappings: [string, string, string][] = [
    ["PADDLE_PRICE_CORE_MONTHLY", "core", "monthly"],
    ["PADDLE_PRICE_CORE_YEARLY", "core", "yearly"],
    ["PADDLE_PRICE_STANDARD_MONTHLY", "standard", "monthly"],
    ["PADDLE_PRICE_STANDARD_YEARLY", "standard", "yearly"],
    ["PADDLE_PRICE_PRO_MONTHLY", "pro", "monthly"],
    ["PADDLE_PRICE_PRO_YEARLY", "pro", "yearly"],
  ];

  for (const [envKey, plan, interval] of envMappings) {
    if (Deno.env.get(envKey) === priceId) return { plan, interval };
  }
  return null;
}

function resolveIeltsPrimePlanFromPriceId(priceId: string): { plan: string; interval: string } | null {
  const envMappings: [string, string, string][] = [
    ["PADDLE_PRICE_IELTS_PRIME_MONTHLY", "monthly", "monthly"],
    ["PADDLE_PRICE_IELTS_PRIME_QUARTERLY", "quarterly", "quarterly"],
    ["PADDLE_PRICE_IELTS_PRIME_YEARLY", "yearly", "yearly"],
  ];

  for (const [envKey, plan, interval] of envMappings) {
    if (Deno.env.get(envKey) === priceId) return { plan, interval };
  }
  return null;
}

const isIeltsPrimeEvent = (data: any): boolean => {
  const customData = data?.custom_data || {};
  return customData.product === "ielts_prime";
};

// ── Supabase clients ──

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function getSupabaseFromAuth(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

// ─────────────────────────────────────────────────
// ROUTE: POST /paddle/create-checkout
// Body: { plan: 'core'|'standard'|'pro', interval: 'monthly'|'yearly' }
// ─────────────────────────────────────────────────
async function handleCreateCheckout(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Not authenticated" });
  }

  const supabase = getSupabaseFromAuth(authHeader);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse(401, { error: "Invalid session" });
  }

  const body = await req.json().catch(() => ({}));
  const plan: string = body.plan || "core";
  const interval: string = body.interval || "monthly";

  // Validate plan
  if (!["core", "standard", "pro"].includes(plan)) {
    return jsonResponse(400, {
      error: `Invalid plan: ${plan}. Use core, standard, or pro.`,
    });
  }

  if (!["monthly", "yearly"].includes(interval)) {
    return jsonResponse(400, { error: `Invalid interval: ${interval}` });
  }

  // Resolve Paddle price ID
  const priceKey = `PADDLE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`;
  const priceId = Deno.env.get(priceKey);
  if (!priceId) {
    return jsonResponse(500, { error: `Price not configured: ${priceKey}` });
  }

  // Get user's school
  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("school_id, username, full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile?.school_id) {
    return jsonResponse(400, {
      error: "You must belong to a school to subscribe",
    });
  }

  // Prevent duplicate active subscriptions
  const { data: existingSub } = await admin
    .from("billing_subscriptions")
    .select("id, status, provider")
    .eq("school_id", profile.school_id)
    .in("status", ["active", "trialing"])
    .limit(1)
    .single();

  if (existingSub) {
    return jsonResponse(409, {
      error: "This school already has an active subscription. Manage it from the billing page.",
    });
  }

  const appUrl = Deno.env.get("APP_URL") || "https://www.brainsheist.com";

  // Build custom_data for webhook passthrough
  const customData = {
    school_id: profile.school_id,
    purchased_by: user.id,
    plan,
  };

  // Create Paddle Checkout (Paddle Billing — transaction-based)
  const transaction = (await paddleRequest("/transactions", {
    items: [
      {
        price_id: priceId,
        quantity: 1,
      },
    ],
    customer_email: user.email || undefined,
    custom_data: customData,
    checkout: {
      url: `${appUrl}?upgrade=success`,
    },
    // Paddle's success/return URLs are set at checkout level
  })) as { data: { id: string; checkout?: { url: string } } };

  // Paddle returns a checkout URL in the transaction response
  const checkoutUrl = transaction?.data?.checkout?.url;
  if (!checkoutUrl) {
    // Fallback: build Paddle hosted checkout URL manually
    return jsonResponse(200, {
      success: true,
      checkout_url: `${getPaddleBaseUrl().replace("api", "checkout")}/transactions/${transaction.data.id}`,
      transaction_id: transaction.data.id,
    });
  }

  return jsonResponse(200, {
    success: true,
    checkout_url: checkoutUrl,
    transaction_id: transaction.data.id,
  });
}

// ─────────────────────────────────────────────────
// ROUTE: POST /paddle/ielts-checkout
// Body: { plan: 'monthly'|'quarterly'|'yearly' }
// ─────────────────────────────────────────────────
async function handleCreateIeltsPrimeCheckout(req: Request, bodyOverride?: any): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Not authenticated" });
  }

  const supabase = getSupabaseFromAuth(authHeader);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse(401, { error: "Invalid session" });
  }

  const body = bodyOverride || await req.json().catch(() => ({}));
  const plan: string = body.plan || body.billing_interval || "monthly";

  if (!["monthly", "quarterly", "yearly"].includes(plan)) {
    return jsonResponse(400, { error: `Invalid IELTS Prime plan: ${plan}` });
  }

  const priceKey = `PADDLE_PRICE_IELTS_PRIME_${plan.toUpperCase()}`;
  const priceId = Deno.env.get(priceKey);
  if (!priceId) {
    return jsonResponse(500, { error: `Price not configured: ${priceKey}` });
  }

  const appUrl = Deno.env.get("APP_URL") || "https://www.brainsheist.com";
  const discountId = Deno.env.get("PADDLE_DISCOUNT_IELTS_LAUNCH_50");
  const customData = {
    product: "ielts_prime",
    user_id: user.id,
    plan,
    billing_interval: plan,
    discount: "launch_50",
  };

  const transactionBody: Record<string, unknown> = {
    items: [{ price_id: priceId, quantity: 1 }],
    customer_email: user.email || undefined,
    custom_data: customData,
    checkout: {
      url: `${appUrl}/ielts/apply-prime?checkout=success`,
    },
  };

  if (discountId) {
    transactionBody.discount_id = discountId;
  }

  const transaction = (await paddleRequest("/transactions", transactionBody)) as { data: { id: string; checkout?: { url: string } } };
  const checkoutUrl = transaction?.data?.checkout?.url;

  return jsonResponse(200, {
    success: true,
    checkout_url: checkoutUrl || `${getPaddleBaseUrl().replace("api", "checkout")}/transactions/${transaction.data.id}`,
    transaction_id: transaction.data.id,
  });
}

// ─────────────────────────────────────────────────
// ROUTE: POST /paddle/get-portal-url
// Returns Paddle subscription management URL
// ─────────────────────────────────────────────────
async function handleGetPortalUrl(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Not authenticated" });
  }

  const supabase = getSupabaseFromAuth(authHeader);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse(401, { error: "Invalid session" });
  }

  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("school_id")
    .eq("id", user.id)
    .single();

  if (!profile?.school_id) {
    return jsonResponse(400, { error: "No school found" });
  }

  // Get active billing subscription
  const { data: sub } = await admin
    .from("billing_subscriptions")
    .select("management_url, update_payment_url, provider_subscription_id")
    .eq("school_id", profile.school_id)
    .eq("provider", "paddle")
    .in("status", ["active", "trialing", "past_due", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub) {
    return jsonResponse(404, { error: "No active Paddle subscription found" });
  }

  // If we have a stored management URL, return it
  if (sub.management_url) {
    return jsonResponse(200, {
      success: true,
      management_url: sub.management_url,
      update_payment_url: sub.update_payment_url,
    });
  }

  // Otherwise, try to get cancel/update URLs from Paddle API
  if (sub.provider_subscription_id) {
    try {
      const paddleSub = (await paddleRequest(
        `/subscriptions/${sub.provider_subscription_id}`,
        {},
        "GET",
      )) as { data: { management_urls?: { cancel: string; update_payment_method: string } } };

      const urls = paddleSub?.data?.management_urls;
      if (urls) {
        // Cache for next time
        // Paddle provides cancel + update_payment_method; prefer update_payment_method
        // as the general management portal link.
        const mgmtUrl = urls.update_payment_method || urls.cancel;
        await admin
          .from("billing_subscriptions")
          .update({
            management_url: mgmtUrl,
            update_payment_url: urls.update_payment_method,
          })
          .eq("provider_subscription_id", sub.provider_subscription_id);

        return jsonResponse(200, {
          success: true,
          management_url: mgmtUrl,
          update_payment_url: urls.update_payment_method,
        });
      }
    } catch (err) {
      console.warn("Failed to fetch Paddle management URLs:", err);
    }
  }

  return jsonResponse(404, {
    error: "Management URL not available. Contact support@brainsheist.com.",
  });
}

async function insertIeltsFunnelEvent(admin: ReturnType<typeof getSupabaseAdmin>, params: {
  userId?: string | null;
  eventName: "checkout_completed" | "subscription_activated" | "funnel_error";
  metadata?: Record<string, unknown>;
}) {
  try {
    await admin.from("ielts_funnel_events").insert({
      user_id: params.userId || null,
      event_name: params.eventName,
      route: "/ielts/apply-prime",
      metadata: params.metadata || {},
    });
  } catch (err) {
    console.warn("IELTS funnel analytics insert failed", err);
  }
}

async function upsertIeltsPrimeSubscription(admin: ReturnType<typeof getSupabaseAdmin>, params: {
  userId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  transactionId?: string | null;
  plan: string;
  status: string;
  priceId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  managementUrl?: string | null;
  updatePaymentUrl?: string | null;
  eventOccurredAt: string;
}) {
  const row: Record<string, unknown> = {
    user_id: params.userId,
    paddle_customer_id: params.customerId || null,
    paddle_subscription_id: params.subscriptionId || null,
    paddle_transaction_id: params.transactionId || null,
    plan: params.plan,
    status: params.status,
    price_id: params.priceId || null,
    cancel_at_period_end: params.cancelAtPeriodEnd || false,
    management_url: params.managementUrl || null,
    update_payment_url: params.updatePaymentUrl || null,
    last_event_at: params.eventOccurredAt,
  };

  if (params.currentPeriodStart) row.current_period_start = params.currentPeriodStart;
  if (params.currentPeriodEnd) row.current_period_end = params.currentPeriodEnd;

  await admin.from("ielts_prime_subscriptions").upsert(row, {
    onConflict: params.subscriptionId ? "paddle_subscription_id" : "paddle_transaction_id",
  });
}

async function handleIeltsPrimeWebhookEvent(admin: ReturnType<typeof getSupabaseAdmin>, eventType: string, event: any, eventOccurredAt: string): Promise<string | null> {
  const data = event.data || {};
  const meta = data.custom_data || {};
  const userId = meta.user_id;
  if (!userId) return "No user_id in IELTS Prime custom_data";

  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    paused: "paused",
    canceled: "cancelled",
    cancelled: "cancelled",
  };

  if (["subscription.created", "subscription.activated", "subscription.updated"].includes(eventType)) {
    const currentPriceId = data.items?.[0]?.price?.id || null;
    const resolved = currentPriceId ? resolveIeltsPrimePlanFromPriceId(currentPriceId) : null;
    const plan = meta.plan || resolved?.plan || "monthly";
    const urls = data.management_urls || {};
    await upsertIeltsPrimeSubscription(admin, {
      userId,
      customerId: data.customer_id || null,
      subscriptionId: data.id || null,
      transactionId: data.transaction_id || null,
      plan,
      status: statusMap[data.status] || "active",
      priceId: currentPriceId,
      currentPeriodStart: data.current_billing_period?.starts_at || null,
      currentPeriodEnd: data.current_billing_period?.ends_at || null,
      cancelAtPeriodEnd: data.scheduled_change?.action === "cancel" || false,
      managementUrl: urls.update_payment_method || urls.cancel || null,
      updatePaymentUrl: urls.update_payment_method || null,
      eventOccurredAt,
    });
    await admin.from("ielts_users").update({ tier: "prime_prep_user" }).eq("id", userId);
    if (["subscription.created", "subscription.activated"].includes(eventType)) {
      await insertIeltsFunnelEvent(admin, {
        userId,
        eventName: "subscription_activated",
        metadata: { plan, interval: resolved?.interval || plan, price_id: currentPriceId, subscription_id: data.id || null },
      });
    }
    return null;
  }

  if (eventType === "subscription.canceled") {
    const periodEnd = data.current_billing_period?.ends_at || null;
    const stillInPeriod = periodEnd && new Date(periodEnd) > new Date();
    await upsertIeltsPrimeSubscription(admin, {
      userId,
      customerId: data.customer_id || null,
      subscriptionId: data.id || null,
      plan: meta.plan || "monthly",
      status: "cancelled",
      currentPeriodStart: data.current_billing_period?.starts_at || null,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true,
      eventOccurredAt,
    });
    if (!stillInPeriod) {
      await admin.from("ielts_users").update({ tier: "free" }).eq("id", userId).eq("tier", "prime_prep_user");
    }
    return null;
  }

  if (eventType === "transaction.completed") {
    const subscriptionId = data.subscription_id || null;
    const currentPriceId = data.items?.[0]?.price?.id || null;
    const resolved = currentPriceId ? resolveIeltsPrimePlanFromPriceId(currentPriceId) : null;
    const plan = meta.plan || resolved?.plan || "monthly";
    await upsertIeltsPrimeSubscription(admin, {
      userId,
      customerId: data.customer_id || null,
      subscriptionId,
      transactionId: data.id || null,
      plan,
      status: "active",
      priceId: currentPriceId,
      eventOccurredAt,
    });
    await admin.from("ielts_users").update({ tier: "prime_prep_user" }).eq("id", userId);
    await insertIeltsFunnelEvent(admin, {
      userId,
      eventName: "checkout_completed",
      metadata: { plan, interval: resolved?.interval || plan, price_id: currentPriceId, subscription_id: subscriptionId },
    });
    return null;
  }

  if (eventType === "transaction.payment_failed" || eventType === "subscription.past_due") {
    const subscriptionId = data.subscription_id || data.id || null;
    if (subscriptionId) {
      await admin.from("ielts_prime_subscriptions").update({ status: "past_due", last_event_at: eventOccurredAt }).eq("paddle_subscription_id", subscriptionId);
    }
    return null;
  }

  if (eventType === "subscription.paused") {
    if (data.id) {
      await admin.from("ielts_prime_subscriptions").update({ status: "paused", last_event_at: eventOccurredAt }).eq("paddle_subscription_id", data.id);
    }
    return null;
  }

  if (eventType === "subscription.resumed") {
    if (data.id) {
      await admin.from("ielts_prime_subscriptions").update({ status: "active", last_event_at: eventOccurredAt }).eq("paddle_subscription_id", data.id);
      await admin.from("ielts_users").update({ tier: "prime_prep_user" }).eq("id", userId);
    }
    return null;
  }

  return null;
}

// ─────────────────────────────────────────────────
// ROUTE: POST /paddle/webhook
// Paddle sends webhooks for subscription lifecycle events
// ─────────────────────────────────────────────────
async function handleWebhook(req: Request): Promise<Response> {
  const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    return jsonResponse(500, { error: "Webhook secret not configured" });
  }

  const signature = req.headers.get("paddle-signature");
  if (!signature) {
    return jsonResponse(400, { error: "Missing paddle-signature header" });
  }

  const rawBody = await req.text();
  const valid = await verifyPaddleWebhook(rawBody, signature, webhookSecret);
  if (!valid) {
    console.error("Paddle webhook: invalid signature");
    return jsonResponse(400, { error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody);
  const eventId: string = event.event_id || event.notification_id || "";
  const eventType: string = event.event_type || "";

  const admin = getSupabaseAdmin();

  // ── Idempotency check ──
  const { data: existingEvent } = await admin
    .from("billing_events")
    .select("id, processed")
    .eq("provider", "paddle")
    .eq("event_id", eventId)
    .single();

  if (existingEvent?.processed) {
    // Already processed — return 200 to tell Paddle not to retry
    return jsonResponse(200, { received: true, duplicate: true });
  }

  // Log the event (or update if it was recorded but not processed)
  const subId =
    event.data?.subscription_id ||
    event.data?.id ||
    null;

  const customData = event.data?.custom_data || {};
  const schoolId = customData.product === "ielts_prime" ? null : customData.school_id || null;

  if (existingEvent) {
    await admin
      .from("billing_events")
      .update({ payload: event })
      .eq("id", existingEvent.id);
  } else {
    await admin.from("billing_events").insert({
      provider: "paddle",
      event_id: eventId,
      event_type: eventType,
      provider_subscription_id: subId,
      school_id: schoolId,
      payload: event,
      processed: false,
    });
  }

  // ── Process event ──
  let processingError: string | null = null;
  const eventOccurredAt: string = event.occurred_at || new Date().toISOString();

  try {
    if (isIeltsPrimeEvent(event.data)) {
      processingError = await handleIeltsPrimeWebhookEvent(admin, eventType, event, eventOccurredAt);
    } else {
    switch (eventType) {
      // ── Subscription activated / created ──
      case "subscription.created":
      case "subscription.activated":
      case "subscription.updated": {
        const sub = event.data;
        const meta = sub.custom_data || {};
        const school = meta.school_id || schoolId;
        const purchasedBy = meta.purchased_by || null;

        if (!school) {
          processingError = "No school_id in custom_data";
          break;
        }

        // ── Out-of-order guard: skip if we already processed a newer event ──
        if (sub.id) {
          const { data: existing } = await admin
            .from("billing_subscriptions")
            .select("last_event_at")
            .eq("provider_subscription_id", sub.id)
            .single();

          if (
            existing?.last_event_at &&
            new Date(existing.last_event_at) > new Date(eventOccurredAt)
          ) {
            // Stale event — already superseded by a newer one
            break;
          }
        }

        // Resolve plan from price ID
        const currentPriceId = sub.items?.[0]?.price?.id || null;
        const resolved = currentPriceId
          ? resolvePlanFromPriceId(currentPriceId)
          : null;
        const plan = meta.plan || resolved?.plan || "core";
        const billingInterval = resolved?.interval || "monthly";

        // Map Paddle status → our status
        const statusMap: Record<string, string> = {
          active: "active",
          trialing: "trialing",
          past_due: "past_due",
          paused: "paused",
          canceled: "cancelled",
          cancelled: "cancelled",
        };
        const status = statusMap[sub.status] || "active";

        // Get management URLs
        // Paddle Billing provides two URLs in management_urls:
        //   cancel               — subscription cancel/manage page
        //   update_payment_method — payment method update page
        // There is no separate "manage" URL; cancel page doubles as
        // the subscriber management portal.
        const mgmtUrls = sub.management_urls || {};

        // Build upsert row — only include nullable temporal fields when
        // actually present so we never overwrite valid data with null.
        const row: Record<string, unknown> = {
          school_id: school,
          provider: "paddle",
          provider_customer_id: sub.customer_id || null,
          provider_subscription_id: sub.id,
          purchased_by: purchasedBy,
          status,
          plan,
          billing_interval: billingInterval,
          price_id: currentPriceId,
          cancel_at_period_end: sub.scheduled_change?.action === "cancel" || false,
          management_url: mgmtUrls.update_payment_method || mgmtUrls.cancel || null,
          update_payment_url: mgmtUrls.update_payment_method || null,
          last_event_at: eventOccurredAt,
        };

        // Only set period dates when Paddle actually sends them
        if (sub.current_billing_period?.starts_at) {
          row.current_period_start = sub.current_billing_period.starts_at;
        }
        if (sub.current_billing_period?.ends_at) {
          row.current_period_end = sub.current_billing_period.ends_at;
        }

        // Only set canceled_at / paused_at when relevant — avoid wiping history
        if (status === "cancelled") {
          row.canceled_at = sub.canceled_at || new Date().toISOString();
        }
        if (status === "paused") {
          row.paused_at = sub.paused_at || new Date().toISOString();
        }

        // Upsert billing_subscriptions
        await admin.from("billing_subscriptions").upsert(
          row,
          { onConflict: "provider,provider_subscription_id" },
        );

        // Update school plan for backward compat with get_effective_tier
        if (status === "active" || status === "trialing") {
          await admin
            .from("schools")
            .update({ school_plan: plan, trial_ends_at: null })
            .eq("id", school);
        }

        break;
      }

      // ── Subscription cancelled ──
      case "subscription.canceled": {
        const sub = event.data;
        const meta = sub.custom_data || {};
        const school = meta.school_id || schoolId;

        // Mark billing_subscriptions as cancelled, but preserve period end
        if (sub.id) {
          // Out-of-order guard
          const { data: existing } = await admin
            .from("billing_subscriptions")
            .select("last_event_at")
            .eq("provider_subscription_id", sub.id)
            .single();

          if (
            existing?.last_event_at &&
            new Date(existing.last_event_at) > new Date(eventOccurredAt)
          ) {
            break; // stale event
          }

          await admin
            .from("billing_subscriptions")
            .update({
              status: "cancelled",
              canceled_at: sub.canceled_at || new Date().toISOString(),
              current_period_end: sub.current_billing_period?.ends_at || undefined,
              last_event_at: eventOccurredAt,
            })
            .eq("provider_subscription_id", sub.id);
        }

        // Only downgrade school if the billing period has already ended.
        // If still in period, get_effective_tier honours cancelled + period_end > now.
        const periodEnd = sub.current_billing_period?.ends_at;
        const stillInPeriod = periodEnd && new Date(periodEnd) > new Date();

        if (school && !stillInPeriod) {
          await admin
            .from("schools")
            .update({ school_plan: "none", trial_ends_at: null })
            .eq("id", school);
        }

        break;
      }

      // ── Subscription past_due (Paddle explicitly sends this) ──
      case "subscription.past_due": {
        const sub = event.data;

        if (sub.id) {
          await admin
            .from("billing_subscriptions")
            .update({ status: "past_due", last_event_at: eventOccurredAt })
            .eq("provider_subscription_id", sub.id);
        }

        break;
      }

      // ── Subscription paused ──
      case "subscription.paused": {
        const sub = event.data;

        if (sub.id) {
          await admin
            .from("billing_subscriptions")
            .update({
              status: "paused",
              paused_at: sub.paused_at || new Date().toISOString(),
              last_event_at: eventOccurredAt,
            })
            .eq("provider_subscription_id", sub.id);
        }

        break;
      }

      // ── Subscription resumed ──
      case "subscription.resumed": {
        const sub = event.data;

        if (sub.id) {
          await admin
            .from("billing_subscriptions")
            .update({
              status: "active",
              paused_at: null,
              last_event_at: eventOccurredAt,
            })
            .eq("provider_subscription_id", sub.id);
        }

        const meta = sub.custom_data || {};
        const school = meta.school_id || schoolId;
        if (school) {
          const resolved = sub.items?.[0]?.price?.id
            ? resolvePlanFromPriceId(sub.items[0].price.id)
            : null;
          const plan = meta.plan || resolved?.plan || "core";
          await admin
            .from("schools")
            .update({ school_plan: plan })
            .eq("id", school);
        }

        break;
      }

      // ── Transaction completed (payment success) ──
      case "transaction.completed": {
        // This fires on successful payment. Subscription events handle state.
        // We just log it for audit.
        break;
      }

      // ── Transaction payment failed ──
      case "transaction.payment_failed": {
        const txn = event.data;
        const subId = txn.subscription_id;

        if (subId) {
          await admin
            .from("billing_subscriptions")
            .update({ status: "past_due", last_event_at: eventOccurredAt })
            .eq("provider_subscription_id", subId);
        }

        break;
      }

      default:
        // Unknown event — log but don't fail
        console.log(`Paddle webhook: unhandled event type: ${eventType}`);
        break;
    }
    }
  } catch (err) {
    processingError = err instanceof Error ? err.message : String(err);
    console.error(`Paddle webhook processing error for ${eventType}:`, err);
  }

  // Mark event as processed
  await admin
    .from("billing_events")
    .update({
      processed: !processingError,
      processing_error: processingError,
      processed_at: new Date().toISOString(),
    })
    .eq("provider", "paddle")
    .eq("event_id", eventId);

  // Always return 200 so Paddle doesn't retry (we have our own retry via unprocessed events)
  return jsonResponse(200, {
    received: true,
    processed: !processingError,
  });
}

// ─────────────────────────────────────────────────
// MAIN ROUTER
// ─────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/paddle\/?/, "/");

  try {
    if (req.method === "POST" && path === "/ielts-checkout") {
      return await handleCreateIeltsPrimeCheckout(req);
    }

    if (req.method === "POST" && path === "/create-checkout") {
      return await handleCreateCheckout(req);
    }

    if (req.method === "POST" && path === "/") {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.action === "ielts_prime_checkout" || body?.product === "ielts_prime") {
        return await handleCreateIeltsPrimeCheckout(req, body);
      }
      return await handleCreateCheckout(req);
    }

    if (req.method === "POST" && path === "/webhook") {
      return await handleWebhook(req);
    }

    if (req.method === "POST" && path === "/get-portal-url") {
      return await handleGetPortalUrl(req);
    }

    return jsonResponse(404, { error: "Not found" });
  } catch (error) {
    console.error("Paddle function error:", error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
});
