create or replace function public.rpc_commander_pvp_lobby(p_search text default null::text, p_limit integer default 40)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  c public.commander_campaigns;
  my_level integer;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 40), 60));
  needle text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform commander_private.student(u);

  select * into c
  from public.commander_campaigns
  where active;
  if not found then
    raise exception 'commander_unavailable';
  end if;

  if not exists (
    select 1 from public.commander_profiles p
    where p.user_id = u and p.campaign_id = c.id
  ) then
    raise exception 'commander_enroll_first';
  end if;

  update public.commander_pvp_battles
  set status = 'expired', finished_at = coalesce(finished_at, now()), updated_at = now()
  where attacker_id = u
    and status = 'active'
    and expires_at <= now();

  select commander_private.level(p.xp)
  into my_level
  from public.commander_profiles p
  where p.user_id = u and p.campaign_id = c.id;

  return jsonb_build_object(
    'rules', jsonb_build_object(
      'cooldownSeconds', coalesce((c.rules->>'pvpCooldownSeconds')::integer, 300),
      'battleTtlMinutes', coalesce((c.rules->>'pvpBattleTtlMinutes')::integer, 30)
    ),
    'targets', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from (
        select
          candidate.id as user_id,
          coalesce(nullif(trim(candidate.username), ''), 'Commander') as username,
          candidate.avatar_url,
          commander_private.level(cp.xp) as level,
          guard_item.name as guard_name,
          archer_item.name as archer_name,
          guard_item.school as guard_school,
          archer_item.school as archer_school,
          case when active_elixir.user_id is not null then jsonb_build_object(
            'id', elixir_item.id,
            'name', elixir_item.name,
            'statKey', elixir_item.stat_key,
            'boostRanks', elixir_item.boost_ranks,
            'expiresAt', active_elixir.expires_at
          ) else null end as active_elixir,
          (
            select max(b.created_at)
            from public.commander_pvp_battles b
            where b.attacker_id = u
              and b.defender_id = candidate.id
          ) as last_attacked_at
        from public.users candidate
        join public.commander_profiles cp
          on cp.user_id = candidate.id
         and cp.campaign_id = c.id
        join public.commander_catalog guard_item on guard_item.id = cp.guard
        join public.commander_catalog archer_item on archer_item.id = cp.archer
        left join public.commander_active_elixirs active_elixir
          on active_elixir.user_id = candidate.id
         and active_elixir.expires_at > now()
        left join public.commander_elixir_catalog elixir_item
          on elixir_item.id = active_elixir.elixir_id
         and elixir_item.active
        where candidate.id <> u
          and coalesce(candidate.role, 'student') = 'student'
          and not coalesce(candidate.is_banned, false)
          and (candidate.banned_until is null or candidate.banned_until <= now())
          and (
            needle is null
            or coalesce(candidate.username, '') ilike '%' || needle || '%'
          )
        order by
          abs(commander_private.level(cp.xp) - my_level),
          coalesce(candidate.username, ''),
          candidate.id
        limit safe_limit
      ) t
    ),
    'activeBattle', (
      select to_jsonb(a)
      from (
        select
          b.id as battle_id,
          b.defender_id as opponent_user_id,
          coalesce(nullif(trim(opponent.username), ''), 'Commander') as opponent_username,
          opponent.avatar_url as opponent_avatar_url,
          commander_private.level(op.xp) as opponent_level,
          b.defender_snapshot->'elixir' as opponent_elixir,
          b.created_at,
          b.expires_at
        from public.commander_pvp_battles b
        join public.users opponent on opponent.id = b.defender_id
        join public.commander_profiles op
          on op.user_id = opponent.id
         and op.campaign_id = b.campaign_id
        where b.attacker_id = u
          and b.campaign_id = c.id
          and b.status = 'active'
          and b.expires_at > now()
        order by b.created_at desc
        limit 1
      ) a
    ),
    'history', (
      select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
      from (
        select
          b.id as battle_id,
          case
            when b.attacker_id = u then b.status
            when b.status = 'victory' then 'defeat'
            when b.status = 'defeat' then 'victory'
            else b.status
          end as result,
          (b.attacker_id = u) as was_attacker,
          opponent.id as opponent_user_id,
          coalesce(nullif(trim(opponent.username), ''), 'Commander') as opponent_username,
          opponent.avatar_url as opponent_avatar_url,
          b.created_at,
          b.finished_at
        from public.commander_pvp_battles b
        join public.users opponent
          on opponent.id = case when b.attacker_id = u then b.defender_id else b.attacker_id end
        where b.campaign_id = c.id
          and (b.attacker_id = u or b.defender_id = u)
          and b.status <> 'active'
        order by b.created_at desc
        limit 20
      ) h
    )
  );
end;
$$;

revoke all on function public.rpc_commander_pvp_lobby(text,integer) from public, anon;
grant execute on function public.rpc_commander_pvp_lobby(text,integer) to authenticated;
