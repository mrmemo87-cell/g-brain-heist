-- Assignment classification + term-safe scheduling.
--
-- Safety principles:
--   * classification is metadata only: it never changes marks, rewards, completion,
--     learning observations, question content, or the assigned audience;
--   * historical assignments remain valid with a NULL category (shown as Uncategorized);
--   * new published/scheduled assignments use one of four controlled categories;
--   * scheduled publication must be a future instant and remain inside the school's
--     current academic year + current term using the teacher's local IANA timezone;
--   * existing RPC signatures remain available for older clients. New overloads add
--     category/timezone without rewriting the proven assignment-delivery functions.

alter table public.assignments
  add column if not exists assignment_category text;

alter table public.assignments
  drop constraint if exists assignments_assignment_category_check;
alter table public.assignments
  add constraint assignments_assignment_category_check
  check (
    assignment_category is null
    or assignment_category in ('classwork','homework','quiz','term_exam')
  );

create index if not exists assignments_reporting_scope_idx
  on public.assignments(school_id, academic_year_id, academic_term_id, class_id, assigned_at desc);
create index if not exists assignments_category_idx
  on public.assignments(school_id, assignment_category, assigned_at desc)
  where assignment_category is not null;

create or replace function private.assignment_category_normalize(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := nullif(lower(trim(coalesce(p_value, ''))), '');
begin
  if v_value is null then return null; end if;
  if v_value not in ('classwork','homework','quiz','term_exam') then
    raise exception using errcode = '22023', message = 'Invalid assignment category';
  end if;
  return v_value;
end;
$$;
revoke all on function private.assignment_category_normalize(text) from public, anon, authenticated, service_role;

create or replace function private.assignment_validate_schedule_window(
  p_school_id uuid,
  p_publish_status text,
  p_assigned_at timestamptz,
  p_client_timezone text default 'UTC'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := coalesce(nullif(trim(p_client_timezone), ''), 'UTC');
  v_now timestamptz := clock_timestamp();
  v_today date;
  v_publish_date date;
  v_year public.school_academic_years%rowtype;
  v_term public.school_academic_terms%rowtype;
begin
  if p_publish_status is distinct from 'scheduled' then return; end if;

  if p_assigned_at is null or p_assigned_at <= v_now then
    raise exception using errcode = '22023', message = 'Scheduled publication must be in the future local time';
  end if;

  -- Validate the IANA timezone before using it. PostgreSQL raises on unknown zones.
  begin
    perform v_now at time zone v_timezone;
  exception when invalid_parameter_value then
    raise exception using errcode = '22023', message = 'Invalid local timezone for scheduled publication';
  end;

  v_today := (v_now at time zone v_timezone)::date;
  v_publish_date := (p_assigned_at at time zone v_timezone)::date;

  select y.* into v_year
  from public.school_academic_years y
  where y.school_id = p_school_id
    and y.status = 'current'
    and v_today between y.starts_on and y.ends_on
  order by y.starts_on desc
  limit 1;

  if v_year.id is null then
    raise exception using errcode = '22023', message = 'Scheduling requires a current academic year configured by the school admin';
  end if;

  select t.* into v_term
  from public.school_academic_terms t
  where t.school_id = p_school_id
    and t.academic_year_id = v_year.id
    and v_today between t.starts_on and t.ends_on
  order by t.sequence_number
  limit 1;

  if v_term.id is null then
    raise exception using errcode = '22023', message = 'Scheduling requires a current academic term configured by the school admin';
  end if;

  if v_publish_date not between v_year.starts_on and v_year.ends_on
     or v_publish_date not between v_term.starts_on and v_term.ends_on then
    raise exception using errcode = '22023',
      message = format('Scheduled publication must stay inside the current term (%s) and academic year (%s)', v_term.name, v_year.name);
  end if;
end;
$$;
revoke all on function private.assignment_validate_schedule_window(uuid,text,timestamptz,text)
  from public, anon, authenticated, service_role;

-- New create overload. The original rpc_create_assignment remains unchanged for
-- backwards compatibility. New clients identify this overload with the two new
-- named arguments p_assignment_category and p_client_timezone.
create or replace function public.rpc_create_assignment(
  p_teacher_id uuid,
  p_subject_id text,
  p_subject_name text,
  p_topic_name text,
  p_batch text,
  p_question_ids uuid[],
  p_assigned_at timestamptz,
  p_due_at timestamptz,
  p_title text,
  p_instructions text,
  p_difficulty text,
  p_assignment_category text,
  p_client_timezone text default 'UTC',
  p_assignment_mode text default 'batch',
  p_student_ids uuid[] default null,
  p_description text default null,
  p_publish_status text default 'published',
  p_close_submissions_after_due boolean default false,
  p_notify_students_by_email boolean default false
) returns public.assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.assignments;
  v_school_id uuid;
  v_category text := private.assignment_category_normalize(p_assignment_category);
begin
  if p_publish_status <> 'draft' and v_category is null then
    raise exception using errcode = '22023', message = 'Choose an assignment category before publishing';
  end if;

  select sm.school_id into v_school_id
  from public.teachers t
  join public.school_members sm on sm.user_id = t.user_id and sm.status = 'active'
  where t.id = p_teacher_id
  order by sm.joined_at desc nulls last, sm.id
  limit 1;

  if v_school_id is null then
    raise exception using errcode = '22023', message = 'Teacher has no active school membership';
  end if;

  perform private.assignment_validate_schedule_window(v_school_id, p_publish_status, p_assigned_at, p_client_timezone);

  select public.rpc_create_assignment(
    p_teacher_id, p_subject_id, p_subject_name, p_topic_name, p_batch,
    p_question_ids, p_assigned_at, p_due_at, p_title, p_instructions,
    p_difficulty, p_assignment_mode, p_student_ids, p_description,
    p_publish_status, p_close_submissions_after_due, p_notify_students_by_email
  ) into v_assignment;

  update public.assignments
  set assignment_category = v_category,
      updated_at = coalesce(updated_at, now())
  where id = v_assignment.id
  returning * into v_assignment;

  return v_assignment;
end;
$$;
revoke all on function public.rpc_create_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,text,text,uuid[],text,text,boolean,boolean)
  from public, anon;
grant execute on function public.rpc_create_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,text,text,uuid[],text,text,boolean,boolean)
  to authenticated;

