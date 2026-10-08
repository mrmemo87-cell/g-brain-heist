-- Bible 1.5.0. Separate targeted practice; never converted to screener/band evidence.
create table private.ielts_learning_tasks (
 code text primary key, version text not null, title text not null,
 purpose text not null check(purpose in ('guided_practice','independent_check')),
 instructions text not null, success_description text not null,
 audio_path text not null unique, audio_sha256 text not null check(audio_sha256 ~ '^[a-f0-9]{64}$'),
 taxonomy_version_id uuid not null references public.academic_skill_registry_versions(id),
 questions jsonb not null check(jsonb_array_length(questions)=6),
 review_record jsonb not null, pilot_student uuid not null references public.users(id),
 created_at timestamptz not null default now()
);
create table private.ielts_learning_allocations (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 student_id uuid not null references public.users(id), task_code text not null references private.ielts_learning_tasks(code),
 source_attempt_id uuid not null references private.ielts_diagnostic_attempt_evidence(attempt_id),
 reason text not null check(length(trim(reason)) between 10 and 1200),
 teacher_id uuid not null references public.users(id), request_id uuid not null unique,
 status text not null default 'assigned' check(status in ('assigned','in_progress','submitted','closed')),
 answers jsonb not null default '{}', revision integer not null default 0,
 started_at timestamptz, submitted_at timestamptz, due_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index ielts_learning_student_list on private.ielts_learning_allocations(student_id,created_at desc);
create index ielts_learning_school_list on private.ielts_learning_allocations(school_id,created_at desc);
create unique index ielts_learning_single_active on private.ielts_learning_allocations(student_id,task_code)
 where status in ('assigned','in_progress');
create table private.ielts_learning_submissions (
 allocation_id uuid primary key references private.ielts_learning_allocations(id),
 response jsonb not null, task_snapshot jsonb not null, outcomes jsonb not null,
 score integer not null check(score between 0 and 6), scoring_policy text not null default 'ielts-targeted-listening-v1',
 submitted_at timestamptz not null default now()
);
create table private.ielts_learning_reviews (
 id uuid primary key default gen_random_uuid(), allocation_id uuid not null references private.ielts_learning_submissions(allocation_id),
 reviewer_id uuid not null references public.users(id), request_id uuid not null unique,
 feedback jsonb not null, reviewed_at timestamptz not null default now()
);
create index ielts_learning_latest_review on private.ielts_learning_reviews(allocation_id,reviewed_at desc,id);
create table private.ielts_learning_incidents (
 id uuid primary key default gen_random_uuid(), allocation_id uuid not null references private.ielts_learning_allocations(id),
 kind text not null check(kind in ('play','interruption','replay','audio_failure','assistance')),
 created_at timestamptz not null default now()
);
create index ielts_learning_incident_source on private.ielts_learning_incidents(allocation_id,created_at);
alter table private.ielts_learning_tasks enable row level security;
alter table private.ielts_learning_allocations enable row level security;
alter table private.ielts_learning_submissions enable row level security;
alter table private.ielts_learning_reviews enable row level security;
alter table private.ielts_learning_incidents enable row level security;
revoke all on private.ielts_learning_tasks,private.ielts_learning_allocations,private.ielts_learning_submissions,
 private.ielts_learning_reviews,private.ielts_learning_incidents from public,anon,authenticated,service_role;

create function private.can_access_ielts_learning(p_id uuid,p_write_teacher boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.ielts_learning_allocations a
 join public.users actor on actor.id=auth.uid()
 where a.id=p_id and not coalesce(actor.is_banned,false)
 and private.ielts_speaking_student_eligible(a.student_id)
 and (public.can_manage_ielts_practice_school(a.school_id)
 or (not p_write_teacher and a.student_id=auth.uid())));
$$;
revoke all on function private.can_access_ielts_learning(uuid,boolean) from public,anon,authenticated,service_role;
create function private.ielts_learning_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'learning_history_is_immutable'; end; $$;
revoke all on function private.ielts_learning_immutable() from public,anon,authenticated,service_role;
create trigger ielts_learning_tasks_immutable before update or delete on private.ielts_learning_tasks for each row execute function private.ielts_learning_immutable();
create trigger ielts_learning_submissions_immutable before update or delete on private.ielts_learning_submissions for each row execute function private.ielts_learning_immutable();
create trigger ielts_learning_reviews_immutable before update or delete on private.ielts_learning_reviews for each row execute function private.ielts_learning_immutable();
create function private.validate_ielts_learning_task() returns trigger language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
 if not exists(select 1 from public.academic_skill_registry_versions where id=new.taxonomy_version_id and status='published') then raise exception 'reviewed_taxonomy_required'; end if;
 if (select count(distinct j.value->>'id') from jsonb_array_elements(new.questions) j)<>6 then raise exception 'unique_task_items_required'; end if;
 for q in select value from jsonb_array_elements(new.questions) loop
 if q->>'id' not in ('q1','q2','q3','q4','q5','q6') or length(trim(coalesce(q->>'prompt','')))=0
 or jsonb_typeof(q->'accepted_answers') is distinct from 'array' or jsonb_array_length(q->'accepted_answers')=0
 or exists(select 1 from jsonb_array_elements(q->'accepted_answers') k where jsonb_typeof(k)<>'string' or length(trim(k#>>'{}'))=0)
 or not exists(select 1 from public.academic_skill_registry_nodes where id=(q->>'taxonomy_node_id')::uuid and registry_version_id=new.taxonomy_version_id and node_type='subskill' and status='active')
 or not exists(select 1 from public.academic_skill_registry_nodes where id=(q->>'supporting_node_id')::uuid and registry_version_id=new.taxonomy_version_id and node_type='subskill' and status='active')
 then raise exception 'reviewed_item_mapping_required'; end if;
 end loop;
 return new;
end; $$;
revoke all on function private.validate_ielts_learning_task() from public,anon,authenticated,service_role;
create trigger validate_ielts_learning_task before insert on private.ielts_learning_tasks for each row execute function private.validate_ielts_learning_task();

create function public.rpc_ielts_learning_workspace(p_school uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare manager boolean; tasks jsonb; allocations jsonb;
begin
 manager:=p_school is not null and public.can_manage_ielts_practice_school(p_school);
 if auth.uid() is null or (p_school is not null and not manager) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not manager and not private.ielts_speaking_student_eligible(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'title',t.title,'purpose',t.purpose,'success_description',t.success_description) order by t.code),'[]') into tasks
 from private.ielts_learning_tasks t where manager;
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]') into allocations from (
 select a.created_at,jsonb_build_object('id',a.id,'title',t.title,'purpose',t.purpose,'status',a.status,
 'student_name',u.username,'reason',a.reason,'due_at',a.due_at,'reviewed',exists(select 1 from private.ielts_learning_reviews r where r.allocation_id=a.id)) item
 from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code join public.users u on u.id=a.student_id
 where ((manager and a.school_id=p_school) or (not manager and a.student_id=auth.uid())) and private.can_access_ielts_learning(a.id)
 order by a.created_at desc,a.id limit 50) x;
 return jsonb_build_object('tasks',tasks,'allocations',allocations,'manager',manager,'pilot_only',true);
end; $$;

create function public.rpc_ielts_learning_allocate(p_school uuid,p_student uuid,p_task text,p_source uuid,p_reason text,p_due timestamptz,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare task private.ielts_learning_tasks%rowtype; result uuid; existing private.ielts_learning_allocations%rowtype;
begin
 if not public.can_manage_ielts_practice_school(p_school) or not private.ielts_speaking_student_eligible(p_student)
 or not exists(select 1 from public.school_members where school_id=p_school and user_id=p_student and status='active')
 or coalesce((select is_banned from public.users where id=auth.uid()),true) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into task from private.ielts_learning_tasks where code=p_task;
 if task.code is null or task.pilot_student<>p_student then raise exception 'pilot_scope_only'; end if;
 if not exists(select 1 from private.ielts_diagnostic_attempt_evidence e join private.ielts_diagnostic_scoring_runs s on s.attempt_id=e.attempt_id
 where e.attempt_id=p_source and e.student_id=p_student and e.school_id=p_school and s.server_verified)
 then raise exception 'reviewed_source_required'; end if;
 if p_request is null or length(trim(coalesce(p_reason,''))) not between 10 and 1200 or p_due<=now() then raise exception 'assignment_details_required'; end if;
 select * into existing from private.ielts_learning_allocations where request_id=p_request;
 if existing.id is not null then
  if (existing.school_id,existing.student_id,existing.task_code,existing.source_attempt_id,existing.reason,existing.due_at)
   is distinct from (p_school,p_student,p_task,p_source,p_reason,p_due) then raise exception 'request_conflict'; end if;
  return existing.id;
 end if;
 insert into private.ielts_learning_allocations(school_id,student_id,task_code,source_attempt_id,reason,teacher_id,request_id,due_at)
 values(p_school,p_student,p_task,p_source,p_reason,auth.uid(),p_request,p_due) returning id into result;
 return result;
end; $$;

create function public.rpc_ielts_learning_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype; t private.ielts_learning_tasks%rowtype; s private.ielts_learning_submissions%rowtype; review jsonb;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id;
 select * into t from private.ielts_learning_tasks where code=a.task_code;
 select * into s from private.ielts_learning_submissions where allocation_id=p_id;
 select jsonb_build_object('fields',r.feedback,'reviewer',u.username,'reviewed_at',r.reviewed_at) into review
 from private.ielts_learning_reviews r join public.users u on u.id=r.reviewer_id where r.allocation_id=p_id order by r.reviewed_at desc,r.id desc limit 1;
 return jsonb_build_object('id',a.id,'student_id',a.student_id,'manager',public.can_manage_ielts_practice_school(a.school_id),
 'title',t.title,'purpose',t.purpose,'instructions',t.instructions,'success_description',t.success_description,'reason',a.reason,
 'questions',(select jsonb_agg(q-'accepted_answers'-'taxonomy_node_id'-'supporting_node_id' order by q->>'id') from jsonb_array_elements(t.questions) q),
 'audio_bucket','ielts-targeted-listening','audio_path',t.audio_path,'audio_sha256',t.audio_sha256,
 'status',a.status,'answers',case when s.allocation_id is null then a.answers else s.response end,'revision',a.revision,
 'source_attempt_id',a.source_attempt_id,'play_count',(select count(*) from private.ielts_learning_incidents where allocation_id=p_id and kind='play'),
 'conditions_need_review',exists(select 1 from private.ielts_learning_incidents where allocation_id=p_id and kind in ('interruption','replay','audio_failure','assistance')) or (select count(*) from private.ielts_learning_incidents where allocation_id=p_id and kind='play')>1,
 'result',case when s.allocation_id is null then null else jsonb_build_object('score',s.score,'total',6,'outcomes',s.outcomes,'submitted_at',s.submitted_at) end,'review',review);
end; $$;

create function public.rpc_ielts_learning_save(p_id uuid,p_revision integer,p_answers jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id for update;
 if a.student_id<>auth.uid() or a.status not in ('assigned','in_progress') then raise exception 'task_not_active'; end if;
 if jsonb_typeof(p_answers) is distinct from 'object' or exists(select 1 from jsonb_each(p_answers) e(k,v)
 where k not in ('q1','q2','q3','q4','q5','q6') or jsonb_typeof(v)<>'string' or length(v#>>'{}')>120) then raise exception 'invalid_answers'; end if;
 if a.answers=p_answers then return a.revision; end if;
 if a.revision is distinct from p_revision then raise exception 'draft_changed_in_another_tab'; end if;
 update private.ielts_learning_allocations set answers=p_answers,revision=revision+1,status='in_progress',started_at=coalesce(started_at,now()),updated_at=now() where id=p_id returning revision into p_revision;
 return p_revision;
end; $$;

create function public.rpc_ielts_learning_incident(p_id uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype;
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id for update;
 if a.student_id<>auth.uid() or a.status not in ('assigned','in_progress') then raise exception 'task_not_active'; end if;
 if p_kind not in ('play','interruption','replay','audio_failure','assistance') then raise exception 'invalid_incident'; end if;
 if (select count(*) from private.ielts_learning_incidents where allocation_id=p_id and created_at>now()-interval '1 minute')>=12 then return; end if;
 insert into private.ielts_learning_incidents(allocation_id,kind) values(p_id,p_kind);
end; $$;

create function public.rpc_ielts_learning_submit(p_id uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.ielts_learning_allocations%rowtype; t private.ielts_learning_tasks%rowtype; q jsonb; response text; correct boolean; score integer:=0; outcomes jsonb:='[]';
begin
 if not private.can_access_ielts_learning(p_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_learning_allocations where id=p_id for update;
 if a.student_id<>auth.uid() then raise exception using errcode='42501',message='not_authorized'; end if;
 if a.status='submitted' then return public.rpc_ielts_learning_detail(p_id); end if;
 if a.status not in ('assigned','in_progress') or a.revision<>p_revision then raise exception 'task_not_active_or_draft_changed'; end if;
 select * into t from private.ielts_learning_tasks where code=a.task_code;
 for q in select value from jsonb_array_elements(t.questions) loop
 response:=lower(trim(regexp_replace(coalesce(a.answers->>(q->>'id'),''),'\s+',' ','g')));
 select response<>'' and exists(select 1 from jsonb_array_elements_text(q->'accepted_answers') answer where lower(answer)=response)
 and cardinality(regexp_split_to_array(response,'\s+'))<=2 into correct;
 score:=score+case when correct then 1 else 0 end;
 outcomes:=outcomes||jsonb_build_array(jsonb_build_object('id',q->>'id','correct',correct,'response_state',case when response='' then 'unanswered' else 'answered' end,
 'accepted_answers',q->'accepted_answers','taxonomy_node_id',q->'taxonomy_node_id','supporting_node_id',q->'supporting_node_id'));
 end loop;
 insert into private.ielts_learning_submissions(allocation_id,response,task_snapshot,outcomes,score) values(p_id,a.answers,to_jsonb(t),outcomes,score);
 update private.ielts_learning_allocations set status='submitted',submitted_at=now(),updated_at=now() where id=p_id;
 return public.rpc_ielts_learning_detail(p_id);
end; $$;

create function public.rpc_ielts_learning_review(p_id uuid,p_feedback jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare field text; r private.ielts_learning_reviews%rowtype;
begin
 if not private.can_access_ielts_learning(p_id,true) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not exists(select 1 from private.ielts_learning_submissions where allocation_id=p_id) then raise exception 'submission_required'; end if;
 if jsonb_typeof(p_feedback) is distinct from 'object' or p_request is null then raise exception 'feedback_required'; end if;
 foreach field in array array['went_well','work_on','practice','check_again'] loop
 if jsonb_typeof(p_feedback->field) is distinct from 'string' or length(trim(p_feedback->>field)) not between 5 and 1200 then raise exception 'complete_feedback_required'; end if;
 end loop;
 if exists(select 1 from jsonb_object_keys(p_feedback) k where k not in ('went_well','work_on','practice','check_again')) then raise exception 'invalid_feedback'; end if;
 select * into r from private.ielts_learning_reviews where request_id=p_request;
 if r.id is not null then
 if r.allocation_id<>p_id or r.reviewer_id<>auth.uid() or r.feedback<>p_feedback then raise exception 'request_conflict'; end if;
 else insert into private.ielts_learning_reviews(allocation_id,reviewer_id,request_id,feedback) values(p_id,auth.uid(),p_request,p_feedback); end if;
 return public.rpc_ielts_learning_detail(p_id);
end; $$;

revoke all on function public.rpc_ielts_learning_workspace(uuid),public.rpc_ielts_learning_allocate(uuid,uuid,text,uuid,text,timestamptz,uuid),
 public.rpc_ielts_learning_detail(uuid),public.rpc_ielts_learning_save(uuid,integer,jsonb),public.rpc_ielts_learning_incident(uuid,text),
 public.rpc_ielts_learning_submit(uuid,integer),public.rpc_ielts_learning_review(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_workspace(uuid),public.rpc_ielts_learning_allocate(uuid,uuid,text,uuid,text,timestamptz,uuid),
 public.rpc_ielts_learning_detail(uuid),public.rpc_ielts_learning_save(uuid,integer,jsonb),public.rpc_ielts_learning_incident(uuid,text),
 public.rpc_ielts_learning_submit(uuid,integer),public.rpc_ielts_learning_review(uuid,jsonb,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ielts-targeted-listening','ielts-targeted-listening',false,5000000,array['audio/mpeg']) on conflict(id) do nothing;
create function private.can_read_ielts_learning_audio(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ielts_learning_tasks t join private.ielts_learning_allocations a on a.task_code=t.code
 where t.audio_path=p_path and a.status in ('assigned','in_progress','submitted') and private.can_access_ielts_learning(a.id));
$$;
revoke all on function private.can_read_ielts_learning_audio(text) from public,anon,authenticated,service_role;
grant execute on function private.can_read_ielts_learning_audio(text) to authenticated;
create policy ielts_learning_audio_assigned on storage.objects for select to authenticated
using(bucket_id='ielts-targeted-listening' and private.can_read_ielts_learning_audio(name));
notify pgrst,'reload schema';
-- Explicit per-function revokes also make the repository security tripwire auditable.
revoke all on function public.rpc_ielts_learning_allocate(uuid,uuid,text,uuid,text,timestamptz,uuid) from public,anon;
revoke all on function public.rpc_ielts_learning_detail(uuid) from public,anon;
revoke all on function public.rpc_ielts_learning_save(uuid,integer,jsonb) from public,anon;
revoke all on function public.rpc_ielts_learning_incident(uuid,text) from public,anon;
revoke all on function public.rpc_ielts_learning_submit(uuid,integer) from public,anon;
revoke all on function public.rpc_ielts_learning_review(uuid,jsonb,uuid) from public,anon;
-- Older broad Storage SELECT policies cannot expand access to these protected assets.
create policy ielts_learning_audio_boundary on storage.objects as restrictive for select to authenticated
using(bucket_id<>'ielts-targeted-listening' or private.can_read_ielts_learning_audio(name));
create policy ielts_learning_audio_anon_boundary on storage.objects as restrictive for select to anon
using(bucket_id<>'ielts-targeted-listening');

-- Approved content is immutable and limited to the standing named-user pilot.
insert into private.ielts_learning_tasks(code,version,title,purpose,instructions,success_description,audio_path,audio_sha256,taxonomy_version_id,pilot_student,questions,review_record) values('bh-ielts-targeted-listening-l1-v1','0.1.0','Follow the correction: photography workshop','guided_practice','Complete the notes. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer. You may pause and replay. Listen for the final confirmed detail.','Identify the final confirmed details and explain why earlier or inapplicable details are not the answers.','starter-pack-01/d29a35b3c3843c94fc15281fc6587a93e6610e042b2ea545f72ad273fe0d5357/L1_review_v1.mp3','d29a35b3c3843c94fc15281fc6587a93e6610e042b2ea545f72ad273fe0d5357','d4ad52b6-fd0f-4068-9982-28b89ff389c5','b30e9c28-96f1-4d34-83e9-9b28b4926f42','[{"id": "q1", "prompt": "Workshop day", "accepted_answers": ["Sunday"], "taxonomy_node_id": "0dbe1c8f-403a-493f-afd3-c219310fb18a", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q2", "prompt": "Starting time", "accepted_answers": ["10:30", "10.30", "ten thirty"], "taxonomy_node_id": "0dbe1c8f-403a-493f-afd3-c219310fb18a", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q3", "prompt": "Meeting room", "accepted_answers": ["20", "twenty"], "taxonomy_node_id": "d5b1fddb-ba6f-4be1-8513-bb26d822357a", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q4", "prompt": "Student fee (\u00a3)", "accepted_answers": ["12", "twelve"], "taxonomy_node_id": "d5b1fddb-ba6f-4be1-8513-bb26d822357a", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q5", "prompt": "Bring a", "accepted_answers": ["notebook"], "taxonomy_node_id": "d0aa0bad-ecfa-4598-8f2f-07e93d3fa59b", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q6", "prompt": "Maximum group size", "accepted_answers": ["10", "ten"], "taxonomy_node_id": "d5b1fddb-ba6f-4be1-8513-bb26d822357a", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}]'::jsonb,'{"owner": "Sobbi \u2014 Brains Heist owner", "date": "2026-10-09", "bible": "1.5.0", "audio_approval": {"reviewer": "Sobbi \u2014 Brains Heist owner", "date": "2026-10-09", "timezone": "Asia/Bishkek", "owner_statement": "I\u2019ve reviewed and they are perfect", "scope": ["sound and clarity", "voice separation", "pacing", "reading and response pauses"], "files": [{"file": "L1_review_v1.mp3", "sha256": "d29a35b3c3843c94fc15281fc6587a93e6610e042b2ea545f72ad273fe0d5357"}, {"file": "L2_review_v1.mp3", "sha256": "ddf37276bdc6c477181fcc2cfa162ca5e69b56669df6d67898534c3caf1b848b"}], "not_implied": ["answer-key/editorial approval", "canonical taxonomy mapping approval", "rights clearance", "difficulty/comparability validation", "device/player acceptance", "assignment integration", "student publication", "calibration"]}, "content_approval": {"reviewer": "Sobbi \u2014 Brains Heist owner", "date": "2026-10-09", "timezone": "Asia/Bishkek", "source_task_version": "0.1.0", "scope": ["scripts and naturalness", "target answers", "proposed distractor-resistance teaching focus"], "owner_statement": "These are well-crafted listening practice tasks perfectly mirror an IELTS-style section by effectively testing distractor resistance through realistic dialogue shifts. The audio scripts feel natural, the target answers are structurally sound, and the pedagogical focus on identifying final, confirmed details over initial mentions is excellent.", "limits": ["IELTS-style practice, not official IELTS material or complete section coverage", "canonical item mappings and registry IDs pending", "comparability/calibration not established", "assignment integration and device checks pending", "not published"]}, "mapping_basis": "Owner-approved named constructs resolved to published bh-ielts-listening-v1 nodes; no pooling with ESL nodes.", "reading_seconds": 30, "response_seconds": 15, "comparability": "Not calibrated equivalent forms; task scores alone cannot establish improvement.", "rights": "Original Brains Heist AI-assisted scripts; generated through owner-authorized connected Runway account; no third-party content copied; public rights review remains pending."}'::jsonb);
insert into private.ielts_learning_tasks(code,version,title,purpose,instructions,success_description,audio_path,audio_sha256,taxonomy_version_id,pilot_student,questions,review_record) values('bh-ielts-targeted-listening-l2-v1','0.1.0','Final arrangements: museum visit','independent_check','Complete the notes. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer. Listen once without hints. If interrupted, resume; tell your teacher if you replayed or received help.','Identify the final confirmed details and explain why earlier or inapplicable details are not the answers.','starter-pack-01/ddf37276bdc6c477181fcc2cfa162ca5e69b56669df6d67898534c3caf1b848b/L2_review_v1.mp3','ddf37276bdc6c477181fcc2cfa162ca5e69b56669df6d67898534c3caf1b848b','d4ad52b6-fd0f-4068-9982-28b89ff389c5','b30e9c28-96f1-4d34-83e9-9b28b4926f42','[{"id": "q1", "prompt": "Visit day", "accepted_answers": ["Thursday"], "taxonomy_node_id": "0dbe1c8f-403a-493f-afd3-c219310fb18a", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q2", "prompt": "Departure time", "accepted_answers": ["8:00", "08:00", "8", "eight"], "taxonomy_node_id": "0dbe1c8f-403a-493f-afd3-c219310fb18a", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q3", "prompt": "Meeting point", "accepted_answers": ["side gate"], "taxonomy_node_id": "d0aa0bad-ecfa-4598-8f2f-07e93d3fa59b", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q4", "prompt": "Student ticket (\u00a3)", "accepted_answers": ["9", "nine"], "taxonomy_node_id": "d5b1fddb-ba6f-4be1-8513-bb26d822357a", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q5", "prompt": "Bring a", "accepted_answers": ["pencil"], "taxonomy_node_id": "d0aa0bad-ecfa-4598-8f2f-07e93d3fa59b", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}, {"id": "q6", "prompt": "Places available", "accepted_answers": ["24", "twenty-four", "twenty four"], "taxonomy_node_id": "d5b1fddb-ba6f-4be1-8513-bb26d822357a", "supporting_node_id": "f9064b63-e3f1-4bfa-8e8e-97a02756afb2"}]'::jsonb,'{"owner": "Sobbi \u2014 Brains Heist owner", "date": "2026-10-09", "bible": "1.5.0", "audio_approval": {"reviewer": "Sobbi \u2014 Brains Heist owner", "date": "2026-10-09", "timezone": "Asia/Bishkek", "owner_statement": "I\u2019ve reviewed and they are perfect", "scope": ["sound and clarity", "voice separation", "pacing", "reading and response pauses"], "files": [{"file": "L1_review_v1.mp3", "sha256": "d29a35b3c3843c94fc15281fc6587a93e6610e042b2ea545f72ad273fe0d5357"}, {"file": "L2_review_v1.mp3", "sha256": "ddf37276bdc6c477181fcc2cfa162ca5e69b56669df6d67898534c3caf1b848b"}], "not_implied": ["answer-key/editorial approval", "canonical taxonomy mapping approval", "rights clearance", "difficulty/comparability validation", "device/player acceptance", "assignment integration", "student publication", "calibration"]}, "content_approval": {"reviewer": "Sobbi \u2014 Brains Heist owner", "date": "2026-10-09", "timezone": "Asia/Bishkek", "source_task_version": "0.1.0", "scope": ["scripts and naturalness", "target answers", "proposed distractor-resistance teaching focus"], "owner_statement": "These are well-crafted listening practice tasks perfectly mirror an IELTS-style section by effectively testing distractor resistance through realistic dialogue shifts. The audio scripts feel natural, the target answers are structurally sound, and the pedagogical focus on identifying final, confirmed details over initial mentions is excellent.", "limits": ["IELTS-style practice, not official IELTS material or complete section coverage", "canonical item mappings and registry IDs pending", "comparability/calibration not established", "assignment integration and device checks pending", "not published"]}, "mapping_basis": "Owner-approved named constructs resolved to published bh-ielts-listening-v1 nodes; no pooling with ESL nodes.", "reading_seconds": 30, "response_seconds": 15, "comparability": "Not calibrated equivalent forms; task scores alone cannot establish improvement.", "rights": "Original Brains Heist AI-assisted scripts; generated through owner-authorized connected Runway account; no third-party content copied; public rights review remains pending."}'::jsonb);
