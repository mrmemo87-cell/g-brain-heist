-- Owner policy: screeners are onboarding assessments, never later practice material.
-- Retain all existing content, assignments, submissions, scores and assessment access.
create table private.ielts_protected_screener_signals(signal text primary key);
create table private.ielts_practice_material_holds(material_type text not null,material_id text not null,reason text not null,created_at timestamptz not null default now(),primary key(material_type,material_id));
alter table private.ielts_protected_screener_signals enable row level security;
alter table private.ielts_practice_material_holds enable row level security;
revoke all on private.ielts_protected_screener_signals,private.ielts_practice_material_holds from public,anon,authenticated;

create function private.ielts_practice_signals(p jsonb) returns text[] language sql immutable set search_path='' as $$
 with recursive nodes(k,v) as (
 select ''::text,p union all
 select x.k,x.v from nodes n cross join lateral (
 select e.key k,e.value v from jsonb_each(case when jsonb_typeof(n.v)='object' then n.v else '{}'::jsonb end)e
 union all select n.k,a.value from jsonb_array_elements(case when jsonb_typeof(n.v)='array' then n.v else '[]'::jsonb end)a
 )x
 ), strings as (
 select k,v#>>'{}' raw,private.ielts_originality_normalize(v#>>'{}') normalized from nodes where jsonb_typeof(v)='string'
 ) select coalesce(array_agg(distinct md5(case when k in ('audio_url','audio_path','audio_sha256') then 'audio:'||regexp_replace(split_part(raw,'?',1),'^https?://[^/]+/storage/v1/object/(public|sign)/[^/]+/','','i') else 'text:'||normalized end)),'{}')
 from strings where (k in ('prompt','body','text','passage','passage_text','question','transcript','passage_or_prompt') and length(normalized)>=30)
 or (k in ('audio_url','audio_path','audio_sha256') and length(raw)>10);
$$;
insert into private.ielts_protected_screener_signals
select distinct unnest(private.ielts_practice_signals(to_jsonb(f)||jsonb_build_object('snapshot',v.published_snapshot)))
from private.ielts_diagnostic_versions v join public.ielts_exam_forms f on f.id=v.exam_form_id where v.mode='screener' on conflict do nothing;
insert into private.ielts_protected_screener_signals
select distinct unnest(private.ielts_practice_signals(to_jsonb(f))) from public.ielts_exam_forms f
where jsonb_path_exists(to_jsonb(f),'$.**.assessment_mode ? (@ == "screener")') on conflict do nothing;
insert into private.ielts_protected_screener_signals select distinct unnest(private.ielts_practice_signals(to_jsonb(p))) from private.ielts_speaking_packages p on conflict do nothing;
-- Grandfathered inventory has not passed the new full review standard. A hold is not retirement.
insert into private.ielts_practice_material_holds(material_type,material_id,reason)
select 'ielts_reading_set',id::text,'Legacy material needs editorial, keys, rights and delivery review' from public.ielts_reading_sets
union all select 'ielts_listening_set',id::text,'Legacy material needs editorial, keys, rights and delivery review' from public.ielts_listening_sets
union all select 'ielts_writing_task',id::text,'Legacy material needs editorial, keys, rights and delivery review' from public.ielts_writing_tasks
union all select 'ielts_speaking_task',id::text,'Legacy material needs editorial, keys, rights and delivery review' from public.ielts_speaking_tasks;
create function private.ielts_capture_screener_signals() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new); f jsonb;
begin
 if tg_table_name='ielts_diagnostic_versions' then
  if r->>'mode'<>'screener' then return new;end if;
  select to_jsonb(x) into f from public.ielts_exam_forms x where x.id=(r->>'exam_form_id')::uuid;
  r:=r||jsonb_build_object('form',f);
 elsif tg_table_name='ielts_exam_forms' then
  if not jsonb_path_exists(r,'$.**.assessment_mode ? (@ == "screener")') and not exists(select 1 from private.ielts_diagnostic_versions v where v.exam_form_id=new.id and v.mode='screener') then return new;end if;
 end if;
 insert into private.ielts_protected_screener_signals select unnest(private.ielts_practice_signals(r)) on conflict do nothing;
 return new;
