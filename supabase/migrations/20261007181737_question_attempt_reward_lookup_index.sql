-- Target record_question_attempt's per-student/question 24-hour reward check.
-- Only correct attempts are indexed; NOW() stays in the query, not the predicate.
-- This transactional build briefly blocks writes. Fail promptly rather than queue
-- behind active gameplay, and bound the build on the current small table.
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '5s';
CREATE INDEX IF NOT EXISTS idx_question_attempts_correct_reward_lookup
  ON public.question_attempts (student_id, question_id, attempted_at DESC)
  WHERE is_correct = true;
