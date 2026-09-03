-- Production cleanup for Superadmin platform operations.
-- 1) Keep Cambridge catalogue direct access locked down, but let verified superadmins
--    use the existing SECURITY DEFINER reports RPC across schools.
-- 2) Add a dedicated filtered Superadmin users RPC so role/school/grade/status filters
--    operate over the full platform dataset instead of one 50-row browser page.

create or replace function public.get_school_cambridge_scores(p_limit integer default 100)
returns table(
  id uuid,
  student_id uuid,
  student_name text,
  student_class text,
  quiz_name text,
  test_id text,
  quiz_version text,
  attempt_number integer,
  attempt_status text,
  score integer,
  total_questions integer,
  percentage integer,
  answers jsonb,
  time_taken_seconds integer,
  submitted_at timestamptz,
  scores_released boolean,
  released_at timestamptz,
  school_id uuid,
  test_subject text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_role text;
  v_academic_year_id uuid;
  v_is_superadmin boolean := false;
begin
  if v_actor is null then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  v_is_superadmin := public.is_superadmin(v_actor);

  select u.school_id, u.role
  into v_school_id, v_role
  from public.users u
  where u.id = v_actor;

  if not v_is_superadmin then
    if v_school_id is null or v_role not in ('teacher', 'admin', 'school_admin') then
      raise exception 'Access denied' using errcode = '42501';
    end if;

    if not public.school_has_module_access(v_school_id, 'cambridge') then
      raise exception 'Cambridge is not included in this school agreement' using errcode = '42501';
    end if;

    select y.id
    into v_academic_year_id
    from public.school_academic_years y
    where y.school_id = v_school_id
      and y.status = 'current'
    order by y.starts_on desc, y.id
    limit 1;
  end if;

  return query
  select
    qs.id,
    qs.student_id,
    coalesce(nullif(trim(su.full_name), ''), qs.student_name),
    coalesce(cc.class_code, qs.student_class),
    qs.quiz_name,
    qs.test_id,
    qs.quiz_version,
    qs.attempt_number,
    qs.attempt_status,
    qs.score,
    qs.total_questions,
    qs.percentage,
    qs.answers,
    qs.time_taken_seconds,
    qs.submitted_at,
    coalesce(qs.scores_released, false),
    qs.released_at,
    qs.school_id,
    coalesce(ct.curriculum_subject, ct.subject)
  from public.quiz_scores qs
  left join public.cambridge_tests ct
    on ct.id = qs.test_id
    or lower(trim(ct.name)) = lower(trim(qs.quiz_name))
  left join public.users su
    on su.id = qs.student_id
    and su.school_id = qs.school_id
  left join lateral (
    select c.class_code
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
      and c.school_id = qs.school_id
    where cs.student_id = qs.student_id
      and (
        v_is_superadmin
        or v_role in ('admin', 'school_admin')
        or exists (
          select 1
          from public.class_teacher_assignments x
          where x.class_id = c.id
            and x.teacher_user_id = v_actor
            and x.school_id = qs.school_id
            and x.active
            and x.can_grade
            and public.cambridge_assignment_matches_test(x.subject, qs.test_id, qs.quiz_name)
        )
      )
    order by c.class_code
    limit 1
  ) cc on true
  where (v_is_superadmin or qs.school_id = v_school_id)
    and qs.attempt_status in ('submitted', 'released')
    and (v_is_superadmin or v_academic_year_id is null or qs.academic_year_id = v_academic_year_id)
    and (
      v_is_superadmin
      or v_role in ('admin', 'school_admin')
      or exists (
        select 1
        from public.class_teacher_assignments cta
        join public.classes c
          on c.id = cta.class_id
          and c.school_id = qs.school_id
        where cta.teacher_user_id = v_actor
          and cta.school_id = qs.school_id
          and cta.active
          and cta.can_grade
          and (
            exists (
              select 1
              from public.class_students cs
              where cs.class_id = cta.class_id
                and cs.student_id = qs.student_id
            )
            or (
              qs.student_id is null
              and (c.class_code = qs.student_class or c.class_name = qs.student_class)
            )
          )
          and public.cambridge_assignment_matches_test(cta.subject, qs.test_id, qs.quiz_name)
      )
    )
  order by qs.submitted_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
end;
$$;

revoke all on function public.get_school_cambridge_scores(integer) from public, anon;
grant execute on function public.get_school_cambridge_scores(integer) to authenticated;

create or replace function public.rpc_superadmin_list_users(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_role text default null,
  p_grade integer default null,
  p_school_id uuid default null,
  p_status text default null,
  p_sort text default 'last-active'
)
returns table(
  id uuid,
  username text,
  email text,
  avatar_url text,
  grade text,
  batch text,
  xp integer,
  coins integer,
  streak integer,
  gemstones integer,
  ap_now integer,
  ap_max integer,
  attack_power integer,
  defense_power integer,
  is_banned boolean,
  is_admin boolean,
  role text,
  level integer,
  school_id uuid,
  school_name text,
  last_seen timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_role text := nullif(lower(trim(coalesce(p_role, ''))), '');
  v_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
  v_sort text := lower(trim(coalesce(p_sort, 'last-active')));
begin
  if v_actor is null or not public.is_superadmin(v_actor) then
    raise exception 'platform_administrator_access_required' using errcode = '42501';
  end if;

  if v_role = 'all' then v_role := null; end if;
  if v_status = 'all' then v_status := null; end if;
  if v_status not in ('active', 'banned') then v_status := null; end if;
  if v_sort not in ('last-active', 'name', 'xp', 'level') then v_sort := 'last-active'; end if;

  return query
  select
    u.id,
    u.username,
    coalesce(au.email, u.email),
    u.avatar_url,
    u.grade,
    u.batch,
    coalesce(u.xp, 0),
    coalesce(u.coins, 0),
    coalesce(u.streak, 0),
    coalesce(u.gemstones, 0),
    coalesce(u.ap_now, 0),
    coalesce(u.ap_max, 0),
    coalesce(u.attack_power, 0),
    coalesce(u.defense_power, 0),
    coalesce(u.is_banned, false),
    coalesce(u.is_admin, false),
    coalesce(u.role, 'student'),
    coalesce(u.level, 1),
    u.school_id,
    s.name,
    u.last_seen
  from public.users u
  left join auth.users au on au.id = u.id
  left join public.schools s on s.id = u.school_id
  where (
      v_search is null
      or coalesce(u.username, '') ilike '%' || v_search || '%'
      or coalesce(au.email, u.email, '') ilike '%' || v_search || '%'
      or coalesce(u.batch, '') ilike '%' || v_search || '%'
      or coalesce(s.name, '') ilike '%' || v_search || '%'
    )
    and (v_role is null or lower(coalesce(u.role, 'student')) = v_role)
    and (p_grade is null or trim(coalesce(u.grade, '')) = p_grade::text)
    and (p_school_id is null or u.school_id = p_school_id)
    and (
      v_status is null
      or (v_status = 'active' and not coalesce(u.is_banned, false))
      or (v_status = 'banned' and coalesce(u.is_banned, false))
    )
  order by
    case when v_sort = 'name' then lower(coalesce(u.username, au.email, u.email, '')) end asc nulls last,
    case when v_sort = 'xp' then coalesce(u.xp, 0) end desc nulls last,
    case when v_sort = 'level' then coalesce(u.level, 0) end desc nulls last,
    case when v_sort = 'last-active' then u.last_seen end desc nulls last,
    u.id
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.rpc_superadmin_list_users(integer, integer, text, text, integer, uuid, text, text) from public, anon;
grant execute on function public.rpc_superadmin_list_users(integer, integer, text, text, integer, uuid, text, text) to authenticated;

comment on function public.rpc_superadmin_list_users(integer, integer, text, text, integer, uuid, text, text) is
  'Superadmin-only paged user list with server-side search/filter/sort across the full platform dataset.';