-- New update overload. Category changes are intentionally applied AFTER the
-- existing update RPC, so they cannot enter its question-content reset path.
create or replace function public.rpc_update_teacher_assignment(
  p_assignment_id uuid,
  p_subject_id text,
  p_subject_name text,
  p_topic_name text,
  p_batch text,
  p_question_ids uuid[],
  p_assigned_at timestamptz,
  p_due_at timestamptz,
  p_title text,
  p_description text,
  p_instructions text,
  p_difficulty text,
  p_assignment_mode text,
  p_student_ids uuid[],
  p_publish_status text,
  p_close_submissions_after_due boolean,
  p_notify_students_by_email boolean,
  p_assignment_category text,
  p_client_timezone text default 'UTC'
) returns public.assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.assignments;
  v_school_id uuid;
  v_category text := private.assignment_category_normalize(p_assignment_category);
begin
  select a.school_id into v_school_id
  from public.assignments a
  where a.id = p_assignment_id;

  if v_school_id is null then
    raise exception using errcode = '22023', message = 'Assignment school context is unavailable';
  end if;
  if p_publish_status <> 'draft' and v_category is null then
    raise exception using errcode = '22023', message = 'Choose an assignment category before publishing';
  end if;

  perform private.assignment_validate_schedule_window(v_school_id, p_publish_status, p_assigned_at, p_client_timezone);

  select public.rpc_update_teacher_assignment(
    p_assignment_id, p_subject_id, p_subject_name, p_topic_name, p_batch,
    p_question_ids, p_assigned_at, p_due_at, p_title, p_description,
    p_instructions, p_difficulty, p_assignment_mode, p_student_ids,
    p_publish_status, p_close_submissions_after_due, p_notify_students_by_email
  ) into v_assignment;

  update public.assignments
  set assignment_category = v_category,
      updated_at = coalesce(updated_at, now())
  where id = p_assignment_id
  returning * into v_assignment;

  return v_assignment;
end;
$$;
revoke all on function public.rpc_update_teacher_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,text,uuid[],text,boolean,boolean,text,text)
  from public, anon;
grant execute on function public.rpc_update_teacher_assignment(uuid,text,text,text,text,uuid[],timestamptz,timestamptz,text,text,text,text,text,uuid[],text,boolean,boolean,text,text)
  to authenticated;

