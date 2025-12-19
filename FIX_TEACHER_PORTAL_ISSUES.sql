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
WHERE proname IN ('get_all_active_questions', 'rpc_get_students_for_assignment')
ORDER BY proname;

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
-- ============================================================================
