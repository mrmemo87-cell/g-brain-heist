-- Make Superadmin "Last active" reflect real authenticated activity instead of stale profile timestamps.
-- 1) Backfill last_seen from Supabase Auth sign-in truth when it is newer.
-- 2) Add a safe self-only heartbeat RPC for active app sessions.
-- 3) Make the Superadmin users RPC expose the newest truthful activity timestamp.

update public.users u
set last_seen = au.last_sign_in_at
from auth.users au
where au.id = u.id
  and au.last_sign_in_at is not null
  and (u.last_seen is null or au.last_sign_in_at > u.last_seen);

create or replace function public.rpc_touch_last_seen()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  update public.users
  set last_seen = v_now
  where id = v_actor;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  return v_now;
end;
$$;

revoke all on function public.rpc_touch_last_seen() from public, anon;
grant execute on function public.rpc_touch_last_seen() to authenticated;

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
    u.username::text,
    coalesce(au.email::text, u.email::text),
    u.avatar_url::text,
    u.grade::text,
    u.batch::text,
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
    coalesce(u.role, 'student')::text,
    coalesce(u.level, 1),
    u.school_id,
    s.name::text,
    greatest(u.last_seen, au.last_sign_in_at)
  from public.users u
  left join auth.users au on au.id = u.id
  left join public.schools s on s.id = u.school_id
  where (
      v_search is null
      or coalesce(u.username, '') ilike '%' || v_search || '%'
      or coalesce(au.email::text, u.email, '') ilike '%' || v_search || '%'
      or coalesce(u.batch, '') ilike '%' || v_search || '%'
      or coalesce(s.name::text, '') ilike '%' || v_search || '%'
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
    case when v_sort = 'name' then lower(coalesce(u.username, au.email::text, u.email, '')) end asc nulls last,
    case when v_sort = 'xp' then coalesce(u.xp, 0) end desc nulls last,
    case when v_sort = 'level' then coalesce(u.level, 0) end desc nulls last,
    case when v_sort = 'last-active' then greatest(u.last_seen, au.last_sign_in_at) end desc nulls last,
    u.id
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.rpc_superadmin_list_users(integer, integer, text, text, integer, uuid, text, text) from public, anon;
grant execute on function public.rpc_superadmin_list_users(integer, integer, text, text, integer, uuid, text, text) to authenticated;
