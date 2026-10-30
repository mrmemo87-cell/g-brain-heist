-- Class Conquest seasons: a different map every week, a frozen record of each
-- finished week (winning class + its top five students), a Hall of Fame feed,
-- and a Monday-morning announcement push.
--
-- The week: Monday–Friday score ("battle"); Friday 23:59 Bishkek the vault seals;
-- Saturday 00:15 the result is frozen (teachers can see it and print certificates);
-- students learn the winner Monday 07:00 ("reveal"). The weekend in between is the
-- sealed phase (predictions, hype wall, border raids, next-map intel — see the
-- class_conquest_weekend migration).
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
  -- Filled on Monday: border raids, predictions and cheers from the sealed weekend.
  weekend          jsonb,
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

-- Freeze every school and grade for the most recently closed week (Bishkek time):
-- on the weekend that is this week, otherwise last week. Safe to call from anywhere:
-- refuses a week whose Friday is not over and never rewrites a frozen one.
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

-- Saturday 00:15 Bishkek (Friday 18:15 UTC), right after the vault seals. The read
-- RPCs also freeze lazily, so a missed cron run never loses a week.
do $$
declare v_job_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  select jobid into v_job_id from cron.job where jobname = 'class-conquest-finalize' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('class-conquest-finalize', '15 18 * * 5', 'select public.rpc_finalize_class_conquest();');
end $$;


-- ─────────────────────────── the sealed weekend ───────────────────────────
-- Saturday and Sunday the result sits in the vault. Students can predict the
-- winner (one pick), post preset chants on the Hype Wall (no free text), and
-- raid rival classes through the existing PvP hack game ("border raids").

