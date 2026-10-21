-- Weekly class board.
-- Students see where they stand in their own class this week, ranked by
-- effort rather than all-time XP, so everyone can climb. Resets every Monday
-- (school days in Asia/Bishkek, matching the daily mission).
--
-- Points this week:
--   10 per finished daily mission
--    2 per correct daily-mission answer
--    5 per teacher assignment completed
--
-- "Places climbed today" compares the rank now with the rank using only
-- activity from before today, so finishing today's mission shows the climb.

create or replace function private.weekly_board_points(p_student_ids uuid[], p_from timestamptz, p_to timestamptz, p_from_date date, p_to_date date)
returns table (student_id uuid, points integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
    (coalesce(m.points, 0) + coalesce(a.points, 0))::integer
  from unnest(p_student_ids) as s(id)
  left join (
    select dm.user_id,
           sum(case when dm.completed_at is not null then 10 else 0 end + 2 * dm.correct_count) as points
    from public.daily_missions dm
    where dm.user_id = any (p_student_ids)
      and dm.mission_date >= p_from_date and dm.mission_date < p_to_date
    group by dm.user_id
  ) m on m.user_id = s.id
  left join (
    select r.student_id, 5 * count(*) as points
    from public.student_assignment_results r
    where r.student_id = any (p_student_ids)
      and r.completed_at >= p_from and r.completed_at < p_to
    group by r.student_id
  ) a on a.student_id = s.id;
$$;

revoke all on function private.weekly_board_points(uuid[], timestamptz, timestamptz, date, date) from public, anon, authenticated;

create or replace function public.rpc_get_weekly_class_board()
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
  v_from timestamptz;
  v_today_start timestamptz;
  v_class_id uuid;
  v_label text;
  v_members uuid[];
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  perform 1 from public.users where id = v_uid and role = 'student' and not coalesce(is_banned, false);
  if not found then return jsonb_build_object('available', false, 'reason', 'not_student'); end if;

  select cs.class_id, coalesce(nullif(c.class_name, ''), c.class_code)
    into v_class_id, v_label
  from public.class_students cs
  join public.classes c on c.id = cs.class_id
  where cs.student_id = v_uid and coalesce(c.is_active, true)
  order by cs.joined_at desc nulls last
  limit 1;

  if v_class_id is null then return jsonb_build_object('available', false, 'reason', 'no_class'); end if;

  select array_agg(distinct cs.student_id) into v_members
  from public.class_students cs
  join public.users u on u.id = cs.student_id
  where cs.class_id = v_class_id and u.role = 'student' and not coalesce(u.is_banned, false);

  if coalesce(cardinality(v_members), 0) < 2 then
    return jsonb_build_object('available', false, 'reason', 'class_too_small');
  end if;

  v_from := v_week_start::timestamp at time zone v_tz;
  v_today_start := v_today::timestamp at time zone v_tz;

  with now_pts as (
    select * from private.weekly_board_points(v_members, v_from, now() + interval '1 minute', v_week_start, v_today + 1)
  ),
  before_pts as (
    select * from private.weekly_board_points(v_members, v_from, v_today_start, v_week_start, v_today)
  ),
  ranked as (
    select n.student_id, n.points,
      rank() over (order by n.points desc) as rnk,
      rank() over (order by b.points desc) as rank_before
    from now_pts n join before_pts b on b.student_id = n.student_id
  ),
  me as (select * from ranked where student_id = v_uid),
  ordered as (
    select r.*, row_number() over (order by r.points desc, lower(coalesce(u.username, '')), r.student_id) as pos,
      coalesce(nullif(u.username, ''), 'Student') as name, u.avatar_url
    from ranked r join public.users u on u.id = r.student_id
  ),
  my_pos as (select pos from ordered where student_id = v_uid),
  ahead as (
    select o.name, o.points from ordered o, me
    where o.points > me.points order by o.points asc, o.pos desc limit 1
  ),
  shown as (
    select o.* from ordered o, my_pos
    where o.pos <= 3 or o.pos between my_pos.pos - 2 and my_pos.pos + 2
  )
  select jsonb_build_object(
    'available', true,
    'class_label', v_label,
    'class_size', cardinality(v_members),
    'week_start', v_week_start,
    'days_until_reset', 8 - extract(isodow from v_today)::int,
    'my_rank', (select rnk from me),
    'my_points', (select points from me),
    'rank_at_start_of_today', (select rank_before from me),
    'places_climbed_today', greatest((select rank_before - rnk from me), 0),
    'next_name', (select name from ahead),
    'points_to_next', (select a.points - me.points from ahead a, me),
    'entries', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank', s.rnk, 'position', s.pos, 'name', s.name, 'avatar_url', s.avatar_url,
        'points', s.points, 'is_me', s.student_id = v_uid
      ) order by s.pos), '[]'::jsonb)
      from shown s
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_get_weekly_class_board() from public, anon;
grant execute on function public.rpc_get_weekly_class_board() to authenticated;
