-- Expand rpc_admin_reset_all to include achievements, PvP history,
-- answered-question records, task records, and caps for all player accounts.

-- Existing deployments may have rpc_admin_reset_all() with a different return type.
-- Drop first to avoid: cannot change return type of existing function.
DROP FUNCTION IF EXISTS public.rpc_admin_reset_all();

CREATE OR REPLACE FUNCTION public.rpc_admin_reset_all()
RETURNS TABLE (
  affected_rows INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_player_count INT := 0;
  v_bot_count INT := 0;
  v_activity_count INT := 0;
  v_activity_reaction_count INT := 0;
  v_inventory_count INT := 0;
  v_clan_count INT := 0;
  v_clan_member_count INT := 0;
  v_clan_chat_count INT := 0;
  v_clan_buff_count INT := 0;
  v_task_count INT := 0;
  v_task_progress_count INT := 0;
  v_session_count INT := 0;
  v_caps_reset INT := 0;
  v_shop_purchase_count INT := 0;
  v_achievements_cleared INT := 0;
  v_attempts_cleared INT := 0;
  v_pvp_attempts_cleared INT := 0;
  v_battles_cleared INT := 0;
  v_battle_events_cleared INT := 0;
BEGIN
  IF v_actor IS NULL OR NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE users
  SET xp = 0,
      coins = 0,
      gemstones = 0,
      streak = 0,
      level = 1,
      attack_power = 10,
      defense_power = 10,
      ap_now = ap_max,
      last_ap_update = NOW(),
      pvp_score = 0,
      last_attacked_at = NULL,
      updated_at = NOW()
  WHERE COALESCE(is_admin, FALSE) = FALSE
    AND COALESCE(is_banned, FALSE) = FALSE;
  GET DIAGNOSTICS v_player_count = ROW_COUNT;

  -- Optional user stat columns (schema-variant safe)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'pvp_wins'
  ) THEN
    UPDATE users
    SET pvp_wins = 0
    WHERE COALESCE(is_admin, FALSE) = FALSE
      AND COALESCE(is_banned, FALSE) = FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'total_questions_answered'
  ) THEN
    UPDATE users
    SET total_questions_answered = 0
    WHERE COALESCE(is_admin, FALSE) = FALSE
      AND COALESCE(is_banned, FALSE) = FALSE;
  END IF;

  IF to_regclass('public.bot_users') IS NOT NULL THEN
    UPDATE bot_users
    SET xp = 0,
        coins = 0,
        gemstones = 0,
        streak = 0,
        level = 1,
        attack_power = 10,
        defense_power = 10,
        ap_now = ap_max,
        last_ap_update = NOW(),
        total_questions_answered = 0,
        achievement_points = 0,
        last_attacked_at = NULL,
        last_seen = NOW(),
        updated_at = NOW()
    WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_bot_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.user_achievements') IS NOT NULL THEN
    DELETE FROM user_achievements WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_achievements_cleared = ROW_COUNT;
  END IF;

  IF to_regclass('public.attempts') IS NOT NULL THEN
    DELETE FROM attempts WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_attempts_cleared = ROW_COUNT;
  END IF;

  IF to_regclass('public.pvp_attack_attempts') IS NOT NULL THEN
    DELETE FROM pvp_attack_attempts WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_pvp_attempts_cleared = ROW_COUNT;
  END IF;

  IF to_regclass('public.brains_heist_battle_events') IS NOT NULL THEN
    DELETE FROM brains_heist_battle_events WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_battle_events_cleared = ROW_COUNT;
  END IF;

  IF to_regclass('public.brains_heist_battles') IS NOT NULL THEN
    DELETE FROM brains_heist_battles WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_battles_cleared = ROW_COUNT;
  END IF;

  IF to_regclass('public.activity_reactions') IS NOT NULL THEN
    DELETE FROM activity_reactions WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_activity_reaction_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.activities') IS NOT NULL THEN
    DELETE FROM activities WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_activity_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.inventory') IS NOT NULL THEN
    DELETE FROM inventory WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_inventory_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.clan_chat') IS NOT NULL THEN
    DELETE FROM clan_chat WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_clan_chat_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.clan_members') IS NOT NULL THEN
    DELETE FROM clan_members WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_clan_member_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.clan_buffs') IS NOT NULL THEN
    DELETE FROM clan_buffs WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_clan_buff_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.rivalry_wars') IS NOT NULL THEN
    DELETE FROM rivalry_wars WHERE ctid IS NOT NULL;
  END IF;

  IF to_regclass('public.clans') IS NOT NULL THEN
    DELETE FROM clans WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_clan_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    DELETE FROM tasks WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_task_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.task_progress') IS NOT NULL THEN
    DELETE FROM task_progress WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_task_progress_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    DELETE FROM sessions WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_session_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.caps') IS NOT NULL THEN
    UPDATE caps
    SET xp_daily_earned = 0,
        coins_daily_earned = 0,
        xp_weekly_earned = 0,
        coins_weekly_earned = 0,
        daily_reset_at = CURRENT_DATE,
        weekly_reset_at = CURRENT_DATE
    WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_caps_reset = ROW_COUNT;
  END IF;

  IF to_regclass('public.shop_purchases') IS NOT NULL THEN
    DELETE FROM shop_purchases WHERE ctid IS NOT NULL;
    GET DIAGNOSTICS v_shop_purchase_count = ROW_COUNT;
  END IF;

  INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
  VALUES (
    'rpc_admin_reset_all',
    'info',
    'global_reset_expanded',
    v_actor,
    JSON_BUILD_OBJECT(
      'player_rows', COALESCE(v_player_count, 0),
      'bot_rows', COALESCE(v_bot_count, 0),
      'activities_cleared', COALESCE(v_activity_count, 0),
      'activity_reactions_cleared', COALESCE(v_activity_reaction_count, 0),
      'inventory_cleared', COALESCE(v_inventory_count, 0),
      'clans_deleted', COALESCE(v_clan_count, 0),
      'clan_members_deleted', COALESCE(v_clan_member_count, 0),
      'clan_chat_deleted', COALESCE(v_clan_chat_count, 0),
      'clan_buffs_deleted', COALESCE(v_clan_buff_count, 0),
      'tasks_deleted', COALESCE(v_task_count, 0),
      'task_progress_deleted', COALESCE(v_task_progress_count, 0),
      'sessions_deleted', COALESCE(v_session_count, 0),
      'caps_reset', COALESCE(v_caps_reset, 0),
      'shop_purchases_deleted', COALESCE(v_shop_purchase_count, 0),
      'user_achievements_deleted', COALESCE(v_achievements_cleared, 0),
      'attempts_deleted', COALESCE(v_attempts_cleared, 0),
      'pvp_attack_attempts_deleted', COALESCE(v_pvp_attempts_cleared, 0),
      'battle_events_deleted', COALESCE(v_battle_events_cleared, 0),
      'battles_deleted', COALESCE(v_battles_cleared, 0)
    )
  );

  RETURN QUERY SELECT (COALESCE(v_player_count, 0) + COALESCE(v_bot_count, 0))::INT AS affected_rows;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_reset_all', 'error', SQLERRM, v_actor, JSON_BUILD_OBJECT());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$;


GRANT EXECUTE ON FUNCTION public.rpc_admin_reset_all() TO authenticated;
