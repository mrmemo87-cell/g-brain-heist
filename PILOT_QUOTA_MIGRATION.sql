-- ============================================================================
-- PILOT QUOTA MIGRATION — Consumption limits for the 30-day pilot plan
-- ============================================================================
--
-- Philosophy:
--   Pilot unlocks EVERY feature — but each feature carries a tight
--   school-wide quota.  Once a quota depletes, that feature locks
--   and shows an "Upgrade" CTA.  The limits are deliberately tight
--   so a 30–60 student school burns through them in ~1–2 weeks,
--   creating urgency to upgrade to a paid plan.
--
-- Quotas are SCHOOL-LEVEL (shared by ALL students + teachers):
--
--   Feature               Pilot Limit   Why it's tight
--   ───────────────────── ──────────── ──────────────────────
--   pvp_battles            50           ~1 per student in a class of 50
--   shop_purchases         40           limited shopping spree
--   raid_attempts          15           a taste of raids
--   cambridge_tests        40           partial exam coverage
--   ielts_tests            20           limited IELTS practice
--   tournament_entries     5            one mini tournament
--   questions_created      60           enough for a few quizzes
--   assignments_created    15           limited assignment creation
--   lockdown_sessions      20           a few classroom sessions
--   reports_generated      10           limited analytics
--
-- Objects created:
--   TABLE  school_pilot_usage                (school_id, feature_id, used_count)
--   FUNC   get_pilot_quota_limits()          → JSONB
--   FUNC   get_school_pilot_quotas()         → JSONB  (read current usage + limits)
--   FUNC   check_pilot_quota(TEXT)           → JSONB  (can I use this feature?)
--   FUNC   consume_pilot_quota(TEXT, INT)    → JSONB  (use 1+ unit of a feature)
--   FUNC   init_school_pilot_usage(UUID)     → void   (called by start_school_pilot)
--
-- Dependencies: schools, users, school_pilot_usage, get_effective_tier
-- ============================================================================


-- ────────────────────────────────────────────
-- 1. Table: school_pilot_usage
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_pilot_usage (
  school_id   UUID   NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  feature_id  TEXT   NOT NULL,
  used_count  INT    NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (school_id, feature_id)
);

COMMENT ON TABLE school_pilot_usage IS
  'Tracks per-feature consumption for schools on the pilot plan. Shared across all school members.';

-- RLS: members can read their school's usage; only server/RPCs write
ALTER TABLE school_pilot_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own school pilot usage" ON school_pilot_usage;
CREATE POLICY "Members can view own school pilot usage"
  ON school_pilot_usage FOR SELECT
  USING (
    school_id IN (SELECT u.school_id FROM users u WHERE u.id = auth.uid())
    OR is_superadmin()
  );

DROP POLICY IF EXISTS "Service role manages pilot usage" ON school_pilot_usage;
CREATE POLICY "Service role manages pilot usage"
  ON school_pilot_usage FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());


-- ────────────────────────────────────────────
-- 2. Pure function: get_pilot_quota_limits
--    Returns the hard caps for each feature.
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
    'reports_generated',   10
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_pilot_quota_limits() TO authenticated;

COMMENT ON FUNCTION get_pilot_quota_limits IS
  'Returns hard-coded pilot quota limits per feature. Immutable lookup.';