end; $$;
create trigger capture_practice_exclusion after insert or update on private.ielts_diagnostic_versions for each row execute function private.ielts_capture_screener_signals();
create trigger capture_practice_exclusion after insert or update on public.ielts_exam_forms for each row execute function private.ielts_capture_screener_signals();
create trigger capture_practice_exclusion after insert or update on private.ielts_speaking_packages for each row execute function private.ielts_capture_screener_signals();
create function private.ielts_practice_material_allowed(p_type text,p_id text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare r jsonb; signals text[];
begin
 if exists(select 1 from private.ielts_practice_material_holds where material_type=p_type and material_id=p_id) then return false;end if;
 case p_type
 when 'targeted' then select to_jsonb(t) into r from private.ielts_learning_tasks t where code=p_id and purpose in ('guided_practice','independent_check');
 when 'ielts_reading_set' then select to_jsonb(t)||jsonb_build_object('questions',(select jsonb_agg(to_jsonb(q)) from public.ielts_reading_questions q where q.set_id=t.id)) into r from public.ielts_reading_sets t where id::text=p_id and is_active;
 when 'ielts_listening_set' then select to_jsonb(t)||jsonb_build_object('questions',(select jsonb_agg(to_jsonb(q)) from public.ielts_listening_questions q where q.set_id=t.id)) into r from public.ielts_listening_sets t where id::text=p_id and is_active;
 when 'ielts_writing_task' then select to_jsonb(t) into r from public.ielts_writing_tasks t where id::text=p_id and is_active;
 when 'ielts_speaking_task' then select to_jsonb(t) into r from public.ielts_speaking_tasks t where id::text=p_id and is_active;
 else return false;
 end case;
 if r is null or jsonb_path_exists(r,'$.**.assessment_mode ? (@ == "screener")') or lower(coalesce(r->>'title',''))~'\m(screener|diagnostic|baseline)\M' then return false;end if;
 signals:=private.ielts_practice_signals(r);
 return not exists(select 1 from unnest(signals)s(signal) join private.ielts_protected_screener_signals p using(signal));
end; $$;
-- A safe boolean filter for the invoker/RLS-backed legacy catalogue; no source content is returned.
create function public.ielts_practice_material_assignable(p_type text,p_id text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u where u.id=auth.uid() and u.role in ('teacher','school_admin','admin','superadmin') and not coalesce(u.is_banned,false) and (u.banned_until is null or u.banned_until<=now())) and private.ielts_practice_material_allowed(p_type,p_id);
$$;
create function private.ielts_practice_assignment_boundary() returns trigger language plpgsql security definer set search_path='' as $$
declare r record; batch private.ielts_course_batches;
begin
 if tg_table_name<>'ielts_learning_allocations' then
  select b.* into batch from private.ielts_batch_assignment_links l join private.ielts_course_batches b on b.id=l.batch_id where l.assignment_id=new.assignment_id for share of b;
  if batch.id is not null and (batch.archived_at is not null or batch.deleted_at is not null) then raise exception 'batch_archived';end if;
 end if;
 if tg_table_name='ielts_learning_allocations' then
  if not private.ielts_practice_material_allowed('targeted',new.task_code) then raise exception 'assessment_material_not_assignable_as_practice';end if;
 elsif tg_table_name='ielts_practice_assignment_items' then
  if not private.ielts_practice_material_allowed(new.content_type,new.content_id) then raise exception 'practice_material_review_required';end if;
 else
  for r in select content_type,content_id from public.ielts_practice_assignment_items where assignment_id=new.assignment_id loop
   if not private.ielts_practice_material_allowed(r.content_type,r.content_id) then raise exception 'practice_material_review_required';end if;
  end loop;
 end if;return new;
end; $$;
create trigger practice_boundary before insert or update of content_type,content_id on public.ielts_practice_assignment_items for each row execute function private.ielts_practice_assignment_boundary();
create trigger practice_boundary before insert on public.ielts_practice_assignment_students for each row execute function private.ielts_practice_assignment_boundary();
create trigger practice_boundary before insert on private.ielts_learning_allocations for each row execute function private.ielts_practice_assignment_boundary();

alter table private.ielts_course_batches add column archived_at timestamptz,add column deleted_at timestamptz;
alter table private.ielts_course_batches drop constraint ielts_course_batches_school_id_academic_year_id_name_key;
create unique index ielts_batch_live_name on private.ielts_course_batches(school_id,academic_year_id,name) where deleted_at is null;
create table private.ielts_batch_practice_requests (
 request_id uuid primary key,batch_id uuid not null references private.ielts_course_batches(id),actor_id uuid not null references public.users(id),
 payload jsonb not null,allocation_ids uuid[] not null,created_at timestamptz not null default now()
);
create index ielts_batch_practice_batch on private.ielts_batch_practice_requests(batch_id,created_at);
alter table private.ielts_batch_practice_requests enable row level security;
revoke all on private.ielts_batch_practice_requests from public,anon,authenticated;
create function public.rpc_ielts_batch_lifecycle(p_batch uuid,p_revision integer,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches;
begin
 perform private.ielts_batch_assert(p_batch);
 select * into b from private.ielts_course_batches where id=p_batch for update;
 if b.revision is distinct from p_revision then raise exception 'batch_changed_refresh';end if;
 if p_action not in ('archive','restore','delete') then raise exception 'invalid_action';end if;
 if p_action='delete' and (exists(select 1 from private.ielts_course_batch_members where batch_id=b.id) or exists(select 1 from private.ielts_batch_assignment_links where batch_id=b.id) or exists(select 1 from private.ielts_batch_practice_requests where batch_id=b.id)) then raise exception 'only_empty_unused_batches_can_be_deleted';end if;
 update private.ielts_course_batches set revision=revision+1,archived_at=case when p_action='archive' then coalesce(archived_at,now()) when p_action='restore' then null else archived_at end,deleted_at=case when p_action='delete' then now() else null end where id=b.id;
 insert into private.ielts_course_batch_events(batch_id,actor_id,action,detail) values(b.id,auth.uid(),p_action,jsonb_build_object('previous_revision',p_revision));
end; $$;

create function private.ielts_batch_practice_source(p_school uuid,p_student uuid,p_skill text) returns uuid language sql stable security definer set search_path='' as $$
 select case when p_skill='speaking' then (
 select s.id from private.ielts_speaking_sessions s where s.student_id=p_student and s.school_id=p_school and s.status='submitted' and exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id) order by s.created_at desc,s.id limit 1
 ) else (
 select e.attempt_id from private.ielts_diagnostic_attempt_evidence e join public.ielts_exam_attempts a on a.id=e.attempt_id join private.ielts_diagnostic_versions v on v.id=e.version_id
 where e.student_id=p_student and e.school_id=p_school and p_skill=any(v.skills) and a.status in ('submitted','auto_submitted')
 and case when p_skill='writing' then exists(select 1 from private.ielts_writing_screener_reviews r where r.attempt_id=e.attempt_id) else exists(select 1 from private.ielts_diagnostic_scoring_runs r where r.attempt_id=e.attempt_id and r.server_verified) end
 order by a.submitted_at desc,a.id limit 1) end;
$$;
create function public.rpc_ielts_batch_practice_preview(p_batch uuid,p_task text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b private.ielts_course_batches; tasks jsonb; students jsonb; task private.ielts_learning_tasks;
begin
 b:=private.ielts_batch_assert(p_batch);
 if b.archived_at is not null then raise exception 'batch_archived';end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'display_code',private.ielts_material_code('targeted',t.code),'title',t.title,'skill',t.skill,'purpose',t.purpose,'instructions',t.instructions,'success_description',t.success_description,'originality_label',private.ielts_originality_label('targeted',t.code)) order by t.skill,t.code),'[]') into tasks
 from private.ielts_learning_tasks t where private.ielts_learning_publicly_released(t.code) and private.ielts_practice_material_allowed('targeted',t.code);
 select * into task from private.ielts_learning_tasks t where t.code=p_task and private.ielts_learning_publicly_released(t.code) and private.ielts_practice_material_allowed('targeted',t.code);
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.full_name,''),u.username),'class_name',u.batch,
 'source_id',private.ielts_batch_practice_source(b.school_id,u.id,task.skill),
 'source_ready',private.ielts_batch_practice_source(b.school_id,u.id,task.skill) is not null,
 'prior_count',(select count(*) from private.ielts_learning_allocations a where a.student_id=u.id and a.task_code=task.code),
 'active',exists(select 1 from private.ielts_learning_allocations a where a.student_id=u.id and a.task_code=task.code and a.status in ('assigned','in_progress')),
 'eligible',u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id)) order by u.username,u.id),'[]') into students
 from private.ielts_course_batch_members m join public.users u on u.id=m.student_id where m.batch_id=b.id and m.left_at is null;
 return jsonb_build_object('batch',jsonb_build_object('id',b.id,'name',b.name,'revision',b.revision),'tasks',tasks,'students',students);
