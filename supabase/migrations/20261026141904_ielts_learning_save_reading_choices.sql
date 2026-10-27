-- Targeted Reading saves: accept each question's own answer format.
-- The save check was written for the first TRUE/FALSE/NOT GIVEN reading pilot and only accepted TRUE, FALSE or NOT GIVEN
-- for q1-q6. Reading sets since then use letter or YES/NO choices (options) and typed gap answers (answer_format text),
-- which the save rejected ("invalid_answers"), so no student could save or submit them. Now a reading answer must be
-- empty or: one of that question's option values when it has options; at most 120 characters when it is a typed answer;
-- otherwise TRUE, FALSE or NOT GIVEN as before. Every other rule (access, active status, revision check, listening,
-- writing, speaking, evidence notes e1-e6, assistance) is unchanged.
create or replace function public.rpc_ielts_learning_save(p_id uuid, p_revision integer, p_answers jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare a private.ielts_learning_allocations%rowtype; skill text; qs jsonb; q jsonb; k text; v jsonb;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id for update;
 if a.student_id<>auth.uid() or a.status not in ('assigned','in_progress') then raise exception 'task_not_active'; end if;
 select t.skill, t.questions into skill, qs from private.ielts_learning_tasks t where code=a.task_code;
 if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'invalid_answers'; end if;
 for k,v in select * from jsonb_each(p_answers) loop
  if jsonb_typeof(v)<>'string' then raise exception 'invalid_answers'; end if;
  if k='assistance' then if length(v#>>'{}')>1200 then raise exception 'invalid_answers'; end if;
  elsif skill='listening' then if k not in ('q1','q2','q3','q4','q5','q6') or length(v#>>'{}')>120 then raise exception 'invalid_answers'; end if;
  elsif skill='reading' then
   if k in ('e1','e2','e3','e4','e5','e6') then
    if length(v#>>'{}')>1000 then raise exception 'invalid_answers'; end if;
   elsif k in ('q1','q2','q3','q4','q5','q6') then
    select x into q from jsonb_array_elements(qs) x where x->>'id'=k;
    if (v#>>'{}')<>'' and not (
      case
       when jsonb_typeof(q->'options')='array' then exists(select 1 from jsonb_array_elements(q->'options') o where o->>'value'=(v#>>'{}'))
       when q->>'answer_format'='text' then length(v#>>'{}')<=120
       else (v#>>'{}') in ('TRUE','FALSE','NOT GIVEN')
      end) then raise exception 'invalid_answers'; end if;
   else raise exception 'invalid_answers';
   end if;
  elsif k<>'response' or length(v#>>'{}')>12000 then raise exception 'invalid_answers'; end if;
 end loop;
 if a.answers=p_answers then return a.revision; end if;
 if a.revision is distinct from p_revision then raise exception 'draft_changed_in_another_tab'; end if;
 update private.ielts_learning_allocations set answers=p_answers,revision=revision+1,status='in_progress',started_at=coalesce(started_at,now()),updated_at=now() where id=p_id returning revision into p_revision;
 return p_revision;
end; $function$;
revoke all on function public.rpc_ielts_learning_save(uuid,integer,jsonb) from public, anon;
grant execute on function public.rpc_ielts_learning_save(uuid,integer,jsonb) to authenticated;
