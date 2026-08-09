-- Extend the existing academic-profile directory so school administrators can browse
-- all active students in their school, while teachers remain class+subject scoped.
create or replace function public.rpc_teacher_academic_profile_students()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_admin_school_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select sm.school_id into v_admin_school_id
  from public.school_members sm
  where sm.user_id = v_caller
    and sm.status = 'active'
    and sm.role_in_school = 'school_admin'
  order by sm.joined_at desc nulls last
  limit 1;

  if v_admin_school_id is not null then
    select coalesce(jsonb_agg(row_data order by row_data->>'class_name', row_data->>'student_name'), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'student_id', u.id,
        'student_name', coalesce(nullif(trim(u.full_name), ''), u.username),
        'username', u.username,
        'class_name', coalesce(nullif(trim(c.class_code), ''), nullif(trim(u.batch), ''), '—'),
        'grade', u.grade,
        'school_id', u.school_id,
        'subjects', coalesce(to_jsonb(array_agg(distinct cta.subject order by cta.subject) filter (where nullif(trim(cta.subject), '') is not null)), '[]'::jsonb)
      ) as row_data
      from public.school_members sm
      join public.users u on u.id = sm.user_id and u.school_id = sm.school_id
      left join public.class_students cs on cs.student_id = u.id
      left join public.classes c on c.id = cs.class_id and c.school_id = sm.school_id and c.is_active is true
      left join public.class_teacher_assignments cta on cta.class_id = c.id and cta.school_id = sm.school_id and cta.active is true
      where sm.school_id = v_admin_school_id
        and sm.status = 'active'
        and sm.role_in_school = 'student'
      group by u.id, u.full_name, u.username, u.batch, u.grade, u.school_id, c.class_code
    ) rows;
    return v_result;
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'class_name', row_data->>'student_name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'student_id', u.id,
      'student_name', coalesce(nullif(trim(u.full_name), ''), u.username),
      'username', u.username,
      'class_name', coalesce(nullif(trim(c.class_code), ''), nullif(trim(u.batch), ''), '—'),
      'grade', u.grade,
      'school_id', u.school_id,
      'subjects', to_jsonb(array_agg(distinct cta.subject order by cta.subject))
    ) as row_data
    from public.class_students cs
    join public.classes c on c.id = cs.class_id
    join public.class_teacher_assignments cta
      on cta.class_id = cs.class_id
     and cta.school_id = c.school_id
     and cta.teacher_user_id = v_caller
     and cta.active is true
    join public.users u on u.id = cs.student_id and u.school_id = c.school_id
    group by u.id, u.full_name, u.username, u.batch, u.grade, u.school_id, c.class_code
  ) rows;

  return v_result;
end;
$$;

revoke all on function public.rpc_teacher_academic_profile_students() from public, anon;
grant execute on function public.rpc_teacher_academic_profile_students() to authenticated, service_role;
