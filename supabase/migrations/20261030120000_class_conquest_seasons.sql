-- Class Conquest seasons: a different map every week, a frozen record of each
-- finished week (winning class + its top five students), a Hall of Fame feed,
-- and a Monday-morning announcement push.
--
-- Scores are frozen once, server-side, into class_conquest_results. Certificates,
-- badges and history all read from that snapshot, never from live tables.
--
-- The map rotation is mirrored in src/lib/classConquest.ts (CONQUEST_SEASON);
-- tests/classConquest.test.ts checks that both lists stay identical.

create table if not exists public.class_conquest_results (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  grade            text not null,
  week_start       date not null,
  map_id           text not null,
  winner_class_id  uuid,
  winner_label     text,
  winner_members   uuid[] not null default '{}',
  standings        jsonb not null default '[]'::jsonb,
  top_students     jsonb not null default '[]'::jsonb,
  finalized_at     timestamptz not null default now(),
  unique (school_id, grade, week_start)
);

comment on table public.class_conquest_results is
  'Frozen weekly Class Conquest outcome per school and grade. Read through RPCs only.';

alter table public.class_conquest_results enable row level security;
-- No policies on purpose: fail closed. rpc_get_class_conquest_history is the only reader.
revoke all on table public.class_conquest_results from public, anon, authenticated;

-- ─────────────────────────── map rotation ───────────────────────────

create or replace function private.class_conquest_map_for_week(p_week_start date)
returns text language sql immutable set search_path = '' as $$
  -- Weeks before the season started were all played on Kyrgyzstan.
  select case when p_week_start < date '2026-10-26' then 'kyrgyzstan' else
    (array['kyrgyzstan','unitedkingdom','kazakhstan','japan','egypt','usa'])[((p_week_start - date '2026-10-26') / 7) % 6 + 1]
  end
$$;
revoke all on function private.class_conquest_map_for_week(date) from public, anon, authenticated;

create or replace function private.class_conquest_map_label(p_map_id text)
returns text language sql immutable set search_path = '' as $$
  select case p_map_id
    when 'kyrgyzstan' then '🇰🇬 Kyrgyzstan'
    when 'unitedkingdom' then '🇬🇧 United Kingdom'
    when 'kazakhstan' then '🇰🇿 Kazakhstan'
    when 'japan' then '🇯🇵 Japan'
    when 'egypt' then '🇪🇬 Egypt'
    when 'usa' then '🇺🇸 United States'
    else p_map_id end
$$;
revoke all on function private.class_conquest_map_label(text) from public, anon, authenticated;

-- ─────────────────────────── freezing a week ───────────────────────────

