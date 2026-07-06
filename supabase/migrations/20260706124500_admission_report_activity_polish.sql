-- Polish Admission Hub report activity notes and make repeated-exit auto-submit events idempotent.

DELETE FROM public.adm_candidate_test_events dup
USING public.adm_candidate_test_events keep
WHERE dup.event_type = 'auto_submit_repeated_page_exits'
  AND keep.event_type = 'auto_submit_repeated_page_exits'
  AND dup.attempt_id = keep.attempt_id
  AND (dup.created_at, dup.id) > (keep.created_at, keep.id);

CREATE UNIQUE INDEX IF NOT EXISTS adm_candidate_test_events_one_repeated_exit_auto_submit_per_attempt
  ON public.adm_candidate_test_events(attempt_id)
  WHERE event_type = 'auto_submit_repeated_page_exits';

CREATE OR REPLACE FUNCTION public.rpc_adm_get_attempt_activity(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt adm_attempts%ROWTYPE;
  v_events jsonb;
  v_notes jsonb;
BEGIN
  SELECT * INTO v_attempt FROM adm_attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Attempt not found'); END IF;
  IF NOT EXISTS (SELECT 1 FROM school_members sm WHERE sm.school_id = v_attempt.school_id AND sm.user_id = auth.uid() AND sm.role_in_school IN ('school_admin','teacher') AND sm.status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied — not a member of this school');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('event_type', event_type, 'event_payload', event_payload, 'created_at', created_at) ORDER BY created_at), '[]'::jsonb)
    INTO v_events
  FROM adm_candidate_test_events
  WHERE attempt_id = p_attempt_id;

  WITH counts AS (SELECT event_type, count(*) c FROM adm_candidate_test_events WHERE attempt_id = p_attempt_id GROUP BY event_type),
  ordered_notes AS (
    SELECT 10 ord, 'Page opened ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END AS note FROM counts WHERE event_type = 'page_opened'
    UNION ALL SELECT 20, 'Page reopened ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END FROM counts WHERE event_type = 'page_reopened'
    UNION ALL SELECT 30, 'Page refreshed/reloaded ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END FROM counts WHERE event_type = 'page_reload'
    UNION ALL SELECT 40, 'Candidate left the test page ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END FROM counts WHERE event_type = 'tab_hidden'
    UNION ALL SELECT 50, 'Candidate returned to the test page ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END FROM counts WHERE event_type = 'tab_visible'
    UNION ALL SELECT 60, 'Submit button clicked ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END FROM counts WHERE event_type = 'submit_clicked'
    UNION ALL SELECT 70, 'Timer expired ' || c || ' time' || CASE WHEN c=1 THEN '' ELSE 's' END FROM counts WHERE event_type = 'submit_time_expired'
    UNION ALL SELECT 80, 'Test auto-submitted after repeated page exits.' FROM counts WHERE event_type = 'auto_submit_repeated_page_exits'
    UNION ALL SELECT 90, 'Test submitted.' FROM counts WHERE event_type = 'submitted' AND NOT EXISTS (SELECT 1 FROM counts WHERE event_type = 'auto_submit_repeated_page_exits')
    UNION ALL SELECT 100, 'Submitted at ' || to_char(v_attempt.submitted_at AT TIME ZONE 'UTC', 'HH12:MI AM') WHERE v_attempt.submitted_at IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(note ORDER BY ord), '[]'::jsonb) INTO v_notes FROM ordered_notes;

  RETURN jsonb_build_object('success', true, 'events', v_events, 'notes', v_notes, 'submitted_at', v_attempt.submitted_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adm_get_attempt_activity(uuid) TO authenticated;

-- Recreate submit RPC with idempotent auto-submit event insert only; scoring/finalization logic remains unchanged.
CREATE OR REPLACE FUNCTION public.rpc_adm_submit_attempt(
    p_token TEXT,
    p_attempt_id UUID,
    p_auto_submit_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_candidate adm_candidates%ROWTYPE;
    v_attempt adm_attempts%ROWTYPE;
    v_total_score SMALLINT := 0;
    v_max_score SMALLINT := 0;
    v_pct NUMERIC(5,2);
    v_band TEXT;
    v_ans RECORD;
    v_correct JSONB;
    v_is_correct BOOLEAN;
    v_marks SMALLINT;
    v_writing_pending INT := 0;
    v_ai_pending INT := 0;
BEGIN
    SELECT * INTO v_candidate FROM adm_candidates WHERE token = p_token;
    IF v_candidate.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid token'); END IF;

    SELECT * INTO v_attempt FROM adm_attempts WHERE id = p_attempt_id AND candidate_id = v_candidate.id;
    IF v_attempt.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Attempt not found'); END IF;

    IF v_attempt.status IN ('submitted', 'scored', 'expired') THEN
        RETURN jsonb_build_object('success', true, 'already_final', true, 'attempt_status', v_attempt.status, 'total_score', COALESCE(v_attempt.total_score, 0), 'max_score', COALESCE(v_attempt.max_score, 0), 'percentage', COALESCE(v_attempt.percentage, 0), 'candidate_name', v_candidate.full_name, 'submitted_at', v_attempt.submitted_at);
    END IF;

    FOR v_ans IN SELECT a.id AS answer_id, a.question_id, a.response, a.marks_possible, q.correct_answer, q.correct_index, q.question_type, q.topic, q.skill_tag FROM adm_answers a JOIN adm_questions q ON q.id = a.question_id WHERE a.attempt_id = p_attempt_id
    LOOP
        v_is_correct := false; v_marks := 0; v_correct := v_ans.correct_answer;
        CASE v_ans.question_type
            WHEN 'email_writing', 'essay_writing' THEN v_is_correct := NULL; v_writing_pending := v_writing_pending + 1;
            WHEN 'mcq', 'reading_comprehension' THEN IF v_ans.response IS NOT NULL THEN IF v_ans.response ? 'index' THEN v_is_correct := (v_ans.response->>'index')::int = v_ans.correct_index; ELSE v_is_correct := LOWER(TRIM(v_ans.response #>> '{}')) = LOWER(TRIM(v_correct #>> '{}')); END IF; END IF;
            WHEN 'word_formation', 'gap_fill', 'open_cloze', 'error_correction', 'sentence_transformation', 'short_answer', 'structured' THEN IF v_ans.response IS NOT NULL AND v_correct IS NOT NULL THEN v_is_correct := LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(v_ans.response #>> '{}', '^\s*(the|a|an)\s+', '', 'i'), '[.!?,;:]+$', ''))) = LOWER(TRIM(REGEXP_REPLACE(v_correct #>> '{}', '[.!?,;:]+$', ''))); END IF;
            ELSE IF v_ans.response IS NOT NULL AND v_correct IS NOT NULL THEN v_is_correct := LOWER(TRIM(v_ans.response #>> '{}')) = LOWER(TRIM(v_correct #>> '{}')); END IF;
        END CASE;
        IF v_ans.question_type NOT IN ('email_writing', 'essay_writing') THEN
            IF v_is_correct THEN v_marks := v_ans.marks_possible; END IF;
            v_max_score := v_max_score + v_ans.marks_possible;
            IF v_ans.question_type IN ('gap_fill','sentence_transformation','error_correction','word_formation','open_cloze','short_answer','structured') THEN v_ai_pending := v_ai_pending + 1; END IF;
        END IF;
        v_total_score := v_total_score + v_marks;
        UPDATE adm_answers SET is_correct = v_is_correct, marks_awarded = v_marks WHERE id = v_ans.answer_id;
    END LOOP;

    SELECT v_max_score + COALESCE(SUM(COALESCE(fq.marks_override, q.marks)), 0) INTO v_max_score FROM adm_test_form_questions fq JOIN adm_questions q ON q.id = fq.question_id WHERE fq.form_id = v_attempt.form_id AND fq.question_id NOT IN (SELECT question_id FROM adm_answers WHERE attempt_id = p_attempt_id);
    v_pct := CASE WHEN v_max_score > 0 THEN ROUND((v_total_score::numeric / v_max_score::numeric) * 100, 2) ELSE 0 END;
    v_band := CASE WHEN v_pct >= 80 THEN 'A' WHEN v_pct >= 65 THEN 'B' WHEN v_pct >= 50 THEN 'C' WHEN v_pct >= 35 THEN 'D' ELSE 'E' END;
    UPDATE adm_attempts SET status = 'scored', submitted_at = COALESCE(submitted_at, NOW()), total_score = v_total_score, max_score = v_max_score, percentage = v_pct WHERE id = p_attempt_id;

    IF p_auto_submit_reason = 'repeated_page_exits' THEN
      INSERT INTO adm_candidate_test_events (school_id, candidate_id, attempt_id, form_id, event_type, event_payload)
      VALUES (v_attempt.school_id, v_candidate.id, p_attempt_id, v_attempt.form_id, 'auto_submit_repeated_page_exits', jsonb_build_object('note','Test auto-submitted after repeated page exits.'))
      ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details) VALUES (v_attempt.school_id, CASE WHEN p_auto_submit_reason = 'repeated_page_exits' THEN 'attempt_auto_submitted' ELSE 'attempt_scored' END, 'attempt', p_attempt_id, jsonb_build_object('candidate', v_candidate.full_name, 'score', v_total_score, 'max', v_max_score, 'percentage', v_pct, 'band', v_band, 'auto_submit_reason', p_auto_submit_reason));
    RETURN jsonb_build_object('success', true, 'attempt_status', 'scored', 'total_score', v_total_score, 'max_score', v_max_score, 'percentage', v_pct, 'band', v_band, 'candidate_name', v_candidate.full_name, 'writing_pending', v_writing_pending, 'ai_pending', v_ai_pending, 'needs_ai_grading', (v_writing_pending > 0 OR v_ai_pending > 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adm_submit_attempt(TEXT, UUID, TEXT) TO anon, authenticated;