end; $$;
create function public.rpc_ielts_batch_assign_practice(p_batch uuid,p_revision integer,p_task text,p_students uuid[],p_reason text,p_due timestamptz,p_request uuid,p_repeat boolean default false,p_reviewed boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches; ids uuid[]; student uuid; source uuid; task private.ielts_learning_tasks; result uuid[]:='{}'; payload jsonb; existing private.ielts_batch_practice_requests;
begin
 b:=private.ielts_batch_assert(p_batch);
 if not coalesce(p_reviewed,false) then raise exception 'review_selected_source_evidence';end if;
 if p_request is null or p_students is null or cardinality(p_students) not between 1 and 500 or array_position(p_students,null) is not null then raise exception 'students_required';end if;
 select array_agg(distinct x order by x) into ids from unnest(p_students)x;
 payload:=jsonb_build_object('task',p_task,'students',ids,'reason',p_reason,'due',p_due,'repeat',p_repeat,'source_review_confirmed',p_reviewed);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into existing from private.ielts_batch_practice_requests where request_id=p_request;
 if found then
  if existing.batch_id<>b.id or existing.actor_id<>auth.uid() or existing.payload<>payload then raise exception 'request_conflict';end if;
  return jsonb_build_object('allocation_ids',existing.allocation_ids,'assigned_count',cardinality(existing.allocation_ids));
 end if;
 select * into b from private.ielts_course_batches where id=p_batch for update;
 if b.revision is distinct from p_revision or b.archived_at is not null then raise exception 'batch_changed_refresh';end if;
 select * into task from private.ielts_learning_tasks where code=p_task and private.ielts_learning_publicly_released(code) and private.ielts_practice_material_allowed('targeted',code);
 if task.code is null then raise exception 'released_practice_required';end if;
 foreach student in array ids loop
  if not exists(select 1 from private.ielts_course_batch_members where batch_id=b.id and student_id=student and left_at is null) or not exists(select 1 from public.users where id=student and school_id=b.school_id and private.ielts_speaking_student_eligible(id)) then raise exception 'student_not_in_batch';end if;
  if exists(select 1 from private.ielts_learning_allocations a where a.student_id=student and a.task_code=task.code and a.status in ('assigned','in_progress')) then raise exception 'existing_active_practice';end if;
  if not coalesce(p_repeat,false) and task.purpose='guided_practice' and exists(select 1 from private.ielts_learning_allocations a where a.student_id=student and a.task_code=task.code) then raise exception 'intentional_repeat_required';end if;
  source:=private.ielts_batch_practice_source(b.school_id,student,task.skill);
  -- Canonical allocator revalidates sources, publication, rights/originality and variant-family exposure for every student.
  result:=array_append(result,public.rpc_ielts_learning_allocate(b.school_id,student,task.code,source,p_reason,p_due,md5(p_request::text||':'||student::text)::uuid));
 end loop;
 insert into private.ielts_batch_practice_requests(request_id,batch_id,actor_id,payload,allocation_ids) values(p_request,b.id,auth.uid(),payload,result);
 insert into private.ielts_course_batch_events(batch_id,actor_id,action,detail) values(b.id,auth.uid(),'practice_assigned',jsonb_build_object('request_id',p_request,'task_code',p_task,'student_ids',ids,'allocation_ids',result));
 return jsonb_build_object('allocation_ids',result,'assigned_count',cardinality(result));
end; $$;

create or replace function private.ielts_batch_assert(p_batch uuid) returns private.ielts_course_batches language plpgsql stable security definer set search_path='' as $$
declare b private.ielts_course_batches;
begin
 select * into b from private.ielts_course_batches where id=p_batch;
 if b.id is null or b.deleted_at is not null or not private.ielts_batch_manager(b.school_id) or b.academic_year_id<>public.academic_resolve_operational_year_id(b.school_id,now()) then raise exception using errcode='42501',message='batch_access_required'; end if;
 return b;
end; $$;

create or replace function public.rpc_ielts_batches(p_school uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.ielts_batch_manager(p_school) then raise exception using errcode='42501',message='not_authorized';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from (
 select b.id,b.name,b.revision,b.created_at,b.archived_at,not exists(select 1 from private.ielts_course_batch_members past where past.batch_id=b.id) and not exists(select 1 from private.ielts_batch_assignment_links used where used.batch_id=b.id) and not exists(select 1 from private.ielts_batch_practice_requests used where used.batch_id=b.id) delete_allowed,count(m.student_id)::integer student_count,
 count(m.student_id) filter(where private.ielts_speaking_student_eligible(m.student_id) and u.school_id=b.school_id)::integer eligible_count
 from private.ielts_course_batches b left join private.ielts_course_batch_members m on m.batch_id=b.id and m.left_at is null
 left join public.users u on u.id=m.student_id
 where b.deleted_at is null and b.school_id=p_school and b.academic_year_id=public.academic_resolve_operational_year_id(p_school,now())
 group by b.id order by b.created_at desc,b.id limit 100) x),'[]'::jsonb);
