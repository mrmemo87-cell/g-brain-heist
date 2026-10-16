-- Optional AI drafts use a durable claim, exact source hash and explicit teacher confirmation.
create table private.ielts_plan_ai_drafts (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null references public.users(id),
 reviewer_id uuid not null references public.users(id),source_hash text not null,context jsonb not null,
 model text not null,prompt_version text not null default 'bh-ielts-learning-plan-v1',
 state text not null default 'working' check(state in ('working','ready','failed')),fields jsonb,provider_id text,
 created_at timestamptz not null default now(),finished_at timestamptz
);
create index ielts_plan_ai_reviewer_rate on private.ielts_plan_ai_drafts(reviewer_id,created_at desc);
create index ielts_plan_ai_student on private.ielts_plan_ai_drafts(school_id,student_id,created_at desc);
alter table private.ielts_plan_ai_drafts enable row level security;
revoke all on private.ielts_plan_ai_drafts from public,anon,authenticated,service_role;
create table private.ielts_plan_ai_links(plan_id uuid primary key references private.ielts_learning_plans(id),draft_id uuid not null references private.ielts_plan_ai_drafts(id));
create index ielts_plan_ai_draft_links on private.ielts_plan_ai_links(draft_id);
alter table private.ielts_plan_ai_links enable row level security;
revoke all on private.ielts_plan_ai_links from public,anon,authenticated,service_role;
create trigger ielts_plan_ai_links_append_only before update or delete on private.ielts_plan_ai_links for each row execute function private.academic_report_records_are_append_only();

create function private.ielts_plan_ai_context(p_school uuid,p_student uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('evidence',coalesce((select jsonb_agg(e-array['route','staff_route','reviewer','snapshot_hash']) from jsonb_array_elements(private.ielts_report_evidence(p_school,p_student,now())) e),'[]'),
 'study_goal',(select fields->>'study_goal' from private.ielts_learning_plans where school_id=p_school and student_id=p_student order by version desc limit 1),
 'review_on',(current_date+28)::text);
$$;
revoke all on function private.ielts_plan_ai_context(uuid,uuid) from public,anon,authenticated,service_role;
create function public.rpc_ielts_claim_plan_ai(p_school uuid,p_student uuid,p_model text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; fingerprint text; prior private.ielts_plan_ai_drafts; id uuid;
begin
 if not private.ielts_report_staff(p_school,p_student) then raise exception using errcode='42501',message='not_authorized'; end if;
 if length(coalesce(p_model,'')) not between 1 and 100 then raise exception 'invalid_model'; end if;
 context:=private.ielts_plan_ai_context(p_school,p_student);
 if jsonb_array_length(context->'evidence')=0 then raise exception 'evidence_required'; end if;
 fingerprint:=encode(extensions.digest(convert_to(context::text,'UTF8'),'sha256'),'hex');
 -- Only AI admission is globally serialised. No answer save or ordinary reporting lock.
 perform pg_advisory_xact_lock(hashtextextended('ielts-plan-ai-admission',0));
 select * into prior from private.ielts_plan_ai_drafts d where d.school_id=p_school and d.student_id=p_student and d.reviewer_id=auth.uid() and d.source_hash=fingerprint and d.model=p_model order by d.created_at desc limit 1;
 if prior.state='ready' then return jsonb_build_object('id',prior.id,'fields',prior.fields); end if;
 if prior.state='working' and prior.created_at>now()-interval '2 minutes' then raise exception 'ai_already_working'; end if;
 if (select count(*) from private.ielts_plan_ai_drafts where reviewer_id=auth.uid() and created_at>now()-interval '1 hour')>=6
 or (select count(*) from private.ielts_plan_ai_drafts where state='working' and created_at>now()-interval '2 minutes')>=8 then raise exception 'ai_rate_limit'; end if;
 insert into private.ielts_plan_ai_drafts(school_id,student_id,reviewer_id,source_hash,context,model) values(p_school,p_student,auth.uid(),fingerprint,context,p_model) returning ielts_plan_ai_drafts.id into id;
 return jsonb_build_object('id',id,'context',context);
end; $$;
revoke all on function public.rpc_ielts_claim_plan_ai(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_claim_plan_ai(uuid,uuid,text) to authenticated;
create function public.rpc_ielts_finish_plan_ai(p_id uuid,p_fields jsonb,p_provider text) returns void
language plpgsql security definer set search_path='' as $$
declare d private.ielts_plan_ai_drafts;
begin
 select * into d from private.ielts_plan_ai_drafts where id=p_id and state='working' for update;
 if d.id is null then raise exception 'draft_not_working'; end if;
 if p_fields is not null then perform private.validate_ielts_plan(p_fields,d.context->'evidence'); end if;
 update private.ielts_plan_ai_drafts set fields=p_fields,provider_id=left(p_provider,200),state=case when p_fields is null then 'failed' else 'ready' end,finished_at=now() where id=p_id;
end; $$;
revoke all on function public.rpc_ielts_finish_plan_ai(uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_finish_plan_ai(uuid,jsonb,text) to service_role;
create function public.rpc_ielts_save_plan_with_ai(p_school uuid,p_student uuid,p_fields jsonb,p_expected uuid,p_request uuid,p_draft uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.ielts_plan_ai_drafts; result jsonb;
begin
 if not private.ielts_report_staff(p_school,p_student) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into d from private.ielts_plan_ai_drafts where id=p_draft and school_id=p_school and student_id=p_student and reviewer_id=auth.uid() and state='ready';
 if d.id is null then raise exception using errcode='42501',message='not_authorized'; end if;
 if not exists(select 1 from private.ielts_learning_plans where id=p_request) and d.source_hash<>encode(extensions.digest(convert_to(private.ielts_plan_ai_context(p_school,p_student)::text,'UTF8'),'sha256'),'hex') then raise exception 'evidence_changed_reload'; end if;
 result:=public.rpc_ielts_save_learning_plan(p_school,p_student,p_fields,p_expected,p_request);
 if exists(select 1 from private.ielts_plan_ai_links where plan_id=p_request and draft_id<>p_draft) then raise exception 'request_conflict'; end if;
 insert into private.ielts_plan_ai_links(plan_id,draft_id) values(p_request,p_draft) on conflict do nothing;
 return result;
end; $$;
revoke all on function public.rpc_ielts_save_plan_with_ai(uuid,uuid,jsonb,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_save_plan_with_ai(uuid,uuid,jsonb,uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
