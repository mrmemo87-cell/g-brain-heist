-- Admission legacy official-bank cleanup inspection.
-- Reports whether legacy/unmanaged Brains Heist official-looking rows are referenced by forms or attempts.
-- can_archive is true only when no generated form or attempt references the question rows.

WITH legacy_questions AS (
  SELECT q.id, coalesce(q.grade_level, qp.grade_level) AS grade, coalesce(qp.subject, 'unknown') AS subject,
         coalesce(q.content_version, qp.content_version, 'missing-content-version') AS content_version,
         q.status,
         coalesce(q.is_official, false) AS question_is_official,
         coalesce(qp.is_official, false) AS pool_is_official,
         coalesce(qp.is_active, false) AS pool_is_active
  FROM adm_questions q
  LEFT JOIN adm_question_pools qp ON qp.id = q.pool_id
  WHERE coalesce(q.content_owner, qp.content_owner) = 'brain_heist'
    AND (coalesce(q.content_version, qp.content_version) = 'legacy-import' OR q.external_id IS NULL OR NOT (coalesce(q.content_version, qp.content_version) LIKE 'adm-bank-v1-g%'))
)
SELECT lq.grade, lq.subject, lq.content_version,
       COUNT(DISTINCT lq.id) AS question_count,
       COUNT(DISTINCT lq.id) FILTER (WHERE lq.status = 'archived' OR (lq.question_is_official = false AND lq.pool_is_official = false) OR lq.pool_is_active = false) AS archived_legacy_question_count,
       COUNT(DISTINCT lq.id) FILTER (WHERE lq.status = 'published' AND (lq.question_is_official = true OR lq.pool_is_official = true) AND lq.pool_is_active = true) AS active_unmanaged_question_count,
       COUNT(DISTINCT fq.form_id) AS referenced_form_count,
       COUNT(DISTINCT a.id) AS referenced_attempt_count,
       (COUNT(DISTINCT fq.form_id) = 0 AND COUNT(DISTINCT a.id) = 0) AS can_archive
FROM legacy_questions lq
LEFT JOIN adm_test_form_questions fq ON fq.question_id = lq.id
LEFT JOIN adm_attempts a ON a.form_id = fq.form_id
GROUP BY lq.grade, lq.subject, lq.content_version
ORDER BY lq.grade, lq.subject, lq.content_version;
