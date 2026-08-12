-- ============================================================================
-- MONETIZATION MIGRATION — School Subscription Plans
-- ============================================================================
--
-- Model:
--   FREE  = Lockdown mode with limited maps/duration/capacity + watermark.
--           Any teacher can use this without paying.
--   PAID  = Full Brains Heist (PvP, clans, shop, raids, tournaments,
--           Cambridge, IELTS, leaderboard, achievements, all maps, etc.)
--
-- Plans (all school-level, no individual purchase):
--   none       – Default. Free Lockdown only.
--   pilot      – 30-day free trial. 60 Cambridge / 20 IELTS / 60 Game seats.
--   core       – $499/mo or $4,990/yr. 120 / 40 / 120 seats.
--   standard   – $649/mo or $6,490/yr. 220 / 80 / 220 seats. (Most Popular)
--   pro        – $1,149/mo or $11,490/yr. 450 / 150 / 450 seats.
--   enterprise – Custom pricing. Unlimited seats.
--
-- Tier resolution (get_effective_tier):
--   1. User has account_tier='pro'                       → 'pro' (admin override)
--   2. School has active plan (core/standard/pro/ent.)   → 'pro'
--   3. School on pilot AND trial_ends_at > NOW()         → 'pro'
--   4. Otherwise                                         → 'free'
--
-- Objects created:
--   COLUMN  schools.school_plan          TEXT DEFAULT 'none'
--   COLUMN  schools.trial_ends_at        TIMESTAMPTZ
--   COLUMN  users.account_tier           TEXT DEFAULT 'free'
--   TABLE   stripe_customers             (subscription tracking)
--   FUNC    get_effective_tier(UUID)      → TEXT
--   FUNC    get_plan_seat_limits(TEXT)    → JSONB
--   FUNC    get_school_plan_details(UUID) → JSONB
--   FUNC    check_lockdown_limits()       → JSONB
--   FUNC    start_school_pilot()          → JSONB
--   FUNC    admin_set_school_plan(UUID, TEXT) → JSONB
--   FUNC    admin_set_user_tier(UUID, TEXT)   → JSONB
--   FUNC    require_pro_tier()            → JSONB  (guard)
--
-- Dependencies: users, schools, school_members, is_school_admin(), is_superadmin()
-- ============================================================================


-- ============================================================================
-- (a) MIGRATION SQL
-- ============================================================================

-- ────────────────────────────────────────────
-- 1. Add school_plan to schools
-- ────────────────────────────────────────────

DO $$
BEGIN
  -- Drop old column if it exists from a previous version
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schools' AND column_name = 'school_tier'
  ) THEN
    ALTER TABLE schools DROP CONSTRAINT IF EXISTS chk_schools_school_tier;
    ALTER TABLE schools DROP COLUMN school_tier;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schools' AND column_name = 'school_plan'
  ) THEN
    ALTER TABLE schools ADD COLUMN school_plan TEXT NOT NULL DEFAULT 'none';
    ALTER TABLE schools ADD CONSTRAINT chk_schools_school_plan
      CHECK (school_plan IN ('none', 'pilot', 'core', 'standard', 'pro', 'enterprise'));
  END IF;
END $$;

COMMENT ON COLUMN schools.school_plan IS
  'Active subscription plan. none=free lockdown only. pilot=30-day trial. core/standard/pro/enterprise=paid.';


-- ────────────────────────────────────────────
-- 2. Add trial_ends_at to schools
-- ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schools' AND column_name = 'trial_ends_at'
  ) THEN
    ALTER TABLE schools ADD COLUMN trial_ends_at TIMESTAMPTZ;
  END IF;
END $$;

COMMENT ON COLUMN schools.trial_ends_at IS
  'When the pilot trial expires. NULL for paid plans. Checked at read time by get_effective_tier.';


-- ────────────────────────────────────────────
-- 3. Add account_tier to users (admin override)
-- ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'account_tier'
  ) THEN
    ALTER TABLE users ADD COLUMN account_tier TEXT NOT NULL DEFAULT 'free';
    ALTER TABLE users ADD CONSTRAINT chk_users_account_tier
      CHECK (account_tier IN ('free', 'pro'));
  END IF;
