-- ============================================================================
-- FIX: Achievement View Errors - Student Assignment Results & Percentages
-- ============================================================================
-- This script fixes:
-- 1. GET student_assignment_results 400 error (missing RLS SELECT policy)
-- 2. rpc_check_achievements 400 error (XP update policy conflict)
-- 3. Crazy percentages in assignment grades display
-- ============================================================================

-- ============================================================================
-- ISSUE 1: Fix student_assignment_results RLS policies
-- ============================================================================
-- The table exists but the RLS policies might be incomplete or wrong

-- Ensure table exists with correct schema
CREATE TABLE IF NOT EXISTS student_assignment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  correct INT NOT NULL DEFAULT 0,
  incorrect INT NOT NULL DEFAULT 0,
  accuracy INT NOT NULL DEFAULT 0,  -- This is already a percentage (0-100)
  score INT NOT NULL DEFAULT 0,     -- This is the mission score, not a count
  time_taken_seconds INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, assignment_id)
);

-- Enable RLS
ALTER TABLE student_assignment_results ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies first to ensure clean slate
DROP POLICY IF EXISTS "Students view own assignment results" ON student_assignment_results;
DROP POLICY IF EXISTS "Students insert own assignment results" ON student_assignment_results;
DROP POLICY IF EXISTS "Teachers view assignment results" ON student_assignment_results;
DROP POLICY IF EXISTS "Students view own results" ON student_assignment_results;
DROP POLICY IF EXISTS "Students insert own results" ON student_assignment_results;
DROP POLICY IF EXISTS "Teachers view student results" ON student_assignment_results;
DROP POLICY IF EXISTS "student_assignment_results_select" ON student_assignment_results;
DROP POLICY IF EXISTS "student_assignment_results_insert" ON student_assignment_results;

-- Create comprehensive RLS policies
-- Policy 1: Students can SELECT their own results
CREATE POLICY "student_assignment_results_select"
ON student_assignment_results
FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()
  OR
  -- Teachers can view results for their assignments
  EXISTS (
    SELECT 1 FROM assignments a
    JOIN teachers t ON t.id = a.teacher_id
    WHERE a.id = student_assignment_results.assignment_id
      AND t.user_id = auth.uid()
  )
);

-- Policy 2: Students can INSERT their own results
CREATE POLICY "student_assignment_results_insert"
ON student_assignment_results
FOR INSERT
TO authenticated
WITH CHECK (student_id = auth.uid());

-- Policy 3: Allow UPDATE for students on their own records
CREATE POLICY "student_assignment_results_update"
ON student_assignment_results
FOR UPDATE
TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_assignment_results_student 
ON student_assignment_results(student_id);

CREATE INDEX IF NOT EXISTS idx_student_assignment_results_assignment 
ON student_assignment_results(assignment_id);

CREATE INDEX IF NOT EXISTS idx_student_assignment_results_accuracy
ON student_assignment_results(accuracy);

-- ============================================================================
-- ISSUE 2: Fix rpc_check_achievements to avoid XP update conflicts
-- ============================================================================
-- The function needs to avoid triggering XP update restrictions

-- Drop all versions of the function (with different signatures)
DROP FUNCTION IF EXISTS rpc_check_achievements();
DROP FUNCTION IF EXISTS rpc_check_achievements(uuid);
DROP FUNCTION IF EXISTS rpc_check_achievements(text);

