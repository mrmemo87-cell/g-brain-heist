-- Canonical achievement unlock semantics:
-- - An achievement is earned only when earned_at or unlocked_at is present.
-- - rpc_check_achievements derives progress from authoritative event tables.
-- - Existing null-timestamp achievement rows are repaired via idempotent backfill.

ALTER TABLE IF EXISTS public.user_achievements
  ADD COLUMN IF NOT EXISTS earned_at timestamptz,
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS progress integer,
  ADD COLUMN IF NOT EXISTS target integer;

-- Existing installations may already have rpc_check_achievements(uuid)
-- with a different RETURNS signature. PostgreSQL does not allow changing
-- return type via CREATE OR REPLACE, so we drop first to keep this
-- migration idempotent and re-runnable.
DROP FUNCTION IF EXISTS public.rpc_check_achievements(uuid);

CREATE OR REPLACE FUNCTION public.rpc_check_achievements(p_user_id uuid)
RETURNS TABLE(newly_earned jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement RECORD;
  v_current_value INTEGER;
  v_newly_earned JSONB := '[]'::JSONB;
  v_achievement_json JSONB;
  v_user RECORD;
  v_pvp_wins INTEGER := 0;
  v_pvp_battles INTEGER := 0;
  v_items_purchased INTEGER := 0;
  v_assignments_completed INTEGER := 0;
  v_perfect_scores INTEGER := 0;
  v_early_submissions INTEGER := 0;
  v_correct_answers INTEGER := 0;
  v_account_age_days INTEGER := 0;
  v_is_clan_member BOOLEAN := FALSE;
  v_user_pvp_wins INTEGER := 0;
  v_user_pvp_score INTEGER := 0;
  v_user_correct_answers INTEGER := 0;
  v_user_clan_id uuid := NULL;
BEGIN
  SELECT *
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT '[]'::jsonb;
    RETURN;
  END IF;

  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM NOW() - COALESCE(v_user.created_at, NOW()))::INT);

  -- Optional/legacy columns may not exist in all environments.
  BEGIN
    EXECUTE 'SELECT COALESCE(pvp_wins, 0) FROM public.users WHERE id = $1'
    INTO v_user_pvp_wins
    USING p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_user_pvp_wins := 0;
  END;

  BEGIN
    EXECUTE 'SELECT COALESCE(pvp_score, 0) FROM public.users WHERE id = $1'
    INTO v_user_pvp_score
    USING p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_user_pvp_score := 0;
  END;

  BEGIN
    EXECUTE 'SELECT clan_id FROM public.users WHERE id = $1'
    INTO v_user_clan_id
    USING p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_user_clan_id := NULL;
  END;

  BEGIN
    EXECUTE 'SELECT COALESCE(correct_answers, 0) FROM public.users WHERE id = $1'
    INTO v_user_correct_answers
    USING p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_user_correct_answers := 0;
  END;

  SELECT COUNT(*)::INT
  INTO v_pvp_wins
  FROM public.activities
  WHERE actor_id = p_user_id
    AND kind = 'pvp_win';

  SELECT COUNT(*)::INT
  INTO v_pvp_battles
  FROM public.activities
  WHERE actor_id = p_user_id
    AND kind IN ('pvp_win', 'pvp_loss', 'pvp_blocked');

  SELECT COUNT(*)::INT
  INTO v_items_purchased
  FROM public.activities
  WHERE actor_id = p_user_id
    AND kind = 'shop_purchase';

  SELECT COUNT(*)::INT
  INTO v_assignments_completed
  FROM public.student_assignment_results
  WHERE student_id = p_user_id;

  SELECT COUNT(*)::INT
  INTO v_perfect_scores
  FROM public.student_assignment_results
  WHERE student_id = p_user_id
    AND accuracy = 100;

  SELECT COUNT(*)::INT
  INTO v_early_submissions
  FROM public.student_assignment_results sar
  JOIN public.assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = p_user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day';

  SELECT COUNT(*)::INT
  INTO v_correct_answers
  FROM public.question_attempts
  WHERE student_id = p_user_id
    AND is_correct = TRUE;

  SELECT EXISTS (
    SELECT 1
    FROM public.clan_members cm
    WHERE cm.user_id = p_user_id
  )
  INTO v_is_clan_member;

  FOR v_achievement IN SELECT * FROM public.achievements LOOP
    IF EXISTS (
      SELECT 1
      FROM public.user_achievements ua
      WHERE ua.user_id = p_user_id
        AND ua.achievement_id = v_achievement.id
        AND (ua.earned_at IS NOT NULL OR ua.unlocked_at IS NOT NULL)
    ) THEN
      CONTINUE;
    END IF;

    v_current_value := 0;

    CASE v_achievement.condition_type
      WHEN 'login_count' THEN
        v_current_value := 1;
      WHEN 'level' THEN
        v_current_value := COALESCE(v_user.level, 1);
      WHEN 'streak' THEN
        IF v_account_age_days >= COALESCE(v_achievement.condition_value, 0) THEN
          v_current_value := COALESCE(v_user.streak, 0);
        ELSE
          v_current_value := 0;
        END IF;
      WHEN 'pvp_wins', 'pvp_wins_count' THEN
        v_current_value := GREATEST(v_user_pvp_wins, v_pvp_wins);
      WHEN 'pvp_battles', 'pvp_matches', 'pvp_attacks' THEN
        v_current_value := v_pvp_battles;
      WHEN 'pvp_score' THEN
        v_current_value := v_user_pvp_score;
      WHEN 'coins_balance' THEN
        v_current_value := COALESCE(v_user.coins, 0);
      WHEN 'coins_earned', 'total_coins_earned' THEN
        v_current_value := COALESCE(v_user.coins, 0) + COALESCE((
          SELECT SUM(COALESCE((a.data->>'amount')::INT, (a.data->>'price')::INT, 0))
          FROM public.activities a
          WHERE a.actor_id = p_user_id
            AND a.kind = 'shop_purchase'
        ), 0);
      WHEN 'clan_member', 'clan_joined' THEN
        v_current_value := CASE WHEN v_is_clan_member OR v_user_clan_id IS NOT NULL THEN 1 ELSE 0 END;
      WHEN 'items_purchased' THEN
        v_current_value := v_items_purchased;
      WHEN 'assignments_completed' THEN
        v_current_value := v_assignments_completed;
      WHEN 'perfect_scores' THEN
        v_current_value := v_perfect_scores;
      WHEN 'early_submissions' THEN
        v_current_value := v_early_submissions;
      WHEN 'correct_answers' THEN
        v_current_value := GREATEST(v_user_correct_answers, v_correct_answers);
      WHEN 'total_xp' THEN
        v_current_value := COALESCE(v_user.xp, 0);
      WHEN 'quests_completed' THEN
        v_current_value := COALESCE((
          SELECT COUNT(*)::INT
          FROM public.activities a
          WHERE a.actor_id = p_user_id
            AND a.kind = 'quest_complete'
        ), 0);
      ELSE
        v_current_value := 0;
    END CASE;

    IF v_achievement.condition_value IS NOT NULL
       AND v_current_value >= v_achievement.condition_value THEN
      INSERT INTO public.user_achievements (user_id, achievement_id, earned_at, unlocked_at, progress, target)
      VALUES (
        p_user_id,
        v_achievement.id,
        NOW(),
        NOW(),
        v_current_value,
        v_achievement.condition_value
      )
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET
        earned_at = COALESCE(public.user_achievements.earned_at, NOW()),
        unlocked_at = COALESCE(public.user_achievements.unlocked_at, NOW()),
        progress = GREATEST(COALESCE(public.user_achievements.progress, 0), EXCLUDED.progress),
        target = COALESCE(public.user_achievements.target, EXCLUDED.target);

      v_achievement_json := jsonb_build_object(
        'id', v_achievement.id,
        'name', v_achievement.name,
        'description', v_achievement.description,
        'icon', v_achievement.icon,
        'category', v_achievement.category,
        'rarity', v_achievement.rarity,
        'reward_xp', COALESCE(v_achievement.reward_xp, 0),
        'reward_coins', COALESCE(v_achievement.reward_coins, 0)
      );

      v_newly_earned := v_newly_earned || v_achievement_json;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_newly_earned;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_check_achievements(uuid) TO authenticated;

DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT id FROM public.users LOOP
    PERFORM public.rpc_check_achievements(u.id);
  END LOOP;
END $$;
