-- Ensure candidate Admission Test starts include reading passage context and metadata.

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
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Validate candidate token
    SELECT * INTO v_candidate
    FROM adm_candidates WHERE token = p_token;

    IF v_candidate.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid access token');
    END IF;

    IF v_candidate.status = 'placed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This candidate has already been placed');
    END IF;

    -- 2. Find the test form
    SELECT * INTO v_form
    FROM adm_test_forms
    WHERE form_code = p_form_code
      AND school_id = v_candidate.school_id;

    IF v_form.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Test form not found');
    END IF;

    IF v_form.status != 'published' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This test is not currently available');
    END IF;

    -- 3. Get blueprint for duration
    SELECT * INTO v_blueprint
    FROM adm_blueprints WHERE id = v_form.blueprint_id;

    -- 4. Check for existing in-progress attempt (allow resume)
    SELECT * INTO v_existing_attempt
    FROM adm_attempts
    WHERE candidate_id = v_candidate.id
      AND form_id = v_form.id
      AND status = 'in_progress';

    IF v_existing_attempt.id IS NOT NULL THEN
        -- Check if expired
        IF NOW() > v_existing_attempt.expires_at THEN
            UPDATE adm_attempts SET status = 'expired' WHERE id = v_existing_attempt.id;
            RETURN jsonb_build_object('success', false, 'error', 'Your test session has expired');
        END IF;

        -- Resume: return existing attempt with questions
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', q.id,
                'question_type', q.question_type,
                'stem', q.stem,
                'stem_image_url', q.stem_image_url,
                'passage', q.passage,
                'reading_passage_id', q.reading_passage_id,
                'diagnostic_skill', q.diagnostic_skill,
                'options', q.options,
                'keyword', q.keyword,
                'base_word', q.base_word,
                'marks', COALESCE(fq.marks_override, q.marks),
                'question_order', fq.question_order
            ) ORDER BY fq.question_order
        ) INTO v_questions
        FROM adm_test_form_questions fq
        JOIN adm_questions q ON q.id = fq.question_id
        WHERE fq.form_id = v_form.id;

        RETURN jsonb_build_object(
            'success', true,
            'attempt_id', v_existing_attempt.id,
            'resumed', true,
            'expires_at', v_existing_attempt.expires_at,
            'duration_minutes', v_blueprint.duration_minutes,
            'delivery_mode', v_blueprint.delivery_mode,
            'subject', v_blueprint.subject,
            'grade', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage),
            'form_title', CONCAT('Grade ', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), ' ', CASE WHEN lower(v_blueprint.subject) IN ('math','maths','mathematics') THEN 'Maths' WHEN lower(v_blueprint.subject) = 'science' THEN 'Science' ELSE 'English' END, ' Admission Test'),
            'candidate_name', v_candidate.full_name,
            'questions', v_questions
        );
    END IF;

    -- 5. Check attempt limit (max 1 attempt per form per candidate)
    IF EXISTS (
        SELECT 1 FROM adm_attempts
        WHERE candidate_id = v_candidate.id AND form_id = v_form.id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You have already taken this test');
    END IF;

    -- 6. Create new attempt
    v_expires_at := NOW() + (v_blueprint.duration_minutes || ' minutes')::INTERVAL;
    v_attempt_id := gen_random_uuid();

    INSERT INTO adm_attempts (id, candidate_id, form_id, school_id, expires_at, max_score, status)
    VALUES (v_attempt_id, v_candidate.id, v_form.id, v_candidate.school_id, v_expires_at,
            v_blueprint.total_marks, 'in_progress');

    -- Update candidate status
    UPDATE adm_candidates SET status = 'testing' WHERE id = v_candidate.id;

    -- 7. Fetch questions (without answers!)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', q.id,
            'question_type', q.question_type,
            'stem', q.stem,
            'stem_image_url', q.stem_image_url,
            'passage', q.passage,
            'reading_passage_id', q.reading_passage_id,
            'diagnostic_skill', q.diagnostic_skill,
            'options', q.options,
            'keyword', q.keyword,
            'base_word', q.base_word,
            'marks', COALESCE(fq.marks_override, q.marks),
            'question_order', fq.question_order
        ) ORDER BY fq.question_order
    ) INTO v_questions
    FROM adm_test_form_questions fq
    JOIN adm_questions q ON q.id = fq.question_id
    WHERE fq.form_id = v_form.id;

    -- 8. Audit log
    INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
    VALUES (v_candidate.school_id, 'attempt_started', 'attempt', v_attempt_id,
            jsonb_build_object('candidate', v_candidate.full_name, 'form_code', p_form_code));

    RETURN jsonb_build_object(
        'success', true,
        'attempt_id', v_attempt_id,
        'resumed', false,
        'expires_at', v_expires_at,
        'duration_minutes', v_blueprint.duration_minutes,
        'delivery_mode', v_blueprint.delivery_mode,
        'subject', v_blueprint.subject,
        'grade', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage),
        'form_title', CONCAT('Grade ', COALESCE(v_blueprint.target_grade, v_blueprint.target_stage), ' ', CASE WHEN lower(v_blueprint.subject) IN ('math','maths','mathematics') THEN 'Maths' WHEN lower(v_blueprint.subject) = 'science' THEN 'Science' ELSE 'English' END, ' Admission Test'),
        'candidate_name', v_candidate.full_name,
        'questions', v_questions
    );
END;
$$;


GRANT EXECUTE ON FUNCTION public.rpc_adm_start_attempt(TEXT, TEXT) TO anon, authenticated;
