-- Admission duplicate-question inspection.
-- Reports exact duplicate question ids per generated form, duplicate normalized stems per form,
-- and duplicate normalized stems in the official bank by grade/subject/question type.

WITH form_questions AS (
  SELECT
    f.form_code,
    coalesce(
      b.target_grade,
      q.grade_level,
      qp.grade_level,
      substring(f.form_code from '[0-9]+')::smallint
    ) AS grade,
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
    q.stem,
    adm_normalize_question_stem(q.stem) AS normalized_stem
  FROM adm_test_form_questions fq
  JOIN adm_test_forms f ON f.id = fq.form_id
  LEFT JOIN adm_blueprints b ON b.id = f.blueprint_id
  JOIN adm_questions q ON q.id = fq.question_id
  LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id
), form_question_id_duplicates AS (
  SELECT form_code, grade, subject, form_id, question_id::text AS duplicate_key, COUNT(*) AS duplicate_count,
         array_agg(external_id ORDER BY question_order) AS external_ids,
         array_agg(left(stem, 160) ORDER BY question_order) AS stem_previews
  FROM form_questions
  GROUP BY form_code, grade, subject, form_id, question_id
  HAVING COUNT(*) > 1
), form_stem_duplicates AS (
  SELECT form_code, grade, subject, form_id, normalized_stem AS duplicate_key,
         COUNT(*) AS duplicate_count, array_agg(external_id ORDER BY question_order) AS external_ids,
         array_agg(left(stem, 160) ORDER BY question_order) AS stem_previews
  FROM form_questions
  GROUP BY form_code, grade, subject, form_id, normalized_stem
  HAVING COUNT(*) > 1
), official_bank_questions AS (
  SELECT
    NULL::text AS form_code,
    coalesce(q.grade_level, qp.grade_level) AS grade,
    coalesce(
      qp.subject,
      case
        when q.content_version ilike '%eng%' or q.external_id ilike '%eng%' then 'english'
        when q.content_version ilike '%math%' or q.external_id ilike '%math%' then 'maths'
        when q.content_version ilike '%sci%' or q.content_version ilike '%science%' or q.external_id ilike '%sci%' then 'science'
        else 'unknown'
      end
    ) AS subject,
    NULL::uuid AS form_id,
    q.question_type,
    q.strand,
    q.subskill,
    q.external_id,
    q.content_version,
    q.stem,
    adm_normalize_question_stem(q.stem) AS normalized_stem
  FROM adm_questions q
  LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id
  WHERE q.is_official = true AND q.is_locked = true AND q.status = 'published'
), official_bank_stem_duplicates AS (
  SELECT form_code, grade, subject, form_id, normalized_stem AS duplicate_key, COUNT(*) AS duplicate_count,
         array_agg(external_id ORDER BY external_id) AS external_ids,
         array_agg(left(stem, 160) ORDER BY external_id) AS stem_previews
  FROM official_bank_questions
  GROUP BY form_code, grade, subject, form_id, question_type, strand, subskill, normalized_stem
  HAVING COUNT(*) > 1
)
SELECT 'duplicate_question_id_per_form' AS check_type, * FROM form_question_id_duplicates
UNION ALL
SELECT 'duplicate_normalized_stem_per_form' AS check_type, * FROM form_stem_duplicates
UNION ALL
SELECT 'duplicate_official_bank_normalized_stem' AS check_type, * FROM official_bank_stem_duplicates
ORDER BY check_type, grade, subject, form_code NULLS LAST, duplicate_count DESC;
