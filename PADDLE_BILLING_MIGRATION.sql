-- ============================================================================
-- PADDLE BILLING MIGRATION
-- ============================================================================
-- Adds provider-agnostic billing tables alongside existing stripe_customers.
-- Supports Paddle as Merchant of Record with full subscription lifecycle,
-- event audit log, and strict RLS.
--
-- Tables created:
--   billing_subscriptions   — active subscription state (Paddle or Stripe)
--   billing_events          — webhook event audit log (idempotency)
--   billing_entitlements    — tier → feature → limits mapping
--
-- RPCs created:
--   get_billing_subscription()       — current user's subscription
--   admin_grant_comp_access()        — superadmin time-bound comp access
--   admin_revoke_comp_access()       — superadmin revoke comp access
--
-- Non-destructive: does NOT modify stripe_customers or existing tables.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. billing_subscriptions
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  purchased_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Provider info (supports Paddle, Stripe, or future providers)
  provider              TEXT NOT NULL DEFAULT 'paddle'
                        CHECK (provider IN ('paddle', 'stripe', 'manual')),
  provider_customer_id  TEXT,              -- Paddle customer ID (ctm_xxx)
  provider_subscription_id TEXT,           -- Paddle subscription ID (sub_xxx)

  -- Subscription state
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired')),
  plan                  TEXT NOT NULL DEFAULT 'core'
                        CHECK (plan IN ('core', 'standard', 'pro', 'enterprise')),
  billing_interval      TEXT NOT NULL DEFAULT 'monthly'
                        CHECK (billing_interval IN ('monthly', 'yearly')),
  price_id              TEXT,              -- Paddle price ID (pri_xxx)

  -- Billing period
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at           TIMESTAMPTZ,
  paused_at             TIMESTAMPTZ,

  -- Comp/override (admin-granted free access)
  is_comp               BOOLEAN NOT NULL DEFAULT FALSE,
  comp_expires_at       TIMESTAMPTZ,      -- NULL = permanent comp
  comp_granted_by       UUID REFERENCES public.users(id),
  comp_reason           TEXT,

  -- Paddle portal URL (for manage/cancel self-service)
  management_url        TEXT,
  update_payment_url    TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one active subscription per school per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_sub_school_provider_active
  ON public.billing_subscriptions (school_id, provider)
  WHERE status IN ('active', 'trialing', 'past_due', 'paused');

-- Lookup by provider subscription ID (webhook resolution)
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_sub_provider_sub_id
  ON public.billing_subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- Lookup by provider customer ID
CREATE INDEX IF NOT EXISTS idx_billing_sub_provider_cust
  ON public.billing_subscriptions (provider_customer_id);

-- Lookup by school
CREATE INDEX IF NOT EXISTS idx_billing_sub_school
  ON public.billing_subscriptions (school_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION billing_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_billing_subscriptions_updated ON public.billing_subscriptions;

CREATE TRIGGER trg_billing_subscriptions_updated
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION billing_subscriptions_updated_at();

-- ── RLS ──

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own school's billing subscription
CREATE POLICY "School members can view own subscription"
  ON public.billing_subscriptions
  FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Only service_role (webhooks) and superadmin can write
CREATE POLICY "Service role manages billing subscriptions"
  ON public.billing_subscriptions
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin')
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin')
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 2. billing_events (webhook audit log + idempotency)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.billing_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL DEFAULT 'paddle'
                    CHECK (provider IN ('paddle', 'stripe', 'manual')),
  event_id          TEXT NOT NULL,        -- Paddle event ID (evt_xxx) — idempotency key
  event_type        TEXT NOT NULL,        -- e.g. 'subscription.created', 'transaction.completed'
  provider_subscription_id TEXT,          -- link to subscription
  school_id         UUID REFERENCES public.schools(id) ON DELETE SET NULL,

  -- Raw payload (stored for debugging, NOT exposed via RLS to users)
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Processing state
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error  TEXT,
  processed_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: unique event per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_idempotency
  ON public.billing_events (provider, event_id);

-- Lookup by subscription
CREATE INDEX IF NOT EXISTS idx_billing_events_sub
  ON public.billing_events (provider_subscription_id);

-- Lookup unprocessed events (retry queue)
CREATE INDEX IF NOT EXISTS idx_billing_events_unprocessed
  ON public.billing_events (processed, created_at)
  WHERE NOT processed;

-- ── RLS ──

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write events (contains sensitive payload)
CREATE POLICY "Service role manages billing events"
  ON public.billing_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Superadmin can read events for debugging
CREATE POLICY "Superadmin can read billing events"
  ON public.billing_events
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin')
  );


