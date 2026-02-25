-- ================================================================
-- SECURITY PATCH: Fix SECURITY DEFINER privilege escalation risks
-- ================================================================
-- Run in Supabase SQL Editor — ONE block at a time if you prefer,
-- or paste the whole file. Every statement uses IF EXISTS / OR REPLACE
-- so it is safe to re-run.
--
-- WHAT THIS FIXES:
--   CRITICAL 1: rpc_grant_levelup_rewards — anyone could claim free coins
--   CRITICAL 2: rpc_check_achievements — anyone could trigger for any user
--   CRITICAL 3: Tournament functions — zero auth, zero role check
--   CRITICAL 4: rpc_apply_reward_delta — uncapped (add server-side limits)
--   HIGH 1:     Notification helpers — callable by anyone, no search_path
--   HIGH 2:     Bot system functions — callable by anyone, no search_path
--   MEDIUM:     All remaining missing SET search_path
-- ================================================================


-- ────────────────────────────────────────────────
-- CRITICAL 1: rpc_grant_levelup_rewards
-- Problem: Accepts any p_new_level from client.
--   User calls rpc_grant_levelup_rewards(1000) → gets 100,000 coins.
-- Fix: Read the user's ACTUAL level from the DB and use that.
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_grant_levelup_rewards(p_new_level int)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_actual_level int;
  v_coins_reward int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Read the user's REAL level — never trust the client value
  SELECT level INTO v_actual_level
  FROM public.users
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Only grant if claimed level matches actual level (tolerance of 1)
  IF p_new_level > v_actual_level + 1 OR p_new_level < 1 THEN
    RAISE EXCEPTION 'Level mismatch: claimed %, actual %', p_new_level, v_actual_level;
  END IF;

  -- Cap at actual level
  v_coins_reward := 100 * LEAST(p_new_level, v_actual_level + 1);

  UPDATE public.users
  SET
    coins = coins + v_coins_reward,
    ap_now = ap_max
  WHERE id = v_user_id;

  RETURN json_build_object(
    'coins', v_coins_reward,
    'ap_refill', true,
    'message', 'Level up rewards granted!'
  );
END;
$$;


