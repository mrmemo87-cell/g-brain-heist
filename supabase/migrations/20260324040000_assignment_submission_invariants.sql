-- Harden assignment submission invariants server-side.

CREATE OR REPLACE FUNCTION public.rpc_submit_assignment_result(
  p_assignment_id uuid,
  p_correct int,
  p_incorrect int,
  p_accuracy int,
  p_score int,
  p_time_taken int
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_assignment_status text;
  v_question_count int;
  v_max_score int;
  v_expected_accuracy int;
  v_updated_assignment_id uuid;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ASSIGNMENT_ID';
  END IF;

  SELECT
    sa.status,
    COUNT(aq.question_id)::int AS question_count,
    COALESCE(SUM(COALESCE(q.points, 0)), 0)::int AS max_score
  INTO v_assignment_status, v_question_count, v_max_score
  FROM assignments a
  JOIN student_assignments sa
    ON sa.assignment_id = a.id
   AND sa.student_id = v_student_id
  LEFT JOIN assignment_questions aq
    ON aq.assignment_id = a.id
  LEFT JOIN questions q
    ON q.id = aq.question_id
  WHERE a.id = p_assignment_id
  GROUP BY sa.status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND_OR_NOT_ASSIGNED';
  END IF;

  IF v_question_count <= 0 THEN
    RAISE EXCEPTION 'ASSIGNMENT_HAS_NO_QUESTIONS';
  END IF;

  IF v_assignment_status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_SUBMITTABLE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM student_assignment_results r
    WHERE r.assignment_id = p_assignment_id
      AND r.student_id = v_student_id
  ) THEN
    RAISE EXCEPTION 'ASSIGNMENT_ALREADY_SUBMITTED';
  END IF;

  IF p_correct < 0 OR p_incorrect < 0 OR p_time_taken < 0 OR p_score < 0 OR p_accuracy < 0 THEN
    RAISE EXCEPTION 'INVALID_NEGATIVE_VALUES';
  END IF;

  IF p_accuracy > 100 THEN
    RAISE EXCEPTION 'INVALID_ACCURACY_RANGE';
  END IF;

  IF p_correct > v_question_count OR p_incorrect > v_question_count THEN
    RAISE EXCEPTION 'INVALID_QUESTION_COUNTS';
  END IF;

  IF (p_correct + p_incorrect) <> v_question_count THEN
    RAISE EXCEPTION 'MISMATCHED_QUESTION_TOTAL';
  END IF;

  v_expected_accuracy := ROUND((p_correct::numeric * 100.0) / GREATEST(v_question_count, 1));
  IF ABS(p_accuracy - v_expected_accuracy) > 1 THEN
    RAISE EXCEPTION 'INVALID_ACCURACY_CALCULATION';
  END IF;

  IF p_score > GREATEST(100, v_max_score) THEN
    RAISE EXCEPTION 'INVALID_SCORE_RANGE';
  END IF;

  UPDATE student_assignments
  SET status = 'completed', completed_at = NOW()
  WHERE assignment_id = p_assignment_id
    AND student_id = v_student_id
    AND status IN ('pending', 'in_progress')
  RETURNING assignment_id INTO v_updated_assignment_id;

  IF v_updated_assignment_id IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_STATE_TRANSITION_FAILED';
  END IF;

  INSERT INTO student_assignment_results (
    assignment_id,
    student_id,
    correct,
    incorrect,
    accuracy,
    score,
    time_taken_seconds,
    completed_at
  ) VALUES (
    p_assignment_id,
    v_student_id,
    GREATEST(p_correct, 0),
    GREATEST(p_incorrect, 0),
    GREATEST(p_accuracy, 0),
    GREATEST(p_score, 0),
    GREATEST(p_time_taken, 0),
    NOW()
  );
END;
$$;
