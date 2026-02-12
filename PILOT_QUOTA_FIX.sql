-- ============================================================================
-- PILOT QUOTA FIX — Patches three issues in the pilot plan system
-- ============================================================================
--
--  1. Adds missing `admission_tests` quota (limit 10) to get_pilot_quota_limits()
--  2. Lazy expiry cleanup: get_effective_tier now auto-downgrades expired pilots
--  3. init_school_pilot_usage seeds the admission_tests row
--
-- Run AFTER: MONETIZATION_MIGRATION.sql, PILOT_QUOTA_MIGRATION.sql
-- ============================================================================


-- ────────────────────────────────────────────
-- 1. Patch get_pilot_quota_limits: add admission_tests
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_pilot_quota_limits()
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'pvp_battles',         50,
    'shop_purchases',      40,
    'raid_attempts',       15,
    'cambridge_tests',     40,
    'ielts_tests',         20,
    'tournament_entries',  5,
    'questions_created',   60,
    'assignments_created', 15,
    'lockdown_sessions',   20,
    'reports_generated',   10,
    'admission_tests',     10
  );
END;
$$;


-- ────────────────────────────────────────────
-- 2. Patch get_effective_tier: lazy pilot expiry cleanup
--    When a pilot has expired, auto-set school_plan='none'
--    so the school can re-start a pilot or shows as FREE.
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

    -- EXPIRED pilot → lazy cleanup: downgrade to 'none'
    IF v_school_plan = 'pilot' AND (v_trial_end IS NULL OR v_trial_end <= NOW()) THEN
      UPDATE schools
      SET school_plan = 'none'
      WHERE id = v_school_id
        AND school_plan = 'pilot';
      -- Note: we keep trial_ends_at for audit purposes
    END IF;
  END IF;

  RETURN 'free';
END;
$$;


-- ────────────────────────────────────────────
-- 3. Seed admission_tests row for existing pilot schools
-- ────────────────────────────────────────────

INSERT INTO school_pilot_usage (school_id, feature_id, used_count)
SELECT s.id, 'admission_tests', 0
FROM schools s
WHERE s.school_plan = 'pilot'
  AND NOT EXISTS (
    SELECT 1 FROM school_pilot_usage spu
    WHERE spu.school_id = s.id AND spu.feature_id = 'admission_tests'
  );


-- ────────────────────────────────────────────
-- 4. Patch init_school_pilot_usage to include admission_tests
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION init_school_pilot_usage(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature TEXT;
BEGIN
  FOR v_feature IN
    SELECT jsonb_object_keys(get_pilot_quota_limits())
  LOOP
    INSERT INTO school_pilot_usage (school_id, feature_id, used_count)
    VALUES (p_school_id, v_feature, 0)
    ON CONFLICT (school_id, feature_id) DO NOTHING;
  END LOOP;
END;
$$;


-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check that admission_tests is now in the limits
SELECT get_pilot_quota_limits() ->> 'admission_tests' AS admission_tests_limit;
-- Expected: 10