-- ────────────────────────────────────────────────────────────────────────────
-- 3. billing_entitlements (tier → features → limits)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.billing_entitlements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan          TEXT NOT NULL CHECK (plan IN ('free', 'pilot', 'core', 'standard', 'pro', 'enterprise')),
  feature_key   TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  limit_value   INT,                     -- NULL = unlimited
  metadata      JSONB DEFAULT '{}'::jsonb,

  UNIQUE (plan, feature_key)
);

-- Seed default entitlements
INSERT INTO public.billing_entitlements (plan, feature_key, enabled, limit_value) VALUES
  -- Free tier
  ('free', 'lockdown_mode',      TRUE,  NULL),
  ('free', 'lockdown_duration',  TRUE,  15),     -- max 15 min
  ('free', 'lockdown_students',  TRUE,  20),     -- max 20 students
  ('free', 'lockdown_maps',      TRUE,  3),      -- 3 maps only
  ('free', 'pvp_battles',        FALSE, 0),
  ('free', 'shop',               FALSE, 0),
  ('free', 'clans',              FALSE, 0),
  ('free', 'raids',              FALSE, 0),
  ('free', 'tournaments',        FALSE, 0),
  ('free', 'cambridge_tests',    FALSE, 0),
  ('free', 'ielts_tests',        FALSE, 0),
  ('free', 'assignments',        FALSE, 0),
  ('free', 'question_bank',      FALSE, 0),
  ('free', 'reports',            FALSE, 0),
  ('free', 'admission_tests',    FALSE, 0),
  ('free', 'custom_questions',   FALSE, 0),

  -- Core tier ($449/mo)
  ('core', 'lockdown_mode',      TRUE,  NULL),
  ('core', 'lockdown_duration',  TRUE,  NULL),   -- unlimited
  ('core', 'lockdown_students',  TRUE,  NULL),
  ('core', 'lockdown_maps',      TRUE,  NULL),
  ('core', 'pvp_battles',        TRUE,  NULL),
  ('core', 'shop',               TRUE,  NULL),
  ('core', 'clans',              TRUE,  NULL),
  ('core', 'raids',              TRUE,  NULL),
  ('core', 'tournaments',        TRUE,  NULL),
  ('core', 'cambridge_tests',    TRUE,  120),
  ('core', 'ielts_tests',        TRUE,  40),
  ('core', 'assignments',        TRUE,  NULL),
  ('core', 'question_bank',      TRUE,  NULL),
  ('core', 'reports',            TRUE,  NULL),
  ('core', 'admission_tests',    TRUE,  NULL),
  ('core', 'custom_questions',   TRUE,  NULL),

  -- Standard tier
  ('standard', 'lockdown_mode',      TRUE,  NULL),
  ('standard', 'lockdown_duration',  TRUE,  NULL),
  ('standard', 'lockdown_students',  TRUE,  NULL),
  ('standard', 'lockdown_maps',      TRUE,  NULL),
  ('standard', 'pvp_battles',        TRUE,  NULL),
  ('standard', 'shop',               TRUE,  NULL),
  ('standard', 'clans',              TRUE,  NULL),
  ('standard', 'raids',              TRUE,  NULL),
  ('standard', 'tournaments',        TRUE,  NULL),
  ('standard', 'cambridge_tests',    TRUE,  220),
  ('standard', 'ielts_tests',        TRUE,  80),
  ('standard', 'assignments',        TRUE,  NULL),
  ('standard', 'question_bank',      TRUE,  NULL),
  ('standard', 'reports',            TRUE,  NULL),
  ('standard', 'admission_tests',    TRUE,  NULL),
  ('standard', 'custom_questions',   TRUE,  NULL),

  -- Pro tier
  ('pro', 'lockdown_mode',      TRUE,  NULL),
  ('pro', 'lockdown_duration',  TRUE,  NULL),
  ('pro', 'lockdown_students',  TRUE,  NULL),
  ('pro', 'lockdown_maps',      TRUE,  NULL),
  ('pro', 'pvp_battles',        TRUE,  NULL),
  ('pro', 'shop',               TRUE,  NULL),
  ('pro', 'clans',              TRUE,  NULL),
  ('pro', 'raids',              TRUE,  NULL),
  ('pro', 'tournaments',        TRUE,  NULL),
  ('pro', 'cambridge_tests',    TRUE,  450),
  ('pro', 'ielts_tests',        TRUE,  150),
  ('pro', 'assignments',        TRUE,  NULL),
  ('pro', 'question_bank',      TRUE,  NULL),
  ('pro', 'reports',            TRUE,  NULL),
  ('pro', 'admission_tests',    TRUE,  NULL),
  ('pro', 'custom_questions',   TRUE,  NULL),

  -- Enterprise tier
  ('enterprise', 'lockdown_mode',      TRUE,  NULL),
  ('enterprise', 'lockdown_duration',  TRUE,  NULL),
  ('enterprise', 'lockdown_students',  TRUE,  NULL),
  ('enterprise', 'lockdown_maps',      TRUE,  NULL),
  ('enterprise', 'pvp_battles',        TRUE,  NULL),
  ('enterprise', 'shop',               TRUE,  NULL),
  ('enterprise', 'clans',              TRUE,  NULL),
  ('enterprise', 'raids',              TRUE,  NULL),
  ('enterprise', 'tournaments',        TRUE,  NULL),
  ('enterprise', 'cambridge_tests',    TRUE,  NULL),  -- unlimited
  ('enterprise', 'ielts_tests',        TRUE,  NULL),
  ('enterprise', 'assignments',        TRUE,  NULL),
  ('enterprise', 'question_bank',      TRUE,  NULL),
  ('enterprise', 'reports',            TRUE,  NULL),
  ('enterprise', 'admission_tests',    TRUE,  NULL),
  ('enterprise', 'custom_questions',   TRUE,  NULL)