-- ────────────────────────────────────────────
-- 3. Helper: init_school_pilot_usage
--    Seeds rows for all quota features when
--    a school starts the pilot.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION init_school_pilot_usage(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limits JSONB;
  v_key    TEXT;
BEGIN
  v_limits := get_pilot_quota_limits();

  FOR v_key IN SELECT jsonb_object_keys(v_limits)
  LOOP
    INSERT INTO school_pilot_usage (school_id, feature_id, used_count)
    VALUES (p_school_id, v_key, 0)
    ON CONFLICT (school_id, feature_id) DO NOTHING;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION init_school_pilot_usage IS
  'Seeds school_pilot_usage rows for a new pilot school. Called by start_school_pilot.';


-- ────────────────────────────────────────────
-- 4. Patch start_school_pilot to seed quotas
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

  IF v_current IS DISTINCT FROM 'none' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'School already has a plan: ' || COALESCE(v_current, 'none'));
  END IF;

  v_trial_end := NOW() + INTERVAL '30 days';

  UPDATE schools
  SET school_plan = 'pilot', trial_ends_at = v_trial_end
  WHERE id = v_school_id;

  -- Seed quota tracking rows
  PERFORM init_school_pilot_usage(v_school_id);

  RETURN jsonb_build_object(
    'success', true,
    'plan', 'pilot',
    'trial_ends_at', v_trial_end,
    'seats', get_plan_seat_limits('pilot'),
    'quotas', get_pilot_quota_limits(),
    'message', '30-day pilot activated! All features unlocked with usage limits.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION start_school_pilot() TO authenticated;


-- ────────────────────────────────────────────
-- 5. RPC: get_school_pilot_quotas
--    Returns all features with used / limit / remaining.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_school_pilot_quotas()
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
  v_limits     JSONB;
  v_result     JSONB := '{}'::jsonb;
  v_key        TEXT;
  v_limit      INT;
  v_used       INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT u.school_id INTO v_school_id
  FROM users u WHERE u.id = v_user_id;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'is_pilot', false);
  END IF;

  SELECT s.school_plan, s.trial_ends_at
  INTO v_plan, v_trial_end
  FROM schools s WHERE s.id = v_school_id;

  -- Only return quotas for pilot schools
  IF v_plan IS DISTINCT FROM 'pilot' THEN
    RETURN jsonb_build_object('success', true, 'is_pilot', false);
  END IF;

  -- Check if trial has expired
  IF v_trial_end IS NULL OR v_trial_end <= NOW() THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_pilot', true,
      'expired', true,
      'trial_ends_at', v_trial_end
    );
  END IF;

  v_limits := get_pilot_quota_limits();

  FOR v_key IN SELECT jsonb_object_keys(v_limits)
  LOOP
    v_limit := (v_limits ->> v_key)::int;

    SELECT COALESCE(spu.used_count, 0) INTO v_used
    FROM school_pilot_usage spu
    WHERE spu.school_id = v_school_id AND spu.feature_id = v_key;

    -- If no row yet, used = 0
    IF v_used IS NULL THEN v_used := 0; END IF;

    v_result := v_result || jsonb_build_object(
      v_key, jsonb_build_object(
        'used', v_used,
        'limit', v_limit,
        'remaining', GREATEST(v_limit - v_used, 0),
        'exhausted', (v_used >= v_limit)
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'is_pilot', true,
    'expired', false,
    'trial_ends_at', v_trial_end,
    'quotas', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_school_pilot_quotas() TO authenticated;

COMMENT ON FUNCTION get_school_pilot_quotas IS
  'Returns per-feature usage, limits, and remaining for the current user''s school pilot.';


-- ────────────────────────────────────────────
-- 6. RPC: check_pilot_quota (read-only)
--    Quick check: can the caller use this feature?
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_pilot_quota(p_feature_id TEXT)
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
  v_limit      INT;
  v_used       INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Not authenticated');
  END IF;

  -- Superadmins always bypass quotas
  IF is_superadmin(v_user_id) THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'superadmin');
  END IF;

  SELECT u.school_id INTO v_school_id
  FROM users u WHERE u.id = v_user_id;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'No school');
  END IF;

  SELECT s.school_plan, s.trial_ends_at
  INTO v_plan, v_trial_end
  FROM schools s WHERE s.id = v_school_id;

  -- Non-pilot schools: no quota restriction
  IF v_plan IS DISTINCT FROM 'pilot' THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'paid_plan');
  END IF;

  -- Expired pilot
  IF v_trial_end IS NULL OR v_trial_end <= NOW() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'pilot_expired');
  END IF;

  -- Get limit for this feature
  v_limit := (get_pilot_quota_limits() ->> p_feature_id)::int;
  IF v_limit IS NULL THEN
    -- Unknown feature: allow (not quota-gated)
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_quota');
  END IF;

  -- Get current usage
  SELECT COALESCE(spu.used_count, 0) INTO v_used
  FROM school_pilot_usage spu
  WHERE spu.school_id = v_school_id AND spu.feature_id = p_feature_id;

  IF v_used IS NULL THEN v_used := 0; END IF;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'quota_exhausted',
      'used', v_used,
      'limit', v_limit,
      'remaining', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'quota_ok',
    'used', v_used,
    'limit', v_limit,
    'remaining', v_limit - v_used
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_pilot_quota(TEXT) TO authenticated;

COMMENT ON FUNCTION check_pilot_quota IS
  'Read-only check: is the caller''s school allowed to use this pilot feature? Returns allowed + remaining.';


