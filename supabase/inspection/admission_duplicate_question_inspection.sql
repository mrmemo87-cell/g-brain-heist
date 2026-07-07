-- Admission duplicate-question inspection.
-- Reports exact duplicate question ids per generated form, duplicate normalized stems per form,
-- and duplicate normalized stems in the official bank by grade/subject/question type.

WITH form_question_id_duplicates AS (
  SELECT f.form_code, bp.target_grade AS grade, bp.subject, fq.form_id, fq.question_id, COUNT(*) AS duplicate_count,
         array_agg(q.external_id ORDER BY fq.question_order) AS external_ids,
         array_agg(left(q.stem, 160) ORDER BY fq.question_order) AS stems
  FROM adm_test_form_questions fq
  JOIN adm_test_forms f ON f.id = fq.form_id
  LEFT JOIN adm_blueprints bp ON bp.id = f.blueprint_id
  JOIN adm_questions q ON q.id = fq.question_id
  GROUP BY f.form_code, bp.target_grade, bp.subject, fq.form_id, fq.question_id
  HAVING COUNT(*) > 1
), form_stem_duplicates AS (
  SELECT f.form_code, bp.target_grade AS grade, bp.subject, fq.form_id, adm_normalize_question_stem(q.stem) AS normalized_stem,
         COUNT(*) AS duplicate_count, array_agg(q.external_id ORDER BY fq.question_order) AS external_ids,
         array_agg(left(q.stem, 160) ORDER BY fq.question_order) AS stems
  FROM adm_test_form_questions fq
  JOIN adm_test_forms f ON f.id = fq.form_id
  LEFT JOIN adm_blueprints bp ON bp.id = f.blueprint_id
  JOIN adm_questions q ON q.id = fq.question_id
  GROUP BY f.form_code, bp.target_grade, bp.subject, fq.form_id, adm_normalize_question_stem(q.stem)
  HAVING COUNT(*) > 1
), official_bank_stem_duplicates AS (
  SELECT NULL::text AS form_code, q.grade_level AS grade, q.subject, NULL::uuid AS form_id,
         adm_normalize_question_stem(q.stem) AS normalized_stem, COUNT(*) AS duplicate_count,
         array_agg(q.external_id ORDER BY q.external_id) AS external_ids,
         array_agg(left(q.stem, 160) ORDER BY q.external_id) AS stems
  FROM adm_questions q
  WHERE q.is_official = true AND q.is_locked = true AND q.status = 'published'
  GROUP BY q.grade_level, q.subject, q.question_type, adm_normalize_question_stem(q.stem)
  HAVING COUNT(*) > 1
)
SELECT 'duplicate_question_id_per_form' AS finding_type, * FROM form_question_id_duplicates
UNION ALL
SELECT 'duplicate_normalized_stem_per_form' AS finding_type, * FROM form_stem_duplicates
UNION ALL
SELECT 'duplicate_official_bank_normalized_stem' AS finding_type, * FROM official_bank_stem_duplicates
ORDER BY finding_type, grade, subject, form_code NULLS LAST, duplicate_count DESC;
