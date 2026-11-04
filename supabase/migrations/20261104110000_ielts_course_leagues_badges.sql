-- IELTS self-paced course: weekly leagues, badges and milestone streak freezes.
--
-- Owner instructions 2026-11-04 (Asia/Bishkek): weekly leagues yes; learners shown as "first name + initial";
-- long streaks earn badges and freezes only (no free Prime).
--
-- Leagues (Duolingo-style): eight tiers. A learner joins this week's league the first time they earn XP in the week,
-- in a group of up to 20 learners of the same tier. Weeks run Monday 00:00 to Sunday 24:00 Asia/Bishkek. At the end,
-- the top 5 with XP move up a tier and, in groups of 10 or more, the bottom 5 move down. Settlement is lazy and
-- idempotent: the first league view after a week ends settles every finished group.
-- Only first name + initial and a generated mascot colour are shown; never photos, schools, emails or usernames.
-- Weekly XP is motivation only, never an IELTS score or teacher evidence.

alter table private.ielts_course_habits add column if not exists league_tier integer not null default 1;
alter table private.ielts_course_habits drop constraint if exists ielts_course_habits_league_tier_valid;
alter table private.ielts_course_habits add constraint ielts_course_habits_league_tier_valid check (league_tier between 1 and 8);

create table if not exists private.ielts_league_groups (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  tier integer not null check (tier between 1 and 8),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists ielts_league_groups_open_idx on private.ielts_league_groups (week_start, tier) where settled_at is null;
alter table private.ielts_league_groups enable row level security;
revoke all on private.ielts_league_groups from public, anon, authenticated;

create table if not exists private.ielts_league_members (
  group_id uuid not null references private.ielts_league_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  tier integer not null,
  joined_at timestamptz not null default now(),
  final_xp integer,
  final_rank integer,
  result text check (result in ('promoted', 'stayed', 'demoted')),
  primary key (week_start, user_id)
);
create index if not exists ielts_league_members_group_idx on private.ielts_league_members (group_id);
alter table private.ielts_league_members enable row level security;
revoke all on private.ielts_league_members from public, anon, authenticated;

create or replace function private.ielts_league_tier_name(p_tier integer)
returns text language sql immutable set search_path = '' as $$
  select (array['Bronze','Silver','Gold','Sapphire','Ruby','Emerald','Amethyst','Diamond'])[greatest(1, least(8, p_tier))];
$$;

create or replace function private.ielts_league_week_start(p_at timestamptz default now())
returns date language sql stable set search_path = '' as $$
  select date_trunc('week', p_at at time zone 'Asia/Bishkek')::date;
$$;

-- XP earned in one league week (Asia/Bishkek days, so everyone in a group shares the same week).
create or replace function private.ielts_league_week_xp(p_user uuid, p_week date)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(d.xp), 0)::integer
  from private.ielts_course_daily_xp(p_user, 'Asia/Bishkek', ((p_week::timestamp) at time zone 'Asia/Bishkek') - interval '1 day') d
  where d.day >= p_week and d.day < p_week + 7;
$$;

-- "Gulzada K." from the profile; never username, email or school.
create or replace function private.ielts_league_display_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  with n as (
    select regexp_split_to_array(trim(coalesce(nullif(trim(u.full_name), ''), nullif(trim(iu.full_name), ''), 'Learner')), '\s+') parts
    from (select p_user as id) x
    left join public.users u on u.id = x.id
    left join public.ielts_users iu on iu.id = x.id
  )
  select left(parts[1], 18) || case when cardinality(parts) > 1 and length(parts[cardinality(parts)]) > 0
                                    then ' ' || upper(left(parts[cardinality(parts)], 1)) || '.' else '' end
  from n;
$$;

-- Settle every finished, unsettled group. Idempotent; safe to call from any league view.
create or replace function private.ielts_league_settle_due()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  g record; m record; v_n integer; v_count integer := 0; v_result text; v_week date := private.ielts_league_week_start();
begin
  for g in select * from private.ielts_league_groups where settled_at is null and week_start < v_week for update skip locked loop
    select count(*) into v_n from private.ielts_league_members where group_id = g.id;
    for m in
      select x.user_id, x.xp, row_number() over (order by x.xp desc, x.joined_at, x.user_id) as rank
      from (select mm.user_id, mm.joined_at, private.ielts_league_week_xp(mm.user_id, g.week_start) as xp
            from private.ielts_league_members mm where mm.group_id = g.id) x
    loop
      v_result := case
        when m.rank <= 5 and m.xp > 0 and g.tier < 8 then 'promoted'
        when v_n >= 10 and m.rank > v_n - 5 and g.tier > 1 then 'demoted'
        else 'stayed' end;
      update private.ielts_league_members set final_xp = m.xp, final_rank = m.rank, result = v_result
       where group_id = g.id and user_id = m.user_id;
      insert into private.ielts_course_habits (user_id, league_tier)
      values (m.user_id, g.tier + case v_result when 'promoted' then 1 when 'demoted' then -1 else 0 end)
      on conflict (user_id) do update set league_tier = excluded.league_tier, updated_at = now();
    end loop;
    update private.ielts_league_groups set settled_at = now() where id = g.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Learner-facing: this week's league (joining it on the first XP of the week) and last week's result.
