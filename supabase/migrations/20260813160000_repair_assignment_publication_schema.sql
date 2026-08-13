-- Compatibility repair for a partially deployed assignment-publication release.
--
-- Production had the later verified-question RPCs, but not the columns and
-- teacher-management contract on which those RPCs depend. Restore only that
-- missing foundation. Deliberately do not replace the newer student read or
-- submission RPCs from 20260812110000_verified_question_authority.sql.
alter table public.assignments
  add column if not exists publish_status text not null default 'published',
  add column if not exists close_submissions_after_due boolean not null default false,
  add column if not exists notify_students_by_email boolean not null default false,
  add column if not exists published_at timestamptz;

alter table public.student_assignment_results
  add column if not exists submitted_late boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_publish_status_check') then
    alter table public.assignments add constraint assignments_publish_status_check check (publish_status in ('draft','scheduled','published'));
  end if;
end $$;

update public.assignments set published_at = coalesce(published_at, assigned_at, created_at) where publish_status = 'published' and published_at is null;

create table if not exists public.assignment_email_notifications (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  available_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','sent','cancelled','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (assignment_id, student_id)
);
alter table public.assignment_email_notifications enable row level security;
revoke all on table public.assignment_email_notifications from anon, authenticated;

create table if not exists public.assignment_change_audit (
  id bigserial primary key,
  assignment_id uuid,
  actor_user_id uuid not null,
  action text not null,
  affected_student_ids uuid[] not null default '{}',
  affected_question_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.assignment_change_audit enable row level security;
revoke all on table public.assignment_change_audit from anon, authenticated;

-- Replace create RPC with backwards-compatible optional arguments.
drop function if exists public.rpc_create_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,uuid[]);
create function public.rpc_create_assignment(
  p_teacher_id uuid, p_subject_id text, p_subject_name text, p_topic_name text, p_batch text,
  p_question_ids uuid[], p_assigned_at timestamptz, p_due_at timestamptz, p_title text,
  p_instructions text, p_difficulty text, p_assignment_mode text default 'batch', p_student_ids uuid[] default null,
  p_description text default null, p_publish_status text default 'published',
  p_close_submissions_after_due boolean default false, p_notify_students_by_email boolean default false
) returns public.assignments language plpgsql security definer set search_path=public,pg_temp as $$
declare
  new_assignment public.assignments; v_actor uuid := auth.uid(); v_teacher_user_id uuid; v_teacher_school_id uuid;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if coalesce(array_length(p_question_ids,1),0)=0 then raise exception 'Assignment must include at least one question'; end if;
  if p_publish_status not in ('draft','scheduled','published') then raise exception 'Invalid publish status'; end if;
  if p_publish_status='scheduled' and (p_assigned_at is null or p_assigned_at <= now()) then raise exception 'Scheduled publication must be in the future'; end if;
  select t.user_id,u.school_id into v_teacher_user_id,v_teacher_school_id from public.teachers t join public.users u on u.id=t.user_id where t.id=p_teacher_id;
  if v_teacher_user_id is null then raise exception 'Teacher record not found'; end if;
  if v_teacher_user_id<>v_actor and not exists(select 1 from public.users u where u.id=v_actor and (u.role in ('admin','school_admin') or coalesce(u.is_admin,false))) then raise exception 'Not authorized'; end if;
  insert into public.assignments(teacher_id,subject_id,subject_name,topic_name,batch,difficulty,title,description,instructions,assigned_at,due_at,assignment_mode,publish_status,close_submissions_after_due,notify_students_by_email,published_at)
  values(p_teacher_id,p_subject_id,p_subject_name,p_topic_name,case when p_assignment_mode='custom' then null else p_batch end,p_difficulty,p_title,p_description,p_instructions,coalesce(p_assigned_at,now()),p_due_at,coalesce(p_assignment_mode,'batch'),p_publish_status,coalesce(p_close_submissions_after_due,false),coalesce(p_notify_students_by_email,false),case when p_publish_status='published' then now() else null end)
  returning * into new_assignment;
  insert into public.assignment_questions(assignment_id,question_id,order_index) select new_assignment.id,qid,row_number() over() from unnest(p_question_ids) qid;
  if p_assignment_mode='custom' then
    insert into public.student_assignments(assignment_id,student_id,batch,status,assigned_at,due_at)
    select new_assignment.id,u.id,u.batch,'pending',new_assignment.assigned_at,new_assignment.due_at from public.users u
    where u.id=any(coalesce(p_student_ids,'{}'::uuid[])) and coalesce(u.role,'student')='student' and not coalesce(u.is_banned,false)
      and exists(select 1 from public.class_teacher_assignments cta join public.class_students cs on cs.class_id=cta.class_id join public.classes c on c.id=cta.class_id where cta.teacher_user_id=v_teacher_user_id and cta.active and cs.student_id=u.id and (v_teacher_school_id is null or c.school_id=v_teacher_school_id));
  else
    insert into public.student_assignments(assignment_id,student_id,batch,status,assigned_at,due_at)
    select new_assignment.id,u.id,u.batch,'pending',new_assignment.assigned_at,new_assignment.due_at from public.users u
    where coalesce(u.role,'student')='student' and not coalesce(u.is_banned,false)
      and exists(select 1 from public.class_teacher_assignments cta join public.class_students cs on cs.class_id=cta.class_id join public.classes c on c.id=cta.class_id where cta.teacher_user_id=v_teacher_user_id and cta.active and cs.student_id=u.id and (p_batch='All' or u.batch=p_batch) and (v_teacher_school_id is null or c.school_id=v_teacher_school_id));
  end if;
  insert into public.assignment_students(assignment_id,student_id) select new_assignment.id,sa.student_id from public.student_assignments sa where sa.assignment_id=new_assignment.id on conflict do nothing;
  if new_assignment.notify_students_by_email and new_assignment.publish_status<>'draft' then
    insert into public.assignment_email_notifications(assignment_id,student_id,available_at) select new_assignment.id,sa.student_id,new_assignment.assigned_at from public.student_assignments sa where sa.assignment_id=new_assignment.id on conflict(assignment_id,student_id) do update set available_at=excluded.available_at,status='pending';
  end if;
  return new_assignment;
