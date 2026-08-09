-- Phase 4: teacher-facing directory for opening authorised Student Academic Profiles.

create or replace function public.rpc_teacher_academic_profile_students()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

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
