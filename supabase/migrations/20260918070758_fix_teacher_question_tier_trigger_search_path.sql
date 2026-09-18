-- Fix teacher question submission under hardened RPC search_path.
--
-- rpc_teacher_submit_question_batch() intentionally runs with search_path = ''.
-- The legacy tier trigger inherited that caller search_path and referenced
-- `questions` without a schema, causing inserts to fail with:
--   relation "questions" does not exist
--
-- Keep the hardened empty search_path and schema-qualify the table explicitly.

create or replace function public.auto_assign_tier_teacher_questions()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_existing_count integer;
begin
  select count(*)
    into v_existing_count
  from public.questions q
  where q.subject = new.subject
    and q.difficulty = new.difficulty;

  new.tier_level := 1 + (v_existing_count / 15);
  return new;
end;
$function$;

comment on function public.auto_assign_tier_teacher_questions() is
  'Assigns teacher-question tier without relying on the caller search_path.';
