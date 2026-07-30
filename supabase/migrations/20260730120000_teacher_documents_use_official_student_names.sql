-- Teacher assignment rosters and reports are official school documents.
-- Expose a student's real name to the teacher portal while keeping usernames
-- as gameplay identities inside the student application.

create or replace function public.rpc_get_students_for_assignment(p_teacher_id uuid default null)
returns table (
  id uuid,
  username text,
  display_name text,
  grade text,
  batch text,
  avatar_url text,
  school_id uuid,
  class_id uuid,
  class_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_user_id uuid;
  v_teacher_school_id uuid;
  v_has_assignments boolean;
begin
  if p_teacher_id is not null then
    select t.user_id into v_teacher_user_id from teachers t where t.id = p_teacher_id;
  end if;
  v_teacher_user_id := coalesce(v_teacher_user_id, auth.uid());

  select u.school_id into v_teacher_school_id from users u where u.id = v_teacher_user_id;
  select exists (
    select 1 from class_teacher_assignments cta
    where cta.teacher_user_id = v_teacher_user_id and cta.active = true
  ) into v_has_assignments;

  if v_has_assignments then
    return query
    with assigned_classes as (
      select distinct c.id as class_id, c.class_code, c.grade_level, c.school_id
      from class_teacher_assignments cta
      join classes c on c.id = cta.class_id
      where cta.teacher_user_id = v_teacher_user_id and cta.active = true
    ), roster as (
      select distinct on (u.id) u.*, ac.class_id, ac.class_code
      from assigned_classes ac
      join class_students cs on cs.class_id = ac.class_id
      join users u on u.id = cs.student_id and coalesce(u.role, 'student') = 'student'
      where not coalesce(u.is_banned, false)
      union
      select distinct on (u.id) u.*, ac.class_id, ac.class_code
      from assigned_classes ac
      join users u on u.school_id = ac.school_id
        and u.grade = ac.grade_level and coalesce(u.role, 'student') = 'student'
      where not coalesce(u.is_banned, false)
        and not exists (select 1 from class_students cs where cs.class_id = ac.class_id)
    )
    select r.id, r.username::text,
      coalesce(nullif(trim(r.full_name), ''), 'Student name unavailable')::text,
      coalesce(r.grade, '')::text, coalesce(r.batch, '')::text, r.avatar_url::text,
      r.school_id, r.class_id, coalesce(r.class_code, '')::text
    from roster r
    order by r.grade nulls last, r.batch nulls last, display_name;
  else
    return query
    select u.id, u.username::text,
      coalesce(nullif(trim(u.full_name), ''), 'Student name unavailable')::text,
      coalesce(u.grade, '')::text, coalesce(u.batch, '')::text, u.avatar_url::text,
      u.school_id, cs.class_id, coalesce(c.class_code, '')::text
    from users u
    left join class_students cs on cs.student_id = u.id
    left join classes c on c.id = cs.class_id
    where coalesce(u.role, 'student') = 'student'
      and not coalesce(u.is_banned, false)
      and (v_teacher_school_id is null or u.school_id = v_teacher_school_id)
    order by u.grade nulls last, u.batch nulls last, display_name;
  end if;
end;
$$;

revoke all on function public.rpc_get_students_for_assignment(uuid) from public;
grant execute on function public.rpc_get_students_for_assignment(uuid) to authenticated;
