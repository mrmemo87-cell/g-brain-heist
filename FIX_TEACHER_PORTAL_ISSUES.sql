-- ============================================================================
-- FIX TEACHER PORTAL: Question Bank & Student School Isolation
-- ============================================================================
-- Issue 1: Question Bank shows "No questions yet!" because it only fetches
--          the teacher's OWN questions, not the global bank.
-- Issue 2: Create Assignment shows ALL students from ALL schools.
--
-- Fixes:
-- 1. Add get_all_active_questions() RPC for global question bank browsing
-- 2. Fix rpc_get_students_for_assignment() to filter by teacher's school_id
-- ============================================================================

-- ============================================================================
-- FIX 1: Create RPC to get ALL active questions (global bank)
-- ============================================================================
-- Teachers should see ALL questions in the global bank, not just their own.
-- They can filter by "my questions" in the UI if needed.

CREATE OR REPLACE FUNCTION get_all_active_questions(
  p_subject TEXT DEFAULT NULL,
  p_difficulty TEXT DEFAULT NULL,
  p_teacher_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 500,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  teacher_id UUID,
  subject TEXT,
  subject_id TEXT,
  topic TEXT,
  topic_name TEXT,
  difficulty TEXT,
  question_text TEXT,
  image_url TEXT,
  question_type TEXT,
  options JSONB,
  correct_answer TEXT,
  explanation TEXT,
  hints TEXT[],
  time_limit INTEGER,
  points INTEGER,
  tags TEXT[],
  grade_level TEXT,
  is_public BOOLEAN,
  is_active BOOLEAN,
  times_answered INTEGER,
  times_correct INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  -- Additional info about the creator
  creator_name TEXT,
  creator_school_id UUID,
  is_mine BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    q.id,
    q.teacher_id,
    q.subject,
    q.subject_id,
    q.topic,
    q.topic_name,
    q.difficulty,
    q.question_text,
    q.image_url,
    q.question_type,
    q.options,
    q.correct_answer,
    q.explanation,
    q.hints,
    q.time_limit,
    q.points,
    q.tags,
    q.grade_level,
    q.is_public,
    q.is_active,
    q.times_answered,
    q.times_correct,
    q.created_at,
    q.updated_at,
    -- Creator info
    COALESCE(u.username, 'Unknown') as creator_name,
    u.school_id as creator_school_id,
    -- Is this question created by the current user?
    (t.user_id = auth.uid()) as is_mine
  FROM questions q
  LEFT JOIN teachers t ON t.id = q.teacher_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE q.is_active = true
    AND (p_subject IS NULL OR q.subject = p_subject)
    AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
    AND (p_teacher_id IS NULL OR q.teacher_id = p_teacher_id)
  ORDER BY q.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION get_all_active_questions(TEXT, TEXT, UUID, INT, INT) TO authenticated;

-- ============================================================================
-- FIX 2: Update rpc_get_students_for_assignment to filter by school
-- ============================================================================
-- Teachers should only see students from their own school.
-- Contract: Control = local (teachers assign to their own students only)

DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(uuid);

CREATE OR REPLACE FUNCTION rpc_get_students_for_assignment(
  p_teacher_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  grade smallint,
  batch text,
  avatar_url text,
  school_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_school_id UUID;
BEGIN
  -- Get the teacher's school_id from the calling user
  SELECT u.school_id INTO v_teacher_school_id
  FROM users u
  WHERE u.id = auth.uid();
  
  -- Return students from the same school only
  RETURN QUERY
  SELECT
    u.id::uuid,
    u.username::text,
    u.username::text as display_name,
    CASE 
      WHEN u.grade IS NULL THEN 0::smallint
      WHEN u.grade ~ '^\d+$' THEN u.grade::smallint
      ELSE 0::smallint
    END as grade,
    COALESCE(u.batch, 'N/A'::text) as batch,
    u.avatar_url::text,
    u.school_id::uuid
  FROM users u
  WHERE COALESCE(u.role, 'student') = 'student'
    AND NOT COALESCE(u.is_banned, false)
    -- SCHOOL ISOLATION: Only students from the teacher's school
    AND (
      v_teacher_school_id IS NULL  -- If teacher has no school, show all (fallback)
      OR u.school_id = v_teacher_school_id
      OR u.school_id IS NULL  -- Include students without school assignment
    )
  ORDER BY 
    CASE 
      WHEN u.grade IS NULL THEN 0::smallint
      WHEN u.grade ~ '^\d+$' THEN u.grade::smallint
      ELSE 0::smallint
    END,
    u.batch, 
    u.username;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_students_for_assignment(uuid) TO authenticated;

-- ============================================================================
-- FIX 3: Create student_assignment_answers table for detailed analysis
-- ============================================================================
-- Teachers need to see exactly which questions students got wrong and why.
-- This table stores each answer for personalized analysis.

CREATE TABLE IF NOT EXISTS student_assignment_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  student_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  time_taken_ms INTEGER DEFAULT 0,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(assignment_id, student_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_student_answers_assignment ON student_assignment_answers(assignment_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_student ON student_assignment_answers(student_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_question ON student_assignment_answers(question_id);

ALTER TABLE student_assignment_answers ENABLE ROW LEVEL SECURITY;

-- Teachers can view answers for their assignments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_assignment_answers'
      AND policyname = 'Teachers view assignment answers'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Teachers view assignment answers"
      ON student_assignment_answers
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM assignments a
          JOIN teachers t ON t.id = a.teacher_id
          WHERE a.id = student_assignment_answers.assignment_id
            AND t.user_id = auth.uid()
        )
      )
    $policy$;
  END IF;
END;
$$;

-- Students can insert their own answers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_assignment_answers'
      AND policyname = 'Students insert own answers'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Students insert own answers"
      ON student_assignment_answers
      FOR INSERT
      WITH CHECK (student_id = auth.uid())
    $policy$;
  END IF;
END;
$$;

-- Students can view their own answers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'student_assignment_answers'
      AND policyname = 'Students view own answers'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Students view own answers"
      ON student_assignment_answers
      FOR SELECT
      USING (student_id = auth.uid())
    $policy$;
  END IF;
END;
$$;

-- ============================================================================
-- FIX 4: RPC to submit individual assignment answers (for tracking)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_submit_assignment_answer(
  p_assignment_id UUID,
  p_question_id UUID,
  p_question_text TEXT,
  p_correct_answer TEXT,
  p_student_answer TEXT,
  p_is_correct BOOLEAN,
  p_time_taken_ms INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID := auth.uid();
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  INSERT INTO student_assignment_answers (
    assignment_id,
    student_id,
    question_id,
    question_text,
    correct_answer,
    student_answer,
    is_correct,
    time_taken_ms,
    answered_at
  ) VALUES (
    p_assignment_id,
    v_student_id,
    p_question_id,
    p_question_text,
    p_correct_answer,
    p_student_answer,
    p_is_correct,
    COALESCE(p_time_taken_ms, 0),
    NOW()
  )
  ON CONFLICT (assignment_id, student_id, question_id)
  DO UPDATE SET
    student_answer = EXCLUDED.student_answer,
    is_correct = EXCLUDED.is_correct,
    time_taken_ms = EXCLUDED.time_taken_ms,
    answered_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_submit_assignment_answer(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;

-- ============================================================================
-- FIX 5: RPC to get detailed student answers for analysis (teacher view)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_assignment_student_answers(
  p_assignment_id UUID,
  p_teacher_id UUID,
  p_student_id UUID DEFAULT NULL
)
RETURNS TABLE (
  student_id UUID,
  student_name TEXT,
  student_batch TEXT,
  question_id UUID,
  question_text TEXT,
  correct_answer TEXT,
  student_answer TEXT,
  is_correct BOOLEAN,
  time_taken_ms INTEGER,
  answered_at TIMESTAMPTZ,
  explanation TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify teacher owns this assignment
  PERFORM ensure_teacher(p_teacher_id);
  IF NOT EXISTS (SELECT 1 FROM assignments WHERE id = p_assignment_id AND teacher_id = p_teacher_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    saa.student_id,
    u.username AS student_name,
    u.batch AS student_batch,
    saa.question_id,
    saa.question_text,
    saa.correct_answer,
    saa.student_answer,
    saa.is_correct,
    saa.time_taken_ms,
    saa.answered_at,
    q.explanation
  FROM student_assignment_answers saa
  JOIN users u ON u.id = saa.student_id
  LEFT JOIN questions q ON q.id = saa.question_id
  WHERE saa.assignment_id = p_assignment_id
    AND (p_student_id IS NULL OR saa.student_id = p_student_id)
  ORDER BY u.username, saa.answered_at;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_assignment_student_answers(UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- FIX 6: RPC to get assignment question analysis (aggregate mistakes)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_assignment_question_analysis(
  p_assignment_id UUID,
  p_teacher_id UUID
)
RETURNS TABLE (
  question_id UUID,
  question_text TEXT,
  correct_answer TEXT,
  total_attempts INT,
  correct_count INT,
  incorrect_count INT,
  accuracy_percent INT,
  avg_time_ms INT,
  common_wrong_answers JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify teacher owns this assignment
  PERFORM ensure_teacher(p_teacher_id);
  IF NOT EXISTS (SELECT 1 FROM assignments WHERE id = p_assignment_id AND teacher_id = p_teacher_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    saa.question_id,
    MAX(saa.question_text) AS question_text,
    MAX(saa.correct_answer) AS correct_answer,
    COUNT(*)::INT AS total_attempts,
    COUNT(*) FILTER (WHERE saa.is_correct)::INT AS correct_count,
    COUNT(*) FILTER (WHERE NOT saa.is_correct)::INT AS incorrect_count,
    CASE 
      WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE saa.is_correct) * 100 / COUNT(*))::INT
      ELSE 0
    END AS accuracy_percent,
    COALESCE(AVG(saa.time_taken_ms)::INT, 0) AS avg_time_ms,
    -- Get the most common wrong answers
    (
      SELECT jsonb_agg(jsonb_build_object('answer', wrong_answer, 'count', cnt))
      FROM (
        SELECT saa2.student_answer AS wrong_answer, COUNT(*) AS cnt
        FROM student_assignment_answers saa2
        WHERE saa2.assignment_id = p_assignment_id
          AND saa2.question_id = saa.question_id
          AND NOT saa2.is_correct
        GROUP BY saa2.student_answer
        ORDER BY COUNT(*) DESC
        LIMIT 3
      ) wrong
    ) AS common_wrong_answers
  FROM student_assignment_answers saa
  WHERE saa.assignment_id = p_assignment_id
  GROUP BY saa.question_id
  ORDER BY accuracy_percent ASC;  -- Show hardest questions first
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_assignment_question_analysis(UUID, UUID) TO authenticated;

-- ============================================================================
-- FIX 7: Update rpc_create_assignment to filter by teacher's school
-- ============================================================================
-- The original function assigns to ALL students matching the batch across
-- ALL schools. Teachers should only assign to students in their own school.

DROP FUNCTION IF EXISTS rpc_create_assignment(uuid, text, text, text, text, uuid[], timestamptz, timestamptz, text, text, text);
DROP FUNCTION IF EXISTS rpc_create_assignment(uuid, text, text, text, text, uuid[], timestamptz, timestamptz, text, text, text, text, uuid[]);

CREATE OR REPLACE FUNCTION rpc_create_assignment(
  p_teacher_id uuid,
  p_subject_id text,
  p_subject_name text,
  p_topic_name text,
  p_batch text,
  p_question_ids uuid[],
  p_assigned_at timestamptz,
  p_due_at timestamptz,
  p_title text,
  p_instructions text,
  p_difficulty text,
  p_assignment_mode text DEFAULT 'batch',
  p_student_ids uuid[] DEFAULT NULL
)
RETURNS assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_assignment assignments;
  v_teacher_school_id UUID;
BEGIN
  PERFORM ensure_teacher(p_teacher_id);
  IF coalesce(array_length(p_question_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Assignment must include at least one question';
  END IF;

  -- Get the teacher's school_id for filtering
  SELECT u.school_id INTO v_teacher_school_id
  FROM teachers t
  JOIN users u ON u.id = t.user_id
  WHERE t.id = p_teacher_id;

  INSERT INTO assignments (
    teacher_id,
    subject_id,
    subject_name,
    topic_name,
    batch,
    difficulty,
    title,
    instructions,
    assigned_at,
    due_at,
    assignment_mode
  ) VALUES (
    p_teacher_id,
    p_subject_id,
    p_subject_name,
    p_topic_name,
    CASE WHEN p_assignment_mode = 'custom' THEN NULL ELSE p_batch END,
    p_difficulty,
    p_title,
    p_instructions,
    COALESCE(p_assigned_at, NOW()),
    p_due_at,
    COALESCE(p_assignment_mode, 'batch')
  ) RETURNING * INTO new_assignment;

  -- Insert assignment questions
  INSERT INTO assignment_questions (assignment_id, question_id, order_index)
  SELECT new_assignment.id, question_id, row_number() OVER ()
  FROM unnest(p_question_ids) AS question_id;

  -- Handle batch mode vs custom mode
  IF p_assignment_mode = 'custom' AND p_student_ids IS NOT NULL AND array_length(p_student_ids, 1) > 0 THEN
    -- CUSTOM MODE: Assign to specifically selected students only
    INSERT INTO student_assignments (assignment_id, student_id, batch, status, assigned_at, due_at)
    SELECT
      new_assignment.id,
      u.id,
      u.batch,
      'pending',
      new_assignment.assigned_at,
      new_assignment.due_at
    FROM users u
    WHERE u.id = ANY(p_student_ids)
      AND COALESCE(u.role, 'student') = 'student'
      AND NOT COALESCE(u.is_banned, false);
      
    -- Also store in assignment_students for reference
    INSERT INTO assignment_students (assignment_id, student_id)
    SELECT new_assignment.id, student_id
    FROM unnest(p_student_ids) AS student_id
    ON CONFLICT DO NOTHING;
  ELSE
    -- BATCH MODE: Assign to students matching batch, BUT FILTER BY SCHOOL
    INSERT INTO student_assignments (assignment_id, student_id, batch, status, assigned_at, due_at)
    SELECT
      new_assignment.id,
      u.id,
      u.batch,
      'pending',
      new_assignment.assigned_at,
      new_assignment.due_at
    FROM users u
    WHERE COALESCE(u.role, 'student') = 'student'
      AND NOT COALESCE(u.is_banned, false)
      AND (
        p_batch = 'All'
        OR u.batch = p_batch
      )
      -- *** SCHOOL ISOLATION: Only assign to students in the teacher's school ***
      AND (
        v_teacher_school_id IS NULL  -- If teacher has no school, allow all (fallback)
        OR u.school_id = v_teacher_school_id
        OR u.school_id IS NULL  -- Include unassigned students for migration
      );
  END IF;

  RETURN new_assignment;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_assignment(uuid, text, text, text, text, uuid[], timestamptz, timestamptz, text, text, text, text, uuid[]) TO authenticated;

-- ============================================================================
-- FIX 4: Update rpc_get_assignments_for_teacher to include assignment_mode
-- ============================================================================

DROP FUNCTION IF EXISTS rpc_get_assignments_for_teacher(uuid);

CREATE OR REPLACE FUNCTION rpc_get_assignments_for_teacher(p_teacher_id uuid)
RETURNS TABLE (
  id uuid,
  teacher_id uuid,
  subject_id text,
  subject_name text,
  topic_name text,
  batch text,
  difficulty text,
  title text,
  instructions text,
  assigned_at timestamptz,
  due_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  question_count int,
  completed_count int,
  student_count int,
  assignment_mode text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.teacher_id,
    a.subject_id,
    a.subject_name,
    a.topic_name,
    a.batch,
    a.difficulty,
    a.title,
    a.instructions,
    a.assigned_at,
    a.due_at,
    a.created_at,
    a.updated_at,
    COALESCE((SELECT COUNT(*) FROM assignment_questions aq WHERE aq.assignment_id = a.id), 0)::int AS question_count,
    COALESCE((SELECT COUNT(*) FROM student_assignments sa WHERE sa.assignment_id = a.id AND sa.status = 'completed'), 0)::int AS completed_count,
    COALESCE((SELECT COUNT(*) FROM student_assignments sa WHERE sa.assignment_id = a.id), 0)::int AS student_count,
    COALESCE(a.assignment_mode, 'batch')::text AS assignment_mode
  FROM assignments a
  WHERE a.teacher_id = p_teacher_id
    AND EXISTS (
      SELECT 1 FROM teachers t WHERE t.id = p_teacher_id AND t.user_id = auth.uid()
    )
  ORDER BY a.assigned_at DESC;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_assignments_for_teacher(uuid) TO authenticated;

-- ============================================================================
-- FIX 8: Add Assignment-Based Achievements
-- ============================================================================
-- Add achievements for completing assignments that students can earn.

-- Insert assignment achievements (if they don't exist)
INSERT INTO achievements (id, name, description, icon, category, points, rarity) 
VALUES 
  ('assignment_first', 'First Assignment', 'Complete your first teacher assignment', '📋', 'assignments', 50, 'common'),
  ('assignment_5', 'Assignment Ace', 'Complete 5 teacher assignments', '🎯', 'assignments', 100, 'common'),
  ('assignment_10', 'Homework Hero', 'Complete 10 teacher assignments', '📚', 'assignments', 200, 'rare'),
  ('assignment_25', 'Dedicated Learner', 'Complete 25 teacher assignments', '🌟', 'assignments', 500, 'rare'),
  ('assignment_50', 'Assignment Master', 'Complete 50 teacher assignments', '👑', 'assignments', 1000, 'epic'),
  ('assignment_perfect', 'Perfect Score', 'Score 100% on any assignment', '💯', 'assignments', 150, 'rare'),
  ('assignment_streak_3', 'On a Roll', 'Complete 3 assignments in a row with 70%+ accuracy', '🔥', 'assignments', 200, 'rare'),
  ('assignment_early', 'Early Bird', 'Complete an assignment more than 1 day before the deadline', '🐦', 'assignments', 100, 'common')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- FIX 9: RPC to get student's completed assignments for achievement display
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_get_student_completed_assignments()
RETURNS TABLE (
  assignment_id UUID,
  subject_name TEXT,
  topic_name TEXT,
  teacher_name TEXT,
  score INT,
  accuracy INT,
  correct INT,
  incorrect INT,
  completed_at TIMESTAMPTZ,
  title TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID := auth.uid();
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  RETURN QUERY
  SELECT
    sar.assignment_id,
    a.subject_name,
    a.topic_name,
    u.username AS teacher_name,
    sar.score,
    sar.accuracy,
    sar.correct,
    sar.incorrect,
    sar.completed_at,
    a.title
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  JOIN teachers t ON t.id = a.teacher_id
  JOIN users u ON u.id = t.user_id
  WHERE sar.student_id = v_student_id
  ORDER BY sar.completed_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_student_completed_assignments() TO authenticated;

-- ============================================================================
-- FIX 10: Update check_achievements to include assignment achievements
-- ============================================================================
-- This function checks for newly earned achievements after assignment completion

CREATE OR REPLACE FUNCTION check_assignment_achievements(p_user_id UUID)
RETURNS TABLE (
  achievement_id TEXT,
  achievement_name TEXT,
  achievement_icon TEXT,
  xp_reward INT,
  coin_reward INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed_count INT;
  v_perfect_count INT;
  v_early_count INT;
BEGIN
  -- Count completed assignments
  SELECT COUNT(*) INTO v_completed_count
  FROM student_assignment_results
  WHERE student_id = p_user_id;

  -- Count perfect scores
  SELECT COUNT(*) INTO v_perfect_count
  FROM student_assignment_results
  WHERE student_id = p_user_id AND accuracy = 100;

  -- Count early completions (completed at least 1 day before due date)
  SELECT COUNT(*) INTO v_early_count
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = p_user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day';

  -- Check and award "First Assignment" achievement
  IF v_completed_count >= 1 THEN
    INSERT INTO user_achievements (user_id, achievement_id, progress, target, unlocked_at)
    VALUES (p_user_id, 'assignment_first', 1, 1, NOW())
    ON CONFLICT (user_id, achievement_id) DO UPDATE
    SET progress = 1, unlocked_at = COALESCE(user_achievements.unlocked_at, NOW());
  END IF;

  -- Check and award "Assignment Ace" (5 assignments)
  INSERT INTO user_achievements (user_id, achievement_id, progress, target, unlocked_at)
  VALUES (p_user_id, 'assignment_5', v_completed_count, 5, 
    CASE WHEN v_completed_count >= 5 THEN NOW() ELSE NULL END)
  ON CONFLICT (user_id, achievement_id) DO UPDATE
  SET progress = v_completed_count, 
      unlocked_at = CASE WHEN v_completed_count >= 5 THEN COALESCE(user_achievements.unlocked_at, NOW()) ELSE NULL END;

  -- Check and award "Homework Hero" (10 assignments)
  INSERT INTO user_achievements (user_id, achievement_id, progress, target, unlocked_at)
  VALUES (p_user_id, 'assignment_10', v_completed_count, 10, 
    CASE WHEN v_completed_count >= 10 THEN NOW() ELSE NULL END)
  ON CONFLICT (user_id, achievement_id) DO UPDATE
  SET progress = v_completed_count, 
      unlocked_at = CASE WHEN v_completed_count >= 10 THEN COALESCE(user_achievements.unlocked_at, NOW()) ELSE NULL END;

  -- Check and award "Dedicated Learner" (25 assignments)
  INSERT INTO user_achievements (user_id, achievement_id, progress, target, unlocked_at)
  VALUES (p_user_id, 'assignment_25', v_completed_count, 25, 
    CASE WHEN v_completed_count >= 25 THEN NOW() ELSE NULL END)
  ON CONFLICT (user_id, achievement_id) DO UPDATE
  SET progress = v_completed_count, 
      unlocked_at = CASE WHEN v_completed_count >= 25 THEN COALESCE(user_achievements.unlocked_at, NOW()) ELSE NULL END;

  -- Check and award "Assignment Master" (50 assignments)
  INSERT INTO user_achievements (user_id, achievement_id, progress, target, unlocked_at)
  VALUES (p_user_id, 'assignment_50', v_completed_count, 50, 
    CASE WHEN v_completed_count >= 50 THEN NOW() ELSE NULL END)
  ON CONFLICT (user_id, achievement_id) DO UPDATE
  SET progress = v_completed_count, 
      unlocked_at = CASE WHEN v_completed_count >= 50 THEN COALESCE(user_achievements.unlocked_at, NOW()) ELSE NULL END;

  -- Check and award "Perfect Score" achievement
  IF v_perfect_count >= 1 THEN
    INSERT INTO user_achievements (user_id, achievement_id, progress, target, unlocked_at)
    VALUES (p_user_id, 'assignment_perfect', 1, 1, NOW())
    ON CONFLICT (user_id, achievement_id) DO UPDATE
    SET progress = 1, unlocked_at = COALESCE(user_achievements.unlocked_at, NOW());
  END IF;

  -- Check and award "Early Bird" achievement
  IF v_early_count >= 1 THEN
    INSERT INTO user_achievements (user_id, achievement_id, progress, target, unlocked_at)
    VALUES (p_user_id, 'assignment_early', 1, 1, NOW())
    ON CONFLICT (user_id, achievement_id) DO UPDATE
    SET progress = 1, unlocked_at = COALESCE(user_achievements.unlocked_at, NOW());
  END IF;

  -- Return newly unlocked achievements (those unlocked in the last minute)
  RETURN QUERY
  SELECT 
    ua.achievement_id,
    a.name,
    a.icon,
    COALESCE(a.points, 0)::INT AS xp_reward,
    (COALESCE(a.points, 0) / 2)::INT AS coin_reward
  FROM user_achievements ua
  JOIN achievements a ON a.id = ua.achievement_id
  WHERE ua.user_id = p_user_id
    AND ua.unlocked_at IS NOT NULL
    AND ua.unlocked_at > NOW() - INTERVAL '1 minute'
    AND a.category = 'assignments';
END;
$$;

GRANT EXECUTE ON FUNCTION check_assignment_achievements(UUID) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Test 1: Check that get_all_active_questions returns all active questions
SELECT 
  'get_all_active_questions' as test,
  COUNT(*) as question_count
FROM get_all_active_questions();

-- Test 2: Show function signatures
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc 
WHERE proname IN ('get_all_active_questions', 'rpc_get_students_for_assignment', 'rpc_create_assignment', 'rpc_get_assignments_for_teacher', 'rpc_get_student_completed_assignments', 'check_assignment_achievements')
ORDER BY proname;

-- Test 3: Verify assignment achievements exist
SELECT id, name, icon, category FROM achievements WHERE category = 'assignments';

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- ✓ get_all_active_questions: Returns ALL active questions (global bank)
--   - Includes creator info (name, school_id)
--   - Includes is_mine flag to distinguish own questions
--   - Filterable by subject, difficulty, teacher_id
--
-- ✓ rpc_get_students_for_assignment: Now filtered by teacher's school
--   - Teachers only see students from their own school
--   - Fallback: If teacher has no school_id, shows all students
--   - Students without school_id are still visible (for migration)
--
-- ✓ rpc_create_assignment: Now filtered by teacher's school
--   - Batch mode: Only assigns to students in teacher's school
--   - Custom mode: Respects selected student IDs
--   - Supports assignment_mode parameter
--
-- ✓ rpc_get_assignments_for_teacher: Now includes assignment_mode column
--
-- ✓ student_assignment_answers: New table for tracking individual answers
--   - Enables personalized analysis of student mistakes
--   - Teachers can see exactly what students answered
--
-- ✓ Assignment achievements: 8 new achievements for completing assignments
--   - First Assignment, 5, 10, 25, 50 completions
--   - Perfect Score, Early Bird, On a Roll
--
-- ✓ rpc_get_student_completed_assignments: View completed assignment history
--
-- ✓ check_assignment_achievements: Automatically awards assignment achievements