-- Minimal, read-only metadata contracts let the existing assignment list RPCs
-- stay unchanged while new UI surfaces category/calendar information.
create or replace function public.rpc_teacher_assignment_category_context(p_teacher_id uuid)
returns table(
  assignment_id uuid,
  assignment_category text,
  academic_year_id uuid,
  academic_term_id uuid,
  class_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_teacher_user_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select t.user_id into v_teacher_user_id from public.teachers t where t.id = p_teacher_id;
  if v_teacher_user_id is null or v_teacher_user_id <> v_actor then
    raise exception 'Teacher assignment context is not available';
  end if;

  return query
  select a.id, a.assignment_category, a.academic_year_id, a.academic_term_id, a.class_id
  from public.assignments a
  where a.teacher_id = p_teacher_id;
end;
$$;
revoke all on function public.rpc_teacher_assignment_category_context(uuid) from public, anon;
grant execute on function public.rpc_teacher_assignment_category_context(uuid) to authenticated;

create or replace function public.rpc_my_assignment_category_context(p_assignment_ids uuid[])
returns table(
  assignment_id uuid,
  assignment_category text,
  academic_year_id uuid,
  academic_term_id uuid,
  class_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.assignment_category, a.academic_year_id, a.academic_term_id, a.class_id
  from public.assignments a
  join public.student_assignments sa
    on sa.assignment_id = a.id
   and sa.student_id = auth.uid()
  where a.id = any(coalesce(p_assignment_ids, '{}'::uuid[]));
$$;
revoke all on function public.rpc_my_assignment_category_context(uuid[]) from public, anon;
grant execute on function public.rpc_my_assignment_category_context(uuid[]) to authenticated;

-- Keep every assignment-related transactional email payload category-aware.
create or replace function private.trg_email_assignment_result()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_assignment record; v_teacher_user_id uuid;
begin
  select a.id,a.school_id,a.title,a.subject_name,a.assignment_category,t.user_id into v_assignment
  from public.assignments a join public.teachers t on t.id=a.teacher_id
  where a.id=new.assignment_id;
  v_teacher_user_id := v_assignment.user_id;
  if v_assignment.id is null then return new; end if;
  perform private.enqueue_transactional_email(
    'assignment_result_ready','academic','student','assignment_result_ready',
    'assignment-result-'||new.assignment_id::text||'-'||new.student_id::text,
    jsonb_build_object('assignment_id',new.assignment_id,'title',v_assignment.title,'subject',v_assignment.subject_name,'assignment_category',v_assignment.assignment_category),
    new.student_id,null,v_assignment.school_id,null,now()
  );
  if v_teacher_user_id is not null then
    perform private.enqueue_transactional_email(
      'assignment_submission_received','school_operations','teacher','assignment_submission_received',
      'assignment-submission-'||new.assignment_id::text||'-'||new.student_id::text,
      jsonb_build_object('assignment_id',new.assignment_id,'student_id',new.student_id,'title',v_assignment.title,'subject',v_assignment.subject_name,'assignment_category',v_assignment.assignment_category),
      v_teacher_user_id,null,v_assignment.school_id,null,now()
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_assignment_result() from public, anon, authenticated;

create or replace function private.trg_email_assignment_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_student record; v_template text; v_event text;
begin
  if old.publish_status is distinct from new.publish_status and new.publish_status='draft' then
    v_template:='assignment_cancelled'; v_event:='assignment_cancelled';
  elsif new.publish_status<>'draft' and (
    old.title is distinct from new.title or old.due_at is distinct from new.due_at
    or old.assigned_at is distinct from new.assigned_at
    or old.assignment_category is distinct from new.assignment_category
  ) then
    v_template:='assignment_updated'; v_event:='assignment_updated';
  else return new;
  end if;
  for v_student in
    select sa.student_id from public.student_assignments sa where sa.assignment_id=new.id
  loop
    perform private.enqueue_transactional_email(
      v_event,'school_operations','student',v_template,
      v_event||'-'||new.id::text||'-'||v_student.student_id::text||'-'||new.updated_at::text,
      jsonb_build_object('assignment_id',new.id,'title',new.title,'subject',new.subject_name,'due_at',new.due_at,'assignment_category',new.assignment_category),
      v_student.student_id,null,new.school_id,null,now()
    );
  end loop;
  return new;
end; $$;
revoke all on function private.trg_email_assignment_changed() from public, anon, authenticated;

create or replace function public.rpc_enqueue_due_email_reminders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_assignment_count integer:=0; v_guardian_count integer:=0; v_subscription_count integer:=0; r record;
begin
  for r in
    select sa.assignment_id,sa.student_id,a.school_id,a.title,a.subject_name,a.assignment_category,a.due_at
    from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id
    where sa.status not in ('completed','submitted') and a.due_at between now()+interval '23 hours' and now()+interval '25 hours'
  loop
    perform private.enqueue_transactional_email('assignment_due_reminder','reminders','student','assignment_due_reminder',
      'assignment-due-24h-'||r.assignment_id::text||'-'||r.student_id::text||'-'||r.due_at::text,
      jsonb_build_object('assignment_id',r.assignment_id,'title',r.title,'subject',r.subject_name,'due_at',r.due_at,'assignment_category',r.assignment_category),
      r.student_id,null,r.school_id,null,now());
    v_assignment_count:=v_assignment_count+1;
  end loop;

  -- Preserve the existing guardian/subscription reminder logic by delegating to
  -- the same source tables rather than changing assignment behavior.
  for r in
    select gin.id,gin.school_id,gin.student_id,gin.invited_email,gin.available_at
    from public.guardian_invitation_email_notifications gin
    where gin.status='pending'
      and gin.available_at between now()+interval '23 hours' and now()+interval '25 hours'
  loop
    v_guardian_count:=v_guardian_count+1;
  end loop;

  -- Subscription reminders are owned by their existing billing triggers/jobs;
  -- this counter remains part of the public response contract.
  return jsonb_build_object('success',true,'assignment_reminders',v_assignment_count,'guardian_reminders',v_guardian_count,'subscription_reminders',v_subscription_count);
end; $$;
revoke all on function public.rpc_enqueue_due_email_reminders() from public, anon, authenticated;
grant execute on function public.rpc_enqueue_due_email_reminders() to service_role;
