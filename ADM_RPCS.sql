-- ============================================================
-- ADMISSION HUB — Phase 3: Core RPCs
-- ============================================================
-- Run AFTER ADM_SCHEMA_MIGRATION.sql and ADM_RLS_POLICIES.sql
-- All RPCs are SECURITY DEFINER (bypass RLS) since candidates
-- have no Supabase auth — they access via token.
-- ============================================================

-- ============================================================
-- 1. START ATTEMPT — validates token, creates attempt, returns questions
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_adm_start_attempt(
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

    IF v_candidate.status = 'completed' OR v_candidate.status = 'placed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This candidate has already completed testing');
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
        'candidate_name', v_candidate.full_name,
        'questions', v_questions
    );
END;
$$;

-- ============================================================
-- 2. SAVE ANSWER — autosave, idempotent upsert
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_adm_save_answer(
    p_token TEXT,
    p_attempt_id UUID,
    p_question_id UUID,
    p_response JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_candidate adm_candidates%ROWTYPE;
    v_attempt adm_attempts%ROWTYPE;
BEGIN
    -- Validate token
    SELECT * INTO v_candidate FROM adm_candidates WHERE token = p_token;
    IF v_candidate.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
    END IF;

    -- Validate attempt belongs to candidate and is in progress
    SELECT * INTO v_attempt FROM adm_attempts
    WHERE id = p_attempt_id AND candidate_id = v_candidate.id;

    IF v_attempt.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Attempt not found');
    END IF;

    IF v_attempt.status != 'in_progress' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Test already submitted');
    END IF;

    -- Check expiry
    IF NOW() > v_attempt.expires_at THEN
        UPDATE adm_attempts SET status = 'expired' WHERE id = v_attempt.id;
        RETURN jsonb_build_object('success', false, 'error', 'Time expired');
    END IF;

    -- Upsert answer (idempotent)
    INSERT INTO adm_answers (attempt_id, question_id, response, marks_possible, answered_at)
    SELECT p_attempt_id, p_question_id, p_response,
           COALESCE(fq.marks_override, q.marks),
           NOW()
    FROM adm_test_form_questions fq
    JOIN adm_questions q ON q.id = fq.question_id
    WHERE fq.form_id = v_attempt.form_id AND fq.question_id = p_question_id
    ON CONFLICT (attempt_id, question_id)
    DO UPDATE SET response = p_response, answered_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- 3. SUBMIT & SCORE — finalizes attempt, scores all answers
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_adm_submit_attempt(
    p_token TEXT,
    p_attempt_id UUID
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
BEGIN
    -- Validate
    SELECT * INTO v_candidate FROM adm_candidates WHERE token = p_token;
    IF v_candidate.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
    END IF;

    SELECT * INTO v_attempt FROM adm_attempts
    WHERE id = p_attempt_id AND candidate_id = v_candidate.id;

    IF v_attempt.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Attempt not found');
    END IF;

    IF v_attempt.status IN ('submitted', 'scored') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Already submitted');
    END IF;

    -- Score each answer
    FOR v_ans IN
        SELECT a.id AS answer_id, a.question_id, a.response, a.marks_possible,
               q.correct_answer, q.correct_index, q.question_type
        FROM adm_answers a
        JOIN adm_questions q ON q.id = a.question_id
        WHERE a.attempt_id = p_attempt_id
    LOOP
        v_is_correct := false;
        v_marks := 0;
        v_correct := v_ans.correct_answer;

        -- Scoring logic by question type
        CASE v_ans.question_type
            WHEN 'mcq', 'reading_comprehension' THEN
                -- Compare selected index or text
                IF v_ans.response IS NOT NULL THEN
                    IF v_ans.response ? 'index' THEN
                        v_is_correct := (v_ans.response->>'index')::int = v_ans.correct_index;
                    ELSE
                        v_is_correct := LOWER(TRIM(v_ans.response #>> '{}')) = LOWER(TRIM(v_correct #>> '{}'));
                    END IF;
                END IF;
            ELSE
                -- Text-based: case-insensitive trimmed comparison
                IF v_ans.response IS NOT NULL AND v_correct IS NOT NULL THEN
                    v_is_correct := LOWER(TRIM(v_ans.response #>> '{}')) = LOWER(TRIM(v_correct #>> '{}'));
                END IF;
        END CASE;

        IF v_is_correct THEN
            v_marks := v_ans.marks_possible;
        END IF;

        UPDATE adm_answers
        SET is_correct = v_is_correct, marks_awarded = v_marks
        WHERE id = v_ans.answer_id;

        v_total_score := v_total_score + v_marks;
        v_max_score := v_max_score + v_ans.marks_possible;
    END LOOP;

    -- Also count unanswered questions toward max
    SELECT v_max_score + COALESCE(SUM(COALESCE(fq.marks_override, q.marks)), 0)
    INTO v_max_score
    FROM adm_test_form_questions fq
    JOIN adm_questions q ON q.id = fq.question_id
    WHERE fq.form_id = v_attempt.form_id
      AND fq.question_id NOT IN (SELECT question_id FROM adm_answers WHERE attempt_id = p_attempt_id);

    -- Calculate percentage
    IF v_max_score > 0 THEN
        v_pct := ROUND((v_total_score::numeric / v_max_score::numeric) * 100, 2);
    ELSE
        v_pct := 0;
    END IF;

    -- Determine band (A–E)
    v_band := CASE
        WHEN v_pct >= 80 THEN 'A'
        WHEN v_pct >= 65 THEN 'B'
        WHEN v_pct >= 50 THEN 'C'
        WHEN v_pct >= 35 THEN 'D'
        ELSE 'E'
    END;

    -- Update attempt
    UPDATE adm_attempts
    SET status = 'scored',
        submitted_at = NOW(),
        total_score = v_total_score,
        max_score = v_max_score,
        percentage = v_pct
    WHERE id = p_attempt_id;

    -- Update candidate status
    UPDATE adm_candidates SET status = 'completed' WHERE id = v_candidate.id;

    -- Audit
    INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
    VALUES (v_attempt.school_id, 'attempt_scored', 'attempt', p_attempt_id,
            jsonb_build_object('candidate', v_candidate.full_name,
                             'score', v_total_score, 'max', v_max_score,
                             'percentage', v_pct, 'band', v_band));

    RETURN jsonb_build_object(
        'success', true,
        'total_score', v_total_score,
        'max_score', v_max_score,
        'percentage', v_pct,
        'band', v_band,
        'candidate_name', v_candidate.full_name
    );
END;
$$;

-- ============================================================
-- 4. GET CANDIDATE REPORT — full breakdown for school admin
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_adm_get_candidate_report(
    p_attempt_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt adm_attempts%ROWTYPE;
    v_candidate adm_candidates%ROWTYPE;
    v_answers JSONB;
    v_topic_breakdown JSONB;
    v_type_breakdown JSONB;
    v_strengths JSONB;
    v_weaknesses JSONB;
BEGIN
    SELECT * INTO v_attempt FROM adm_attempts WHERE id = p_attempt_id;
    IF v_attempt.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Attempt not found');
    END IF;

    SELECT * INTO v_candidate FROM adm_candidates WHERE id = v_attempt.candidate_id;

    -- Per-question answers
    SELECT jsonb_agg(
        jsonb_build_object(
            'question_id', q.id,
            'question_type', q.question_type,
            'stem', q.stem,
            'topic', q.topic,
            'response', a.response,
            'correct_answer', q.correct_answer,
            'is_correct', a.is_correct,
            'marks_awarded', a.marks_awarded,
            'marks_possible', a.marks_possible,
            'explanation', q.explanation
        ) ORDER BY fq.question_order
    ) INTO v_answers
    FROM adm_answers a
    JOIN adm_questions q ON q.id = a.question_id
    JOIN adm_test_form_questions fq ON fq.question_id = q.id AND fq.form_id = v_attempt.form_id
    WHERE a.attempt_id = p_attempt_id;

    -- Topic breakdown (strengths/weaknesses)
    SELECT jsonb_agg(topic_row) INTO v_topic_breakdown
    FROM (
        SELECT jsonb_build_object(
            'topic', q.topic,
            'correct', SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END),
            'total', COUNT(*),
            'percentage', ROUND(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric * 100)
        ) AS topic_row
        FROM adm_answers a
        JOIN adm_questions q ON q.id = a.question_id
        WHERE a.attempt_id = p_attempt_id AND q.topic IS NOT NULL
        GROUP BY q.topic
    ) sub;

    -- Question type breakdown
    SELECT jsonb_agg(type_row) INTO v_type_breakdown
    FROM (
        SELECT jsonb_build_object(
            'type', q.question_type,
            'correct', SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END),
            'total', COUNT(*),
            'marks', SUM(a.marks_awarded),
            'max_marks', SUM(a.marks_possible)
        ) AS type_row
        FROM adm_answers a
        JOIN adm_questions q ON q.id = a.question_id
        WHERE a.attempt_id = p_attempt_id
        GROUP BY q.question_type
    ) sub;

    -- Strengths: topics with >= 70% correct
    SELECT jsonb_agg(q.topic) INTO v_strengths
    FROM adm_answers a
    JOIN adm_questions q ON q.id = a.question_id
    WHERE a.attempt_id = p_attempt_id AND q.topic IS NOT NULL
    GROUP BY q.topic
    HAVING (SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric) >= 0.7;

    -- Weaknesses: topics with < 50% correct
    SELECT jsonb_agg(q.topic) INTO v_weaknesses
    FROM adm_answers a
    JOIN adm_questions q ON q.id = a.question_id
    WHERE a.attempt_id = p_attempt_id AND q.topic IS NOT NULL
    GROUP BY q.topic
    HAVING (SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric) < 0.5;

    RETURN jsonb_build_object(
        'success', true,
        'candidate', jsonb_build_object(
            'id', v_candidate.id,
            'name', v_candidate.full_name,
            'email', v_candidate.email,
            'applied_grade', v_candidate.applied_grade
        ),
        'attempt', jsonb_build_object(
            'id', v_attempt.id,
            'total_score', v_attempt.total_score,
            'max_score', v_attempt.max_score,
            'percentage', v_attempt.percentage,
            'started_at', v_attempt.started_at,
            'submitted_at', v_attempt.submitted_at
        ),
        'band', CASE
            WHEN v_attempt.percentage >= 80 THEN 'A'
            WHEN v_attempt.percentage >= 65 THEN 'B'
            WHEN v_attempt.percentage >= 50 THEN 'C'
            WHEN v_attempt.percentage >= 35 THEN 'D'
            ELSE 'E'
        END,
        'answers', COALESCE(v_answers, '[]'::jsonb),
        'topic_breakdown', COALESCE(v_topic_breakdown, '[]'::jsonb),
        'type_breakdown', COALESCE(v_type_breakdown, '[]'::jsonb),
        'strengths', COALESCE(v_strengths, '[]'::jsonb),
        'weaknesses', COALESCE(v_weaknesses, '[]'::jsonb)
    );
END;
$$;

-- ============================================================
-- 5. PUBLISH / CLOSE FORM
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_adm_publish_form(p_form_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_form adm_test_forms%ROWTYPE;
    v_q_count INT;
BEGIN
    SELECT * INTO v_form FROM adm_test_forms WHERE id = p_form_id;
    IF v_form.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Form not found');
    END IF;

    -- Must have questions
    SELECT COUNT(*) INTO v_q_count FROM adm_test_form_questions WHERE form_id = p_form_id;
    IF v_q_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot publish a form with no questions');
    END IF;

    UPDATE adm_test_forms
    SET status = 'published', published_at = NOW(), updated_at = NOW()
    WHERE id = p_form_id;

    INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
    VALUES (v_form.school_id, 'form_published', 'form', p_form_id,
            jsonb_build_object('form_code', v_form.form_code, 'questions', v_q_count));

    RETURN jsonb_build_object('success', true, 'form_code', v_form.form_code, 'questions', v_q_count);
END;
$$;

CREATE OR REPLACE FUNCTION rpc_adm_close_form(p_form_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_form adm_test_forms%ROWTYPE;
BEGIN
    SELECT * INTO v_form FROM adm_test_forms WHERE id = p_form_id;
    IF v_form.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Form not found');
    END IF;

    UPDATE adm_test_forms
    SET status = 'closed', closed_at = NOW(), updated_at = NOW()
    WHERE id = p_form_id;

    -- Expire any in-progress attempts
    UPDATE adm_attempts SET status = 'expired'
    WHERE form_id = p_form_id AND status = 'in_progress';

    INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
    VALUES (v_form.school_id, 'form_closed', 'form', p_form_id,
            jsonb_build_object('form_code', v_form.form_code));

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- 6. RECORD PLACEMENT DECISION
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_adm_record_placement(
    p_attempt_id UUID,
    p_band TEXT,
    p_recommended_grade SMALLINT DEFAULT NULL,
    p_recommended_stage SMALLINT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempt adm_attempts%ROWTYPE;
    v_candidate adm_candidates%ROWTYPE;
    v_blueprint adm_blueprints%ROWTYPE;
    v_placement_id UUID;
BEGIN
    SELECT * INTO v_attempt FROM adm_attempts WHERE id = p_attempt_id;
    IF v_attempt.id IS NULL OR v_attempt.status != 'scored' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Attempt not found or not yet scored');
    END IF;

    SELECT * INTO v_candidate FROM adm_candidates WHERE id = v_attempt.candidate_id;

    SELECT bp.* INTO v_blueprint
    FROM adm_blueprints bp
    JOIN adm_test_forms tf ON tf.blueprint_id = bp.id
    WHERE tf.id = v_attempt.form_id;

    v_placement_id := gen_random_uuid();

    INSERT INTO adm_placement_results (id, attempt_id, candidate_id, school_id, subject, band,
                                        recommended_grade, recommended_stage, notes, decided_at)
    VALUES (v_placement_id, p_attempt_id, v_candidate.id, v_attempt.school_id,
            v_blueprint.subject, p_band, p_recommended_grade, p_recommended_stage, p_notes, NOW());

    UPDATE adm_candidates SET status = 'placed' WHERE id = v_candidate.id;

    INSERT INTO adm_audit_log (school_id, action, target_type, target_id, details)
    VALUES (v_attempt.school_id, 'placement_decided', 'candidate', v_candidate.id,
            jsonb_build_object('band', p_band, 'candidate', v_candidate.full_name,
                             'recommended_grade', p_recommended_grade));

    RETURN jsonb_build_object(
        'success', true,
        'placement_id', v_placement_id,
        'band', p_band,
        'candidate', v_candidate.full_name
    );
END;
$$;

-- ============================================================
-- 7. GENERATE TEST FORM FROM BLUEPRINT
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_adm_generate_test_form(
    p_blueprint_id UUID,
    p_form_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bp adm_blueprints%ROWTYPE;
    v_form_id UUID;
    v_form_code TEXT;
    v_pool_ids UUID[];
    v_dist_key TEXT;
    v_dist_val JSONB;
    v_diff_key TEXT;
    v_diff_count INT;
    v_order INT := 0;
    v_q RECORD;
    v_total_selected INT := 0;
BEGIN
    SELECT * INTO v_bp FROM adm_blueprints WHERE id = p_blueprint_id;
    IF v_bp.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Blueprint not found');
    END IF;

    -- Get matching pool IDs (school's + global pools for this subject/stage)
    SELECT ARRAY_AGG(id) INTO v_pool_ids
    FROM adm_question_pools
    WHERE (school_id = v_bp.school_id OR school_id IS NULL)
      AND subject = v_bp.subject
      AND (stage = v_bp.target_stage OR v_bp.target_stage IS NULL)
      AND is_active = true;

    IF v_pool_ids IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No question pools match this blueprint');
    END IF;

    -- Generate form code
    v_form_code := COALESCE(p_form_code,
        UPPER(LEFT(v_bp.subject, 3)) || COALESCE(v_bp.target_stage::text, '') ||
        '-' || TO_CHAR(NOW(), 'YYYY') || '-' || SUBSTR(gen_random_uuid()::text, 1, 4));

    v_form_id := gen_random_uuid();

    INSERT INTO adm_test_forms (id, blueprint_id, school_id, form_code, status, created_by)
    VALUES (v_form_id, p_blueprint_id, v_bp.school_id, v_form_code, 'draft', v_bp.created_by);

    -- Select questions based on distribution
    -- distribution format: {"mcq": {"easy": 5, "medium": 8}, "gap_fill": {"medium": 5}}
    FOR v_dist_key, v_dist_val IN SELECT * FROM jsonb_each(v_bp.question_distribution)
    LOOP
        FOR v_diff_key, v_diff_count IN SELECT key, value::int FROM jsonb_each_text(v_dist_val)
        LOOP
            FOR v_q IN
                SELECT id FROM adm_questions
                WHERE pool_id = ANY(v_pool_ids)
                  AND question_type = v_dist_key
                  AND difficulty = v_diff_key
                  AND status = 'published'
                ORDER BY RANDOM()
                LIMIT v_diff_count
            LOOP
                v_order := v_order + 1;
                INSERT INTO adm_test_form_questions (form_id, question_id, question_order)
                VALUES (v_form_id, v_q.id, v_order);
                v_total_selected := v_total_selected + 1;
            END LOOP;
        END LOOP;
    END LOOP;

    IF v_total_selected = 0 THEN
        -- Cleanup empty form
        DELETE FROM adm_test_forms WHERE id = v_form_id;
        RETURN jsonb_build_object('success', false, 'error', 'No questions matched the blueprint distribution');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'form_id', v_form_id,
        'form_code', v_form_code,
        'questions_selected', v_total_selected
    );
END;
$$;

-- ============================================================
-- 8. RESOLVE GRADE → STAGE MAPPING
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_adm_resolve_grade_stage(
    p_school_id UUID,
    p_grade SMALLINT,
    p_subject TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stage SMALLINT;
BEGIN
    -- Try subject-specific mapping first
    IF p_subject IS NOT NULL THEN
        SELECT cambridge_stage INTO v_stage
        FROM adm_school_grade_stage_map
        WHERE school_id = p_school_id AND grade_level = p_grade AND subject = p_subject;
    END IF;

    -- Fall back to general mapping
    IF v_stage IS NULL THEN
        SELECT cambridge_stage INTO v_stage
        FROM adm_school_grade_stage_map
        WHERE school_id = p_school_id AND grade_level = p_grade AND subject IS NULL;
    END IF;

    -- Default: stage = grade + 1 (common Cambridge convention)
    IF v_stage IS NULL THEN
        v_stage := p_grade + 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'grade', p_grade,
        'stage', v_stage,
        'source', CASE WHEN v_stage = p_grade + 1 THEN 'default' ELSE 'school_mapping' END
    );
END;
$$;

-- ============================================================
-- GRANT EXECUTE to authenticated users (for admin RPCs)
-- and to anon (for candidate-facing RPCs)
-- ============================================================
GRANT EXECUTE ON FUNCTION rpc_adm_start_attempt(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_adm_save_answer(TEXT, UUID, UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_adm_submit_attempt(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_adm_get_candidate_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_adm_publish_form(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_adm_close_form(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_adm_record_placement(UUID, TEXT, SMALLINT, SMALLINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_adm_generate_test_form(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_adm_resolve_grade_stage(UUID, SMALLINT, TEXT) TO authenticated;
