-- School news feed: integrity + real moments + reaction notifications (2026-10-29).
--
-- Integrity (verified on production):
--   * Any student could INSERT activities of any kind under their own name. Task rewards
--     (rpc_claim_task_reward: quest_complete / pvp_win / task_claimed) and achievements
--     (rpc_check_achievements: pvp_win, shop_purchase amounts, quest_complete) count these rows,
--     so fake rows earned real XP, coins and gems.
--   * Any student could UPDATE any activity in their school (policy checked only the school),
--     i.e. rewrite a classmate's feed post that still shows the classmate's name.
--   * Reactions were written directly (no emoji validation).
--   No faked rows were found in production (every PvP row carries a server roll; every
--   task_claimed has a reward receipt; every shop_purchase matches a purchase).
--   -> activities and activity_reactions become server-written only. The one client write the
--      app still made (clan_deposit after a deposit) moves into rpc_clan_deposit_coins.
--
-- Feed quality:
--   * The feed returned every activity kind, so legacy duplicates (attack_success/attack_failed/
--     attack_blocked), shop purchases, deposits and task claims showed as
--     "X is up to something... 🤔". It now returns only displayable moments.
--   * Nothing ever wrote level_up or achievement_earned rows. The server now posts:
--     level-ups, achievements, streak milestones and clan joins.
--
-- Reactions:
--   * rpc_react_to_activity toggles one of 🔥 😮 😂 ❤️ on a feed post the caller can see.
--   * The post's owner gets a push ("🔥 Bek reacted to your level-up"), at most one per hour,
--     only for positive moments (never for a lost battle), respecting quiet hours and the
--     student's "Game alerts" switch.
--
-- Rollback: supabase/rollbacks/20261029200000_feed_integrity_and_moments.rollback.sql

-- ───────────────────────────── 1. activities: server-written only ─────────────────────────────
drop policy if exists "Users can create activities" on public.activities;
drop policy if exists activities_insert on public.activities;
drop policy if exists activities_insert_own on public.activities;
drop policy if exists activities_update on public.activities;
drop policy if exists activities_delete on public.activities;
revoke all on table public.activities from anon;
revoke insert, update, delete, truncate, references, trigger on table public.activities from authenticated;

-- ───────────────────────────── 2. reactions: through the RPC only ─────────────────────────────
drop policy if exists "Users can add reactions" on public.activity_reactions;
drop policy if exists "Users can delete own reactions" on public.activity_reactions;
drop policy if exists "Users can manage own reactions" on public.activity_reactions;
revoke all on table public.activity_reactions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.activity_reactions from authenticated;

