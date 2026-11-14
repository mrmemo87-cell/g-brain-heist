-- Diagnostic Bible 2.2.1 section 10.7: practice feedback made before highlights existed can be upgraded by a school
-- IELTS teacher; a failed run keeps the earlier feedback instead of erasing it.

-- The earlier feedback is parked in previous_fields while a re-run works (a working row has no fields).
alter table private.ielts_practice_speaking_feedback add column if not exists previous_fields jsonb;
create or replace function public.rpc_ielts_practice_speaking_feedback_claim_review(p_attempt uuid, p_model text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare a public.ielts_speaking_attempts; t public.ielts_speaking_tasks; f private.ielts_practice_speaking_feedback; st public.users;
begin
 select * into a from public.ielts_speaking_attempts where id = p_attempt;
 if a.id is null or auth.uid() is null or a.user_id = auth.uid() then raise exception 'not_available'; end if;
 select * into st from public.users where id = a.user_id;
 if st.id is null or not public.can_manage_ielts_practice_school(st.school_id) then raise exception 'not_authorized'; end if;
 select * into t from public.ielts_speaking_tasks where id = a.task_id;
 if t.id is null then raise exception 'not_available'; end if;
 if coalesce(a.duration_seconds, a.duration, 0) < 15 then raise exception 'too_short'; end if;
 select * into f from private.ielts_practice_speaking_feedback where attempt_id = a.id for update;
 -- Ready feedback with highlights is returned as it is; feedback made before highlights existed may be upgraded.
 if f.status = 'ready' and f.fields ? 'highlights' then return jsonb_build_object('id', f.id, 'ready', true, 'feedback', private.ielts_practice_speaking_feedback_json(f)); end if;
 if f.status = 'working' and f.updated_at > now() - interval '2 minutes' then raise exception 'ai_already_working'; end if;
 if (select count(*) from private.ielts_practice_speaking_feedback where requested_by = auth.uid() and updated_at > now() - interval '1 day') >= 60
 then raise exception 'ai_rate_limit'; end if;
 if f.id is null then
  insert into private.ielts_practice_speaking_feedback(attempt_id, student_id, model, requested_by)
  values (a.id, a.user_id, left(coalesce(p_model,''),80), auth.uid()) returning * into f;
 else
  update private.ielts_practice_speaking_feedback set status = 'working', model = left(coalesce(p_model,''),80), requested_by = auth.uid(),
   previous_fields = coalesce(fields, previous_fields), fields = null, updated_at = now()
  where id = f.id returning * into f;
 end if;
 return jsonb_build_object('id', f.id, 'ready', false, 'context', jsonb_build_object(
   'part', t.part, 'prompt', t.prompt, 'follow_ups', coalesce(t.follow_ups, '{}'::jsonb),
   'audio_path', 'speaking/' || auth.uid()::text || '/feedback/' || a.id::text || '.wav'));
end $$;
revoke all on function public.rpc_ielts_practice_speaking_feedback_claim_review(uuid,text) from public, anon, service_role;
grant execute on function public.rpc_ielts_practice_speaking_feedback_claim_review(uuid,text) to authenticated;

-- A failed run never erases earlier feedback: the row returns to ready with its previous fields.
create or replace function public.rpc_ielts_practice_speaking_feedback_finish(p_id uuid, p_fields jsonb, p_provider text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
 update private.ielts_practice_speaking_feedback set
  status = case when p_fields is not null or previous_fields is not null then 'ready' else 'failed' end,
  fields = coalesce(p_fields, previous_fields),
  prompt_version = coalesce(p_fields->>'prompt_version', prompt_version),
  provider_id = case when p_fields is null then provider_id else left(p_provider, 120) end,
  updated_at = now()
 where id = p_id and status = 'working';
end $function$;

revoke all on function public.rpc_ielts_practice_speaking_feedback_finish(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.rpc_ielts_practice_speaking_feedback_finish(uuid,jsonb,text) to service_role;
