-- Inspect generated Admission Hub forms for option-position and option-length quality.
-- Use this after regenerating forms from a QA-passing official bank. Historical/pre-QA
-- forms may remain for audit/history, but current package send cards should prefer the
-- newest clean generated forms once they exist.

WITH form_questions AS (
  SELECT
    f.id AS form_id,
    f.form_code,
    f.status,
    f.published_at,
    f.created_at,
    q.id AS question_id,
    q.external_id,
    q.stem,
    q.correct_index,
    q.options,
    q.content_owner,
    q.content_version,
    lower(regexp_replace(coalesce(q.stem, ''), '[^a-z0-9]+', ' ', 'g')) AS normalized_stem
  FROM public.adm_test_forms f
  JOIN public.adm_test_form_questions fq ON fq.form_id = f.id
  JOIN public.adm_questions q ON q.id = fq.question_id
), option_lengths AS (
  SELECT
    form_id,
    form_code,
    question_id,
    external_id,
    stem,
    correct_index,
    content_owner,
    content_version,
    normalized_stem,
    CASE WHEN jsonb_typeof(options) = 'array' AND correct_index IS NOT NULL
      THEN length(coalesce(options ->> correct_index, ''))
      ELSE NULL END AS correct_length,
    CASE WHEN jsonb_typeof(options) = 'array'
      THEN (SELECT max(length(value)) FROM jsonb_array_elements_text(options) AS option(value))
      ELSE NULL END AS max_option_length
  FROM form_questions
), duplicate_stems AS (
  SELECT form_id, normalized_stem, count(*) AS duplicate_count
  FROM form_questions
  WHERE normalized_stem <> ''
  GROUP BY form_id, normalized_stem
  HAVING count(*) > 1
)
SELECT
  ol.form_code,
  count(*) AS question_count,
  round(100.0 * count(*) FILTER (WHERE correct_length = max_option_length AND correct_length IS NOT NULL) / nullif(count(*) FILTER (WHERE correct_length IS NOT NULL), 0), 1) AS pct_correct_option_longest,
  jsonb_build_object(
    'A', count(*) FILTER (WHERE correct_index = 0),
    'B', count(*) FILTER (WHERE correct_index = 1),
    'C', count(*) FILTER (WHERE correct_index = 2),
    'D', count(*) FILTER (WHERE correct_index = 3)
  ) AS answer_position_distribution,
  count(*) FILTER (WHERE external_id IS NULL OR content_owner IS DISTINCT FROM 'brain_heist' OR content_version = 'legacy-import') AS legacy_or_unmanaged_question_count,
  coalesce((SELECT sum(duplicate_count) FROM duplicate_stems ds WHERE ds.form_id = ol.form_id), 0) AS duplicate_stem_count
FROM option_lengths ol
GROUP BY ol.form_id, ol.form_code
ORDER BY ol.form_code;
