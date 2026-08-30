-- Keep historical/date resolution intact, but let teacher/student operational work
-- follow the academic year explicitly activated by the school admin.

create or replace function public.academic_resolve_operational_year_id(
  p_school_id uuid,
  p_fallback_at timestamptz default now()
)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select y.id
      from public.school_academic_years y
      where y.school_id = p_school_id
        and y.status = 'current'
      order by y.starts_on desc, y.id
      limit 1
    ),
    public.academic_resolve_year_id(p_school_id, p_fallback_at)
  );
$$;

comment on function public.academic_resolve_operational_year_id(uuid, timestamptz) is
  'Resolves the school-admin activated current academic year first, falling back to calendar resolution only when no current year is configured.';

-- Verified Question Bank: authorization must follow the operational/current year,
-- including the preparation window before starts_on.
do $$
declare
  v_oid oid;
  v_def text;
  v_old text := 'v_academic_year_id := public.academic_resolve_year_id(v_school_id, now());';
  v_new text := 'v_academic_year_id := public.academic_resolve_operational_year_id(v_school_id, now());';
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_all_active_questions'
    and pg_get_function_identity_arguments(p.oid) = 'p_subject text, p_difficulty text, p_teacher_id uuid, p_limit integer, p_offset integer';

  if v_oid is null then
    raise exception 'get_all_active_questions signature not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position(v_old in v_def) = 0 then
    raise exception 'get_all_active_questions operational-year patch target not found';
  end if;

  execute replace(v_def, v_old, v_new);
end;
$$;

-- Keep teacher-facing subject/catalog metadata aligned with the same operational year.
do $$
declare
  v_row record;
  v_def text;
  v_replaced text;
begin
  for v_row in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'rpc_student_academic_subjects',
        'rpc_student_learning_catalog',
        'rpc_student_academic_subjects_for_year',
        'rpc_teacher_academic_profile_students_for_year'
      )
  loop
    v_def := pg_get_functiondef(v_row.oid);
    v_replaced := replace(
      replace(
        replace(v_def,
          'v_year := public.academic_resolve_year_id(v_teacher_school, now());',
          'v_year := public.academic_resolve_operational_year_id(v_teacher_school, now());'
        ),
        'v_operational_year := public.academic_resolve_year_id(v_school, now());',
        'v_operational_year := public.academic_resolve_operational_year_id(v_school, now());'
      ),
      'v_operational_year_id := public.academic_resolve_year_id(v_school_id, now());',
      'v_operational_year_id := public.academic_resolve_operational_year_id(v_school_id, now());'
    );

    if v_replaced is distinct from v_def then
      execute v_replaced;
    end if;
  end loop;
end;
$$;

-- New assignments are operational records: if the caller did not explicitly
-- provide an academic year, stamp the activated current year even before starts_on.
-- Existing assignments keep their original academic year when edited so archive
-- records cannot silently jump years.
create or replace function private.academic_enrich_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := coalesce(new.assigned_at, new.created_at, now());
  v_class public.classes%rowtype;
  v_should_refresh boolean := (tg_op = 'INSERT');
begin
  if tg_op = 'UPDATE' then
    v_should_refresh :=
      new.school_id is distinct from old.school_id
      or new.subject_name is distinct from old.subject_name
      or new.subject is distinct from old.subject
      or new.subject_id is distinct from old.subject_id
      or new.assigned_at is distinct from old.assigned_at
      or new.class_id is distinct from old.class_id
      or new.academic_year_id is distinct from old.academic_year_id
      or (
        coalesce(old.publish_status, 'published') = 'draft'
        and coalesce(new.publish_status, 'published') <> 'draft'
      );

    if not v_should_refresh then
      return new;
    end if;
  end if;

  new.academic_subject_id := public.academic_resolve_subject_id(
    coalesce(nullif(trim(new.subject_name), ''), nullif(trim(new.subject), ''), nullif(trim(new.subject_id), '')),
    new.school_id
  );

  if tg_op = 'INSERT' then
    if new.academic_year_id is null then
      new.academic_year_id := public.academic_resolve_operational_year_id(new.school_id, v_at);
    end if;
  elsif new.school_id is distinct from old.school_id then
    new.academic_year_id := public.academic_resolve_operational_year_id(new.school_id, v_at);
  elsif new.academic_year_id is null then
    new.academic_year_id := old.academic_year_id;
  end if;

  if new.academic_year_id is not null and not exists (
    select 1
    from public.school_academic_years y
    where y.id = new.academic_year_id
      and y.school_id = new.school_id
  ) then
    raise exception using errcode = '23514', message = 'assignment_academic_year_school_mismatch';
  end if;

  new.academic_term_id := public.academic_resolve_term_id(new.academic_year_id, v_at);

  if new.class_id is not null then
    select * into v_class
    from public.classes c
    where c.id = new.class_id
      and (new.school_id is null or c.school_id = new.school_id);
    if found then
      new.grade_level_snapshot := v_class.grade_level;
      new.class_code_snapshot := v_class.class_code;
    end if;
  end if;

  return new;
