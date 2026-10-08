-- Bible 1.5.0: extend the existing private pilot. No screener scores or history are rewritten.
alter table private.ielts_learning_tasks add column skill text not null default 'listening' check(skill in ('listening','reading','writing','speaking'));
alter table private.ielts_learning_tasks add column content jsonb not null default '{}';
alter table private.ielts_learning_tasks add column content_sha256 text check(content_sha256 ~ '^[a-f0-9]{64}$');
alter table private.ielts_learning_tasks add column requires_review boolean not null default false;
alter table private.ielts_learning_tasks alter column audio_path drop not null;
alter table private.ielts_learning_tasks alter column audio_sha256 drop not null;
alter table private.ielts_learning_tasks drop constraint ielts_learning_tasks_questions_check;
alter table private.ielts_learning_tasks add constraint ielts_learning_task_item_count check(jsonb_array_length(questions)=case when skill in ('listening','reading') then 6 else 1 end);
alter table private.ielts_learning_tasks add constraint ielts_learning_task_resource check((skill='listening' and audio_path is not null and audio_sha256 is not null) or (skill<>'listening' and content_sha256 is not null));
alter table private.ielts_learning_allocations alter column source_attempt_id drop not null;
alter table private.ielts_learning_allocations add column source_speaking_session_id uuid references private.ielts_speaking_sessions(id);
alter table private.ielts_learning_allocations add constraint ielts_learning_one_source check(num_nonnulls(source_attempt_id,source_speaking_session_id)=1);
alter table private.ielts_learning_submissions alter column score drop not null;

create table private.ielts_learning_content_reviews (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), task_code text not null references private.ielts_learning_tasks(code),
 content_sha256 text not null, reviewer_id uuid not null references public.users(id), notes text not null check(length(trim(notes)) between 10 and 1200),
 review_scope jsonb not null, reviewed_at timestamptz not null default now(), unique(school_id,task_code,content_sha256)
);
alter table private.ielts_learning_content_reviews enable row level security;
revoke all on private.ielts_learning_content_reviews from public,anon,authenticated,service_role;
create trigger ielts_learning_content_review_immutable before update or delete on private.ielts_learning_content_reviews for each row execute function private.ielts_learning_immutable();

