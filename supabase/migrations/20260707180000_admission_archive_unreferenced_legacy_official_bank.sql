-- Archive only unreferenced legacy-import Brains Heist admission official-bank rows.
-- This is intentionally non-destructive: no forms, attempts, answers, or questions are deleted.
-- Referenced legacy history (for example Grade 6 English legacy-import) remains untouched.

DO $$
DECLARE
  v_safe_question_count integer := 0;
  v_unsafe_question_count integer := 0;
  v_safe_pool_count integer := 0;
  v_has_question_updated_at boolean := false;
  v_has_pool_updated_at boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'adm_questions' AND column_name = 'updated_at'
  ) INTO v_has_question_updated_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'adm_question_pools' AND column_name = 'updated_at'
  ) INTO v_has_pool_updated_at;

  CREATE TEMP TABLE adm_legacy_safe_questions ON COMMIT DROP AS
  WITH legacy_questions AS (
    SELECT
      q.id,
      q.pool_id,
      coalesce(q.grade_level, qp.grade_level) AS grade,
      coalesce(qp.subject, 'unknown') AS subject
    FROM public.adm_questions q
    LEFT JOIN public.adm_question_pools qp ON qp.id = q.pool_id
    WHERE coalesce(q.content_version, qp.content_version) = 'legacy-import'
      AND q.external_id IS NULL
      AND coalesce(q.content_owner, qp.content_owner) = 'brain_heist'
  ), legacy_group_references AS (
    SELECT
      lq.grade,
      lq.subject,
      count(DISTINCT fq.form_id) AS referenced_form_count,
      count(DISTINCT a.id) AS referenced_attempt_count
    FROM legacy_questions lq
    LEFT JOIN public.adm_test_form_questions fq ON fq.question_id = lq.id
    LEFT JOIN public.adm_attempts a ON a.form_id = fq.form_id
    GROUP BY lq.grade, lq.subject
  )
  SELECT lq.id, lq.pool_id, lq.grade, lq.subject
  FROM legacy_questions lq
  JOIN legacy_group_references lgr
    ON lgr.grade IS NOT DISTINCT FROM lq.grade
   AND lgr.subject IS NOT DISTINCT FROM lq.subject
  WHERE lgr.referenced_form_count = 0
    AND lgr.referenced_attempt_count = 0;

  SELECT count(*) INTO v_safe_question_count FROM adm_legacy_safe_questions;

  -- Guard against future query drift: no row selected for archival may be linked to a form or attempt.
  SELECT count(DISTINCT sq.id) INTO v_unsafe_question_count
  FROM adm_legacy_safe_questions sq
  JOIN public.adm_test_form_questions fq ON fq.question_id = sq.id
  LEFT JOIN public.adm_attempts a ON a.form_id = fq.form_id;

  IF v_unsafe_question_count > 0 THEN
    RAISE EXCEPTION 'Unsafe admission legacy archive candidate set: % referenced question rows selected', v_unsafe_question_count;
  END IF;

  CREATE TEMP TABLE adm_legacy_safe_pools ON COMMIT DROP AS
  SELECT qp.id
  FROM public.adm_question_pools qp
  WHERE EXISTS (SELECT 1 FROM adm_legacy_safe_questions sq WHERE sq.pool_id = qp.id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.adm_questions q
      WHERE q.pool_id = qp.id
        AND NOT EXISTS (SELECT 1 FROM adm_legacy_safe_questions sq WHERE sq.id = q.id)
    );

  SELECT count(*) INTO v_safe_pool_count FROM adm_legacy_safe_pools;

  -- Migrations run as trusted deployment SQL; temporarily bypass the interactive-user
  -- official-content mutation trigger so this controlled archival can update locked rows.
  ALTER TABLE public.adm_questions DISABLE TRIGGER adm_questions_prevent_locked_mutation;
  ALTER TABLE public.adm_question_pools DISABLE TRIGGER adm_question_pools_prevent_locked_mutation;

  IF v_has_question_updated_at THEN
    UPDATE public.adm_questions q
    SET status = 'archived',
        is_official = false,
        is_locked = true,
        updated_at = now()
    FROM adm_legacy_safe_questions sq
    WHERE sq.id = q.id;
  ELSE
    UPDATE public.adm_questions q
    SET status = 'archived',
        is_official = false,
        is_locked = true
    FROM adm_legacy_safe_questions sq
    WHERE sq.id = q.id;
  END IF;

  IF v_has_pool_updated_at THEN
    UPDATE public.adm_question_pools qp
    SET is_active = false,
        is_official = false,
        updated_at = now()
    FROM adm_legacy_safe_pools sp
    WHERE sp.id = qp.id;
  ELSE
    UPDATE public.adm_question_pools qp
    SET is_active = false,
        is_official = false
    FROM adm_legacy_safe_pools sp
    WHERE sp.id = qp.id;
  END IF;

  ALTER TABLE public.adm_questions ENABLE TRIGGER adm_questions_prevent_locked_mutation;
  ALTER TABLE public.adm_question_pools ENABLE TRIGGER adm_question_pools_prevent_locked_mutation;

  RAISE NOTICE 'Archived % unreferenced legacy-import admission questions and deactivated % fully legacy-safe pools',
    v_safe_question_count, v_safe_pool_count;
END $$;
