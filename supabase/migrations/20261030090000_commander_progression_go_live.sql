-- Cursed Commander: progression go-live.
--
-- Production applied economy_level_gates_v2 before the Unit Training, Unit Evolution,
-- School Mastery and Formations migrations, so v2 took its fallback branch. Deploy order:
--   1. 20260915140000_commander_unit_training_v1.sql
--   2. 20260915193000_commander_unit_evolution_v1.sql
--   3. 20260915213000_commander_school_mastery_v1.sql
--   4. 20260915233000_commander_formations_41_100.sql
--   5. 20260915233500_commander_formations_replace_future_track.sql
--   6. this migration
-- On a fresh replay (filename order) the same final state results.
--
-- 1. Re-assert the progression-aware HQ snapshot. Unit Training v1 replaces it with a version
--    that advertises rankCap = 5 + level/2 while the economy trigger enforces stat_rank_cap.
--    This is the economy v2 snapshot verbatim, so the UI and the server agree again.
-- 2. Commander XP sources. The only previous source (verified task_d1 claims) has produced no
--    XP in production. New server-only sources, all inside the existing daily/weekly XP caps:
--      - daily login streak  (rpc_commander_daily_checkin, once per UTC day)
--      - PvP victory          (service role only, verified against the stored battle)
--      - Practice victory     (service role only, once per UTC day)
--    Each grant is idempotent through a deterministic commander_transactions.request_id.

begin;

update public.commander_campaigns
set rules = '{
  "dailyLoginXp": 100,
  "dailyLoginStreakBonusXp": 25,
  "dailyLoginStreakMaxDays": 7,
  "pvpVictoryXp": 60,
  "pvpVictoryDailyLimit": 5,
  "practiceVictoryXp": 40
}'::jsonb || rules
where active;

create or replace function commander_private.snapshot(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  c public.commander_campaigns;
  p public.commander_profiles;
  commander_level integer;
  unit_cap integer := 1;
  progression_cap integer := 1;
  visible_cap integer := 1;
begin
  select * into c from public.commander_campaigns where active;
  if not found then raise exception 'commander_unavailable'; end if;

  select * into p
  from public.commander_profiles
  where user_id = p_user and campaign_id = c.id;

  if p.user_id is not null then
    commander_level := commander_private.level(p.xp);
    unit_cap := commander_private.unit_rank_cap(commander_level, c.rules);
    progression_cap := commander_private.stat_rank_cap(commander_level, c.rules);
    visible_cap := least(
      coalesce((c.rules->>'maxRank')::integer, 10),
      greatest(progression_cap, p.force_rank, p.defense_rank, p.dexterity_rank, p.stamina_rank)
    );
  end if;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'coins', (select coalesce(coins, 0) from public.users where id = p_user),
      'currency', 'brains_heist_coins'
    ),
    'campaign', jsonb_build_object('id', c.id, 'title', c.title, 'rules', c.rules),
    'profile', case when p.user_id is null then null else
      to_jsonb(p) || jsonb_build_object(
        'coins', (select coalesce(coins, 0) from public.users where id = p_user),
        'level', commander_level,
        'rankCap', visible_cap,
        'unitRankCap', unit_cap
      )
    end,
    'catalog', (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.unlock_level, i.price, i.id), '[]'::jsonb)
      from public.commander_catalog i
      where i.active
    ),
    'owned', (
      select coalesce(jsonb_agg(item_id order by item_id), '[]'::jsonb)
      from public.commander_owned_items
      where user_id = p_user and campaign_id = c.id
    ),
    'unitProgress', case when p.user_id is null then '[]'::jsonb else (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'itemId', up.item_id,
            'unitRank', up.unit_rank,
            'evolutionTier', up.evolution_tier,
            'trainingPoints', up.training_points,
            'version', up.version,
            'rankCap', unit_cap,
            'maxRank', coalesce((c.rules->>'unitTrainingMaxRank')::integer, 10),
            'nextCost', case
              when up.unit_rank >= coalesce((c.rules->>'unitTrainingMaxRank')::integer, 10) then null
              else commander_private.unit_training_cost(up.unit_rank, c.rules)
            end,
            'veteran', commander_level >= coalesce((c.rules->>'unitVeteranUnlockLevel')::integer, 20)
              and up.unit_rank >= coalesce((c.rules->>'unitTrainingMaxRank')::integer, 10)
          )
          order by up.item_id
        ),
        '[]'::jsonb
      )
      from public.commander_unit_progress up
      join public.commander_owned_items oi
        on oi.user_id = up.user_id
       and oi.campaign_id = up.campaign_id
       and oi.item_id = up.item_id
      join public.commander_catalog i
        on i.id = up.item_id
       and i.kind = 'unit'
      where up.user_id = p_user
        and up.campaign_id = c.id
    ) end,
    'loadout', case when p.user_id is null then null else commander_private.loadout(p_user, c.id) end,
    'history', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
      from (
        select operation, payload, coins_delta, xp_delta, created_at
        from public.commander_transactions
        where user_id = p_user and campaign_id = c.id
        order by created_at desc
        limit 16
      ) t
    )
  );