end; $$;

create or replace function public.rpc_ielts_batch_save(p_school uuid,p_name text,p_students uuid[],p_batch uuid default null,p_revision integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches; v_id uuid;
begin
 if not private.ielts_batch_manager(p_school) then raise exception using errcode='42501',message='not_authorized';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 80 or p_students is null or cardinality(p_students)>500 or array_position(p_students,null) is not null then raise exception 'invalid_batch';end if;
 if p_batch is not null then
  select * into b from private.ielts_course_batches where id=p_batch for update;
  perform private.ielts_batch_assert(p_batch);
  if b.archived_at is not null then raise exception 'batch_archived';end if;
  if b.school_id<>p_school or b.revision is distinct from p_revision then raise exception 'batch_changed_refresh';end if;
 end if;
 -- Existing unavailable members can be retained or removed; every newly added student must be eligible.
 if exists(select 1 from unnest(p_students) s(id) where not exists(select 1 from public.users u where u.id=s.id and u.school_id=p_school and private.ielts_speaking_student_eligible(u.id)) and not exists(select 1 from private.ielts_course_batch_members m where m.batch_id=p_batch and m.student_id=s.id and m.left_at is null)) then raise exception 'student_not_eligible';end if;
 if p_batch is null then
  insert into private.ielts_course_batches(school_id,academic_year_id,name,created_by) values(p_school,public.academic_resolve_operational_year_id(p_school,now()),trim(p_name),auth.uid()) returning id into v_id;
 else
  v_id:=p_batch;update private.ielts_course_batches set name=trim(p_name),revision=revision+1 where id=v_id;
 end if;
 update private.ielts_course_batch_members set left_at=now() where batch_id=v_id and left_at is null and not(student_id=any(p_students));
 insert into private.ielts_course_batch_members(batch_id,student_id) select v_id,s.id from (select distinct unnest(p_students) id)s
 on conflict(batch_id,student_id) do update set left_at=null,joined_at=case when private.ielts_course_batch_members.left_at is not null then now() else private.ielts_course_batch_members.joined_at end;
 insert into private.ielts_course_batch_events(batch_id,actor_id,action,detail) values(v_id,auth.uid(),case when p_batch is null then 'created' else 'roster_updated' end,jsonb_build_object('name',trim(p_name),'student_ids',p_students,'previous_revision',p_revision));
 return v_id;
end; $$;

create or replace function public.rpc_ielts_batch_roster(p_batch uuid,p_search text default '',p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b private.ielts_course_batches; members jsonb; candidates jsonb;
begin
 b:=private.ielts_batch_assert(p_batch);
 select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.full_name,''),u.username),'username',u.username,'class_name',u.batch,'eligible',u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id),'joined_at',m.joined_at) order by u.username,u.id),'[]') into members
 from private.ielts_course_batch_members m join public.users u on u.id=m.student_id where m.batch_id=b.id and m.left_at is null;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.username,x.id),'[]') into candidates from (
 select u.id,coalesce(nullif(u.full_name,''),u.username) name,u.username,u.batch class_name,true eligible
 from public.users u where u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id)
 and (coalesce(p_search,'')='' or position(lower(left(p_search,80)) in lower(concat_ws(' ',u.full_name,u.username,u.batch)))>0)
 order by u.username,u.id limit 51 offset greatest(0,least(coalesce(p_offset,0),100000)))x;
 return jsonb_build_object('id',b.id,'name',b.name,'revision',b.revision,'archived_at',b.archived_at,'members',members,'candidates',candidates,'has_more',jsonb_array_length(candidates)>50);
