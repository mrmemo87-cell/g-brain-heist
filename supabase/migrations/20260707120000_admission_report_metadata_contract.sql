-- Stabilize Admission candidate report metadata shape for subject-aware UI reports.
-- The report contract includes top-level form_code, form_title, form_subject, subject, grade, and scored attempt fields.
-- Metadata is sourced from adm_attempts -> adm_test_forms -> adm_blueprints plus adm_candidates.


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
    v_answers jsonb := '[]'::jsonb;
    v_topic_breakdown jsonb := '[]'::jsonb;
    v_skill_breakdown jsonb := '[]'::jsonb;
    v_type_breakdown jsonb := '[]'::jsonb;
    v_difficulty_breakdown jsonb := '[]'::jsonb;
    v_strengths jsonb := '[]'::jsonb;
    v_weaknesses jsonb := '[]'::jsonb;
    v_answer_details_available boolean := true;
    v_total_questions int := 0;
    v_content_version text := NULL;
BEGIN
    SELECT a.* INTO v_attempt
    FROM adm_attempts a
    JOIN adm_test_forms f ON f.id = a.form_id
    JOIN adm_blueprints b ON b.id = f.blueprint_id
    JOIN adm_candidates c ON c.id = a.candidate_id
    WHERE a.id = p_attempt_id;
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

    SELECT c.* INTO v_candidate FROM adm_candidates c WHERE c.id = v_attempt.candidate_id;
    SELECT f.* INTO v_form FROM adm_test_forms f WHERE f.id = v_attempt.form_id AND f.school_id = v_attempt.school_id;
    SELECT b.* INTO v_blueprint FROM adm_blueprints b WHERE b.id = v_form.blueprint_id;
    IF v_candidate.id IS NULL OR v_form.id IS NULL OR v_blueprint.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Report data unavailable');
    END IF;

    v_form_subject := COALESCE(v_blueprint.subject, CASE WHEN v_form.form_code ILIKE 'ENG%' THEN 'english' WHEN v_form.form_code ILIKE 'MAT%' THEN 'math' WHEN v_form.form_code ILIKE 'SCI%' THEN 'science' END, 'unknown');
    v_form_grade := COALESCE(v_blueprint.target_grade, v_blueprint.target_stage, v_candidate.applied_grade, NULLIF(substring(v_form.form_code from '[A-Z]+([0-9]{1,2})'), '')::int);
    v_form_title := CONCAT('Grade ', v_form_grade, ' ', CASE WHEN lower(COALESCE(v_form_subject,'')) IN ('math','maths','mathematics') THEN 'Maths' WHEN lower(COALESCE(v_form_subject,'')) = 'science' THEN 'Science' WHEN lower(COALESCE(v_form_subject,'')) = 'english' THEN 'English' ELSE 'General' END, ' Admission Test');

    SELECT count(*) INTO v_total_questions FROM adm_answers ans WHERE ans.attempt_id = p_attempt_id;

    SELECT COALESCE(max(q.content_version), max(qp.content_version)) INTO v_content_version
    FROM adm_answers ans
    LEFT JOIN adm_questions q ON q.id = ans.question_id
    LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id
    WHERE ans.attempt_id = p_attempt_id;

    BEGIN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', ans.id,
          'answer_id', ans.id,
          'question_id', q.id,
          'question_type', q.question_type,
          'stem', q.stem,
          'prompt', q.stem,
          'subject', COALESCE(qp.subject, v_form_subject),
          'content_version', COALESCE(q.content_version, qp.content_version, v_content_version),
          'topic', q.topic,
          'strand', q.strand,
          'subskill', q.subskill,
          'diagnostic_skill', coalesce(q.diagnostic_skill, q.subskill, regexp_replace(coalesce(q.skill_tag, q.topic, q.strand, 'general'), '^math_', '')),
          'skill_tag', q.skill_tag,
          'difficulty', q.difficulty,
          'grade_level', coalesce(q.grade_level, qp.grade_level),
          'stage_level', coalesce(q.stage_level, qp.stage),
          'response', ans.response,
          'options', q.options,
          'correct_answer', q.correct_answer,
          'is_correct', ans.is_correct,
          'marks_awarded', ans.marks_awarded,
          'marks_possible', ans.marks_possible,
          'explanation', q.explanation,
          'ai_feedback', ans.ai_feedback,
          'ai_grading_status', ans.ai_grading_status
        ) ORDER BY coalesce(fq.question_order, 9999), ans.answered_at, ans.id), '[]'::jsonb) INTO v_answers
      FROM adm_attempts a
      JOIN adm_candidates c ON c.id = a.candidate_id
      JOIN adm_test_forms f ON f.id = a.form_id
      JOIN adm_blueprints b ON b.id = f.blueprint_id
      JOIN adm_answers ans ON ans.attempt_id = a.id
      JOIN adm_questions q ON q.id = ans.question_id
      LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id
      LEFT JOIN adm_test_form_questions fq ON fq.question_id = q.id AND fq.form_id = a.form_id
      WHERE a.id = p_attempt_id;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      v_answer_details_available := false;
      SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', ans.id, 'answer_id', ans.id, 'question_id', ans.question_id,
          'response', ans.response, 'is_correct', ans.is_correct,
          'marks_awarded', ans.marks_awarded, 'marks_possible', ans.marks_possible,
          'ai_feedback', ans.ai_feedback, 'subject', v_form_subject
        ) ORDER BY ans.answered_at, ans.id), '[]'::jsonb) INTO v_answers
      FROM adm_answers ans WHERE ans.attempt_id = p_attempt_id;
    END;

    BEGIN
      SELECT coalesce(jsonb_agg(topic_row), '[]'::jsonb) INTO v_topic_breakdown FROM (SELECT jsonb_build_object('topic', q.topic, 'subject', COALESCE(qp.subject, v_form_subject), 'correct', sum(case when ans.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(ans.marks_awarded), 'max_marks', sum(ans.marks_possible), 'percentage', round(sum(ans.marks_awarded)::numeric / nullif(sum(ans.marks_possible),0)::numeric * 100)) topic_row FROM adm_answers ans JOIN adm_questions q ON q.id = ans.question_id LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id WHERE ans.attempt_id = p_attempt_id AND q.topic IS NOT NULL GROUP BY COALESCE(qp.subject, v_form_subject), q.topic) sub;
      SELECT coalesce(jsonb_agg(skill_row), '[]'::jsonb) INTO v_skill_breakdown FROM (SELECT jsonb_build_object('subject', COALESCE(qp.subject, v_form_subject), 'skill', coalesce(q.diagnostic_skill, q.subskill, regexp_replace(coalesce(q.skill_tag, q.topic, q.strand, 'general'), '^math_', '')), 'correct', sum(case when ans.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(ans.marks_awarded), 'max_marks', sum(ans.marks_possible), 'percentage', round(sum(ans.marks_awarded)::numeric / nullif(sum(ans.marks_possible),0)::numeric * 100)) skill_row FROM adm_answers ans JOIN adm_questions q ON q.id = ans.question_id LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id WHERE ans.attempt_id = p_attempt_id GROUP BY COALESCE(qp.subject, v_form_subject), coalesce(q.diagnostic_skill, q.subskill, regexp_replace(coalesce(q.skill_tag, q.topic, q.strand, 'general'), '^math_', ''))) sub;
      SELECT coalesce(jsonb_agg(diff_row), '[]'::jsonb) INTO v_difficulty_breakdown FROM (SELECT jsonb_build_object('subject', COALESCE(qp.subject, v_form_subject), 'difficulty', q.difficulty, 'correct', sum(case when ans.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(ans.marks_awarded), 'max_marks', sum(ans.marks_possible), 'percentage', round(sum(ans.marks_awarded)::numeric / nullif(sum(ans.marks_possible),0)::numeric * 100)) diff_row FROM adm_answers ans JOIN adm_questions q ON q.id = ans.question_id LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id WHERE ans.attempt_id = p_attempt_id GROUP BY COALESCE(qp.subject, v_form_subject), q.difficulty) sub;
      SELECT coalesce(jsonb_agg(type_row), '[]'::jsonb) INTO v_type_breakdown FROM (SELECT jsonb_build_object('type', q.question_type, 'correct', sum(case when ans.is_correct then 1 else 0 end), 'total', count(*), 'marks', sum(ans.marks_awarded), 'max_marks', sum(ans.marks_possible)) type_row FROM adm_answers ans JOIN adm_questions q ON q.id = ans.question_id WHERE ans.attempt_id = p_attempt_id GROUP BY q.question_type) sub;
      SELECT coalesce(jsonb_agg(skill), '[]'::jsonb) INTO v_strengths FROM (SELECT coalesce(q.diagnostic_skill, q.subskill, q.topic) AS skill FROM adm_answers ans JOIN adm_questions q ON q.id = ans.question_id WHERE ans.attempt_id = p_attempt_id AND coalesce(q.diagnostic_skill, q.subskill, q.topic) IS NOT NULL GROUP BY coalesce(q.diagnostic_skill, q.subskill, q.topic) HAVING (sum(ans.marks_awarded)::numeric / nullif(sum(ans.marks_possible),0)::numeric) >= 0.7) strong;
      SELECT coalesce(jsonb_agg(skill), '[]'::jsonb) INTO v_weaknesses FROM (SELECT coalesce(q.diagnostic_skill, q.subskill, q.topic) AS skill FROM adm_answers ans JOIN adm_questions q ON q.id = ans.question_id WHERE ans.attempt_id = p_attempt_id AND coalesce(q.diagnostic_skill, q.subskill, q.topic) IS NOT NULL GROUP BY coalesce(q.diagnostic_skill, q.subskill, q.topic) HAVING (sum(ans.marks_awarded)::numeric / nullif(sum(ans.marks_possible),0)::numeric) < 0.5) weak;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      v_answer_details_available := false;
    END;

    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'form_code', v_form.form_code, 'form_subject', v_form_subject, 'subject', v_form_subject, 'grade', v_form_grade, 'form_title', v_form_title, 'formCode', v_form.form_code, 'formSubject', v_form_subject, 'formTitle', v_form_title, 'content_version', v_content_version, 'status', v_attempt.status, 'total_score', v_attempt.total_score, 'max_score', v_attempt.max_score, 'percentage', v_attempt.percentage, 'started_at', v_attempt.started_at, 'submitted_at', v_attempt.submitted_at, 'answer_details_available', v_answer_details_available, 'answer_detail_message', CASE WHEN v_answer_details_available THEN NULL ELSE 'Detailed answers unavailable' END, 'total_questions', v_total_questions, 'candidate', jsonb_build_object('id', v_candidate.id, 'name', v_candidate.full_name, 'email', v_candidate.email, 'applied_grade', v_candidate.applied_grade, 'current_grade', v_candidate.current_grade, 'date_of_birth', v_candidate.date_of_birth, 'previous_curriculum', v_candidate.previous_curriculum, 'previous_school_language', v_candidate.previous_school_language, 'home_language', v_candidate.home_language, 'years_english_medium', v_candidate.years_english_medium, 'admin_notes', coalesce(v_candidate.admin_notes, v_candidate.notes)), 'attempt', jsonb_build_object('id', v_attempt.id, 'total_score', v_attempt.total_score, 'max_score', v_attempt.max_score, 'percentage', v_attempt.percentage, 'started_at', v_attempt.started_at, 'submitted_at', v_attempt.submitted_at, 'status', v_attempt.status), 'band', case when v_attempt.percentage >= 80 then 'A' when v_attempt.percentage >= 65 then 'B' when v_attempt.percentage >= 50 then 'C' when v_attempt.percentage >= 35 then 'D' else 'E' end, 'answers', coalesce(v_answers, '[]'::jsonb), 'topic_breakdown', v_topic_breakdown, 'skill_breakdown', v_skill_breakdown, 'difficulty_breakdown', v_difficulty_breakdown, 'type_breakdown', v_type_breakdown, 'strengths', v_strengths, 'weaknesses', v_weaknesses);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_adm_get_candidate_report(uuid) TO authenticated;
