-- Class Conquest: the season starts with the week of Monday 26 October 2026.
--
-- The week of 19–23 Oct was frozen during deployment checks, but students never
-- knew it counted. finalize_week now refuses any week before the season start,
-- and the read RPCs ignore pre-season rows, so that week never appears in the
-- app (live card, Hall of Fame, badges). Leftover rows can be removed with:
--   delete from public.class_conquest_results where week_start < date '2026-10-26';

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
        format('🏆 You are the %s of Grade %s!', v_role, p_grade),
        format('%s conquered %s. Your certificate is ready. Next map: %s — missions count from today.',
               v_winner_label, private.class_conquest_map_label(v_map), private.class_conquest_map_label(v_next)),
        '/', format('ccq:%s:%s', v_id, v_rec.sid),
        jsonb_build_object('result_id', v_id, 'rank', v_rec.rank, 'map_id', v_map, 'next_map_id', v_next),
        ((p_week_start + 7) + time '00:30') at time zone 'Asia/Bishkek');
    else
      perform private.enqueue_game_push(
        v_rec.sid, 'class_conquest_winner',
        format('🏆 %s conquered %s!', v_winner_label, private.class_conquest_map_label(v_map)),
        format('Your class won Class Conquest. Next map: %s — every daily mission from today counts.',
               private.class_conquest_map_label(v_next)),
        '/', format('ccq:%s:%s', v_id, v_rec.sid),
        jsonb_build_object('result_id', v_id, 'map_id', v_map, 'next_map_id', v_next),
        ((p_week_start + 7) + time '00:30') at time zone 'Asia/Bishkek');
    end if;
  end loop;

  return v_id;
end;
$$;
revoke all on function private.class_conquest_finalize_week(uuid, text, date) from public, anon, authenticated;

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
revoke all on function public.rpc_get_class_conquest(text) from public, anon;
grant execute on function public.rpc_get_class_conquest(text) to authenticated;

create or replace function public.rpc_get_class_conquest_history(p_grade text default null, p_limit integer default 26)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_week_start date := date_trunc('week', (now() at time zone 'Asia/Bishkek'))::date;
  v_result_week date;
  v_viewer record;
  v_results jsonb;
  v_badges jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_viewer from private.class_conquest_viewer(v_uid, p_grade);
  if v_viewer.reason is not null then
    return jsonb_build_object('available', false, 'reason', v_viewer.reason, 'grades', coalesce(v_viewer.grades, '[]'::jsonb));
  end if;

  v_result_week := case when v_today > v_week_start + 4 then v_week_start else v_week_start - 7 end;
  perform private.class_conquest_finalize_week(v_viewer.school_id, v_viewer.grade, v_result_week);
  perform private.class_conquest_seal_weekend(v_viewer.school_id, v_viewer.grade, v_result_week);

  select coalesce(jsonb_agg(jsonb_build_object(
    'week_start', r.week_start, 'map_id', r.map_id, 'grade', r.grade,
    'winner_class_id', r.winner_class_id, 'winner_label', r.winner_label,
    'standings', r.standings, 'top_students', r.top_students, 'weekend', r.weekend,
    'revealed', v_today >= r.week_start + 7) order by r.week_start desc), '[]'::jsonb)
  into v_results
  from (
    select * from public.class_conquest_results r
    where r.school_id = v_viewer.school_id and r.grade = v_viewer.grade
      and r.week_start >= date '2026-10-26' -- the season starts 26 Oct; ignore pre-season rows
      -- students never see a sealed (unrevealed) week
      and (v_viewer.role = 'teacher' or v_today >= r.week_start + 7)
    order by r.week_start desc
    limit greatest(1, least(coalesce(p_limit, 26), 104))
  ) r;

  if v_viewer.role = 'student' then
    with mine as (
      select r.week_start, r.map_id, r.winner_label as class_label,
        case when t.rank is not null then 'gold' else 'silver' end as kind, t.rank
      from public.class_conquest_results r
      left join lateral (
        select (s ->> 'rank')::int as rank from jsonb_array_elements(r.top_students) s
        where (s ->> 'student_id')::uuid = v_uid limit 1
      ) t on true
      where r.school_id = v_viewer.school_id and v_uid = any (r.winner_members) and v_today >= r.week_start + 7 and r.week_start >= date '2026-10-26'
      union all
      -- Oracle: predicted the winner during the sealed weekend.
      select r.week_start, r.map_id, r.winner_label, 'oracle', null::int
      from public.class_conquest_predictions p
      join public.class_conquest_results r on r.school_id = p.school_id and r.grade = p.grade and r.week_start = p.week_start
      where p.user_id = v_uid and r.winner_class_id is not null and p.predicted_class_id = r.winner_class_id and v_today >= r.week_start + 7
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'week_start', m.week_start, 'map_id', m.map_id, 'class_label', m.class_label, 'kind', m.kind, 'rank', m.rank)
      order by m.week_start desc, m.kind), '[]'::jsonb)
    into v_badges
    from mine m;
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