ON CONFLICT (plan, feature_key) DO NOTHING;

-- RLS: everyone can read entitlements (public config), only service_role can write
ALTER TABLE public.billing_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read entitlements"
  ON public.billing_entitlements
  FOR SELECT
  USING (TRUE);

CREATE POLICY "Service role manages entitlements"
  ON public.billing_entitlements
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPCs
-- ────────────────────────────────────────────────────────────────────────────

-- Get current user's billing subscription
CREATE OR REPLACE FUNCTION get_billing_subscription()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_school_id UUID;
  v_sub RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT school_id INTO v_school_id FROM users WHERE id = v_user_id;
  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'has_subscription', false,
      'provider', null
    );
  END IF;

  SELECT * INTO v_sub
  FROM billing_subscriptions
  WHERE school_id = v_school_id
    AND status IN ('active', 'trialing', 'past_due', 'paused')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'has_subscription', false,
      'provider', null
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'has_subscription', true,
    'provider', v_sub.provider,
    'status', v_sub.status,
    'plan', v_sub.plan,
    'billing_interval', v_sub.billing_interval,
    'current_period_end', v_sub.current_period_end,
    'cancel_at_period_end', v_sub.cancel_at_period_end,
    'management_url', v_sub.management_url,
    'update_payment_url', v_sub.update_payment_url,
    'is_comp', v_sub.is_comp,
    'comp_expires_at', v_sub.comp_expires_at
  );
END;
$$;


-- Admin: grant comp (free) access to a school, time-bound
CREATE OR REPLACE FUNCTION admin_grant_comp_access(
  p_school_id UUID,
  p_plan TEXT DEFAULT 'core',
  p_days INT DEFAULT 30,
  p_reason TEXT DEFAULT 'Admin comp'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_expires TIMESTAMPTZ;
BEGIN
  -- Superadmin only
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_admin_id AND role = 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_days IS NOT NULL AND p_days > 0 THEN
    v_expires := now() + (p_days || ' days')::interval;
  END IF;

  INSERT INTO billing_subscriptions (
    school_id, provider, status, plan, billing_interval,
    is_comp, comp_expires_at, comp_granted_by, comp_reason,
    current_period_start, current_period_end
  ) VALUES (
    p_school_id, 'manual', 'active', p_plan, 'monthly',
    TRUE, v_expires, v_admin_id, p_reason,
    now(), COALESCE(v_expires, now() + interval '100 years')
  )
  ON CONFLICT (school_id, provider) WHERE status IN ('active', 'trialing', 'past_due', 'paused')
  DO UPDATE SET
    plan = EXCLUDED.plan,
    status = 'active',
    is_comp = TRUE,
    comp_expires_at = EXCLUDED.comp_expires_at,
    comp_granted_by = EXCLUDED.comp_granted_by,
    comp_reason = EXCLUDED.comp_reason,
    current_period_end = EXCLUDED.current_period_end;

  -- Also update school plan
  UPDATE schools SET school_plan = p_plan WHERE id = p_school_id;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'plan', p_plan,
    'expires_at', v_expires,
    'reason', p_reason
  );