end; $$;

create or replace function public.rpc_ielts_batch_create_assignment(p_batch uuid,p_revision integer,p_request uuid,p_title text,p_description text default null,p_due_at timestamptz default null,p_items jsonb default '[]') returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches; ids uuid[]; a jsonb; existing private.ielts_batch_assignment_links;
begin
 b:=private.ielts_batch_assert(p_batch);
 select * into b from private.ielts_course_batches where id=b.id for update;
 if b.archived_at is not null or b.deleted_at is not null then raise exception 'batch_archived';end if;
 if p_request is null then raise exception 'request_required';end if;
 -- Serialize only this cold creation request, never answer saves or the entire school.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into existing from private.ielts_batch_assignment_links where request_id=p_request;
 if found then
  if existing.batch_id<>p_batch or existing.created_by<>auth.uid() then raise exception using errcode='42501',message='not_authorized';end if;
  if existing.request_payload<>jsonb_build_object('title',p_title,'description',p_description,'due_at',p_due_at,'items',p_items) then raise exception 'request_changed_check_saved_assignment';end if;
  return public.ielts_practice_assignment_payload(existing.assignment_id);
 end if;
 select * into b from private.ielts_course_batches where id=p_batch for update;
 if b.revision is distinct from p_revision then raise exception 'batch_changed_refresh';end if;
 select array_agg(student_id order by student_id) into ids from private.ielts_course_batch_members where batch_id=b.id and left_at is null;
 if coalesce(cardinality(ids),0)=0 or exists(select 1 from unnest(ids)s(id) where not exists(select 1 from public.users u where u.id=s.id and u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id))) then raise exception 'batch_roster_needs_review';end if;
 a:=public.rpc_ielts_practice_create_assignment(b.school_id,null,p_title,p_description,p_due_at,p_items);
 insert into private.ielts_batch_assignment_links(assignment_id,batch_id,revision,student_ids,request_id,request_payload,created_by) values((a->>'id')::uuid,b.id,b.revision,ids,p_request,jsonb_build_object('title',p_title,'description',p_description,'due_at',p_due_at,'items',p_items),auth.uid());
 return public.ielts_practice_assignment_payload((a->>'id')::uuid);
