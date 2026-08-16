# Paddle Billing — Deployment & QA Guide

## Files Changed / Created

### New Files
| File | Purpose |
|------|---------|
| `PADDLE_BILLING_MIGRATION.sql` | DB migration: `billing_subscriptions`, `billing_events`, `billing_entitlements` tables + RPCs + updated `get_effective_tier` |
| `supabase/functions/paddle/index.ts` | Edge function: checkout, webhook handler, portal URL |
| `services/entitlementService.ts` | Centralized feature gating module |
| `PADDLE_BILLING_TESTS.sql` | Test fixtures, assertions, simulated webhooks |

### Modified Files (minimal diffs)
| File | Change |
|------|--------|
| `services/tierService.ts` | Core plan price $499→$449, $4990→$4490. `createCheckoutSession` now calls `paddle` function. Added `PAYMENT_PROVIDER`, `fetchBillingSubscription()`, `fetchPortalUrl()` |
| `components/UpgradeModal.tsx` | Trust badge: "Secure via Stripe" → "Secure checkout via Paddle" |
| `components/SchoolAdminPortal.tsx` | Manage subscription text: Stripe → Paddle |
| `App.tsx` | Comment update: "post-Stripe-checkout" → "post-checkout (Paddle / Stripe)" |
| `.env.example` | Added all Paddle env var documentation |

---

## Deployment Steps

### 1. Run DB Migration
```sql
-- Run in Supabase SQL Editor (Dashboard → SQL → New Query)
-- Paste contents of PADDLE_BILLING_MIGRATION.sql and execute
```

### 2. Set Edge Function Secrets
```bash
# From project root (requires supabase CLI)
supabase secrets set PADDLE_API_KEY=pdl_xxx
supabase secrets set PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxx
supabase secrets set PADDLE_ENVIRONMENT=sandbox          # or 'production'
supabase secrets set APP_URL=https://www.brainsheist.com

# Price IDs from Paddle Dashboard → Catalog → Prices
supabase secrets set PADDLE_PRICE_CORE_MONTHLY=pri_xxx
supabase secrets set PADDLE_PRICE_CORE_YEARLY=pri_xxx
supabase secrets set PADDLE_PRICE_STANDARD_MONTHLY=pri_xxx
supabase secrets set PADDLE_PRICE_STANDARD_YEARLY=pri_xxx
supabase secrets set PADDLE_PRICE_PRO_MONTHLY=pri_xxx
supabase secrets set PADDLE_PRICE_PRO_YEARLY=pri_xxx
```

### 3. Deploy Paddle Edge Function
```bash
supabase functions deploy paddle
```

### 4. Configure Paddle Webhook
In Paddle Dashboard → Developers → Notifications:
- **URL:** `https://sozodkxwhubespiedgxm.supabase.co/functions/v1/paddle/webhook`
- **Events to subscribe:**
  - `transaction.paid`
  - `subscription.created`
  - `subscription.activated`
  - `subscription.updated`
  - `subscription.canceled`
  - `subscription.paused`
  - `subscription.resumed`
  - `transaction.completed`
  - `transaction.payment_failed`
  - `transaction.canceled`

Copy the notification destination's endpoint secret into the Supabase
`PADDLE_WEBHOOK_SECRET`. Do not use a Paddle API key or client token as the
webhook secret. Keep signature verification enabled and retain the raw request
body for verification.

### 5. Deploy Frontend
Set these in Vercel for Production and Preview, then redeploy:

```bash
VITE_PADDLE_CLIENT_TOKEN=live_xxx
VITE_PADDLE_ENVIRONMENT=production
```

`VITE_PADDLE_CLIENT_TOKEN` is Paddle's publishable client token. Never put
`PADDLE_API_KEY` or `PADDLE_WEBHOOK_SECRET` in Vercel `VITE_*` variables.

In Paddle Checkout settings, approve `https://www.brainsheist.com` as the
default payment-link domain before using live checkout.

### 6. Run Verification
```sql
-- Paste PADDLE_BILLING_TESTS.sql in SQL Editor and run
```

---

## Environment Variables Summary

| Variable | Where | Example |
|----------|-------|---------|
| `PADDLE_API_KEY` | Supabase secrets | `pdl_xxx` |
| `PADDLE_WEBHOOK_SECRET` | Supabase secrets | `pdl_ntfset_xxx` |
| `PADDLE_ENVIRONMENT` | Supabase secrets | `sandbox` or `production` |
| `APP_URL` | Supabase secrets | `https://www.brainsheist.com` |
| `VITE_PADDLE_CLIENT_TOKEN` | Vercel Production + Preview | `live_xxx` / `test_xxx` |
| `VITE_PADDLE_ENVIRONMENT` | Vercel Production + Preview | `production` / `sandbox` |
| `PADDLE_PRICE_CORE_MONTHLY` | Supabase secrets | `pri_xxx` |
| `PADDLE_PRICE_CORE_YEARLY` | Supabase secrets | `pri_xxx` |
| `PADDLE_PRICE_STANDARD_MONTHLY` | Supabase secrets | `pri_xxx` |
| `PADDLE_PRICE_STANDARD_YEARLY` | Supabase secrets | `pri_xxx` |
| `PADDLE_PRICE_PRO_MONTHLY` | Supabase secrets | `pri_xxx` |
| `PADDLE_PRICE_PRO_YEARLY` | Supabase secrets | `pri_xxx` |

---

## QA Acceptance Checklist