create or replace function private.validate_ielts_learning_task() returns trigger language plpgsql security definer set search_path='' as $$
declare q jsonb; expected integer;
begin
 if not exists(select 1 from public.academic_skill_registry_versions where id=new.taxonomy_version_id and status='published') then raise exception 'reviewed_taxonomy_required'; end if;
 expected:=case when new.skill in ('listening','reading') then 6 else 1 end;
 if (select count(distinct j.value->>'id') from jsonb_array_elements(new.questions) j)<>expected then raise exception 'unique_task_items_required'; end if;
 for q in select value from jsonb_array_elements(new.questions) loop
 if length(trim(coalesce(q->>'prompt','')))=0
 or not exists(select 1 from public.academic_skill_registry_nodes where id=(q->>'taxonomy_node_id')::uuid and registry_version_id=new.taxonomy_version_id and node_type='subskill' and status='active')
 or not exists(select 1 from public.academic_skill_registry_nodes where id=(q->>'supporting_node_id')::uuid and registry_version_id=new.taxonomy_version_id and node_type='subskill' and status='active') then raise exception 'reviewed_item_mapping_required'; end if;
 if new.skill in ('listening','reading') and (q->>'id' not in ('q1','q2','q3','q4','q5','q6') or jsonb_typeof(q->'accepted_answers') is distinct from 'array' or jsonb_array_length(q->'accepted_answers')=0 or exists(select 1 from jsonb_array_elements(q->'accepted_answers') k where jsonb_typeof(k)<>'string' or length(trim(k#>>'{}'))=0)) then raise exception 'reviewed_key_required'; end if;
 if new.skill in ('writing','speaking') and q->>'id'<>'response' then raise exception 'productive_response_required'; end if;
 end loop;
 return new;
end; $$;
revoke all on function private.validate_ielts_learning_task() from public,anon,authenticated,service_role;

create function public.rpc_ielts_learning_approve_content(p_school uuid,p_task text,p_hash text,p_notes text,p_confirmed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare t private.ielts_learning_tasks%rowtype;
begin
 if auth.uid() is null or not public.can_manage_ielts_practice_school(p_school) or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into t from private.ielts_learning_tasks where code=p_task;
 if t.code is null or not t.requires_review or t.content_sha256 is distinct from p_hash or p_confirmed is distinct from true or length(trim(coalesce(p_notes,''))) not between 10 and 1200 then raise exception 'content_review_required'; end if;
 if not exists(select 1 from public.school_members where school_id=p_school and user_id=t.pilot_student and status='active') then raise exception 'pilot_scope_only'; end if;
 insert into private.ielts_learning_content_reviews(school_id,task_code,content_sha256,reviewer_id,notes,review_scope)
 values(p_school,t.code,t.content_sha256,auth.uid(),p_notes,'{"editorial":true,"key":true,"mapping":true,"difficulty_timing":true,"original_content":true,"scope":"named-student delivery pilot only; no calibration or capacity approval"}') on conflict(school_id,task_code,content_sha256) do nothing;
end; $$;
revoke all on function public.rpc_ielts_learning_approve_content(uuid,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_approve_content(uuid,text,text,text,boolean) to authenticated;

create or replace function public.rpc_ielts_learning_workspace(p_school uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare manager boolean; tasks jsonb; allocations jsonb;
begin
 manager:=p_school is not null and public.can_manage_ielts_practice_school(p_school);
 if auth.uid() is null or coalesce((select is_banned from public.users where id=auth.uid()),true) or (p_school is not null and not manager) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not manager and not private.ielts_speaking_student_eligible(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'title',t.title,'skill',t.skill,'purpose',t.purpose,'success_description',t.success_description,'instructions',t.instructions,'content',t.content,'content_sha256',t.content_sha256,'requires_review',t.requires_review,
 'approved',not t.requires_review or exists(select 1 from private.ielts_learning_content_reviews r where r.school_id=p_school and r.task_code=t.code and r.content_sha256=t.content_sha256),
 'questions',(select jsonb_agg(q||jsonb_build_object('primary_name',n.name,'supporting_name',s.name) order by q->>'id') from jsonb_array_elements(t.questions) q join public.academic_skill_registry_nodes n on n.id=(q->>'taxonomy_node_id')::uuid join public.academic_skill_registry_nodes s on s.id=(q->>'supporting_node_id')::uuid)) order by t.skill,t.code),'[]') into tasks
 from private.ielts_learning_tasks t where manager and exists(select 1 from public.school_members where school_id=p_school and user_id=t.pilot_student and status='active');
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]') into allocations from (
 select a.created_at,jsonb_build_object('id',a.id,'title',t.title,'skill',t.skill,'purpose',t.purpose,'status',a.status,'student_name',u.username,'reason',a.reason,'due_at',a.due_at,'reviewed',exists(select 1 from private.ielts_learning_reviews r where r.allocation_id=a.id)) item
 from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code join public.users u on u.id=a.student_id
 where ((manager and a.school_id=p_school) or (not manager and a.student_id=auth.uid())) and private.can_access_ielts_learning(a.id)
 order by a.created_at desc,a.id limit 50) x;
 return jsonb_build_object('tasks',tasks,'allocations',allocations,'manager',manager,'pilot_only',true);
end; $$;
revoke all on function public.rpc_ielts_learning_workspace(uuid) from public,anon;

create or replace function public.rpc_ielts_learning_allocate(p_school uuid,p_student uuid,p_task text,p_source uuid,p_reason text,p_due timestamptz,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare task private.ielts_learning_tasks%rowtype; result uuid; existing private.ielts_learning_allocations%rowtype; valid_source boolean;
begin
 if not public.can_manage_ielts_practice_school(p_school) or not private.ielts_speaking_student_eligible(p_student) or not exists(select 1 from public.school_members where school_id=p_school and user_id=p_student and status='active') or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into task from private.ielts_learning_tasks where code=p_task;
 if task.code is null or task.pilot_student<>p_student then raise exception 'pilot_scope_only'; end if;
 if task.requires_review and not exists(select 1 from private.ielts_learning_content_reviews r where r.school_id=p_school and r.task_code=task.code and r.content_sha256=task.content_sha256) then raise exception 'content_review_required'; end if;
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
end; $$;
revoke all on function public.rpc_ielts_learning_allocate(uuid,uuid,text,uuid,text,timestamptz,uuid) from public,anon;

create table private.ielts_learning_recordings (
 id uuid primary key, allocation_id uuid not null references private.ielts_learning_allocations(id), owner_id uuid not null references public.users(id), path text not null unique,
 state text not null default 'capturing' check(state in ('capturing','verified','abandoned')), sha256 text check(sha256 ~ '^[a-f0-9]{64}$'), duration_seconds numeric check(duration_seconds>0 and duration_seconds<=360),
 consent boolean not null default true check(consent), consent_at timestamptz not null default now(), interrupted boolean not null default false, created_at timestamptz not null default now(), verified_at timestamptz,
 check((state='verified' and sha256 is not null and duration_seconds is not null and verified_at is not null) or state<>'verified')
);
alter table private.ielts_learning_recordings enable row level security;
revoke all on private.ielts_learning_recordings from public,anon,authenticated,service_role;
create index ielts_learning_recording_allocation on private.ielts_learning_recordings(allocation_id,created_at,id);
create unique index ielts_learning_one_capture on private.ielts_learning_recordings(allocation_id) where state='capturing';
create function private.ielts_learning_recording_immutable() returns trigger language plpgsql set search_path='' as $$
begin if old.state='verified' or tg_op='DELETE' then raise exception 'recording_history_is_immutable'; end if; return new; end; $$;
revoke all on function private.ielts_learning_recording_immutable() from public,anon,authenticated,service_role;
create trigger ielts_learning_recording_immutable before update or delete on private.ielts_learning_recordings for each row execute function private.ielts_learning_recording_immutable();

create function public.rpc_ielts_learning_begin_recording(p_id uuid,p_clip uuid,p_consent boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype; r private.ielts_learning_recordings%rowtype;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id for update;
 if a.student_id<>auth.uid() or a.status not in ('assigned','in_progress') or p_consent is distinct from true or p_clip is null or not exists(select 1 from private.ielts_learning_tasks where code=a.task_code and skill='speaking') then raise exception 'recording_not_active'; end if;
 select * into r from private.ielts_learning_recordings where id=p_clip;
 if r.id is not null then if r.allocation_id<>p_id or r.owner_id<>auth.uid() or r.state<>'capturing' then raise exception 'recording_request_conflict'; end if; return jsonb_build_object('path',r.path); end if;
 if (select count(*) from private.ielts_learning_recordings where allocation_id=p_id)>=12 then raise exception 'recording_limit'; end if;
 insert into private.ielts_learning_recordings(id,allocation_id,owner_id,path) values(p_clip,p_id,auth.uid(),auth.uid()::text||'/'||p_id::text||'/'||p_clip::text||'.wav') returning * into r;
 update private.ielts_learning_allocations set status='in_progress',started_at=coalesce(started_at,now()),updated_at=now() where id=p_id;
 return jsonb_build_object('path',r.path);
end; $$;
revoke all on function public.rpc_ielts_learning_begin_recording(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_begin_recording(uuid,uuid,boolean) to authenticated;

create function public.rpc_ielts_learning_recording_context(p_id uuid,p_clip uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.ielts_learning_recordings%rowtype;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into r from private.ielts_learning_recordings where id=p_clip and allocation_id=p_id and owner_id=auth.uid() and state in ('capturing','verified');
 if r.id is null then raise exception 'recording_not_active'; end if;
 return jsonb_build_object('path',r.path,'owner_id',r.owner_id,'state',r.state);
end; $$;
revoke all on function public.rpc_ielts_learning_recording_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_recording_context(uuid,uuid) to authenticated;

create function public.service_ielts_learning_verify_recording(p_id uuid,p_clip uuid,p_actor uuid,p_hash text,p_duration numeric,p_interrupted boolean) returns void language plpgsql security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype; r private.ielts_learning_recordings%rowtype;
begin
 select * into a from private.ielts_learning_allocations where id=p_id for update;
 select * into r from private.ielts_learning_recordings where id=p_clip and allocation_id=p_id for update;
 if a.id is null or r.id is null or a.student_id<>p_actor or r.owner_id<>p_actor or coalesce((select is_banned from public.users where id=p_actor),true) or not private.ielts_speaking_student_eligible(p_actor) or not exists(select 1 from public.school_members where school_id=a.school_id and user_id=p_actor and status='active') then raise exception 'not_authorized'; end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_duration is null or p_duration<=0 or p_duration>360 or p_interrupted is null then raise exception 'invalid_recording'; end if;
 if r.state='verified' then if r.sha256<>p_hash or r.duration_seconds<>p_duration then raise exception 'recording_conflict'; end if; return; end if;
 if a.status not in ('assigned','in_progress') or r.state<>'capturing' then raise exception 'recording_not_active'; end if;
 update private.ielts_learning_recordings set state='verified',sha256=p_hash,duration_seconds=p_duration,interrupted=p_interrupted,verified_at=now() where id=p_clip;
end; $$;
revoke all on function public.service_ielts_learning_verify_recording(uuid,uuid,uuid,text,numeric,boolean) from public,anon,authenticated,service_role;
grant execute on function public.service_ielts_learning_verify_recording(uuid,uuid,uuid,text,numeric,boolean) to service_role;

create function public.rpc_ielts_learning_abandon_recording(p_id uuid,p_clip uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 perform 1 from private.ielts_learning_allocations where id=p_id and student_id=auth.uid() and status in ('assigned','in_progress') for update;
 if not found then raise exception 'recording_not_active'; end if;
 update private.ielts_learning_recordings set state='abandoned',interrupted=true where allocation_id=p_id and id=p_clip and owner_id=auth.uid() and state='capturing';
end; $$;
revoke all on function public.rpc_ielts_learning_abandon_recording(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_abandon_recording(uuid,uuid) to authenticated;

create or replace function public.rpc_ielts_learning_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype; t private.ielts_learning_tasks%rowtype; s private.ielts_learning_submissions%rowtype; review jsonb; content jsonb;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id; select * into t from private.ielts_learning_tasks where code=a.task_code; select * into s from private.ielts_learning_submissions where allocation_id=p_id;
 select jsonb_build_object('fields',r.feedback,'reviewer',u.username,'reviewed_at',r.reviewed_at) into review from private.ielts_learning_reviews r join public.users u on u.id=r.reviewer_id where r.allocation_id=p_id order by r.reviewed_at desc,r.id desc limit 1;
 content:=t.content-'teacher_notes'-'mapping_scope'-'focus_code';
 if s.allocation_id is not null or public.can_manage_ielts_practice_school(a.school_id) then content:=content||jsonb_build_object('teacher_notes',t.content->>'teacher_notes'); end if;
 return jsonb_build_object('id',a.id,'student_id',a.student_id,'manager',public.can_manage_ielts_practice_school(a.school_id),'title',t.title,'skill',t.skill,'purpose',t.purpose,'content',content,'instructions',t.instructions,'success_description',t.success_description,'reason',a.reason,'due_at',a.due_at,
 'questions',(select jsonb_agg(q-'accepted_answers'-'taxonomy_node_id'-'supporting_node_id' order by q->>'id') from jsonb_array_elements(t.questions) q), 'audio_bucket','ielts-targeted-listening','audio_path',t.audio_path,'audio_sha256',t.audio_sha256,
 'status',a.status,'answers',case when s.allocation_id is null then a.answers else s.response end,'revision',a.revision,'source_attempt_id',coalesce(a.source_attempt_id,a.source_speaking_session_id),
 'source_route',case when t.skill='speaking' then '/ielts/speaking-pilot/'||a.source_speaking_session_id::text when t.skill='writing' then '/ielts/writing-screener' else '/ielts/screener-result/'||a.source_attempt_id::text end,
 'play_count',(select count(*) from private.ielts_learning_incidents where allocation_id=p_id and kind='play'),
 'pending_recordings',coalesce((select jsonb_agg(r.id) from private.ielts_learning_recordings r where r.allocation_id=p_id and r.state='capturing'),'[]'),
 'recordings',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'path',r.path,'duration_seconds',r.duration_seconds,'interrupted',r.interrupted,'sha256',r.sha256) order by r.created_at,r.id) from private.ielts_learning_recordings r where r.allocation_id=p_id and r.state='verified'),'[]'),
 'conditions_need_review',length(trim(coalesce(a.answers->>'assistance','')))>0 or exists(select 1 from private.ielts_learning_incidents where allocation_id=p_id and kind in ('interruption','replay','audio_failure','assistance')) or (select count(*) from private.ielts_learning_incidents where allocation_id=p_id and kind='play')>1 or exists(select 1 from private.ielts_learning_recordings where allocation_id=p_id and interrupted),
 'result',case when s.allocation_id is null then null else jsonb_build_object('score',s.score,'total',case when t.skill in ('listening','reading') then 6 else null end,'outcomes',s.outcomes,'submitted_at',s.submitted_at,'word_count',case when t.skill='writing' then cardinality(regexp_split_to_array(trim(coalesce(s.response->>'response','')),'\s+')) end) end,'review',review);
end; $$;
revoke all on function public.rpc_ielts_learning_detail(uuid) from public,anon;

create or replace function public.rpc_ielts_learning_save(p_id uuid,p_revision integer,p_answers jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype; skill text; k text; v jsonb;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id for update;
 if a.student_id<>auth.uid() or a.status not in ('assigned','in_progress') then raise exception 'task_not_active'; end if;
 select t.skill into skill from private.ielts_learning_tasks t where code=a.task_code;
 if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'invalid_answers'; end if;
 for k,v in select * from jsonb_each(p_answers) loop
 if jsonb_typeof(v)<>'string' then raise exception 'invalid_answers'; end if;
 if k='assistance' then if length(v#>>'{}')>1200 then raise exception 'invalid_answers'; end if;
 elsif skill='listening' then if k not in ('q1','q2','q3','q4','q5','q6') or length(v#>>'{}')>120 then raise exception 'invalid_answers'; end if;
 elsif skill='reading' then if not ((k in ('q1','q2','q3','q4','q5','q6') and (v#>>'{}') in ('','TRUE','FALSE','NOT GIVEN')) or (k in ('e1','e2','e3','e4','e5','e6') and length(v#>>'{}')<=1000)) then raise exception 'invalid_answers'; end if;
 elsif k<>'response' or length(v#>>'{}')>12000 then raise exception 'invalid_answers'; end if;
 end loop;
 if a.answers=p_answers then return a.revision; end if;
 if a.revision is distinct from p_revision then raise exception 'draft_changed_in_another_tab'; end if;
 update private.ielts_learning_allocations set answers=p_answers,revision=revision+1,status='in_progress',started_at=coalesce(started_at,now()),updated_at=now() where id=p_id returning revision into p_revision;
 return p_revision;
end; $$;
revoke all on function public.rpc_ielts_learning_save(uuid,integer,jsonb) from public,anon;

create or replace function public.rpc_ielts_learning_submit(p_id uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype; t private.ielts_learning_tasks%rowtype; q jsonb; response text; correct boolean; score integer:=0; outcomes jsonb:='[]'; snapshot jsonb;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id for update;
 if a.student_id<>auth.uid() then raise exception using errcode='42501',message='not_authorized'; end if;
 if a.status='submitted' then return public.rpc_ielts_learning_detail(p_id); end if;
 if a.status not in ('assigned','in_progress') or a.revision<>p_revision then raise exception 'task_not_active_or_draft_changed'; end if;
 select * into t from private.ielts_learning_tasks where code=a.task_code;
 snapshot:=to_jsonb(t)||jsonb_build_object('content_review',(select to_jsonb(r) from private.ielts_learning_content_reviews r where r.school_id=a.school_id and r.task_code=t.code and r.content_sha256=t.content_sha256),'recordings',(select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from private.ielts_learning_recordings r where r.allocation_id=p_id));
 if t.skill='speaking' and (not exists(select 1 from private.ielts_learning_recordings where allocation_id=p_id and state='verified') or exists(select 1 from private.ielts_learning_recordings where allocation_id=p_id and state='capturing')) then raise exception 'save_recording_before_submission'; end if;
 if t.skill='writing' and length(trim(coalesce(a.answers->>'response','')))=0 then raise exception 'response_required'; end if;
 if t.skill in ('writing','speaking') then score:=null;outcomes:=jsonb_build_array(jsonb_build_object('id','response','response_state','answered','review_pending',true));
 else
 for q in select value from jsonb_array_elements(t.questions) loop
 response:=lower(trim(regexp_replace(coalesce(a.answers->>(q->>'id'),''),'\s+',' ','g')));
 select response<>'' and exists(select 1 from jsonb_array_elements_text(q->'accepted_answers') answer where lower(answer)=response) and (t.skill='reading' or cardinality(regexp_split_to_array(response,'\s+'))<=2) into correct;
 score:=score+case when correct then 1 else 0 end;
 outcomes:=outcomes||jsonb_build_array(jsonb_build_object('id',q->>'id','correct',correct,'response_state',case when response='' then 'unanswered' else 'answered' end,'accepted_answers',q->'accepted_answers','taxonomy_node_id',q->'taxonomy_node_id','supporting_node_id',q->'supporting_node_id'));
 end loop;
 end if;
 insert into private.ielts_learning_submissions(allocation_id,response,task_snapshot,outcomes,score,scoring_policy) values(p_id,a.answers,snapshot,outcomes,score,'ielts-targeted-'||t.skill||'-v1');
 update private.ielts_learning_allocations set status='submitted',submitted_at=now(),updated_at=now() where id=p_id;
 return public.rpc_ielts_learning_detail(p_id);
end; $$;
revoke all on function public.rpc_ielts_learning_submit(uuid,integer) from public,anon;

create or replace function public.rpc_ielts_learning_review(p_id uuid,p_feedback jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare field text; r private.ielts_learning_reviews%rowtype; skill text; keys text[];
begin
 if not private.can_access_ielts_learning(p_id,true) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not exists(select 1 from private.ielts_learning_submissions where allocation_id=p_id) then raise exception 'submission_required'; end if;
 select t.skill into skill from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code where a.id=p_id;
 if jsonb_typeof(p_feedback) is distinct from 'object' or p_request is null then raise exception 'feedback_required'; end if;
 foreach field in array array['went_well','work_on','practice','check_again'] loop
 if jsonb_typeof(p_feedback->field) is distinct from 'string' or length(trim(p_feedback->>field)) not between 5 and 1200 then raise exception 'complete_feedback_required'; end if;
 end loop;
 if skill in ('writing','speaking') then
 keys:=case when skill='writing' then array['task_response','coherence_cohesion','lexical_resource','grammar_range_accuracy'] else array['fluency_coherence','lexical_resource','grammar_range_accuracy','pronunciation'] end;
 if jsonb_typeof(p_feedback->'criteria') is distinct from 'object' then raise exception 'criterion_feedback_required'; end if;
 foreach field in array keys loop if jsonb_typeof(p_feedback->'criteria'->field) is distinct from 'string' or length(trim(p_feedback->'criteria'->>field)) not between 5 and 900 then raise exception 'criterion_feedback_required'; end if; end loop;
 if exists(select 1 from jsonb_object_keys(p_feedback->'criteria') k where not(k=any(keys))) then raise exception 'invalid_feedback'; end if;
 if skill='speaking' and (p_feedback->'audio_checked' is distinct from 'true'::jsonb or not exists(select 1 from private.ielts_learning_recordings where allocation_id=p_id and state='verified')) then raise exception 'listen_to_audio_before_review'; end if;
 end if;
 if exists(select 1 from jsonb_object_keys(p_feedback) k where k not in ('went_well','work_on','practice','check_again','criteria','audio_checked')) then raise exception 'invalid_feedback'; end if;
 select * into r from private.ielts_learning_reviews where request_id=p_request;
 if r.id is not null then if r.allocation_id<>p_id or r.reviewer_id<>auth.uid() or r.feedback<>p_feedback then raise exception 'request_conflict'; end if;
 else insert into private.ielts_learning_reviews(allocation_id,reviewer_id,request_id,feedback) values(p_id,auth.uid(),p_request,p_feedback); end if;
 return public.rpc_ielts_learning_detail(p_id);
end; $$;
revoke all on function public.rpc_ielts_learning_review(uuid,jsonb,uuid) from public,anon;

create function private.can_access_ielts_learning_recording_path(p_path text,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ielts_learning_recordings r join private.ielts_learning_allocations a on a.id=r.allocation_id where r.path=p_path and private.can_access_ielts_learning(a.id) and ((not p_write and r.state='verified') or (p_write and r.owner_id=auth.uid() and r.state='capturing' and a.status in ('assigned','in_progress'))));
$$;
revoke all on function private.can_access_ielts_learning_recording_path(text,boolean) from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.can_access_ielts_learning_recording_path(text,boolean) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ielts-learning-recordings','ielts-learning-recordings',false,12000000,array['audio/wav']);
create policy ielts_learning_recording_read on storage.objects for select to authenticated using(bucket_id='ielts-learning-recordings' and private.can_access_ielts_learning_recording_path(name));
create policy ielts_learning_recording_read_boundary on storage.objects as restrictive for select to authenticated using(bucket_id<>'ielts-learning-recordings' or private.can_access_ielts_learning_recording_path(name));
create policy ielts_learning_recording_anon_boundary on storage.objects as restrictive for all to anon using(bucket_id<>'ielts-learning-recordings') with check(bucket_id<>'ielts-learning-recordings');
create policy ielts_learning_recording_upload on storage.objects for insert to authenticated with check(bucket_id='ielts-learning-recordings' and private.can_access_ielts_learning_recording_path(name,true));
create policy ielts_learning_recording_upload_boundary on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'ielts-learning-recordings' or private.can_access_ielts_learning_recording_path(name,true));
create policy ielts_learning_recording_no_replace on storage.objects as restrictive for update to authenticated using(bucket_id<>'ielts-learning-recordings') with check(bucket_id<>'ielts-learning-recordings');
create policy ielts_learning_recording_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'ielts-learning-recordings');

insert into private.ielts_learning_tasks(code,version,title,skill,purpose,instructions,success_description,taxonomy_version_id,pilot_student,questions,content,review_record,content_sha256,requires_review) values('bh-ielts-targeted-reading-r1-v1','0.1.0','A statement is not always a match','reading','guided_practice','Read the passage. Choose TRUE, FALSE or NOT GIVEN for each statement. Explain each answer using a short quote or the information that is missing. Explanations are reviewed by your teacher, separately from the six answer marks.','Support each decision with the relevant words, or explain exactly what the passage does not tell you.','ad250533-8582-4bc5-986b-32b0c9640a16','b30e9c28-96f1-4d34-83e9-9b28b4926f42','[{"id": "q1", "prompt": "Students could reserve a place using the internet.", "accepted_answers": ["TRUE"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q2", "prompt": "A booking had to last exactly ninety minutes.", "accepted_answers": ["FALSE"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q3", "prompt": "The pilot introduced longer weekend opening hours.", "accepted_answers": ["FALSE"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q4", "prompt": "Printers were moved because they disturbed students.", "accepted_answers": ["TRUE"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q5", "prompt": "Every student who used the room completed the survey.", "accepted_answers": ["NOT GIVEN"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q6", "prompt": "Students preferred the quiet room to studying at home.", "accepted_answers": ["NOT GIVEN"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}]'::jsonb,'{"scope": "Targeted IELTS preparation exercise; not a full paper, essay assessment or Speaking interview.", "suggested_minutes": 12, "mapping_scope": "Task-specific reviewed focus with canonical English registry references. Not an IELTS/English equivalence or a pooled Academic Profile claim.", "focus_code": "bh-ielts-reading-targeted-focus-v1", "passage": "A university library piloted a quiet study room for six weeks. Students booked a place online, and each booking lasted up to ninety minutes. During the pilot, the room opened at 8 a.m. on weekdays; weekend opening hours stayed unchanged. Staff moved the printers into the corridor after students complained about noise. In the final week, most survey respondents said the room helped them concentrate. However, only thirty-two students returned the survey, so the library decided to collect more feedback before extending the scheme.", "teacher_notes": "1 TRUE — “booked a place online”.\n2 FALSE — “up to” permits shorter bookings.\n3 FALSE — weekend hours “stayed unchanged”.\n4 TRUE — moved after noise complaints.\n5 NOT GIVEN — thirty-two responses; total users and their identities are unspecified.\n6 NOT GIVEN — no home-study comparison.\nDiscuss 2/3 as qualifiers and 5/6 as missing information. Do not teach “not exactly the same words means false”.", "focus": "Decide whether a statement agrees with the passage, contradicts it, or cannot be established; identify the supporting evidence or missing fact."}'::jsonb,'{"author": "Brains Heist AI-assisted original", "rights": "Original Brains Heist text; no third-party passages or questions copied. Teacher must confirm suitability and provenance before pilot assignment.", "bible": "1.5.0", "human_review": "pending", "difficulty_comparability": "Not calibrated equivalent forms; no bands or automatic improvement conclusions.", "source": "STARTER_PACK_01_REVIEW_DRAFT.md 0.1.0"}'::jsonb,'15d777e9f5d04646988a7c5ef884bd7dfe17cd27624cc44d18b1734e67cfb9ec',true);
insert into private.ielts_learning_tasks(code,version,title,skill,purpose,instructions,success_description,taxonomy_version_id,pilot_student,questions,content,review_record,content_sha256,requires_review) values('bh-ielts-targeted-reading-r2-v1','0.1.0','Evidence before assumption','reading','independent_check','Read the passage. Choose TRUE, FALSE or NOT GIVEN for each statement. Explain each answer using a short quote or the information that is missing. Explanations are reviewed by your teacher, separately from the six answer marks.','Support each decision with the relevant words, or explain exactly what the passage does not tell you.','ad250533-8582-4bc5-986b-32b0c9640a16','b30e9c28-96f1-4d34-83e9-9b28b4926f42','[{"id": "q1", "prompt": "A safety session was required before adults borrowed tools.", "accepted_answers": ["TRUE"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q2", "prompt": "Members paid a fee that was never returned.", "accepted_answers": ["FALSE"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q3", "prompt": "Borrowers could keep tools for two weeks.", "accepted_answers": ["FALSE"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q4", "prompt": "Drills were the most requested item in April.", "accepted_answers": ["TRUE"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q5", "prompt": "The cleaning checklist began when the service opened.", "accepted_answers": ["FALSE"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}, {"id": "q6", "prompt": "The centre will definitely purchase more equipment in September.", "accepted_answers": ["NOT GIVEN"], "taxonomy_node_id": "bcddba69-28bc-436c-bb54-01a3c5733099", "supporting_node_id": "be5b2be3-ffb1-4cfb-95c8-cb9e3e9101de"}]'::jsonb,'{"scope": "Targeted IELTS preparation exercise; not a full paper, essay assessment or Speaking interview.", "suggested_minutes": 8, "mapping_scope": "Task-specific reviewed focus with canonical English registry references. Not an IELTS/English equivalence or a pooled Academic Profile claim.", "focus_code": "bh-ielts-reading-targeted-focus-v1", "passage": "A community centre introduced an equipment-lending service in March. Adults could borrow gardening tools after attending a short safety session. Members paid no borrowing fee, but left a refundable deposit. Tools had to be returned within seven days. During April, the centre received more requests for drills than for any other item. Because several tools came back dirty, staff introduced a cleaning checklist in May. The centre plans to review the service in September before deciding whether to buy more equipment.", "teacher_notes": "1 TRUE — “after attending” establishes prerequisite.\n2 FALSE — no borrowing fee; deposit refundable.\n3 FALSE — seven-day limit.\n4 TRUE — more requests than any other item.\n5 FALSE — March opening, May checklist.\n6 NOT GIVEN — decision pending; future purchase is not established.\nRecord answer and explanation separately. Review errors by construct; one total cannot establish every target. This passage is a different context with different demands, not calibrated equivalent to R1.", "focus": "Decide whether a statement agrees with the passage, contradicts it, or cannot be established; identify the supporting evidence or missing fact."}'::jsonb,'{"author": "Brains Heist AI-assisted original", "rights": "Original Brains Heist text; no third-party passages or questions copied. Teacher must confirm suitability and provenance before pilot assignment.", "bible": "1.5.0", "human_review": "pending", "difficulty_comparability": "Not calibrated equivalent forms; no bands or automatic improvement conclusions.", "source": "STARTER_PACK_01_REVIEW_DRAFT.md 0.1.0"}'::jsonb,'1fd26116baacd7ef3349a11c1780aec9b8f796b10c8f503699f484315daf251c',true);
insert into private.ielts_learning_tasks(code,version,title,skill,purpose,instructions,success_description,taxonomy_version_id,pilot_student,questions,content,review_record,content_sha256,requires_review) values('bh-ielts-targeted-writing-w1-v1','0.1.0','Make an example do useful work','writing','guided_practice','Write one developed paragraph. Aim for 80–120 words; this is guidance, not a submission minimum. Include a clear point, an explanation, a specific plausible example and a link back to your point. Do not invent research statistics.','Make the example specific and explain how it supports the paragraph’s main point.','ad250533-8582-4bc5-986b-32b0c9640a16','b30e9c28-96f1-4d34-83e9-9b28b4926f42','[{"id": "response", "prompt": "Your paragraph", "taxonomy_node_id": "ccaa0aaa-c3c0-47bf-b6cc-8aedbaed12b4", "supporting_node_id": "83fc3944-2f92-4cca-9a38-ac81f032627f"}]'::jsonb,'{"scope": "Targeted IELTS preparation exercise; not a full paper, essay assessment or Speaking interview.", "suggested_minutes": 15, "mapping_scope": "Task-specific reviewed focus with canonical English registry references. Not an IELTS/English equivalence or a pooled Academic Profile claim.", "focus_code": "bh-ielts-writing-targeted-focus-v1", "prompt": "Some people think schools should teach practical life skills alongside academic subjects. Develop one paragraph supporting that position.", "focus": "Develop a clear point using explanation and a relevant example; explain the link between the example and the point.", "teacher_notes": "Review the paragraph within its limited task scope. Preserve actual excerpts and contrary evidence. A short paragraph cannot support a full Writing band. Do not invent a minimum-length penalty.", "scaffold": "A useful life skill is… This matters because… For example… This shows…"}'::jsonb,'{"author": "Brains Heist AI-assisted original", "rights": "Original Brains Heist text; no third-party passages or questions copied. Teacher must confirm suitability and provenance before pilot assignment.", "bible": "1.5.0", "human_review": "pending", "difficulty_comparability": "Not calibrated equivalent forms; no bands or automatic improvement conclusions.", "source": "STARTER_PACK_01_REVIEW_DRAFT.md 0.1.0"}'::jsonb,'52b5be2b5426272670ed2f8f41cfd486a77099f009662d805a2302a8e17698f0',true);
insert into private.ielts_learning_tasks(code,version,title,skill,purpose,instructions,success_description,taxonomy_version_id,pilot_student,questions,content,review_record,content_sha256,requires_review) values('bh-ielts-targeted-writing-w2-v1','0.1.0','Develop a new argument','writing','independent_check','Write one developed paragraph. Aim for 80–120 words; this is guidance, not a submission minimum. Include a clear point, an explanation, a specific plausible example and a link back to your point. Do not invent research statistics. Work without sentence starters, model answers or live correction. Tell your teacher about any help you used.','Make the example specific and explain how it supports the paragraph’s main point.','ad250533-8582-4bc5-986b-32b0c9640a16','b30e9c28-96f1-4d34-83e9-9b28b4926f42','[{"id": "response", "prompt": "Your paragraph", "taxonomy_node_id": "ccaa0aaa-c3c0-47bf-b6cc-8aedbaed12b4", "supporting_node_id": "83fc3944-2f92-4cca-9a38-ac81f032627f"}]'::jsonb,'{"scope": "Targeted IELTS preparation exercise; not a full paper, essay assessment or Speaking interview.", "suggested_minutes": 15, "mapping_scope": "Task-specific reviewed focus with canonical English registry references. Not an IELTS/English equivalence or a pooled Academic Profile claim.", "focus_code": "bh-ielts-writing-targeted-focus-v1", "prompt": "Some people think students benefit from volunteering in their local community. Write one developed paragraph supporting or challenging this view.", "focus": "Develop a clear point using explanation and a relevant example; explain the link between the example and the point.", "teacher_notes": "Review the paragraph within its limited task scope. Preserve actual excerpts and contrary evidence. A short paragraph cannot support a full Writing band. Do not invent a minimum-length penalty."}'::jsonb,'{"author": "Brains Heist AI-assisted original", "rights": "Original Brains Heist text; no third-party passages or questions copied. Teacher must confirm suitability and provenance before pilot assignment.", "bible": "1.5.0", "human_review": "pending", "difficulty_comparability": "Not calibrated equivalent forms; no bands or automatic improvement conclusions.", "source": "STARTER_PACK_01_REVIEW_DRAFT.md 0.1.0"}'::jsonb,'1cbbf05b20cf132dbc18c3f0924cf3a08f9167879f39ad3c88dc7960d5b556d2',true);
insert into private.ielts_learning_tasks(code,version,title,skill,purpose,instructions,success_description,taxonomy_version_id,pilot_student,questions,content,review_record,content_sha256,requires_review) values('bh-ielts-targeted-speaking-s1-v1','0.1.0','Explain beyond the first answer','speaking','guided_practice','Prepare short notes, then record approximately 45–90 seconds of speech. Explain your reason and add a relevant detail. The length is a practice guide, not a minimum ability threshold. Keep this tab open and save your recording before submitting.','Go beyond naming the topic: explain a reason, illustrate it with a relevant detail and connect your ideas clearly.','ad250533-8582-4bc5-986b-32b0c9640a16','b30e9c28-96f1-4d34-83e9-9b28b4926f42','[{"id": "response", "prompt": "Preparation notes (optional)", "taxonomy_node_id": "413181a5-95eb-4d96-82e0-c47c78e8de2a", "supporting_node_id": "1cea5568-701e-40ed-8459-61fd5df5263d"}]'::jsonb,'{"scope": "Targeted IELTS preparation exercise; not a full paper, essay assessment or Speaking interview.", "suggested_minutes": 10, "mapping_scope": "Task-specific reviewed focus with canonical English registry references. Not an IELTS/English equivalence or a pooled Academic Profile claim.", "focus_code": "bh-ielts-speaking-targeted-focus-v1", "prompt": "Describe a place where you enjoy studying. Explain what it is like and why it helps you.", "focus": "Develop and justify a response, connect ideas and sustain a relevant spoken turn.", "teacher_notes": "Listen to the actual recording. Review development, relevant detail and organisation; note genuine timestamps where useful. Pronunciation observations require audio. Duration alone is not ability, and this short turn is not a complete Speaking interview.", "scaffold": "What makes it suitable? Can you give an example? Has your preference changed?"}'::jsonb,'{"author": "Brains Heist AI-assisted original", "rights": "Original Brains Heist text; no third-party passages or questions copied. Teacher must confirm suitability and provenance before pilot assignment.", "bible": "1.5.0", "human_review": "pending", "difficulty_comparability": "Not calibrated equivalent forms; no bands or automatic improvement conclusions.", "source": "STARTER_PACK_01_REVIEW_DRAFT.md 0.1.0"}'::jsonb,'903b51f800bf7b71715d332a7d03744f6522e65de9668fc303d1dac4015a17a1',true);
insert into private.ielts_learning_tasks(code,version,title,skill,purpose,instructions,success_description,taxonomy_version_id,pilot_student,questions,content,review_record,content_sha256,requires_review) values('bh-ielts-targeted-speaking-s2-v1','0.1.0','Explain a choice','speaking','independent_check','Prepare short notes, then record approximately 45–90 seconds of speech. Explain your reason and add a relevant detail. The length is a practice guide, not a minimum ability threshold. Keep this tab open and save your recording before submitting. Allow yourself one minute to prepare. Speak without coaching, and record any help or interruption.','Go beyond naming the topic: explain a reason, illustrate it with a relevant detail and connect your ideas clearly.','ad250533-8582-4bc5-986b-32b0c9640a16','b30e9c28-96f1-4d34-83e9-9b28b4926f42','[{"id": "response", "prompt": "Preparation notes (optional)", "taxonomy_node_id": "413181a5-95eb-4d96-82e0-c47c78e8de2a", "supporting_node_id": "1cea5568-701e-40ed-8459-61fd5df5263d"}]'::jsonb,'{"scope": "Targeted IELTS preparation exercise; not a full paper, essay assessment or Speaking interview.", "suggested_minutes": 5, "mapping_scope": "Task-specific reviewed focus with canonical English registry references. Not an IELTS/English equivalence or a pooled Academic Profile claim.", "focus_code": "bh-ielts-speaking-targeted-focus-v1", "prompt": "Describe an activity you would like to learn. Explain why it interests you and how you would start learning it.", "focus": "Develop and justify a response, connect ideas and sustain a relevant spoken turn.", "teacher_notes": "Listen to the actual recording. Review development, relevant detail and organisation; note genuine timestamps where useful. Pronunciation observations require audio. Duration alone is not ability, and this short turn is not a complete Speaking interview."}'::jsonb,'{"author": "Brains Heist AI-assisted original", "rights": "Original Brains Heist text; no third-party passages or questions copied. Teacher must confirm suitability and provenance before pilot assignment.", "bible": "1.5.0", "human_review": "pending", "difficulty_comparability": "Not calibrated equivalent forms; no bands or automatic improvement conclusions.", "source": "STARTER_PACK_01_REVIEW_DRAFT.md 0.1.0"}'::jsonb,'1cf4cbafd050cde68e4e3648162d0873743198f9c2192fc22609a435505997ab',true);