create table if not exists public.class_conquest_predictions (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  grade               text not null,
  week_start          date not null,
  user_id             uuid not null references public.users(id) on delete cascade,
  predicted_class_id  uuid not null references public.classes(id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (week_start, user_id)
);
alter table public.class_conquest_predictions enable row level security;
revoke all on table public.class_conquest_predictions from public, anon, authenticated;

create table if not exists public.class_conquest_cheers (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  grade       text not null,
  week_start  date not null,
  user_id     uuid not null references public.users(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  cheer_code  text not null check (cheer_code in ('all_the_way','unstoppable','gg','next_map','respect','comeback','mastermind','sweating')),
  created_at  timestamptz not null default now()
);
create index if not exists class_conquest_cheers_week_idx on public.class_conquest_cheers (school_id, grade, week_start, created_at desc);
alter table public.class_conquest_cheers enable row level security;
revoke all on table public.class_conquest_cheers from public, anon, authenticated;

-- Border raids: PvP hack wins against another class of the same grade, Saturday 00:00 → Monday 00:00 Bishkek.
create or replace function private.class_conquest_raids(p_school uuid, p_grade text, p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with members as (
    select c.id as class_id, coalesce(nullif(c.class_name, ''), c.class_code) as label, cs.student_id
    from public.classes c
    join public.class_students cs on cs.class_id = c.id
    join public.users u on u.id = cs.student_id and u.role = 'student' and not coalesce(u.is_banned, false)
    where c.school_id = p_school and c.grade_level = p_grade and coalesce(c.is_active, true)
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
revoke all on function private.class_conquest_raids(uuid, text, date) from public, anon, authenticated;

-- On Monday, store what happened over the weekend next to the frozen result (once).
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
    select p.predicted_class_id as class_id, coalesce(nullif(c.class_name, ''), c.class_code) as label, count(*)::int as n
    from public.class_conquest_predictions p join public.classes c on c.id = p.predicted_class_id
    where p.school_id = p_school and p.grade = p_grade and p.week_start = p_week_start
    group by p.predicted_class_id, c.class_name, c.class_code
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', x.class_id, 'label', x.label, 'count', x.n) order by x.n desc, x.label), '[]'::jsonb)
  into v_cheers
  from (
    select h.class_id, coalesce(nullif(c.class_name, ''), c.class_code) as label, count(*)::int as n
    from public.class_conquest_cheers h join public.classes c on c.id = h.class_id
    where h.school_id = p_school and h.grade = p_grade and h.week_start = p_week_start
    group by h.class_id, c.class_name, c.class_code
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
revoke all on function private.class_conquest_seal_weekend(uuid, text, date) from public, anon, authenticated;

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

-- Live week. Also freezes the latest closed week lazily and returns the phase, the map
-- rotation and the latest result (students only see a result once it is revealed on Monday).
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
    where r.school_id = v_viewer.school_id and r.grade = v_viewer.grade and r.week_start = v_result_week;
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
      where r.school_id = v_viewer.school_id and v_uid = any (r.winner_members) and v_today >= r.week_start + 7
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

-- ─────────────────────────── weekend actions ───────────────────────────

-- Everything the sealed-weekend card needs: countdown, predictions tally, hype wall, border raids.
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

  select coalesce(jsonb_agg(jsonb_build_object('class_id', c.id, 'label', coalesce(nullif(c.class_name, ''), c.class_code), 'is_mine', c.id = v_viewer.my_class) order by coalesce(nullif(c.class_name, ''), c.class_code)), '[]'::jsonb)
  into v_classes
  from public.classes c
  where c.school_id = v_viewer.school_id and c.grade_level = v_viewer.grade and coalesce(c.is_active, true)
    and (select count(*) from public.class_students cs join public.users u on u.id = cs.student_id
         where cs.class_id = c.id and u.role = 'student' and not coalesce(u.is_banned, false)) >= 2;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', x.class_id, 'count', x.n)), '[]'::jsonb)
  into v_predictions
  from (select p.predicted_class_id as class_id, count(*)::int as n from public.class_conquest_predictions p
        where p.school_id = v_viewer.school_id and p.grade = v_viewer.grade and p.week_start = v_week_start group by 1) x;
  select p.predicted_class_id into v_my_prediction from public.class_conquest_predictions p where p.user_id = v_uid and p.week_start = v_week_start;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', h.class_id, 'cheer_code', h.cheer_code, 'name', coalesce(nullif(u.username, ''), 'Student'),
           'from_class_id', (select cs.class_id from public.class_students cs join public.classes c2 on c2.id = cs.class_id
                             where cs.student_id = h.user_id and c2.grade_level = v_viewer.grade and c2.school_id = v_viewer.school_id limit 1),
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
revoke all on function public.rpc_get_class_conquest_weekend(text) from public, anon;
grant execute on function public.rpc_get_class_conquest_weekend(text) to authenticated;

-- One prediction per student per week, only while the vault is sealed, only a class of their own grade.
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
  if not exists (select 1 from public.classes c where c.id = p_class_id and c.school_id = v_viewer.school_id and c.grade_level = v_viewer.grade and coalesce(c.is_active, true)) then
    return jsonb_build_object('ok', false, 'reason', 'not_in_grade');
  end if;
  insert into public.class_conquest_predictions (school_id, grade, week_start, user_id, predicted_class_id)
  values (v_viewer.school_id, v_viewer.grade, v_week_start, v_uid, p_class_id)
  on conflict (week_start, user_id) do nothing;
  select p.predicted_class_id into v_existing from public.class_conquest_predictions p where p.user_id = v_uid and p.week_start = v_week_start;
  return jsonb_build_object('ok', true, 'predicted_class_id', v_existing, 'locked', v_existing <> p_class_id);
end;
$$;
revoke all on function public.rpc_class_conquest_predict(uuid) from public, anon;
grant execute on function public.rpc_class_conquest_predict(uuid) to authenticated;

-- A preset chant aimed at a class of the student's grade. One every 30 minutes, 20 per weekend.
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
  if not exists (select 1 from public.classes c where c.id = p_class_id and c.school_id = v_viewer.school_id and c.grade_level = v_viewer.grade and coalesce(c.is_active, true)) then
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
revoke all on function public.rpc_class_conquest_cheer(uuid, text) from public, anon;
grant execute on function public.rpc_class_conquest_cheer(uuid, text) to authenticated;
