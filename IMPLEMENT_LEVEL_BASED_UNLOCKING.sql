-- ============================================================
-- LEVEL-BASED QUESTION UNLOCKING SYSTEM
-- ============================================================
-- Implements tier-based question progression where:
-- - Questions are grouped into tiers
-- - Players unlock tiers as they level up
-- - Each question only rewards XP/coins ONCE per player
-- - Higher difficulties unlock at specific levels
-- ============================================================

-- ============================================================
-- STEP 1: Add tier_level support to question tables
-- ============================================================

-- For mcq_questions (practice mode questions)
ALTER TABLE mcq_questions
ADD COLUMN IF NOT EXISTS tier_level INTEGER DEFAULT 1;

-- Ensure created_at exists (it already does in your schema)
-- Ensure difficulty column exists and is properly formatted
ALTER TABLE mcq_questions
ALTER COLUMN difficulty TYPE TEXT;

-- Add check constraint for difficulty if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'mcq_questions'
    AND constraint_name = 'mcq_questions_difficulty_check'
  ) THEN
    ALTER TABLE mcq_questions 
    ADD CONSTRAINT mcq_questions_difficulty_check 
    CHECK (difficulty IN ('easy', 'med', 'hard'));
  END IF;
END $$;

-- For questions (teacher questions)
ALTER TABLE questions
ADD COLUMN IF NOT EXISTS tier_level INTEGER DEFAULT 1;

-- Ensure difficulty is consistent (already has CHECK constraint)
-- questions table already has: difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard'))

-- ============================================================
-- STEP 2: Assign tier_level to ALL existing questions
-- ============================================================
-- Logic: Group by subject + difficulty, order by created_at
-- Assign tiers in waves of 20 questions per tier
-- ============================================================

-- For mcq_questions (practice mode)
-- Constants: 20 questions per tier
WITH numbered AS (
  SELECT
    id,
    subject,
    difficulty,
    grade,
    ROW_NUMBER() OVER (
      PARTITION BY subject, difficulty, grade
      ORDER BY created_at, id
    ) AS rn
  FROM mcq_questions
)
UPDATE mcq_questions q
SET tier_level = 1 + ((n.rn - 1) / 20)  -- 20 questions per tier
FROM numbered n
WHERE q.id = n.id;

-- For questions (teacher questions)
-- Constants: 15 questions per tier (teachers create fewer questions)
WITH numbered AS (
  SELECT
    id,
    subject,
    difficulty,
    ROW_NUMBER() OVER (
      PARTITION BY subject, difficulty
      ORDER BY created_at, id
    ) AS rn
  FROM questions
)
UPDATE questions q
SET tier_level = 1 + ((n.rn - 1) / 15)  -- 15 questions per tier
FROM numbered n
WHERE q.id = n.id;

-- ============================================================
-- STEP 3: Create trigger to auto-assign tier_level to NEW questions
-- ============================================================

-- Function for mcq_questions
CREATE OR REPLACE FUNCTION auto_assign_tier_mcq()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_count INTEGER;
BEGIN
  -- Count existing questions for this subject + difficulty + grade
  SELECT COUNT(*)
  INTO v_existing_count
  FROM mcq_questions
  WHERE subject = NEW.subject
    AND difficulty = NEW.difficulty
    AND grade = NEW.grade;
  
  -- Assign tier based on count (20 questions per tier)
  NEW.tier_level := 1 + (v_existing_count / 20);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for mcq_questions
DROP TRIGGER IF EXISTS trigger_auto_assign_tier_mcq ON mcq_questions;
CREATE TRIGGER trigger_auto_assign_tier_mcq
  BEFORE INSERT ON mcq_questions
  FOR EACH ROW
  WHEN (NEW.tier_level IS NULL OR NEW.tier_level = 1)
  EXECUTE FUNCTION auto_assign_tier_mcq();

