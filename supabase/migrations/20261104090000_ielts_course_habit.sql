-- IELTS self-paced course: daily habit loop (streak, XP, daily goal, streak freezes, evening reminder).
--
-- Owner instruction 2026-11-04 14:03 (Asia/Bishkek): "make it more addictive like Duolingo".
-- Design limits (learners include school students): no guilt or shame copy, at most one reminder a day, sent in the
-- learner's early evening and never in quiet hours, and an opt-out. Streaks and XP are motivation only: they are never
-- an IELTS score, a band or teacher evidence.
--
-- Nothing new is written when a learner practises: XP is derived from the existing attempt tables, so it cannot be
-- forged from the browser and older activity counts too.
--   reading or listening set completed  15 XP
--   writing or speaking task submitted  20 XP
--   vocabulary step submitted           10 XP (+5 when every answer is right)
--   course lesson opened                 5 XP
-- Each piece of work counts once per day. A day with any XP keeps the streak.
-- Streak freezes: one is earned at every 7 days of streak (hold at most 2). A missed day spends one automatically.

create table if not exists private.ielts_course_habits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_goal_xp integer not null default 20 check (daily_goal_xp in (10, 20, 30, 50)),
  time_zone text not null default 'Asia/Bishkek',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.ielts_course_habits enable row level security;
revoke all on private.ielts_course_habits from public, anon, authenticated;

alter table public.push_preferences add column if not exists ielts_course boolean not null default true;
comment on column public.push_preferences.ielts_course is 'IELTS course daily reminder (one evening message on days without practice).';

-- Per-day XP in the learner's time zone.
create or replace function private.ielts_course_daily_xp(p_user uuid, p_tz text, p_since timestamptz)
returns table(day date, xp integer)
language sql
stable
security definer
set search_path = ''
as $$
  with events as (
    select 'r' as kind, a.set_id::text as ref, a.completed_at as at, 15 as xp
      from public.ielts_reading_attempts a where a.user_id = p_user and a.completed_at >= p_since
    union all
    select 'l', a.set_id::text, a.completed_at, 15
      from public.ielts_listening_attempts a where a.user_id = p_user and a.completed_at >= p_since
    union all
    select 'w', a.task_id::text, a.submitted_at, 20
      from public.ielts_writing_attempts a where a.user_id = p_user and a.submitted_at >= p_since
    union all
    select 's', a.task_id::text, a.submitted_at, 20
      from public.ielts_speaking_attempts a where a.user_id = p_user and a.submitted_at >= p_since
    union all
    select 'v', a.task_code, a.submitted_at, case when a.score = a.total then 15 else 10 end
      from private.ielts_course_vocab_attempts a where a.user_id = p_user and a.submitted_at >= p_since
    union all
    select 'lesson', p.unit_id::text, p.lesson_viewed_at, 5
      from public.ielts_course_progress p where p.user_id = p_user and p.lesson_viewed_at >= p_since
  ), per_item as (
    select (e.at at time zone p_tz)::date as day, e.kind, e.ref, max(e.xp) as xp
    from events e
    group by 1, 2, 3
  )
  select day, sum(xp)::integer from per_item group by day;
$$;

-- The habit state, computed from activity. Walks day by day from the first active day (at most 400 days back).
create or replace function private.ielts_course_habit_compute(p_user uuid, p_tz text, p_goal integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone p_tz)::date;
  v_start date;
  v_day date;
  v_xp integer;
  v_streak integer := 0;
  v_longest integer := 0;
  v_bank integer := 0;
  v_total integer := 0;
  v_today_xp integer := 0;
  v_frozen date[] := '{}';
  v_xp_by_day jsonb := '{}'::jsonb;
  v_week jsonb := '[]'::jsonb;
  v_next integer;
  r record;
begin
  for r in select d.day, d.xp from private.ielts_course_daily_xp(p_user, p_tz, now() - interval '400 days') d loop
    v_xp_by_day := v_xp_by_day || jsonb_build_object(r.day::text, r.xp);
    v_total := v_total + r.xp;
    if v_start is null or r.day < v_start then v_start := r.day; end if;
  end loop;

  if v_start is not null then
    v_day := v_start;
    while v_day <= v_today loop
      v_xp := coalesce((v_xp_by_day->>v_day::text)::integer, 0);
      if v_xp > 0 then
        v_streak := v_streak + 1;
        if v_streak % 7 = 0 and v_bank < 2 then v_bank := v_bank + 1; end if;
        v_longest := greatest(v_longest, v_streak);
      elsif v_day < v_today then
        -- A missed past day: a freeze keeps the streak alive; otherwise it resets.
        if v_streak > 0 and v_bank > 0 then
          v_bank := v_bank - 1;
          v_frozen := v_frozen || v_day;
        else
          v_streak := 0;
        end if;
      end if;
      v_day := v_day + 1;
    end loop;
    v_today_xp := coalesce((v_xp_by_day->>v_today::text)::integer, 0);
  end if;

  for v_day in select generate_series(v_today - 6, v_today, interval '1 day')::date loop
    v_week := v_week || jsonb_build_array(jsonb_build_object(
      'day', v_day,
      'xp', coalesce((v_xp_by_day->>v_day::text)::integer, 0),
      'frozen', v_day = any(v_frozen),
      'today', v_day = v_today));
  end loop;

  select m into v_next from unnest(array[3, 7, 14, 30, 50, 100, 200, 365]) m where m > v_streak order by m limit 1;

  return jsonb_build_object(
    'streak', v_streak,
    'today_done', v_today_xp > 0,
    'longest_streak', v_longest,
    'freezes', v_bank,
    'today', v_today,
    'today_xp', v_today_xp,
    'daily_goal_xp', p_goal,
    'goal_done', v_today_xp >= p_goal,
    'total_xp', v_total,
    'next_milestone', v_next,
    'week', v_week,
    'time_zone', p_tz);
