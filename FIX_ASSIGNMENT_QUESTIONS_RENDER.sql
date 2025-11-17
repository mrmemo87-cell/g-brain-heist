-- ============================================================
-- FIX: Assignment questions not rendering (empty array issue)
-- ============================================================
-- This script fixes the issue where rpc_get_student_active_assignment
-- was returning empty questions array due to RLS policy conflicts.
-- 
-- The function now uses SECURITY DEFINER context properly to bypass
-- RLS policies on the questions table when loading assignment questions.
--
-- IMPORTANT: Just run this entire script in Supabase SQL Editor.
-- DO NOT try to test the function here - test it from the frontend.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_get_student_active_assignment()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_assignment_id uuid;
  payload jsonb;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- First, find the active assignment for this student
  -- Only select assignments that actually have questions
  SELECT sa.assignment_id INTO v_assignment_id
  FROM student_assignments sa
  WHERE sa.student_id = v_student_id
    AND sa.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM assignment_questions aq
      WHERE aq.assignment_id = sa.assignment_id
    )
  ORDER BY sa.assigned_at
  LIMIT 1;

  -- If no assignment found, return null
  IF v_assignment_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build the payload with all assignment details and questions
  -- Using SECURITY DEFINER context to bypass RLS on questions table
  SELECT jsonb_build_object(
    'assignment_id', a.id,
    'subject_id', a.subject_id,
    'subject_name', a.subject_name,
    'topic_name', a.topic_name,
    'batch', a.batch,
    'teacher_username', u.username,
    'assigned_at', a.assigned_at,
    'due_at', a.due_at,
    'title', a.title,
    'instructions', a.instructions,
    'questions', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'teacher_id', q.teacher_id,
            'subject', q.subject,
            'subject_id', q.subject_id,
            'topic', q.topic,
            'topic_name', q.topic_name,
            'difficulty', q.difficulty,
            'question_text', q.question_text,
            'question_type', q.question_type,
            'options', q.options,
            'correct_answer', q.correct_answer,
            'explanation', q.explanation,
            'hints', q.hints,
            'time_limit', q.time_limit,
            'points', q.points,
            'tags', q.tags,
            'grade_level', q.grade_level,
            'is_public', q.is_public,
            'is_active', q.is_active,
            'times_answered', q.times_answered,
            'times_correct', q.times_correct,
            'created_at', q.created_at,
            'updated_at', q.updated_at
          )
          ORDER BY aq.order_index
        ),
        '[]'::jsonb
      )
      FROM assignment_questions aq
      JOIN questions q ON q.id = aq.question_id
      WHERE aq.assignment_id = v_assignment_id
    )
  ) INTO payload
  FROM assignments a
  JOIN teachers t ON t.id = a.teacher_id
  JOIN users u ON u.id = t.user_id
  WHERE a.id = v_assignment_id;

  RETURN payload;
END;
$$;

-- Function updated successfully!
-- Test this from your frontend application as a logged-in student.
-- The function will only work when called with proper authentication context.