-- Function for questions (teacher questions)
CREATE OR REPLACE FUNCTION auto_assign_tier_teacher_questions()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_count INTEGER;
BEGIN
  -- Count existing questions for this subject + difficulty
  SELECT COUNT(*)
  INTO v_existing_count
  FROM questions
  WHERE subject = NEW.subject
    AND difficulty = NEW.difficulty;
  
  -- Assign tier based on count (15 questions per tier)
  NEW.tier_level := 1 + (v_existing_count / 15);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for questions
DROP TRIGGER IF EXISTS trigger_auto_assign_tier_questions ON questions;
CREATE TRIGGER trigger_auto_assign_tier_questions
  BEFORE INSERT ON questions
  FOR EACH ROW
  WHEN (NEW.tier_level IS NULL OR NEW.tier_level = 1)
  EXECUTE FUNCTION auto_assign_tier_teacher_questions();

-- ============================================================
-- STEP 4: Ensure users table has level column
-- ============================================================
-- Already exists in your schema: level INTEGER DEFAULT 1

-- Verify it's properly set up
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users'
    AND column_name = 'level'
  ) THEN
    ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1;
  END IF;
END $$;

-- Ensure all users have at least level 1
UPDATE users SET level = 1 WHERE level IS NULL OR level < 1;

-- ============================================================
-- STEP 5: Add rewarded tracking to attempts tables
-- ============================================================

-- For attempts table (mcq_questions attempts)
-- This table currently only tracks is_correct
-- We need to know if this attempt gave rewards
ALTER TABLE attempts
ADD COLUMN IF NOT EXISTS rewarded BOOLEAN DEFAULT false;

-- Backfill: Mark all FIRST correct attempts as rewarded
-- (assumes existing correct attempts gave rewards)
WITH first_correct AS (
  SELECT DISTINCT ON (user_id, question_id)
    id
  FROM attempts
  WHERE is_correct = true
  ORDER BY user_id, question_id, created_at ASC
)
UPDATE attempts a
SET rewarded = true
FROM first_correct fc
WHERE a.id = fc.id
  AND a.is_correct = true
  AND a.rewarded = false;

-- For question_attempts (teacher questions)
-- This table already has a unique constraint on (student_id, question_id) WHERE is_correct = true
-- This means there can only be ONE correct attempt per student per question
-- We can treat is_correct = true as "rewarded"
-- But let's add explicit column for clarity
ALTER TABLE question_attempts
ADD COLUMN IF NOT EXISTS rewarded BOOLEAN DEFAULT false;

-- Backfill: All correct attempts are rewarded
UPDATE question_attempts
SET rewarded = true
WHERE is_correct = true AND rewarded = false;

-- ============================================================
-- STEP 6: Create RPC to fetch unlocked, unrewarded questions
-- ============================================================

-- ============================================
-- RPC: get_unlocked_mcq_questions
-- ============================================
-- Fetches practice mode questions (mcq_questions) that:
-- 1. Match the player's grade
-- 2. Are at an unlocked tier (based on player level)
-- 3. Match the requested difficulty (if difficulty is unlocked)
-- 4. Have NOT been rewarded yet for this player
-- ============================================

CREATE OR REPLACE FUNCTION get_unlocked_mcq_questions(
  p_subject TEXT,
  p_difficulty TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  subject TEXT,
  grade SMALLINT,
  difficulty TEXT,
  stem TEXT,
  opt1 TEXT,
  opt2 TEXT,
  opt3 TEXT,
  opt4 TEXT,
  correct SMALLINT,
  reward_xp INTEGER,
  reward_coins INTEGER,
  tier_level INTEGER
) 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_player_level INTEGER;
  v_player_grade SMALLINT;
  v_max_tier INTEGER;
  v_difficulty_allowed BOOLEAN;