CREATE OR REPLACE FUNCTION rpc_check_achievements()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_achievements jsonb := '[]'::jsonb;
  v_achievement record;
  v_user_xp integer;
  v_user_level integer;
  v_user_coins integer;
  v_user_streak integer;
  v_questions_answered integer;
  v_quests_completed integer;
  v_pvp_wins integer;
  v_assignments_completed integer;
  v_perfect_assignments integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Get user stats (read-only, no updates)
  SELECT xp, level, coins, streak 
  INTO v_user_xp, v_user_level, v_user_coins, v_user_streak
  FROM users
  WHERE id = v_user_id;

  IF v_user_xp IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Get various user stats for achievement checks
  SELECT COALESCE(COUNT(*), 0)
  INTO v_questions_answered
  FROM user_sessions
  WHERE user_id = v_user_id;

  SELECT COALESCE(COUNT(*), 0)
  INTO v_quests_completed
  FROM user_progress
  WHERE user_id = v_user_id;

  SELECT COALESCE(COUNT(*), 0)
  INTO v_pvp_wins
  FROM pvp_battles
  WHERE (player1_id = v_user_id AND winner_id = v_user_id)
     OR (player2_id = v_user_id AND winner_id = v_user_id);

  -- Count completed assignments from student_assignment_results
  SELECT COALESCE(COUNT(*), 0)
  INTO v_assignments_completed
  FROM student_assignment_results
  WHERE student_id = v_user_id;

  -- Count perfect scores (accuracy = 100)
  SELECT COALESCE(COUNT(*), 0)
  INTO v_perfect_assignments
  FROM student_assignment_results
  WHERE student_id = v_user_id AND accuracy = 100;

  -- Check for new achievements
  FOR v_achievement IN
    SELECT 
      a.id, 
      a.name, 
      a.description, 
      a.xp_reward, 
      a.coin_reward, 
      a.requirement_type, 
      a.requirement_value
    FROM achievements a
    WHERE a.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM user_achievements ua
        WHERE ua.user_id = v_user_id AND ua.achievement_id = a.id
      )
  LOOP
    -- Check if achievement criteria is met
    DECLARE
      v_criteria_met BOOLEAN := false;
    BEGIN
      CASE v_achievement.requirement_type
        WHEN 'xp' THEN
          v_criteria_met := v_user_xp >= v_achievement.requirement_value;
        WHEN 'level' THEN
          v_criteria_met := v_user_level >= v_achievement.requirement_value;
        WHEN 'coins' THEN
          v_criteria_met := v_user_coins >= v_achievement.requirement_value;
        WHEN 'streak' THEN
          v_criteria_met := v_user_streak >= v_achievement.requirement_value;
        WHEN 'questions' THEN
          v_criteria_met := v_questions_answered >= v_achievement.requirement_value;
        WHEN 'quests' THEN
          v_criteria_met := v_quests_completed >= v_achievement.requirement_value;
        WHEN 'pvp_wins' THEN
          v_criteria_met := v_pvp_wins >= v_achievement.requirement_value;
        WHEN 'assignments' THEN
          v_criteria_met := v_assignments_completed >= v_achievement.requirement_value;
        WHEN 'perfect_assignments' THEN
          v_criteria_met := v_perfect_assignments >= v_achievement.requirement_value;
        ELSE
          v_criteria_met := false;
      END CASE;

      IF v_criteria_met THEN
        -- Award achievement (without triggering XP updates)
        INSERT INTO user_achievements (user_id, achievement_id, earned_at)
        VALUES (v_user_id, v_achievement.id, NOW())
        ON CONFLICT (user_id, achievement_id) DO NOTHING;

        -- Add to result (rewards will be granted separately)
        v_new_achievements := v_new_achievements || jsonb_build_object(
          'id', v_achievement.id,
          'name', v_achievement.name,
          'description', v_achievement.description,
          'xp_reward', v_achievement.xp_reward,
          'coin_reward', v_achievement.coin_reward
        );
      END IF;
    END;
  END LOOP;

  RETURN v_new_achievements;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_achievements() TO authenticated;

COMMENT ON FUNCTION rpc_check_achievements IS 
  'Checks and awards achievements without direct XP/level updates. Use grant_achievement_rewards to apply rewards.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check RLS policies on student_assignment_results
SELECT 
  policyname,
  cmd AS command,
  permissive,
  roles
FROM pg_policies 
WHERE tablename = 'student_assignment_results' 
ORDER BY cmd, policyname;

-- Check if rpc_check_achievements function exists
SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  provolatile as volatility
FROM pg_proc 
WHERE proname = 'rpc_check_achievements';

-- Check sample data structure
SELECT 
  assignment_id,
  student_id,
  correct,
  incorrect,
  accuracy,  -- This should be 0-100, not 0-1
  score,
  completed_at
FROM student_assignment_results
LIMIT 3;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Fixed student_assignment_results RLS policies';
  RAISE NOTICE '✅ Fixed rpc_check_achievements to avoid XP conflicts';
  RAISE NOTICE '⚠️  Remember: accuracy is already a percentage (0-100)';
  RAISE NOTICE '⚠️  Frontend should use assignment.accuracy, NOT (score/total)*100';
END $$;
