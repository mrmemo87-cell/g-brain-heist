-- Bible 1.9.0: owner-confirmed content/answer review and phone/desktop acceptance.
-- Targeted materials remain teacher-assigned; public means all entitled recipients, never anonymous access.
create table private.ielts_learning_releases (
 task_code text primary key references private.ielts_learning_tasks(code),
 exact_content_hash text not null, version text not null, audio_sha256 text,
 authorized_by uuid not null references public.users(id), authorized_at timestamptz not null,
 acceptance jsonb not null
);
alter table private.ielts_learning_releases enable row level security;
revoke all on private.ielts_learning_releases from public,anon,authenticated,service_role;
create trigger ielts_learning_release_immutable before update or delete on private.ielts_learning_releases for each row execute function private.ielts_learning_immutable();

create function private.ielts_learning_publicly_released(p_task text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ielts_learning_releases r join private.ielts_learning_tasks t on t.code=r.task_code
 where t.code=p_task and t.version=r.version and t.audio_sha256 is not distinct from r.audio_sha256
 and r.exact_content_hash=private.ielts_originality_payload('targeted',t.code)->>'content_hash'
 and private.ielts_originality_label('targeted',t.code) is not null);
$$;
revoke all on function private.ielts_learning_publicly_released(text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_ielts_learning_allocate(p_school uuid, p_student uuid, p_task text, p_source uuid, p_reason text, p_due timestamp with time zone, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare task private.ielts_learning_tasks%rowtype; result uuid; existing private.ielts_learning_allocations%rowtype; valid_source boolean;
begin
 if not public.can_manage_ielts_practice_school(p_school) or not private.ielts_speaking_student_eligible(p_student) or not exists(select 1 from public.school_members where school_id=p_school and user_id=p_student and status='active') or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into task from private.ielts_learning_tasks where code=p_task;
 if task.code is null or (task.pilot_student<>p_student and not private.ielts_learning_publicly_released(task.code)) then raise exception 'pilot_scope_only'; end if;
 if task.requires_review and not private.ielts_learning_publicly_released(task.code) and not exists(select 1 from private.ielts_learning_content_reviews r where r.school_id=p_school and r.task_code=task.code and r.content_sha256=task.content_sha256) then raise exception 'content_review_required'; end if;
 if task.skill='speaking' then
 valid_source:=exists(select 1 from private.ielts_speaking_sessions s where s.id=p_source and s.student_id=p_student and s.school_id=p_school and s.status='submitted' and exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id));
 else
 valid_source:=exists(select 1 from private.ielts_diagnostic_attempt_evidence e join public.ielts_exam_attempts a on a.id=e.attempt_id join private.ielts_diagnostic_versions v on v.id=e.version_id
 where task.skill=any(v.skills) and e.attempt_id=p_source and e.student_id=p_student and e.school_id=p_school and a.status in ('submitted','auto_submitted') and (case when task.skill='writing' then exists(select 1 from private.ielts_writing_screener_reviews r where r.attempt_id=e.attempt_id) else exists(select 1 from private.ielts_diagnostic_scoring_runs s where s.attempt_id=e.attempt_id and s.server_verified) end));
 end if;
 if not valid_source then raise exception 'reviewed_source_required'; end if;
 if p_request is null or length(trim(coalesce(p_reason,''))) not between 10 and 1200 or p_due<=now() then raise exception 'assignment_details_required'; end if;
 select * into existing from private.ielts_learning_allocations where request_id=p_request;
 if existing.id is not null then
 if (existing.school_id,existing.student_id,existing.task_code,coalesce(existing.source_attempt_id,existing.source_speaking_session_id),existing.reason,existing.due_at) is distinct from (p_school,p_student,p_task,p_source,p_reason,p_due) then raise exception 'request_conflict'; end if;
 return existing.id;
 end if;
 if task.purpose='independent_check' and exists(select 1 from private.ielts_learning_allocations where student_id=p_student and task_code=p_task) then raise exception 'independent_check_already_exposed'; end if;
 insert into private.ielts_learning_allocations(school_id,student_id,task_code,source_attempt_id,source_speaking_session_id,reason,teacher_id,request_id,due_at)
 values(p_school,p_student,p_task,case when task.skill<>'speaking' then p_source end,case when task.skill='speaking' then p_source end,p_reason,auth.uid(),p_request,p_due) returning id into result;
 return result;
end; $function$;

revoke all on function public.rpc_ielts_learning_allocate(uuid,uuid,text,uuid,text,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_allocate(uuid,uuid,text,uuid,text,timestamptz,uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.rpc_ielts_learning_workspace(p_school uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare manager boolean; tasks jsonb; allocations jsonb;
begin
 manager:=p_school is not null and public.can_manage_ielts_practice_school(p_school);
 if auth.uid() is null or coalesce((select is_banned from public.users where id=auth.uid()),true) or (p_school is not null and not manager) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not manager and not private.ielts_speaking_student_eligible(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'released',private.ielts_learning_publicly_released(t.code),'pilot_student',t.pilot_student,'pilot_student_name',(select username from public.users where id=t.pilot_student),'version',t.version,'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'originality_label',private.ielts_originality_label('targeted',t.code),'skill',t.skill,'purpose',t.purpose,'success_description',t.success_description,'instructions',t.instructions,'content',t.content,'content_sha256',t.content_sha256,'requires_review',t.requires_review,
 'approved',(not t.requires_review or private.ielts_learning_publicly_released(t.code) or exists(select 1 from private.ielts_learning_content_reviews r where r.school_id=p_school and r.task_code=t.code and r.content_sha256=t.content_sha256)) and private.ielts_originality_label('targeted',t.code) is not null,
 'questions',(select jsonb_agg(q||jsonb_build_object('primary_name',n.name,'supporting_name',s.name) order by q->>'id') from jsonb_array_elements(t.questions) q join public.academic_skill_registry_nodes n on n.id=(q->>'taxonomy_node_id')::uuid join public.academic_skill_registry_nodes s on s.id=(q->>'supporting_node_id')::uuid)) order by t.skill,t.code),'[]') into tasks
 from private.ielts_learning_tasks t where manager and (private.ielts_learning_publicly_released(t.code) or exists(select 1 from public.school_members where school_id=p_school and user_id=t.pilot_student and status='active'));
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]') into allocations from (
 select a.created_at,jsonb_build_object('id',a.id,'task_code',a.task_code,'student_id',a.student_id,'assigned_at',a.created_at,'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'originality_label',private.ielts_originality_label('targeted',t.code),'skill',t.skill,'purpose',t.purpose,'status',a.status,'student_name',u.username,'reason',a.reason,'due_at',a.due_at,'reviewed',exists(select 1 from private.ielts_learning_reviews r where r.allocation_id=a.id)) item
 from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code join public.users u on u.id=a.student_id
 where ((manager and a.school_id=p_school) or (not manager and a.student_id=auth.uid())) and private.can_access_ielts_learning(a.id)
 order by a.created_at desc,a.id limit 50) x;
 return jsonb_build_object('tasks',tasks,'allocations',allocations,'manager',manager,'pilot_only',not exists(select 1 from private.ielts_learning_tasks t where private.ielts_learning_publicly_released(t.code)));
end; $function$;

revoke all on function public.rpc_ielts_learning_workspace(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_workspace(uuid) to authenticated;

-- Exact owner acceptance, not fabricated teacher reviews or originality certification.
do $release$
declare x record; actual jsonb;
begin
 if not exists(select 1 from public.users where id='1d4f3b8d-f24f-4651-ad33-85165359cf88' and role in ('admin','superadmin') and not coalesce(is_banned,false)) then raise exception 'release_owner_required';end if;
 for x in select * from (values
('bh-ielts-targeted-listening-l1-v1','89d1f2c28b338efbae0d47655271657ccb7a2df8d86f960f7a3ae7242db395b2'),
('bh-ielts-targeted-listening-l2-v1','fc6d687fb42172cf01ca4047918d2ce7598c7df0b9d57ec1558134baf6838909'),
('bh-ielts-targeted-listening-l3-v1','06b0bcd8e58ef4d5716618fcf6da8071c99be88c82e0aa43d3415b937b63bc8f'),
('bh-ielts-targeted-listening-l4-v1','c7ebd8442f85b97b038f6a5b734b7302f13813ea11f75362a491c8232861c243'),
('bh-ielts-targeted-reading-r1-v1','af1ff56322990f71a8e92d4621e789f32f124467ebe2134c36154040d4a9dbb5'),
('bh-ielts-targeted-reading-r2-v1','ad5d00453db5b610580e696d0f3cf785fff55879176c7bde41bae0b17490461e'),
('bh-ielts-targeted-speaking-s1-v1','6842cec2a6d2f8f1e0655a225b4065032640b4dcd1696fd9203b54ed428bf8c4'),
('bh-ielts-targeted-speaking-s2-v1','7ffbfda22b8fab518fa4ccc25f5dab97f9f31f04c74af49bb28775f32a0e3402'),
('bh-ielts-targeted-writing-w1-v1','9635e50f4074683ed79bac1fc0430ab4446fdfaeefcc93a52425cf7ac9446b69'),
('bh-ielts-targeted-writing-w2-v1','2f2b53244db1faaa096b80f3af1d37f9b3364db648062ead964e59a64aacc335')
 ) installed(code,hash) loop
 select private.ielts_originality_payload('targeted',x.code) into actual;
 if actual->>'content_hash' is distinct from x.hash or private.ielts_originality_label('targeted',x.code) is null then raise exception 'reviewed_release_version_changed: %',x.code;end if;
 insert into private.ielts_learning_releases(task_code,exact_content_hash,version,audio_sha256,authorized_by,authorized_at,acceptance)
 select code,x.hash,version,audio_sha256,'1d4f3b8d-f24f-4651-ad33-85165359cf88','2026-10-10T08:25:00+06',
 jsonb_build_object('bible','1.9.0','reviewer','Sobbi — Brains Heist owner','source','Explicit owner confirmation in release session 2026-10-10',
 'content_and_answers','I reviewed those eight tasks’ content and answers, and tested the new practice tasks successfully on phone and desktop',
 'earlier_listening_review','L1/L2 content and L1–L4 exact audio approvals retained in original review records',
 'delivery_acceptance','Owner-reported phone and desktop success; browser versions and individual test steps unspecified',
 'authorization','Owner requested publication of all created IELTS materials to all eligible students',
 'provenance','Original Brains Heist scripts/text and owner-authorized generated audio; no external sample material released',
 'limits','Targeted practice only. No calibrated equivalence, band, semantic originality certification or 500-user capacity claim. School, entitlement, source-evidence and repeat-exposure checks remain.')
 from private.ielts_learning_tasks where code=x.code;
 end loop;
end;$release$;

