-- Writing Hub: a teacher can set one task for a whole class.
--
-- Until now each student received a random task and chose the genre, so a class could not write the same task in a
-- lesson. A teacher (or school admin) can now choose a class from their English roster, a genre and a task from the
-- approved Cambridge bank. Every student in that class receives that task until they submit it or it closes.
--
-- Authorization reuses the existing Writing roster boundary (bh_writing_authorized_english_roster): a teacher can only
-- assign to, read or cancel tasks for classes they teach. The tables have RLS enabled with no policies; all access is
-- through the security-definer functions below.

create table if not exists public.bh_writing_task_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  scope_id uuid not null,
  scope_name text not null,
  assigned_by uuid not null references public.users(id),
  grade integer not null check (grade between 1 and 12),
  genre text not null check (genre in ('email','article','review','story','essay','report','paragraph')),
  prompt_id text not null,
  prompt_title text not null,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table if not exists public.bh_writing_task_assignment_students (
  assignment_id uuid not null references public.bh_writing_task_assignments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  primary key (assignment_id, student_id)
);

create index if not exists idx_bh_writing_task_assignments_scope
  on public.bh_writing_task_assignments (scope_id, created_at desc);
create index if not exists idx_bh_writing_task_assignments_assigned_by
  on public.bh_writing_task_assignments (assigned_by);
create index if not exists idx_bh_writing_task_assignment_students_student
  on public.bh_writing_task_assignment_students (student_id);

alter table public.bh_writing_task_assignments enable row level security;
alter table public.bh_writing_task_assignment_students enable row level security;
revoke all on table public.bh_writing_task_assignments from public, anon, authenticated;
revoke all on table public.bh_writing_task_assignment_students from public, anon, authenticated;

comment on table public.bh_writing_task_assignments is
  'Writing Hub tasks a teacher set for a class. Accessed only through security-definer RPCs.';
comment on table public.bh_writing_task_assignment_students is
  'Students who received a Writing Hub class task, fixed at the time the task was set.';

-- The open class task for one student: not cancelled, inside its window, for the student''s grade, not yet submitted.
create or replace function private.bh_writing_open_task_assignment(p_student_id uuid, p_grade integer)
returns public.bh_writing_task_assignments
language sql
stable
security definer
set search_path = ''
as $$
  select a.*
  from public.bh_writing_task_assignments a
  join public.bh_writing_task_assignment_students s
    on s.assignment_id = a.id and s.student_id = p_student_id
  where a.cancelled_at is null
    and now() >= a.opens_at
    and now() < a.closes_at
    and a.grade = p_grade
    and not exists (
      select 1
      from public.bh_writing_attempts t
      where t.payload->>'student_id' = p_student_id::text
        and t.payload->>'prompt_id' = a.prompt_id
        and t.created_at >= a.opens_at
    )
  order by a.created_at desc
  limit 1;
$$;

revoke all on function private.bh_writing_open_task_assignment(uuid, integer) from public, anon, authenticated;

