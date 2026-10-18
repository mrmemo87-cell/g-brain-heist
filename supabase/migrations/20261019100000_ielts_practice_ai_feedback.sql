-- Diagnostic Bible 2.0.0 section 10.5: AI first-pass feedback on PRACTICE writing, returned to the student within
-- minutes and labelled; a teacher may confirm or adjust it. It is never evidence, never a report entry and never an
-- overall band. Only the student who wrote the response can request it; one per attempt; at most 8 per day.

create table if not exists private.ielts_practice_ai_feedback (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null unique references public.ielts_writing_attempts(id),
 student_id uuid not null references public.users(id),
 status text not null default 'working' check (status in ('working','ready','failed')),
 model text not null,
 prompt_version text,
 fields jsonb,
 provider_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 confirmed_by uuid references public.users(id),
 confirmed_at timestamptz,
 teacher_note text,
 check ((status = 'ready') = (fields is not null)),
 check ((confirmed_by is null) = (confirmed_at is null))
);
alter table private.ielts_practice_ai_feedback enable row level security;
create index if not exists ielts_practice_ai_feedback_student on private.ielts_practice_ai_feedback(student_id, created_at);

create or replace function private.ielts_practice_feedback_json(f private.ielts_practice_ai_feedback) returns jsonb
language sql stable set search_path to '' as $$
 select jsonb_build_object('id', f.id, 'status', f.status, 'fields', f.fields, 'created_at', f.created_at,
  'confirmed', f.confirmed_at is not null, 'confirmed_at', f.confirmed_at, 'teacher_note', f.teacher_note,
  'confirmed_by', (select coalesce(nullif(u.full_name,''), u.username) from public.users u where u.id = f.confirmed_by))
$$;

-- Student claims feedback for their own submitted practice response; returns the bounded context for the model.
create or replace function public.rpc_ielts_practice_feedback_claim(p_attempt uuid, p_model text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare a public.ielts_writing_attempts; t public.ielts_writing_tasks; f private.ielts_practice_ai_feedback; task int;
begin
 select * into a from public.ielts_writing_attempts where id = p_attempt;
 if a.id is null or auth.uid() is null or a.user_id <> auth.uid()
    or exists(select 1 from public.users where id = auth.uid() and coalesce(is_banned,false)) then raise exception 'not_available'; end if;
 select * into t from public.ielts_writing_tasks where id = a.task_id;
 if t.id is null or not t.is_active or t.task_type ilike '%general%' or not private.ielts_practice_material_allowed('ielts_writing_task', t.id::text) then raise exception 'not_available'; end if;
 if coalesce(a.word_count, 0) < 50 or length(trim(coalesce(a.answer_text,''))) < 200 then raise exception 'too_short'; end if;
 task := case when t.task_type ~ '1' then 1 else 2 end;
 select * into f from private.ielts_practice_ai_feedback where attempt_id = a.id for update;
 if f.status = 'ready' then return jsonb_build_object('id', f.id, 'ready', true, 'feedback', private.ielts_practice_feedback_json(f)); end if;
 if f.status = 'working' and f.updated_at > now() - interval '2 minutes' then raise exception 'ai_already_working'; end if;
 if (select count(*) from private.ielts_practice_ai_feedback where student_id = auth.uid() and created_at > now() - interval '1 day') >= 8 and f.id is null
 then raise exception 'ai_rate_limit'; end if;
 if f.id is null then
  insert into private.ielts_practice_ai_feedback(attempt_id, student_id, model) values (a.id, auth.uid(), left(coalesce(p_model,''),80)) returning * into f;
 else
  update private.ielts_practice_ai_feedback set status = 'working', model = left(coalesce(p_model,''),80), updated_at = now() where id = f.id returning * into f;
 end if;
 return jsonb_build_object('id', f.id, 'ready', false, 'context', jsonb_build_object('task_number', task, 'prompt', t.prompt, 'essay', a.answer_text, 'word_count', a.word_count));
end $$;

-- Service role stores the validated output (or a failure).
create or replace function public.rpc_ielts_practice_feedback_finish(p_id uuid, p_fields jsonb, p_provider text) returns void
language plpgsql security definer set search_path to '' as $$
begin
 update private.ielts_practice_ai_feedback set status = case when p_fields is null then 'failed' else 'ready' end,
  fields = p_fields, prompt_version = p_fields->>'prompt_version', provider_id = left(p_provider, 120), updated_at = now()
 where id = p_id and status = 'working';
end $$;

-- The student or a teacher who manages IELTS practice at the student's school can read it.
create or replace function public.rpc_ielts_practice_feedback(p_attempt uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare f private.ielts_practice_ai_feedback; st public.users;
begin
 select * into f from private.ielts_practice_ai_feedback where attempt_id = p_attempt;
 if f.id is null then
  if exists(select 1 from public.ielts_writing_attempts a where a.id = p_attempt and a.user_id = auth.uid()) then return null; end if;
  select u.* into st from public.ielts_writing_attempts a join public.users u on u.id = a.user_id where a.id = p_attempt;
  if st.id is not null and public.can_manage_ielts_practice_school(st.school_id) then return null; end if;
  raise exception 'not_available';
 end if;
 select * into st from public.users where id = f.student_id;
 if not (f.student_id = auth.uid() or public.can_manage_ielts_practice_school(st.school_id)) then raise exception 'not_available'; end if;
 return private.ielts_practice_feedback_json(f);
end $$;

create or replace function public.rpc_ielts_practice_feedback_confirm(p_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare f private.ielts_practice_ai_feedback; st public.users;
begin
 select * into f from private.ielts_practice_ai_feedback where id = p_id for update;
 if f.id is null or f.status <> 'ready' then raise exception 'not_available'; end if;
 select * into st from public.users where id = f.student_id;
 if auth.uid() = f.student_id or not public.can_manage_ielts_practice_school(st.school_id) then raise exception 'not_authorized'; end if;
 update private.ielts_practice_ai_feedback set confirmed_by = auth.uid(), confirmed_at = now(),
  teacher_note = nullif(left(trim(coalesce(p_note,'')), 1200), ''), updated_at = now() where id = p_id returning * into f;
 return private.ielts_practice_feedback_json(f);
end $$;

revoke all on function private.ielts_practice_feedback_json(private.ielts_practice_ai_feedback) from public, anon, authenticated;
revoke all on function public.rpc_ielts_practice_feedback_claim(uuid,text) from public, anon, service_role;
revoke all on function public.rpc_ielts_practice_feedback_finish(uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.rpc_ielts_practice_feedback(uuid) from public, anon;
revoke all on function public.rpc_ielts_practice_feedback_confirm(uuid,text) from public, anon;
grant execute on function public.rpc_ielts_practice_feedback_claim(uuid,text) to authenticated;
grant execute on function public.rpc_ielts_practice_feedback_finish(uuid,jsonb,text) to service_role;
grant execute on function public.rpc_ielts_practice_feedback(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_feedback_confirm(uuid,text) to authenticated;
