#!/usr/bin/env node
// ============================================================================
// Paddle Webhook Replay — Local Test Script
// ============================================================================
// Sends realistic Paddle webhook payloads to your local Supabase edge function.
//
// Usage:
//   node scripts/paddle-webhook-replay.mjs                # all scenarios
//   node scripts/paddle-webhook-replay.mjs activated       # single scenario
//   node scripts/paddle-webhook-replay.mjs --list          # list scenarios
//
// Env vars (or .env):
//   PADDLE_WEBHOOK_SECRET  — same secret configured in the edge function
//   EDGE_FUNCTION_URL      — e.g. http://localhost:54321/functions/v1/paddle
// ============================================================================

import crypto from "node:crypto";

// ── Config ──

const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET || "pdl_test_secret_abc123";
const EDGE_URL = process.env.EDGE_FUNCTION_URL || "http://localhost:54321/functions/v1/paddle";
const WEBHOOK_ENDPOINT = `${EDGE_URL}/webhook`;

// ── Test IDs (deterministic for replay) ──

const IDS = {
  school: "00000000-aaaa-bbbb-cccc-111111111111",
  user:   "00000000-aaaa-bbbb-cccc-222222222222",
  sub:    "sub_test_replay_001",
  cust:   "ctm_test_replay_001",
  txn:    "txn_test_replay_001",
  price:  process.env.PADDLE_PRICE_CORE_MONTHLY || "pri_test_core_monthly",
};

// ── HMAC-SHA256 signer (mirrors Paddle's format) ──

function signPayload(rawBody, secret) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const signedPayload = `${ts}:${rawBody}`;
  const h1 = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  return { header: `ts=${ts};h1=${h1}`, ts };
}

// ── Scenario payloads ──

function makeEvent(eventId, eventType, data) {
  return {
    event_id: eventId,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    notification_id: `ntf_${eventId}`,
    data: {
      id: IDS.sub,
      customer_id: IDS.cust,
      status: "active",
      current_billing_period: {
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      items: [{ price: { id: IDS.price } }],
      custom_data: { school_id: IDS.school, purchased_by: IDS.user, plan: "core" },
      management_urls: {
        cancel: "https://sandbox-checkout.paddle.com/cancel/sub_test",
        update_payment_method: "https://sandbox-checkout.paddle.com/update/sub_test",
      },
      ...data,
    },
  };
}

const SCENARIOS = {
  // 1. Happy path — subscription created  →  activated
  created: makeEvent("evt_test_001", "subscription.created", {
    status: "active",
  }),
  activated: makeEvent("evt_test_002", "subscription.activated", {
    status: "active",
  }),

  // 2. Plan upgrade mid-cycle
  updated_upgrade: makeEvent("evt_test_003", "subscription.updated", {
    status: "active",
    items: [{ price: { id: process.env.PADDLE_PRICE_PRO_MONTHLY || "pri_test_pro_monthly" } }],
    custom_data: { school_id: IDS.school, purchased_by: IDS.user, plan: "pro" },
  }),

  // 3. Payment failure  →  past_due
  payment_failed: makeEvent("evt_test_004", "transaction.payment_failed", {
    id: IDS.txn,
    subscription_id: IDS.sub,
    status: "past_due",
  }),
  past_due: makeEvent("evt_test_005", "subscription.past_due", {
    status: "past_due",
  }),

  // 4. Cancel (but still in period — access should continue)
  canceled_in_period: makeEvent("evt_test_006", "subscription.canceled", {
    status: "canceled",
    canceled_at: new Date().toISOString(),
    current_billing_period: {
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 15 * 86400000).toISOString(), // 15 days left
    },
    scheduled_change: { action: "cancel" },
  }),

  // 5. Cancel after period ends — immediate downgrade
  canceled_expired: makeEvent("evt_test_007", "subscription.canceled", {
    status: "canceled",
    canceled_at: new Date().toISOString(),
    current_billing_period: {
      starts_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      ends_at: new Date(Date.now() - 1 * 86400000).toISOString(), // ended yesterday
    },
  }),

  // 6. Pause & resume
  paused: makeEvent("evt_test_008", "subscription.paused", {
    status: "paused",
    paused_at: new Date().toISOString(),
  }),
  resumed: makeEvent("evt_test_009", "subscription.resumed", {
    status: "active",
  }),

  // 7. Idempotency — replay same event_id (should return duplicate: true)
  idempotency_replay: makeEvent("evt_test_001", "subscription.created", {
    status: "active",
  }),

  // 8. Bad signature
  bad_signature: "__SPECIAL__BAD_SIG",

  // 9. Stale timestamp (older than 5 minutes)
  stale_timestamp: "__SPECIAL__STALE_TS",

  // 10. Transaction completed (just audit, no state change)
  txn_completed: makeEvent("evt_test_010", "transaction.completed", {
    id: IDS.txn,
    subscription_id: IDS.sub,
    status: "completed",
  }),

  // 11. Unknown event type (should 200-OK, log warning)
  unknown_event: makeEvent("evt_test_011", "adjustment.created", {
    id: "adj_test_001",
  }),
};