END $$;

COMMENT ON COLUMN users.account_tier IS
  'Individual tier override. Only set by superadmin for demo/comp accounts. Normal users rely on school plan.';


-- ────────────────────────────────────────────
-- 4. Table: stripe_customers (Stripe subscription tracking)
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stripe_customers (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  purchased_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_customer_id      TEXT NOT NULL,
  stripe_subscription_id  TEXT UNIQUE,
  status                  TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'past_due', 'cancelled', 'expired')),
  plan                    TEXT NOT NULL
                          CHECK (plan IN ('core', 'standard', 'pro', 'enterprise')),
  price_id                TEXT,           -- Stripe price ID for reference
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at               TIMESTAMPTZ,    -- scheduled cancellation
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE stripe_customers IS
  'Tracks Stripe subscriptions for schools. Webhook handler creates/updates rows, then flips schools.school_plan.';

CREATE INDEX IF NOT EXISTS idx_stripe_customers_school
  ON stripe_customers (school_id);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_sub
  ON stripe_customers (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_cust
  ON stripe_customers (stripe_customer_id);


-- ────────────────────────────────────────────
-- 5. updated_at trigger for stripe_customers
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_fn_stripe_customers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON stripe_customers;

CREATE TRIGGER trg_stripe_customers_updated_at
  BEFORE UPDATE ON stripe_customers
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_stripe_customers_updated_at();


-- ────────────────────────────────────────────
-- 6. RLS on stripe_customers
-- ────────────────────────────────────────────

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

-- School members can see their school's subscription
DROP POLICY IF EXISTS "School members can view own subscription" ON stripe_customers;
CREATE POLICY "School members can view own subscription"
  ON stripe_customers FOR SELECT
  USING (
    school_id IN (SELECT u.school_id FROM users u WHERE u.id = auth.uid())
    OR is_superadmin()
  );

-- No client writes — webhook edge function uses service role key
DROP POLICY IF EXISTS "Service role manages stripe customers" ON stripe_customers;
CREATE POLICY "Service role manages stripe customers"
  ON stripe_customers FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());