create or replace function public.rpc_bh_writing_student_prompt(
  p_grade integer,
  p_genre text,
  p_current_prompt_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := (select auth.uid());
  v_grade integer;
  v_payload jsonb;
  v_assignment public.bh_writing_task_assignments;
  v_assignment_json jsonb := null;
begin
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  v_grade := public.bh_writing_authoritative_student_grade(v_student_id);
  if v_grade is null then
    raise exception 'An authoritative grade between 1 and 12 is required';
  end if;
  if p_grade is distinct from v_grade then
    raise exception 'Requested grade does not match the student record';
  end if;
  if p_genre not in ('email','article','review','story','essay','report','paragraph') then
    raise exception 'Unsupported writing genre';
  end if;

  -- A task set by the teacher comes before the student''s own choice of genre and the rotation.
  select * into v_assignment from private.bh_writing_open_task_assignment(v_student_id, v_grade);
  if v_assignment.id is not null then
    select pb.payload
    into v_payload
    from public.bh_writing_prompt_bank pb
    where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
      and pb.payload->>'id' = v_assignment.prompt_id
      and (pb.payload->>'grade')::integer = v_grade
      and coalesce((pb.payload->>'is_active')::boolean, false)
      and pb.payload->>'safety_status' = 'approved'
    limit 1;
    if v_payload is not null then
      v_assignment_json := jsonb_build_object(
        'assignment_id', v_assignment.id,
        'class_name', v_assignment.scope_name,
        'closes_at', v_assignment.closes_at
      );
    end if;
  end if;

  if v_payload is null then
    select pb.payload
    into v_payload
    from public.bh_writing_prompt_bank pb
    left join lateral (
      select max(seen.seen_at) as last_seen_at
      from (
        select a.created_at as seen_at
        from public.bh_writing_attempts a
        where a.payload->>'student_id' = v_student_id::text
          and a.payload->>'prompt_id' = (pb.payload->>'id')
        union all
        select v.created_at
        from public.bh_writing_voided_attempts v
        where v.student_id = v_student_id
          and v.prompt_id = (pb.payload->>'id')
      ) seen
    ) history on true
    where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
      and (pb.payload->>'grade')::integer = v_grade
      and pb.payload->>'genre' = p_genre
      and coalesce((pb.payload->>'is_active')::boolean, false)
      and pb.payload->>'safety_status' = 'approved'
    order by
      case when (pb.payload->>'id') = nullif(trim(p_current_prompt_id), '') then 1 else 0 end,
      history.last_seen_at asc nulls first,
      md5(v_student_id::text || current_date::text || (pb.payload->>'id'))
    limit 1;
  end if;

  if v_payload is null then
    return null;
  end if;

  return jsonb_build_object(
    'prompt_id', v_payload->>'id',
    'prompt_text', v_payload->>'prompt_text',
    'title', v_payload->>'title',
    'genre', v_payload->>'genre',
    'difficulty_label', v_payload->>'difficulty_label',
    'minimum_word_count', (v_payload->>'minimum_word_count')::integer,
    'target_word_count', (v_payload->>'target_word_count')::integer,
    'maximum_word_count', (v_payload->>'maximum_word_count')::integer,
    'time_limit_seconds', (v_payload->>'time_limit_seconds')::integer,
    'syllabus_code', v_payload->>'syllabus_code',
    'syllabus_year', v_payload->>'syllabus_year',
    'framework_version', v_payload->>'framework_version',
    'rubric_version', v_payload->>'rubric_version',
    'task_rules', v_payload->'task_rules',
    'rubric_snapshot', v_payload->'rubric_snapshot',
    'focus_tags', v_payload->'focus_tags',
    'context_tags', v_payload->'context_tags',
    'curriculum_tags', v_payload->'curriculum_tags',
    'pool_size', 10,
    'assignment', v_assignment_json
  );
end;
$$;

revoke all on function public.rpc_bh_writing_student_prompt(integer, text, text) from public, anon;
grant execute on function public.rpc_bh_writing_student_prompt(integer, text, text) to authenticated, service_role;

comment on function public.rpc_bh_writing_student_prompt(integer, text, text) is
  'Returns an approved Cambridge Writing Hub prompt for the authenticated student authoritative grade. An open class task set by the teacher comes first; otherwise tasks the student has not written come first, in a per-student daily shuffle.';

-- Teacher: the tasks that can be set for one class and genre, plus the class''s current task and its progress.
create or replace function public.rpc_bh_writing_class_task_options(p_scope_id uuid, p_genre text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_scope_name text;
  v_grade integer;
  v_student_count integer;
  v_tasks jsonb;
  v_current jsonb;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_genre not in ('email','article','review','story','essay','report','paragraph') then
    raise exception 'Unsupported writing genre';
  end if;

  select max(r.scope_name), count(distinct r.student_id)::integer
  into v_scope_name, v_student_count
  from public.bh_writing_authorized_english_roster() r
  where r.scope_id = p_scope_id;
  if coalesce(v_student_count, 0) = 0 then
    raise exception 'Forbidden: this class is not in your English roster';
  end if;

  -- The grade students in this class are actually served tasks for (most common authoritative grade).
  select g.grade into v_grade
  from (
    select public.bh_writing_authoritative_student_grade(r.student_id) as grade, count(*) as n
    from (select distinct student_id from public.bh_writing_authorized_english_roster() where scope_id = p_scope_id) r
    group by 1
  ) g
  where g.grade is not null
  order by g.n desc, g.grade
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'prompt_id', pb.payload->>'id',
    'title', pb.payload->>'title',
    'prompt_text', pb.payload->>'prompt_text',
    'target_word_count', (pb.payload->>'target_word_count')::integer,
    'time_limit_minutes', ((pb.payload->>'time_limit_seconds')::integer / 60)
  ) order by pb.payload->>'id'), '[]'::jsonb)
  into v_tasks
  from public.bh_writing_prompt_bank pb
  where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
    and (pb.payload->>'grade')::integer = v_grade
    and pb.payload->>'genre' = p_genre
    and coalesce((pb.payload->>'is_active')::boolean, false)
    and pb.payload->>'safety_status' = 'approved';

  select jsonb_build_object(
    'assignment_id', a.id,
    'genre', a.genre,
    'prompt_id', a.prompt_id,
    'prompt_title', a.prompt_title,
    'opens_at', a.opens_at,
    'closes_at', a.closes_at,
    'student_count', (select count(*) from public.bh_writing_task_assignment_students s where s.assignment_id = a.id),
    'submitted_count', (
      select count(*)
      from public.bh_writing_task_assignment_students s
      where s.assignment_id = a.id
        and exists (
          select 1 from public.bh_writing_attempts t
          where t.payload->>'student_id' = s.student_id::text
            and t.payload->>'prompt_id' = a.prompt_id
            and t.created_at >= a.opens_at
        )
    )
  )
  into v_current
  from public.bh_writing_task_assignments a
  where a.scope_id = p_scope_id
    and a.cancelled_at is null
    and now() < a.closes_at
  order by a.created_at desc
  limit 1;

  return jsonb_build_object(
    'scope_id', p_scope_id,
    'class_name', v_scope_name,
    'grade', v_grade,
    'roster_student_count', v_student_count,
    'tasks', coalesce(v_tasks, '[]'::jsonb),
    'current', v_current
  );
