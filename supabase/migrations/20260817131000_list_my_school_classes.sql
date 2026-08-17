create or replace function public.rpc_list_my_school_classes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_school_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Not authenticated',
      'classes', '[]'::jsonb
    );
  end if;

  select sm.school_id
  into v_school_id
  from public.school_members sm
  join public.users u
    on u.id = sm.user_id
   and u.school_id = sm.school_id
  where sm.user_id = v_user_id
    and sm.status = 'active'
    and sm.role_in_school = 'student'
  order by sm.id
  limit 1;

  if v_school_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'No active student school membership found',
      'classes', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'classes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'class_code', c.class_code,
          'class_name', c.class_name,
          'grade_level', c.grade_level
        )
        order by
          case when c.grade_level ~ '^[0-9]+$' then c.grade_level::integer end nulls last,
          c.grade_level,
          c.class_code
      )
      from public.classes c
      where c.school_id = v_school_id
        and c.is_active is true
        and nullif(btrim(c.grade_level), '') is not null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_list_my_school_classes() from public, anon, authenticated, service_role;
grant execute on function public.rpc_list_my_school_classes() to authenticated;
