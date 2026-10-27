-- Restore XP rewards for assignment achievements.
--
-- Incident 2026-10-25 04:28 UTC: check_assignment_achievements() failed with
-- "Direct XP/level updates are not allowed. Use RPCs." The 2026-10-15
-- redefinition (classroom_async_evidence_and_incident_repairs) updates
-- users.xp without enabling the guarded write that trg_block_direct_xp_level
-- requires, so every new assignment achievement has been rolled back since
-- then (last successful award: 2026-10-15 09:07 UTC).
--
-- Fix: enable the transaction-local XP write, as the other reward RPCs do.
-- Everything else is unchanged: the caller is still forced to auth.uid(), an
-- achievement is still awarded at most once, and the level is still recomputed
-- by trg_sync_level_with_xp. Students whose achievement was blocked receive it
-- the next time they submit an assignment, because the check re-evaluates all
-- assignment achievements they qualify for.
CREATE OR REPLACE FUNCTION public.check_assignment_achievements(p_user_id uuid)
 RETURNS TABLE(achievement_id text, achievement_name text, achievement_icon text, xp_reward integer, coin_reward integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_award_count integer;
  v_assignments_completed INT;
  v_perfect_scores INT;
  v_early_submissions INT;
  v_achievement RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  p_user_id := auth.uid();  -- [Patch F] force self-only

  -- Allow the guarded XP write for this server-authoritative reward only
  -- (transaction-local, same as the other reward RPCs).
  PERFORM set_config('app.allow_xp_level_write', '1', true);

  -- Count assignments
  SELECT COUNT(*) INTO v_assignments_completed
  FROM student_assignment_results WHERE student_id = p_user_id;

  SELECT COUNT(*) INTO v_perfect_scores
  FROM student_assignment_results WHERE student_id = p_user_id AND accuracy = 100;

  SELECT COUNT(*) INTO v_early_submissions
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = p_user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day';

  -- Check each assignment achievement
  FOR v_achievement IN
    SELECT * FROM achievements
    WHERE category = 'assignments'
  LOOP
    -- Skip if earned
    IF EXISTS (
      SELECT 1 FROM user_achievements
      WHERE user_id = p_user_id AND user_achievements.achievement_id = v_achievement.id
      AND earned_at IS NOT NULL
    ) THEN
      CONTINUE;
    END IF;

    -- Check condition
    IF (v_achievement.condition_type = 'assignments_completed' AND v_assignments_completed >= v_achievement.condition_value) OR
       (v_achievement.condition_type = 'perfect_scores' AND v_perfect_scores >= v_achievement.condition_value) OR
       (v_achievement.condition_type = 'early_submissions' AND v_early_submissions >= v_achievement.condition_value) THEN

      -- Award achievement
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
      VALUES (p_user_id, v_achievement.id, NOW(), v_achievement.condition_value, v_achievement.condition_value)
      ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key
      DO UPDATE SET earned_at = NOW() WHERE user_achievements.earned_at IS NULL;
      GET DIAGNOSTICS v_new_award_count = ROW_COUNT;
      IF v_new_award_count = 0 THEN CONTINUE; END IF;

      -- Award rewards
      UPDATE users
      SET xp = xp + COALESCE(v_achievement.reward_xp, 0),
          coins = coins + COALESCE(v_achievement.reward_coins, 0)
      WHERE id = p_user_id;

      RETURN QUERY SELECT
        v_achievement.id::TEXT,
        v_achievement.name::TEXT,
        v_achievement.icon::TEXT,
        COALESCE(v_achievement.reward_xp, 0)::INT,
        COALESCE(v_achievement.reward_coins, 0)::INT;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_assignment_achievements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_assignment_achievements(uuid) TO authenticated, service_role;