end;
$$;

-- Assignment-derived learning evidence inherits the assignment's year. This is
-- required when students intentionally test a published upcoming-year assignment
-- before the formal starts_on date. Other historical evidence keeps date semantics.
create or replace function private.student_learning_enrich_academic_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (new.observed_at at time zone 'UTC')::date;
  v_source_class_id uuid;
  v_source_assignment_year_id uuid;
  v_class public.classes%rowtype;
  v_enrolment public.student_academic_enrolments%rowtype;
begin
  new.academic_subject_id := public.academic_resolve_subject_id(new.subject, new.school_id);

  if new.source_type = 'assignment_result' and new.source_id is not null then
    select a.academic_year_id, a.class_id
    into v_source_assignment_year_id, v_source_class_id
    from public.assignments a
    where a.id = new.source_id
      and a.school_id = new.school_id;
  end if;

  new.academic_year_id := coalesce(
    v_source_assignment_year_id,
    public.academic_resolve_year_id(new.school_id, new.observed_at)
  );
  new.academic_term_id := public.academic_resolve_term_id(new.academic_year_id, new.observed_at);
  new.academic_enrolment_id := null;
  new.grade_level_at_time := null;
  new.class_id_at_time := null;
  new.class_code_at_time := null;
  new.academic_context_quality := 'unknown';
  new.academic_context_source := 'unresolved';

  if v_source_class_id is null and coalesce(new.evidence->>'class_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_source_class_id := (new.evidence->>'class_id')::uuid;
  elsif v_source_class_id is null and new.source_type = 'assignment_result' and new.source_id is not null then
    select a.class_id into v_source_class_id
    from public.assignments a where a.id = new.source_id;
  end if;

  if v_source_class_id is not null then
    select * into v_class from public.classes c
    where c.id = v_source_class_id and c.school_id = new.school_id;
    if found then
      new.class_id_at_time := v_class.id;
      new.class_code_at_time := v_class.class_code;
      new.grade_level_at_time := v_class.grade_level;
      new.academic_context_quality := 'estimated';
      new.academic_context_source := 'source_class_snapshot';
    end if;
  end if;

  if new.academic_year_id is not null then
    select * into v_enrolment
    from public.student_academic_enrolments e
    where e.school_id = new.school_id
      and e.student_id = new.student_id
      and e.academic_year_id = new.academic_year_id
    order by case e.context_quality when 'confirmed' then 1 else 2 end,
             case when v_day between e.starts_on and coalesce(e.ends_on, v_day) then 0 else 1 end,
             e.starts_on desc, e.created_at desc
    limit 1;

    if found and (new.class_id_at_time is null or v_enrolment.context_quality = 'confirmed') then
      new.academic_enrolment_id := v_enrolment.id;
      new.class_id_at_time := v_enrolment.class_id;
      new.class_code_at_time := v_enrolment.class_code;
      new.grade_level_at_time := v_enrolment.grade_level;
      new.academic_context_quality := v_enrolment.context_quality;
      new.academic_context_source := 'academic_enrolment';
    elsif new.class_id_at_time is not null then
      new.academic_context_quality := 'estimated';
    else
      new.academic_context_quality := 'estimated';
      new.academic_context_source := 'calendar_only';
    end if;
  end if;

  return new;
end;
$$;

-- Repair only assignments created after a committed rollover when they were
-- stamped into the closed source year while the committed target year is current.
-- This deliberately does not move arbitrary July/August historical records.
with committed_rollovers as (
  select distinct on (e.school_id)
    e.school_id,
    e.created_at as committed_at,
    nullif(e.event_data->>'targetYearId', '')::uuid as target_year_id
  from public.school_year_rollover_events e
  where e.event_type = 'committed'
    and nullif(e.event_data->>'targetYearId', '') is not null
  order by e.school_id, e.created_at desc
), repairable as (
  select a.id, r.target_year_id
  from public.assignments a
  join public.school_academic_years source_year
    on source_year.id = a.academic_year_id
   and source_year.school_id = a.school_id
   and source_year.status = 'closed'
  join committed_rollovers r
    on r.school_id = a.school_id
   and a.created_at >= r.committed_at
  join public.school_academic_years target_year
    on target_year.id = r.target_year_id
   and target_year.school_id = a.school_id
   and target_year.status = 'current'
  where a.academic_year_id <> r.target_year_id
)
update public.assignments a
set academic_year_id = repairable.target_year_id,
    academic_term_id = public.academic_resolve_term_id(repairable.target_year_id, a.assigned_at),
    updated_at = now()
from repairable
where a.id = repairable.id;
