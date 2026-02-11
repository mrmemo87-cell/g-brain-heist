-- ============================================================================
-- PILOT ADMIN MIGRATION — Super admin control over pilot quotas
-- Run AFTER PILOT_QUOTA_MIGRATION.sql
-- ============================================================================

-- ────────────────────────────────────────────
-- 1. Add superadmin RLS policy on school_pilot_usage
-- ────────────────────────────────────────────

DROP POLICY IF EXISTS "Superadmins manage all pilot usage" ON school_pilot_usage;
CREATE POLICY "Superadmins manage all pilot usage"
  ON school_pilot_usage FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());


-- ────────────────────────────────────────────
-- 2. Patch check_pilot_quota: superadmin bypass
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


-- ────────────────────────────────────────────
-- 3. Patch consume_pilot_quota: superadmin bypass
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


-- ────────────────────────────────────────────
-- 4. admin_get_all_pilot_quotas
-- ────────────────────────────────────────────

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


-- ────────────────────────────────────────────
-- 5. admin_get_school_pilot_quotas(school_id)
-- ────────────────────────────────────────────

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


-- ────────────────────────────────────────────
-- 6. admin_set_school_quota(school_id, feature, used)
-- ────────────────────────────────────────────

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


-- ────────────────────────────────────────────
-- 7. admin_reset_school_quotas(school_id)
-- ────────────────────────────────────────────

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


-- ────────────────────────────────────────────
-- 8. admin_extend_pilot_trial(school_id, days)
-- ────────────────────────────────────────────

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


-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'admin_get_all_pilot_quotas',
    'admin_get_school_pilot_quotas',
    'admin_set_school_quota',
    'admin_reset_school_quotas',
    'admin_extend_pilot_trial'
  )
ORDER BY routine_name;
-- Expected: 5 rows

SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'school_pilot_usage'
ORDER BY policyname;
-- Expected: 3 policies

-- ============================================================================
-- END OF PILOT ADMIN MIGRATION
-- ============================================================================
