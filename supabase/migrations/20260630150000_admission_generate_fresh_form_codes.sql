-- Repair admission form generation idempotency so published/closed/stale forms are not reused by new wizard runs.
-- Prefer official locked Brain Heist admission content when generating tests.
-- Falls back to compatible legacy/custom pools so existing schools are not broken.

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
    v_existing_form_id UUID;
    v_existing_status TEXT;
    v_base_form_code TEXT;
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

    IF v_bp.school_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM school_members sm
        WHERE sm.school_id = v_bp.school_id
          AND sm.user_id = auth.uid()
          AND sm.role_in_school = 'school_admin'
          AND sm.status = 'active'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied — not a school admin of this school');
    END IF;

    IF v_bp.pool_id IS NOT NULL THEN
        SELECT ARRAY_AGG(id) INTO v_pool_ids
        FROM adm_question_pools
        WHERE id = v_bp.pool_id
          AND is_active = true
          AND (
            school_id = v_bp.school_id
            OR school_id IS NULL
            OR (is_official = true AND is_locked = true)
          );
    ELSE
        -- Product default: use official locked platform content first.
        SELECT ARRAY_AGG(id ORDER BY stage NULLS LAST, name) INTO v_pool_ids
        FROM adm_question_pools
        WHERE is_official = true
          AND is_locked = true
          AND is_active = true
          AND school_id IS NULL
          AND subject = v_bp.subject
          AND (stage = v_bp.target_stage OR stage_level = v_bp.target_stage OR v_bp.target_stage IS NULL);

        -- Compatibility fallback for legacy/custom pools where official content is not seeded yet.
        IF v_pool_ids IS NULL THEN
            SELECT ARRAY_AGG(id ORDER BY (school_id IS NULL) DESC, created_at DESC) INTO v_pool_ids
            FROM adm_question_pools
            WHERE (school_id = v_bp.school_id OR school_id IS NULL)
              AND subject = v_bp.subject
              AND (stage = v_bp.target_stage OR stage_level = v_bp.target_stage OR v_bp.target_stage IS NULL)
              AND is_active = true;
        END IF;
    END IF;

    IF v_pool_ids IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No official Brain Heist admission question pools match this blueprint');
    END IF;

    v_base_form_code := COALESCE(p_form_code,
        UPPER(LEFT(v_bp.subject, 3)) || COALESCE(v_bp.target_stage::text, '') ||
        '-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTR(gen_random_uuid()::text, 1, 4)));
    v_form_code := v_base_form_code;

    -- Idempotency is only for immediate duplicate submits while the generated form is still draft.
    -- Published/closed/stale forms must not permanently force new wizard runs to reuse old content.
    PERFORM pg_advisory_xact_lock(hashtext(COALESCE(v_bp.school_id::text, 'platform') || ':' || v_base_form_code));

    SELECT id, status INTO v_existing_form_id, v_existing_status
    FROM adm_test_forms
    WHERE school_id = v_bp.school_id
      AND form_code = v_form_code;

    IF v_existing_form_id IS NOT NULL AND v_existing_status = 'draft' THEN
        RETURN jsonb_build_object(
            'success', true,
            'form_id', v_existing_form_id,
            'form_code', v_form_code,
            'idempotent', true
        );
    END IF;

    WHILE EXISTS (SELECT 1 FROM adm_test_forms WHERE school_id = v_bp.school_id AND form_code = v_form_code) LOOP
        v_form_code := v_base_form_code || '-' || UPPER(SUBSTR(gen_random_uuid()::text, 1, 4));
    END LOOP;

    v_form_id := gen_random_uuid();

    INSERT INTO adm_test_forms (id, blueprint_id, school_id, form_code, status, created_by)
    VALUES (v_form_id, p_blueprint_id, v_bp.school_id, v_form_code, 'draft', v_bp.created_by);

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
        DELETE FROM adm_test_forms WHERE id = v_form_id;
        RETURN jsonb_build_object('success', false, 'error', 'No questions matched the blueprint distribution');
    END IF;

    UPDATE adm_test_form_questions
    SET question_order = question_order + v_total_selected
    WHERE form_id = v_form_id;

    WITH shuffled AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY RANDOM()) AS new_order
        FROM adm_test_form_questions
        WHERE form_id = v_form_id
    )
    UPDATE adm_test_form_questions fq
    SET question_order = s.new_order
    FROM shuffled s
    WHERE fq.id = s.id;

    RETURN jsonb_build_object(
        'success', true,
        'form_id', v_form_id,
        'form_code', v_form_code,
        'questions_selected', v_total_selected
    );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_adm_generate_test_form(UUID, TEXT) TO authenticated;