BEGIN
  -- Get current authenticated user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Get player level and grade
  SELECT u.level, u.grade
  INTO v_player_level, v_player_grade
  FROM users u
  WHERE u.id = v_user_id;
  
  IF v_player_level IS NULL THEN
    RAISE EXCEPTION 'Player not found';
  END IF;
  
  -- Calculate max unlocked tier: max_tier = ceil(level / 2) = (level + 1) / 2
  v_max_tier := (v_player_level + 1) / 2;
  
  -- Check if difficulty is unlocked
  v_difficulty_allowed := CASE p_difficulty
    WHEN 'easy' THEN v_player_level >= 1
    WHEN 'med' THEN v_player_level >= 3
    WHEN 'hard' THEN v_player_level >= 6
    ELSE false
  END;
  
  IF NOT v_difficulty_allowed THEN
    -- Return empty set if difficulty is locked
    RETURN;
  END IF;
  
  -- Return questions that:
  -- 1. Match subject and difficulty
  -- 2. Match player's grade
  -- 3. Are in unlocked tier
  -- 4. Have NOT been rewarded yet (no rewarded attempt)
  -- 5. Are active
  RETURN QUERY
  SELECT
    q.id,
    q.subject,
    q.grade,
    q.difficulty,
    q.stem,
    q.opt1,
    q.opt2,
    q.opt3,
    q.opt4,
    q.correct,
    q.reward_xp,
    q.reward_coins,
    q.tier_level
  FROM mcq_questions q
  WHERE q.subject = p_subject
    AND q.difficulty = p_difficulty
    AND q.grade = v_player_grade
    AND q.tier_level <= v_max_tier
    AND q.active = true
    AND NOT EXISTS (
      SELECT 1
      FROM attempts a
      WHERE a.user_id = v_user_id
        AND a.question_id = q.id
        AND a.rewarded = true
    )
  ORDER BY RANDOM()
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RPC: get_unlocked_teacher_questions
-- ============================================
-- Fetches teacher questions that:
-- 1. Are public or created by accessible teachers
-- 2. Are at an unlocked tier (based on player level)
-- 3. Match the requested difficulty (if difficulty is unlocked)
-- 4. Have NOT been rewarded yet for this player
-- ============================================

CREATE OR REPLACE FUNCTION get_unlocked_teacher_questions(
  p_subject TEXT,
  p_difficulty TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  subject TEXT,
  topic TEXT,
  difficulty TEXT,
  question_text TEXT,
  question_type TEXT,
  options JSONB,
  time_limit INTEGER,
  points INTEGER,
  tier_level INTEGER
) 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_player_level INTEGER;
  v_max_tier INTEGER;
  v_difficulty_allowed BOOLEAN;
  v_normalized_difficulty TEXT;
BEGIN
  -- Get current authenticated user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Get player level
  SELECT u.level
  INTO v_player_level
  FROM users u
  WHERE u.id = v_user_id;
  
  IF v_player_level IS NULL THEN
    RAISE EXCEPTION 'Player not found';
  END IF;
  
  -- Calculate max unlocked tier
  v_max_tier := (v_player_level + 1) / 2;
  
  -- Normalize difficulty ('med' -> 'medium')
  v_normalized_difficulty := CASE p_difficulty
    WHEN 'med' THEN 'medium'
    ELSE p_difficulty
  END;
  
  -- Check if difficulty is unlocked
  v_difficulty_allowed := CASE v_normalized_difficulty
    WHEN 'easy' THEN v_player_level >= 1
    WHEN 'medium' THEN v_player_level >= 3
    WHEN 'hard' THEN v_player_level >= 6
    ELSE false
  END;
  
  IF NOT v_difficulty_allowed THEN
    RETURN;
  END IF;
  
  -- Return questions that:
  -- 1. Match subject and difficulty
  -- 2. Are in unlocked tier
  -- 3. Are public and active
  -- 4. Have NOT been rewarded yet (no correct attempt)
  RETURN QUERY
  SELECT
    q.id,
    q.subject,
    q.topic,
    q.difficulty,
    q.question_text,
    q.question_type,
    q.options,
    q.time_limit,
    q.points,
    q.tier_level
  FROM questions q
  WHERE q.subject = p_subject
    AND q.difficulty = v_normalized_difficulty
    AND q.tier_level <= v_max_tier
    AND q.is_public = true
    AND q.is_active = true
    AND NOT EXISTS (
      SELECT 1
      FROM question_attempts qa
      WHERE qa.student_id = v_user_id
        AND qa.question_id = q.id
        AND qa.is_correct = true
    )
  ORDER BY RANDOM()
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RPC: get_player_unlock_status
-- ============================================
-- Returns info about what the player has unlocked
-- ============================================

