-- ============================================================
-- Clan Territory Rewards RPC
-- ============================================================
-- This function credits coins, XP, and gems to students who
-- participated in a clan territory battle and earned rewards.
--
-- IMPORTANT: This function now internally calls rpc_apply_reward_delta
-- to avoid the "Direct XP/level updates are not allowed" trigger error.
-- ============================================================

CREATE OR REPLACE FUNCTION claim_clan_territory_rewards(
  p_student_id uuid,
  p_room_id text,
  p_player_id text,
  p_coins integer,
  p_xp integer,
  p_gems integer,
  p_battle_score integer,
  p_questions_correct integer,
  p_questions_answered integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_reward_result jsonb;
  v_previous_level int;
BEGIN
  -- Ensure the caller is the student (prevent spoofing another student's ID)
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Student ID is required';
  END IF;

  IF v_caller_id IS NULL OR v_caller_id != p_student_id THEN
    RAISE EXCEPTION 'You can only claim rewards for yourself';
  END IF;

  -- Get previous level for the response
  SELECT COALESCE(level, 1) INTO v_previous_level
  FROM users WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  -- Delegate to rpc_apply_reward_delta which is the approved way to
  -- update XP/coins/gems without triggering the "Direct XP/level updates
  -- are not allowed" validation trigger on the users table.
  SELECT rpc_apply_reward_delta(
    p_xp_delta := COALESCE(p_xp, 0),
    p_coins_delta := COALESCE(p_coins, 0),
    p_gemstones_delta := COALESCE(p_gems, 0),
    p_apply_level_milestone := true
  ) INTO v_reward_result;

  -- Build result in the expected shape
  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'coins_awarded', p_coins,
    'xp_awarded', p_xp,
    'gems_awarded', p_gems,
    'new_coins', COALESCE((v_reward_result->'profile'->>'coins')::int, 0),
    'new_xp', COALESCE((v_reward_result->'profile'->>'xp')::int, 0),
    'new_gems', COALESCE((v_reward_result->'profile'->>'gemstones')::int, 0),
    'new_level', COALESCE((v_reward_result->'profile'->>'level')::int, 1),
    'previous_level', v_previous_level,
    'battle_score', p_battle_score,
    'questions_correct', p_questions_correct,
    'questions_answered', p_questions_answered
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION claim_clan_territory_rewards(uuid, text, text, integer, integer, integer, integer, integer, integer) TO authenticated;

-- ============================================================
-- Optional: Create audit/log table for battle history
-- ============================================================
-- Uncomment below if you want to track all battle participations

-- CREATE TABLE IF NOT EXISTS clan_territory_battle_log (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   student_id uuid REFERENCES users(id) ON DELETE CASCADE,
--   room_id text NOT NULL,
--   player_id text NOT NULL,
--   coins integer NOT NULL DEFAULT 0,
--   xp integer NOT NULL DEFAULT 0,
--   gems integer NOT NULL DEFAULT 0,
--   battle_score integer NOT NULL DEFAULT 0,
--   questions_correct integer NOT NULL DEFAULT 0,
--   questions_answered integer NOT NULL DEFAULT 0,
--   claimed_at timestamptz NOT NULL DEFAULT NOW()
-- );
-- 
-- CREATE INDEX IF NOT EXISTS idx_clan_territory_log_student ON clan_territory_battle_log(student_id);
-- CREATE INDEX IF NOT EXISTS idx_clan_territory_log_room ON clan_territory_battle_log(room_id);
-- 
-- ALTER TABLE clan_territory_battle_log ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY "Students can view their own battle history"
-- ON clan_territory_battle_log
-- FOR SELECT
-- USING (student_id = auth.uid());
