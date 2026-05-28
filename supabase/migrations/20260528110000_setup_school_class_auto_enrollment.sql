-- Auto-enroll setup wizard students into real school classes and class_students.
-- Idempotent: safe to rerun.

create or replace function public.normalize_setup_class_code(
  p_grade_level text,
  p_batch text
)
returns text
language plpgsql
immutable
as $$
declare
  v_grade text;
  v_batch text;
  v_section text;
begin
  v_grade := regexp_replace(coalesce(p_grade_level, ''), '[^0-9]', '', 'g');
  v_batch := upper(trim(coalesce(p_batch, '')));

  if v_batch ~ '^[0-9]{1,2}[ABC]$' then
    return v_batch;
  end if;

  if v_batch ~ '^[ABC]$' then
    v_section := v_batch;
  else
    v_section := regexp_replace(v_batch, '[^ABC]', '', 'g');
    if length(v_section) > 0 then
      v_section := substring(v_section from 1 for 1);
    end if;
  end if;

  if v_grade = '' or v_section is null or v_section = '' then
    return null;
  end if;

  return v_grade || v_section;
end;
$$;

create or replace function public.rpc_setup_school_class_enrollment(
  p_grade_level text,
  p_batch text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_school_id uuid;
  v_class_code text;
  v_grade_level text;
  v_class_id uuid;
  v_created_class boolean := false;
  v_enrolled boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select u.school_id into v_school_id
  from public.users u
  where u.id = v_uid;

  if v_school_id is null then
    return jsonb_build_object('success', true, 'status', 'no_school', 'enrolled', false);
  end if;

  v_class_code := public.normalize_setup_class_code(p_grade_level, p_batch);
  v_grade_level := nullif(regexp_replace(coalesce(p_grade_level, ''), '[^0-9]', '', 'g'), '');

  if v_class_code is null then
    return jsonb_build_object('success', false, 'status', 'invalid_input', 'error', 'Could not normalize class code');
  end if;

  select c.id into v_class_id
  from public.classes c
  where c.school_id = v_school_id
    and (
      upper(trim(coalesce(c.class_code, ''))) = v_class_code
      or upper(trim(coalesce(c.class_name, ''))) = v_class_code
    )
  order by c.is_active desc, c.created_at asc
  limit 1;

  if v_class_id is null then
    insert into public.classes (
      school_id,
      class_name,
      class_code,
      grade_level,
      is_active
    ) values (
      v_school_id,
      v_class_code,
      v_class_code,
      v_grade_level,
      true
    )
    returning id into v_class_id;

    v_created_class := true;
  end if;

  if not exists (
    select 1 from public.class_students cs
    where cs.class_id = v_class_id and cs.student_id = v_uid
  ) then
    insert into public.class_students (class_id, student_id)
    values (v_class_id, v_uid);
    v_enrolled := true;
  end if;

  return jsonb_build_object(
    'success', true,
    'status', 'ok',
    'class_id', v_class_id,
    'class_code', v_class_code,
    'created_class', v_created_class,
    'enrolled', v_enrolled
  );
exception
  when others then
    return jsonb_build_object('success', false, 'status', 'error', 'error', sqlerrm);
end;
$$;

revoke all on function public.rpc_setup_school_class_enrollment(text, text) from public, anon;
grant execute on function public.rpc_setup_school_class_enrollment(text, text) to authenticated;

-- Backfill existing students with school + batch like 6A..12C into classes and class_students.
do $$
declare
  r record;
begin
  for r in
    select u.id as student_id,
           u.school_id,
           upper(trim(u.batch)) as class_code,
           nullif(regexp_replace(coalesce(u.grade::text, ''), '[^0-9]', '', 'g'), '') as grade_level
    from public.users u
    where u.school_id is not null
      and u.role = 'student'
      and u.batch is not null
      and upper(trim(u.batch)) ~ '^[0-9]{1,2}[ABC]$'
  loop
    insert into public.classes (school_id, class_name, class_code, grade_level, is_active)
    select r.school_id, r.class_code, r.class_code, r.grade_level, true
    where not exists (
      select 1 from public.classes c
      where c.school_id = r.school_id
        and (upper(trim(coalesce(c.class_code, ''))) = r.class_code
          or upper(trim(coalesce(c.class_name, ''))) = r.class_code)
    );

    insert into public.class_students (class_id, student_id)
    select c.id, r.student_id
    from public.classes c
    where c.school_id = r.school_id
      and (upper(trim(coalesce(c.class_code, ''))) = r.class_code
        or upper(trim(coalesce(c.class_name, ''))) = r.class_code)
      and not exists (
        select 1 from public.class_students cs
        where cs.class_id = c.id and cs.student_id = r.student_id
      )
    limit 1;
  end loop;
end $$;
