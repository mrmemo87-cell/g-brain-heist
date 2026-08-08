-- Make the Staff & Students directory search the identity fields it displays.
-- The function remains school-scoped and available only to authenticated callers;
-- its existing administrator check continues to fail closed.

create or replace function public.get_school_members(
  p_school_id uuid default null,
  p_role_filter text default null,
  p_search text default null,
  p_sort_key text default 'username',
  p_sort_direction text default 'asc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_school_id uuid;
  v_is_admin boolean;
  v_members jsonb;
  v_total integer;
  v_safe_sort_key text;
  v_safe_direction text;
  v_search text := nullif(trim(p_search), '');
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  if p_school_id is not null then
    v_school_id := p_school_id;
  else
    select sm.school_id
      into v_school_id
      from public.school_members sm
     where sm.user_id = v_user_id
       and sm.status = 'active'
     order by sm.joined_at asc
     limit 1;
  end if;

  select exists (
    select 1
      from public.school_members sm
     where sm.school_id = v_school_id
       and sm.user_id = v_user_id
       and sm.role_in_school = 'school_admin'
       and sm.status = 'active'
  ) or public.is_superadmin(v_user_id)
    into v_is_admin;

  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;

  v_safe_sort_key := case lower(coalesce(p_sort_key, 'username'))
    when 'username' then 'u.username'
    when 'role' then 'sm.role_in_school'
    when 'grade' then 'u.grade'
    when 'level' then 'u.level'
    when 'last_seen' then 'u.last_seen'
    when 'status' then 'u.is_banned'
    else 'u.username'
  end;
  v_safe_direction := case when lower(coalesce(p_sort_direction, 'asc')) = 'desc' then 'desc' else 'asc' end;

  select count(*)
    into v_total
    from public.school_members sm
    join public.users u on u.id = sm.user_id
   where sm.school_id = v_school_id
     and (p_role_filter is null or sm.role_in_school = p_role_filter)
     and (
       v_search is null
       or u.full_name ilike '%' || v_search || '%'
       or u.username ilike '%' || v_search || '%'
       or u.email ilike '%' || v_search || '%'
     );

  execute format(
    $query$
      select jsonb_agg(member_row)
        from (
          select jsonb_build_object(
            'id', sm.id,
            'user_id', u.id,
            'username', u.username,
            'email', u.email,
            'full_name', u.full_name,
            'full_name_status', u.full_name_status,
            'avatar_url', u.avatar_url,
            'role_in_school', sm.role_in_school,
            'grade', u.grade,
            'batch', u.batch,
            'level', u.level,
            'xp', u.xp,
            'status', sm.status,
            'is_banned', u.is_banned,
            'banned_until', u.banned_until,
            'required_changes', u.required_changes,
            'joined_at', sm.joined_at,
            'last_seen', u.last_seen
          ) as member_row
            from public.school_members sm
            join public.users u on u.id = sm.user_id
           where sm.school_id = $1
             and ($2::text is null or sm.role_in_school = $2)
             and (
               $3::text is null
               or u.full_name ilike '%%' || $3 || '%%'
               or u.username ilike '%%' || $3 || '%%'
               or u.email ilike '%%' || $3 || '%%'
             )
           order by %s %s nulls last
           limit $4
          offset $5
        ) rows
    $query$,
    v_safe_sort_key,
    v_safe_direction
  )
  into v_members
  using v_school_id, p_role_filter, v_search, greatest(coalesce(p_limit, 50), 1), greatest(coalesce(p_offset, 0), 0);

  return jsonb_build_object(
    'success', true,
    'members', coalesce(v_members, '[]'::jsonb),
    'total', v_total,
    'limit', greatest(coalesce(p_limit, 50), 1),
    'offset', greatest(coalesce(p_offset, 0), 0)
  );
end;
$$;

revoke all on function public.get_school_members(uuid, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.get_school_members(uuid, text, text, text, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
