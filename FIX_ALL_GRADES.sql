-- ============================================
-- FIX: Allow All Grades (6-12) During Signup
-- ============================================
-- This fixes the grade validation to accept grades 6-12 instead of just 8-9
-- Run this in Supabase SQL Editor

-- ============================================
-- 0. FIX THE DATABASE CONSTRAINT (This is the main issue!)
-- ============================================
-- Drop the old constraint that only allows 8A-9C
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_batch_check;

-- Add new constraint that allows all batches 6A-12C plus N/A
ALTER TABLE users ADD CONSTRAINT users_batch_check 
  CHECK (batch IS NULL OR batch IN (
    '6A', '6B', '6C',
    '7A', '7B', '7C',
    '8A', '8B', '8C',
    '9A', '9B', '9C',
    '10A', '10B', '10C',
    '11A', '11B', '11C',
    '12A', '12B', '12C',
    'N/A'
  ));

-- Also fix grade constraint if it exists
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_grade_check;
ALTER TABLE users ADD CONSTRAINT users_grade_check 
  CHECK (grade IS NULL OR (grade >= 6 AND grade <= 12));

-- ============================================
-- 1. Fix rpc_leaderboard_grade - Accept grades 6-12
-- ============================================
DROP FUNCTION IF EXISTS rpc_leaderboard_grade(int, int) CASCADE;

CREATE FUNCTION rpc_leaderboard_grade(p_grade INT, p_limit INT)
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
  -- Accept grades 6-12
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
         COALESCE(u.grade::INT, p_grade)
  FROM users u
  WHERE u.grade::TEXT = p_grade::TEXT
    AND COALESCE(u.is_banned, FALSE) = FALSE
    AND COALESCE(u.is_admin, FALSE) = FALSE
    AND COALESCE(u.role, 'student') = 'student'
    AND COALESCE(u.admin_visible, TRUE) = TRUE
  ORDER BY u.xp DESC, u.coins DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

-- ============================================
-- 2. Fix rpc_leaderboard_batch - Accept all batches 6A-12C
-- ============================================
DROP FUNCTION IF EXISTS rpc_leaderboard_batch(text, int) CASCADE;

CREATE FUNCTION rpc_leaderboard_batch(p_batch TEXT, p_limit INT)
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
  -- Accept all valid batches: 6A-12C, plus N/A
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
             WHEN u.grade::TEXT = '' THEN 0
             WHEN u.grade::TEXT ~ '^\d+$' THEN u.grade::INT
             ELSE 0
           END,
           0
         )
  FROM users u
  WHERE u.batch = p_batch
    AND COALESCE(u.is_banned, FALSE) = FALSE
    AND COALESCE(u.is_admin, FALSE) = FALSE
    AND COALESCE(u.role, 'student') = 'student'
    AND COALESCE(u.admin_visible, TRUE) = TRUE
  ORDER BY u.xp DESC, u.coins DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

-- ============================================
-- 3. Fix rpc_admin_set_user_academics - Accept grades 6-12
-- ============================================
DROP FUNCTION IF EXISTS rpc_admin_set_user_academics(uuid, int, text) CASCADE;

CREATE FUNCTION rpc_admin_set_user_academics(p_user_id UUID, p_grade INT, p_batch TEXT)
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

  -- Accept grades 6-12 (or NULL to clear)
  IF v_grade IS NOT NULL AND (v_grade < 6 OR v_grade > 12) THEN
    RAISE EXCEPTION 'invalid_grade';
  END IF;

  -- Accept all valid batches
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

  -- Validate batch matches grade (e.g., 8A requires grade 8)
  IF v_batch IS NOT NULL AND v_batch <> 'N/A' AND v_grade IS NOT NULL THEN
    -- Extract grade from batch (handles both single and double digit grades)
    IF v_batch ~ '^\d+' THEN
      IF (regexp_replace(v_batch, '[A-Z]$', ''))::INT <> v_grade THEN
        RAISE EXCEPTION 'batch_grade_mismatch';
      END IF;
    END IF;
  END IF;

  -- Clear batch if grade is null
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
    VALUES ('rpc_admin_set_user_academics', 'info', 'academics_updated', v_actor, 
            JSON_BUILD_OBJECT('target', p_user_id, 'grade', v_grade, 'batch', v_batch));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY SELECT v_row.id, v_row.grade::INT, v_row.batch;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO rpc_event_log(function_name, log_level, message, user_id, context)
    VALUES ('rpc_admin_set_user_academics', 'error', SQLERRM, v_actor, 
            JSON_BUILD_OBJECT('target', p_user_id, 'grade', p_grade, 'batch', p_batch));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE;
END;
$$;

-- ============================================
-- 4. Fix rpc_questions_next - Accept all grades 6-12
-- ============================================
DROP FUNCTION IF EXISTS rpc_questions_next(int) CASCADE;

CREATE FUNCTION rpc_questions_next(p_grade INT)
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

  -- Accept grades 6-12
  IF NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = v_user_id
      AND COALESCE(u.is_banned, FALSE) = FALSE
      AND COALESCE(u.grade::TEXT, '') = p_grade::TEXT
  ) THEN
    RAISE EXCEPTION 'grade_mismatch';
  END IF;

  -- Try to get a question not recently answered
  SELECT * INTO v_question
  FROM mcq_questions q
  WHERE q.grade::TEXT = p_grade::TEXT
    AND q.active = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM attempts a
      WHERE a.user_id = v_user_id
        AND a.question_id = q.id
        AND a.created_at > NOW() - INTERVAL '24 hours'
    )
  ORDER BY RANDOM()
  LIMIT 1;

  -- If all answered recently, get any random one
  IF NOT FOUND THEN
    SELECT * INTO v_question
    FROM mcq_questions q
    WHERE q.grade::TEXT = p_grade::TEXT
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
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE;
END;
$$;

-- ============================================
-- Force schema reload
-- ============================================
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Verification
-- ============================================
SELECT '✅ All grade restrictions updated to accept grades 6-12!' AS status;

SELECT proname, pg_get_function_arguments(oid) AS arguments
FROM pg_proc 
WHERE proname IN ('rpc_leaderboard_grade', 'rpc_leaderboard_batch', 'rpc_admin_set_user_academics', 'rpc_questions_next')
ORDER BY proname;
