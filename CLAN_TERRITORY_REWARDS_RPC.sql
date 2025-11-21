-- ============================================================
-- Clan Territory Rewards RPC
-- ============================================================
-- This function credits coins, XP, and gems to students who
-- participated in a clan territory battle and earned rewards.
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
  v_user_record users;
  v_result jsonb;
BEGIN
  -- Ensure the caller is the student
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Student ID is required';
  END IF;

  -- Get current user data
  SELECT * INTO v_user_record
  FROM users
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  -- Credit rewards
  UPDATE users
  SET
    coins = COALESCE(coins, 0) + p_coins,
    xp = COALESCE(xp, 0) + p_xp,
    gemstones = COALESCE(gemstones, 0) + p_gems,
    updated_at = NOW()
  WHERE id = p_student_id;

  -- Build result
  v_result := jsonb_build_object(
    'student_id', p_student_id,
    'coins_awarded', p_coins,
    'xp_awarded', p_xp,
    'gems_awarded', p_gems,
    'new_coins', COALESCE(v_user_record.coins, 0) + p_coins,
    'new_xp', COALESCE(v_user_record.xp, 0) + p_xp,
    'new_gems', COALESCE(v_user_record.gemstones, 0) + p_gems,
    'battle_score', p_battle_score,
    'questions_correct', p_questions_correct,
    'questions_answered', p_questions_answered
  );

  -- Optional: Log the battle participation (create table if you want history)
  -- INSERT INTO clan_territory_battle_log (
  --   student_id, room_id, player_id, coins, xp, gems, 
  --   battle_score, questions_correct, questions_answered, claimed_at
  -- ) VALUES (
  --   p_student_id, p_room_id, p_player_id, p_coins, p_xp, p_gems,
  --   p_battle_score, p_questions_correct, p_questions_answered, NOW()
  -- );

  RETURN v_result;
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
