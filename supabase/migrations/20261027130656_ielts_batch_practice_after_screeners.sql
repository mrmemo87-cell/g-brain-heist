-- Whole-batch targeted practice. A teacher can assign a released task to every batch member at once:
-- students who have finished the Listening, Reading and Writing screeners (and whose starting evidence for the
-- task's skill is ready) get the task now; everyone else gets a waiting entry that becomes their task only after
-- those three screeners are done. The Speaking interview is not part of this gate.
-- Waiting entries are invisible to students and are released through the same checks the allocator applies.

create table private.ielts_learning_deferred_allocations (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 batch_id uuid not null references private.ielts_course_batches(id),
 school_id uuid not null references public.schools(id),
 student_id uuid not null references public.users(id),
 task_code text not null references private.ielts_learning_tasks(code),
 reason text not null check(length(trim(reason)) between 10 and 1200),
 due_at timestamptz,
 -- How long the student had to do the task when it was assigned; a student who unlocks it after the due date gets the same window from that moment.
 due_window interval,
 repeat_confirmed boolean not null default false,
 teacher_id uuid not null references public.users(id),
 status text not null default 'waiting' check(status in ('waiting','released','cancelled')),
 allocation_id uuid references private.ielts_learning_allocations(id),
 note text,
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 unique(request_id,student_id)
);
create unique index ielts_learning_deferred_one_waiting on private.ielts_learning_deferred_allocations(student_id,task_code) where status='waiting';
create index ielts_learning_deferred_batch on private.ielts_learning_deferred_allocations(batch_id,task_code) where status='waiting';
alter table private.ielts_learning_deferred_allocations enable row level security;
revoke all on private.ielts_learning_deferred_allocations from public,anon,authenticated;

-- A screener counts as done once the student has submitted it (listening/reading/writing). Speaking is not required.
create function private.ielts_screeners_done(p_school uuid,p_student uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_object_agg(s.skill,exists(
  select 1 from private.ielts_diagnostic_attempt_evidence e join public.ielts_exam_attempts a on a.id=e.attempt_id
  join private.ielts_diagnostic_versions v on v.id=e.version_id
  where e.student_id=p_student and e.school_id=p_school and s.skill=any(v.skills) and a.status in ('submitted','auto_submitted')))
 from unnest(array['listening','reading','writing']) s(skill);
$$;
create function private.ielts_screeners_all_done(p_school uuid,p_student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from jsonb_each(private.ielts_screeners_done(p_school,p_student)) x where x.value<>'true'::jsonb);
$$;
revoke all on function private.ielts_screeners_done(uuid,uuid) from public,anon,authenticated;
revoke all on function private.ielts_screeners_all_done(uuid,uuid) from public,anon,authenticated;

-- Releases a student's waiting entries whose conditions are now met. Runs the allocator's own checks on the stored
-- assignment (release, practice boundary, source evidence, exposure and duplicate guards); the insert triggers apply
-- the originality and practice-boundary gates again. Entries that can never be released are closed with a note.
create function private.ielts_learning_release_deferred(p_student uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.ielts_learning_deferred_allocations; task private.ielts_learning_tasks; src uuid; due timestamptz; new_id uuid; released int:=0; v_note text;
begin
 for d in select * from private.ielts_learning_deferred_allocations where student_id=p_student and status='waiting' order by created_at,id for update skip locked loop
  v_note:=null;
  select * into task from private.ielts_learning_tasks where code=d.task_code;
  if exists(select 1 from private.ielts_course_batches b where b.id=d.batch_id and (b.archived_at is not null or b.deleted_at is not null)) then v_note:='batch_closed';
  elsif not exists(select 1 from private.ielts_course_batch_members m where m.batch_id=d.batch_id and m.student_id=p_student and m.left_at is null) then v_note:='left_batch';
  elsif not private.ielts_learning_publicly_released(d.task_code) or not private.ielts_practice_material_allowed('targeted',d.task_code) then v_note:='task_withdrawn';
  elsif exists(select 1 from private.ielts_learning_allocations a where a.student_id=p_student and a.task_code=d.task_code and a.status in ('assigned','in_progress')) then v_note:='already_assigned';
  elsif task.purpose='independent_check' and exists(select 1 from private.ielts_learning_allocations a where a.student_id=p_student and a.task_code=d.task_code) then v_note:='independent_check_already_exposed';
  end if;
  if v_note is not null then
   update private.ielts_learning_deferred_allocations set status='cancelled',note=v_note,resolved_at=now() where id=d.id;
   continue;
  end if;
  -- Still waiting: not eligible right now, screeners unfinished, or starting evidence for this skill not ready yet.
  if not private.ielts_speaking_student_eligible(p_student) or not exists(select 1 from public.school_members where school_id=d.school_id and user_id=p_student and status='active') then continue; end if;
  if not private.ielts_screeners_all_done(d.school_id,p_student) then continue; end if;
  src:=private.ielts_batch_practice_source(d.school_id,p_student,task.skill);
  if src is null then continue; end if;
  if task.purpose='guided_practice' and not d.repeat_confirmed and exists(select 1 from private.ielts_learning_allocations a where a.student_id=p_student and a.task_code=d.task_code) then
   update private.ielts_learning_deferred_allocations set status='cancelled',note='repeat_not_confirmed',resolved_at=now() where id=d.id;
   continue;
  end if;
  due:=case when d.due_at is null then null when d.due_at>now()+interval '1 day' then d.due_at else now()+greatest(coalesce(d.due_window,interval '7 days'),interval '1 day') end;
  begin
   insert into private.ielts_learning_allocations(school_id,student_id,task_code,source_attempt_id,source_speaking_session_id,reason,teacher_id,request_id,due_at)
   values(d.school_id,p_student,d.task_code,case when task.skill<>'speaking' then src end,case when task.skill='speaking' then src end,d.reason,d.teacher_id,md5('deferred:'||d.id::text)::uuid,due)
   returning id into new_id;
  exception when others then
   update private.ielts_learning_deferred_allocations set status='cancelled',note=left('not_released: '||sqlerrm,300),resolved_at=now() where id=d.id;
   continue;
  end;
  update private.ielts_learning_deferred_allocations set status='released',allocation_id=new_id,resolved_at=now() where id=d.id;
  insert into private.ielts_course_batch_events(batch_id,actor_id,action,detail) values(d.batch_id,d.teacher_id,'practice_released_after_screeners',jsonb_build_object('deferred_id',d.id,'task_code',d.task_code,'student_id',p_student,'allocation_id',new_id));
  released:=released+1;
 end loop;
 return jsonb_build_object('released',released,'waiting',(select count(*) from private.ielts_learning_deferred_allocations where student_id=p_student and status='waiting'));
end; $$;
revoke all on function private.ielts_learning_release_deferred(uuid) from public,anon,authenticated;

-- Student call before reading their work: unlocks anything their teacher queued for them once their screeners are done.
create function public.rpc_ielts_learning_claim_deferred() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authorized'; end if;
 if not exists(select 1 from private.ielts_learning_deferred_allocations where student_id=auth.uid() and status='waiting') then
  return jsonb_build_object('released',0,'waiting',0);
 end if;
 return private.ielts_learning_release_deferred(auth.uid());
end; $$;
revoke all on function public.rpc_ielts_learning_claim_deferred() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_learning_claim_deferred() to authenticated;

-- Whole-batch assignment: ready students are allocated now through the canonical allocator; the rest wait for their screeners.
create function public.rpc_ielts_batch_assign_practice_after_screeners(p_batch uuid,p_revision integer,p_task text,p_students uuid[],p_reason text,p_due timestamptz,p_request uuid,p_repeat boolean default false,p_reviewed boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches; ids uuid[]; student uuid; source uuid; task private.ielts_learning_tasks; result uuid[]:='{}'; waiting uuid[]:='{}'; payload jsonb; existing private.ielts_batch_practice_requests;
begin
 b:=private.ielts_batch_assert(p_batch);
 if not coalesce(p_reviewed,false) then raise exception 'review_selected_source_evidence';end if;
 if p_request is null or p_students is null or cardinality(p_students) not between 1 and 500 or array_position(p_students,null) is not null then raise exception 'students_required';end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 1200 or p_due<=now() then raise exception 'assignment_details_required';end if;
 select array_agg(distinct x order by x) into ids from unnest(p_students)x;
 payload:=jsonb_build_object('mode','after_screeners','task',p_task,'students',ids,'reason',p_reason,'due',p_due,'repeat',p_repeat,'source_review_confirmed',p_reviewed);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into existing from private.ielts_batch_practice_requests where request_id=p_request;
 if found then
  if existing.batch_id<>b.id or existing.actor_id<>auth.uid() or existing.payload<>payload then raise exception 'request_conflict';end if;
  return jsonb_build_object('allocation_ids',existing.allocation_ids,'assigned_count',cardinality(existing.allocation_ids),
   'waiting_count',(select count(*) from private.ielts_learning_deferred_allocations where request_id=p_request));
 end if;
 select * into b from private.ielts_course_batches where id=p_batch for update;
 if b.revision is distinct from p_revision or b.archived_at is not null then raise exception 'batch_changed_refresh';end if;
 select * into task from private.ielts_learning_tasks where code=p_task and private.ielts_learning_publicly_released(code) and private.ielts_practice_material_allowed('targeted',code);
 if task.code is null then raise exception 'released_practice_required';end if;
 foreach student in array ids loop
  if not exists(select 1 from private.ielts_course_batch_members where batch_id=b.id and student_id=student and left_at is null) or not exists(select 1 from public.users where id=student and school_id=b.school_id and private.ielts_speaking_student_eligible(id)) then raise exception 'student_not_in_batch';end if;
  if exists(select 1 from private.ielts_learning_allocations a where a.student_id=student and a.task_code=task.code and a.status in ('assigned','in_progress')) then raise exception 'existing_active_practice';end if;
  if exists(select 1 from private.ielts_learning_deferred_allocations d where d.student_id=student and d.task_code=task.code and d.status='waiting') then raise exception 'existing_waiting_practice';end if;
  if task.purpose='independent_check' and exists(select 1 from private.ielts_learning_allocations a where a.student_id=student and a.task_code=task.code) then raise exception 'independent_check_already_exposed';end if;
  if not coalesce(p_repeat,false) and task.purpose='guided_practice' and exists(select 1 from private.ielts_learning_allocations a where a.student_id=student and a.task_code=task.code) then raise exception 'intentional_repeat_required';end if;
  source:=private.ielts_batch_practice_source(b.school_id,student,task.skill);
  if source is not null and private.ielts_screeners_all_done(b.school_id,student) then
   result:=array_append(result,public.rpc_ielts_learning_allocate(b.school_id,student,task.code,source,p_reason,p_due,md5(p_request::text||':'||student::text)::uuid));
  else
   insert into private.ielts_learning_deferred_allocations(request_id,batch_id,school_id,student_id,task_code,reason,due_at,due_window,repeat_confirmed,teacher_id)
   values(p_request,b.id,b.school_id,student,task.code,p_reason,p_due,case when p_due is not null then p_due-now() end,coalesce(p_repeat,false),auth.uid());
   waiting:=array_append(waiting,student);
  end if;
 end loop;
 insert into private.ielts_batch_practice_requests(request_id,batch_id,actor_id,payload,allocation_ids) values(p_request,b.id,auth.uid(),payload,result);
 insert into private.ielts_course_batch_events(batch_id,actor_id,action,detail) values(b.id,auth.uid(),'practice_assigned',jsonb_build_object('request_id',p_request,'task_code',p_task,'student_ids',ids,'allocation_ids',result,'waiting_student_ids',waiting));
 return jsonb_build_object('allocation_ids',result,'assigned_count',cardinality(result),'waiting_count',cardinality(waiting));
end; $$;
revoke all on function public.rpc_ielts_batch_assign_practice_after_screeners(uuid,integer,text,uuid[],text,timestamptz,uuid,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_assign_practice_after_screeners(uuid,integer,text,uuid[],text,timestamptz,uuid,boolean,boolean) to authenticated;

-- Teacher withdraws a waiting entry before it unlocks.
create function public.rpc_ielts_batch_cancel_waiting_practice(p_batch uuid,p_task text,p_students uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare b private.ielts_course_batches; n integer;
begin
 b:=private.ielts_batch_assert(p_batch);
 if p_students is null or cardinality(p_students) not between 1 and 500 then raise exception 'students_required';end if;
 update private.ielts_learning_deferred_allocations set status='cancelled',note='withdrawn_by_teacher',resolved_at=now()
 where batch_id=b.id and task_code=p_task and student_id=any(p_students) and status='waiting';
 get diagnostics n=row_count;
 if n>0 then insert into private.ielts_course_batch_events(batch_id,actor_id,action,detail) values(b.id,auth.uid(),'waiting_practice_withdrawn',jsonb_build_object('task_code',p_task,'student_ids',p_students,'count',n)); end if;
 return n;
end; $$;
revoke all on function public.rpc_ielts_batch_cancel_waiting_practice(uuid,text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_batch_cancel_waiting_practice(uuid,text,uuid[]) to authenticated;

-- Preview now reports each student's screener progress and any waiting entry for the chosen task.
create or replace function public.rpc_ielts_batch_practice_preview(p_batch uuid,p_task text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 'screeners',private.ielts_screeners_done(b.school_id,u.id),
 'prior_count',(select count(*) from private.ielts_learning_allocations a where a.student_id=u.id and a.task_code=task.code),
 'active',exists(select 1 from private.ielts_learning_allocations a where a.student_id=u.id and a.task_code=task.code and a.status in ('assigned','in_progress')),
 'waiting',exists(select 1 from private.ielts_learning_deferred_allocations d where d.student_id=u.id and d.task_code=task.code and d.status='waiting'),
 'eligible',u.school_id=b.school_id and private.ielts_speaking_student_eligible(u.id)) order by u.username,u.id),'[]') into students
 from private.ielts_course_batch_members m join public.users u on u.id=m.student_id where m.batch_id=b.id and m.left_at is null;
 return jsonb_build_object('batch',jsonb_build_object('id',b.id,'name',b.name,'revision',b.revision),'tasks',tasks,'students',students);
end; $$;
revoke all on function public.rpc_ielts_batch_practice_preview(uuid,text) from public,anon,service_role;
grant execute on function public.rpc_ielts_batch_practice_preview(uuid,text) to authenticated;