-- Freeze one school+grade for one finished week. Idempotent: a second call does nothing.
-- Returns the result id when a row was written, null otherwise.
create or replace function private.class_conquest_finalize_week(p_school uuid, p_grade text, p_week_start date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week_end date := p_week_start + 6;
  v_standings jsonb;
  v_winner uuid;
  v_winner_label text;
  v_members uuid[];
  v_top jsonb;
  v_id uuid;
  v_map text := private.class_conquest_map_for_week(p_week_start);
  v_next text := private.class_conquest_map_for_week(p_week_start + 7);
  v_rec record;
  v_role text;
begin
  if p_week_start is null or p_week_start >= date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date then
    return null; -- never freeze a week that is still being played
  end if;
  if exists (select 1 from public.class_conquest_results r where r.school_id = p_school and r.grade = p_grade and r.week_start = p_week_start) then
    return null;
  end if;

  with members as (
    select c.id as class_id, coalesce(nullif(c.class_name, ''), c.class_code) as label, cs.student_id
    from public.classes c
    join public.class_students cs on cs.class_id = c.id
    join public.users u on u.id = cs.student_id and u.role = 'student' and not coalesce(u.is_banned, false)
    where c.school_id = p_school and c.grade_level = p_grade and coalesce(c.is_active, true)
  ),
  teams as (
    select class_id, label, count(distinct student_id)::int as size
    from members group by class_id, label
    having count(distinct student_id) >= 2
  ),
  done as (
    select m.class_id, dm.mission_date, count(*)::int as n
    from members m
    join public.daily_missions dm on dm.user_id = m.student_id
    where dm.completed_at is not null and dm.mission_date between p_week_start and v_week_end
    group by m.class_id, dm.mission_date
  ),
  power as (
    select t.class_id, t.label, t.size,
      coalesce((select sum(round(100.0 * least(d.n, t.size) / t.size))::int from done d where d.class_id = t.class_id), 0) as power,
      coalesce((select sum(d.n)::int from done d where d.class_id = t.class_id), 0) as missions
    from teams t
  ),
  ranked as (
    select p.*, row_number() over (order by p.power desc, p.missions desc, p.label) as rank from power p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', r.class_id, 'label', r.label, 'size', r.size,
           'power', r.power, 'missions', r.missions, 'rank', r.rank) order by r.rank), '[]'::jsonb)
  into v_standings
  from ranked r;

  if jsonb_array_length(v_standings) < 2 then
    return null; -- nobody to compete with that week
  end if;

  -- A week where nobody did anything has no winner, but is still recorded.
  if (v_standings -> 0 ->> 'power')::int > 0 then
    v_winner := (v_standings -> 0 ->> 'class_id')::uuid;
    v_winner_label := v_standings -> 0 ->> 'label';

    select coalesce(array_agg(cs.student_id), '{}')
    into v_members
    from public.class_students cs
    join public.users u on u.id = cs.student_id and u.role = 'student' and not coalesce(u.is_banned, false)
    where cs.class_id = v_winner;

    with weekly as (
      select dm.user_id, count(*)::int as missions, coalesce(sum(dm.correct_count), 0)::int as correct, max(dm.completed_at) as last_done
      from public.daily_missions dm
      where dm.user_id = any (v_members) and dm.completed_at is not null
        and dm.mission_date between p_week_start and v_week_end
      group by dm.user_id
    ),
    top5 as (
      select w.*, u.avatar_url, coalesce(nullif(u.full_name, ''), nullif(u.username, ''), 'Student') as name,
        row_number() over (order by w.missions desc, w.correct desc, w.last_done asc, lower(coalesce(u.username, '')), w.user_id) as rank
      from weekly w join public.users u on u.id = w.user_id
      order by rank limit 5
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'student_id', t.user_id, 'name', t.name, 'avatar_url', t.avatar_url,
             'missions', t.missions, 'correct', t.correct, 'rank', t.rank) order by t.rank), '[]'::jsonb)
    into v_top
    from top5 t;
  else
    v_members := '{}';
    v_top := '[]'::jsonb;
  end if;

  insert into public.class_conquest_results (school_id, grade, week_start, map_id, winner_class_id, winner_label, winner_members, standings, top_students)
  values (p_school, p_grade, p_week_start, v_map, v_winner, v_winner_label, v_members, v_standings, v_top)
  on conflict (school_id, grade, week_start) do nothing
  returning id into v_id;

  if v_id is null or v_winner is null then
    return v_id;
  end if;

  -- Monday-morning announcement. enqueue_game_push respects quiet hours and each student's preference.
  for v_rec in
    select m.sid, t.rank
    from unnest(v_members) as m(sid)
    left join jsonb_to_recordset(v_top) as t(student_id uuid, rank int) on t.student_id = m.sid
  loop
    if v_rec.rank is not null then
      v_role := (array['Mastermind', 'Strategist', 'Safecracker', 'Lookout', 'Getaway Driver'])[v_rec.rank];
      perform private.enqueue_game_push(
        v_rec.sid, 'class_conquest_winner',
        format('🏆 You are the %s of Grade %s!', v_role, p_grade),
        format('%s conquered %s. Your certificate is ready. Next map: %s — missions count from Monday.',
               v_winner_label, private.class_conquest_map_label(v_map), private.class_conquest_map_label(v_next)),
        '/', format('ccq:%s:%s', v_id, v_rec.sid),
        jsonb_build_object('result_id', v_id, 'rank', v_rec.rank, 'map_id', v_map, 'next_map_id', v_next));
    else
      perform private.enqueue_game_push(
        v_rec.sid, 'class_conquest_winner',
        format('🏆 %s conquered %s!', v_winner_label, private.class_conquest_map_label(v_map)),
        format('Your class won Class Conquest. Next map: %s — every daily mission from Monday counts.',
               private.class_conquest_map_label(v_next)),
        '/', format('ccq:%s:%s', v_id, v_rec.sid),
        jsonb_build_object('result_id', v_id, 'map_id', v_map, 'next_map_id', v_next));
    end if;
  end loop;

  return v_id;
end;
$$;
revoke all on function private.class_conquest_finalize_week(uuid, text, date) from public, anon, authenticated;

