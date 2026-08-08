-- Gameplay integrity: atomic inventory activation, daily streak rewards, and
-- accurate PvP shield/cooldown target metadata.

create table if not exists public.daily_streak_rewards (
  user_id uuid not null references public.users(id) on delete cascade,
  reward_date date not null,
  streak integer not null check (streak > 0),
  coins_awarded integer not null check (coins_awarded >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, reward_date)
);

alter table public.daily_streak_rewards enable row level security;
revoke all on table public.daily_streak_rewards from public, anon, authenticated;

create or replace function public.rpc_record_daily_streak()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bishkek')::date;
  v_last_reward date;
  v_current_streak integer;
  v_new_streak integer;
  v_reward integer;
  v_coins integer;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text), hashtext('daily_streak'));

  select max(reward_date) into v_last_reward
  from public.daily_streak_rewards where user_id = v_user_id;

  select coalesce(streak, 0) into v_current_streak
  from public.users where id = v_user_id for update;

  if exists (select 1 from public.daily_streak_rewards where user_id = v_user_id and reward_date = v_today) then
    select coins into v_coins from public.users where id = v_user_id;
    return jsonb_build_object('claimed', false, 'streak', v_current_streak, 'coins_awarded', 0, 'coins', v_coins);
  end if;

  v_new_streak := case when v_last_reward = v_today - 1 then greatest(v_current_streak, 0) + 1 else 1 end;
  v_reward := case
    when v_new_streak % 30 = 0 then 250
    when v_new_streak % 14 = 0 then 100
    when v_new_streak % 7 = 0 then 50
    when v_new_streak % 3 = 0 then 25
    else 10
  end;

  update public.users
  set streak = v_new_streak, coins = coalesce(coins, 0) + v_reward, last_seen = now()
  where id = v_user_id returning coins into v_coins;

  insert into public.daily_streak_rewards(user_id, reward_date, streak, coins_awarded)
  values (v_user_id, v_today, v_new_streak, v_reward);

  return jsonb_build_object('claimed', true, 'streak', v_new_streak, 'coins_awarded', v_reward, 'coins', v_coins);
end;
$$;
revoke all on function public.rpc_record_daily_streak() from public, anon;
grant execute on function public.rpc_record_daily_streak() to authenticated;

create or replace function public.inventory_activate(p_inventory_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.inventory%rowtype;
  v_now timestamptz := now();
  v_expires timestamptz;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select * into v_item from public.inventory
  where id = p_inventory_id and user_id = v_user_id for update;
  if not found then raise exception 'Item not found in inventory'; end if;
  if v_item.state <> 'unused' then raise exception 'Item cannot be activated'; end if;

  if v_item.kind in ('encryption_key', 'exploit_kit') then
    update public.users set attack_power = coalesce(attack_power, 10) + greatest(coalesce(v_item.attack_bonus, 0), 0)
    where id = v_user_id;
  elsif v_item.kind = 'firewall' then
    update public.users set defense_power = coalesce(defense_power, 10) + greatest(coalesce(v_item.defense_bonus, 0), 0)
    where id = v_user_id;
  elsif v_item.kind in ('booster', 'major_booster') then
    v_expires := v_now + interval '1 hour';
    update public.inventory set state = 'consumed', expires_at = v_now
    where user_id = v_user_id and id <> p_inventory_id and state = 'active'
      and kind in ('booster', 'major_booster');
  elsif v_item.kind = 'shield' or v_item.kind = 'cosmetic' then
    v_expires := null;
  else
    v_expires := v_now + interval '1 hour';
  end if;

  update public.inventory
  set state = 'active', activated_at = v_now, expires_at = v_expires
  where id = p_inventory_id;

  if v_item.kind = 'cosmetic' then
    update public.users set
      active_cosmetic_frame = case when v_item.item_id = 'item_cosmetic_frame' then 'neon' else active_cosmetic_frame end,
      active_cosmetic_theme = case when v_item.item_id = 'item_cosmetic_theme' then 'flicker' else active_cosmetic_theme end,
      active_cosmetic_effect = case when v_item.item_id = 'item_cosmetic_glitch' then 'glitch' else active_cosmetic_effect end
    where id = v_user_id;
  end if;

  return jsonb_build_object(
    'state_after', 'active',
    'effect_window', jsonb_build_object('start', v_now, 'end', case when v_expires is null then case when v_item.kind = 'shield' then 'Until Cracked' else 'Permanent' end else v_expires::text end)
  );
end;
$$;
revoke all on function public.inventory_activate(uuid) from public, anon;
grant execute on function public.inventory_activate(uuid) to authenticated;

-- Target cards must reflect shields that combat actually considers active.
create or replace function public.get_attack_targets(p_limit integer default 100)
returns table(id uuid, username text, level integer, coins integer, batch text, avatar_url text, last_seen timestamptz, attack_power integer, defense_power integer, last_attacked_at timestamptz, xp integer, has_shield boolean, clan_id uuid, clan_name text, school_id uuid)
language sql
security definer
set search_path = public
as $$
  select u.id, u.username, coalesce(u.level,1)::integer, coalesce(u.coins,0)::integer,
    u.batch, u.avatar_url, u.last_seen, coalesce(u.attack_power,10)::integer,
    coalesce(u.defense_power,10)::integer, u.last_attacked_at, coalesce(u.xp,0)::integer,
    exists(select 1 from public.inventory i where i.user_id=u.id and i.kind='shield'
      and i.state='active' and (i.expires_at is null or i.expires_at > now())),
    cm.clan_id, cl.name, u.school_id
  from public.users u
  left join public.clan_members cm on cm.user_id=u.id
  left join public.clans cl on cl.id=cm.clan_id
  where u.id <> auth.uid()
    and u.school_id is not distinct from public.get_caller_school_id()
    and coalesce(u.role,'student')='student' and coalesce(u.is_admin,false)=false
    and coalesce(u.is_banned,false)=false
  order by u.last_seen desc nulls last
  limit least(greatest(coalesce(p_limit,100),1),100)
$$;
revoke all on function public.get_attack_targets(integer) from public, anon;
grant execute on function public.get_attack_targets(integer) to authenticated;