-- ────────────────────────────────────────────
-- 7. RPC: consume_pilot_quota
--    Atomically increments usage. Returns the
--    new state. Fails if over quota.
-- ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION consume_pilot_quota(
  p_feature_id TEXT,
  p_amount     INT DEFAULT 1
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
  v_limit      INT;
  v_used       INT;
  v_new_used   INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_amount < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be >= 1');
  END IF;

  -- Superadmins bypass quotas entirely
  IF is_superadmin(v_user_id) THEN
    RETURN jsonb_build_object('success', true, 'consumed', false, 'reason', 'superadmin');
  END IF;

  SELECT u.school_id INTO v_school_id
  FROM users u WHERE u.id = v_user_id;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No school');
  END IF;

  SELECT s.school_plan, s.trial_ends_at
  INTO v_plan, v_trial_end
  FROM schools s WHERE s.id = v_school_id;

  -- Non-pilot schools: no quota to consume, just succeed
  IF v_plan IS DISTINCT FROM 'pilot' THEN
    RETURN jsonb_build_object('success', true, 'consumed', false, 'reason', 'paid_plan');
  END IF;

  -- Expired pilot
  IF v_trial_end IS NULL OR v_trial_end <= NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'pilot_expired');
  END IF;

  -- Get limit
  v_limit := (get_pilot_quota_limits() ->> p_feature_id)::int;
  IF v_limit IS NULL THEN
    -- Unknown feature: no quota to consume
    RETURN jsonb_build_object('success', true, 'consumed', false, 'reason', 'no_quota');
  END IF;

  -- Atomically increment (upsert)
  INSERT INTO school_pilot_usage (school_id, feature_id, used_count, updated_at)
  VALUES (v_school_id, p_feature_id, p_amount, NOW())
  ON CONFLICT (school_id, feature_id)
  DO UPDATE SET
    used_count = school_pilot_usage.used_count + p_amount,
    updated_at = NOW()
  RETURNING used_count INTO v_new_used;

  -- Check if we went over
  IF v_new_used > v_limit THEN
    -- Roll back the increment
    UPDATE school_pilot_usage
    SET used_count = used_count - p_amount, updated_at = NOW()
    WHERE school_id = v_school_id AND feature_id = p_feature_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'quota_exhausted',
      'used', v_new_used - p_amount,
      'limit', v_limit,
      'remaining', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'consumed', true,
    'used', v_new_used,
    'limit', v_limit,
    'remaining', GREATEST(v_limit - v_new_used, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION consume_pilot_quota(TEXT, INT) TO authenticated;

COMMENT ON FUNCTION consume_pilot_quota IS
  'Atomically consumes 1+ unit of a pilot quota feature. Rolls back if over limit.';


-- ────────────────────────────────────────────
-- 8. Seed quotas for EXISTING pilot schools
--    (in case pilot was already activated before
--     this migration)
-- ────────────────────────────────────────────

DO $$
DECLARE
  v_school RECORD;
BEGIN
  FOR v_school IN
    SELECT id FROM schools WHERE school_plan = 'pilot'
  LOOP
    PERFORM init_school_pilot_usage(v_school.id);
  END LOOP;
END;
$$;


-- ────────────────────────────────────────────
-- 9. SUPER ADMIN FUNCTIONS
--    Full control over the quota system.
-- ────────────────────────────────────────────

-- 9a. admin_get_all_pilot_quotas
--     Returns quotas for ALL pilot schools at once.
--     Only superadmins can call this.

CREATE OR REPLACE FUNCTION admin_get_all_pilot_quotas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_result    JSONB := '[]'::jsonb;
  v_school    RECORD;
  v_quotas    JSONB;
  v_limits    JSONB;
  v_key       TEXT;
  v_limit     INT;
  v_used      INT;
BEGIN
  IF NOT is_superadmin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Superadmin required');
  END IF;

  v_limits := get_pilot_quota_limits();

  FOR v_school IN
    SELECT s.id, s.name, s.school_plan, s.trial_ends_at,
           (SELECT COUNT(*) FROM school_members sm WHERE sm.school_id = s.id) AS member_count
    FROM schools s
    WHERE s.school_plan = 'pilot'
    ORDER BY s.trial_ends_at DESC NULLS LAST
  LOOP
    v_quotas := '{}'::jsonb;
    FOR v_key IN SELECT jsonb_object_keys(v_limits)
    LOOP
      v_limit := (v_limits ->> v_key)::int;
      SELECT COALESCE(spu.used_count, 0) INTO v_used
      FROM school_pilot_usage spu
      WHERE spu.school_id = v_school.id AND spu.feature_id = v_key;
      IF v_used IS NULL THEN v_used := 0; END IF;

      v_quotas := v_quotas || jsonb_build_object(
        v_key, jsonb_build_object(
          'used', v_used,
          'limit', v_limit,
          'remaining', GREATEST(v_limit - v_used, 0),
          'exhausted', (v_used >= v_limit)
        )
      );
    END LOOP;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'school_id', v_school.id,
      'school_name', v_school.name,
      'plan', v_school.school_plan,
      'trial_ends_at', v_school.trial_ends_at,
      'expired', (v_school.trial_ends_at IS NULL OR v_school.trial_ends_at <= NOW()),
      'member_count', v_school.member_count,
      'quotas', v_quotas
    ));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'schools', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_all_pilot_quotas() TO authenticated;

