-- ==============================================================================
-- G-BRAINS HEIST: DEPLOY COMPETITION PHASE 1 RPC FUNCTIONS
-- ==============================================================================
-- Run this in Supabase SQL Editor to deploy all missing competition functions
-- These functions power the quest/question system and leaderboards
-- ==============================================================================

-- ============================================
-- 1. DROP EXISTING CONFLICTING FUNCTIONS
-- ============================================

DROP FUNCTION IF EXISTS is_current_user_admin() CASCADE;
DROP FUNCTION IF EXISTS rpc_questions_next(int) CASCADE;
DROP FUNCTION IF EXISTS rpc_submit_attempt(bigint, int) CASCADE;
DROP FUNCTION IF EXISTS rpc_leaderboard_grade(int, int) CASCADE;
DROP FUNCTION IF EXISTS rpc_leaderboard_batch(text, int) CASCADE;
DROP FUNCTION IF EXISTS public.rpc_admin_grant(uuid, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS rpc_admin_grant(uuid, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS rpc_admin_reset_user(uuid) CASCADE;
DROP FUNCTION IF EXISTS rpc_admin_ban_user(uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS rpc_admin_set_user_academics(uuid, int, text) CASCADE;
DROP FUNCTION IF EXISTS rpc_admin_reset_all() CASCADE;
DROP FUNCTION IF EXISTS rpc_admin_refill_all_ap() CASCADE;
DROP FUNCTION IF EXISTS rpc_admin_disband_clan(uuid) CASCADE;

-- ============================================
-- 2. CREATE HELPER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
      AND (u.is_admin = TRUE OR u.role = 'admin')
  )
  OR is_superadmin(auth.uid());
$$;

-- ============================================
-- 3. COMPETITION PHASE 1: QUESTIONS
-- ============================================

CREATE OR REPLACE FUNCTION rpc_questions_next(p_grade INT)
RETURNS TABLE (
  id BIGINT,
  stem TEXT,
  opt1 TEXT,
  opt2 TEXT,
  opt3 TEXT,
  opt4 TEXT,
  lang TEXT,
  reward_xp INT,
  reward_coins INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_question mcq_questions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = v_user_id
      AND COALESCE(u.is_banned, FALSE) = FALSE
      AND COALESCE(u.grade::INT, p_grade) = p_grade
  ) THEN
    RAISE EXCEPTION 'grade_mismatch';
  END IF;

  -- Try to get a question not recently answered by this user
  SELECT * INTO v_question
  FROM mcq_questions q
  WHERE q.grade = p_grade
    AND q.active = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM attempts a
      WHERE a.user_id = v_user_id
        AND a.question_id = q.id
        AND a.created_at > NOW() - INTERVAL '24 hours'
    )
  ORDER BY RANDOM()
  LIMIT 1;

  -- If all questions answered recently, just get a random one
  IF NOT FOUND THEN
    SELECT * INTO v_question
    FROM mcq_questions q
    WHERE q.grade = p_grade
      AND q.active = TRUE
    ORDER BY RANDOM()
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_question.id,
         v_question.stem,
         v_question.opt1,
         v_question.opt2,
         v_question.opt3,
         v_question.opt4,
         COALESCE(v_question.lang, 'ru'),
         COALESCE(v_question.reward_xp, 20),
         COALESCE(v_question.reward_coins, 10);
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_questions_next', 'error', SQLERRM, v_user_id, JSON_BUILD_OBJECT('grade', p_grade));
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- Silently fail if logging doesn't work
  END;
  RAISE;
END;
$$;

-- ============================================
-- 4. COMPETITION PHASE 1: SUBMIT ATTEMPT
-- ============================================

CREATE OR REPLACE FUNCTION rpc_submit_attempt(p_question_id BIGINT, p_choice INT)
RETURNS TABLE (
  is_correct BOOLEAN,
  correct_option INT,
  xp_awarded INT,
  coins_awarded INT,
  profile_xp INT,
  profile_coins INT,
  profile_streak INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile users%ROWTYPE;
  v_question mcq_questions%ROWTYPE;
  v_is_correct BOOLEAN;
  v_xp_award INT;
  v_coin_award INT;
  v_new_streak INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_profile
  FROM users u
  WHERE u.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_missing';
  END IF;

  IF COALESCE(v_profile.is_banned, FALSE) THEN
    RAISE EXCEPTION 'user_banned';
  END IF;

  IF v_profile.grade IS NULL THEN
    RAISE EXCEPTION 'grade_not_set';
  END IF;

  IF p_choice < 1 OR p_choice > 4 THEN
    RAISE EXCEPTION 'invalid_choice';
  END IF;

  SELECT * INTO v_question
  FROM mcq_questions q
  WHERE q.id = p_question_id
    AND q.active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found';
  END IF;

  IF v_question.grade <> v_profile.grade THEN
    RAISE EXCEPTION 'grade_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attempts a
    WHERE a.user_id = v_user_id
      AND a.created_at > NOW() - INTERVAL '2 seconds'
  ) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  v_is_correct := (p_choice = v_question.correct);
  v_xp_award := CASE WHEN v_is_correct THEN COALESCE(v_question.reward_xp, 20) ELSE 0 END;
  v_coin_award := CASE WHEN v_is_correct THEN COALESCE(v_question.reward_coins, 10) ELSE 0 END;
  v_new_streak := CASE WHEN v_is_correct THEN v_profile.streak + 1 ELSE 0 END;

  INSERT INTO attempts(user_id, question_id, is_correct)
  VALUES (v_user_id, p_question_id, v_is_correct);

  UPDATE users
  SET xp = xp + v_xp_award,
      coins = coins + v_coin_award,
      streak = v_new_streak,
      updated_at = NOW()
  WHERE id = v_user_id
  RETURNING xp, coins, streak INTO v_profile.xp, v_profile.coins, v_profile.streak;

  RETURN QUERY
  SELECT v_is_correct,
         v_question.correct,
         v_xp_award,
         v_coin_award,
         v_profile.xp,
         v_profile.coins,
         v_profile.streak;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_submit_attempt', 'error', SQLERRM, v_user_id, JSON_BUILD_OBJECT('question_id', p_question_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- Silently fail if logging doesn't work
  END;
  RAISE;
END;
$$;

-- ============================================
-- 5. LEADERBOARDS: GRADE
-- ============================================

CREATE OR REPLACE FUNCTION rpc_leaderboard_grade(p_grade INT, p_limit INT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  xp INT,
  coins INT,
  streak INT,
  batch TEXT,
  grade INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql_result RECORD;
BEGIN
  -- Validate input: Accept grades 6-12
  IF p_grade IS NULL OR p_grade < 6 OR p_grade > 12 THEN
    RAISE EXCEPTION 'invalid_grade';
  END IF;

  RETURN QUERY
  SELECT u.id,
         u.username,
         COALESCE(u.xp, 0)::INT,
         COALESCE(u.coins, 0)::INT,
         COALESCE(u.streak, 0)::INT,
         u.batch,
         COALESCE(u.grade::INT, p_grade::INT)::INT
  FROM users u
  WHERE u.grade::INT = p_grade::INT
    AND COALESCE(u.is_banned, FALSE) = FALSE
    AND COALESCE(u.is_admin, FALSE) = FALSE
  ORDER BY u.xp DESC, u.coins DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

-- ============================================
-- 6. LEADERBOARDS: BATCH/CLASS
-- ============================================

CREATE OR REPLACE FUNCTION rpc_leaderboard_batch(p_batch TEXT, p_limit INT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  xp INT,
  coins INT,
  streak INT,
  batch TEXT,
  grade INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate batch: Accept all batches 6A-12C plus N/A
  IF p_batch IS NULL OR p_batch NOT IN (
    '6A', '6B', '6C',
    '7A', '7B', '7C',
    '8A', '8B', '8C',
    '9A', '9B', '9C',
    '10A', '10B', '10C',
    '11A', '11B', '11C',
    '12A', '12B', '12C',
    'N/A'
  ) THEN
    RAISE EXCEPTION 'invalid_batch';
  END IF;

  RETURN QUERY
  SELECT u.id,
         u.username,
         COALESCE(u.xp, 0)::INT,
         COALESCE(u.coins, 0)::INT,
         COALESCE(u.streak, 0)::INT,
         u.batch,
         COALESCE(
           CASE 
             WHEN u.grade IS NULL THEN 0
             WHEN u.grade = '' THEN 0
             WHEN u.grade = 'NULL' THEN 0
             WHEN u.grade ~ '^\d+$' THEN u.grade::INT
             ELSE 0
           END,
           0
         )
  FROM users u
  WHERE u.batch = p_batch
    AND COALESCE(u.is_banned, FALSE) = FALSE
    AND COALESCE(u.is_admin, FALSE) = FALSE
  ORDER BY u.xp DESC, u.coins DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

-- ============================================
-- 7. ADMIN: GRANT XP/COINS
-- ============================================

CREATE FUNCTION rpc_admin_grant(p_user_id UUID, p_xp_delta INT, p_coins_delta INT)
RETURNS TABLE (
  user_id UUID,
  xp INT,
  coins INT,
  streak INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row users%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE users
  SET xp = xp + COALESCE(p_xp_delta, 0),
      coins = GREATEST(0, coins + COALESCE(p_coins_delta, 0)),
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_grant', 'info', 'grant_applied', v_actor, JSON_BUILD_OBJECT('target', p_user_id, 'xp_delta', p_xp_delta, 'coins_delta', p_coins_delta));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT v_row.id, v_row.xp, v_row.coins, v_row.streak;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_grant', 'error', SQLERRM, v_actor, JSON_BUILD_OBJECT('target', p_user_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$;

-- ============================================
-- 8. ADMIN: RESET PLAYER PROGRESS
-- ============================================

-- Ensure cleanup before changing return type (Postgres won't allow return type changes with CREATE OR REPLACE)
DROP FUNCTION IF EXISTS rpc_admin_reset_user(UUID) CASCADE;
CREATE FUNCTION rpc_admin_reset_user(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  xp INT,
  coins INT,
  streak INT,
  level INT,
  gemstones INT,
  attack_power INT,
  defense_power INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row users%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Reset all player stats
  UPDATE users
  SET xp = 0,
      coins = 0,
      streak = 0,
      level = 1,
      gemstones = 0,
      attack_power = 10,
      defense_power = 10,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Empty the player's inventory
  DELETE FROM inventory WHERE user_id = p_user_id;

  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_reset_user', 'info', 'reset_applied', v_actor, JSON_BUILD_OBJECT('target', p_user_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT v_row.id, v_row.xp, v_row.coins, v_row.streak, v_row.level, 
                      COALESCE(v_row.gemstones, 0) as gemstones, 
                      v_row.attack_power, v_row.defense_power;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_reset_user', 'error', SQLERRM, v_actor, JSON_BUILD_OBJECT('target', p_user_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$;

-- ============================================
-- 9. ADMIN: BAN/UNBAN PLAYER
-- ============================================

CREATE OR REPLACE FUNCTION rpc_admin_ban_user(p_user_id UUID, p_is_banned BOOLEAN)
RETURNS TABLE (
  user_id UUID,
  is_banned BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row users%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE users
  SET is_banned = COALESCE(p_is_banned, FALSE),
      streak = CASE WHEN COALESCE(p_is_banned, FALSE) THEN 0 ELSE streak END,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF COALESCE(p_is_banned, FALSE) THEN
    BEGIN
      PERFORM auth.disable_user(p_user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      PERFORM auth.invalidate_refresh_tokens(p_user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      DELETE FROM auth.sessions WHERE user_id = p_user_id;
      DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  ELSE
    BEGIN
      PERFORM auth.enable_user(p_user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_ban_user', 'info', 'ban_state_changed', v_actor, JSON_BUILD_OBJECT('target', p_user_id, 'is_banned', p_is_banned));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT v_row.id, v_row.is_banned;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_ban_user', 'error', SQLERRM, v_actor, JSON_BUILD_OBJECT('target', p_user_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$;

-- ============================================
-- 10. ADMIN: UPDATE GRADE/CLASS
-- ============================================

CREATE OR REPLACE FUNCTION rpc_admin_set_user_academics(p_user_id UUID, p_grade INT, p_batch TEXT)
RETURNS TABLE (
  user_id UUID,
  grade INT,
  batch TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_row users%ROWTYPE;
  v_grade INT := p_grade;
  v_batch TEXT := p_batch;
BEGIN
  IF v_actor IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Accept grades 6-12
  IF v_grade IS NOT NULL AND (v_grade < 6 OR v_grade > 12) THEN
    RAISE EXCEPTION 'invalid_grade';
  END IF;

  -- Accept all batches 6A-12C plus N/A
  IF v_batch IS NOT NULL AND v_batch NOT IN (
    '6A', '6B', '6C',
    '7A', '7B', '7C',
    '8A', '8B', '8C',
    '9A', '9B', '9C',
    '10A', '10B', '10C',
    '11A', '11B', '11C',
    '12A', '12B', '12C',
    'N/A'
  ) THEN
    RAISE EXCEPTION 'invalid_batch';
  END IF;

  -- Validate batch matches grade (handles both single and double digit grades)
  IF v_batch IS NOT NULL AND v_batch <> 'N/A' AND v_grade IS NOT NULL THEN
    IF (regexp_replace(v_batch, '[A-C]$', ''))::INT <> v_grade THEN
      RAISE EXCEPTION 'batch_grade_mismatch';
    END IF;
  END IF;

  IF v_grade IS NULL AND v_batch <> 'N/A' THEN
    v_batch := NULL;
  END IF;

  UPDATE users
  SET grade = v_grade,
      batch = v_batch,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_set_user_academics', 'info', 'academics_updated', v_actor, JSON_BUILD_OBJECT('target', p_user_id, 'grade', v_grade, 'batch', v_batch));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT v_row.id, v_row.grade::INT, v_row.batch;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_set_user_academics', 'error', SQLERRM, v_actor, JSON_BUILD_OBJECT('target', p_user_id, 'grade', p_grade, 'batch', p_batch));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$;

-- ============================================
-- 11. ADMIN: RESET ALL PLAYER PROGRESS
-- ============================================
-- Note: Uses 'id IS NOT NULL' instead of 'WHERE TRUE' for Supabase RLS compatibility

CREATE FUNCTION rpc_admin_reset_all()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_player_count INT := 0;
  v_bot_count INT := 0;
BEGIN
  -- Auth check
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = v_actor
      AND (u.is_admin = TRUE OR u.role = 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Reset all non-admin, non-banned player stats
  UPDATE users
  SET xp = 0, coins = 0, gemstones = 0, streak = 0, level = 1,
      attack_power = 10, defense_power = 10,
      ap_now = ap_max, last_ap_update = NOW(),
      pvp_score = 0, last_attacked_at = NULL, updated_at = NOW()
  WHERE is_admin IS NOT TRUE
    AND is_banned IS NOT TRUE;
  GET DIAGNOSTICS v_player_count = ROW_COUNT;

  -- Reset bots if table exists
  IF to_regclass('public.bot_users') IS NOT NULL THEN
    UPDATE bot_users
    SET xp = 0, coins = 0, gemstones = 0, streak = 0, level = 1,
        attack_power = 10, defense_power = 10, ap_now = ap_max,
        last_ap_update = NOW(), total_questions_answered = 0,
        achievement_points = 0, last_attacked_at = NULL,
        last_seen = NOW(), updated_at = NOW()
    WHERE id IS NOT NULL;
    GET DIAGNOSTICS v_bot_count = ROW_COUNT;
  END IF;

  -- Clear activities
  IF to_regclass('public.activities') IS NOT NULL THEN
    DELETE FROM activities WHERE id IS NOT NULL;
  END IF;

  -- Clear activity_reactions
  IF to_regclass('public.activity_reactions') IS NOT NULL THEN
    DELETE FROM activity_reactions WHERE id IS NOT NULL;
  END IF;

  -- Clear inventory
  IF to_regclass('public.inventory') IS NOT NULL THEN
    DELETE FROM inventory WHERE id IS NOT NULL;
  END IF;

  -- Clear clan-related tables
  IF to_regclass('public.clan_chat') IS NOT NULL THEN
    DELETE FROM clan_chat WHERE id IS NOT NULL;
  END IF;
  IF to_regclass('public.clan_members') IS NOT NULL THEN
    DELETE FROM clan_members WHERE clan_id IS NOT NULL;
  END IF;
  IF to_regclass('public.clan_buffs') IS NOT NULL THEN
    DELETE FROM clan_buffs WHERE id IS NOT NULL;
  END IF;
  IF to_regclass('public.clans') IS NOT NULL THEN
    DELETE FROM clans WHERE id IS NOT NULL;
  END IF;

  -- Clear other tables
  IF to_regclass('public.tasks') IS NOT NULL THEN
    DELETE FROM tasks WHERE id IS NOT NULL;
  END IF;
  IF to_regclass('public.task_progress') IS NOT NULL THEN
    DELETE FROM task_progress WHERE id IS NOT NULL;
  END IF;
  IF to_regclass('public.sessions') IS NOT NULL THEN
    DELETE FROM sessions WHERE id IS NOT NULL;
  END IF;
  IF to_regclass('public.shop_purchases') IS NOT NULL THEN
    DELETE FROM shop_purchases WHERE id IS NOT NULL;
  END IF;

  -- Reset caps
  IF to_regclass('public.caps') IS NOT NULL THEN
    UPDATE caps
    SET xp_daily_earned = 0, coins_daily_earned = 0,
        xp_weekly_earned = 0, coins_weekly_earned = 0,
        daily_reset_at = CURRENT_DATE, weekly_reset_at = CURRENT_DATE
    WHERE user_id IS NOT NULL;
  END IF;

  -- Log the reset
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_reset_all', 'info', 'global_reset', v_actor,
            JSON_BUILD_OBJECT('players', v_player_count, 'bots', v_bot_count));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_player_count + v_bot_count;
END;
$$;

-- ============================================
-- 12. ADMIN: REFILL AP FOR ALL PLAYERS
-- ============================================

CREATE OR REPLACE FUNCTION rpc_admin_refill_all_ap()
RETURNS TABLE(
  affected_rows INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_actor IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE users
  SET ap_now = ap_max,
      last_ap_update = NOW(),
      updated_at = NOW()
  WHERE COALESCE(is_admin, FALSE) = FALSE
    AND COALESCE(is_banned, FALSE) = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_refill_all_ap', 'info', 'refill_all', v_actor, JSON_BUILD_OBJECT('affected_rows', v_count));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT COALESCE(v_count, 0);
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_refill_all_ap', 'error', SQLERRM, v_actor, JSON_BUILD_OBJECT());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$;


CREATE OR REPLACE FUNCTION rpc_admin_disband_clan(p_clan_id UUID)
RETURNS TABLE(
  clan_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_actor IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM clans WHERE id = p_clan_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_disband_clan', 'info', 'clan_disbanded', v_actor, JSON_BUILD_OBJECT('clan_id', p_clan_id, 'affected_rows', v_count));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT p_clan_id;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_disband_clan', 'error', SQLERRM, v_actor, JSON_BUILD_OBJECT('clan_id', p_clan_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$;


-- ============================================
-- 14. VERIFICATION
-- ============================================

SELECT '✅ COMPETITION PHASE 1 DEPLOYMENT COMPLETE' as status;

SELECT 'RPC Functions Deployed:' as check_type;
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE 'rpc_%'
ORDER BY routine_name;

DO $$
BEGIN
  RAISE NOTICE '✅ Competition Phase 1 RPC functions deployed successfully!';
  RAISE NOTICE '📋 Functions available:';
  RAISE NOTICE '  - rpc_questions_next (fetch questions for Silk Road competition)';
  RAISE NOTICE '  - rpc_submit_attempt (submit MCQ answers)';
  RAISE NOTICE '  - rpc_leaderboard_grade (grade leaderboards)';
  RAISE NOTICE '  - rpc_leaderboard_batch (class/batch leaderboards)';
  RAISE NOTICE '  - rpc_admin_grant (grant XP/coins to players)';
  RAISE NOTICE '  - rpc_admin_reset_user (reset individual player progress)';
  RAISE NOTICE '  - rpc_admin_reset_all (reset all players)';
  RAISE NOTICE '  - rpc_admin_ban_user (ban/unban players)';
  RAISE NOTICE '  - rpc_admin_set_user_academics (set grade/batch)';
  RAISE NOTICE '  - rpc_admin_refill_all_ap (refill AP for all players)';
  RAISE NOTICE '  - rpc_admin_disband_clan (disband clans)';
  RAISE NOTICE '🚀 Ready for gameplay! The 404 errors for rpc_questions_next and rpc_leaderboard_batch should now be resolved.';
END;
$$;
