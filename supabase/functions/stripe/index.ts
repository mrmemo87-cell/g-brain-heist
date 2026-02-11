import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

// ============================================================================
// Stripe Edge Function — School Subscription Checkout + Webhook
// ============================================================================
// Routes:
//   POST /stripe/create-checkout   — school admin → Stripe Checkout URL
//   POST /stripe/webhook           — Stripe → updates school_plan in DB
//
// Env vars required:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   STRIPE_PRICE_CORE_MONTHLY, STRIPE_PRICE_CORE_YEARLY
//   STRIPE_PRICE_STANDARD_MONTHLY, STRIPE_PRICE_STANDARD_YEARLY
//   STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY
//   APP_URL
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// ── Stripe API helper (raw fetch, no SDK) ──

async function stripeRequest(
  endpoint: string,
  body: Record<string, string>,
  method = "POST",
): Promise<unknown> {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

  const resp = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `Stripe error: ${data?.error?.message || resp.statusText}`,
    );
  }
  return data;
}

// ── Verify Stripe webhook signature (HMAC-SHA256) ──

async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const parts = signature.split(",").reduce(
    (acc, part) => {
      const [key, val] = part.split("=");
      if (key === "t") acc.timestamp = val;
      if (key === "v1") acc.signatures.push(val);
      return acc;
    },
    { timestamp: "", signatures: [] as string[] },
  );

  if (!parts.timestamp || parts.signatures.length === 0) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(parts.timestamp)) > 300) return false;

  const signedPayload = `${parts.timestamp}.${payload}`;
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

  return parts.signatures.some((s) => s === expected);
}

// ── Resolve plan name from Stripe price_id ──

function resolvePlanFromPriceId(priceId: string): string | null {
  const envMappings: [string, string][] = [
    ["STRIPE_PRICE_CORE_MONTHLY", "core"],
    ["STRIPE_PRICE_CORE_YEARLY", "core"],
    ["STRIPE_PRICE_STANDARD_MONTHLY", "standard"],
    ["STRIPE_PRICE_STANDARD_YEARLY", "standard"],
    ["STRIPE_PRICE_PRO_MONTHLY", "pro"],
    ["STRIPE_PRICE_PRO_YEARLY", "pro"],
  ];

  for (const [envKey, plan] of envMappings) {
    if (Deno.env.get(envKey) === priceId) return plan;
  }
  return null;
}

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
// ROUTE: POST /stripe/create-checkout
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
  const plan: string = body.plan || "standard";
  const interval: string = body.interval || "monthly";

  // Validate plan
  if (!["core", "standard", "pro"].includes(plan)) {
    return jsonResponse(400, {
      error: `Invalid plan: ${plan}. Use core, standard, or pro.`,
    });
  }

  // Resolve Stripe price ID
  const priceKey = `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`;
  const priceId = Deno.env.get(priceKey);
  if (!priceId) {
    return jsonResponse(500, { error: `Price not configured: ${priceKey}` });
  }

  // Get user's school
  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("users")
    .select("school_id, username, full_name")
    .eq("id", user.id)
    .single();

  if (!profile?.school_id) {
    return jsonResponse(400, {
      error: "You must belong to a school to subscribe",
    });
  }

  // Build metadata for webhook
  const metadata: Record<string, string> = {
    school_id: profile.school_id,
    purchased_by: user.id,
    plan,
  };

  const appUrl = Deno.env.get("APP_URL") || "https://www.brainsheist.com";

  // Create Stripe Checkout Session
  const session = (await stripeRequest("/checkout/sessions", {
    mode: "subscription",
    "payment_method_types[0]": "card",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${appUrl}?upgrade=success`,
    cancel_url: `${appUrl}?upgrade=cancelled`,
    customer_email: user.email || "",
    client_reference_id: user.id,
    ...Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, v]),
    ),
    ...Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [
        `subscription_data[metadata][${k}]`,
        v,
      ]),
    ),
  })) as { url: string; id: string };

  return jsonResponse(200, {
    success: true,
    checkout_url: session.url,
    session_id: session.id,
  });
}

// ─────────────────────────────────────────────────
// ROUTE: POST /stripe/webhook
// ─────────────────────────────────────────────────
async function handleWebhook(req: Request): Promise<Response> {
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    return jsonResponse(500, { error: "Webhook secret not configured" });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse(400, { error: "Missing stripe-signature header" });
  }

  const rawBody = await req.text();
  const valid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
  if (!valid) {
    return jsonResponse(400, { error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody);
  const admin = getSupabaseAdmin();

  switch (event.type) {
    // ── Subscription created or updated ──
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const meta = sub.metadata || {};
      const schoolId = meta.school_id || null;
      const purchasedBy = meta.purchased_by || null;

      if (!schoolId) {
        console.warn("Webhook: no school_id in metadata, skipping");
        break;
      }

      // Resolve plan: prefer metadata, fall back to price_id mapping
      const currentPriceId = sub.items?.data?.[0]?.price?.id || null;
      const plan =
        meta.plan ||
        (currentPriceId ? resolvePlanFromPriceId(currentPriceId) : null) ||
        "standard";

      const status =
        sub.status === "active" || sub.status === "trialing"
          ? "active"
          : sub.status === "past_due"
            ? "past_due"
            : "cancelled";

      // Upsert stripe_customers record
      await admin.from("stripe_customers").upsert(
        {
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          school_id: schoolId,
          purchased_by: purchasedBy,
          plan,
          status,
          price_id: currentPriceId,
          current_period_start: sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : null,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancel_at: sub.cancel_at
            ? new Date(sub.cancel_at * 1000).toISOString()
            : null,
        },
        { onConflict: "stripe_subscription_id" },
      );

      // Update school plan (only if subscription is active)
      if (status === "active") {
        await admin
          .from("schools")
          .update({ school_plan: plan, trial_ends_at: null })
          .eq("id", schoolId);
      }

      break;
    }

    // ── Subscription cancelled/deleted ──
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const meta = sub.metadata || {};
      const schoolId = meta.school_id;

      // Mark stripe_customers record
      await admin
        .from("stripe_customers")
        .update({ status: "cancelled" })
        .eq("stripe_subscription_id", sub.id);

      // Downgrade school to 'none'
      if (schoolId) {
        await admin
          .from("schools")
          .update({ school_plan: "none", trial_ends_at: null })
          .eq("id", schoolId);
      }

      break;
    }

    // ── Invoice payment failed ──
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      if (invoice.subscription) {
        await admin
          .from("stripe_customers")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", invoice.subscription);
      }
      break;
    }

    default:
      break;
  }

  return jsonResponse(200, { received: true });
}

// ─────────────────────────────────────────────────
// MAIN ROUTER
// ─────────────────────────────────────────────────
// TODO: Add POST /stripe/create-portal for Stripe Customer Portal
//       (so school admins can manage/upgrade/cancel their subscription)

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/stripe\/?/, "/");

  try {
    if (req.method === "POST" && path === "/create-checkout") {
      return await handleCreateCheckout(req);
    }

    if (req.method === "POST" && path === "/webhook") {
      return await handleWebhook(req);
    }

    return jsonResponse(404, { error: "Not found" });
  } catch (error) {
    console.error("Stripe function error:", error);
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
});