end;
$$;

revoke all on function public.rpc_bh_writing_class_task_options(uuid, text) from public, anon;
grant execute on function public.rpc_bh_writing_class_task_options(uuid, text) to authenticated, service_role;

-- Teacher: set one task for the class. Replaces any task that is still open for the same class.
create or replace function public.rpc_bh_writing_assign_class_task(p_scope_id uuid, p_prompt_id text, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_scope_name text;
  v_school_id uuid;
  v_roster_count integer;
  v_prompt jsonb;
  v_grade integer;
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 60);
  v_assignment_id uuid;
  v_assigned integer;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;

  select max(r.scope_name), (array_agg(r.school_id))[1], count(distinct r.student_id)::integer
  into v_scope_name, v_school_id, v_roster_count
  from public.bh_writing_authorized_english_roster() r
  where r.scope_id = p_scope_id;
  if coalesce(v_roster_count, 0) = 0 or v_school_id is null then
    raise exception 'Forbidden: this class is not in your English roster';
  end if;

  select pb.payload into v_prompt
  from public.bh_writing_prompt_bank pb
  where pb.payload->>'bank_version' = 'cambridge-esl-writing-bank-v1'
    and pb.payload->>'id' = nullif(trim(p_prompt_id), '')
    and coalesce((pb.payload->>'is_active')::boolean, false)
    and pb.payload->>'safety_status' = 'approved'
  limit 1;
  if v_prompt is null then raise exception 'This task is not available in the approved bank'; end if;
  v_grade := (v_prompt->>'grade')::integer;

  update public.bh_writing_task_assignments
  set cancelled_at = now()
  where scope_id = p_scope_id and cancelled_at is null and now() < closes_at;

  insert into public.bh_writing_task_assignments(
    school_id, scope_id, scope_name, assigned_by, grade, genre, prompt_id, prompt_title, closes_at
  ) values (
    v_school_id, p_scope_id, coalesce(v_scope_name, 'Class'), v_actor, v_grade, v_prompt->>'genre',
    v_prompt->>'id', coalesce(v_prompt->>'title', v_prompt->>'id'), now() + make_interval(days => v_days)
  ) returning id into v_assignment_id;

  -- Only students whose own grade matches the task receive it; the task picker enforces the same grade.
  insert into public.bh_writing_task_assignment_students(assignment_id, student_id)
  select v_assignment_id, r.student_id
  from (select distinct student_id from public.bh_writing_authorized_english_roster() where scope_id = p_scope_id) r
  where public.bh_writing_authoritative_student_grade(r.student_id) = v_grade;
  get diagnostics v_assigned = row_count;

  if v_assigned = 0 then
    raise exception 'No student in this class is recorded in Grade %, so the task was not set', v_grade;
  end if;

  return jsonb_build_object(
    'assignment_id', v_assignment_id,
    'student_count', v_assigned,
    'skipped_count', v_roster_count - v_assigned,
    'closes_at', now() + make_interval(days => v_days)
  );
end;
$$;

revoke all on function public.rpc_bh_writing_assign_class_task(uuid, text, integer) from public, anon;
grant execute on function public.rpc_bh_writing_assign_class_task(uuid, text, integer) to authenticated, service_role;

-- Teacher: withdraw the class task. Students return to their own choice of task.
create or replace function public.rpc_bh_writing_cancel_class_task(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_scope_id uuid;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  select a.scope_id into v_scope_id from public.bh_writing_task_assignments a where a.id = p_assignment_id;
  if v_scope_id is null or not exists (
    select 1 from public.bh_writing_authorized_english_roster() r where r.scope_id = v_scope_id
  ) then
    raise exception 'Forbidden: this class is not in your English roster';
  end if;
  update public.bh_writing_task_assignments
  set cancelled_at = now()
  where id = p_assignment_id and cancelled_at is null;
  return jsonb_build_object('assignment_id', p_assignment_id, 'cancelled', true);
end;
$$;

revoke all on function public.rpc_bh_writing_cancel_class_task(uuid) from public, anon;
grant execute on function public.rpc_bh_writing_cancel_class_task(uuid) to authenticated, service_role;