### Happy Path
- [ ] Accept an approved school package; verify no seats activate yet
- [ ] Click "Pay securely with Paddle"; verify Paddle opens for the immutable accepted total
- [ ] Complete payment and verify the signed `transaction.paid` or `transaction.completed` webhook activates the exact platform and programme quantities
- [ ] Verify a new student sees Cambridge, IELTS, and Writing locked until a School Head allocates a named seat
- [ ] Issue a 14-day Paddle invoice; verify access remains unchanged until Paddle reports payment
- [ ] Repeat the same webhook event; verify activation is idempotent
- [ ] Click "Subscribe" on Core plan → redirected to Paddle checkout
- [ ] Complete Paddle checkout (use sandbox test card `4242 4242 4242 4242`)
- [ ] Redirected back to app with `?upgrade=success`
- [ ] Toast shows "Welcome to Brains Heist Pro!"
- [ ] `get_effective_tier()` returns `'pro'`
- [ ] All pro features unlocked (PvP, shop, clans, raids, etc.)
- [ ] `billing_subscriptions` row exists with status='active', provider='paddle'
- [ ] `billing_events` row(s) logged with processed=true
- [ ] `schools.school_plan` updated to 'core'

### Subscription Management
- [ ] BillingTab shows current plan details
- [ ] Management URL available for cancel/update
- [ ] After cancellation webhook: status='cancelled', school_plan='none'
- [ ] Features re-gated after cancellation

### Webhook Robustness
- [ ] Duplicate webhook (same event_id) → ignored, returns 200
- [ ] Invalid signature → returns 400
- [ ] Missing school_id in custom_data → logged as error, returns 200
- [ ] Payment failed → status='past_due'
- [ ] Subscription resumed after pause → status='active', features restored

### Entitlement Checks
- [ ] Free user: `canUseFeature('pvp_battles')` → false
- [ ] Core user: `canUseFeature('pvp_battles')` → true
- [ ] Core user: `getFeatureLimit('cambridge_tests')` → 120
- [ ] Enterprise user: `getFeatureLimit('cambridge_tests')` → null (unlimited)

### RLS Security
- [ ] User A cannot see User B's billing subscription (different school)
- [ ] Regular user cannot INSERT/UPDATE billing_subscriptions
- [ ] Regular user cannot read billing_events (sensitive payloads)
- [ ] Superadmin CAN read billing_events
- [ ] All users CAN read billing_entitlements (public config)

### Admin
- [ ] `admin_grant_comp_access(school_id, 'core', 30, 'test')` → creates active comp subscription
- [ ] Comp grants pro access for 30 days
- [ ] `admin_revoke_comp_access(school_id)` → cancels comp, downgrades school

### Pilot → Paid Upgrade
- [ ] Start pilot → pilot active
- [ ] Subscribe via Paddle → pilot replaced by paid subscription
- [ ] school_plan updated from 'pilot' to 'core'

### No Regressions
- [ ] Existing auth flows work (login, signup, email verification)
- [ ] Game modules load (PvP, raids, clans, shop, tournament)
- [ ] Teacher portal works (assignments, lockdown, reports)
- [ ] Cambridge/IELTS tests accessible for pro users
- [ ] Pilot quota system still works for pilot schools
- [ ] Superadmin dashboard functional

---

## Rollback Plan

If something goes wrong:

### 1. Quick toggle back to Stripe
In `services/tierService.ts`, change:
```typescript
export const PAYMENT_PROVIDER: 'paddle' | 'stripe' = 'stripe';
```

### 2. DB tables are additive — no rollback needed
The migration only ADDS tables. Existing `stripe_customers` is untouched. The updated `get_effective_tier` checks `billing_subscriptions` first but falls through to existing `schools.school_plan` logic.

### 3. To fully remove (if needed)
```sql
DROP TABLE IF EXISTS billing_events CASCADE;
DROP TABLE IF EXISTS billing_subscriptions CASCADE;
DROP TABLE IF EXISTS billing_entitlements CASCADE;
```
Then redeploy the original `get_effective_tier` from before the migration.

---

## Architecture Summary

```
School Head accepts an approved package
        ↓
  Chooses Paddle checkout or a 14-day Paddle invoice
        ↓
  school_head_choose_quote_payment()
    → Creates an immutable, auditable payment attempt
        ↓
  Edge Function: POST /paddle/school-quote-checkout
    → Verifies the active School Head and accepted quote hash
    → Uses the exact protected settlement amount
    → Creates Paddle automatic checkout or manual invoice
        ↓
  School completes payment on Paddle
        ↓
  Paddle sends webhook → POST /paddle/webhook
    → Verifies HMAC-SHA256 signature
    → Idempotency check
    → Verifies transaction ↔ quote ↔ payment-attempt binding
    → Activates the exact accepted capacity only after paid/completed
        ↓
  School Head allocates named programme seats
    → Students see every programme
    → Only allocated students can open purchased programmes
```

Mid-term increases use Paddle's subscription update preview with
`prorated_immediately`. The application compares Paddle's tax-exclusive preview
to the immutable accepted proration and refuses the change if they differ.

## Pricing Reference

| Plan | Monthly | Yearly | Cambridge | IELTS | Game |
|------|---------|--------|-----------|-------|------|
| Core | $449 | $4,490 | 120 | 40 | 120 |
| Standard | $649 | $6,490 | 220 | 80 | 220 |
| Pro | $1,149 | $11,490 | 450 | 150 | 450 |
| Enterprise | Custom | Custom | ∞ | ∞ | ∞ |
