-- Diagnostic Bible 2.4.0 section 10.9: Writing essays get colour highlights with corrections and an AI estimated
-- task band that the teacher confirms.
--
-- 1. Practice: a school IELTS teacher can run the same practice feedback for a student's essay the student never sent
--    for feedback, or upgrade feedback made before highlights existed. One feedback row per attempt; 60 teacher runs
--    per day; a failed re-run keeps the earlier feedback. Feedback stays practice feedback: never evidence.
-- (The screener teacher draft change is in 20261114141000_ielts_writing_screener_draft_highlights.sql.)

alter table private.ielts_practice_ai_feedback add column if not exists requested_by uuid references auth.users(id);
alter table private.ielts_practice_ai_feedback add column if not exists previous_fields jsonb;
create index if not exists ielts_practice_ai_feedback_requested_by
  on private.ielts_practice_ai_feedback(requested_by, updated_at) where requested_by is not null;

create or replace function public.rpc_ielts_practice_feedback_claim_review(p_attempt uuid, p_model text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare a public.ielts_writing_attempts; t public.ielts_writing_tasks; f private.ielts_practice_ai_feedback; st public.users;
 task int; module text;
begin
 select * into a from public.ielts_writing_attempts where id = p_attempt;
 if a.id is null or auth.uid() is null or a.user_id = auth.uid()
    or exists(select 1 from public.users where id = auth.uid() and coalesce(is_banned,false)) then raise exception 'not_available'; end if;
 select * into st from public.users where id = a.user_id;
 if st.id is null or not public.can_manage_ielts_practice_school(st.school_id) then raise exception 'not_authorized'; end if;
 select * into t from public.ielts_writing_tasks where id = a.task_id;
 if t.id is null then raise exception 'not_available'; end if;
 if coalesce(a.word_count, 0) < 50 or length(trim(coalesce(a.answer_text,''))) < 200 then raise exception 'too_short'; end if;
 task := case when t.task_type ~ '1' then 1 else 2 end;
 module := case when t.task_type ilike '%general%' then 'general' else 'academic' end;
 select * into f from private.ielts_practice_ai_feedback where attempt_id = a.id for update;
 -- Ready feedback with highlights is returned as it is; feedback made before highlights existed may be upgraded.
 if f.status = 'ready' and f.fields ? 'highlights' then return jsonb_build_object('id', f.id, 'ready', true, 'feedback', private.ielts_practice_feedback_json(f)); end if;
 if f.status = 'working' and f.updated_at > now() - interval '2 minutes' then raise exception 'ai_already_working'; end if;
 if (select count(*) from private.ielts_practice_ai_feedback where requested_by = auth.uid() and updated_at > now() - interval '1 day') >= 60
 then raise exception 'ai_rate_limit'; end if;
 if f.id is null then
  insert into private.ielts_practice_ai_feedback(attempt_id, student_id, model, requested_by)
  values (a.id, a.user_id, left(coalesce(p_model,''),80), auth.uid()) returning * into f;
 else
  update private.ielts_practice_ai_feedback set status = 'working', model = left(coalesce(p_model,''),80), requested_by = auth.uid(),
   previous_fields = coalesce(fields, previous_fields), fields = null, updated_at = now()
  where id = f.id returning * into f;
 end if;
 return jsonb_build_object('id', f.id, 'ready', false, 'context', jsonb_build_object(
   'task_number', task, 'module', module, 'prompt', t.prompt, 'essay', a.answer_text, 'word_count', a.word_count));
end $$;
revoke all on function public.rpc_ielts_practice_feedback_claim_review(uuid,text) from public, anon, service_role;
grant execute on function public.rpc_ielts_practice_feedback_claim_review(uuid,text) to authenticated;

-- A failed run never erases earlier feedback: the row returns to ready with its previous fields.
create or replace function public.rpc_ielts_practice_feedback_finish(p_id uuid, p_fields jsonb, p_provider text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
 update private.ielts_practice_ai_feedback set
  status = case when p_fields is not null or previous_fields is not null then 'ready' else 'failed' end,
  fields = coalesce(p_fields, previous_fields),
  prompt_version = coalesce(p_fields->>'prompt_version', prompt_version),
  provider_id = case when p_fields is null then provider_id else left(p_provider, 120) end,
  previous_fields = case when p_fields is null then previous_fields else null end,
  updated_at = now()
 where id = p_id and status = 'working';
end $function$;
revoke all on function public.rpc_ielts_practice_feedback_finish(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.rpc_ielts_practice_feedback_finish(uuid,jsonb,text) to service_role;
