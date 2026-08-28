-- Keep teacher assignment report analysis fast as answer history grows.
-- The analysis RPC filters answer rows by assignment and question together;
-- this avoids repeated bitmap intersections across the two single-column indexes.
create index if not exists student_assignment_answers_assignment_question_idx
  on public.student_assignment_answers (assignment_id, question_id);
