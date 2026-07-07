-- Admission duplicate-question inspection.
-- Separates current managed official-bank content from legacy/unmanaged rows.
-- Current managed official bank is Brain Heist content with a non-null external_id and
-- adm-bank-v1-g5/admission-bank-v1-g6 content versions only. Grade 7/8 legacy-import rows
-- are intentionally reported separately and are not eligible for current official checks.

WITH form_questions AS (
  SELECT
    f.form_code,
    coalesce(b.target_grade, q.grade_level, qp.grade_level, substring(f.form_code from '[0-9]+')::smallint) AS grade,
    coalesce(
      b.subject,
      qp.subject,
      case
        when f.form_code ilike 'ENG%' then 'english'
        when f.form_code ilike 'MAT%' then 'maths'
        when f.form_code ilike 'SCI%' then 'science'
        when q.content_version ilike '%eng%' then 'english'
        when q.content_version ilike '%math%' then 'maths'
        when q.content_version ilike '%sci%' or q.content_version ilike '%science%' then 'science'
        else 'unknown'
      end
    ) AS subject,
    fq.form_id,
    fq.question_id,
    fq.question_order,
    q.external_id,
    coalesce(q.content_version, qp.content_version) AS content_version,
    q.stem,
    adm_normalize_question_stem(q.stem) AS normalized_stem,
    CASE WHEN coalesce(q.content_version, qp.content_version) = 'legacy-import' OR q.external_id IS NULL THEN true ELSE false END AS uses_legacy_or_unmanaged_question
  FROM adm_test_form_questions fq
  JOIN adm_test_forms f ON f.id = fq.form_id
  LEFT JOIN adm_blueprints b ON b.id = f.blueprint_id
  JOIN adm_questions q ON q.id = fq.question_id
  LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id
), form_question_id_duplicates AS (
  SELECT form_code, grade, subject, form_id, question_id::text AS duplicate_key, COUNT(*) AS duplicate_count,
         COUNT(*) FILTER (WHERE uses_legacy_or_unmanaged_question) AS legacy_or_unmanaged_question_count,
         array_agg(external_id ORDER BY question_order) AS external_ids,
         array_agg(content_version ORDER BY question_order) AS content_versions,
         array_agg(left(stem, 160) ORDER BY question_order) AS stem_previews
  FROM form_questions
  GROUP BY form_code, grade, subject, form_id, question_id
  HAVING COUNT(*) > 1
), form_stem_duplicates AS (
  SELECT form_code, grade, subject, form_id, normalized_stem AS duplicate_key, COUNT(*) AS duplicate_count,
         COUNT(*) FILTER (WHERE uses_legacy_or_unmanaged_question) AS legacy_or_unmanaged_question_count,
         array_agg(external_id ORDER BY question_order) AS external_ids,
         array_agg(content_version ORDER BY question_order) AS content_versions,
         array_agg(left(stem, 160) ORDER BY question_order) AS stem_previews
  FROM form_questions
  GROUP BY form_code, grade, subject, form_id, normalized_stem
  HAVING COUNT(*) > 1
), current_official_bank_questions AS (
  SELECT NULL::text AS form_code, coalesce(q.grade_level, qp.grade_level) AS grade,
    coalesce(qp.subject, case when q.content_version ilike '%eng%' or q.external_id ilike '%eng%' then 'english' when q.content_version ilike '%math%' or q.external_id ilike '%math%' then 'maths' when q.content_version ilike '%sci%' or q.content_version ilike '%science%' or q.external_id ilike '%sci%' then 'science' else 'unknown' end) AS subject,
    NULL::uuid AS form_id, q.question_type, q.strand, q.subskill, q.external_id, coalesce(q.content_version, qp.content_version) AS content_version, q.stem, adm_normalize_question_stem(q.stem) AS normalized_stem
  FROM adm_questions q LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id
  WHERE (q.is_official = true OR qp.is_official = true)
    AND coalesce(q.content_owner, qp.content_owner) = 'brain_heist'
    AND q.external_id IS NOT NULL
    AND coalesce(q.content_version, qp.content_version) IS NOT NULL
    AND coalesce(q.content_version, qp.content_version) <> 'legacy-import'
    AND (coalesce(q.content_version, qp.content_version) LIKE 'adm-bank-v1-g5-%' OR coalesce(q.content_version, qp.content_version) LIKE 'adm-bank-v1-g6-%')
), current_official_bank_stem_duplicates AS (
  SELECT form_code, grade, subject, form_id, normalized_stem AS duplicate_key, COUNT(*) AS duplicate_count,
         0::bigint AS legacy_or_unmanaged_question_count,
         array_agg(external_id ORDER BY external_id) AS external_ids,
         array_agg(content_version ORDER BY external_id) AS content_versions,
         array_agg(left(stem, 160) ORDER BY external_id) AS stem_previews
  FROM current_official_bank_questions
  GROUP BY form_code, grade, subject, form_id, question_type, strand, subskill, normalized_stem
  HAVING COUNT(*) > 1
), legacy_official_bank_missing_external_id_or_unmanaged AS (
  SELECT NULL::text AS form_code, coalesce(q.grade_level, qp.grade_level) AS grade, coalesce(qp.subject, 'unknown') AS subject, NULL::uuid AS form_id,
         coalesce(q.content_version, qp.content_version, 'missing-content-version') AS duplicate_key,
         COUNT(*) AS duplicate_count,
         COUNT(*) FILTER (WHERE coalesce(q.content_version, qp.content_version) = 'legacy-import' OR q.external_id IS NULL) AS legacy_or_unmanaged_question_count,
         array_agg(q.external_id ORDER BY q.external_id NULLS LAST) FILTER (WHERE q.external_id IS NOT NULL) AS external_ids,
         array_agg(DISTINCT coalesce(q.content_version, qp.content_version, 'missing-content-version')) AS content_versions,
         array_agg(left(q.stem, 160) ORDER BY q.external_id NULLS LAST) FILTER (WHERE q.external_id IS NULL OR coalesce(q.content_version, qp.content_version) = 'legacy-import') AS stem_previews
  FROM adm_questions q LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id
  WHERE (q.is_official = true OR qp.is_official = true)
    AND coalesce(q.content_owner, qp.content_owner) = 'brain_heist'
    AND (coalesce(q.content_version, qp.content_version) = 'legacy-import' OR q.external_id IS NULL OR NOT (coalesce(q.content_version, qp.content_version) LIKE 'adm-bank-v1-g5-%' OR coalesce(q.content_version, qp.content_version) LIKE 'adm-bank-v1-g6-%'))
  GROUP BY coalesce(q.grade_level, qp.grade_level), coalesce(qp.subject, 'unknown'), coalesce(q.content_version, qp.content_version, 'missing-content-version')
)
SELECT 'duplicate_question_id_per_form' AS check_type, * FROM form_question_id_duplicates
UNION ALL SELECT 'generated_form_duplicate_normalized_stem' AS check_type, * FROM form_stem_duplicates
UNION ALL SELECT 'current_official_bank_duplicate_normalized_stem' AS check_type, * FROM current_official_bank_stem_duplicates
UNION ALL SELECT 'legacy_official_bank_missing_external_id_or_unmanaged' AS check_type, * FROM legacy_official_bank_missing_external_id_or_unmanaged
ORDER BY check_type, grade, subject, form_code NULLS LAST, duplicate_count DESC;