CREATE OR REPLACE FUNCTION get_player_unlock_status()
RETURNS TABLE (
  player_level INTEGER,
  max_tier INTEGER,
  easy_unlocked BOOLEAN,
  medium_unlocked BOOLEAN,
  hard_unlocked BOOLEAN
) 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_level INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  SELECT u.level
  INTO v_level
  FROM users u
  WHERE u.id = v_user_id;
  
  RETURN QUERY
  SELECT
    v_level AS player_level,
    (v_level + 1) / 2 AS max_tier,
    v_level >= 1 AS easy_unlocked,
    v_level >= 3 AS medium_unlocked,
    v_level >= 6 AS hard_unlocked;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 7: Create helper RPC to count available questions
-- ============================================================

CREATE OR REPLACE FUNCTION count_unlocked_questions(
  p_subject TEXT,
  p_difficulty TEXT
)
RETURNS TABLE (
  total_questions INTEGER,
  rewarded_questions INTEGER,
  new_questions_left INTEGER
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_player_level INTEGER;
  v_player_grade SMALLINT;
  v_max_tier INTEGER;
  v_difficulty_allowed BOOLEAN;
  v_normalized_difficulty TEXT;
  v_total INTEGER;
  v_rewarded INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  SELECT u.level, u.grade
  INTO v_player_level, v_player_grade
  FROM users u
  WHERE u.id = v_user_id;
  
  v_max_tier := (v_player_level + 1) / 2;
  
  -- Normalize difficulty
  v_normalized_difficulty := CASE p_difficulty
    WHEN 'med' THEN 'medium'
    WHEN 'medium' THEN 'medium'
    ELSE p_difficulty
  END;
  
  -- Check if difficulty is unlocked
  v_difficulty_allowed := CASE v_normalized_difficulty
    WHEN 'easy' THEN v_player_level >= 1
    WHEN 'medium' THEN v_player_level >= 3
    WHEN 'hard' THEN v_player_level >= 6
    ELSE false
  END;
  
  IF NOT v_difficulty_allowed THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;
  
  -- Count from mcq_questions
  SELECT COUNT(*)
  INTO v_total
  FROM mcq_questions q
  WHERE q.subject = p_subject
    AND q.difficulty = CASE v_normalized_difficulty WHEN 'medium' THEN 'med' ELSE v_normalized_difficulty END
    AND q.grade = v_player_grade
    AND q.tier_level <= v_max_tier
    AND q.active = true;
  
  -- Count rewarded
  SELECT COUNT(DISTINCT a.question_id)
  INTO v_rewarded
  FROM attempts a
  INNER JOIN mcq_questions q ON q.id = a.question_id
  WHERE a.user_id = v_user_id
    AND a.rewarded = true
    AND q.subject = p_subject
    AND q.difficulty = CASE v_normalized_difficulty WHEN 'medium' THEN 'med' ELSE v_normalized_difficulty END
    AND q.grade = v_player_grade
    AND q.tier_level <= v_max_tier;
  
  RETURN QUERY
  SELECT
    v_total AS total_questions,
    v_rewarded AS rewarded_questions,
    GREATEST(0, v_total - v_rewarded) AS new_questions_left;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 8: Update attempt insertion logic
-- ============================================================

-- When a player answers a question correctly for the first time,
-- mark it as rewarded
-- This should be handled in application code, but we can create
-- a helper function

CREATE OR REPLACE FUNCTION record_mcq_attempt(
  p_question_id BIGINT,
  p_is_correct BOOLEAN
)
RETURNS TABLE (
  attempt_id BIGINT,
  should_grant_reward BOOLEAN,
  message TEXT
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_new_attempt_id BIGINT;
  v_already_rewarded BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Check if already rewarded for this question
  SELECT EXISTS (
    SELECT 1
    FROM attempts a
    WHERE a.user_id = v_user_id
      AND a.question_id = p_question_id
      AND a.rewarded = true
  ) INTO v_already_rewarded;
  
  -- Insert attempt
  INSERT INTO attempts (user_id, question_id, is_correct, rewarded)
  VALUES (v_user_id, p_question_id, p_is_correct, p_is_correct AND NOT v_already_rewarded)
  RETURNING id INTO v_new_attempt_id;
  
  -- Return whether to grant reward
  RETURN QUERY
  SELECT
    v_new_attempt_id AS attempt_id,
    p_is_correct AND NOT v_already_rewarded AS should_grant_reward,
    CASE
      WHEN p_is_correct AND v_already_rewarded THEN 'Correct, but already rewarded'
      WHEN p_is_correct THEN 'Correct - reward granted'
      ELSE 'Incorrect'
    END AS message;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 9: Add indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_mcq_questions_tier_level ON mcq_questions(tier_level);
CREATE INDEX IF NOT EXISTS idx_mcq_questions_subject_difficulty_tier ON mcq_questions(subject, difficulty, tier_level);
CREATE INDEX IF NOT EXISTS idx_questions_tier_level ON questions(tier_level);
CREATE INDEX IF NOT EXISTS idx_questions_subject_difficulty_tier ON questions(subject, difficulty, tier_level);
CREATE INDEX IF NOT EXISTS idx_attempts_user_question_rewarded ON attempts(user_id, question_id, rewarded);

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check tier distribution for mcq_questions
SELECT 
  subject,
  difficulty,
  tier_level,
  COUNT(*) as question_count
FROM mcq_questions
GROUP BY subject, difficulty, tier_level
ORDER BY subject, difficulty, tier_level;

-- Check tier distribution for teacher questions
SELECT 
  subject,
  difficulty,
  tier_level,
  COUNT(*) as question_count
FROM questions
GROUP BY subject, difficulty, tier_level
ORDER BY subject, difficulty, tier_level;

-- Test the RPC for a specific subject
-- SELECT * FROM get_unlocked_mcq_questions('Maths', 'easy', 5);

-- Check unlock status
-- SELECT * FROM get_player_unlock_status();

-- Count available questions
-- SELECT * FROM count_unlocked_questions('Maths', 'easy');

-- ============================================================
-- SUMMARY
-- ============================================================
-- 
-- Tables Modified:
--   - mcq_questions: Added tier_level column
--   - questions: Added tier_level column  
--   - attempts: Added rewarded column
--   - question_attempts: Added rewarded column
--
-- Triggers Created:
--   - trigger_auto_assign_tier_mcq: Auto-assigns tier to new mcq_questions
--   - trigger_auto_assign_tier_questions: Auto-assigns tier to new questions
--
-- RPCs Created:
--   - get_unlocked_mcq_questions(subject, difficulty, limit): Returns unlocked unrewarded MCQ questions
--   - get_unlocked_teacher_questions(subject, difficulty, limit): Returns unlocked unrewarded teacher questions
--   - get_player_unlock_status(): Returns player's unlock status
--   - count_unlocked_questions(subject, difficulty): Counts available questions
--   - record_mcq_attempt(question_id, is_correct): Records attempt and returns reward eligibility
--
-- Unlock Rules:
--   - Max Tier = (Player Level + 1) / 2
--   - Easy difficulty: unlocked at level 1+
--   - Medium difficulty: unlocked at level 3+
--   - Hard difficulty: unlocked at level 6+
--   - Each question rewards XP/coins only ONCE per player
--
-- ============================================================
