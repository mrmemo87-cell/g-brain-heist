-- Grade-first school workflows must not lose students when grade is stored on the class
-- instead of the user profile. Prefer active class grade_level, then fall back to users.grade.

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
    select coalesce(jsonb_agg(row_data order by row_data->>'grade', row_data->>'class_name', row_data->>'student_name'), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'student_id', u.id,
        'student_name', coalesce(nullif(trim(u.full_name), ''), u.username),
        'username', u.username,
        'class_name', coalesce(nullif(trim(c.class_code), ''), nullif(trim(u.batch), ''), '—'),
        'grade', coalesce(c.grade_level::text, nullif(trim(u.grade::text), '')),
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
      group by u.id, u.full_name, u.username, u.batch, u.grade, u.school_id, c.class_code, c.grade_level
    ) rows;
    return v_result;
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'grade', row_data->>'class_name', row_data->>'student_name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'student_id', u.id,
      'student_name', coalesce(nullif(trim(u.full_name), ''), u.username),
      'username', u.username,
      'class_name', coalesce(nullif(trim(c.class_code), ''), nullif(trim(u.batch), ''), '—'),
      'grade', coalesce(c.grade_level::text, nullif(trim(u.grade::text), '')),
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
    group by u.id, u.full_name, u.username, u.batch, u.grade, u.school_id, c.class_code, c.grade_level
  ) rows;

  return v_result;
end;
$$;

revoke all on function public.rpc_teacher_academic_profile_students() from public, anon;
grant execute on function public.rpc_teacher_academic_profile_students() to authenticated, service_role;

create or replace function public.rpc_school_guardian_management_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_school_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id = v_caller and sm.status='active' and sm.role_in_school='school_admin'
  order by sm.is_owner desc, sm.joined_at
  limit 1;
  if v_school_id is null then raise exception 'School administration access required'; end if;

  select jsonb_build_object(
    'school_id', v_school_id,
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', u.id,
        'student_name', coalesce(nullif(trim(u.full_name),''),u.username),
        'class_name', coalesce(nullif(trim(c.class_code),''),nullif(trim(u.batch),''),'—'),
        'grade', coalesce(c.grade_level::text, nullif(trim(u.grade::text), ''))
      ) order by coalesce(c.grade_level::text,u.grade::text), coalesce(c.class_code,u.batch), coalesce(u.full_name,u.username))
      from public.school_members sm
      join public.users u on u.id=sm.user_id and u.school_id=sm.school_id
      left join public.class_students cs on cs.student_id=u.id
      left join public.classes c on c.id=cs.class_id and c.school_id=v_school_id and c.is_active is true
      where sm.school_id=v_school_id and sm.status='active' and sm.role_in_school='student'
    ),'[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'student_id',r.student_id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'guardian_user_id',r.guardian_user_id,
        'guardian_email',ga.primary_email,
        'guardian_name',ga.display_name,
        'relationship_label',r.relationship_label,
        'status',r.status,'verified_at',r.verified_at,'revoked_at',r.revoked_at
      ) order by r.created_at desc)
      from public.student_guardian_relationships r
      join public.users u on u.id=r.student_id
      left join public.guardian_accounts ga on ga.user_id=r.guardian_user_id
      where r.school_id=v_school_id
    ),'[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'student_id',i.student_id,
        'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'invited_email',i.invited_email,'relationship_label',i.relationship_label,
        'expires_at',i.expires_at,'created_at',i.created_at,
        'claimed_at',i.claimed_at,'revoked_at',i.revoked_at,
        'status',case when i.revoked_at is not null then 'revoked' when i.claimed_at is not null then 'claimed' when i.expires_at < now() then 'expired' else 'pending' end
      ) order by i.created_at desc)
      from public.guardian_invitations i
      join public.users u on u.id=i.student_id
      where i.school_id=v_school_id
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.rpc_school_guardian_management_snapshot() from public, anon, authenticated;
grant execute on function public.rpc_school_guardian_management_snapshot() to authenticated, service_role;