end;
$$;

-- Learner-facing: current habit state. The browser passes its IANA time zone; unknown zones are ignored.
create or replace function public.rpc_ielts_course_habit(p_tz text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_habit private.ielts_course_habits%rowtype;
  v_tz text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_tz := nullif(trim(coalesce(p_tz, '')), '');
  if v_tz is not null and (length(v_tz) > 64 or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz)) then
    v_tz := null;
  end if;
  insert into private.ielts_course_habits (user_id, time_zone)
  values (v_actor, coalesce(v_tz, 'Asia/Bishkek'))
  on conflict (user_id) do update
    set time_zone = coalesce(v_tz, private.ielts_course_habits.time_zone),
        updated_at = case when v_tz is not null and v_tz <> private.ielts_course_habits.time_zone then now() else private.ielts_course_habits.updated_at end
  returning * into v_habit;
  return private.ielts_course_habit_compute(v_actor, v_habit.time_zone, v_habit.daily_goal_xp)
    || jsonb_build_object('reminders', coalesce((select p.ielts_course from public.push_preferences p where p.user_id = v_actor), true));
end;
$$;

revoke all on function public.rpc_ielts_course_habit(text) from public, anon;
grant execute on function public.rpc_ielts_course_habit(text) to authenticated;

-- Learner-facing: choose a daily goal and the evening reminder.
create or replace function public.rpc_ielts_course_habit_settings(p_goal integer default null, p_reminders boolean default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_goal is not null and p_goal not in (10, 20, 30, 50) then
    raise exception 'invalid_goal';
  end if;
  insert into private.ielts_course_habits (user_id, daily_goal_xp)
  values (v_actor, coalesce(p_goal, 20))
  on conflict (user_id) do update
    set daily_goal_xp = coalesce(p_goal, private.ielts_course_habits.daily_goal_xp), updated_at = now();
  if p_reminders is not null then
    insert into public.push_preferences (user_id, ielts_course) values (v_actor, p_reminders)
    on conflict (user_id) do update set ielts_course = excluded.ielts_course, updated_at = now();
  end if;
  return public.rpc_ielts_course_habit(null);
end;
$$;

revoke all on function public.rpc_ielts_course_habit_settings(integer, boolean) from public, anon;
grant execute on function public.rpc_ielts_course_habit_settings(integer, boolean) to authenticated;

-- Evening reminder: once a day, between 19:00 and 19:59 in the learner's own time zone, only to learners with a
-- streak who have not practised yet today, an active push device and the reminder switched on. Never in quiet hours.
create or replace function public.rpc_enqueue_ielts_streak_reminders(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_state jsonb;
  v_local timestamp;
  v_streak integer;
  r record;
begin
  for r in
    select h.user_id, h.time_zone, h.daily_goal_xp
    from private.ielts_course_habits h
    where exists (select 1 from public.push_subscriptions s where s.user_id = h.user_id and s.disabled_at is null)
      and not exists (select 1 from public.push_preferences p where p.user_id = h.user_id and not p.ielts_course)
  loop
    v_local := p_now at time zone r.time_zone;
    continue when v_local::time < time '19:00' or v_local::time >= time '20:00';
    continue when exists (select 1 from public.push_notification_outbox o
                          where o.idempotency_key = 'ielts-streak-' || r.user_id::text || '-' || v_local::date::text);
    v_state := private.ielts_course_habit_compute(r.user_id, r.time_zone, r.daily_goal_xp);
    v_streak := (v_state->>'streak')::integer;
    continue when (v_state->>'today_done')::boolean or v_streak < 1;
    perform private.enqueue_push(
      r.user_id, 'ielts_streak_reminder',
      '🔥 Your ' || v_streak || '-day IELTS streak',
      'One short step keeps it going. Most take about 5 minutes.',
      '/ielts/course',
      'ielts-streak-' || r.user_id::text || '-' || v_local::date::text,
      jsonb_build_object('streak', v_streak, 'date', v_local::date),
      p_now);
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ielts_streak_reminders', v_count);
end;
$$;

revoke all on function public.rpc_enqueue_ielts_streak_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_enqueue_ielts_streak_reminders(timestamptz) to service_role;

revoke all on function private.ielts_course_daily_xp(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.ielts_course_habit_compute(uuid, text, integer) from public, anon, authenticated;

-- Add the reminder to the existing per-minute push job (same commands as before plus one line).
do $$
declare v_command text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is unavailable; schedule rpc_enqueue_ielts_streak_reminders with the platform scheduler.';
    return;
  end if;
  if not exists (select 1 from cron.job where jobname = 'brains-heist-push-dispatcher') then
    raise notice 'push dispatcher job not scheduled here; skipping the IELTS reminder hook.';
    return;
  end if;
  v_command := $cmd$
    select public.rpc_push_cleanup();
    select public.rpc_enqueue_due_push_reminders();
    select public.rpc_enqueue_streak_push_reminders();
    select public.rpc_enqueue_ielts_streak_reminders();
    select net.http_post(
      url := (select function_url from public.push_dispatch_config where singleton = true),
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-push-dispatch-key', (select dispatch_key from public.push_dispatch_config where singleton = true)),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cmd$;
  perform cron.unschedule(jobid) from cron.job where jobname = 'brains-heist-push-dispatcher';
  perform cron.schedule('brains-heist-push-dispatcher', '* * * * *', v_command);
end $$;

comment on table private.ielts_course_habits is 'IELTS course habit settings per learner (daily XP goal, time zone). Streak and XP are derived from attempts; motivation only, never a score.';