COMMENT ON FUNCTION admin_get_all_pilot_quotas IS
  'Superadmin: returns pilot quota status for every school on the pilot plan.';


-- 9b. admin_get_school_pilot_quotas(school_id)
--     Returns quotas for a specific school (any plan).
--     Superadmin can inspect any school.

CREATE OR REPLACE FUNCTION admin_get_school_pilot_quotas(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_plan      TEXT;
  v_trial_end TIMESTAMPTZ;
  v_limits    JSONB;
  v_result    JSONB := '{}'::jsonb;
  v_key       TEXT;
  v_limit     INT;
  v_used      INT;
BEGIN
  IF NOT is_superadmin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Superadmin required');
  END IF;

  SELECT s.school_plan, s.trial_ends_at INTO v_plan, v_trial_end
  FROM schools s WHERE s.id = p_school_id;

  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'School not found');
  END IF;

  v_limits := get_pilot_quota_limits();

  FOR v_key IN SELECT jsonb_object_keys(v_limits)
  LOOP
    v_limit := (v_limits ->> v_key)::int;
    SELECT COALESCE(spu.used_count, 0) INTO v_used
    FROM school_pilot_usage spu
    WHERE spu.school_id = p_school_id AND spu.feature_id = v_key;
    IF v_used IS NULL THEN v_used := 0; END IF;

    v_result := v_result || jsonb_build_object(
      v_key, jsonb_build_object(
        'used', v_used,
        'limit', v_limit,
        'remaining', GREATEST(v_limit - v_used, 0),
        'exhausted', (v_used >= v_limit)
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'plan', v_plan,
    'trial_ends_at', v_trial_end,
    'expired', (v_plan = 'pilot' AND (v_trial_end IS NULL OR v_trial_end <= NOW())),
    'quotas', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_school_pilot_quotas(UUID) TO authenticated;

COMMENT ON FUNCTION admin_get_school_pilot_quotas IS
  'Superadmin: returns pilot quota status for a specific school.';


-- 9c. admin_set_school_quota(school_id, feature_id, new_used_count)
--     Directly set used_count for a specific feature.
--     Useful for correcting data or granting extra usage.

CREATE OR REPLACE FUNCTION admin_set_school_quota(
  p_school_id   UUID,
  p_feature_id  TEXT,
  p_used_count  INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit   INT;
BEGIN
  IF NOT is_superadmin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Superadmin required');
  END IF;

  IF p_used_count < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'used_count cannot be negative');
  END IF;

  v_limit := (get_pilot_quota_limits() ->> p_feature_id)::int;
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown feature: ' || p_feature_id);
  END IF;

  INSERT INTO school_pilot_usage (school_id, feature_id, used_count, updated_at)
  VALUES (p_school_id, p_feature_id, p_used_count, NOW())
  ON CONFLICT (school_id, feature_id)
  DO UPDATE SET used_count = p_used_count, updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'feature_id', p_feature_id,
    'used', p_used_count,
    'limit', v_limit,
    'remaining', GREATEST(v_limit - p_used_count, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_school_quota(UUID, TEXT, INT) TO authenticated;

COMMENT ON FUNCTION admin_set_school_quota IS
  'Superadmin: directly sets the used_count for a school''s pilot quota feature.';


-- 9d. admin_reset_school_quotas(school_id)
--     Resets ALL quotas for a school back to 0.

CREATE OR REPLACE FUNCTION admin_reset_school_quotas(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count   INT;
BEGIN
  IF NOT is_superadmin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Superadmin required');
  END IF;

  UPDATE school_pilot_usage
  SET used_count = 0, updated_at = NOW()
  WHERE school_id = p_school_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- If no rows existed, seed them
  IF v_count = 0 THEN
    PERFORM init_school_pilot_usage(p_school_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'features_reset', v_count,
    'message', 'All quotas reset to 0'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_school_quotas(UUID) TO authenticated;

COMMENT ON FUNCTION admin_reset_school_quotas IS
  'Superadmin: resets all pilot quotas for a school back to zero.';


-- 9e. admin_extend_pilot_trial(school_id, extra_days)
--     Extends the trial_ends_at by N days.

CREATE OR REPLACE FUNCTION admin_extend_pilot_trial(
  p_school_id  UUID,
  p_extra_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_plan       TEXT;
  v_old_end    TIMESTAMPTZ;
  v_new_end    TIMESTAMPTZ;
BEGIN
  IF NOT is_superadmin(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Superadmin required');
  END IF;

  SELECT s.school_plan, s.trial_ends_at INTO v_plan, v_old_end
  FROM schools s WHERE s.id = p_school_id;

  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'School not found');
  END IF;

  IF v_plan IS DISTINCT FROM 'pilot' THEN
    RETURN jsonb_build_object('success', false, 'error', 'School is not on pilot plan (current: ' || COALESCE(v_plan, 'none') || ')');
  END IF;

  -- Extend from the later of NOW() or current end
  v_new_end := GREATEST(COALESCE(v_old_end, NOW()), NOW()) + (p_extra_days || ' days')::interval;

  UPDATE schools SET trial_ends_at = v_new_end WHERE id = p_school_id;

  RETURN jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'old_trial_ends_at', v_old_end,
    'new_trial_ends_at', v_new_end,
    'days_added', p_extra_days
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_extend_pilot_trial(UUID, INT) TO authenticated;

COMMENT ON FUNCTION admin_extend_pilot_trial IS
  'Superadmin: extends a pilot school''s trial by N days (default 30).';


-- 9f. Update RLS: let authenticated superadmins manage all rows
--     (The existing "Service role" policy only covers service_role,
--      but superadmins need direct access too.)

DROP POLICY IF EXISTS "Superadmins manage all pilot usage" ON school_pilot_usage;
CREATE POLICY "Superadmins manage all pilot usage"
  ON school_pilot_usage FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());


-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check table exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'school_pilot_usage'
ORDER BY ordinal_position;
-- Expected: 4 columns (school_id, feature_id, used_count, updated_at)

-- Check all functions exist (including admin functions)
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_pilot_quota_limits',
    'init_school_pilot_usage',
    'get_school_pilot_quotas',
    'check_pilot_quota',
    'consume_pilot_quota',
    'admin_get_all_pilot_quotas',
    'admin_get_school_pilot_quotas',
    'admin_set_school_quota',
    'admin_reset_school_quotas',
    'admin_extend_pilot_trial'
  )
ORDER BY routine_name;
-- Expected: 10 rows

-- Check quota limits
SELECT get_pilot_quota_limits();
-- Expected: { pvp_battles: 50, shop_purchases: 40, ... }

-- Check RLS policies
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'school_pilot_usage'
ORDER BY policyname;
-- Expected: 3 policies (Members view, Service role, Superadmins)


-- ============================================================================
-- ROLLBACK (uncomment to undo)
-- ============================================================================

/*
DROP FUNCTION IF EXISTS admin_extend_pilot_trial(UUID, INT);
DROP FUNCTION IF EXISTS admin_reset_school_quotas(UUID);
DROP FUNCTION IF EXISTS admin_set_school_quota(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS admin_get_school_pilot_quotas(UUID);
DROP FUNCTION IF EXISTS admin_get_all_pilot_quotas();
DROP FUNCTION IF EXISTS consume_pilot_quota(TEXT, INT);
DROP FUNCTION IF EXISTS check_pilot_quota(TEXT);
DROP FUNCTION IF EXISTS get_school_pilot_quotas();
DROP FUNCTION IF EXISTS init_school_pilot_usage(UUID);
DROP FUNCTION IF EXISTS get_pilot_quota_limits();
DROP TABLE IF EXISTS school_pilot_usage CASCADE;

-- Restore original start_school_pilot (from MONETIZATION_MIGRATION.sql)
-- Re-run the original CREATE OR REPLACE FUNCTION start_school_pilot() ...
*/


-- ============================================================================
-- END OF PILOT QUOTA MIGRATION
-- ============================================================================
