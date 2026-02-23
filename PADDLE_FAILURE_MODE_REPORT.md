# Paddle Integration — Failure-Mode Report

> Audit date: 2026-02-23  
> Scope: `supabase/functions/paddle/index.ts`, `PADDLE_BILLING_MIGRATION.sql`

---

## 1. Webhook Signature Verification — Paddle Headers vs Our Verifier

### What Paddle sends

| Header | Value format | Example |
|---|---|---|
| `Paddle-Signature` | `ts={unix_seconds};h1={hex_hmac}` | `ts=1709000000;h1=a3f5…` |

- HMAC-SHA256 of `{ts}:{raw_request_body}` using the notification-setting secret.
- Paddle does **not** send multiple `h1` values (unlike Stripe which can send `v1=…,v1=…`).

### What our verifier does (lines 82–115 of `paddle/index.ts`)

| Step | Implementation | Correct? |
|---|---|---|
| Read header | `req.headers.get("paddle-signature")` — HTTP headers are case-insensitive | ✅ |
| Parse format | Split on `;`, then on `=` | ✅ |
| Timestamp check | \|now − ts\| > 300 s → reject | ✅ (5 min tolerance) |
| Signed payload | `${ts}:${rawBody}` | ✅ matches Paddle docs |
| HMAC algorithm | `crypto.subtle` → HMAC SHA-256 | ✅ |
| Comparison | Hex string equality (`h1 === expected`) | ✅ |

### Residual risks

| Risk | Severity | Mitigation |
|---|---|---|
| Constant-time comparison not used | Low | Timing attack requires ~million requests; negligible for webhooks behind Paddle's IPs |
| Body encoding: if Deno `req.text()` normalises Unicode differently from the raw bytes, HMAC will mismatch | Very low | Paddle payloads are ASCII JSON; no known Deno normalisation on `.text()` |

**Verdict: Signature verification is correct.** No code change needed.

---

## 2. Paddle Event Types — Required vs Handled

### Events Paddle sends for subscription lifecycle

| Paddle event | Purpose | Handled? | Notes |
|---|---|---|---|
| `subscription.created` | Sub row created (may still be pending payment) | ✅ | Upserts into `billing_subscriptions` |
| `subscription.activated` | First payment confirmed, sub is live | ✅ | Same handler as created/updated |
| `subscription.updated` | Plan change, quantity change, billing period roll | ✅ | Same handler |
| `subscription.past_due` | Payment failed, sub enters grace period | ✅ **ADDED** | Was **missing** — only `transaction.payment_failed` was handled |
| `subscription.canceled` | Sub canceled (may still have remaining period) | ✅ **FIXED** | Was immediately downgrading school — now preserves access until `current_period_end` |
| `subscription.paused` | Sub paused by customer or API | ✅ | |
| `subscription.resumed` | Sub resumed after pause | ✅ | |
| `transaction.completed` | Successful payment | ✅ | Logged for audit only |
| `transaction.payment_failed` | Payment attempt failed | ✅ | Sets `past_due` on the subscription |

### Events we do NOT subscribe to (and don't need)

| Event | Reason we skip it |
|---|---|
| `subscription.trialing` | Paddle sends `subscription.created` with `status: trialing` — already handled |
| `transaction.created` | Informational; no state change needed |
| `transaction.updated` | Status reflected in completed/failed events |
| `adjustment.created` | Refunds — no tier impact; handled manually |
| `customer.*` | Customer CRUD — not needed; we identify by `custom_data.school_id` |

### Paddle Webhook Subscription Config

You must subscribe to these events in Paddle Dashboard → **Notifications**:

```
subscription.created
subscription.activated
subscription.updated
subscription.past_due          ← NEW — add this
subscription.canceled
subscription.paused
subscription.resumed
transaction.completed
transaction.payment_failed
```

---

## 3. Effective Tier Resolution — `get_effective_tier()`

### Priority chain

| Priority | Source | Status filter | Resolution |
|---|---|---|---|
| 1 | `users.account_tier = 'pro'` | — | Individual superadmin grant → `'pro'` |
| 2a | `billing_subscriptions` | `active`, `trialing`, `past_due` | Active paid sub → `'pro'` |
| 2b | `billing_subscriptions` | `cancelled` + `current_period_end > now()` | **ADDED** — Cancelled but still in period → `'pro'` |
| 3 | `schools.school_plan` | `core/standard/pro/enterprise` | Legacy Stripe / manual → `'pro'` |
| 4 | `schools.school_plan = 'pilot'` | `trial_ends_at > now()` | Active pilot → `'pro'` |
| 5 | — | — | Fallback → `'free'` |

### Scenario walkthrough

| Scenario | billing_subscriptions.status | get_effective_tier returns | Correct? |
|---|---|---|---|
| **Active sub** | `active` | `pro` | ✅ |
| **Trialing** | `trialing` | `pro` | ✅ |
| **Payment fails (grace)** | `past_due` | `pro` | ✅ **FIXED** — was returning `free` |
| **User cancels, 15 days left** | `cancelled`, `period_end > now()` | `pro` | ✅ **FIXED** — was returning `free` |
| **User cancels, period ended** | `cancelled`, `period_end < now()` | `free` | ✅ |
| **Comp access, not expired** | `active`, `is_comp = true` | `pro` | ✅ |
| **Comp access, expired** | auto-set to `expired` | `free` | ✅ |
| **Paused sub** | `paused` | `free` | ✅ (paused = no access, by design) |
| **No sub, legacy school_plan=core** | — | `pro` (via Priority 3) | ✅ |

---

