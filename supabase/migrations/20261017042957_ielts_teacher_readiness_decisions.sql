-- A teacher range is distinct from a calibrated band and from practice scores.
create table private.ielts_readiness_decisions(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null references public.users(id),author_id uuid not null references public.users(id),
 supersedes uuid references private.ielts_readiness_decisions(id),fields jsonb not null,source_snapshot jsonb not null,source_hash text not null,request_id uuid not null unique,created_at timestamptz not null default now(),policy_version text not null default 'ielts-teacher-range-v1');
create index ielts_readiness_decisions_student on private.ielts_readiness_decisions(school_id,student_id,created_at desc,id);
create unique index ielts_readiness_decisions_replacement on private.ielts_readiness_decisions(supersedes) where supersedes is not null;
alter table private.ielts_readiness_decisions enable row level security;
revoke all on private.ielts_readiness_decisions from public,anon,authenticated,service_role;
create trigger ielts_readiness_decision_append_only before update or delete on private.ielts_readiness_decisions for each row execute function private.academic_report_records_are_append_only();

create function private.ielts_readiness_context(p_school uuid,p_student uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sources jsonb;eligible boolean:=true;sk text;
begin
 sources:=private.ielts_report_evidence(p_school,p_student,now());
 foreach sk in array array['listening','reading','writing','speaking'] loop
 if not exists(select 1 from jsonb_array_elements(sources) e where e->>'skill'=sk and e->>'kind'='screener' and
 (case when sk in ('listening','reading') then coalesce(e->>'conditions','')<>'review_required' and coalesce(e->>'test_type','') in ('academic','shared') and jsonb_array_length(e->'item_observations')>0 and not exists(select 1 from jsonb_array_elements(e->'item_observations') i where i->>'response_state' is distinct from 'answered') else e->>'review_id' is not null end)) then eligible:=false;end if;
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
 if sk<>'overall' and not exists(select 1 from jsonb_array_elements(p_sources) e where e->>'skill'=sk and e->>'kind'='screener' and (v->'sources') ? (e->>'source_id') and (sk in ('listening','reading') or e->>'review_id' is not null)) then raise exception 'evidence_required';end if;
 if sk='overall' and exists(select 1 from unnest(array['listening','reading','writing','speaking']) scope where not exists(select 1 from jsonb_array_elements(p_sources) e where e->>'skill'=scope and (v->'sources') ? (e->>'source_id'))) then raise exception 'overall_evidence_required';end if;
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
