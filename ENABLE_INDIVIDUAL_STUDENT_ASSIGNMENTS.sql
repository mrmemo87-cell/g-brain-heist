-- ============================================================
-- Enable Individual Student Assignments
-- ============================================================
-- This migration allows teachers to assign work to specific
-- students regardless of batch or grade, rather than only
-- assigning to entire batches.
-- ============================================================

-- ============================================================
-- Step 1: Add new table to track individual student selections
-- ============================================================

CREATE TABLE IF NOT EXISTS assignment_students (
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_students_assignment ON assignment_students(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_students_student ON assignment_students(student_id);

-- ============================================================
-- Step 2: Update assignments table to support custom mode
-- ============================================================

-- Add a new column to track assignment mode
ALTER TABLE assignments 
  ADD COLUMN IF NOT EXISTS assignment_mode TEXT 
  DEFAULT 'batch' 
  CHECK (assignment_mode IN ('batch', 'custom'));

-- Update existing assignments to use batch mode
UPDATE assignments SET assignment_mode = 'batch' WHERE assignment_mode IS NULL;

-- Make batch nullable for custom assignments
ALTER TABLE assignments 
  ALTER COLUMN batch DROP NOT NULL;

-- Update batch constraint to allow NULL
ALTER TABLE assignments 
  DROP CONSTRAINT IF EXISTS assignments_batch_check;

ALTER TABLE assignments 
  ADD CONSTRAINT assignments_batch_check 
  CHECK (
    (assignment_mode = 'batch' AND batch IS NOT NULL AND batch IN ('8A','8B','8C','All'))
    OR
    (assignment_mode = 'custom' AND batch IS NULL)
  );

-- ============================================================
-- Step 3: Create RPC to get all students for teacher selection
-- ============================================================

DROP FUNCTION IF EXISTS rpc_get_students_for_assignment(uuid);

CREATE FUNCTION rpc_get_students_for_assignment(
  p_teacher_id uuid
)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  grade smallint,
  batch text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id::uuid,
    u.username::text,
    u.username::text as display_name,
    u.grade::smallint,
    u.batch::text,
    u.avatar_url::text
  FROM users u
  WHERE COALESCE(u.role, 'student') = 'student'
    AND NOT COALESCE(u.is_banned, false)
  ORDER BY u.grade, u.batch, u.username;
$$;

-- ============================================================
-- Step 4: Update rpc_create_assignment to support custom mode
-- ============================================================

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
BEGIN
  PERFORM ensure_teacher(p_teacher_id);
  
  IF coalesce(array_length(p_question_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Assignment must include at least one question';
  END IF;

  -- Validate assignment mode
  IF p_assignment_mode NOT IN ('batch', 'custom') THEN
    RAISE EXCEPTION 'Invalid assignment mode: must be batch or custom';
  END IF;

  -- Validate inputs based on mode
  IF p_assignment_mode = 'batch' AND p_batch IS NULL THEN
    RAISE EXCEPTION 'Batch is required for batch mode';
  END IF;

  IF p_assignment_mode = 'custom' THEN
    IF coalesce(array_length(p_student_ids, 1), 0) = 0 THEN
      RAISE EXCEPTION 'At least one student is required for custom mode';
    END IF;
  END IF;

  -- Create the assignment
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
    CASE WHEN p_assignment_mode = 'batch' THEN p_batch ELSE NULL END,
    p_difficulty,
    p_title,
    p_instructions,
    COALESCE(p_assigned_at, NOW()),
    p_due_at,
    p_assignment_mode
  ) RETURNING * INTO new_assignment;

  -- Add questions to the assignment
  INSERT INTO assignment_questions (assignment_id, question_id, order_index)
  SELECT new_assignment.id, question_id, row_number() OVER ()
  FROM unnest(p_question_ids) AS question_id;

  -- Assign to students based on mode
  IF p_assignment_mode = 'batch' THEN
    -- Original batch-based logic
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
      );
  ELSE
    -- Custom mode: assign to specific students
    -- First, record the student selections
    INSERT INTO assignment_students (assignment_id, student_id)
    SELECT new_assignment.id, student_id
    FROM unnest(p_student_ids) AS student_id;

    -- Then create student assignments for each selected student
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
  END IF;

  RETURN new_assignment;
END;
$$;

-- ============================================================
-- Step 5: Update RLS policies
-- ============================================================

ALTER TABLE assignment_students ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_students'
      AND policyname = 'Teachers manage assignment students'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Teachers manage assignment students"
      ON assignment_students
      USING (
        EXISTS (
          SELECT 1 FROM assignments a
          JOIN teachers t ON t.id = a.teacher_id
          WHERE a.id = assignment_students.assignment_id
            AND t.user_id = auth.uid()
        )
      )
    $policy$;
  END IF;
END;
$$;

-- ============================================================
-- Step 6: Update views to include assignment mode info
-- ============================================================

-- Drop the old function first to change the return type
DROP FUNCTION IF EXISTS rpc_get_assignments_for_teacher(uuid);

CREATE FUNCTION rpc_get_assignments_for_teacher(p_teacher_id uuid)
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
    COALESCE((SELECT COUNT(*) FROM assignment_questions aq WHERE aq.assignment_id = a.id), 0) AS question_count,
    COALESCE((SELECT COUNT(*) FROM student_assignments sa WHERE sa.assignment_id = a.id AND sa.status = 'completed'), 0) AS completed_count,
    COALESCE((SELECT COUNT(*) FROM student_assignments sa WHERE sa.assignment_id = a.id), 0) AS student_count,
    COALESCE(a.assignment_mode, 'batch') AS assignment_mode
  FROM assignments a
  WHERE a.teacher_id = p_teacher_id
  ORDER BY a.assigned_at DESC;
$$;

-- ============================================================
-- Grant permissions
-- ============================================================

GRANT SELECT ON assignment_students TO authenticated;
GRANT INSERT ON assignment_students TO authenticated;
GRANT DELETE ON assignment_students TO authenticated;

-- ============================================================
-- DIAGNOSTICS: Check if students exist (comment out after testing)
-- ============================================================
-- Uncomment these to debug student loading issues:

-- Check total student count
-- SELECT COUNT(*) as total_students FROM users WHERE COALESCE(role, 'student') = 'student';

-- Check active (non-banned) students
-- SELECT COUNT(*) as active_students FROM users WHERE COALESCE(role, 'student') = 'student' AND NOT COALESCE(is_banned, false);

-- View sample students
-- SELECT id, username, display_name, grade, batch, role, is_banned FROM users WHERE COALESCE(role, 'student') = 'student' LIMIT 10;

-- Test the RPC function (replace UUID with your teacher ID)
-- SELECT * FROM rpc_get_students_for_assignment('YOUR_TEACHER_ID_HERE');
