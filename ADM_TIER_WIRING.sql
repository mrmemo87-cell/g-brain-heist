-- ============================================================
-- ADMISSION HUB — Tier & Entitlement Wiring
-- ============================================================
-- Adds 'admission_tests' as a pilot feature with quota limits
-- Integrates with existing school_pilot_usage table
-- ============================================================

-- 1. Update get_pilot_quota_limits() to include admission_tests
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
    'admission_tests',     30
  );
END;
$$;

-- 2. Seed admission_tests row for all existing pilot schools
INSERT INTO school_pilot_usage (school_id, feature_id, used_count)
SELECT s.id, 'admission_tests', 0
FROM schools s
WHERE s.school_plan = 'pilot'
  AND NOT EXISTS (
    SELECT 1 FROM school_pilot_usage spu
    WHERE spu.school_id = s.id AND spu.feature_id = 'admission_tests'
  );

-- 3. Entitlement check RPC
CREATE OR REPLACE FUNCTION rpc_adm_check_entitlement(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school  schools%ROWTYPE;
    v_used    INT;
    v_limit   INT;
BEGIN
    SELECT * INTO v_school FROM schools WHERE id = p_school_id;

    IF v_school.id IS NULL THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'School not found');
    END IF;

    -- Paid plans: unlimited
    IF v_school.school_plan IN ('core', 'standard', 'pro', 'enterprise') THEN
        RETURN jsonb_build_object('allowed', true, 'reason', 'paid_plan', 'remaining', -1);
    END IF;

    -- Pilot plan: check quota via get_pilot_quota_limits()
    IF v_school.school_plan = 'pilot' THEN
        IF v_school.trial_ends_at IS NOT NULL AND v_school.trial_ends_at < NOW() THEN
            RETURN jsonb_build_object('allowed', false, 'reason', 'Pilot trial has expired');
        END IF;

        v_limit := COALESCE((get_pilot_quota_limits()->>'admission_tests')::INT, 30);

        SELECT COALESCE(used_count, 0) INTO v_used
        FROM school_pilot_usage
        WHERE school_id = p_school_id AND feature_id = 'admission_tests';

        IF NOT FOUND THEN
            -- Seed the row
            INSERT INTO school_pilot_usage (school_id, feature_id, used_count)
            VALUES (p_school_id, 'admission_tests', 0);
            RETURN jsonb_build_object('allowed', true, 'reason', 'pilot', 'remaining', v_limit);
        END IF;

        IF v_used >= v_limit THEN
            RETURN jsonb_build_object('allowed', false, 'reason', 'Pilot quota exhausted',
                                      'used', v_used, 'limit', v_limit);
        END IF;

        RETURN jsonb_build_object('allowed', true, 'reason', 'pilot',
                                  'remaining', v_limit - v_used);
    END IF;

    -- Free / no plan: denied
    RETURN jsonb_build_object('allowed', false, 'reason', 'Admission tests require an active school plan');
END;
$$;

-- 4. Consume admission quota (call after successful attempt start)
CREATE OR REPLACE FUNCTION rpc_adm_consume_quota(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE school_pilot_usage
    SET used_count = used_count + 1, updated_at = NOW()
    WHERE school_id = p_school_id AND feature_id = 'admission_tests';
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_adm_check_entitlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_adm_consume_quota(UUID) TO authenticated;
