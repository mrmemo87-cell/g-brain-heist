-- Recalculate AS Chemistry — Atomic Structure scores after answer-key correction.
--
-- Corrected questions in the canonical key:
--   Q31: D -> C
--   Q32: D -> A
--   Q37: B -> C
--   Q38: A -> B
--
-- This updates existing attempts in quiz_scores for both parts using stored answers.responses.

WITH atomic_key AS (
  SELECT * FROM (VALUES
    (1,'A'),(2,'C'),(3,'C'),(4,'D'),(5,'B'),
    (6,'B'),(7,'A'),(8,'A'),(9,'D'),(10,'D'),
    (11,'B'),(12,'A'),(13,'C'),(14,'A'),(15,'C'),
    (16,'A'),(17,'D'),(18,'C'),(19,'C'),(20,'B'),
    (21,'B'),(22,'A'),(23,'B'),(24,'D'),(25,'A'),
    (26,'C'),(27,'D'),(28,'A'),(29,'D'),(30,'C'),
    (31,'C'),(32,'A'),(33,'D'),(34,'B'),(35,'C'),
    (36,'D'),(37,'C'),(38,'B'),(39,'A'),(40,'C'),
    (41,'D'),(42,'A'),(43,'C'),(44,'C'),(45,'D'),
    (46,'C'),(47,'A'),(48,'D'),(49,'A')
  ) AS t(question_number, correct_answer)
),
part_bounds AS (
  SELECT 'AS Chemistry — Atomic Structure (Part 1)'::text AS quiz_name, 1 AS q_min, 25 AS q_max, 25 AS total_questions
  UNION ALL
  SELECT 'AS Chemistry — Atomic Structure (Part 2)'::text, 26, 49, 24
),
recalc AS (
  SELECT
    qs.id,
    pb.total_questions,
    COUNT(*) FILTER (
      WHERE UPPER(TRIM(COALESCE(resp.value, ''))) = ak.correct_answer
    )::int AS new_score
  FROM quiz_scores qs
  JOIN part_bounds pb
    ON pb.quiz_name = qs.quiz_name
  JOIN atomic_key ak
    ON ak.question_number BETWEEN pb.q_min AND pb.q_max
  LEFT JOIN LATERAL (
    SELECT value
    FROM jsonb_each_text(COALESCE(qs.answers->'responses', '{}'::jsonb))
    WHERE key = ak.question_number::text
  ) resp ON TRUE
  GROUP BY qs.id, pb.total_questions
)
UPDATE quiz_scores qs
SET
  score = recalc.new_score,
  total_questions = recalc.total_questions,
  percentage = ROUND((recalc.new_score::numeric * 100.0) / NULLIF(recalc.total_questions, 0))::int
FROM recalc
WHERE qs.id = recalc.id;

-- Optional verification query:
-- SELECT quiz_name, COUNT(*) attempts, AVG(percentage)::numeric(5,2) avg_percentage
-- FROM quiz_scores
-- WHERE quiz_name IN ('AS Chemistry — Atomic Structure (Part 1)', 'AS Chemistry — Atomic Structure (Part 2)')
-- GROUP BY quiz_name
-- ORDER BY quiz_name;
