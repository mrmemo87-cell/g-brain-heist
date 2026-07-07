-- Make Admission Hub reports subject/form-code aware and ignore noisy tab events after finalization.

CREATE OR REPLACE FUNCTION public.rpc_adm_log_attempt_event(
  p_token text,
  p_form_code text,
  p_attempt_id uuid,
  p_event_type text,
  p_event_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate adm_candidates%ROWTYPE;
  v_attempt adm_attempts%ROWTYPE;
  v_form adm_test_forms%ROWTYPE;
BEGIN
  SELECT * INTO v_candidate FROM adm_candidates WHERE token = p_token;
  IF v_candidate.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid test link'); END IF;

  SELECT * INTO v_form FROM adm_test_forms WHERE form_code = p_form_code AND school_id = v_candidate.school_id;
  IF v_form.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Test form not found'); END IF;

  SELECT * INTO v_attempt FROM adm_attempts
  WHERE id = p_attempt_id AND candidate_id = v_candidate.id AND form_id = v_form.id AND school_id = v_candidate.school_id;
  IF v_attempt.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Attempt not found'); END IF;

  IF v_attempt.status IN ('submitted', 'scored', 'expired') AND p_event_type IN ('tab_hidden', 'tab_visible') THEN
    RETURN jsonb_build_object('success', true, 'ignored_after_final', true);
  END IF;

  INSERT INTO adm_candidate_test_events (school_id, candidate_id, attempt_id, form_id, event_type, event_payload)
  VALUES (v_candidate.school_id, v_candidate.id, v_attempt.id, v_form.id, p_event_type, COALESCE(p_event_payload, '{}'::jsonb))
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adm_log_attempt_event(text, text, uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_adm_get_candidate_report(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt adm_attempts%rowtype;
    v_candidate adm_candidates%rowtype;
    v_form adm_test_forms%rowtype;
    v_blueprint adm_blueprints%rowtype;
    v_form_subject text;
    v_form_grade int;
    v_form_title text;
    v_answers jsonb;
    v_topic_breakdown jsonb;
    v_skill_breakdown jsonb;
    v_type_breakdown jsonb;
    v_difficulty_breakdown jsonb;
    v_strengths jsonb;
    v_weaknesses jsonb;
BEGIN
    SELECT * INTO v_attempt FROM adm_attempts WHERE id = p_attempt_id;
    IF v_attempt.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Attempt not found'); END IF;

    IF NOT (
        EXISTS (SELECT 1 FROM school_members sm WHERE sm.school_id = v_attempt.school_id AND sm.user_id = auth.uid() AND sm.role_in_school IN ('school_admin', 'teacher') AND sm.status = 'active')
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.school_id = v_attempt.school_id AND coalesce(u.role, '') IN ('school_admin', 'teacher'))
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;

    IF v_attempt.status <> 'scored' OR v_attempt.submitted_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Result not ready');
    END IF;

    IF v_attempt.total_score IS NULL OR v_attempt.max_score IS NULL OR v_attempt.percentage IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Report data unavailable');
    END IF;

    SELECT * INTO v_candidate FROM adm_candidates WHERE id = v_attempt.candidate_id;
    SELECT * INTO v_form FROM adm_test_forms WHERE id = v_attempt.form_id AND school_id = v_attempt.school_id;
    IF v_candidate.id IS NULL OR v_form.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Report data unavailable');
    END IF;
    SELECT * INTO v_blueprint FROM adm_blueprints WHERE id = v_form.blueprint_id;
    v_form_subject := COALESCE(v_blueprint.subject, CASE WHEN v_form.form_code ILIKE 'ENG%' THEN 'english' WHEN v_form.form_code ILIKE 'MAT%' THEN 'math' WHEN v_form.form_code ILIKE 'SCI%' THEN 'science' END);
    v_form_grade := COALESCE(v_blueprint.target_grade, v_blueprint.target_stage, v_candidate.applied_grade, NULLIF(substring(v_form.form_code from '[A-Z]+([0-9]{1,2})'), '')::int);
    v_form_title := CONCAT('Grade ', v_form_grade, ' ', CASE WHEN lower(COALESCE(v_form_subject,'')) IN ('math','maths','mathematics') THEN 'Maths' WHEN lower(COALESCE(v_form_subject,'')) = 'science' THEN 'Science' WHEN lower(COALESCE(v_form_subject,'')) = 'english' THEN 'English' ELSE 'General' END, ' Admission Test');

    SELECT jsonb_agg(jsonb_build_object('question_id', q.id, 'question_type', q.question_type, 'stem', q.stem, 'subject', COALESCE(qp.subject, v_form_subject), 'content_version', COALESCE(q.content_version, qp.content_version), 'topic', q.topic, 'diagnostic_skill', coalesce(q.diagnostic_skill, regexp_replace(coalesce(q.skill_tag, q.topic, 'general'), '^math_', '')), 'skill_tag', q.skill_tag, 'difficulty', q.difficulty, 'grade_level', coalesce(q.grade_level, qp.grade_level), 'stage_level', coalesce(q.stage_level, qp.stage), 'response', a.response, 'correct_answer', q.correct_answer, 'is_correct', a.is_correct, 'marks_awarded', a.marks_awarded, 'marks_possible', a.marks_possible, 'explanation', q.explanation, 'ai_feedback', a.ai_feedback) order by fq.question_order) INTO v_answers
    FROM adm_answers a JOIN adm_questions q ON q.id = a.question_id JOIN adm_question_pools qp ON qp.id = q.pool_id JOIN adm_test_form_questions fq ON fq.question_id = q.id AND fq.form_id = v_attempt.form_id
    WHERE a.attempt_id = p_attempt_id;

    SELECT jsonb_agg(topic_row) INTO v_topic_breakdown FROM (SELECT jsonb_build_object('topic', q.topic, 'subject', COALESCE(qp.subject, v_form_subject), 'correct', sum(case when a.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(a.marks_awarded), 'max_marks', sum(a.marks_possible), 'percentage', round(sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric * 100)) topic_row FROM adm_answers a JOIN adm_questions q ON q.id = a.question_id JOIN adm_question_pools qp ON qp.id = q.pool_id WHERE a.attempt_id = p_attempt_id AND q.topic IS NOT NULL GROUP BY COALESCE(qp.subject, v_form_subject), q.topic) sub;
    SELECT jsonb_agg(skill_row) INTO v_skill_breakdown FROM (SELECT jsonb_build_object('subject', COALESCE(qp.subject, v_form_subject), 'skill', coalesce(q.diagnostic_skill, regexp_replace(coalesce(q.skill_tag, q.topic, 'general'), '^math_', '')), 'correct', sum(case when a.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(a.marks_awarded), 'max_marks', sum(a.marks_possible), 'percentage', round(sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric * 100)) skill_row FROM adm_answers a JOIN adm_questions q ON q.id = a.question_id JOIN adm_question_pools qp ON qp.id = q.pool_id WHERE a.attempt_id = p_attempt_id GROUP BY COALESCE(qp.subject, v_form_subject), coalesce(q.diagnostic_skill, regexp_replace(coalesce(q.skill_tag, q.topic, 'general'), '^math_', ''))) sub;
    SELECT jsonb_agg(diff_row) INTO v_difficulty_breakdown FROM (SELECT jsonb_build_object('subject', COALESCE(qp.subject, v_form_subject), 'difficulty', q.difficulty, 'correct', sum(case when a.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(a.marks_awarded), 'max_marks', sum(a.marks_possible), 'percentage', round(sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric * 100)) diff_row FROM adm_answers a JOIN adm_questions q ON q.id = a.question_id JOIN adm_question_pools qp ON qp.id = q.pool_id WHERE a.attempt_id = p_attempt_id GROUP BY COALESCE(qp.subject, v_form_subject), q.difficulty) sub;
    SELECT jsonb_agg(type_row) INTO v_type_breakdown FROM (SELECT jsonb_build_object('type', q.question_type, 'correct', sum(case when a.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(a.marks_awarded), 'max_marks', sum(a.marks_possible)) type_row FROM adm_answers a JOIN adm_questions q ON q.id = a.question_id WHERE a.attempt_id = p_attempt_id GROUP BY q.question_type) sub;
    SELECT jsonb_agg(skill) INTO v_strengths FROM (SELECT coalesce(q.diagnostic_skill, q.topic) AS skill FROM adm_answers a JOIN adm_questions q ON q.id = a.question_id WHERE a.attempt_id = p_attempt_id AND coalesce(q.diagnostic_skill, q.topic) IS NOT NULL GROUP BY coalesce(q.diagnostic_skill, q.topic) HAVING (sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric) >= 0.7) strong;
    SELECT jsonb_agg(skill) INTO v_weaknesses FROM (SELECT coalesce(q.diagnostic_skill, q.topic) AS skill FROM adm_answers a JOIN adm_questions q ON q.id = a.question_id WHERE a.attempt_id = p_attempt_id AND coalesce(q.diagnostic_skill, q.topic) IS NOT NULL GROUP BY coalesce(q.diagnostic_skill, q.topic) HAVING (sum(a.marks_awarded)::numeric / nullif(sum(a.marks_possible),0)::numeric) < 0.5) weak;

    RETURN jsonb_build_object('success', true, 'form_code', v_form.form_code, 'form_subject', v_form_subject, 'subject', v_form_subject, 'grade', v_form_grade, 'form_title', v_form_title, 'content_version', v_content_version, 'candidate', jsonb_build_object('id', v_candidate.id, 'name', v_candidate.full_name, 'email', v_candidate.email, 'applied_grade', v_candidate.applied_grade, 'current_grade', v_candidate.current_grade, 'date_of_birth', v_candidate.date_of_birth, 'previous_curriculum', v_candidate.previous_curriculum, 'previous_school_language', v_candidate.previous_school_language, 'home_language', v_candidate.home_language, 'years_english_medium', v_candidate.years_english_medium, 'admin_notes', coalesce(v_candidate.admin_notes, v_candidate.notes)), 'attempt', jsonb_build_object('id', v_attempt.id, 'total_score', v_attempt.total_score, 'max_score', v_attempt.max_score, 'percentage', v_attempt.percentage, 'started_at', v_attempt.started_at, 'submitted_at', v_attempt.submitted_at, 'status', v_attempt.status), 'band', case when v_attempt.percentage >= 80 then 'A' when v_attempt.percentage >= 65 then 'B' when v_attempt.percentage >= 50 then 'C' when v_attempt.percentage >= 35 then 'D' else 'E' end, 'answers', coalesce(v_answers, '[]'::jsonb), 'topic_breakdown', coalesce(v_topic_breakdown, '[]'::jsonb), 'skill_breakdown', coalesce(v_skill_breakdown, '[]'::jsonb), 'difficulty_breakdown', coalesce(v_difficulty_breakdown, '[]'::jsonb), 'type_breakdown', coalesce(v_type_breakdown, '[]'::jsonb), 'strengths', coalesce(v_strengths, '[]'::jsonb), 'weaknesses', coalesce(v_weaknesses, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adm_get_candidate_report(uuid) TO authenticated;
