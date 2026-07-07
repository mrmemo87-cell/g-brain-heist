-- Admission duplicate-question blocker: clean safe duplicate question links, enforce uniqueness, and
-- regenerate forms from unique question ids and unique normalized visible stems.

DELETE FROM adm_test_form_questions fq
USING adm_test_form_questions keep
WHERE fq.form_id = keep.form_id
  AND fq.question_id = keep.question_id
  AND fq.id > keep.id
  AND NOT EXISTS (SELECT 1 FROM adm_attempts a WHERE a.form_id = fq.form_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM adm_test_form_questions fq
    JOIN adm_test_form_questions dup ON dup.form_id = fq.form_id AND dup.question_id = fq.question_id AND dup.id <> fq.id
    JOIN adm_attempts a ON a.form_id = fq.form_id
  ) THEN
    RAISE EXCEPTION 'Cannot add adm_test_form_questions(form_id, question_id) unique index: attempted historical forms still contain duplicate question links. Preserve candidate history and recreate clean future forms first.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS adm_test_form_questions_form_question_uidx
  ON adm_test_form_questions(form_id, question_id);

CREATE OR REPLACE FUNCTION adm_normalize_question_stem(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(regexp_replace(regexp_replace(lower(translate(coalesce(p_text, ''), '“”‘’', '""''''')), '\m(question|item|investigation)\s+[0-9]+\M', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;

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
    v_selected_count INT;
    v_total_required INT := 0;
BEGIN
    SELECT * INTO v_bp FROM adm_blueprints WHERE id = p_blueprint_id;
    IF v_bp.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Blueprint not found'); END IF;

    IF v_bp.school_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM school_members sm WHERE sm.school_id = v_bp.school_id AND sm.user_id = auth.uid() AND sm.role_in_school = 'school_admin' AND sm.status = 'active'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied — not a school admin of this school');
    END IF;

    IF v_bp.pool_id IS NOT NULL THEN
        SELECT ARRAY_AGG(id) INTO v_pool_ids FROM adm_question_pools
        WHERE id = v_bp.pool_id AND is_active = true AND (school_id = v_bp.school_id OR school_id IS NULL OR (is_official = true AND is_locked = true));
    ELSE
        SELECT ARRAY_AGG(id ORDER BY stage NULLS LAST, name) INTO v_pool_ids FROM adm_question_pools
        WHERE is_official = true AND is_locked = true AND is_active = true AND school_id IS NULL AND subject = v_bp.subject
          AND (stage = v_bp.target_stage OR stage_level = v_bp.target_stage OR v_bp.target_stage IS NULL);
        IF v_pool_ids IS NULL THEN
            SELECT ARRAY_AGG(id ORDER BY (school_id IS NULL) DESC, created_at DESC) INTO v_pool_ids FROM adm_question_pools
            WHERE (school_id = v_bp.school_id OR school_id IS NULL) AND subject = v_bp.subject
              AND (stage = v_bp.target_stage OR stage_level = v_bp.target_stage OR v_bp.target_stage IS NULL) AND is_active = true;
        END IF;
    END IF;

    IF v_pool_ids IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No official Brain Heist admission question pools match this blueprint'); END IF;

    v_base_form_code := COALESCE(p_form_code, UPPER(LEFT(v_bp.subject, 3)) || COALESCE(v_bp.target_stage::text, '') || '-' || TO_CHAR(NOW(), 'YYYY') || '-' || UPPER(SUBSTR(gen_random_uuid()::text, 1, 4)));
    v_form_code := v_base_form_code;
    PERFORM pg_advisory_xact_lock(hashtext(COALESCE(v_bp.school_id::text, 'platform') || ':' || v_base_form_code));

    SELECT id, status INTO v_existing_form_id, v_existing_status FROM adm_test_forms WHERE school_id = v_bp.school_id AND form_code = v_form_code;
    IF v_existing_form_id IS NOT NULL AND v_existing_status = 'draft' THEN
        RETURN jsonb_build_object('success', true, 'form_id', v_existing_form_id, 'form_code', v_form_code, 'idempotent', true);
    END IF;
    WHILE EXISTS (SELECT 1 FROM adm_test_forms WHERE school_id = v_bp.school_id AND form_code = v_form_code) LOOP
        v_form_code := v_base_form_code || '-' || UPPER(SUBSTR(gen_random_uuid()::text, 1, 4));
    END LOOP;

    DROP TABLE IF EXISTS adm_selected_questions_tmp;
    CREATE TEMP TABLE adm_selected_questions_tmp(question_id uuid PRIMARY KEY, normalized_stem text UNIQUE) ON COMMIT DROP;

    FOR v_dist_key, v_dist_val IN SELECT * FROM jsonb_each(v_bp.question_distribution) LOOP
        FOR v_diff_key, v_diff_count IN SELECT key, value::int FROM jsonb_each_text(v_dist_val) LOOP
            v_total_required := v_total_required + v_diff_count;
            INSERT INTO adm_selected_questions_tmp(question_id, normalized_stem)
            SELECT q.id, adm_normalize_question_stem(q.stem)
            FROM adm_questions q
            JOIN adm_question_pools qp ON qp.id = q.pool_id
            WHERE q.pool_id = ANY(v_pool_ids) AND q.question_type = v_dist_key AND q.difficulty = v_diff_key AND q.status = 'published'
              AND (q.is_official = true OR qp.is_official = true)
              AND COALESCE(q.content_owner, qp.content_owner) = 'brain_heist'
              AND q.external_id IS NOT NULL
              AND COALESCE(q.content_version, qp.content_version) IS NOT NULL
              AND COALESCE(q.content_version, qp.content_version) <> 'legacy-import'
              AND COALESCE(q.content_version, qp.content_version) LIKE 'adm-bank-v1-g%'
              AND NOT EXISTS (SELECT 1 FROM adm_selected_questions_tmp s WHERE s.question_id = q.id OR s.normalized_stem = adm_normalize_question_stem(q.stem))
            ORDER BY RANDOM()
            LIMIT v_diff_count;
            GET DIAGNOSTICS v_selected_count = ROW_COUNT;
            IF v_selected_count < v_diff_count THEN
                RETURN jsonb_build_object('success', false, 'error', 'Not enough unique official questions available for this grade/subject/test blueprint.');
            END IF;
        END LOOP;
    END LOOP;

    IF v_total_required = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'No questions matched the blueprint distribution'); END IF;

    v_form_id := gen_random_uuid();
    INSERT INTO adm_test_forms (id, blueprint_id, school_id, form_code, status, created_by) VALUES (v_form_id, p_blueprint_id, v_bp.school_id, v_form_code, 'draft', v_bp.created_by);
    INSERT INTO adm_test_form_questions (form_id, question_id, question_order)
    SELECT v_form_id, question_id, ROW_NUMBER() OVER (ORDER BY RANDOM()) FROM adm_selected_questions_tmp;

    RETURN jsonb_build_object('success', true, 'form_id', v_form_id, 'form_code', v_form_code, 'questions_selected', v_total_required);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_adm_generate_test_form(UUID, TEXT) TO authenticated;
