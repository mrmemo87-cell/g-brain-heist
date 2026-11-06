-- Class Conquest for schools with one class per grade: grade vs grade.
--
-- A grade normally battles class against class. When a grade has fewer than two
-- classes with two or more students, it has no opponent, so the card never showed
-- (every partner school, and Silk Road grade 12). Those grades now join the school's
-- "school" arena, where each grade is one team ("Grade 7" vs "Grade 8"), scored the
-- same way (power per student, so big and small grades compete fairly).
--
-- The arena is stored in the existing grade column as 'school'. A grade team is
-- identified by its largest class, so predictions and cheers keep their foreign keys.

-- Active classes of a school with their student count.
create or replace function private.class_conquest_class_sizes(p_school uuid)
returns table (class_id uuid, label text, grade text, size int)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, coalesce(nullif(c.class_name, ''), c.class_code), c.grade_level,
    (select count(distinct cs.student_id)::int
     from public.class_students cs
     join public.users u on u.id = cs.student_id and u.role = 'student' and not coalesce(u.is_banned, false)
     where cs.class_id = c.id)
  from public.classes c
  where c.school_id = p_school and c.grade_level is not null and coalesce(c.is_active, true);
$$;

-- Grades of a school that have their own class-vs-class battle.
create or replace function private.class_conquest_battle_grades(p_school uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select s.grade from private.class_conquest_class_sizes(p_school) s
  where s.size >= 2 group by s.grade having count(*) >= 2;
$$;

-- Who plays for which team in an arena: a grade (class vs class) or 'school' (grade vs grade).
create or replace function private.class_conquest_members(p_school uuid, p_arena text)
returns table (class_id uuid, label text, student_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, coalesce(nullif(c.class_name, ''), c.class_code), cs.student_id
  from public.classes c
  join public.class_students cs on cs.class_id = c.id
  join public.users u on u.id = cs.student_id and u.role = 'student' and not coalesce(u.is_banned, false)
  where p_arena is distinct from 'school' and c.school_id = p_school and c.grade_level = p_arena and coalesce(c.is_active, true)
  union all
  select x.team_id, x.label, x.student_id
  from (
    select distinct on (cs.student_id) rep.class_id as team_id, 'Grade ' || c.grade_level as label, cs.student_id
    from public.classes c
    join public.class_students cs on cs.class_id = c.id
    join public.users u on u.id = cs.student_id and u.role = 'student' and not coalesce(u.is_banned, false)
    join lateral (
      select s.class_id from private.class_conquest_class_sizes(p_school) s
      where s.grade = c.grade_level order by s.size desc, s.label, s.class_id limit 1
    ) rep on true
    where p_arena = 'school' and c.school_id = p_school and c.grade_level is not null and coalesce(c.is_active, true)
      and c.grade_level not in (select g from private.class_conquest_battle_grades(p_school) g)
    order by cs.student_id, cs.joined_at desc nulls last
  ) x;
$$;

-- How an arena is named in notifications.
create or replace function private.class_conquest_arena_name(p_arena text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_arena = 'school' then 'All Grades' else 'Grade ' || p_arena end;
$$;

-- Number of teams (two or more students) in an arena.
create or replace function private.class_conquest_team_count(p_school uuid, p_arena text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from (
    select m.class_id from private.class_conquest_members(p_school, p_arena) m
    group by m.class_id having count(distinct m.student_id) >= 2
  ) t;
$$;

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
  v_own_grade text;
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
    -- No class battle in this grade: the student plays for their grade in the school arena.
    if not exists (select 1 from private.class_conquest_battle_grades(v_school) g where g = v_grade) then
      v_grade := 'school';
      select m.class_id into v_my_class from private.class_conquest_members(v_school, 'school') m where m.student_id = p_uid limit 1;
      if v_my_class is null then return query select 'student', v_school, null::text, null::uuid, '[]'::jsonb, 'no_class'; return; end if;
    end if;
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
  from private.class_conquest_battle_grades(v_school) g;
  if private.class_conquest_team_count(v_school, 'school') >= 2 then
    v_grades := v_grades || jsonb_build_array('school');
  end if;

  v_grade := p_grade;
  if v_grade is null or not (v_grades ? v_grade) then
    select c.grade_level into v_own_grade
    from public.classes c
    left join public.teachers t on t.id = c.teacher_id
    left join public.class_teacher_assignments cta on cta.class_id = c.id and cta.active
    where c.school_id = v_school and c.grade_level is not null and coalesce(c.is_active, true)
      and (t.user_id = p_uid or cta.teacher_user_id = p_uid)
    order by (v_grades ? c.grade_level) desc
    limit 1;
    v_grade := case
      when v_own_grade is not null and v_grades ? v_own_grade then v_own_grade
      when v_own_grade is not null and v_grades ? 'school' then 'school'
      else v_grades ->> 0 end;
  end if;
  if v_grade is null then
    return query select 'teacher', v_school, null::text, null::uuid, v_grades, 'no_grade'; return;
  end if;
  return query select 'teacher', v_school, v_grade, null::uuid, v_grades, null::text;
end;
$$;
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
  v_scoring_end date := date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date + 4;
  v_sealed boolean := (now() at time zone 'Asia/Bishkek')::date > date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date + 4;
  v_result_week date;
  v_viewer record;
  v_classes jsonb;
  v_last jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_viewer from private.class_conquest_viewer(v_uid, p_grade);
  if v_viewer.reason is not null then
    return jsonb_build_object('available', false, 'reason', v_viewer.reason, 'grades', coalesce(v_viewer.grades, '[]'::jsonb));
  end if;

  -- The latest closed week: this one on the weekend, otherwise last week.
  v_result_week := case when v_sealed then v_week_start else v_week_start - 7 end;
  -- Freeze it if the Saturday job has not run yet (idempotent, cheap when already done),
  -- and seal the weekend activity once Monday arrives.
  perform private.class_conquest_finalize_week(v_viewer.school_id, v_viewer.grade, v_result_week);
  perform private.class_conquest_seal_weekend(v_viewer.school_id, v_viewer.grade, v_result_week);

  with members as (
    select m.class_id, m.label, m.student_id from private.class_conquest_members(v_viewer.school_id, v_viewer.grade) m
  ),
  teams as (
    select class_id, label, count(distinct student_id)::int as size
    from members group by class_id, label
    having count(distinct student_id) >= 2
  ),
  days as (
    select d::date as day from generate_series(v_week_start, least(v_today, v_scoring_end), interval '1 day') d
  ),
  done as (
    select m.class_id, dm.mission_date as day, count(*)::int as n
    from members m
    join public.daily_missions dm on dm.user_id = m.student_id
    where dm.completed_at is not null and dm.mission_date between v_week_start and least(v_today, v_scoring_end)
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

  -- Teachers see a frozen result at once (to print certificates before Monday);
  -- students only from Monday, so the weekend stays sealed.
  if v_viewer.role = 'teacher' or v_today >= v_result_week + 7 then
    select jsonb_build_object(
      'week_start', r.week_start, 'map_id', r.map_id, 'grade', r.grade,
      'winner_class_id', r.winner_class_id, 'winner_label', r.winner_label,
      'standings', r.standings, 'top_students', r.top_students, 'weekend', r.weekend,
      'revealed', v_today >= r.week_start + 7,
      'is_my_class', r.winner_class_id is not distinct from v_viewer.my_class,
      'my_rank', (select (s ->> 'rank')::int from jsonb_array_elements(r.top_students) s where (s ->> 'student_id')::uuid = v_uid limit 1))
    into v_last
    from public.class_conquest_results r
    where r.school_id = v_viewer.school_id and r.grade = v_viewer.grade and r.week_start = v_result_week
      and r.week_start >= date '2026-10-26'; -- the season starts 26 Oct; ignore pre-season rows
  end if;

  return jsonb_build_object(
    'available', true,
    'grade', v_viewer.grade,
    'grades', v_viewer.grades,
    'week_start', v_week_start,
    'week_end', v_scoring_end,
    'today', v_today,
    'phase', case when v_sealed then 'sealed' else 'battle' end,
    'days_left', greatest(0, v_scoring_end - v_today + 1),
    'days_until_reset', 8 - extract(isodow from v_today)::int,
    'seals_at', (v_scoring_end + time '23:59:59') at time zone 'Asia/Bishkek',
    'reveal_at', ((v_week_start + 7) + time '07:00') at time zone 'Asia/Bishkek',
    'map_id', private.class_conquest_map_for_week(v_week_start),
    'next_map_id', private.class_conquest_map_for_week(v_week_start + 7),
    'viewer', v_viewer.role,
    -- During the sealed weekend students get no standings at all: no spoilers.
    'classes', case when v_sealed and v_viewer.role = 'student' then '[]'::jsonb else v_classes end,
    'my_class', v_viewer.my_class,
    'last_week', v_last
  );
end;
$$;

create or replace function private.class_conquest_finalize_week(p_school uuid, p_grade text, p_week_start date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_week_end date := p_week_start + 4; -- Friday: the weekend does not score
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
  if p_week_start is null or v_today < p_week_start + 5 then
    return null; -- never freeze a week before its Friday is over
  end if;
  if p_week_start < date '2026-10-26' then
    return null; -- the season starts with the week of 26 Oct 2026; earlier weeks were never announced
  end if;
  if exists (select 1 from public.class_conquest_results r where r.school_id = p_school and r.grade = p_grade and r.week_start = p_week_start) then
    return null;
  end if;

  with members as (
    select m.class_id, m.label, m.student_id from private.class_conquest_members(p_school, p_grade) m
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

    select coalesce(array_agg(distinct m.student_id), '{}')
    into v_members
    from private.class_conquest_members(p_school, p_grade) m
    where m.class_id = v_winner;

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

  -- The announcement is held until Monday 07:00 Bishkek (quiet hours push 00:30 → 07:00),
  -- so the weekend stays suspenseful. enqueue_game_push respects each student's preference.
  for v_rec in
    select m.sid, t.rank
    from unnest(v_members) as m(sid)
    left join jsonb_to_recordset(v_top) as t(student_id uuid, rank int) on t.student_id = m.sid
  loop
    if v_rec.rank is not null then
      v_role := (array['Mastermind', 'Strategist', 'Safecracker', 'Lookout', 'Getaway Driver'])[v_rec.rank];
      perform private.enqueue_game_push(
        v_rec.sid, 'class_conquest_winner',
        format('🏆 You are the %s of %s!', v_role, private.class_conquest_arena_name(p_grade)),
        format('%s conquered %s. Your certificate is ready. Next map: %s — missions count from today.',
               v_winner_label, private.class_conquest_map_label(v_map), private.class_conquest_map_label(v_next)),
        '/', format('ccq:%s:%s', v_id, v_rec.sid),
        jsonb_build_object('result_id', v_id, 'rank', v_rec.rank, 'map_id', v_map, 'next_map_id', v_next),
        ((p_week_start + 7) + time '00:30') at time zone 'Asia/Bishkek');
    else
      perform private.enqueue_game_push(
        v_rec.sid, 'class_conquest_winner',
        format('🏆 %s conquered %s!', v_winner_label, private.class_conquest_map_label(v_map)),
        format(case when p_grade = 'school' then 'Your grade won Class Conquest. Next map: %s — every daily mission from today counts.' else 'Your class won Class Conquest. Next map: %s — every daily mission from today counts.' end,
               private.class_conquest_map_label(v_next)),
        '/', format('ccq:%s:%s', v_id, v_rec.sid),
        jsonb_build_object('result_id', v_id, 'map_id', v_map, 'next_map_id', v_next),
        ((p_week_start + 7) + time '00:30') at time zone 'Asia/Bishkek');
    end if;
  end loop;

  return v_id;
end;
$$;

create or replace function private.class_conquest_raids(p_school uuid, p_grade text, p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with members as (
    select m.class_id, m.label, m.student_id from private.class_conquest_members(p_school, p_grade) m
  ),
  raids as (
    select att.class_id, att.label, a.kind, a.actor_id
    from public.activities a
    join members att on att.student_id = a.actor_id
    join members def on def.student_id = a.target_id and def.class_id <> att.class_id
    where a.kind in ('pvp_win', 'pvp_loss', 'pvp_blocked')
      and a.created_at >= ((p_week_start + 5) + time '00:00') at time zone 'Asia/Bishkek'
      and a.created_at <  ((p_week_start + 7) + time '00:00') at time zone 'Asia/Bishkek'
  ),
  per_class as (
    select m.class_id, m.label,
      count(r.actor_id) filter (where r.kind = 'pvp_win')::int as wins,
      count(r.actor_id)::int as raids
    from (select distinct class_id, label from members) m
    left join raids r on r.class_id = m.class_id
    group by m.class_id, m.label
  ),
  top_raiders as (
    select u.username, r.label, count(*)::int as wins
    from raids r join public.users u on u.id = r.actor_id
    where r.kind = 'pvp_win'
    group by u.username, r.label
    order by wins desc, u.username
    limit 5
  )
  select jsonb_build_object(
    'classes', coalesce((select jsonb_agg(jsonb_build_object('class_id', class_id, 'label', label, 'wins', wins, 'raids', raids) order by wins desc, raids desc, label) from per_class), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', username, 'class_label', label, 'wins', wins)) from top_raiders), '[]'::jsonb)
  );
$$;

create or replace function private.class_conquest_seal_weekend(p_school uuid, p_grade text, p_week_start date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_raids jsonb;
  v_predictions jsonb;
  v_cheers jsonb;
  v_oracles int;
  v_winner uuid;
begin
  if p_week_start is null or v_today < p_week_start + 7 then return; end if;
  if not exists (select 1 from public.class_conquest_results r where r.school_id = p_school and r.grade = p_grade and r.week_start = p_week_start and r.weekend is null) then
    return;
  end if;
  select r.winner_class_id into v_winner from public.class_conquest_results r
  where r.school_id = p_school and r.grade = p_grade and r.week_start = p_week_start;

  v_raids := private.class_conquest_raids(p_school, p_grade, p_week_start);

  select coalesce(jsonb_agg(jsonb_build_object('class_id', x.class_id, 'label', x.label, 'count', x.n) order by x.n desc, x.label), '[]'::jsonb)
  into v_predictions
  from (
    select p.predicted_class_id as class_id, coalesce(t.label, nullif(c.class_name, ''), c.class_code) as label, count(*)::int as n
    from public.class_conquest_predictions p join public.classes c on c.id = p.predicted_class_id
    left join (select distinct m.class_id, m.label from private.class_conquest_members(p_school, p_grade) m) t on t.class_id = p.predicted_class_id
    where p.school_id = p_school and p.grade = p_grade and p.week_start = p_week_start
    group by p.predicted_class_id, t.label, c.class_name, c.class_code
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', x.class_id, 'label', x.label, 'count', x.n) order by x.n desc, x.label), '[]'::jsonb)
  into v_cheers
  from (
    select h.class_id, coalesce(t.label, nullif(c.class_name, ''), c.class_code) as label, count(*)::int as n
    from public.class_conquest_cheers h join public.classes c on c.id = h.class_id
    left join (select distinct m.class_id, m.label from private.class_conquest_members(p_school, p_grade) m) t on t.class_id = h.class_id
    where h.school_id = p_school and h.grade = p_grade and h.week_start = p_week_start
    group by h.class_id, t.label, c.class_name, c.class_code
  ) x;

  select count(*)::int into v_oracles from public.class_conquest_predictions p
  where p.school_id = p_school and p.grade = p_grade and p.week_start = p_week_start and v_winner is not null and p.predicted_class_id = v_winner;

  update public.class_conquest_results r
  set weekend = jsonb_build_object(
    'raids', v_raids -> 'classes',
    'top_raiders', v_raids -> 'top',
    'raid_champion_class_id', case when (v_raids -> 'classes' -> 0 ->> 'wins')::int > 0 then (v_raids -> 'classes' -> 0 ->> 'class_id')::uuid end,
    'raid_champion_label', case when (v_raids -> 'classes' -> 0 ->> 'wins')::int > 0 then v_raids -> 'classes' -> 0 ->> 'label' end,
    'predictions', v_predictions,
    'cheers', v_cheers,
    'oracles', v_oracles)
  where r.school_id = p_school and r.grade = p_grade and r.week_start = p_week_start and r.weekend is null;
end;
$$;

create or replace function public.rpc_class_conquest_cheer(p_class_id uuid, p_cheer_code text)
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
  v_last timestamptz;
  v_count int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_viewer from private.class_conquest_viewer(v_uid, null);
  if v_viewer.reason is not null or v_viewer.role <> 'student' then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_viewer.reason, 'students_only'));
  end if;
  if v_today <= v_week_start + 4 then
    return jsonb_build_object('ok', false, 'reason', 'not_sealed');
  end if;
  if p_cheer_code not in ('all_the_way','unstoppable','gg','next_map','respect','comeback','mastermind','sweating') then
    return jsonb_build_object('ok', false, 'reason', 'bad_cheer');
  end if;
  if not exists (select 1 from private.class_conquest_members(v_viewer.school_id, v_viewer.grade) m where m.class_id = p_class_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_in_grade');
  end if;
  select max(h.created_at), count(*)::int into v_last, v_count from public.class_conquest_cheers h where h.user_id = v_uid and h.week_start = v_week_start;
  if v_count >= 20 then return jsonb_build_object('ok', false, 'reason', 'weekend_limit'); end if;
  if v_last is not null and v_last > now() - interval '30 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'cooldown', 'next_cheer_at', v_last + interval '30 minutes');
  end if;
  insert into public.class_conquest_cheers (school_id, grade, week_start, user_id, class_id, cheer_code)
  values (v_viewer.school_id, v_viewer.grade, v_week_start, v_uid, p_class_id, p_cheer_code);
  return jsonb_build_object('ok', true, 'next_cheer_at', now() + interval '30 minutes');
end;
$$;

create or replace function public.rpc_class_conquest_predict(p_class_id uuid)
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
  v_existing uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_viewer from private.class_conquest_viewer(v_uid, null);
  if v_viewer.reason is not null or v_viewer.role <> 'student' then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_viewer.reason, 'students_only'));
  end if;
  if v_today <= v_week_start + 4 then
    return jsonb_build_object('ok', false, 'reason', 'not_sealed');
  end if;
  if not exists (select 1 from private.class_conquest_members(v_viewer.school_id, v_viewer.grade) m where m.class_id = p_class_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_in_grade');
  end if;
  insert into public.class_conquest_predictions (school_id, grade, week_start, user_id, predicted_class_id)
  values (v_viewer.school_id, v_viewer.grade, v_week_start, v_uid, p_class_id)
  on conflict (week_start, user_id) do nothing;
  select p.predicted_class_id into v_existing from public.class_conquest_predictions p where p.user_id = v_uid and p.week_start = v_week_start;
  return jsonb_build_object('ok', true, 'predicted_class_id', v_existing, 'locked', v_existing <> p_class_id);
end;
$$;

create or replace function public.rpc_get_class_conquest_weekend(p_grade text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_week_start date := date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date;
  v_sealed boolean := (now() at time zone 'Asia/Bishkek')::date > date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date + 4;
  v_viewer record;
  v_classes jsonb;
  v_predictions jsonb;
  v_my_prediction uuid;
  v_cheers jsonb;
  v_cheer_counts jsonb;
  v_next_cheer_at timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_viewer from private.class_conquest_viewer(v_uid, p_grade);
  if v_viewer.reason is not null then
    return jsonb_build_object('available', false, 'reason', v_viewer.reason);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', t.class_id, 'label', t.label, 'is_mine', t.class_id = v_viewer.my_class) order by t.label), '[]'::jsonb)
  into v_classes
  from (
    select m.class_id, m.label from private.class_conquest_members(v_viewer.school_id, v_viewer.grade) m
    group by m.class_id, m.label
    having count(distinct m.student_id) >= 2
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', x.class_id, 'count', x.n)), '[]'::jsonb)
  into v_predictions
  from (select p.predicted_class_id as class_id, count(*)::int as n from public.class_conquest_predictions p
        where p.school_id = v_viewer.school_id and p.grade = v_viewer.grade and p.week_start = v_week_start group by 1) x;
  select p.predicted_class_id into v_my_prediction from public.class_conquest_predictions p where p.user_id = v_uid and p.week_start = v_week_start;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', h.class_id, 'cheer_code', h.cheer_code, 'name', coalesce(nullif(u.username, ''), 'Student'),
           'from_class_id', (select m.class_id from private.class_conquest_members(v_viewer.school_id, v_viewer.grade) m
                             where m.student_id = h.user_id limit 1),
           'at', h.created_at, 'is_me', h.user_id = v_uid) order by h.created_at desc), '[]'::jsonb)
  into v_cheers
  from (select * from public.class_conquest_cheers h
        where h.school_id = v_viewer.school_id and h.grade = v_viewer.grade and h.week_start = v_week_start
        order by h.created_at desc limit 40) h
  join public.users u on u.id = h.user_id;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', x.class_id, 'count', x.n)), '[]'::jsonb)
  into v_cheer_counts
  from (select h.class_id, count(*)::int as n from public.class_conquest_cheers h
        where h.school_id = v_viewer.school_id and h.grade = v_viewer.grade and h.week_start = v_week_start group by 1) x;

  select max(h.created_at) + interval '30 minutes' into v_next_cheer_at from public.class_conquest_cheers h where h.user_id = v_uid and h.week_start = v_week_start;

  return jsonb_build_object(
    'available', true,
    'grade', v_viewer.grade,
    'viewer', v_viewer.role,
    'my_class', v_viewer.my_class,
    'phase', case when v_sealed then 'sealed' else 'battle' end,
    'week_start', v_week_start,
    'map_id', private.class_conquest_map_for_week(v_week_start),
    'next_map_id', private.class_conquest_map_for_week(v_week_start + 7),
    'reveal_at', ((v_week_start + 7) + time '07:00') at time zone 'Asia/Bishkek',
    'classes', v_classes,
    'predictions', v_predictions,
    'my_prediction', v_my_prediction,
    'cheers', v_cheers,
    'cheer_counts', v_cheer_counts,
    'next_cheer_at', case when v_next_cheer_at > now() then v_next_cheer_at end,
    'raids', case when v_sealed then private.class_conquest_raids(v_viewer.school_id, v_viewer.grade, v_week_start) else null end
  );
end;
$$;

create or replace function public.rpc_finalize_class_conquest(p_week_start date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_monday date := date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date;
  v_week date := coalesce(p_week_start, case when v_today >= v_monday + 5 then v_monday else v_monday - 7 end);
  v_rec record;
  v_count int := 0;
begin
  if v_today < v_week + 5 then
    return 0;
  end if;
  for v_rec in
    select c.school_id, c.grade_level as grade
    from public.classes c
    where c.school_id is not null and c.grade_level is not null and coalesce(c.is_active, true)
    group by c.school_id, c.grade_level
    having count(*) >= 2
    union
    -- The grade-vs-grade arena of each school (finalize_week skips it when it has fewer than two teams).
    select distinct c.school_id, 'school'
    from public.classes c
    where c.school_id is not null and c.grade_level is not null and coalesce(c.is_active, true)
  loop
    if private.class_conquest_finalize_week(v_rec.school_id, v_rec.grade, v_week) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.class_conquest_class_sizes(uuid) from public, anon, authenticated;
revoke all on function private.class_conquest_battle_grades(uuid) from public, anon, authenticated;
revoke all on function private.class_conquest_members(uuid, text) from public, anon, authenticated;
revoke all on function private.class_conquest_arena_name(text) from public, anon, authenticated;
revoke all on function private.class_conquest_team_count(uuid, text) from public, anon, authenticated;
revoke all on function private.class_conquest_viewer(uuid, text) from public, anon, authenticated;
revoke all on function private.class_conquest_finalize_week(uuid, text, date) from public, anon, authenticated;
revoke all on function private.class_conquest_raids(uuid, text, date) from public, anon, authenticated;
revoke all on function private.class_conquest_seal_weekend(uuid, text, date) from public, anon, authenticated;
revoke all on function public.rpc_get_class_conquest(text) from public, anon;
grant execute on function public.rpc_get_class_conquest(text) to authenticated;
revoke all on function public.rpc_get_class_conquest_weekend(text) from public, anon;
grant execute on function public.rpc_get_class_conquest_weekend(text) to authenticated;
revoke all on function public.rpc_class_conquest_cheer(uuid, text) from public, anon;
grant execute on function public.rpc_class_conquest_cheer(uuid, text) to authenticated;
revoke all on function public.rpc_class_conquest_predict(uuid) from public, anon;
grant execute on function public.rpc_class_conquest_predict(uuid) to authenticated;
revoke all on function public.rpc_finalize_class_conquest(date) from public, anon;
grant execute on function public.rpc_finalize_class_conquest(date) to authenticated;
