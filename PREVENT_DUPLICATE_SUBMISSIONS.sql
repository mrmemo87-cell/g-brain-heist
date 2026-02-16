-- ============================================================================
-- PREVENT DUPLICATE CAMBRIDGE TEST SUBMISSIONS (Multi-Tab Exploit Fix)
-- ============================================================================
-- Problem: Students can open the Cambridge Hub in multiple tabs and submit
-- the same test more than once, getting extra scoring attempts.
--
-- Fix: Add a UNIQUE constraint on (student_name, quiz_name) so the database
-- itself rejects duplicates regardless of client-side behaviour.
-- Also create an RPC for the retake flow to delete old submissions.
-- ============================================================================

-- ============================================================
-- Step 1: Remove existing duplicate submissions (keep earliest)
-- ============================================================
-- First pass: delete rows where a strictly earlier submission exists
DELETE FROM quiz_scores a
USING quiz_scores b
WHERE a.student_name = b.student_name
  AND a.quiz_name = b.quiz_name
  AND a.submitted_at > b.submitted_at;

-- Second pass: if submitted_at is identical, keep the row with the smaller id
DELETE FROM quiz_scores a
USING quiz_scores b
WHERE a.student_name = b.student_name
  AND a.quiz_name = b.quiz_name
  AND a.submitted_at = b.submitted_at
  AND a.id > b.id;

-- ============================================================
-- Step 2: Add unique constraint to prevent future duplicates
-- ============================================================
-- This makes it physically impossible for two tabs to both INSERT
-- for the same (student_name, quiz_name) pair. The second INSERT
-- will fail with a unique-violation error (HTTP 409 from PostgREST).
ALTER TABLE quiz_scores
  ADD CONSTRAINT uq_quiz_scores_student_quiz UNIQUE (student_name, quiz_name);

-- ============================================================
-- Step 3: Create RPC for retake flow
-- ============================================================
-- When a student retakes a test (allowed by teacher), the old
-- submission must be deleted first so the unique constraint
-- doesn't block the new submission.
--
-- Uses SECURITY DEFINER to bypass the DELETE RLS policy
-- (which only allows teachers/admins). The function itself
-- verifies that the caller owns the submission or is a teacher.

CREATE OR REPLACE FUNCTION rpc_allow_cambridge_retake(
  p_student_name TEXT,
  p_quiz_name_pattern TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_username TEXT;
  v_caller_role TEXT;
  v_deleted INT;
BEGIN
  -- Look up the caller's identity
  SELECT username, role INTO v_caller_username, v_caller_role
  FROM users
  WHERE id = auth.uid();

  -- Teachers and admins can delete any student's submission
  IF v_caller_role IN ('teacher', 'admin', 'school_admin') THEN
    DELETE FROM quiz_scores
    WHERE student_name = p_student_name
      AND quiz_name ILIKE p_quiz_name_pattern;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN 'ok:' || v_deleted;
  END IF;

  -- Students can only delete their own submissions (case-insensitive match)
  IF v_caller_username IS NOT NULL
     AND LOWER(TRIM(v_caller_username)) = LOWER(TRIM(p_student_name))
  THEN
    DELETE FROM quiz_scores
    WHERE student_name = p_student_name
      AND quiz_name ILIKE p_quiz_name_pattern;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN 'ok:' || v_deleted;
  END IF;

  RETURN 'unauthorized';
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION rpc_allow_cambridge_retake(TEXT, TEXT) TO authenticated;

-- ============================================================
-- Step 4: Verify
-- ============================================================
-- Check the constraint exists
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'quiz_scores'::regclass
  AND conname = 'uq_quiz_scores_student_quiz';

-- Check the function exists
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'rpc_allow_cambridge_retake';
