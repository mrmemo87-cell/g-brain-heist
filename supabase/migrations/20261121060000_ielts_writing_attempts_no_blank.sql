-- IELTS Writing practice (2026-11-21): ExamGuard auto-submit saved essays as blank with 0 words because the
-- callback read the text from the first render. The client is fixed; the database now refuses a blank answer too.
-- NOT VALID keeps the three existing blank rows (28 Oct 2026) untouched for the teacher's records.
alter table public.ielts_writing_attempts
  add constraint ielts_writing_attempts_answer_not_blank check (length(btrim(coalesce(answer_text, ''))) > 0) not valid;
