create or replace function public.school_admin_save_class(
  p_school_id uuid,
  p_class_id uuid default null::uuid,
  p_class_code text default null::text,
  p_class_name text default null::text,
  p_grade_level integer default null::integer,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_is_generated_grade_class boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_school_admin_of(p_school_id) then
    return jsonb_build_object('success', false, 'error', 'Forbidden: not a school admin');
  end if;

  if p_class_name is null or trim(p_class_name) = '' then
    return jsonb_build_object('success', false, 'error', 'Class name is required');
  end if;

  if p_class_id is not null then
    update public.classes
    set class_code  = coalesce(p_class_code, class_code),
        class_name  = p_class_name,
        grade_level = p_grade_level,
        is_active   = p_is_active
    where id = p_class_id
      and school_id = p_school_id;

    if not found then
      return jsonb_build_object('success', false, 'error', 'Class not found in this school');
    end if;

    return jsonb_build_object('success', true, 'id', p_class_id);
  end if;

  v_is_generated_grade_class := p_grade_level is not null
    and trim(coalesce(p_class_code, '')) = 'G' || p_grade_level::text
    and trim(p_class_name) = 'Grade ' || p_grade_level::text;

  -- The academic setup wizard may retry after a later step fails while its
  -- client-side class cache is stale. Reuse only the exact generated Grade N
  -- class; manual class creation keeps normal duplicate protection.
  if v_is_generated_grade_class then
    select c.id into v_id
    from public.classes c
    where c.school_id = p_school_id
      and c.class_code = p_class_code
      and c.class_name = p_class_name
      and c.grade_level::text = p_grade_level::text
    order by c.created_at asc
    limit 1;

    if v_id is not null then
      return jsonb_build_object('success', true, 'id', v_id, 'created', false, 'reused', true);
    end if;
  end if;

  begin
    insert into public.classes (school_id, class_code, class_name, grade_level, is_active)
    values (p_school_id, p_class_code, p_class_name, p_grade_level, p_is_active)
    returning id into v_id;
  exception when unique_violation then
    if v_is_generated_grade_class then
      select c.id into v_id
      from public.classes c
      where c.school_id = p_school_id
        and c.class_code = p_class_code
        and c.class_name = p_class_name
        and c.grade_level::text = p_grade_level::text
      limit 1;
      if v_id is not null then
        return jsonb_build_object('success', true, 'id', v_id, 'created', false, 'reused', true);
      end if;
    end if;
    raise;
  end;

  return jsonb_build_object('success', true, 'id', v_id, 'created', true, 'reused', false);
end;
$$;