end $$;
revoke all on function public.rpc_create_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,uuid[],text,text,boolean,boolean) from public;
grant execute on function public.rpc_create_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,uuid[],text,text,boolean,boolean) to authenticated;

create or replace function public.rpc_update_teacher_assignment(
  p_assignment_id uuid, p_subject_id text, p_subject_name text, p_topic_name text, p_batch text,
  p_question_ids uuid[], p_assigned_at timestamptz, p_due_at timestamptz, p_title text, p_description text,
  p_instructions text, p_difficulty text, p_assignment_mode text, p_student_ids uuid[], p_publish_status text,
  p_close_submissions_after_due boolean, p_notify_students_by_email boolean
) returns public.assignments language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_assignment public.assignments; v_teacher_user_id uuid; v_teacher_school_id uuid;
  v_old_students uuid[]; v_new_students uuid[]; v_removed_students uuid[]; v_old_questions uuid[]; v_removed_questions uuid[]; v_content_changed boolean; v_focus record;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select a,t.user_id,u.school_id into v_assignment,v_teacher_user_id,v_teacher_school_id from public.assignments a join public.teachers t on t.id=a.teacher_id join public.users u on u.id=t.user_id where a.id=p_assignment_id;
  if v_assignment.id is null or v_teacher_user_id<>v_actor then raise exception 'Assignment not found or you are not its creator'; end if;
  if coalesce(array_length(p_question_ids,1),0)=0 then raise exception 'Assignment must include at least one question'; end if;
  if p_publish_status not in ('draft','scheduled','published') then raise exception 'Invalid publish status'; end if;
  if p_publish_status='scheduled' and p_assigned_at<=now() then raise exception 'Scheduled publication must be in the future'; end if;
  select coalesce(array_agg(student_id),'{}'::uuid[]) into v_old_students from public.student_assignments where assignment_id=p_assignment_id;
  select coalesce(array_agg(question_id order by order_index),'{}'::uuid[]) into v_old_questions from public.assignment_questions where assignment_id=p_assignment_id;
  if p_assignment_mode='custom' then
    select coalesce(array_agg(u.id),'{}'::uuid[]) into v_new_students from public.users u where u.id=any(coalesce(p_student_ids,'{}'::uuid[])) and coalesce(u.role,'student')='student' and not coalesce(u.is_banned,false)
      and exists(select 1 from public.class_teacher_assignments cta join public.class_students cs on cs.class_id=cta.class_id join public.classes c on c.id=cta.class_id where cta.teacher_user_id=v_teacher_user_id and cta.active and cs.student_id=u.id and (v_teacher_school_id is null or c.school_id=v_teacher_school_id));
  else
    select coalesce(array_agg(u.id),'{}'::uuid[]) into v_new_students from public.users u where coalesce(u.role,'student')='student' and not coalesce(u.is_banned,false)
      and exists(select 1 from public.class_teacher_assignments cta join public.class_students cs on cs.class_id=cta.class_id join public.classes c on c.id=cta.class_id where cta.teacher_user_id=v_teacher_user_id and cta.active and cs.student_id=u.id and (p_batch='All' or u.batch=p_batch) and (v_teacher_school_id is null or c.school_id=v_teacher_school_id));
  end if;
  select coalesce(array_agg(x),'{}'::uuid[]) into v_removed_students from unnest(v_old_students) x where not(x=any(v_new_students));
  select coalesce(array_agg(x),'{}'::uuid[]) into v_removed_questions from unnest(v_old_questions) x where not(x=any(p_question_ids));
  v_content_changed := v_old_questions is distinct from p_question_ids;

  -- Remove academic history for students no longer assigned.
  if coalesce(array_length(v_removed_students,1),0)>0 then
    for v_focus in select distinct student_id,skill_key from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id and student_id=any(v_removed_students) loop
      delete from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id and student_id=v_focus.student_id and skill_key=v_focus.skill_key;
      perform public.student_learning_refresh_focus_state(v_focus.student_id,v_focus.skill_key);
    end loop;
    delete from public.student_assignment_analyses where assignment_id=p_assignment_id and student_id=any(v_removed_students);
    delete from public.student_assignment_answers where assignment_id=p_assignment_id and student_id=any(v_removed_students);
    delete from public.student_assignment_results where assignment_id=p_assignment_id and student_id=any(v_removed_students);
    delete from public.student_assignments where assignment_id=p_assignment_id and student_id=any(v_removed_students);
    delete from public.assignment_students where assignment_id=p_assignment_id and student_id=any(v_removed_students);
  end if;

  -- If academic content changes, previous results no longer describe the same assessment.
  -- Clear assignment-generated evidence and attempts for remaining students and reset them.
  if v_content_changed then
    for v_focus in select distinct student_id,skill_key from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id loop
      delete from public.student_learning_observations where source_type='assignment' and source_id=p_assignment_id and student_id=v_focus.student_id and skill_key=v_focus.skill_key;
      perform public.student_learning_refresh_focus_state(v_focus.student_id,v_focus.skill_key);
    end loop;
    delete from public.student_assignment_analyses where assignment_id=p_assignment_id;
    delete from public.student_assignment_answers where assignment_id=p_assignment_id;
    delete from public.student_assignment_results where assignment_id=p_assignment_id;
    update public.student_assignments set status='pending',completed_at=null where assignment_id=p_assignment_id;
    delete from public.assignment_questions where assignment_id=p_assignment_id;
    insert into public.assignment_questions(assignment_id,question_id,order_index) select p_assignment_id,qid,row_number() over() from unnest(p_question_ids) qid;
  end if;

  insert into public.student_assignments(assignment_id,student_id,batch,status,assigned_at,due_at)
  select p_assignment_id,u.id,u.batch,'pending',p_assigned_at,p_due_at from public.users u where u.id=any(v_new_students)
    and not exists(select 1 from public.student_assignments sa where sa.assignment_id=p_assignment_id and sa.student_id=u.id);
  insert into public.assignment_students(assignment_id,student_id) select p_assignment_id,x from unnest(v_new_students) x on conflict do nothing;
  update public.student_assignments sa set batch=u.batch,assigned_at=p_assigned_at,due_at=p_due_at from public.users u where sa.assignment_id=p_assignment_id and sa.student_id=u.id;

  update public.assignments set subject_id=p_subject_id,subject_name=p_subject_name,topic_name=p_topic_name,batch=case when p_assignment_mode='custom' then null else p_batch end,difficulty=p_difficulty,title=p_title,description=p_description,instructions=p_instructions,assigned_at=p_assigned_at,due_at=p_due_at,assignment_mode=p_assignment_mode,publish_status=p_publish_status,close_submissions_after_due=coalesce(p_close_submissions_after_due,false),notify_students_by_email=coalesce(p_notify_students_by_email,false),published_at=case when p_publish_status='published' then coalesce(published_at,now()) else null end,updated_at=now() where id=p_assignment_id returning * into v_assignment;

  delete from public.assignment_email_notifications where assignment_id=p_assignment_id;
  if v_assignment.notify_students_by_email and v_assignment.publish_status<>'draft' then
    insert into public.assignment_email_notifications(assignment_id,student_id,available_at) select p_assignment_id,sa.student_id,v_assignment.assigned_at from public.student_assignments sa where sa.assignment_id=p_assignment_id;
  end if;
  insert into public.assignment_change_audit(assignment_id,actor_user_id,action,affected_student_ids,affected_question_ids) values(p_assignment_id,v_actor,'update',v_removed_students,v_removed_questions);
  return v_assignment;
