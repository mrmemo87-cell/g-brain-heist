-- RPC function to check and grant achievements
CREATE OR REPLACE FUNCTION rpc_check_achievements(p_user_id UUID)
RETURNS TABLE(
  newly_earned JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_achievement RECORD;
  v_current_value INTEGER;
  v_newly_earned JSONB := '[]'::JSONB;
  v_achievement_json JSONB;
BEGIN
  -- Get user stats
  DECLARE
    v_user RECORD;
    v_pvp_wins INTEGER;
    v_quests_completed INTEGER;
    v_items_purchased INTEGER;
  BEGIN
    -- Get user profile
    SELECT * INTO v_user FROM users WHERE id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User not found';
    END IF;

    -- Count PvP wins
    SELECT COUNT(*) INTO v_pvp_wins 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'pvp_win';

    -- Count completed quests
    SELECT COUNT(*) INTO v_quests_completed 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'quest_complete';

    -- Count items purchased
    SELECT COUNT(*) INTO v_items_purchased 
    FROM activities 
    WHERE actor_id = p_user_id AND kind = 'shop_purchase';

    -- Loop through all achievements
    FOR v_achievement IN SELECT * FROM achievements LOOP
      -- Skip if already earned
      IF EXISTS (
        SELECT 1 FROM user_achievements 
        WHERE user_id = p_user_id AND achievement_id = v_achievement.id
      ) THEN
        CONTINUE;
      END IF;

      -- Check condition
      v_current_value := 0;
      CASE v_achievement.condition_type
        WHEN 'pvp_wins_count' THEN
          v_current_value := v_pvp_wins;
        WHEN 'total_xp' THEN
          v_current_value := v_user.xp;
        WHEN 'quests_completed' THEN
          v_current_value := v_quests_completed;
        WHEN 'coins_earned' THEN
          -- Total coins earned = current coins + coins spent
          v_current_value := v_user.coins + COALESCE(
            (SELECT SUM(amount) FROM activities 
             WHERE actor_id = p_user_id AND kind = 'shop_purchase'),
            0
          );
        WHEN 'items_purchased' THEN
          v_current_value := v_items_purchased;
        WHEN 'clan_member' THEN
          v_current_value := CASE WHEN v_user.clan_id IS NOT NULL THEN 1 ELSE 0 END;
        ELSE
          v_current_value := 0;
      END CASE;

      -- Grant achievement if condition met
      IF v_current_value >= v_achievement.condition_value THEN
        -- Insert earned achievement
        INSERT INTO user_achievements (user_id, achievement_id)
        VALUES (p_user_id, v_achievement.id);

        -- Grant rewards
        UPDATE users
        SET 
          xp = xp + v_achievement.reward_xp,
          coins = coins + v_achievement.reward_coins
        WHERE id = p_user_id;

        -- Log activity
        INSERT INTO activities (kind, actor_id, actor_username, detail)
        VALUES (
          'achievement_earned',
          p_user_id,
          v_user.username,
          jsonb_build_object(
            'achievement_id', v_achievement.id,
            'achievement_name', v_achievement.name,
            'reward_xp', v_achievement.reward_xp,
            'reward_coins', v_achievement.reward_coins
          )
        );

        -- Add to newly earned list
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