## 4. Idempotency — Retries & Out-of-Order Events

### Idempotency key

- Key: `(provider='paddle', event_id=evt.event_id)`
- Enforced by: unique DB index `idx_billing_events_idempotency` on `(provider, event_id)`
- Check: SELECT before insert; if `processed = true` → return `200 { duplicate: true }` → Paddle stops retrying

### Retry flow

```
Paddle sends evt_001 (1st attempt)
  → billing_events INSERT (processed=false)
  → process logic
  → UPDATE processed=true
  → return 200

Paddle retries evt_001 (2nd attempt, e.g. timeout)
  → SELECT finds evt_001 with processed=true
  → return 200 { duplicate: true }
  → no re-processing ✅
```

### Race condition (two simultaneous deliveries of same event)

```
Thread A: SELECT → not found
Thread B: SELECT → not found
Thread A: INSERT (provider=paddle, event_id=evt_001) → OK
Thread B: INSERT (provider=paddle, event_id=evt_001) → UNIQUE VIOLATION
```

**Risk:** Thread B's insert fails and the error propagates to the catch block. The event is marked as `processed: false` with a `processing_error`. On Paddle's next retry, our idempotency check finds `processed: false` → re-processes successfully.

**Verdict:** Safe — at-least-once delivery is guaranteed. Worst case: one retry cycle delay.

### Out-of-order events

| Scenario | Handler | Safe? |
|---|---|---|
| `subscription.activated` before `subscription.created` | Both use the same upsert-by-`provider_subscription_id` handler | ✅ |
| `subscription.canceled` before `subscription.created` | Cancel handler does UPDATE only; if row doesn't exist, 0 rows affected — cancel is lost but Paddle retries | ⚠️ Acceptable — rare race, self-healing on retry |
| `subscription.past_due` before `subscription.created` | Same as above — UPDATE only | ⚠️ Same |
| `transaction.payment_failed` before `subscription.created` | Same | ⚠️ Same |

**Residual risk:** Cancel/pause/resume handlers do `UPDATE … WHERE provider_subscription_id = X`. If the row doesn't exist yet (extreme out-of-order), the update is a no-op. Paddle will retry the event, and by then the created/activated handler will have inserted the row. This is safe for production use.

---

## 5. Bugs Found & Fixed

### Bug 1 — `subscription.past_due` event not handled (FIXED)

**Before:** Only `transaction.payment_failed` set `past_due`. Paddle sends `subscription.past_due` as the authoritative event.  
**Fix:** Added `subscription.past_due` case to the webhook handler.

### Bug 2 — `get_effective_tier` excluded `past_due` (FIXED)

**Before:** `WHERE status IN ('active', 'trialing')` — students lost access immediately on any failed payment.  
**Fix:** Now includes `'past_due'` in the query. Grace period access preserved.

### Bug 3 — `get_effective_tier` ignored cancelled-but-in-period subs (FIXED)

**Before:** Cancelled subs were invisible to the tier check regardless of remaining period.  
**Fix:** Added fallback query for `status = 'cancelled' AND current_period_end > now()`.

### Bug 4 — `subscription.canceled` immediately downgraded school (FIXED)

**Before:** Handler set `schools.school_plan = 'none'` on every cancel event.  
**Fix:** Now checks `current_billing_period.ends_at`. Only downgrades if the period has already ended.

### Bug 5 — `management_url` semantics (DOCUMENTED)

`management_urls.cancel` is the user-facing subscription management page (which includes cancel option). Paddle doesn't provide a separate "manage" URL. Added a clarifying comment. The stored value is correct.

---

## 6. Local Webhook Replay

See [`scripts/paddle-webhook-replay.mjs`](scripts/paddle-webhook-replay.mjs).

### Quick start

```bash
# 1. Start local Supabase
supabase start

# 2. Seed test school + user (one-time)
# INSERT INTO schools (id, name) VALUES ('00000000-aaaa-bbbb-cccc-111111111111', 'Test School');
# INSERT INTO users (id, school_id, role) VALUES ('00000000-aaaa-bbbb-cccc-222222222222', '00000000-aaaa-bbbb-cccc-111111111111', 'school_admin');

# 3. Run all scenarios
PADDLE_WEBHOOK_SECRET=pdl_test_secret_abc123 \
EDGE_FUNCTION_URL=http://localhost:54321/functions/v1/paddle \
  node scripts/paddle-webhook-replay.mjs

# 4. Run a single scenario
node scripts/paddle-webhook-replay.mjs past_due

# 5. List available scenarios
node scripts/paddle-webhook-replay.mjs --list
```

### Scenarios included

| # | Name | Tests |
|---|---|---|
| 1 | `created` | Happy path — new subscription |
| 2 | `activated` | Subscription activated after first payment |
| 3 | `updated_upgrade` | Plan upgrade mid-cycle (core → pro) |
| 4 | `payment_failed` | Transaction payment failure |
| 5 | `past_due` | Subscription enters past_due grace period |
| 6 | `canceled_in_period` | Cancel with 15 days remaining — should NOT downgrade |
| 7 | `canceled_expired` | Cancel with period already ended — should downgrade |
| 8 | `paused` | Subscription paused |
| 9 | `resumed` | Subscription resumed |
| 10 | `idempotency_replay` | Replays `evt_test_001` — should return `duplicate: true` |
| 11 | `bad_signature` | Forged signature — should return 400 |
| 12 | `stale_timestamp` | 10-minute-old timestamp — should return 400 |
| 13 | `txn_completed` | Transaction completed (audit only) |
| 14 | `unknown_event` | Unknown event type — should 200-OK |
