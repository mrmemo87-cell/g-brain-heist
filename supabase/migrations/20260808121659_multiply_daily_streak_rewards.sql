-- Boost the existing server-authoritative daily streak economy by 10x and
-- expose the reward date so the client can identify the one-time receipt.

create or replace function public.rpc_record_daily_streak()
returns jsonb
language plpgsql
security definer
set search_path = ''
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
    return jsonb_build_object(
      'claimed', false,
      'reward_date', v_today,
      'streak', v_current_streak,
      'coins_awarded', 0,
      'coins', v_coins
    );
  end if;

  v_new_streak := case when v_last_reward = v_today - 1 then greatest(v_current_streak, 0) + 1 else 1 end;
  v_reward := case
    when v_new_streak % 30 = 0 then 2500
    when v_new_streak % 14 = 0 then 1000
    when v_new_streak % 7 = 0 then 500
    when v_new_streak % 3 = 0 then 250
    else 100
  end;

  update public.users
  set streak = v_new_streak, coins = coalesce(coins, 0) + v_reward, last_seen = now()
  where id = v_user_id returning coins into v_coins;

  insert into public.daily_streak_rewards(user_id, reward_date, streak, coins_awarded)
  values (v_user_id, v_today, v_new_streak, v_reward);

  return jsonb_build_object(
    'claimed', true,
    'reward_date', v_today,
    'streak', v_new_streak,
    'coins_awarded', v_reward,
    'coins', v_coins
  );
end;
$$;

revoke all on function public.rpc_record_daily_streak() from public, anon;
grant execute on function public.rpc_record_daily_streak() to authenticated;