-- Freeze every school and grade for a finished week (default: last week, Bishkek time).
-- Safe to call from anywhere: refuses the current week and never rewrites a frozen one.
create or replace function public.rpc_finalize_class_conquest(p_week_start date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := coalesce(p_week_start, date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date - 7);
  v_rec record;
  v_count int := 0;
begin
  if v_week >= date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date then
    return 0;
  end if;
  for v_rec in
    select c.school_id, c.grade_level as grade
    from public.classes c
    where c.school_id is not null and c.grade_level is not null and coalesce(c.is_active, true)
    group by c.school_id, c.grade_level
    having count(*) >= 2
  loop
    if private.class_conquest_finalize_week(v_rec.school_id, v_rec.grade, v_week) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.rpc_finalize_class_conquest(date) from public, anon;
grant execute on function public.rpc_finalize_class_conquest(date) to authenticated;

-- Monday 00:15 Bishkek (Sunday 18:15 UTC). The read RPCs also freeze lazily, so a
-- missed cron run only delays the push announcement, never the result.
do $$
declare v_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  select jobid into v_job_id from cron.job where jobname = 'class-conquest-finalize' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('class-conquest-finalize', '15 18 * * 0', 'select public.rpc_finalize_class_conquest();');
end $$;

-- ─────────────────────────── reading ───────────────────────────

-- Who is asking, and which grade/class they belong to. Shared by the live and history RPCs.
create or replace function private.class_conquest_viewer(p_uid uuid, p_grade text)
returns table (role text, school_id uuid, grade text, my_class uuid, grades jsonb, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_school uuid;
  v_grade text;
  v_my_class uuid;
  v_grades jsonb := '[]'::jsonb;
begin
  select u.role, u.school_id into v_role, v_school
  from public.users u where u.id = p_uid and not coalesce(u.is_banned, false);
  if not found then return query select null::text, null::uuid, null::text, null::uuid, '[]'::jsonb, 'no_user'; return; end if;

  if v_role = 'student' then
    select c.id, c.school_id, c.grade_level into v_my_class, v_school, v_grade
    from public.class_students cs
    join public.classes c on c.id = cs.class_id
    where cs.student_id = p_uid and coalesce(c.is_active, true) and c.grade_level is not null
    order by cs.joined_at desc nulls last
    limit 1;
    if v_my_class is null then return query select 'student', v_school, null::text, null::uuid, '[]'::jsonb, 'no_class'; return; end if;
    return query select 'student', v_school, v_grade, v_my_class, jsonb_build_array(v_grade), null::text;
    return;
  end if;

  if v_role not in ('teacher', 'school_admin') then
    return query select v_role, v_school, null::text, null::uuid, '[]'::jsonb, 'not_allowed'; return;
  end if;
  if v_school is null then
    return query select 'teacher', null::uuid, null::text, null::uuid, '[]'::jsonb, 'no_school'; return;
  end if;

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
    select c.grade_level into v_grade
    from public.classes c
    left join public.teachers t on t.id = c.teacher_id
    left join public.class_teacher_assignments cta on cta.class_id = c.id and cta.active
    where c.school_id = v_school and v_grades ? c.grade_level
      and (t.user_id = p_uid or cta.teacher_user_id = p_uid)
    limit 1;
    if v_grade is null then v_grade := v_grades ->> 0; end if;
  end if;
  if v_grade is null then
    return query select 'teacher', v_school, null::text, null::uuid, v_grades, 'no_grade'; return;
  end if;
  return query select 'teacher', v_school, v_grade, null::uuid, v_grades, null::text;
end;
$$;
revoke all on function private.class_conquest_viewer(uuid, text) from public, anon, authenticated;

-- Live week. Now also freezes last week lazily and returns the map rotation and last week's result.
create or replace function public.rpc_get_class_conquest(p_grade text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_week_start date := date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date;
  v_viewer record;
  v_classes jsonb;
  v_last jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_viewer from private.class_conquest_viewer(v_uid, p_grade);
  if v_viewer.reason is not null then
    return jsonb_build_object('available', false, 'reason', v_viewer.reason, 'grades', coalesce(v_viewer.grades, '[]'::jsonb));
  end if;

  -- Freeze last week if the Monday job has not run yet (idempotent, cheap when already done).
  perform private.class_conquest_finalize_week(v_viewer.school_id, v_viewer.grade, v_week_start - 7);

  with members as (
    select c.id as class_id, coalesce(nullif(c.class_name, ''), c.class_code) as label, cs.student_id
    from public.classes c
    join public.class_students cs on cs.class_id = c.id
    join public.users u on u.id = cs.student_id and u.role = 'student' and not coalesce(u.is_banned, false)
    where c.school_id = v_viewer.school_id and c.grade_level = v_viewer.grade and coalesce(c.is_active, true)
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
    'is_mine', t.class_id = v_viewer.my_class,
    'days', (
      select jsonb_agg(jsonb_build_object('date', d.day, 'done', coalesce(x.n, 0)) order by d.day)
      from days d left join done x on x.class_id = t.class_id and x.day = d.day
    )
  ) order by t.label), '[]'::jsonb)
  into v_classes
  from teams t;

  if jsonb_array_length(v_classes) < 2 then
    return jsonb_build_object('available', false, 'reason', 'one_class', 'grade', v_viewer.grade, 'grades', v_viewer.grades);
  end if;

  if v_viewer.role = 'student' and not exists (
    select 1 from jsonb_array_elements(v_classes) e where (e ->> 'is_mine')::boolean
  ) then
    return jsonb_build_object('available', false, 'reason', 'class_too_small');
  end if;

  select jsonb_build_object(
    'week_start', r.week_start, 'map_id', r.map_id, 'grade', r.grade,
    'winner_class_id', r.winner_class_id, 'winner_label', r.winner_label,
    'standings', r.standings, 'top_students', r.top_students,
    'is_my_class', r.winner_class_id is not distinct from v_viewer.my_class,
    'my_rank', (select (s ->> 'rank')::int from jsonb_array_elements(r.top_students) s where (s ->> 'student_id')::uuid = v_uid limit 1))
  into v_last
  from public.class_conquest_results r
  where r.school_id = v_viewer.school_id and r.grade = v_viewer.grade and r.week_start = v_week_start - 7;

  return jsonb_build_object(
    'available', true,
    'grade', v_viewer.grade,
    'grades', v_viewer.grades,
    'week_start', v_week_start,
    'week_end', v_week_start + 6,
    'today', v_today,
    'days_until_reset', 8 - extract(isodow from v_today)::int,
    'map_id', private.class_conquest_map_for_week(v_week_start),
    'next_map_id', private.class_conquest_map_for_week(v_week_start + 7),
    'viewer', v_viewer.role,
    'classes', v_classes,
    'last_week', v_last
  );
end;
$$;
revoke all on function public.rpc_get_class_conquest(text) from public, anon;
grant execute on function public.rpc_get_class_conquest(text) to authenticated;

-- Hall of Fame: finished weeks for the viewer's school and grade, newest first,
-- plus the badges the viewer earned (gold = top five, silver = member of the winning class).
create or replace function public.rpc_get_class_conquest_history(p_grade text default null, p_limit integer default 26)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date := date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date;
  v_viewer record;
  v_results jsonb;
  v_badges jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_viewer from private.class_conquest_viewer(v_uid, p_grade);
  if v_viewer.reason is not null then
    return jsonb_build_object('available', false, 'reason', v_viewer.reason, 'grades', coalesce(v_viewer.grades, '[]'::jsonb));
  end if;

  perform private.class_conquest_finalize_week(v_viewer.school_id, v_viewer.grade, v_week_start - 7);

  select coalesce(jsonb_agg(jsonb_build_object(
    'week_start', r.week_start, 'map_id', r.map_id, 'grade', r.grade,
    'winner_class_id', r.winner_class_id, 'winner_label', r.winner_label,
    'standings', r.standings, 'top_students', r.top_students) order by r.week_start desc), '[]'::jsonb)
  into v_results
  from (
    select * from public.class_conquest_results r
    where r.school_id = v_viewer.school_id and r.grade = v_viewer.grade and r.week_start < v_week_start
    order by r.week_start desc
    limit greatest(1, least(coalesce(p_limit, 26), 104))
  ) r;

  if v_viewer.role = 'student' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'week_start', r.week_start, 'map_id', r.map_id, 'class_label', r.winner_label,
      'kind', case when t.rank is not null then 'gold' else 'silver' end,
      'rank', t.rank) order by r.week_start desc), '[]'::jsonb)
    into v_badges
    from public.class_conquest_results r
    left join lateral (
      select (s ->> 'rank')::int as rank from jsonb_array_elements(r.top_students) s
      where (s ->> 'student_id')::uuid = v_uid limit 1
    ) t on true
    where r.school_id = v_viewer.school_id and v_uid = any (r.winner_members);
  end if;

  return jsonb_build_object(
    'available', true,
    'grade', v_viewer.grade,
    'grades', v_viewer.grades,
    'viewer', v_viewer.role,
    'my_class', v_viewer.my_class,
    'results', v_results,
    'badges', v_badges
  );
end;
$$;
revoke all on function public.rpc_get_class_conquest_history(text, integer) from public, anon;
grant execute on function public.rpc_get_class_conquest_history(text, integer) to authenticated;