-- ────────────────────────────────────────────
-- 7. Core RPC: get_effective_tier
--    Returns 'free' or 'pro' for UI gating.
--    Abstracts away plan details.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_effective_tier(
  p_user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_account_tier TEXT;
  v_school_id    UUID;
  v_school_plan  TEXT;
  v_trial_end    TIMESTAMPTZ;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN 'free';
  END IF;

  -- Get user info
  SELECT u.account_tier, u.school_id
  INTO v_account_tier, v_school_id
  FROM users u
  WHERE u.id = v_user_id;

  IF v_account_tier IS NULL THEN
    RETURN 'free';
  END IF;

  -- 1. Admin override (superadmin-granted pro)
  IF v_account_tier = 'pro' THEN
    RETURN 'pro';
  END IF;

  -- 2. School plan check
  IF v_school_id IS NOT NULL THEN
    SELECT s.school_plan, s.trial_ends_at
    INTO v_school_plan, v_trial_end
    FROM schools s
    WHERE s.id = v_school_id;

    -- Active paid plan
    IF v_school_plan IN ('core', 'standard', 'pro', 'enterprise') THEN
      RETURN 'pro';
    END IF;

    -- Active pilot (not expired)
    IF v_school_plan = 'pilot' AND v_trial_end IS NOT NULL AND v_trial_end > NOW() THEN
      RETURN 'pro';
    END IF;
  END IF;

  RETURN 'free';
END;
$$;

GRANT EXECUTE ON FUNCTION get_effective_tier(UUID) TO authenticated;

COMMENT ON FUNCTION get_effective_tier IS
  'Returns effective tier (free/pro) for a user. Checks admin override, then school plan (paid or active pilot).';


-- ────────────────────────────────────────────
-- 8. Helper: get_plan_seat_limits
--    Pure lookup — plan name → seat limits.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_plan_seat_limits(p_plan TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE p_plan
    WHEN 'pilot' THEN jsonb_build_object(
      'cambridge', 60, 'ielts', 20, 'game', 60
    )
    WHEN 'core' THEN jsonb_build_object(
      'cambridge', 120, 'ielts', 40, 'game', 120
    )
    WHEN 'standard' THEN jsonb_build_object(
      'cambridge', 220, 'ielts', 80, 'game', 220
    )
    WHEN 'pro' THEN jsonb_build_object(
      'cambridge', 450, 'ielts', 150, 'game', 450
    )
    WHEN 'enterprise' THEN jsonb_build_object(
      'cambridge', NULL, 'ielts', NULL, 'game', NULL
    )
    ELSE jsonb_build_object(
      'cambridge', 0, 'ielts', 0, 'game', 0
    )
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION get_plan_seat_limits(TEXT) TO authenticated;

COMMENT ON FUNCTION get_plan_seat_limits IS
  'Returns seat limits {cambridge, ielts, game} for a plan name. NULL values mean unlimited (enterprise).';


-- ────────────────────────────────────────────
-- 9. RPC: get_school_plan_details
--    Full plan info for a school, including
--    seat limits and current member count.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_school_plan_details(
  p_school_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_school_id  UUID;
  v_plan       TEXT;
  v_trial_end  TIMESTAMPTZ;
  v_is_active  BOOLEAN;
  v_limits     JSONB;
  v_member_ct  INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Resolve school
  v_school_id := COALESCE(
    p_school_id,
    (SELECT u.school_id FROM users u WHERE u.id = v_user_id)
  );

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'plan', 'none', 'is_active', false);
  END IF;

  -- Must be member or superadmin
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = v_user_id AND u.school_id = v_school_id
  ) AND NOT is_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a member of this school');
  END IF;

  -- Get plan info
  SELECT s.school_plan, s.trial_ends_at
  INTO v_plan, v_trial_end
  FROM schools s WHERE s.id = v_school_id;

  -- Determine active status
  v_is_active := CASE
    WHEN v_plan IN ('core', 'standard', 'pro', 'enterprise') THEN TRUE
    WHEN v_plan = 'pilot' AND v_trial_end IS NOT NULL AND v_trial_end > NOW() THEN TRUE
    ELSE FALSE
  END;

  -- Seat limits
  v_limits := get_plan_seat_limits(v_plan);

  -- Current member count
  SELECT COUNT(*) INTO v_member_ct
  FROM users u WHERE u.school_id = v_school_id;

  RETURN jsonb_build_object(
    'success',        true,
    'school_id',      v_school_id,
    'plan',           v_plan,
    'is_active',      v_is_active,
    'trial_ends_at',  v_trial_end,
    'seats',          v_limits,
    'current_members', v_member_ct,
    'trial_expired',  (v_plan = 'pilot' AND (v_trial_end IS NULL OR v_trial_end <= NOW()))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_plan_details(UUID) TO authenticated;

COMMENT ON FUNCTION get_school_plan_details IS
  'Returns plan name, seat limits, member count, and active status for a school.';


-- ────────────────────────────────────────────
-- 10. RPC: check_lockdown_limits
--     Free-tier caps for the Lockdown config UI.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_lockdown_limits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_tier    TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_tier := get_effective_tier(v_user_id);

  IF v_tier = 'pro' THEN
    RETURN jsonb_build_object(
      'success', true,
      'tier', 'pro',
      'max_duration_minutes', NULL,
      'max_students', NULL,
      'allowed_maps', NULL,
      'custom_questions', true,
      'save_results', true,
      'watermark', false
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tier', 'free',
    'max_duration_minutes', 15,
    'max_students', 20,
    'allowed_maps', jsonb_build_array('default', 'city'),
    'custom_questions', false,
    'save_results', false,
    'watermark', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_lockdown_limits() TO authenticated;

COMMENT ON FUNCTION check_lockdown_limits IS
  'Returns lockdown config limits based on caller tier. Free = capped. Pro = unlimited.';


-- ────────────────────────────────────────────
-- 11. RPC: start_school_pilot
--     School admin self-serve: start 30-day trial.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION start_school_pilot()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_school_id   UUID;
  v_current     TEXT;
  v_trial_end   TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT u.school_id INTO v_school_id
  FROM users u WHERE u.id = v_user_id;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must belong to a school');
  END IF;

  IF NOT is_school_admin(v_school_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'School admin required');
  END IF;

  SELECT s.school_plan INTO v_current
  FROM schools s WHERE s.id = v_school_id;

  -- Can only start pilot from 'none'
  IF v_current IS DISTINCT FROM 'none' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'School already has a plan: ' || COALESCE(v_current, 'none'));
  END IF;

  v_trial_end := NOW() + INTERVAL '30 days';

  UPDATE schools
  SET school_plan = 'pilot', trial_ends_at = v_trial_end
  WHERE id = v_school_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan', 'pilot',
    'trial_ends_at', v_trial_end,
    'seats', get_plan_seat_limits('pilot'),
    'message', '30-day pilot activated! All features are now unlocked.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION start_school_pilot() TO authenticated;

COMMENT ON FUNCTION start_school_pilot IS
  'School admin starts a 30-day free pilot. Sets school_plan=pilot, trial_ends_at=NOW()+30 days.';


-- ────────────────────────────────────────────
-- 12. RPC: admin_set_school_plan
--     Superadmin manually sets a school's plan.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_set_school_plan(
  p_school_id UUID,
  p_plan      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Superadmin required');
  END IF;

  IF p_plan NOT IN ('none', 'pilot', 'core', 'standard', 'pro', 'enterprise') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid plan: ' || p_plan);
  END IF;

  UPDATE schools
  SET school_plan = p_plan,
      trial_ends_at = CASE
        WHEN p_plan = 'pilot' THEN NOW() + INTERVAL '30 days'
        ELSE NULL
      END
  WHERE id = p_school_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'School not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'plan', p_plan,
    'message', 'School plan set to ' || p_plan
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_school_plan(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION admin_set_school_plan IS
  'Superadmin-only: set any school plan (none/pilot/core/standard/pro/enterprise).';


-- ────────────────────────────────────────────
-- 13. RPC: admin_set_user_tier
--     Superadmin grants pro to an individual user.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_set_user_tier(
  p_user_id UUID,
  p_tier    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Superadmin required');
  END IF;

  IF p_tier NOT IN ('free', 'pro') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid tier: ' || p_tier);
  END IF;

  UPDATE users SET account_tier = p_tier WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'tier', p_tier,
    'message', 'User tier set to ' || p_tier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_user_tier(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION admin_set_user_tier IS
  'Superadmin-only: grant or revoke pro tier for an individual user (demo/comp accounts).';


-- ────────────────────────────────────────────
-- 14. Guard: require_pro_tier
--     Returns NULL if pro, error JSONB if free.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION require_pro_tier()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  v_tier := get_effective_tier(auth.uid());
  IF v_tier = 'pro' THEN
    RETURN NULL;  -- proceed
  END IF;
  RETURN jsonb_build_object(
    'success', false,
    'error', 'pro_required',
    'message', 'Your school needs a Brains Heist subscription to access this feature'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION require_pro_tier() TO authenticated;

COMMENT ON FUNCTION require_pro_tier IS
  'Guard: returns NULL if pro, error JSONB if free. Use at top of pro-only RPCs.';


-- ============================================================================
-- (b) VERIFICATION SQL
-- ============================================================================

-- ── CHECK 1: schools.school_plan column ──
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'schools'
  AND column_name IN ('school_plan', 'trial_ends_at')
ORDER BY column_name;
-- Expected: 2 rows

-- ── CHECK 2: users.account_tier column ──
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'account_tier';
-- Expected: 1 row, text, 'free'::text

-- ── CHECK 3: stripe_customers table ──
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'stripe_customers'
ORDER BY ordinal_position;
-- Expected: 12 rows

-- ── CHECK 4: RLS on stripe_customers ──
SELECT relname, relrowsecurity
FROM pg_class WHERE relname = 'stripe_customers';
-- Expected: relrowsecurity = true

-- ── CHECK 5: All functions exist ──
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_effective_tier',
    'get_plan_seat_limits',
    'get_school_plan_details',
    'check_lockdown_limits',
    'start_school_pilot',
    'admin_set_school_plan',
    'admin_set_user_tier',
    'require_pro_tier'
  )
ORDER BY routine_name;
-- Expected: 8 rows

-- ── CHECK 6: All schools default to 'none' ──
SELECT school_plan, COUNT(*) AS cnt
FROM schools GROUP BY school_plan;
-- Expected: 1 row → none, <count>

-- ── CHECK 7: get_effective_tier returns 'free' ──
SELECT get_effective_tier();
-- Expected: 'free'

-- ── CHECK 8: get_plan_seat_limits works ──
SELECT get_plan_seat_limits('standard');
-- Expected: {"cambridge": 220, "ielts": 80, "game": 220}

-- ── CHECK 9: Constraints ──
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND constraint_name IN ('chk_schools_school_plan', 'chk_users_account_tier')
ORDER BY constraint_name;
-- Expected: 2 rows


-- ============================================================================
-- (c) ROLLBACK SQL
-- ============================================================================

/*
-- Step 1: Drop new functions (reverse order)
DROP FUNCTION IF EXISTS require_pro_tier();
DROP FUNCTION IF EXISTS admin_set_user_tier(UUID, TEXT);
DROP FUNCTION IF EXISTS admin_set_school_plan(UUID, TEXT);
DROP FUNCTION IF EXISTS start_school_pilot();
DROP FUNCTION IF EXISTS check_lockdown_limits();
DROP FUNCTION IF EXISTS get_school_plan_details(UUID);
DROP FUNCTION IF EXISTS get_plan_seat_limits(TEXT);
DROP FUNCTION IF EXISTS get_effective_tier(UUID);

-- Step 2: Drop stripe_customers
DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON stripe_customers;
DROP FUNCTION IF EXISTS trg_fn_stripe_customers_updated_at();
DROP TABLE IF EXISTS stripe_customers CASCADE;

-- Step 3: Remove columns
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_account_tier;
ALTER TABLE users DROP COLUMN IF EXISTS account_tier;
ALTER TABLE schools DROP CONSTRAINT IF EXISTS chk_schools_school_plan;
ALTER TABLE schools DROP COLUMN IF EXISTS school_plan;
ALTER TABLE schools DROP COLUMN IF EXISTS trial_ends_at;

-- Step 4: Drop old column if migration cleanup ran
-- (no-op if school_tier was already dropped by the migration)
ALTER TABLE schools DROP CONSTRAINT IF EXISTS chk_schools_school_tier;
ALTER TABLE schools DROP COLUMN IF EXISTS school_tier;
*/


-- ============================================================================
-- (d) CHANGED OBJECTS CHECKLIST
-- ============================================================================
--
-- CREATED (new):
--   [COLUMN]   schools.school_plan           TEXT DEFAULT 'none' CHECK 6 values
--   [COLUMN]   schools.trial_ends_at         TIMESTAMPTZ
--   [COLUMN]   users.account_tier            TEXT DEFAULT 'free' CHECK (free|pro)
--   [TABLE]    stripe_customers              (school_id NOT NULL, plan field)
--   [INDEX]    idx_stripe_customers_school
--   [INDEX]    idx_stripe_customers_stripe_sub
--   [INDEX]    idx_stripe_customers_stripe_cust
--   [FUNC]     trg_fn_stripe_customers_updated_at()
--   [TRIGGER]  trg_stripe_customers_updated_at
--   [POLICY]   "School members can view own subscription"   (SELECT)
--   [POLICY]   "Service role manages stripe customers"      (ALL)
--   [FUNC]     get_effective_tier(UUID)           → TEXT
--   [FUNC]     get_plan_seat_limits(TEXT)         → JSONB (IMMUTABLE)
--   [FUNC]     get_school_plan_details(UUID)      → JSONB
--   [FUNC]     check_lockdown_limits()            → JSONB
--   [FUNC]     start_school_pilot()               → JSONB
--   [FUNC]     admin_set_school_plan(UUID, TEXT)   → JSONB
--   [FUNC]     admin_set_user_tier(UUID, TEXT)     → JSONB
--   [FUNC]     require_pro_tier()                  → JSONB
--
-- DROPPED (cleanup from previous migration draft):
--   [COLUMN]   schools.school_tier  (replaced by schools.school_plan)
--
-- UNCHANGED:
--   All existing RPCs, tables, and policies are untouched.
--
-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