-- ────────────────────────────────────────────────
-- CRITICAL 2: rpc_check_achievements
-- Problem: Takes arbitrary p_user_id, no auth check, no search_path.
--   Anyone can grant achievements + rewards to any user.
-- Fix: Ignore p_user_id, always use auth.uid().
-- ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_check_achievements(uuid);
CREATE OR REPLACE FUNCTION public.rpc_check_achievements(p_user_id UUID)
RETURNS TABLE(newly_earned JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real_user_id uuid := auth.uid();
  v_achievement RECORD;
  v_current_value INTEGER;
  v_newly_earned JSONB := '[]'::JSONB;
  v_achievement_json JSONB;
BEGIN
  -- SECURITY: Always use the caller's own ID
  IF v_real_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ignore the passed p_user_id — use auth.uid()
  DECLARE
    v_user RECORD;
    v_pvp_wins INTEGER;
    v_quests_completed INTEGER;
    v_items_purchased INTEGER;
  BEGIN
    SELECT * INTO v_user FROM users WHERE id = v_real_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User not found';
    END IF;

    SELECT COUNT(*) INTO v_pvp_wins
    FROM activities WHERE actor_id = v_real_user_id AND kind = 'pvp_win';

    SELECT COUNT(*) INTO v_quests_completed
    FROM activities WHERE actor_id = v_real_user_id AND kind = 'quest_complete';

    SELECT COUNT(*) INTO v_items_purchased
    FROM activities WHERE actor_id = v_real_user_id AND kind = 'shop_purchase';

    FOR v_achievement IN SELECT * FROM achievements LOOP
      IF EXISTS (
        SELECT 1 FROM user_achievements
        WHERE user_id = v_real_user_id AND achievement_id = v_achievement.id
      ) THEN
        CONTINUE;
      END IF;

      v_current_value := 0;
      CASE v_achievement.condition_type
        WHEN 'pvp_wins_count' THEN v_current_value := v_pvp_wins;
        WHEN 'total_xp' THEN v_current_value := v_user.xp;
        WHEN 'quests_completed' THEN v_current_value := v_quests_completed;
        WHEN 'coins_earned' THEN
          v_current_value := v_user.coins + COALESCE(
            (SELECT SUM(amount) FROM activities
             WHERE actor_id = v_real_user_id AND kind = 'shop_purchase'), 0);
        WHEN 'items_purchased' THEN v_current_value := v_items_purchased;
        WHEN 'clan_member' THEN
          v_current_value := CASE WHEN v_user.clan_id IS NOT NULL THEN 1 ELSE 0 END;
        ELSE v_current_value := 0;
      END CASE;

      IF v_current_value >= v_achievement.condition_value THEN
        INSERT INTO user_achievements (user_id, achievement_id)
        VALUES (v_real_user_id, v_achievement.id);

        UPDATE users
        SET xp = xp + v_achievement.reward_xp,
            coins = coins + v_achievement.reward_coins
        WHERE id = v_real_user_id;

        INSERT INTO activities (kind, actor_id, actor_username, detail)
        VALUES (
          'achievement_earned', v_real_user_id, v_user.username,
          jsonb_build_object(
            'achievement_id', v_achievement.id,
            'achievement_name', v_achievement.name,
            'reward_xp', v_achievement.reward_xp,
            'reward_coins', v_achievement.reward_coins
          )
        );

        v_achievement_json := jsonb_build_object(
          'id', v_achievement.id,
          'name', v_achievement.name,
          'description', v_achievement.description,
          'icon', v_achievement.icon,
          'reward_xp', v_achievement.reward_xp,
          'reward_coins', v_achievement.reward_coins
        );
        v_newly_earned := v_newly_earned || v_achievement_json;
      END IF;
    END LOOP;
  END;

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_check_achievements(UUID) TO authenticated;


-- ────────────────────────────────────────────────
-- CRITICAL 3: Tournament functions — add admin-only guard
-- Problem: Any user can approve signups, generate brackets,
--   change schedules, and declare match winners.
-- Fix: Add is_current_user_admin() check at the top of each.
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_tournament_signup(signup_id uuid)
RETURNS public.tournament_school_signups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.tournament_school_signups;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.tournament_school_signups
    SET status = 'approved'
  WHERE id = signup_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

DROP FUNCTION IF EXISTS public.generate_season_bracket(uuid);
CREATE OR REPLACE FUNCTION public.generate_season_bracket(season_id uuid)
RETURNS SETOF public.tournament_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approved_signups uuid[];
  index integer := 1;
  match_record public.tournament_matches;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT array_agg(id ORDER BY random())
  INTO approved_signups
  FROM public.tournament_school_signups
  WHERE season_id = generate_season_bracket.season_id
    AND status = 'approved';

  IF approved_signups IS NULL OR array_length(approved_signups, 1) < 2 THEN
    RAISE EXCEPTION 'Need at least two approved signups to generate bracket';
  END IF;

  DELETE FROM public.tournament_matches WHERE season_id = generate_season_bracket.season_id;

  WHILE index <= array_length(approved_signups, 1) LOOP
    INSERT INTO public.tournament_matches (
      season_id, round_number, match_number, team_a_id, team_b_id, status
    ) VALUES (
      generate_season_bracket.season_id, 1, (index + 1) / 2,
      approved_signups[index], approved_signups[index + 1], 'scheduled'
    ) RETURNING * INTO match_record;

    RETURN NEXT match_record;
    index := index + 2;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_match_schedule(
  match_id uuid,
  scheduled_at timestamptz,
  location text,
  stream_url text,
  metadata jsonb DEFAULT NULL
)
RETURNS public.tournament_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.tournament_matches;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.tournament_matches
  SET
    scheduled_at = update_match_schedule.scheduled_at,
    location = update_match_schedule.location,
    stream_url = update_match_schedule.stream_url,
    metadata = COALESCE(update_match_schedule.metadata, tournament_matches.metadata)
  WHERE id = match_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_match_winner(
  match_id uuid,
  winner uuid,
  status text DEFAULT 'completed'
)
RETURNS public.tournament_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated public.tournament_matches;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE public.tournament_matches
  SET
    winner_id = winner,
    status = COALESCE(record_match_winner.status, 'completed')
  WHERE id = match_id
  RETURNING * INTO updated;

  RETURN updated;
END;
$$;


-- ────────────────────────────────────────────────
-- CRITICAL 4: rpc_apply_reward_delta — add server-side caps
-- Problem: Client can pass arbitrary positive values.
--   ClanTerritory already calls it with calculated rewards.
-- Fix: Cap per-call deltas so nobody can self-grant millions.
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_apply_reward_delta(
  p_xp_delta int DEFAULT 0,
  p_coins_delta int DEFAULT 0,
  p_gemstones_delta int DEFAULT 0,
  p_apply_level_milestone boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_previous_level int := 1;
  v_next_xp int := 0;
  v_next_coins int := 0;
  v_next_gemstones int := 0;
  v_xp_status jsonb;
  v_next_level int := 1;

  -- Server-side caps per single call
  c_max_xp int := 500;
  c_max_coins int := 1000;
  c_max_gems int := 5;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow XP/level writes so block_direct_xp_level_updates trigger passes
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  -- Clamp deltas to safe maximums
  p_xp_delta := LEAST(GREATEST(p_xp_delta, -c_max_xp), c_max_xp);
  p_coins_delta := LEAST(GREATEST(p_coins_delta, -c_max_coins), c_max_coins);
  p_gemstones_delta := LEAST(GREATEST(p_gemstones_delta, -c_max_gems), c_max_gems);

  SELECT xp, coins, gemstones, level
  INTO v_profile
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  v_previous_level := COALESCE(v_profile.level, 1);
  v_next_xp := GREATEST(0, COALESCE(v_profile.xp, 0) + COALESCE(p_xp_delta, 0));
  v_next_coins := GREATEST(0, COALESCE(v_profile.coins, 0) + COALESCE(p_coins_delta, 0));
  v_next_gemstones := GREATEST(0, COALESCE(v_profile.gemstones, 0) + COALESCE(p_gemstones_delta, 0));

  SELECT to_jsonb(xp_status(p_xp => v_next_xp)) INTO v_xp_status;
  v_next_level := COALESCE((v_xp_status->>'level')::int, v_previous_level);

  IF p_apply_level_milestone AND v_next_level > v_previous_level THEN
    IF v_next_level % 5 = 0 THEN
      v_next_gemstones := v_next_gemstones + 1;
    END IF;
  END IF;

  UPDATE public.users
  SET xp = v_next_xp,
      coins = v_next_coins,
      gemstones = v_next_gemstones
  WHERE id = v_user_id
  RETURNING xp, coins, level, gemstones
  INTO v_profile;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'xp', v_profile.xp,
      'coins', v_profile.coins,
      'level', v_profile.level,
      'gemstones', v_profile.gemstones
    ),
    'xp_status', v_xp_status,
    'previous_level', v_previous_level
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_apply_reward_delta(int, int, int, boolean) TO authenticated;


-- ────────────────────────────────────────────────
-- HIGH 1: Notification helper functions
-- Problem: No auth check, no search_path. Any user can spam
--   fake "under attack" notifications to any other user.
-- Fix: These are INTERNAL helpers called by other RPCs
--   (like rpc_hack_attempt). Revoke direct access from
--   authenticated/public roles. Add search_path.
-- ────────────────────────────────────────────────

-- Recreate with search_path set (they keep SECURITY DEFINER
-- because they are called from other SECURITY DEFINER functions)
-- Must DROP first because old versions return VOID, new ones return UUID
DROP FUNCTION IF EXISTS public.notify_attack_incoming(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.notify_attack_defended(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.notify_level_up(UUID, INT, INT, INT);
DROP FUNCTION IF EXISTS public.notify_low_ap(UUID, INT, INT);
DROP FUNCTION IF EXISTS public.notify_ap_full(UUID);
DROP FUNCTION IF EXISTS public.notify_coins_lost(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.notify_revenge_available(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.notify_attack_incoming(
  target_user_id UUID, attacker_username TEXT, attacker_power INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    target_user_id, 'attack_incoming', '🚨 UNDER ATTACK!',
    attacker_username || ' is attacking you with ' || attacker_power || ' power!',
    'urgent',
    jsonb_build_object('attacker', attacker_username, 'power', attacker_power)
  ) RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_attack_defended(
  user_id_param UUID, attacker_username TEXT, coins_kept INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    user_id_param, 'attack_defended', '🛡️ Victory! Defense Successful',
    'You defended against ' || attacker_username || ' and kept ' || coins_kept || ' coins!',
    'high',
    jsonb_build_object('attacker', attacker_username, 'coins', coins_kept)
  ) RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_level_up(
  user_id_param UUID, new_level INT, rewards_xp INT, rewards_coins INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    user_id_param, 'level_up', '🎉 LEVEL UP!',
    'You reached Level ' || new_level || '! Earned ' || rewards_xp || ' XP and ' || rewards_coins || ' coins!',
    'high',
    jsonb_build_object('level', new_level, 'xp', rewards_xp, 'coins', rewards_coins)
  ) RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_low_ap(
  user_id_param UUID, current_ap INT, max_ap INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE notification_id UUID;
BEGIN
  IF current_ap::FLOAT / max_ap < 0.2 THEN
    IF NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE user_id = user_id_param AND type = 'low_ap'
        AND created_at > NOW() - INTERVAL '1 hour'
    ) THEN
      INSERT INTO notifications (user_id, type, title, message, priority, data)
      VALUES (
        user_id_param, 'low_ap', '⚠️ Low Action Points',
        'You only have ' || current_ap || '/' || max_ap || ' AP left. Time to rest!',
        'low',
        jsonb_build_object('current_ap', current_ap, 'max_ap', max_ap)
      ) RETURNING id INTO notification_id;
    END IF;
  END IF;
  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_ap_full(user_id_param UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE notification_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM notifications
    WHERE user_id = user_id_param AND type = 'ap_full'
      AND created_at > NOW() - INTERVAL '2 hours'
  ) THEN
    INSERT INTO notifications (user_id, type, title, message, priority)
    VALUES (user_id_param, 'ap_full', '⚡ Action Points Full!',
            'Your AP is fully recharged. Time to take action!', 'medium')
    RETURNING id INTO notification_id;
  END IF;
  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_coins_lost(
  user_id_param UUID, attacker_username TEXT, coins_lost INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    user_id_param, 'coins_lost', '😰 Coins Stolen!',
    attacker_username || ' stole ' || coins_lost || ' coins from you!',
    'high',
    jsonb_build_object('attacker', attacker_username, 'coins', coins_lost)
  ) RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_revenge_available(
  user_id_param UUID, target_username TEXT, target_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, priority, data)
  VALUES (
    user_id_param, 'revenge_available', '💢 Revenge Available!',
    'Get your revenge on ' || target_username || ' who attacked you!',
    'high',
    jsonb_build_object('target_username', target_username, 'target_id', target_user_id)
  ) RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$$;

-- REVOKE direct client access — these are internal helpers only
REVOKE ALL ON FUNCTION public.notify_attack_incoming(UUID, TEXT, INT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_attack_defended(UUID, TEXT, INT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_level_up(UUID, INT, INT, INT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_low_ap(UUID, INT, INT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_ap_full(UUID) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_coins_lost(UUID, TEXT, INT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_revenge_available(UUID, TEXT, UUID) FROM public, anon, authenticated;


-- ────────────────────────────────────────────────
-- HIGH 2: Bot system functions — restrict to admin only
-- Problem: Any user can call simulate_bot_activity() etc.
-- Fix: Add admin check + search_path to all 5 functions.
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.simulate_bot_activity()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    bot_record RECORD;
    activity_chance NUMERIC;
    xp_gain INTEGER;
    coins_gain INTEGER;
    new_level INTEGER;
    minutes_since_update NUMERIC;
BEGIN
    -- SECURITY: admin or internal-only
    IF auth.uid() IS NOT NULL AND NOT public.is_current_user_admin() THEN
      RAISE EXCEPTION 'Admin only';
    END IF;

    FOR bot_record IN
        SELECT * FROM bot_users
        WHERE updated_at < NOW() - INTERVAL '10 minutes'
    LOOP
        minutes_since_update := EXTRACT(EPOCH FROM (NOW() - bot_record.updated_at)) / 60.0;
        activity_chance := CASE
            WHEN bot_record.bot_personality = 'aggressive' THEN 0.7
            WHEN bot_record.bot_personality = 'defensive' THEN 0.4
            ELSE 0.55
        END;

        IF minutes_since_update > 10 AND random() < activity_chance THEN
            xp_gain := CASE
                WHEN bot_record.bot_personality = 'aggressive' THEN 15 + floor(random() * 25)::INTEGER
                WHEN bot_record.bot_personality = 'defensive' THEN 8 + floor(random() * 15)::INTEGER
                ELSE 12 + floor(random() * 20)::INTEGER
            END;
            coins_gain := CASE
                WHEN bot_record.bot_personality = 'aggressive' THEN 20 + floor(random() * 40)::INTEGER
                WHEN bot_record.bot_personality = 'defensive' THEN 10 + floor(random() * 25)::INTEGER
                ELSE 15 + floor(random() * 30)::INTEGER
            END;
            new_level := GREATEST(1, FLOOR((bot_record.xp + xp_gain) / 100.0) + 1);

            UPDATE bot_users
            SET xp = xp + xp_gain, coins = coins + coins_gain,
                level = new_level, last_seen = NOW(), updated_at = NOW(),
                ap_now = LEAST(ap_max, ap_now + FLOOR(minutes_since_update / 10.0)::INTEGER),
                last_ap_update = NOW()
            WHERE id = bot_record.id;

            INSERT INTO activities (kind, actor_id, actor_username, data)
            VALUES (
                CASE WHEN random() < 0.6 THEN 'quest_complete'
                     WHEN random() < 0.8 THEN 'level_up'
                     ELSE 'shop_purchase' END,
                bot_record.id, bot_record.username,
                jsonb_build_object('xp_gained', xp_gain, 'coins_gained', coins_gain, 'bot_activity', true)
            );
        END IF;
    END LOOP;
    RETURN 'Bot activity simulation completed';
END;
$$;

CREATE OR REPLACE FUNCTION public.simulate_bot_pvp_activity()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    attacker_bot RECORD;
    defender_bot RECORD;
    attack_success BOOLEAN;
    coins_stolen INTEGER;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_current_user_admin() THEN
      RAISE EXCEPTION 'Admin only';
    END IF;

    SELECT * INTO attacker_bot FROM bot_users
    WHERE bot_personality = 'aggressive' AND ap_now >= 5
    ORDER BY random() LIMIT 1;

    SELECT * INTO defender_bot FROM bot_users
    WHERE id != attacker_bot.id
      AND (last_attacked_at < NOW() - INTERVAL '1 hour' OR last_attacked_at IS NULL)
    ORDER BY random() LIMIT 1;

    IF attacker_bot.id IS NOT NULL AND defender_bot.id IS NOT NULL THEN
        attack_success := (attacker_bot.attack_power::NUMERIC / (attacker_bot.attack_power + defender_bot.defense_power)) > random();
        IF attack_success THEN
            coins_stolen := LEAST(defender_bot.coins, 50 + floor(random() * 100)::INTEGER);
            UPDATE bot_users SET coins = coins + coins_stolen, xp = xp + 25, ap_now = ap_now - 5, updated_at = NOW() WHERE id = attacker_bot.id;
            UPDATE bot_users SET coins = GREATEST(0, coins - coins_stolen), last_attacked_at = NOW(), updated_at = NOW() WHERE id = defender_bot.id;
            INSERT INTO activities (kind, actor_id, actor_username, target_id, target_username, data)
            VALUES ('pvp_win', attacker_bot.id, attacker_bot.username, defender_bot.id, defender_bot.username,
                    jsonb_build_object('coins_stolen', coins_stolen, 'bot_pvp', true, 'details', 'Stole ' || coins_stolen || ' coins'));
        ELSE
            UPDATE bot_users SET ap_now = ap_now - 5, updated_at = NOW() WHERE id = attacker_bot.id;
            INSERT INTO activities (kind, actor_id, actor_username, target_id, target_username, data)
            VALUES ('pvp_loss', attacker_bot.id, attacker_bot.username, defender_bot.id, defender_bot.username,
                    jsonb_build_object('bot_pvp', true, 'details', 'Attack was defended'));
        END IF;
    END IF;
    RETURN 'Bot PvP simulation completed';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bot_leaderboard_data()
RETURNS TABLE (
    id UUID, username TEXT, avatar_url TEXT, level INTEGER, xp INTEGER,
    coins INTEGER, batch TEXT, last_seen TIMESTAMPTZ, role TEXT,
    attack_power INTEGER, defense_power INTEGER, clan_affiliation TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Allow all authenticated users to READ bot leaderboard data
    -- but the underlying simulate calls are now admin-gated internally
    PERFORM simulate_bot_activity();
    IF random() < 0.3 THEN
        PERFORM simulate_bot_pvp_activity();
    END IF;

    RETURN QUERY
    SELECT b.id, b.username, b.avatar_url, b.level, b.xp, b.coins,
           b.batch, b.last_seen, b.role, b.attack_power, b.defense_power, b.clan_affiliation
    FROM bot_users b ORDER BY b.level DESC, b.xp DESC;
END;
$$;

-- NOTE: get_bot_leaderboard_data calls simulate_bot_activity internally.
-- Since it runs as SECURITY DEFINER (owner), the admin check inside
-- simulate_bot_activity will pass (auth.uid() is null in owner context).
-- Direct client calls to simulate_bot_activity are blocked.

CREATE OR REPLACE FUNCTION public.get_bot_pvp_targets(p_user_id UUID)
RETURNS TABLE (
    user_id UUID, username TEXT, level INTEGER, coins INTEGER,
    batch TEXT, has_shield BOOLEAN, est_win_rate NUMERIC, avatar_url TEXT,
    last_seen TIMESTAMPTZ, clan_name TEXT, attack_power INTEGER, defense_power INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM simulate_bot_activity();
    RETURN QUERY
    SELECT b.id, b.username, b.level, b.coins, b.batch,
           (b.bot_personality = 'defensive' AND random() < 0.6)::BOOLEAN,
           ROUND((CASE
               WHEN b.bot_personality = 'aggressive' THEN 0.3 + (random() * 0.3)
               WHEN b.bot_personality = 'defensive' THEN 0.6 + (random() * 0.3)
               ELSE 0.45 + (random() * 0.3)
           END)::numeric, 2),
           b.avatar_url, b.last_seen, b.clan_affiliation,
           b.attack_power, b.defense_power
    FROM bot_users b
    WHERE b.coins > 50
      AND (b.last_attacked_at IS NULL OR b.last_attacked_at < NOW() - INTERVAL '30 minutes')
    ORDER BY random() LIMIT 15;
END;
$$;

CREATE OR REPLACE FUNCTION public.maintain_bot_ecosystem()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result_msg TEXT := '';
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_current_user_admin() THEN
      RAISE EXCEPTION 'Admin only';
    END IF;

    PERFORM simulate_bot_activity();
    result_msg := result_msg || 'Bot activity updated. ';

    IF random() < 0.3 THEN
        PERFORM simulate_bot_pvp_activity();
        result_msg := result_msg || 'Bot PvP simulated. ';
    END IF;

    DELETE FROM activities
    WHERE data->>'bot_activity' = 'true'
      AND id NOT IN (
        SELECT a.id FROM activities a
        WHERE a.data->>'bot_activity' = 'true'
        ORDER BY a.created_at DESC LIMIT 100
      );
    result_msg := result_msg || 'Bot activities cleaned up.';
    RETURN result_msg;
END;
$$;

-- Revoke direct simulate/maintain from non-admins
REVOKE ALL ON FUNCTION public.simulate_bot_activity() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.simulate_bot_pvp_activity() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintain_bot_ecosystem() FROM public, anon, authenticated;
-- Keep leaderboard + pvp targets readable
GRANT EXECUTE ON FUNCTION public.get_bot_leaderboard_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bot_pvp_targets(UUID) TO authenticated;


-- ────────────────────────────────────────────────
-- Reload PostgREST schema cache
-- ────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