end
$fn$
;

revoke all on function commander_private.snapshot(uuid) from public, anon, authenticated;

-- Grants XP once per (source, key). Returns {awarded, xp, reason}.
create or replace function commander_private.grant_xp(
  p_user uuid,
  p_campaign text,
  p_source text,
  p_key text,
  p_xp integer,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rules jsonb;
  req uuid;
  day_xp bigint;
  week_xp bigint;
  amount integer;
begin
  if p_source is null or p_source not in ('daily_login', 'pvp_victory', 'practice_victory')
     or p_key is null or p_xp is null or p_xp < 0 then
    raise exception 'commander_invalid_reward';
  end if;

  perform 1 from public.commander_profiles
  where user_id = p_user and campaign_id = p_campaign
  for update;
  if not found then raise exception 'commander_enroll_first'; end if;

  req := md5('commander-xp:' || p_source || ':' || p_key)::uuid;
  if exists (
    select 1 from public.commander_transactions
    where user_id = p_user and campaign_id = p_campaign and request_id = req
  ) then
    return jsonb_build_object('awarded', false, 'xp', 0, 'reason', 'already_awarded');
  end if;

  select c.rules into rules from public.commander_campaigns c where c.id = p_campaign;

  select
    coalesce(sum(t.xp_delta) filter (
      where (t.created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date), 0),
    coalesce(sum(t.xp_delta) filter (
      where date_trunc('week', t.created_at at time zone 'UTC') = date_trunc('week', now() at time zone 'UTC')), 0)
  into day_xp, week_xp
  from public.commander_transactions t
  where t.user_id = p_user and t.campaign_id = p_campaign and t.operation = 'reward';

  amount := greatest(0, least(
    p_xp,
    coalesce((rules->>'dailyXpCap')::integer, 3000) - day_xp,
    coalesce((rules->>'weeklyXpCap')::integer, 15000) - week_xp
  ))::integer;

  insert into public.commander_transactions(user_id, campaign_id, request_id, operation, payload, coins_delta, xp_delta)
  values (
    p_user, p_campaign, req, 'reward',
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('source', p_source, 'key', p_key),
    0, amount
  );

  if amount > 0 then
    update public.commander_profiles
    set xp = xp + amount, version = version + 1, updated_at = now()
    where user_id = p_user and campaign_id = p_campaign;
  end if;

  return jsonb_build_object(
    'awarded', amount > 0,
    'xp', amount,
    'reason', case when amount < p_xp then 'xp_cap_reached' else null end
  );
end $$;

revoke all on function commander_private.grant_xp(uuid, text, text, text, integer, jsonb) from public, anon, authenticated;

-- Student: claim today's login XP. Safe to call on every HQ open.
create or replace function public.rpc_commander_daily_checkin()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid := auth.uid();
  c public.commander_campaigns;
  today date := (now() at time zone 'UTC')::date;
  existing jsonb;
  previous_streak integer;
  streak integer;
  max_days integer;
  grant_result jsonb;
begin
  perform commander_private.student(u);
  select * into c from public.commander_campaigns where active;
  if not found then raise exception 'commander_unavailable'; end if;

  perform 1 from public.commander_profiles
  where user_id = u and campaign_id = c.id
  for update;
  if not found then raise exception 'commander_enroll_first'; end if;

  select t.payload into existing
  from public.commander_transactions t
  where t.user_id = u and t.campaign_id = c.id and t.operation = 'reward'
    and t.request_id = md5('commander-xp:daily_login:' || today::text)::uuid;
  if existing is not null then
    return jsonb_build_object('awarded', false, 'xp', 0, 'reason', 'already_awarded',
      'streak', coalesce((existing->>'streak')::integer, 1), 'day', today);
  end if;

  select (t.payload->>'streak')::integer into previous_streak
  from public.commander_transactions t
  where t.user_id = u and t.campaign_id = c.id and t.operation = 'reward'
    and t.request_id = md5('commander-xp:daily_login:' || (today - 1)::text)::uuid;

  streak := coalesce(previous_streak, 0) + 1;
  max_days := greatest(1, coalesce((c.rules->>'dailyLoginStreakMaxDays')::integer, 7));

  grant_result := commander_private.grant_xp(
    u, c.id, 'daily_login', today::text,
    coalesce((c.rules->>'dailyLoginXp')::integer, 100)
      + coalesce((c.rules->>'dailyLoginStreakBonusXp')::integer, 25) * (least(streak, max_days) - 1),
    jsonb_build_object('streak', streak)
  );
  return grant_result || jsonb_build_object('streak', streak, 'day', today);
end $$;

revoke all on function public.rpc_commander_daily_checkin() from public, anon, authenticated;
grant execute on function public.rpc_commander_daily_checkin() to authenticated;

-- Edge Functions only: award XP for a finished battle the server itself resolved.
create or replace function public.rpc_commander_award_battle_xp(
  p_user_id uuid,
  p_source text,
  p_battle_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.commander_campaigns;
  b public.commander_pvp_battles;
  today date := (now() at time zone 'UTC')::date;
  wins_today integer;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') <> 'service_role' then
    raise exception 'commander_service_only' using errcode = '42501';
  end if;
  perform commander_private.student(p_user_id);
  select * into c from public.commander_campaigns where active;
  if not found then raise exception 'commander_unavailable'; end if;

  perform 1 from public.commander_profiles
  where user_id = p_user_id and campaign_id = c.id
  for update;
  if not found then raise exception 'commander_enroll_first'; end if;

  if p_source = 'pvp_victory' then
    select * into b from public.commander_pvp_battles
    where id = p_battle_id and attacker_id = p_user_id and campaign_id = c.id and status = 'victory';
    if not found then raise exception 'commander_reward_not_eligible'; end if;

    if exists (
      select 1 from public.commander_transactions t
      where t.user_id = p_user_id and t.campaign_id = c.id
        and t.request_id = md5('commander-xp:pvp_victory:' || b.id::text)::uuid
    ) then
      return jsonb_build_object('awarded', false, 'xp', 0, 'reason', 'already_awarded');
    end if;

    -- One rewarded win per opponent per day, so a weak or friendly rival cannot be farmed.
    if exists (
      select 1 from public.commander_transactions t
      where t.user_id = p_user_id and t.campaign_id = c.id and t.operation = 'reward'
        and t.payload->>'source' = 'pvp_victory'
        and t.payload->>'opponent' = b.defender_id::text
        and (t.created_at at time zone 'UTC')::date = today
    ) then
      return jsonb_build_object('awarded', false, 'xp', 0, 'reason', 'opponent_rewarded_today');
    end if;

    select count(*) into wins_today
    from public.commander_transactions t
    where t.user_id = p_user_id and t.campaign_id = c.id and t.operation = 'reward'
      and t.payload->>'source' = 'pvp_victory'
      and (t.created_at at time zone 'UTC')::date = today;
    if wins_today >= coalesce((c.rules->>'pvpVictoryDailyLimit')::integer, 5) then
      return jsonb_build_object('awarded', false, 'xp', 0, 'reason', 'daily_limit_reached');
    end if;

    return commander_private.grant_xp(
      p_user_id, c.id, 'pvp_victory', b.id::text,
      coalesce((c.rules->>'pvpVictoryXp')::integer, 60),
      jsonb_build_object('opponent', b.defender_id, 'battle', b.id)
    );
  elsif p_source = 'practice_victory' then
    -- Practice state lives in a client-held signed transcript and can be replayed,
    -- so only the first Practice win of each day is rewarded.
    return commander_private.grant_xp(
      p_user_id, c.id, 'practice_victory', today::text,
      coalesce((c.rules->>'practiceVictoryXp')::integer, 40)
    );
  end if;

  raise exception 'commander_invalid_reward';
end $$;

revoke all on function public.rpc_commander_award_battle_xp(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.rpc_commander_award_battle_xp(uuid, text, uuid) to service_role;

comment on function public.rpc_commander_daily_checkin() is
  'Commander daily login XP with a capped streak bonus. Once per UTC day, inside the campaign XP caps.';
comment on function public.rpc_commander_award_battle_xp(uuid, text, uuid) is
  'Service-role only. Awards Commander XP for a server-resolved PvP victory (verified against commander_pvp_battles) or the first Practice victory of the UTC day.';

notify pgrst, 'reload schema';
commit;
