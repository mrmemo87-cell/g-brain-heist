-- Admission attempt lifecycle consistency fixes from Sondos staging smoke test.
-- Keeps candidate UI/backend/admin activity on the same attempt source of truth.

ALTER TABLE public.adm_candidate_test_events
  DROP CONSTRAINT IF EXISTS adm_candidate_test_events_event_type_check;

ALTER TABLE public.adm_candidate_test_events
  ADD CONSTRAINT adm_candidate_test_events_event_type_check CHECK (event_type IN (
    'page_opened','page_reopened','page_reload','tab_hidden','tab_visible',
    'possible_multi_session','submit_clicked','submit_time_expired','submitted',
    'auto_submit_repeated_page_exits'
  ));

DROP FUNCTION IF EXISTS public.rpc_adm_submit_attempt(TEXT, UUID);

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
        RETURN jsonb_build_object(
          'success', true,
          'already_final', true,
          'attempt_status', v_attempt.status,
          'total_score', COALESCE(v_attempt.total_score, 0),
          'max_score', COALESCE(v_attempt.max_score, 0),
          'percentage', COALESCE(v_attempt.percentage, 0),
          'candidate_name', v_candidate.full_name,
          'submitted_at', v_attempt.submitted_at
        );
    END IF;

    FOR v_ans IN
        SELECT a.id AS answer_id, a.question_id, a.response, a.marks_possible,
               q.correct_answer, q.correct_index, q.question_type, q.topic, q.skill_tag
        FROM adm_answers a JOIN adm_questions q ON q.id = a.question_id
        WHERE a.attempt_id = p_attempt_id
    LOOP
        v_is_correct := false; v_marks := 0; v_correct := v_ans.correct_answer;
        CASE v_ans.question_type
            WHEN 'email_writing', 'essay_writing' THEN v_is_correct := NULL; v_writing_pending := v_writing_pending + 1;
            WHEN 'mcq', 'reading_comprehension' THEN
                IF v_ans.response IS NOT NULL THEN
                    IF v_ans.response ? 'index' THEN v_is_correct := (v_ans.response->>'index')::int = v_ans.correct_index;
                    ELSE v_is_correct := LOWER(TRIM(v_ans.response #>> '{}')) = LOWER(TRIM(v_correct #>> '{}')); END IF;
                END IF;
            WHEN 'word_formation', 'gap_fill', 'open_cloze', 'error_correction', 'sentence_transformation', 'short_answer', 'structured' THEN
                IF v_ans.response IS NOT NULL AND v_correct IS NOT NULL THEN
                    v_is_correct := LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(v_ans.response #>> '{}', '^\s*(the|a|an)\s+', '', 'i'), '[.!?,;:]+$', ''))) =
                                    LOWER(TRIM(REGEXP_REPLACE(v_correct #>> '{}', '[.!?,;:]+$', '')));
                END IF;
            ELSE
                IF v_ans.response IS NOT NULL AND v_correct IS NOT NULL THEN v_is_correct := LOWER(TRIM(v_ans.response #>> '{}')) = LOWER(TRIM(v_correct #>> '{}')); END IF;
        END CASE;
        IF v_ans.question_type NOT IN ('email_writing', 'essay_writing') THEN
            IF v_is_correct THEN v_marks := v_ans.marks_possible; END IF;
            v_max_score := v_max_score + v_ans.marks_possible;
            IF v_ans.question_type IN ('gap_fill','sentence_transformation','error_correction','word_formation','open_cloze','short_answer','structured') THEN v_ai_pending := v_ai_pending + 1; END IF;
        END IF;
        v_total_score := v_total_score + v_marks;
        UPDATE adm_answers SET is_correct = v_is_correct, marks_awarded = v_marks WHERE id = v_ans.answer_id;
    END LOOP;

    SELECT v_max_score + COALESCE(SUM(COALESCE(fq.marks_override, q.marks)), 0) INTO v_max_score
    FROM adm_test_form_questions fq JOIN adm_questions q ON q.id = fq.question_id
    WHERE fq.form_id = v_attempt.form_id AND fq.question_id NOT IN (SELECT question_id FROM adm_answers WHERE attempt_id = p_attempt_id);

    v_pct := CASE WHEN v_max_score > 0 THEN ROUND((v_total_score::numeric / v_max_score::numeric) * 100, 2) ELSE 0 END;
    v_band := CASE WHEN v_pct >= 80 THEN 'A' WHEN v_pct >= 65 THEN 'B' WHEN v_pct >= 50 THEN 'C' WHEN v_pct >= 35 THEN 'D' ELSE 'E' END;

    UPDATE adm_attempts SET status = 'scored', submitted_at = COALESCE(submitted_at, NOW()), total_score = v_total_score, max_score = v_max_score, percentage = v_pct WHERE id = p_attempt_id;

    IF p_auto_submit_reason = 'repeated_page_exits' THEN
      INSERT INTO adm_candidate_test_events (school_id, candidate_id, attempt_id, form_id, event_type, event_payload)
      VALUES (v_attempt.school_id, v_candidate.id, p_attempt_id, v_attempt.form_id, 'auto_submit_repeated_page_exits', jsonb_build_object('note','Auto-submitted after repeated page exits.'));
    END IF;

    INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
    VALUES (v_attempt.school_id, CASE WHEN p_auto_submit_reason = 'repeated_page_exits' THEN 'attempt_auto_submitted' ELSE 'attempt_scored' END, 'attempt', p_attempt_id,
            jsonb_build_object('candidate', v_candidate.full_name, 'score', v_total_score, 'max', v_max_score, 'percentage', v_pct, 'band', v_band, 'auto_submit_reason', p_auto_submit_reason));

    RETURN jsonb_build_object('success', true, 'attempt_status', 'scored', 'total_score', v_total_score, 'max_score', v_max_score, 'percentage', v_pct, 'band', v_band, 'candidate_name', v_candidate.full_name, 'writing_pending', v_writing_pending, 'ai_pending', v_ai_pending, 'needs_ai_grading', (v_writing_pending > 0 OR v_ai_pending > 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adm_submit_attempt(TEXT, UUID, TEXT) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.rpc_adm_start_attempt(
    p_token TEXT,
    p_form_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_candidate adm_candidates%ROWTYPE;
    v_form adm_test_forms%ROWTYPE;
    v_blueprint adm_blueprints%ROWTYPE;
    v_attempt_id UUID;
    v_existing_attempt adm_attempts%ROWTYPE;
    v_questions JSONB;
    v_saved_answers JSONB;
    v_final_attempt adm_attempts%ROWTYPE;
    v_counted_page_leaves INT := 0;
    v_expires_at TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_candidate FROM adm_candidates WHERE token = p_token;
    IF v_candidate.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid access token'); END IF;
    IF v_candidate.status = 'placed' THEN RETURN jsonb_build_object('success', false, 'error', 'This candidate has already been placed'); END IF;

    SELECT * INTO v_form FROM adm_test_forms WHERE form_code = p_form_code AND school_id = v_candidate.school_id;
    IF v_form.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Test form not found'); END IF;
    IF v_form.status != 'published' THEN RETURN jsonb_build_object('success', false, 'error', 'This test is not currently available'); END IF;
    SELECT * INTO v_blueprint FROM adm_blueprints WHERE id = v_form.blueprint_id;

    SELECT * INTO v_existing_attempt FROM adm_attempts
    WHERE candidate_id = v_candidate.id AND form_id = v_form.id AND status = 'in_progress'
    ORDER BY created_at DESC LIMIT 1;

    SELECT * INTO v_final_attempt FROM adm_attempts
    WHERE candidate_id = v_candidate.id AND form_id = v_form.id AND status IN ('submitted','scored','expired')
    ORDER BY submitted_at DESC NULLS LAST, created_at DESC LIMIT 1;

    IF v_existing_attempt.id IS NOT NULL AND NOW() > v_existing_attempt.expires_at THEN
      UPDATE adm_attempts SET status = 'expired' WHERE id = v_existing_attempt.id;
      RETURN jsonb_build_object('success', false, 'error', 'Your test session has expired');
    END IF;

    IF v_existing_attempt.id IS NULL AND v_final_attempt.id IS NOT NULL THEN
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'question_type', q.question_type, 'stem', q.stem, 'stem_image_url', q.stem_image_url,
        'passage', q.passage, 'reading_passage_id', q.reading_passage_id, 'diagnostic_skill', q.diagnostic_skill,
        'options', q.options, 'keyword', q.keyword, 'base_word', q.base_word,
        'marks', COALESCE(fq.marks_override, q.marks), 'question_order', fq.question_order
      ) ORDER BY fq.question_order) INTO v_questions
      FROM adm_test_form_questions fq JOIN adm_questions q ON q.id = fq.question_id WHERE fq.form_id = v_form.id;
      SELECT COALESCE(jsonb_object_agg(question_id::text, response), '{}'::jsonb) INTO v_saved_answers FROM adm_answers WHERE attempt_id = v_final_attempt.id;
      RETURN jsonb_build_object('success', true, 'completed', true, 'attempt_id', v_final_attempt.id, 'attempt_status', v_final_attempt.status, 'submitted_at', v_final_attempt.submitted_at, 'candidate_name', v_candidate.full_name, 'subject', v_blueprint.subject, 'grade', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), 'form_title', CONCAT('Grade ', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), ' ', CASE WHEN lower(v_blueprint.subject) IN ('math','maths','mathematics') THEN 'Maths' WHEN lower(v_blueprint.subject) = 'science' THEN 'Science' ELSE 'English' END, ' Admission Test'), 'questions', COALESCE(v_questions, '[]'::jsonb), 'saved_answers', COALESCE(v_saved_answers, '{}'::jsonb));
    END IF;

    IF v_existing_attempt.id IS NULL THEN
      v_expires_at := NOW() + (v_blueprint.duration_minutes || ' minutes')::INTERVAL;
      v_attempt_id := gen_random_uuid();
      INSERT INTO adm_attempts (id, candidate_id, form_id, school_id, expires_at, max_score, status)
      VALUES (v_attempt_id, v_candidate.id, v_form.id, v_candidate.school_id, v_expires_at, v_blueprint.total_marks, 'in_progress');
      UPDATE adm_candidates SET status = 'testing' WHERE id = v_candidate.id;
      INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
      VALUES (v_candidate.school_id, 'attempt_started', 'attempt', v_attempt_id, jsonb_build_object('candidate', v_candidate.full_name, 'form_code', p_form_code));
    ELSE
      v_attempt_id := v_existing_attempt.id;
      v_expires_at := v_existing_attempt.expires_at;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
      'id', q.id, 'question_type', q.question_type, 'stem', q.stem, 'stem_image_url', q.stem_image_url,
      'passage', q.passage, 'reading_passage_id', q.reading_passage_id, 'diagnostic_skill', q.diagnostic_skill,
      'options', q.options, 'keyword', q.keyword, 'base_word', q.base_word,
      'marks', COALESCE(fq.marks_override, q.marks), 'question_order', fq.question_order
    ) ORDER BY fq.question_order) INTO v_questions
    FROM adm_test_form_questions fq JOIN adm_questions q ON q.id = fq.question_id WHERE fq.form_id = v_form.id;

    SELECT COALESCE(jsonb_object_agg(question_id::text, response), '{}'::jsonb) INTO v_saved_answers
    FROM adm_answers WHERE attempt_id = v_attempt_id;

    SELECT count(*)::int INTO v_counted_page_leaves
    FROM adm_candidate_test_events
    WHERE attempt_id = v_attempt_id AND event_type = 'tab_visible' AND COALESCE((event_payload->>'hidden_for_ms')::int, 0) >= 2000;

    RETURN jsonb_build_object(
      'success', true, 'attempt_id', v_attempt_id, 'resumed', v_existing_attempt.id IS NOT NULL,
      'expires_at', v_expires_at, 'duration_minutes', v_blueprint.duration_minutes,
      'delivery_mode', v_blueprint.delivery_mode, 'subject', v_blueprint.subject,
      'grade', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage),
      'form_title', CONCAT('Grade ', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), ' ', CASE WHEN lower(v_blueprint.subject) IN ('math','maths','mathematics') THEN 'Maths' WHEN lower(v_blueprint.subject) = 'science' THEN 'Science' ELSE 'English' END, ' Admission Test'),
      'candidate_name', v_candidate.full_name, 'questions', COALESCE(v_questions, '[]'::jsonb), 'saved_answers', COALESCE(v_saved_answers, '{}'::jsonb), 'attempt_status', 'in_progress', 'counted_page_leaves', v_counted_page_leaves
    );
END;
$$;