END;
$$;


-- Admin: revoke comp access
CREATE OR REPLACE FUNCTION admin_revoke_comp_access(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_admin_id AND role = 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE billing_subscriptions
  SET status = 'cancelled', canceled_at = now()
  WHERE school_id = p_school_id AND is_comp = TRUE
    AND status IN ('active', 'trialing', 'past_due');

  UPDATE schools SET school_plan = 'none' WHERE id = p_school_id;

  RETURN jsonb_build_object('success', true, 'school_id', p_school_id);
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 5. Update get_effective_tier to also check billing_subscriptions
-- ────────────────────────────────────────────────────────────────────────────
-- We ADD a check for billing_subscriptions before the existing school_plan check.
-- This way Paddle subscriptions are recognized without modifying schools.school_plan
-- (though the webhook handler does update school_plan for backward compatibility).

CREATE OR REPLACE FUNCTION get_effective_tier(p_user_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := COALESCE(p_user_id, auth.uid());
  v_user       RECORD;
  v_school     RECORD;
  v_billing    RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN 'free'; END IF;

  SELECT account_tier, school_id
    INTO v_user
    FROM users
   WHERE id = v_uid;

  IF NOT FOUND THEN RETURN 'free'; END IF;

  -- Priority 1: individual override (superadmin-granted)
  IF v_user.account_tier = 'pro' THEN RETURN 'pro'; END IF;

  -- Priority 2: active billing subscription (Paddle/Stripe/comp)
  IF v_user.school_id IS NOT NULL THEN
    SELECT status, plan, is_comp, comp_expires_at
      INTO v_billing
      FROM billing_subscriptions
     WHERE school_id = v_user.school_id
       AND status IN ('active', 'trialing')
     ORDER BY created_at DESC
     LIMIT 1;

    IF FOUND THEN
      -- Check if comp has expired
      IF v_billing.is_comp AND v_billing.comp_expires_at IS NOT NULL
         AND v_billing.comp_expires_at < now() THEN
        -- Comp expired — mark it and fall through
        UPDATE billing_subscriptions
           SET status = 'expired'
         WHERE school_id = v_user.school_id
           AND is_comp = TRUE
           AND status IN ('active', 'trialing');
      ELSE
        RETURN 'pro';
      END IF;
    END IF;
  END IF;

  -- Priority 3: school plan (legacy Stripe / manual)
  IF v_user.school_id IS NOT NULL THEN
    SELECT school_plan, trial_ends_at
      INTO v_school
      FROM schools
     WHERE id = v_user.school_id;

    IF FOUND THEN
      IF v_school.school_plan IN ('core', 'standard', 'pro', 'enterprise') THEN
        RETURN 'pro';
      END IF;

      IF v_school.school_plan = 'pilot' AND v_school.trial_ends_at > now() THEN
        RETURN 'pro';
      END IF;

      -- Lazy downgrade expired pilots
      IF v_school.school_plan = 'pilot' AND v_school.trial_ends_at <= now() THEN
        UPDATE schools SET school_plan = 'none' WHERE id = v_user.school_id;
      END IF;
    END IF;
  END IF;

  RETURN 'free';
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. Verification
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_subscriptions'
  ), 'FAIL: billing_subscriptions table not found';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_events'
  ), 'FAIL: billing_events table not found';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_entitlements'
  ), 'FAIL: billing_entitlements table not found';

  RAISE NOTICE '✅ billing_subscriptions table created';
  RAISE NOTICE '✅ billing_events table created';
  RAISE NOTICE '✅ billing_entitlements table created';
  RAISE NOTICE '✅ get_effective_tier updated with billing_subscriptions support';
  RAISE NOTICE '✅ admin_grant_comp_access RPC created';
  RAISE NOTICE '✅ admin_revoke_comp_access RPC created';
  RAISE NOTICE '✅ get_billing_subscription RPC created';
END;
$$;
