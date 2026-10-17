-- A teacher range is distinct from a calibrated band and from practice scores.
create table private.ielts_readiness_decisions(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null references public.users(id),author_id uuid not null references public.users(id),
 supersedes uuid references private.ielts_readiness_decisions(id),fields jsonb not null,source_snapshot jsonb not null,source_hash text not null,request_id uuid not null unique,created_at timestamptz not null default now(),policy_version text not null default 'ielts-teacher-range-v1');
create index ielts_readiness_decisions_student on private.ielts_readiness_decisions(school_id,student_id,created_at desc,id);
create unique index ielts_readiness_decisions_replacement on private.ielts_readiness_decisions(supersedes) where supersedes is not null;
alter table private.ielts_readiness_decisions enable row level security;
revoke all on private.ielts_readiness_decisions from public,anon,authenticated,service_role;
create trigger ielts_readiness_decision_append_only before update or delete on private.ielts_readiness_decisions for each row execute function private.academic_report_records_are_append_only();

create function private.ielts_readiness_source_ok(e jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(e->>'kind'='screener' and case
 when e->>'skill' in ('listening','reading') then coalesce(e->>'conditions','')<>'review_required' and e->>'test_type' in ('academic','shared')
 and jsonb_array_length(e->'item_observations')>0 and not exists(select 1 from jsonb_array_elements(e->'item_observations') i where i->>'response_state' is distinct from 'answered')
 when e->>'skill'='writing' then e->>'review_id' is not null and e->>'test_type' in ('academic','shared') and coalesce((e->>'word_count')::integer,0)>0
 when e->>'skill'='speaking' then e->>'review_id' is not null else false end,false);
$$;
revoke all on function private.ielts_readiness_source_ok(jsonb) from public,anon,authenticated,service_role;

create function private.ielts_readiness_context(p_school uuid,p_student uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sources jsonb;eligible boolean:=true;sk text;
begin
 sources:=private.ielts_report_evidence(p_school,p_student,now());
 foreach sk in array array['listening','reading','writing','speaking'] loop
 if not exists(select 1 from jsonb_array_elements(sources) e where e->>'skill'=sk and private.ielts_readiness_source_ok(e)) then eligible:=false;end if;
 end loop;
 return jsonb_build_object('evidence',sources,'eligible',eligible,'source_hash',encode(extensions.digest(convert_to(sources::text,'UTF8'),'sha256'),'hex'));
end; $$;
revoke all on function private.ielts_readiness_context(uuid,uuid) from public,anon,authenticated,service_role;

create function private.validate_ielts_readiness_fields(p_fields jsonb,p_sources jsonb) returns void language plpgsql set search_path='' as $$
declare sk text;v jsonb;ref jsonb;lo numeric;hi numeric;all_skills boolean:=true;
begin
 if jsonb_typeof(p_fields) is distinct from 'object' or length(p_fields::text)>25000 or jsonb_typeof(p_fields->'skills') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_fields->'skills'))<>4 or p_fields->'teacher_checked' is distinct from 'true'::jsonb or exists(select 1 from jsonb_object_keys(p_fields) k where k not in ('skills','overall','teacher_checked')) then raise exception 'invalid_teacher_decision';end if;
 foreach sk in array array['listening','reading','writing','speaking','overall'] loop
 v:=case when sk='overall' then p_fields->'overall' else p_fields->'skills'->sk end;
 if jsonb_typeof(v) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v) k where k not in ('lower','upper','rationale','limitations','next_action','sources')) or length(trim(coalesce(v->>'rationale',''))) not between 10 and 1000 or length(trim(coalesce(v->>'limitations',''))) not between 10 and 1000 or length(trim(coalesce(v->>'next_action',''))) not between 5 and 800 or jsonb_typeof(v->'sources') is distinct from 'array' then raise exception 'invalid_estimate_scope';end if;
 if (v->>'lower') is null and (v->>'upper') is null then if sk<>'overall' then all_skills:=false;end if;
 else
 if jsonb_typeof(v->'lower') is distinct from 'number' or jsonb_typeof(v->'upper') is distinct from 'number' then raise exception 'range_required';end if;
 lo:=(v->>'lower')::numeric;hi:=(v->>'upper')::numeric;
 if lo<0 or hi>9 or lo>=hi or mod(lo*2,1)<>0 or mod(hi*2,1)<>0 then raise exception 'invalid_range';end if;
 if sk='overall' and not all_skills then raise exception 'four_skill_ranges_required';end if;
 if sk<>'overall' and not exists(select 1 from jsonb_array_elements(p_sources) e where e->>'skill'=sk and private.ielts_readiness_source_ok(e) and (v->'sources') ? (e->>'source_id')) then raise exception 'evidence_required';end if;
 if sk='overall' and exists(select 1 from unnest(array['listening','reading','writing','speaking']) scope where not exists(select 1 from jsonb_array_elements(p_sources) e where e->>'skill'=scope and private.ielts_readiness_source_ok(e) and (v->'sources') ? (e->>'source_id'))) then raise exception 'overall_evidence_required';end if;
 end if;
 for ref in select value from jsonb_array_elements(v->'sources') loop
 if not exists(select 1 from jsonb_array_elements(p_sources) e where e->>'source_id'=ref#>>'{}' and (sk='overall' or e->>'skill'=sk)) then raise exception 'invalid_source_reference';end if;
 end loop;
 end loop;
end; $$;
revoke all on function private.validate_ielts_readiness_fields(jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.rpc_ielts_readiness_workspace(p_school uuid default null,p_student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=coalesce(p_student,auth.uid());school uuid;staff boolean;context jsonb;latest private.ielts_readiness_decisions;
begin
 select school_id into school from public.users where id=sid;staff:=coalesce(private.ielts_report_staff(school,sid),false);
 if school is null or (p_school is not null and p_school<>school) or not (staff or (sid=auth.uid() and private.ielts_speaking_student_eligible(sid) and exists(select 1 from public.school_members where school_id=school and user_id=sid and status='active'))) then raise exception using errcode='42501',message='not_authorized';end if;
 context:=private.ielts_readiness_context(school,sid);
 select * into latest from private.ielts_readiness_decisions where school_id=school and student_id=sid order by created_at desc,id desc limit 1;
 return jsonb_build_object('can_manage',staff,'eligible',context->'eligible','source_hash',case when staff then context->>'source_hash' else null end,'evidence',case when staff then context->'evidence' else '[]'::jsonb end,'latest_id',case when staff then latest.id else null end,
 'needs_review',latest.id is not null and (latest.source_hash<>context->>'source_hash' or context->'eligible'<>'true'::jsonb),
 'estimate',case when latest.id is not null and latest.source_hash=context->>'source_hash' and context->'eligible'='true'::jsonb then jsonb_build_object('id',latest.id,'fields',latest.fields,'created_at',latest.created_at,'author',(select username from public.users where id=latest.author_id),'policy',latest.policy_version) else null end);
end; $$;
revoke all on function public.rpc_ielts_readiness_workspace(uuid,uuid) from public,anon,authenticated,service_role;grant execute on function public.rpc_ielts_readiness_workspace(uuid,uuid) to authenticated;

create function public.rpc_ielts_publish_readiness(p_school uuid,p_student uuid,p_fields jsonb,p_hash text,p_expected uuid,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare context jsonb;prev uuid;existing private.ielts_readiness_decisions;result uuid;
begin
 if not private.ielts_report_staff(p_school,p_student) then raise exception using errcode='42501',message='not_authorized';end if;
 if p_request is null then raise exception 'request_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('ielts-estimate:'||p_school::text||p_student::text,0));
 select * into existing from private.ielts_readiness_decisions where request_id=p_request;
 if found then if existing.school_id<>p_school or existing.student_id<>p_student or existing.author_id<>auth.uid() or existing.fields<>p_fields or existing.source_hash<>p_hash or existing.supersedes is distinct from p_expected then raise exception 'request_conflict';end if;return existing.id;end if;
 context:=private.ielts_readiness_context(p_school,p_student);if context->'eligible'<>'true'::jsonb then raise exception 'four_reviewed_screeners_required';end if;
 if p_hash is distinct from context->>'source_hash' then raise exception 'evidence_changed_reload';end if;
 select id into prev from private.ielts_readiness_decisions where school_id=p_school and student_id=p_student order by created_at desc,id desc limit 1;
 if prev is distinct from p_expected then raise exception 'decision_changed_reload';end if;
 perform private.validate_ielts_readiness_fields(p_fields,context->'evidence');
 insert into private.ielts_readiness_decisions(school_id,student_id,author_id,supersedes,fields,source_snapshot,source_hash,request_id) values(p_school,p_student,auth.uid(),prev,p_fields,context->'evidence',p_hash,p_request) returning id into result;return result;
end; $$;
revoke all on function public.rpc_ielts_publish_readiness(uuid,uuid,jsonb,text,uuid,uuid) from public,anon,authenticated,service_role;grant execute on function public.rpc_ielts_publish_readiness(uuid,uuid,jsonb,text,uuid,uuid) to authenticated;

-- Teacher-only discussion drafts; generation never shares or publishes a result.
create table private.ielts_readiness_ai_drafts(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null references public.users(id),reviewer_id uuid not null references public.users(id),
 source_hash text not null,context jsonb not null,model text not null,state text not null default 'working' check(state in ('working','ready','failed')),fields jsonb,provider_id text,prompt_version text not null default 'ielts-readiness-discussion-v1',created_at timestamptz not null default now(),finished_at timestamptz);
create index ielts_readiness_ai_reviewer on private.ielts_readiness_ai_drafts(reviewer_id,created_at desc);
alter table private.ielts_readiness_ai_drafts enable row level security;revoke all on private.ielts_readiness_ai_drafts from public,anon,authenticated,service_role;
create table private.ielts_readiness_ai_links(decision_id uuid primary key references private.ielts_readiness_decisions(id),draft_id uuid not null references private.ielts_readiness_ai_drafts(id));
alter table private.ielts_readiness_ai_links enable row level security;revoke all on private.ielts_readiness_ai_links from public,anon,authenticated,service_role;
create trigger ielts_readiness_ai_link_append_only before update or delete on private.ielts_readiness_ai_links for each row execute function private.academic_report_records_are_append_only();

create function public.rpc_ielts_claim_readiness_ai(p_school uuid,p_student uuid,p_model text) returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb;prior private.ielts_readiness_ai_drafts;result uuid;fingerprint text;
begin
 if not private.ielts_report_staff(p_school,p_student) then raise exception using errcode='42501',message='not_authorized';end if;
 if length(coalesce(p_model,'')) not between 1 and 100 then raise exception 'invalid_model';end if;
 context:=private.ielts_readiness_context(p_school,p_student);if context->'eligible'<>'true'::jsonb then raise exception 'four_reviewed_screeners_required';end if;fingerprint:=context->>'source_hash';
 perform pg_advisory_xact_lock(hashtextextended('ielts-readiness-ai-admission',0));
 select * into prior from private.ielts_readiness_ai_drafts where school_id=p_school and student_id=p_student and reviewer_id=auth.uid() and source_hash=fingerprint and model=p_model order by created_at desc limit 1;
 if prior.state='ready' then return jsonb_build_object('id',prior.id,'fields',prior.fields,'source_hash',fingerprint);end if;
 if prior.state='working' and prior.created_at>now()-interval '2 minutes' then raise exception 'ai_already_working';end if;
 if (select count(*) from private.ielts_readiness_ai_drafts where reviewer_id=auth.uid() and created_at>now()-interval '1 hour')>=6 or (select count(*) from private.ielts_readiness_ai_drafts where state='working' and created_at>now()-interval '2 minutes')>=8 then raise exception 'ai_rate_limit';end if;
 context:=context||jsonb_build_object('writing_samples',(select coalesce(jsonb_agg(jsonb_build_object('source_id',w.attempt_id,'text',w.response_text)),'[]') from private.ielts_writing_screener_submissions w where exists(select 1 from jsonb_array_elements(context->'evidence') e where e->>'source_id'=w.attempt_id::text and e->>'review_id' is not null)));
 if length(context::text)>60000 then raise exception 'evidence_scope_too_large_review_manually';end if;
 insert into private.ielts_readiness_ai_drafts(school_id,student_id,reviewer_id,source_hash,context,model) values(p_school,p_student,auth.uid(),fingerprint,context,p_model) returning id into result;
 return jsonb_build_object('id',result,'context',context,'source_hash',fingerprint);
end; $$;
revoke all on function public.rpc_ielts_claim_readiness_ai(uuid,uuid,text) from public,anon,authenticated,service_role;grant execute on function public.rpc_ielts_claim_readiness_ai(uuid,uuid,text) to authenticated;
create function public.rpc_ielts_finish_readiness_ai(p_id uuid,p_fields jsonb,p_provider text) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.ielts_readiness_ai_drafts set fields=p_fields,provider_id=left(p_provider,200),state=case when p_fields is null then 'failed' else 'ready' end,finished_at=now() where id=p_id and state='working';if not found then raise exception 'draft_not_working';end if;
end; $$;
revoke all on function public.rpc_ielts_finish_readiness_ai(uuid,jsonb,text) from public,anon,authenticated,service_role;grant execute on function public.rpc_ielts_finish_readiness_ai(uuid,jsonb,text) to service_role;
create function public.rpc_ielts_publish_readiness_with_draft(p_school uuid,p_student uuid,p_fields jsonb,p_hash text,p_expected uuid,p_request uuid,p_draft uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare d private.ielts_readiness_ai_drafts;result uuid;
begin
 if not private.ielts_report_staff(p_school,p_student) then raise exception using errcode='42501',message='not_authorized';end if;
 select * into d from private.ielts_readiness_ai_drafts where id=p_draft and school_id=p_school and student_id=p_student and reviewer_id=auth.uid() and state='ready' and source_hash=p_hash;
 if d.id is null then raise exception 'draft_needs_review';end if;
 result:=public.rpc_ielts_publish_readiness(p_school,p_student,p_fields,p_hash,p_expected,p_request);
 if exists(select 1 from private.ielts_readiness_ai_links where decision_id=result and draft_id<>p_draft) then raise exception 'request_conflict';end if;
 insert into private.ielts_readiness_ai_links values(result,p_draft) on conflict do nothing;return result;
end; $$;
revoke all on function public.rpc_ielts_publish_readiness_with_draft(uuid,uuid,jsonb,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;grant execute on function public.rpc_ielts_publish_readiness_with_draft(uuid,uuid,jsonb,text,uuid,uuid,uuid) to authenticated;
