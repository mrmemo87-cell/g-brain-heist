-- Generate admission forms from the latest managed bank version for the blueprint grade and subject.
-- Preserves authorization, idempotency, dedupe, difficulty ordering, unique-subskill fallback, and question ordering.
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
    v_available_unique INT;
    v_first_pass_count INT;
    v_remaining_count INT;
    v_blueprint_grade INT;
    v_managed_content_version TEXT;
BEGIN
    SELECT * INTO v_bp FROM adm_blueprints WHERE id = p_blueprint_id;
    IF v_bp.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Blueprint not found', 'debug_reason', 'Blueprint not found'); END IF;

    IF v_bp.school_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM school_members sm WHERE sm.school_id = v_bp.school_id AND sm.user_id = auth.uid() AND sm.role_in_school = 'school_admin' AND sm.status = 'active'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied — not a school admin of this school', 'debug_reason', 'Access denied');
    END IF;

    v_blueprint_grade := COALESCE(v_bp.target_grade, v_bp.target_stage);
    IF v_blueprint_grade IS NULL OR lower(v_bp.subject) NOT IN ('english', 'maths', 'science') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No official Brain Heist admission question pools match this blueprint', 'debug_reason', 'Blueprint has no managed bank grade/subject');
    END IF;

    -- Resolve once across the exact blueprint grade and subject so a form cannot mix
    -- managed bank versions. Numeric extraction avoids lexicographic v10-before-v9 errors.
    SELECT qp.content_version INTO v_managed_content_version
    FROM adm_question_pools qp
    WHERE qp.is_active = true AND qp.is_official = true AND qp.is_locked = true AND qp.school_id IS NULL
      AND lower(qp.subject) = lower(v_bp.subject)
      AND qp.content_owner = 'brain_heist' AND qp.external_id IS NOT NULL
      AND qp.content_version ~ '^adm-bank-v[0-9]+-g[0-9]+-(english|maths|science)$'
      AND qp.content_version ~ ('^adm-bank-v[0-9]+-g' || v_blueprint_grade::text || '-' || lower(v_bp.subject) || '$')
    ORDER BY (substring(qp.content_version FROM '^adm-bank-v([0-9]+)-'))::int DESC
    LIMIT 1;

    IF v_managed_content_version IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No official Brain Heist admission question pools match this blueprint', 'debug_reason', 'No matching official managed bank version');
    END IF;

    IF v_bp.pool_id IS NOT NULL THEN
        SELECT ARRAY_AGG(id) INTO v_pool_ids FROM adm_question_pools
        WHERE id = v_bp.pool_id AND is_active = true AND is_official = true AND is_locked = true AND school_id IS NULL
          AND lower(subject) = lower(v_bp.subject) AND (stage = v_bp.target_stage OR stage_level = v_bp.target_stage OR v_bp.target_stage IS NULL)
          AND content_owner = 'brain_heist' AND external_id IS NOT NULL
          AND content_version = v_managed_content_version;
    ELSE
        SELECT ARRAY_AGG(id ORDER BY stage NULLS LAST, name) INTO v_pool_ids FROM adm_question_pools
        WHERE is_official = true AND is_locked = true AND is_active = true AND school_id IS NULL AND lower(subject) = lower(v_bp.subject)
          AND (stage = v_bp.target_stage OR stage_level = v_bp.target_stage OR v_bp.target_stage IS NULL)
          AND content_owner = 'brain_heist' AND external_id IS NOT NULL
          AND content_version = v_managed_content_version;
    END IF;

    IF v_pool_ids IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No official Brain Heist admission question pools match this blueprint', 'debug_reason', 'No matching safe pools in latest official managed bank version'); END IF;

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
    CREATE TEMP TABLE adm_selected_questions_tmp(
        question_id uuid PRIMARY KEY,
        normalized_stem text UNIQUE,
        strand text NOT NULL DEFAULT 'general',
        subskill text NOT NULL DEFAULT 'general',
        canonical_subskill text NOT NULL DEFAULT 'general',
        question_type text NOT NULL,
        difficulty text NOT NULL
    ) ON COMMIT DROP;

    FOR v_dist_key, v_dist_val IN
        SELECT key, value
        FROM jsonb_each(v_bp.question_distribution)
        ORDER BY key
    LOOP
        FOR v_diff_key, v_diff_count IN
            SELECT key, value::int
            FROM jsonb_each_text(v_dist_val)
            ORDER BY
                CASE lower(key)
                    WHEN 'easy' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'hard' THEN 3
                    ELSE 100
                END,
                key
        LOOP
            v_total_required := v_total_required + v_diff_count;

            SELECT COUNT(*) INTO v_available_unique FROM (
                SELECT DISTINCT ON (adm_normalize_question_stem(q.stem)) q.id
                FROM adm_questions q
                JOIN adm_question_pools qp ON qp.id = q.pool_id
                WHERE q.pool_id = ANY(v_pool_ids) AND q.question_type = v_dist_key AND q.difficulty = v_diff_key AND q.status = 'published'
                  AND q.is_official = true AND q.is_locked = true AND qp.is_official = true AND qp.is_locked = true
                  AND COALESCE(q.content_owner, qp.content_owner) = 'brain_heist'
                  AND q.external_id IS NOT NULL AND qp.external_id IS NOT NULL
                  AND COALESCE(q.content_version, qp.content_version) = v_managed_content_version
                  AND NOT EXISTS (SELECT 1 FROM adm_selected_questions_tmp s WHERE s.question_id = q.id OR s.normalized_stem = adm_normalize_question_stem(q.stem))
                ORDER BY adm_normalize_question_stem(q.stem), RANDOM()
            ) candidates;

            IF v_available_unique < v_diff_count THEN
                RETURN jsonb_build_object(
                  'success', false,
                  'error', 'Not enough unique official questions available for this grade/subject/test blueprint.',
                  'debug_reason', 'Not enough unique questions after dedupe',
                  'question_type', v_dist_key,
                  'difficulty', v_diff_key,
                  'required', v_diff_count,
                  'available_unique', v_available_unique
                );
            END IF;

            -- First pass: only select candidates whose canonical subskill has not already
            -- appeared in previous buckets and limit the current INSERT batch to
            -- one row per canonical subskill. This prevents semantic duplicate concepts
            -- within a batch and across blueprint buckets when enough unique concepts are available.
            INSERT INTO adm_selected_questions_tmp(question_id, normalized_stem, strand, subskill, canonical_subskill, question_type, difficulty)
            WITH base_candidates AS (
                SELECT DISTINCT ON (adm_normalize_question_stem(q.stem))
                    q.id AS question_id,
                    adm_normalize_question_stem(q.stem) AS normalized_stem,
                    COALESCE(NULLIF(q.strand, ''), 'general') AS strand,
                    COALESCE(NULLIF(q.subskill, ''), NULLIF(q.diagnostic_skill, ''), NULLIF(q.topic, ''), adm_normalize_question_stem(q.stem)) AS subskill,
                    lower(btrim(coalesce(
                        nullif(btrim(q.subskill), ''),
                        nullif(btrim(q.diagnostic_skill), ''),
                        nullif(btrim(q.topic), ''),
                        adm_normalize_question_stem(q.stem)
                    ))) AS canonical_subskill,
                    q.question_type,
                    q.difficulty,
                    RANDOM() AS random_order
                FROM adm_questions q
                JOIN adm_question_pools qp ON qp.id = q.pool_id
                WHERE q.pool_id = ANY(v_pool_ids) AND q.question_type = v_dist_key AND q.difficulty = v_diff_key AND q.status = 'published'
                  AND q.is_official = true AND q.is_locked = true AND qp.is_official = true AND qp.is_locked = true
                  AND COALESCE(q.content_owner, qp.content_owner) = 'brain_heist'
                  AND q.external_id IS NOT NULL AND qp.external_id IS NOT NULL
                  AND COALESCE(q.content_version, qp.content_version) = v_managed_content_version
                  AND NOT EXISTS (
                      SELECT 1
                      FROM adm_selected_questions_tmp s
                      WHERE s.question_id = q.id
                         OR s.normalized_stem = adm_normalize_question_stem(q.stem)
                         OR s.canonical_subskill = lower(btrim(coalesce(
                             nullif(btrim(q.subskill), ''),
                             nullif(btrim(q.diagnostic_skill), ''),
                             nullif(btrim(q.topic), ''),
                             adm_normalize_question_stem(q.stem)
                         )))
                  )
                ORDER BY adm_normalize_question_stem(q.stem), RANDOM()
            ),
            ranked AS (
                SELECT
                    bc.*,
                    COALESCE((SELECT COUNT(*) FROM adm_selected_questions_tmp s WHERE s.strand = bc.strand), 0) AS existing_strand_count,
                    ROW_NUMBER() OVER (PARTITION BY bc.canonical_subskill ORDER BY bc.random_order) AS subskill_round,
                    ROW_NUMBER() OVER (PARTITION BY bc.strand ORDER BY bc.random_order) AS strand_round
                FROM base_candidates bc
            )
            SELECT question_id, normalized_stem, strand, subskill, canonical_subskill, question_type, difficulty
            FROM ranked
            WHERE subskill_round = 1
            ORDER BY existing_strand_count ASC, strand_round ASC, random_order ASC
            LIMIT v_diff_count;
            GET DIAGNOSTICS v_first_pass_count = ROW_COUNT;

            v_remaining_count := v_diff_count - v_first_pass_count;

            -- Second pass: fallback only for shortages after the unique-subskill pass.
            -- Question-id and normalized-stem uniqueness still remain enforced.
            IF v_remaining_count > 0 THEN
                INSERT INTO adm_selected_questions_tmp(question_id, normalized_stem, strand, subskill, canonical_subskill, question_type, difficulty)
                WITH base_candidates AS (
                    SELECT DISTINCT ON (adm_normalize_question_stem(q.stem))
                        q.id AS question_id,
                        adm_normalize_question_stem(q.stem) AS normalized_stem,
                        COALESCE(NULLIF(q.strand, ''), 'general') AS strand,
                        COALESCE(NULLIF(q.subskill, ''), NULLIF(q.diagnostic_skill, ''), NULLIF(q.topic, ''), adm_normalize_question_stem(q.stem)) AS subskill,
                        lower(btrim(coalesce(
                            nullif(btrim(q.subskill), ''),
                            nullif(btrim(q.diagnostic_skill), ''),
                            nullif(btrim(q.topic), ''),
                            adm_normalize_question_stem(q.stem)
                        ))) AS canonical_subskill,
                        q.question_type,
                        q.difficulty,
                        RANDOM() AS random_order
                    FROM adm_questions q
                    JOIN adm_question_pools qp ON qp.id = q.pool_id
                    WHERE q.pool_id = ANY(v_pool_ids) AND q.question_type = v_dist_key AND q.difficulty = v_diff_key AND q.status = 'published'
                      AND q.is_official = true AND q.is_locked = true AND qp.is_official = true AND qp.is_locked = true
                      AND COALESCE(q.content_owner, qp.content_owner) = 'brain_heist'
                      AND q.external_id IS NOT NULL AND qp.external_id IS NOT NULL
                      AND COALESCE(q.content_version, qp.content_version) = v_managed_content_version
                      AND NOT EXISTS (
                          SELECT 1
                          FROM adm_selected_questions_tmp s
                          WHERE s.question_id = q.id
                             OR s.normalized_stem = adm_normalize_question_stem(q.stem)
                      )
                    ORDER BY adm_normalize_question_stem(q.stem), RANDOM()
                ),
                ranked AS (
                    SELECT
                        bc.*,
                        COALESCE((SELECT COUNT(*) FROM adm_selected_questions_tmp s WHERE s.canonical_subskill = bc.canonical_subskill), 0) AS existing_subskill_count,
                        COALESCE((SELECT COUNT(*) FROM adm_selected_questions_tmp s WHERE s.strand = bc.strand), 0) AS existing_strand_count,
                        ROW_NUMBER() OVER (PARTITION BY bc.canonical_subskill ORDER BY bc.random_order) AS subskill_round,
                        ROW_NUMBER() OVER (PARTITION BY bc.strand ORDER BY bc.random_order) AS strand_round
                    FROM base_candidates bc
                )
                SELECT question_id, normalized_stem, strand, subskill, canonical_subskill, question_type, difficulty
                FROM ranked
                ORDER BY
                    existing_subskill_count ASC,
                    subskill_round ASC,
                    existing_strand_count ASC,
                    strand_round ASC,
                    random_order ASC
                LIMIT v_remaining_count;
                GET DIAGNOSTICS v_selected_count = ROW_COUNT;
                v_selected_count := v_first_pass_count + v_selected_count;
            ELSE
                v_selected_count := v_first_pass_count;
            END IF;

            IF v_selected_count < v_diff_count THEN
                RETURN jsonb_build_object('success', false, 'error', 'Not enough unique official questions available for this grade/subject/test blueprint.', 'debug_reason', 'Not enough unique questions after dedupe');
            END IF;
        END LOOP;
    END LOOP;

    IF v_total_required = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'No questions matched the blueprint distribution', 'debug_reason', 'No questions matched blueprint distribution'); END IF;

    v_form_id := gen_random_uuid();
    INSERT INTO adm_test_forms (id, blueprint_id, school_id, form_code, status, created_by) VALUES (v_form_id, p_blueprint_id, v_bp.school_id, v_form_code, 'draft', v_bp.created_by);
    INSERT INTO adm_test_form_questions (form_id, question_id, question_order)
    SELECT
        v_form_id,
        question_id,
        ROW_NUMBER() OVER (ORDER BY strand_round ASC, random_order ASC) AS question_order
    FROM (
        SELECT
            question_id,
            strand,
            ROW_NUMBER() OVER (PARTITION BY strand ORDER BY RANDOM()) AS strand_round,
            RANDOM() AS random_order
        FROM adm_selected_questions_tmp
    ) ordered_questions;

    RETURN jsonb_build_object('success', true, 'form_id', v_form_id, 'form_code', v_form_code, 'questions_selected', v_total_required);
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admission form generation failed.', 'debug_reason', 'Duplicate question_order conflict');
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_adm_generate_test_form(UUID, TEXT) TO authenticated;