end; $$;

create or replace function public.rpc_ielts_batch_allocate(p_assignment uuid,p_students uuid[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare link private.ielts_batch_assignment_links; b private.ielts_course_batches; ids uuid[]; a public.ielts_practice_assignments;
begin
 select * into link from private.ielts_batch_assignment_links where assignment_id=p_assignment;
 b:=private.ielts_batch_assert(link.batch_id);
 select * into b from private.ielts_course_batches where id=b.id for share;
 if b.archived_at is not null or b.deleted_at is not null then raise exception 'batch_archived';end if;
 select * into a from public.ielts_practice_assignments where id=p_assignment for update;
 if a.school_id<>b.school_id or not public.can_manage_ielts_practice_assignment(a.id) or a.status not in ('draft','assigned') then raise exception 'open_batch_assignment_required';end if;
 ids:=coalesce(p_students,link.student_ids);
 if cardinality(ids)=0 or cardinality(ids)>500 or array_position(ids,null) is not null then raise exception 'students_required';end if;
 -- A draft retries exactly its original snapshot. Late joiners are explicit, only on open assignments.
 if a.status='draft' and p_students is not null and (not(ids @> link.student_ids) or not(link.student_ids @> ids)) then raise exception 'original_recipients_required';end if;
 if exists(select 1 from unnest(ids)s(id) where not exists(select 1 from private.ielts_course_batch_members m join public.users u on u.id=m.student_id where m.batch_id=b.id and m.student_id=s.id and m.left_at is null and u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id))) then raise exception 'batch_roster_needs_review';end if;
 -- Existing allocator retains publication/originality and per-item triggers; ON CONFLICT preserves saved work.
 perform public.rpc_ielts_practice_assign_to_students(a.id,ids);
 insert into private.ielts_course_batch_events(batch_id,actor_id,action,detail) values(b.id,auth.uid(),'assignment_allocated',jsonb_build_object('assignment_id',a.id,'student_ids',ids));
 return public.ielts_practice_assignment_payload(a.id);
end; $$;

CREATE OR REPLACE FUNCTION public.rpc_ielts_practice_content_catalog_with_provenance(p_skill text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(content_type text, content_id text, title text, skill text, description text, difficulty text, band text, display_code text, originality_label text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with normalized as (
    select
      lower(nullif(trim(p_skill), '')) as requested_skill,
      nullif(trim(p_search), '') as requested_search,
      greatest(1, least(coalesce(p_limit, 50), 100)) as requested_limit
  ), catalog as (
    select
      'ielts_reading_set'::text as content_type,
      r.id::text as content_id,
      coalesce(nullif(r.title, ''), r.slug, 'Reading set ' || r.id::text)::text as title,
      'reading'::text as skill,
      nullif(left(coalesce(r.description, ''), 240), '')::text as description,
      nullif(r.level, '')::text as difficulty,
      case
        when r.est_band_min is not null and r.est_band_max is not null then r.est_band_min::text || '-' || r.est_band_max::text
        when r.est_band_min is not null then r.est_band_min::text || '+'
        when r.est_band_max is not null then 'Up to ' || r.est_band_max::text
        else null
      end::text as band,
      r.created_at,
      r.display_code,
      coalesce(r.originality_label,'Existing material') originality_label
    from public.ielts_reading_sets r
    where r.is_active is true

    union all

    select
      'ielts_listening_set'::text,
      l.id::text,
      coalesce(nullif(l.title, ''), l.slug, 'Listening set ' || l.id::text)::text,
      'listening'::text,
      nullif(left(coalesce(l.description, ''), 240), '')::text,
      nullif(l.level, '')::text,
      case
        when l.est_band_min is not null and l.est_band_max is not null then l.est_band_min::text || '-' || l.est_band_max::text
        when l.est_band_min is not null then l.est_band_min::text || '+'
        when l.est_band_max is not null then 'Up to ' || l.est_band_max::text
        else null
      end::text,
      l.created_at,
      l.display_code,
      coalesce(l.originality_label,'Existing material') originality_label
    from public.ielts_listening_sets l
    where l.is_active is true
      and nullif(trim(coalesce(l.audio_url, '')), '') is not null
      and exists (
        select 1
        from public.ielts_listening_questions q
        where q.set_id = l.id
      )

    union all

    select
      'ielts_writing_task'::text,
      w.id::text,
      coalesce(nullif(w.title, ''), w.slug, 'Writing ' || coalesce(w.task_type, 'task') || ' ' || w.id::text)::text,
      'writing'::text,
      nullif(left(coalesce(w.prompt, ''), 240), '')::text,
      nullif(w.task_type, '')::text,
      nullif(w.bands_target, '')::text,
      w.created_at,
      w.display_code,
      coalesce(w.originality_label,'Existing material') originality_label
    from public.ielts_writing_tasks w
    where w.is_active is true

    union all

    select
      'ielts_speaking_task'::text,
      s.id::text,
      coalesce(s.slug, 'Speaking part ' || s.part::text || ' task ' || s.id::text)::text,
      'speaking'::text,
      nullif(left(coalesce(s.prompt, ''), 240), '')::text,
      ('part ' || s.part::text)::text,
      null::text,
      s.created_at,
      s.display_code,
      coalesce(s.originality_label,'Existing material') originality_label
    from public.ielts_speaking_tasks s
    where s.is_active is true
  )
  select
    c.content_type,
    c.content_id,
    c.title,
    c.skill,
    c.description,
    c.difficulty,
    c.band,
    c.display_code,
    c.originality_label
  from catalog c
  cross join normalized n
  where c.originality_label is not null and public.ielts_practice_material_assignable(c.content_type,c.content_id)
    and (n.requested_skill is null or c.skill = n.requested_skill)
    and (n.requested_search is null or (c.title ilike '%' || n.requested_search || '%' or c.display_code ilike '%' || n.requested_search || '%'))
  order by c.created_at desc nulls last, c.title asc
  limit (select requested_limit from normalized);
$function$;
create or replace function public.rpc_ielts_practice_content_catalog(p_skill text default null,p_search text default null,p_limit integer default 50) returns table(content_type text,content_id text,title text,skill text,description text,difficulty text,band text) language sql stable set search_path='' as $$select content_type,content_id,title,skill,description,difficulty,band from public.rpc_ielts_practice_content_catalog_with_provenance(p_skill,p_search,p_limit);$$;
create or replace function public.rpc_ielts_practice_content_catalog_with_codes(p_skill text default null,p_search text default null,p_limit integer default 50) returns table(content_type text,content_id text,title text,skill text,description text,difficulty text,band text,display_code text) language sql stable set search_path='' as $$select content_type,content_id,title,skill,description,difficulty,band,display_code from public.rpc_ielts_practice_content_catalog_with_provenance(p_skill,p_search,p_limit);$$;

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
 from private.ielts_learning_tasks t where manager and private.ielts_practice_material_allowed('targeted',t.code) and (private.ielts_learning_publicly_released(t.code) or exists(select 1 from public.school_members where school_id=p_school and user_id=t.pilot_student and status='active'));
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]') into allocations from (
 select a.created_at,jsonb_build_object('id',a.id,'task_code',a.task_code,'student_id',a.student_id,'assigned_at',a.created_at,'title',t.title,'display_code',private.ielts_material_code('targeted',t.code),'originality_label',private.ielts_originality_label('targeted',t.code),'skill',t.skill,'purpose',t.purpose,'status',a.status,'student_name',u.username,'reason',a.reason,'due_at',a.due_at,'reviewed',exists(select 1 from private.ielts_learning_reviews r where r.allocation_id=a.id)) item
 from private.ielts_learning_allocations a join private.ielts_learning_tasks t on t.code=a.task_code join public.users u on u.id=a.student_id
 where ((manager and a.school_id=p_school) or (not manager and a.student_id=auth.uid())) and private.can_access_ielts_learning(a.id)
 order by a.created_at desc,a.id limit 50) x;
 return jsonb_build_object('tasks',tasks,'allocations',allocations,'manager',manager,'pilot_only',not exists(select 1 from private.ielts_learning_tasks t where private.ielts_learning_publicly_released(t.code)));
end; $function$;
revoke all on function private.ielts_practice_signals(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ielts_capture_screener_signals() from public,anon,authenticated,service_role;
revoke all on function private.ielts_practice_material_allowed(text,text) from public,anon,authenticated,service_role;
revoke all on function private.ielts_practice_assignment_boundary() from public,anon,authenticated,service_role;
revoke all on function private.ielts_batch_practice_source(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.ielts_batch_assert(uuid) from public,anon,authenticated,service_role;
revoke all on function public.ielts_practice_material_assignable(text,text) from public,anon,authenticated,service_role;
grant execute on function public.ielts_practice_material_assignable(text,text) to authenticated;
revoke all on function public.rpc_ielts_batch_lifecycle(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_lifecycle(uuid,integer,text) to authenticated;
revoke all on function public.rpc_ielts_batch_practice_preview(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_practice_preview(uuid,text) to authenticated;
revoke all on function public.rpc_ielts_batch_assign_practice(uuid,integer,text,uuid[],text,timestamptz,uuid,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_assign_practice(uuid,integer,text,uuid[],text,timestamptz,uuid,boolean,boolean) to authenticated;
revoke all on function public.rpc_ielts_batches(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batches(uuid) to authenticated;
revoke all on function public.rpc_ielts_batch_save(uuid,text,uuid[],uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_save(uuid,text,uuid[],uuid,integer) to authenticated;
revoke all on function public.rpc_ielts_batch_roster(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_roster(uuid,text,integer) to authenticated;
revoke all on function public.rpc_ielts_batch_create_assignment(uuid,integer,uuid,text,text,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_create_assignment(uuid,integer,uuid,text,text,timestamptz,jsonb) to authenticated;
revoke all on function public.rpc_ielts_batch_allocate(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_allocate(uuid,uuid[]) to authenticated;
revoke all on function public.rpc_ielts_learning_workspace(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_workspace(uuid) to authenticated;
