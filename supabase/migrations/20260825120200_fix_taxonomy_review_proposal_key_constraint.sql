-- PostgreSQL's POSIX regex engine caps repetition bounds at 255. The initial
-- queue constraint used {2,299}, which is accepted as text at DDL time but
-- raises an invalid-repetition error when a row is checked. Keep the intended
-- 3–300 character boundary with an explicit length check and an unbounded
-- character-class regex.

alter table public.question_taxonomy_review_queue
  drop constraint if exists question_taxonomy_review_queue_proposal_key_check;

alter table public.question_taxonomy_review_queue
  add constraint question_taxonomy_review_queue_proposal_key_check
  check (
    length(proposal_key) between 3 and 300
    and proposal_key ~ '^[a-z0-9][a-z0-9._:-]*$'
  );
