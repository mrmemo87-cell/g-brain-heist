-- ============================================================================
-- BLOCK PILOT RESTART — Prevent schools from re-starting the free pilot trial
-- ============================================================================
--
-- Problem:
--   When a pilot expires, get_effective_tier lazily downgrades the school to
--   school_plan = 'none' (keeping trial_ends_at for audit). But start_school_pilot
--   only checks `school_plan != 'none'`, so an expired-and-downgraded school
--   could start a brand-new 30-day pilot.
--
-- Fix:
--   Also check trial_ends_at IS NOT NULL — if it's set, a pilot was used before.
--
-- Run AFTER: MONETIZATION_MIGRATION.sql, PILOT_QUOTA_MIGRATION.sql, PILOT_QUOTA_FIX.sql
-- ============================================================================

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

  SELECT s.school_plan, s.trial_ends_at
  INTO v_current, v_trial_end
  FROM schools s WHERE s.id = v_school_id;

  -- Block if school already has an active plan
  IF v_current IS DISTINCT FROM 'none' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'School already has a plan: ' || COALESCE(v_current, 'none'));
  END IF;

  -- Block if pilot was already used (trial_ends_at was set during a previous pilot)
  IF v_trial_end IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Your school has already used its free pilot trial. Please subscribe to a paid plan to continue.');
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
