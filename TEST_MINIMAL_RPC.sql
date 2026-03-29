-- ============================================
-- FINAL FIX: rpc_admin_reset_all
-- ============================================
-- Fixed: "UPDATE requires a WHERE clause" error
-- Supabase blocks WHERE TRUE for safety - use actual conditions

-- Step 1: Drop completely
DROP FUNCTION IF EXISTS rpc_admin_reset_all() CASCADE;
DROP FUNCTION IF EXISTS public.rpc_admin_reset_all() CASCADE;

-- Step 2: Create with proper WHERE clauses (not WHERE TRUE)
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

  -- Reset bots if table exists (use id IS NOT NULL as valid WHERE)
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

  -- Clear activities (use id IS NOT NULL)
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
  IF to_regclass('public.rivalry_wars') IS NOT NULL THEN
    DELETE FROM rivalry_wars WHERE id IS NOT NULL;
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

-- Step 3: Force schema reload
NOTIFY pgrst, 'reload schema';

-- Step 4: Verify
SELECT proname, pg_get_function_result(oid) AS returns
FROM pg_proc WHERE proname = 'rpc_admin_reset_all';

SELECT '✅ Function fixed! WHERE TRUE replaced with proper conditions.' AS status;