-- ───────────────────────────── 3. clan deposit logs its own feed row ─────────────────────────────
create or replace function public.rpc_clan_deposit_coins(p_amount integer)
returns table(new_clan_vault integer, new_user_coins integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
  v_user_coins integer;
  v_username text;
  v_clan_id uuid;
  v_clan_vault integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid amount';
  end if;

  select u.coins, u.username
  into v_user_coins, v_username
  from public.users u
  where u.id = v_user_id
  for update;

  if v_user_coins is null then
    raise exception 'User profile not found';
  end if;

  if v_user_coins < p_amount then
    raise exception 'Insufficient funds';
  end if;

  select cm.clan_id
  into v_clan_id
  from public.clan_members cm
  where cm.user_id = v_user_id
  limit 1;

  if v_clan_id is null then
    raise exception 'Not in a clan';
  end if;

  select c.vault_coins
  into v_clan_vault
  from public.clans c
  where c.id = v_clan_id
  for update;

  if v_clan_vault is null then
    raise exception 'Clan not found';
  end if;

  update public.users
  set coins = coins - p_amount
  where id = v_user_id
  returning coins into new_user_coins;

  update public.clans
  set vault_coins = vault_coins + p_amount
  where id = v_clan_id
  returning vault_coins into new_clan_vault;

  insert into public.clan_member_coin_contributions (clan_id, user_id, total_deposited, last_deposit_at, updated_at)
  values (v_clan_id, v_user_id, p_amount, now(), now())
  on conflict (clan_id, user_id)
  do update
    set total_deposited = clan_member_coin_contributions.total_deposited + excluded.total_deposited,
        last_deposit_at = now(),
        updated_at = now();

  insert into public.activities (kind, actor_id, actor_username, data)
  values ('clan_deposit', v_user_id, v_username, jsonb_build_object('clan_id', v_clan_id, 'amount', p_amount));

  return next;
end;
$function$;
revoke all on function public.rpc_clan_deposit_coins(integer) from public, anon;
grant execute on function public.rpc_clan_deposit_coins(integer) to authenticated;

-- ───────────────────────────── 4. feed shows real moments only ─────────────────────────────
create or replace function public.get_school_activity_feed(p_limit integer)
returns table(id uuid, kind text, actor_id uuid, actor_username text, target_id uuid, target_username text,
              data jsonb, reactions jsonb, created_at timestamptz, school_id uuid, actor_role text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_school_id uuid;
begin
  v_school_id := get_caller_school_id();
  if v_school_id is null then
    return;
  end if;

  return query
  select a.id, a.kind, a.actor_id, a.actor_username, a.target_id, a.target_username,
         a.data, a.reactions, a.created_at, a.school_id, u.role as actor_role
  from public.activities a
  left join public.users u on u.id = a.actor_id
  where (
      a.school_id = v_school_id
      or (a.school_id is null and exists (
        select 1 from public.users actor where actor.id = a.actor_id and actor.school_id = v_school_id))
    )
    and coalesce(u.role, 'student') <> 'teacher'
    and a.kind in ('pvp_win', 'pvp_loss', 'pvp_blocked', 'level_up', 'achievement_earned',
                   'streak_milestone', 'clan_create', 'clan_joined')
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end;
$function$;
revoke all on function public.get_school_activity_feed(integer) from public, anon;
grant execute on function public.get_school_activity_feed(integer) to authenticated;

-- ───────────────────────────── 5. server-posted moments ─────────────────────────────
-- A feed post must never undo the change that caused it, so every trigger swallows errors.

create or replace function private.feed_post(p_kind text, p_actor uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
begin
  select u.id, u.username, u.role, coalesce(u.is_banned, false) as is_banned
    into v_user from public.users u where u.id = p_actor;
  if v_user.id is null or v_user.role <> 'student' or v_user.is_banned then
    return;
  end if;
  insert into public.activities (kind, actor_id, actor_username, data)
  values (p_kind, p_actor, v_user.username, coalesce(p_data, '{}'::jsonb));
end;
$$;
revoke all on function private.feed_post(text, uuid, jsonb) from public, anon, authenticated;

create or replace function private.trg_feed_level_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.level, 0) > coalesce(old.level, 0) and coalesce(old.level, 0) > 0 then
    begin
      perform private.feed_post('level_up', new.id,
        jsonb_build_object('level', new.level, 'details', 'Level ' || new.level));
    exception when others then
      raise warning 'feed level_up skipped: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function private.trg_feed_level_up() from public, anon, authenticated;
drop trigger if exists trg_feed_level_up on public.users;
create trigger trg_feed_level_up
  after update of level on public.users
  for each row execute function private.trg_feed_level_up();

create or replace function private.trg_feed_achievement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_icon text;
  v_now_earned boolean := coalesce(new.unlocked_at, new.earned_at) is not null;
  v_was_earned boolean := tg_op = 'UPDATE' and coalesce(old.unlocked_at, old.earned_at) is not null;
begin
  if v_now_earned and not v_was_earned then
    begin
      select a.name, a.icon into v_name, v_icon from public.achievements a where a.id = new.achievement_id;
      if v_name is not null then
        perform private.feed_post('achievement_earned', new.user_id,
          jsonb_build_object('achievement_id', new.achievement_id, 'achievement_name', v_name,
                             'achievement_icon', nullif(v_icon, '')));
      end if;
    exception when others then
      raise warning 'feed achievement skipped: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function private.trg_feed_achievement() from public, anon, authenticated;
drop trigger if exists trg_feed_achievement on public.user_achievements;
create trigger trg_feed_achievement
  after insert or update of unlocked_at, earned_at on public.user_achievements
  for each row execute function private.trg_feed_achievement();

create or replace function private.trg_feed_streak_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.streak in (3, 5, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 365) then
    begin
      perform private.feed_post('streak_milestone', new.user_id,
        jsonb_build_object('streak', new.streak, 'details', new.streak || '-day streak'));
    exception when others then
      raise warning 'feed streak skipped: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function private.trg_feed_streak_milestone() from public, anon, authenticated;
drop trigger if exists trg_feed_streak_milestone on public.daily_streak_rewards;
create trigger trg_feed_streak_milestone
  after insert on public.daily_streak_rewards
  for each row execute function private.trg_feed_streak_milestone();

create or replace function private.trg_feed_clan_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clan text;
begin
  if coalesce(new.role, 'member') <> 'leader' then
    begin
      select c.name into v_clan from public.clans c where c.id = new.clan_id;
      perform private.feed_post('clan_joined', new.user_id,
        jsonb_build_object('clan_id', new.clan_id, 'details', v_clan));
    exception when others then
      raise warning 'feed clan_joined skipped: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function private.trg_feed_clan_joined() from public, anon, authenticated;
drop trigger if exists trg_feed_clan_joined on public.clan_members;
create trigger trg_feed_clan_joined
  after insert on public.clan_members
  for each row execute function private.trg_feed_clan_joined();

-- ───────────────────────────── 6. reactions + notifications ─────────────────────────────
create or replace function public.rpc_react_to_activity(p_activity_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_me record;
  v_activity record;
  v_existing record;
  v_added boolean;
  v_what text;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_emoji not in ('🔥', '😮', '😂', '❤️') then raise exception 'Unsupported reaction'; end if;

  select u.id, u.username, coalesce(u.is_banned, false) as is_banned into v_me from public.users u where u.id = v_user_id;
  if v_me.id is null or v_me.is_banned then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not public.can_read_activity(p_activity_id) then
    raise exception 'Post not found' using errcode = '42501';
  end if;

  select a.id, a.kind, a.actor_id, a.target_username, a.data into v_activity
  from public.activities a where a.id = p_activity_id;

  select r.id, r.emoji into v_existing
  from public.activity_reactions r where r.activity_id = p_activity_id and r.user_id = v_user_id;

  if v_existing.id is not null and v_existing.emoji = p_emoji then
    delete from public.activity_reactions where id = v_existing.id;
    return jsonb_build_object('added', false, 'emoji', null);
  elsif v_existing.id is not null then
    update public.activity_reactions set emoji = p_emoji where id = v_existing.id;
    v_added := true;
  else
    insert into public.activity_reactions (activity_id, user_id, emoji) values (p_activity_id, v_user_id, p_emoji);
    v_added := true;
  end if;

  -- Tell the post's owner, for positive moments only, at most once an hour.
  v_what := case v_activity.kind
    when 'pvp_win' then 'your win against ' || coalesce(nullif(v_activity.target_username, ''), v_activity.data->>'defender_username', 'a rival')
    when 'level_up' then 'your level-up'
    when 'achievement_earned' then 'your achievement'
    when 'streak_milestone' then 'your streak'
    when 'clan_create' then 'your new clan'
    when 'clan_joined' then 'you joining ' || coalesce(v_activity.data->>'details', 'a clan')
    else null end;

  if v_added and v_what is not null and v_activity.actor_id is not null and v_activity.actor_id <> v_user_id then
    begin
      perform private.enqueue_game_push(
        v_activity.actor_id, 'feed_reaction',
        p_emoji || ' ' || left(coalesce(nullif(btrim(v_me.username), ''), 'A classmate'), 40) || ' reacted',
        'to ' || v_what || '. See who else is cheering!',
        '/?view=dashboard',
        private.game_push_bucket_key('feed-reaction', v_activity.actor_id, now(), 60),
        jsonb_build_object('activity_id', p_activity_id, 'emoji', p_emoji),
        now());
    exception when others then
      raise warning 'feed reaction push skipped: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('added', true, 'emoji', p_emoji);
end;
$$;
revoke all on function public.rpc_react_to_activity(uuid, text) from public, anon;
grant execute on function public.rpc_react_to_activity(uuid, text) to authenticated;