create or replace function public.rpc_ielts_league()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_week date := private.ielts_league_week_start();
  v_tier integer;
  v_member private.ielts_league_members%rowtype;
  v_group uuid;
  v_my_xp integer;
  v_members jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_last jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform private.ielts_league_settle_due();

  insert into private.ielts_course_habits (user_id) values (v_actor) on conflict (user_id) do nothing;
  select league_tier into v_tier from private.ielts_course_habits where user_id = v_actor;

  select * into v_member from private.ielts_league_members where week_start = v_week and user_id = v_actor;
  v_my_xp := private.ielts_league_week_xp(v_actor, v_week);

  if v_member.user_id is null and v_my_xp > 0 then
    -- One joiner at a time per week, so groups never pass 20.
    perform pg_advisory_xact_lock(hashtext('ielts_league_' || v_week::text));
    select g.id into v_group
    from private.ielts_league_groups g
    where g.week_start = v_week and g.tier = v_tier and g.settled_at is null
      and (select count(*) from private.ielts_league_members mm where mm.group_id = g.id) < 20
    order by g.created_at
    limit 1;
    if v_group is null then
      insert into private.ielts_league_groups (week_start, tier) values (v_week, v_tier) returning id into v_group;
    end if;
    insert into private.ielts_league_members (group_id, user_id, week_start, tier) values (v_group, v_actor, v_week, v_tier)
    on conflict (week_start, user_id) do nothing;
    select * into v_member from private.ielts_league_members where week_start = v_week and user_id = v_actor;
  end if;

  if v_member.user_id is not null then
    select coalesce(jsonb_agg(s.entry order by (s.entry->>'rank')::int), '[]'::jsonb), count(*) into v_members, v_n
    from (
      select jsonb_build_object(
        'rank', row_number() over (order by x.xp desc, x.joined_at, x.user_id),
        'name', private.ielts_league_display_name(x.user_id),
        'xp', x.xp,
        'me', x.user_id = v_actor,
        'hue', abs(hashtext(x.user_id::text)) % 360) as entry
      from (select mm.user_id, mm.joined_at, private.ielts_league_week_xp(mm.user_id, v_week) as xp
            from private.ielts_league_members mm where mm.group_id = v_member.group_id) x
    ) s;
  end if;

  select jsonb_build_object('week_start', m.week_start, 'tier', m.tier, 'tier_name', private.ielts_league_tier_name(m.tier),
                            'rank', m.final_rank, 'xp', m.final_xp, 'result', m.result,
                            'new_tier', v_tier, 'new_tier_name', private.ielts_league_tier_name(v_tier))
    into v_last
  from private.ielts_league_members m
  where m.user_id = v_actor and m.week_start = v_week - 7 and m.result is not null;

  return jsonb_build_object(
    'week_start', v_week,
    'ends_at', ((v_week + 7)::timestamp at time zone 'Asia/Bishkek'),
    'tier', coalesce(v_member.tier, v_tier),
    'tier_name', private.ielts_league_tier_name(coalesce(v_member.tier, v_tier)),
    'joined', v_member.user_id is not null,
    'my_xp', v_my_xp,
    'members', v_members,
    'size', v_n,
    'promote_count', case when coalesce(v_member.tier, v_tier) < 8 then 5 else 0 end,
    'demote_count', case when v_n >= 10 and coalesce(v_member.tier, v_tier) > 1 then 5 else 0 end,
    'last_week', v_last);
end;
$$;

revoke all on function public.rpc_ielts_league() from public, anon;
grant execute on function public.rpc_ielts_league() to authenticated;

