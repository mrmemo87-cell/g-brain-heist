-- Class Conquest: a weekly class-vs-class game across one grade.
-- Separate from Clan Wars and Lockdown Mode (which are live, in-class games).
--
-- Each day a class earns power equal to the share of its students who finished
-- the daily mission (0-100), so small and large classes compete fairly. The
-- client turns weekly power into oblasts on the Kyrgyzstan map. Resets Monday.
--
-- Only aggregate counts per class are returned; no student names.

create or replace function public.rpc_get_class_conquest(p_grade text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz constant text := 'Asia/Bishkek';
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_week_start date := date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date;
  v_role text;
  v_school uuid;
  v_grade text;
  v_my_class uuid;
  v_grades jsonb := '[]'::jsonb;
  v_classes jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select u.role, u.school_id into v_role, v_school
  from public.users u where u.id = v_uid and not coalesce(u.is_banned, false);
  if not found then return jsonb_build_object('available', false, 'reason', 'no_user'); end if;

  if v_role = 'student' then
    select c.id, c.school_id, c.grade_level into v_my_class, v_school, v_grade
    from public.class_students cs
    join public.classes c on c.id = cs.class_id
    where cs.student_id = v_uid and coalesce(c.is_active, true) and c.grade_level is not null
    order by cs.joined_at desc nulls last
    limit 1;
    if v_my_class is null then return jsonb_build_object('available', false, 'reason', 'no_class'); end if;
  elsif v_role in ('teacher', 'school_admin') then
    if v_school is null then return jsonb_build_object('available', false, 'reason', 'no_school'); end if;

    -- Grades in this school that have at least two classes with two or more students.
    select coalesce(jsonb_agg(g order by nullif(regexp_replace(g, '\D', '', 'g'), '')::int nulls last, g), '[]'::jsonb)
      into v_grades
    from (
      select c.grade_level as g
      from public.classes c
      where c.school_id = v_school and coalesce(c.is_active, true) and c.grade_level is not null
        and (select count(*) from public.class_students cs join public.users u on u.id = cs.student_id
             where cs.class_id = c.id and u.role = 'student' and not coalesce(u.is_banned, false)) >= 2
      group by c.grade_level
      having count(*) >= 2
    ) grades;

    v_grade := p_grade;
    if v_grade is null or not (v_grades ? v_grade) then
      -- Default to a grade the teacher teaches, else the first available grade.
      select c.grade_level into v_grade
      from public.classes c
      left join public.teachers t on t.id = c.teacher_id
      left join public.class_teacher_assignments cta on cta.class_id = c.id and cta.active
      where c.school_id = v_school and v_grades ? c.grade_level
        and (t.user_id = v_uid or cta.teacher_user_id = v_uid)
      limit 1;
      if v_grade is null then v_grade := v_grades ->> 0; end if;
    end if;
    if v_grade is null then
      return jsonb_build_object('available', false, 'reason', 'no_grade', 'grades', v_grades);
    end if;
  else
    return jsonb_build_object('available', false, 'reason', 'not_allowed');
  end if;

  with members as (
    select c.id as class_id, coalesce(nullif(c.class_name, ''), c.class_code) as label, cs.student_id
    from public.classes c
    join public.class_students cs on cs.class_id = c.id
    join public.users u on u.id = cs.student_id and u.role = 'student' and not coalesce(u.is_banned, false)
    where c.school_id = v_school and c.grade_level = v_grade and coalesce(c.is_active, true)
  ),
  teams as (
    select class_id, label, count(distinct student_id)::int as size
    from members group by class_id, label
    having count(distinct student_id) >= 2
  ),
  days as (
    select d::date as day from generate_series(v_week_start, v_today, interval '1 day') d
  ),
  done as (
    select m.class_id, dm.mission_date as day, count(*)::int as n
    from members m
    join public.daily_missions dm on dm.user_id = m.student_id
    where dm.completed_at is not null and dm.mission_date between v_week_start and v_today
    group by m.class_id, dm.mission_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'class_id', t.class_id,
    'label', t.label,
    'size', t.size,
    'is_mine', t.class_id = v_my_class,
    'days', (
      select jsonb_agg(jsonb_build_object('date', d.day, 'done', coalesce(x.n, 0)) order by d.day)
      from days d left join done x on x.class_id = t.class_id and x.day = d.day
    )
  ) order by t.label), '[]'::jsonb)
  into v_classes
  from teams t;

  if jsonb_array_length(v_classes) < 2 then
    return jsonb_build_object('available', false, 'reason', 'one_class', 'grade', v_grade, 'grades', v_grades);
  end if;

  if v_role = 'student' and not exists (
    select 1 from jsonb_array_elements(v_classes) e where (e ->> 'is_mine')::boolean
  ) then
    return jsonb_build_object('available', false, 'reason', 'class_too_small');
  end if;

  return jsonb_build_object(
    'available', true,
    'grade', v_grade,
    'grades', v_grades,
    'week_start', v_week_start,
    'today', v_today,
    'days_until_reset', 8 - extract(isodow from v_today)::int,
    'viewer', case when v_role = 'student' then 'student' else 'teacher' end,
    'classes', v_classes
  );
end;
$$;

revoke all on function public.rpc_get_class_conquest(text) from public, anon;
grant execute on function public.rpc_get_class_conquest(text) to authenticated;