end $$;
revoke all on function public.rpc_update_teacher_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,text,uuid[],text,boolean,boolean) from public;
grant execute on function public.rpc_update_teacher_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,text,uuid[],text,boolean,boolean) to authenticated;

-- Teacher list now includes editable audience/content/publication data.
drop function if exists public.rpc_get_assignments_for_teacher(uuid);
create function public.rpc_get_assignments_for_teacher(p_teacher_id uuid)
returns table(id uuid,teacher_id uuid,subject_id text,subject_name text,topic_name text,batch text,difficulty text,title text,instructions text,assigned_at timestamptz,due_at timestamptz,created_at timestamptz,updated_at timestamptz,question_count integer,completed_count integer,student_count integer,assignment_mode text,description text,publish_status text,close_submissions_after_due boolean,notify_students_by_email boolean,published_at timestamptz,question_ids uuid[],student_ids uuid[])
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 return query select a.id,a.teacher_id,a.subject_id,a.subject_name,a.topic_name,a.batch,a.difficulty,a.title,a.instructions,a.assigned_at,a.due_at,a.created_at,a.updated_at,
 (select count(*)::int from public.assignment_questions aq where aq.assignment_id=a.id),(select count(*)::int from public.student_assignments sa where sa.assignment_id=a.id and sa.status='completed'),(select count(*)::int from public.student_assignments sa where sa.assignment_id=a.id),coalesce(a.assignment_mode,'batch'),a.description,a.publish_status,a.close_submissions_after_due,a.notify_students_by_email,a.published_at,
 (select coalesce(array_agg(aq.question_id order by aq.order_index),'{}'::uuid[]) from public.assignment_questions aq where aq.assignment_id=a.id),(select coalesce(array_agg(sa.student_id),'{}'::uuid[]) from public.student_assignments sa where sa.assignment_id=a.id)
 from public.assignments a where a.teacher_id=p_teacher_id and exists(select 1 from public.teachers t where t.id=p_teacher_id and t.user_id=auth.uid()) order by a.assigned_at desc;
end $$;
revoke all on function public.rpc_get_assignments_for_teacher(uuid) from public;
grant execute on function public.rpc_get_assignments_for_teacher(uuid) to authenticated;