// ── Send one scenario ──

async function sendScenario(name, scenario) {
  const rawBody = typeof scenario === "string" ? scenario : JSON.stringify(scenario);
  let headers = { "Content-Type": "application/json" };

  if (name === "bad_signature") {
    headers["Paddle-Signature"] = "ts=1234567890;h1=deadbeefdeadbeef";
    const body = JSON.stringify(makeEvent("evt_bad", "subscription.created", {}));
    return doFetch(name, body, headers, "Expected: 400 Invalid signature");
  }

  if (name === "stale_timestamp") {
    // Sign with a timestamp from 10 minutes ago
    const staleTs = (Math.floor(Date.now() / 1000) - 600).toString();
    const body = JSON.stringify(makeEvent("evt_stale", "subscription.created", {}));
    const signedPayload = `${staleTs}:${body}`;
    const h1 = crypto.createHmac("sha256", WEBHOOK_SECRET).update(signedPayload).digest("hex");
    headers["Paddle-Signature"] = `ts=${staleTs};h1=${h1}`;
    return doFetch(name, body, headers, "Expected: 400 (stale timestamp)");
  }

  const { header } = signPayload(rawBody, WEBHOOK_SECRET);
  headers["Paddle-Signature"] = header;

  const expected = name === "idempotency_replay"
    ? "Expected: 200 + duplicate: true"
    : "Expected: 200 + processed: true";

  return doFetch(name, rawBody, headers, expected);
}

async function doFetch(name, body, headers, expectation) {
  const pad = name.padEnd(22);
  try {
    const resp = await fetch(WEBHOOK_ENDPOINT, { method: "POST", headers, body });
    const json = await resp.json().catch(() => ({}));
    const status = resp.status;
    const ok = status === 200 || (name.startsWith("bad_") && status === 400) || (name === "stale_timestamp" && status === 400);
    const icon = ok ? "✅" : "❌";
    console.log(`${icon} ${pad} → ${status} ${JSON.stringify(json)}  (${expectation})`);
    return ok;
  } catch (err) {
    console.log(`❌ ${pad} → NETWORK ERROR: ${err.message}  (${expectation})`);
    return false;
  }
}

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--list")) {
  console.log("Available scenarios:");
  for (const name of Object.keys(SCENARIOS)) {
    console.log(`  ${name}`);
  }
  process.exit(0);
}

const selected = args.length > 0 && !args[0].startsWith("-")
  ? args.filter((a) => SCENARIOS[a])
  : Object.keys(SCENARIOS);

if (selected.length === 0) {
  console.error("Unknown scenario. Use --list to see options.");
  process.exit(1);
}

console.log(`\n🧪 Paddle Webhook Replay — ${selected.length} scenario(s)`);
console.log(`   Target: ${WEBHOOK_ENDPOINT}`);
console.log(`   Secret: ${WEBHOOK_SECRET.slice(0, 8)}…\n`);

let pass = 0;
let fail = 0;
for (const name of selected) {
  const ok = await sendScenario(name, SCENARIOS[name]);
  ok ? pass++ : fail++;
  // Small delay between payloads to avoid race conditions
  await new Promise((r) => setTimeout(r, 200));
}

console.log(`\n── Results: ${pass} passed, ${fail} failed out of ${pass + fail} ──\n`);
process.exit(fail > 0 ? 1 : 0);