-- Badges, all derived from real activity. Streak milestones also give a bonus streak freeze at 14, 30, 100 and 365.
create or replace function private.ielts_course_badges(p_user uuid, p_longest integer, p_total integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  with perfect as (
    select count(distinct a.task_code)::integer as n from private.ielts_course_vocab_attempts a
    where a.user_id = p_user and a.score = a.total
  ), league as (
    select coalesce(max(greatest(m.tier, case when m.result = 'promoted' then m.tier + 1 else m.tier end)), 0) as best
    from private.ielts_league_members m where m.user_id = p_user
  ), units as (
    select count(*)::integer as n from public.ielts_course_progress p where p.user_id = p_user and p.completed_at is not null
  ), defs(id, family, title, detail, goal, value) as (
    values
      ('streak-3', 'streak', 'Spark', '3-day streak', 3, p_longest),
      ('streak-7', 'streak', 'Week of fire', '7-day streak', 7, p_longest),
      ('streak-14', 'streak', 'Fortnight flame', '14-day streak · +1 freeze', 14, p_longest),
      ('streak-30', 'streak', 'Month of fire', '30-day streak · +1 freeze', 30, p_longest),
      ('streak-100', 'streak', 'Inferno', '100-day streak · +1 freeze', 100, p_longest),
      ('streak-365', 'streak', 'Eternal flame', '365-day streak · +1 freeze', 365, p_longest),
      ('xp-100', 'xp', 'Warm-up', '100 XP', 100, p_total),
      ('xp-500', 'xp', 'Momentum', '500 XP', 500, p_total),
      ('xp-1000', 'xp', 'Powerhouse', '1,000 XP', 1000, p_total),
      ('xp-5000', 'xp', 'Legend', '5,000 XP', 5000, p_total),
      ('perfect-1', 'perfect', 'Bullseye', 'A perfect vocabulary step', 1, (select n from perfect)),
      ('perfect-10', 'perfect', 'Sharpshooter', '10 perfect vocabulary steps', 10, (select n from perfect)),
      ('unit-1', 'units', 'First stop', 'Clear a course unit', 1, (select n from units)),
      ('unit-10', 'units', 'Halfway hero', 'Clear 10 units', 10, (select n from units)),
      ('league-3', 'league', 'Gold standard', 'Reach the Gold league', 3, (select best from league)),
      ('league-8', 'league', 'Diamond mind', 'Reach the Diamond league', 8, (select best from league))
  )
  select jsonb_agg(jsonb_build_object('id', id, 'family', family, 'title', title, 'detail', detail, 'goal', goal,
                                      'value', least(coalesce(value, 0), goal), 'earned', coalesce(value, 0) >= goal) order by family, goal)
  from defs;
$$;

-- Streak computation gains milestone bonus freezes (bank may reach 3 through a milestone).
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
        if v_streak in (14, 30, 100, 365) and v_bank < 3 then v_bank := v_bank + 1; end if;
        v_longest := greatest(v_longest, v_streak);
      elsif v_day < v_today then
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

-- Habit state now also carries badges and the league tier.
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
  v_state jsonb;
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
  v_state := private.ielts_course_habit_compute(v_actor, v_habit.time_zone, v_habit.daily_goal_xp);
  return v_state
    || jsonb_build_object(
      'reminders', coalesce((select p.ielts_course from public.push_preferences p where p.user_id = v_actor), true),
      'league_tier', v_habit.league_tier,
      'league_name', private.ielts_league_tier_name(v_habit.league_tier),
      'badges', private.ielts_course_badges(v_actor, (v_state->>'longest_streak')::integer, (v_state->>'total_xp')::integer));
end;
$$;

revoke all on function public.rpc_ielts_course_habit(text) from public, anon;
grant execute on function public.rpc_ielts_course_habit(text) to authenticated;

revoke all on function private.ielts_league_tier_name(integer) from public, anon, authenticated;
revoke all on function private.ielts_league_week_start(timestamptz) from public, anon, authenticated;
revoke all on function private.ielts_league_week_xp(uuid, date) from public, anon, authenticated;
revoke all on function private.ielts_league_display_name(uuid) from public, anon, authenticated;
revoke all on function private.ielts_league_settle_due() from public, anon, authenticated;
revoke all on function private.ielts_course_badges(uuid, integer, integer) from public, anon, authenticated;
revoke all on function private.ielts_course_habit_compute(uuid, text, integer) from public, anon, authenticated;

comment on table private.ielts_league_groups is 'Weekly IELTS course league groups (up to 20 learners of one tier). Motivation only.';
comment on table private.ielts_league_members is 'Weekly league membership and the settled result. Shows only first name + initial to other learners.';
