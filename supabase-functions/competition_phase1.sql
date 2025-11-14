-- ============================================
-- Silk Road Competition Phase 1 RPCs
-- ============================================
set check_function_bodies = off;

-- Ensure announcements tables are aligned with expected columns
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'announcements'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'announcements'
        and column_name = 'priority'
    ) then
      alter table announcements add column priority text default 'normal';
      update announcements set priority = coalesce(priority, 'normal');
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'announcements'
        and column_name = 'active'
    ) then
      alter table announcements add column active boolean default true;
      update announcements set active = coalesce(active, true);
    end if;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'announcement_receipts'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'announcement_receipts'
        and column_name = 'seen_at'
    ) then
      alter table announcement_receipts add column seen_at timestamptz default now();
    end if;
  end if;
end;
$$;

-- ============================================
-- AP Regeneration Helpers
-- ============================================
drop view if exists users_with_current_ap;
drop function if exists calculate_current_ap(int, int, timestamptz);
drop function if exists regenerate_user_ap(uuid);

create or replace function calculate_current_ap(
  current_ap int,
  max_ap int,
  last_update timestamptz
)
returns int
language plpgsql
set search_path = public
as $$
declare
  minutes_elapsed int;
  ap_to_regen int;
begin
  minutes_elapsed := greatest(0, extract(epoch from (now() - last_update))::int / 60);
  ap_to_regen := minutes_elapsed / 10;
  return least(current_ap + ap_to_regen, max_ap);
end;
$$;

create or replace view users_with_current_ap as
select
  u.*,
  calculate_current_ap(u.ap_now, u.ap_max, coalesce(u.last_ap_update, now())) as ap_current
from users u;

create or replace function regenerate_user_ap(user_id_param uuid)
returns table (
  new_ap int,
  ap_regenerated int,
  minutes_elapsed int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_minutes int;
  v_regen int;
  v_new_ap int;
begin
  select
    u.ap_now,
    u.ap_max,
    coalesce(u.last_ap_update, now()) as last_ap_update
  into v_user
  from users u
  where u.id = user_id_param
  for update;

  if not found then
    raise exception 'user_not_found';
  end if;

  v_minutes := greatest(0, extract(epoch from (now() - v_user.last_ap_update))::int / 60);
  v_regen := v_minutes / 10;

  if v_regen > 0 and v_user.ap_now < v_user.ap_max then
    v_new_ap := least(v_user.ap_now + v_regen, v_user.ap_max);

    update users
    set ap_now = v_new_ap,
        last_ap_update = now(),
        updated_at = now()
    where id = user_id_param;

    return query select v_new_ap, v_new_ap - v_user.ap_now, v_minutes;
  else
    return query select v_user.ap_now, 0, v_minutes;
  end if;
end;
$$;

-- Helper function to assert admin access
create or replace function is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from users u
    where u.id = auth.uid()
      and (u.is_admin = true or u.role = 'admin')
  );
$$;

-- ============================================
-- Fetch next question for a grade
-- ============================================
create or replace function rpc_questions_next(p_grade int)
returns table (
  id bigint,
  stem text,
  opt1 text,
  opt2 text,
  opt3 text,
  opt4 text,
  lang text,
  reward_xp int,
  reward_coins int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_question mcq_questions%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from users u
    where u.id = v_user_id
      and coalesce(u.is_banned, false) = false
      and coalesce(u.grade::int, p_grade) = p_grade
  ) then
    raise exception 'grade_mismatch';
  end if;

  select * into v_question
  from mcq_questions q
  where q.grade = p_grade
    and q.active = true
    and not exists (
      select 1 from attempts a
      where a.user_id = v_user_id
        and a.question_id = q.id
        and a.created_at > now() - interval '24 hours'
    )
  order by random()
  limit 1;

  if not found then
    select * into v_question
    from mcq_questions q
    where q.grade = p_grade
      and q.active = true
    order by random()
    limit 1;
  end if;

  if not found then
    return;
  end if;

  return query
  select v_question.id,
         v_question.stem,
         v_question.opt1,
         v_question.opt2,
         v_question.opt3,
         v_question.opt4,
         coalesce(v_question.lang, 'ru'),
         coalesce(v_question.reward_xp, 20),
         coalesce(v_question.reward_coins, 10);
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_questions_next', 'error', SQLERRM, v_user_id, json_build_object('grade', p_grade));
  raise;
end;
$$;

-- ============================================
-- Submit an attempt
-- ============================================
create or replace function rpc_submit_attempt(p_question_id bigint, p_choice int)
returns table (
  is_correct boolean,
  correct_option int,
  xp_awarded int,
  coins_awarded int,
  profile_xp int,
  profile_coins int,
  profile_streak int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile users%rowtype;
  v_question mcq_questions%rowtype;
  v_is_correct boolean;
  v_xp_award int;
  v_coin_award int;
  v_new_streak int;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_profile
  from users u
  where u.id = v_user_id
  for update;

  if not found then
    raise exception 'profile_missing';
  end if;

  if coalesce(v_profile.is_banned, false) then
    raise exception 'user_banned';
  end if;

  if v_profile.grade is null then
    raise exception 'grade_not_set';
  end if;

  if p_choice < 1 or p_choice > 4 then
    raise exception 'invalid_choice';
  end if;

  select * into v_question
  from mcq_questions q
  where q.id = p_question_id
    and q.active = true;

  if not found then
    raise exception 'question_not_found';
  end if;

  if v_question.grade <> v_profile.grade then
    raise exception 'grade_mismatch';
  end if;

  if exists (
    select 1
    from attempts a
    where a.user_id = v_user_id
      and a.created_at > now() - interval '2 seconds'
  ) then
    raise exception 'rate_limited';
  end if;

  v_is_correct := (p_choice = v_question.correct);
  v_xp_award := case when v_is_correct then coalesce(v_question.reward_xp, 20) else 0 end;
  v_coin_award := case when v_is_correct then coalesce(v_question.reward_coins, 10) else 0 end;
  v_new_streak := case when v_is_correct then v_profile.streak + 1 else 0 end;

  insert into attempts(user_id, question_id, is_correct)
  values (v_user_id, p_question_id, v_is_correct);

  update users
  set xp = xp + v_xp_award,
      coins = coins + v_coin_award,
      streak = v_new_streak,
      updated_at = now()
  where id = v_user_id
  returning xp, coins, streak into v_profile.xp, v_profile.coins, v_profile.streak;

  return query
  select v_is_correct,
         v_question.correct,
         v_xp_award,
         v_coin_award,
         v_profile.xp,
         v_profile.coins,
         v_profile.streak;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_submit_attempt', 'error', SQLERRM, v_user_id, json_build_object('question_id', p_question_id));
  raise;
end;
$$;

-- ============================================
-- Grade Leaderboard
-- ============================================
create or replace function rpc_leaderboard_grade(p_grade int, p_limit int)
returns table (
  user_id uuid,
  username text,
  xp int,
  coins int,
  streak int,
  batch text,
  grade int
)
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  IF p_grade IS NULL OR p_grade NOT IN (8, 9) THEN
    RAISE EXCEPTION 'invalid_grade';
  END IF;

  RETURN QUERY
  select u.id,
         u.username,
         u.xp,
         u.coins,
         u.streak,
         u.batch,
         coalesce(u.grade::int, p_grade::int)
  from users u
  where u.grade::int = p_grade::int
    and coalesce(u.is_banned, false) = false
  order by u.xp desc, u.coins desc
  limit greatest(p_limit, 1);
END;
$$;

-- ============================================
-- Batch Leaderboard
-- ============================================
create or replace function rpc_leaderboard_batch(p_batch text, p_limit int)
returns table (
  user_id uuid,
  username text,
  xp int,
  coins int,
  streak int,
  batch text,
  grade int
)
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  IF p_batch IS NULL OR p_batch NOT IN ('8A','8B','8C','9A','9B','9C') THEN
    RAISE EXCEPTION 'invalid_batch';
  END IF;

  RETURN QUERY
  select u.id,
         u.username,
         u.xp,
         u.coins,
         u.streak,
         u.batch,
         coalesce(u.grade::int, 0)::INT
  from users u
  where u.batch = p_batch
    and coalesce(u.is_banned, false) = false
  order by u.xp desc, u.coins desc
  limit greatest(p_limit, 1);
END;
$$;

-- ============================================
-- Admin: Grant XP/Coins
-- ============================================
create or replace function rpc_admin_grant(p_user_id uuid, p_xp_delta int, p_coins_delta int)
returns table (
  user_id uuid,
  xp int,
  coins int,
  streak int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row users%rowtype;
begin
  if v_actor is null or not is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  update users
  set xp = xp + coalesce(p_xp_delta, 0),
      coins = greatest(0, coins + coalesce(p_coins_delta, 0)),
      updated_at = now()
  where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'user_not_found';
  end if;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_grant', 'info', 'grant_applied', v_actor, json_build_object('target', p_user_id, 'xp_delta', p_xp_delta, 'coins_delta', p_coins_delta));

  return query select v_row.id, v_row.xp, v_row.coins, v_row.streak;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_grant', 'error', SQLERRM, v_actor, json_build_object('target', p_user_id));
  raise;
end;
$$;

-- ============================================
-- Admin: Reset Player Progress
-- ============================================
-- Ensure we drop the function first when changing return signature as needed
drop function if exists rpc_admin_reset_user(uuid) cascade;
create function rpc_admin_reset_user(p_user_id uuid)
returns table (
  user_id uuid,
  xp int,
  coins int,
  streak int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row users%rowtype;
begin
  if v_actor is null or not is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  update users
  set xp = 0,
      coins = 0,
    gemstones = 0,
      streak = 0,
      level = 1,
      attack_power = 10,
      defense_power = 10,
      updated_at = now()
  where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'user_not_found';
  end if;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_reset_user', 'info', 'reset_applied', v_actor, json_build_object('target', p_user_id));

  return query select v_row.id, v_row.xp, v_row.coins, v_row.streak;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_reset_user', 'error', SQLERRM, v_actor, json_build_object('target', p_user_id));
  raise;
end;
$$;

-- ============================================
-- Admin: Ban or Unban Player
-- ============================================
create or replace function rpc_admin_ban_user(p_user_id uuid, p_is_banned boolean)
returns table (
  user_id uuid,
  is_banned boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row users%rowtype;
begin
  if v_actor is null or not is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  update users
  set is_banned = coalesce(p_is_banned, false),
      streak = case when coalesce(p_is_banned, false) then 0 else streak end,
      updated_at = now()
  where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'user_not_found';
  end if;

  if coalesce(p_is_banned, false) then
    begin
      perform auth.disable_user(p_user_id);
    exception when others then
      null;
    end;

    begin
      perform auth.invalidate_refresh_tokens(p_user_id);
    exception when others then
      -- Ignore if helper function is unavailable or permissions are limited
      null;
    end;

    begin
      delete from auth.sessions where user_id = p_user_id;
      delete from auth.refresh_tokens where user_id = p_user_id;
    exception when others then
      null;
    end;
  else
    begin
      perform auth.enable_user(p_user_id);
    exception when others then
      null;
    end;
  end if;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_ban_user', 'info', 'ban_state_changed', v_actor, json_build_object('target', p_user_id, 'is_banned', p_is_banned));

  return query select v_row.id, v_row.is_banned;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_ban_user', 'error', SQLERRM, v_actor, json_build_object('target', p_user_id));
  raise;
end;
$$;

-- ============================================
-- Admin: Delete Player
create or replace function rpc_admin_delete_user(p_user_id uuid)
returns table (
  user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_deleted uuid;
begin
  if v_actor is null or not is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  if p_user_id = v_actor then
    raise exception 'cannot_delete_self';
  end if;

  begin
    perform auth.delete_user(p_user_id);
  exception when undefined_function then
    begin
      perform auth.admin_delete_user(p_user_id);
    exception when others then
      null;
    end;
  exception when others then
    null;
  end;

  delete from users
  where id = p_user_id
  returning id into v_deleted;

  if not found then
    raise exception 'user_not_found';
  end if;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_delete_user', 'info', 'user_deleted', v_actor, json_build_object('target', p_user_id));

  return query select v_deleted;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_delete_user', 'error', SQLERRM, v_actor, json_build_object('target', p_user_id));
  raise;
end;
$$;

-- ============================================
-- Admin: Update Grade/Class
-- ============================================
create or replace function rpc_admin_set_user_academics(p_user_id uuid, p_grade int, p_batch text)
returns table (
  user_id uuid,
  grade int,
  batch text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row users%rowtype;
  v_grade int := p_grade;
  v_batch text := p_batch;
begin
  if v_actor is null or not is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  if v_grade is not null and v_grade not in (8, 9) then
    raise exception 'invalid_grade';
  end if;

  if v_batch is not null and v_batch not in ('8A', '8B', '8C', '9A', '9B', '9C', 'N/A') then
    raise exception 'invalid_batch';
  end if;

  if v_batch is not null and v_batch <> 'N/A' and v_grade is not null then
    if left(v_batch, 1) <> v_grade::text then
      raise exception 'batch_grade_mismatch';
    end if;
  end if;

  if v_grade is null and v_batch <> 'N/A' then
    v_batch := null;
  end if;

  update users
  set grade = v_grade,
      batch = v_batch,
      updated_at = now()
  where id = p_user_id
  returning * into v_row;
  if not found then
    raise exception 'user_not_found';
  end if;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_set_user_academics', 'info', 'academics_updated', v_actor, json_build_object('target', p_user_id, 'grade', v_grade, 'batch', v_batch));

  return query select v_row.id, v_row.grade::int, v_row.batch;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_set_user_academics', 'error', SQLERRM, v_actor, json_build_object('target', p_user_id, 'grade', p_grade, 'batch', p_batch));
  raise;
end;
$$;

-- ============================================
-- Admin: Reset All Player Progress
-- ============================================
create or replace function rpc_admin_reset_all()
returns table (
  affected_rows int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  if v_actor is null or not is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  update users
  set xp = 0,
      coins = 0,
    gemstones = 0,
      streak = 0,
      level = 1,
      attack_power = 10,
      defense_power = 10,
      ap_now = ap_max,
      last_ap_update = now(),
      updated_at = now()
  where coalesce(is_admin, false) = false
    and coalesce(is_banned, false) = false;

  get diagnostics v_count = row_count;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_reset_all', 'info', 'global_reset', v_actor, json_build_object('affected_rows', v_count));

  return query select coalesce(v_count, 0);
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_reset_all', 'error', SQLERRM, v_actor, json_build_object());
  raise;
end;
$$;

-- ============================================
-- Admin: Refill AP for all players (non-admins)
-- ============================================
create or replace function rpc_admin_refill_all_ap()
returns table(
  affected_rows int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  if v_actor is null or not is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  update users
  set ap_now = ap_max,
      last_ap_update = now(),
      updated_at = now()
  where coalesce(is_admin, false) = false
    and coalesce(is_banned, false) = false;

  get diagnostics v_count = row_count;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_refill_all_ap', 'info', 'refill_all', v_actor, json_build_object('affected_rows', v_count));

  return query select coalesce(v_count, 0);
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_refill_all_ap', 'error', SQLERRM, v_actor, json_build_object());
  raise;
end;
$$;

-- ============================================
-- Admin: Disband clan by id
-- ============================================
create or replace function rpc_admin_disband_clan(p_clan_id uuid)
returns table(
  clan_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  if v_actor is null or not is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  delete from clans where id = p_clan_id;
  get diagnostics v_count = row_count;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_disband_clan', 'info', 'clan_disbanded', v_actor, json_build_object('clan_id', p_clan_id, 'affected_rows', v_count));

  return query select p_clan_id;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_admin_disband_clan', 'error', SQLERRM, v_actor, json_build_object('clan_id', p_clan_id));
  raise;
end;
$$;
-- ============================================
-- Admin: Broadcast Announcement
-- ============================================
drop function if exists rpc_announcement_post(text);
drop function if exists rpc_announcement_post(text, text);
drop function if exists rpc_announcement_post(text, text, boolean);
drop function if exists rpc_announcement_post(text, text, text, boolean);
create or replace function rpc_announcement_post(
  p_text text,
  p_title text default null,
  p_priority text default 'normal',
  p_active boolean default true
)
returns table (
  id text,
  text text,
  priority text,
  active boolean,
  created_at timestamptz,
  created_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row announcements%rowtype;
begin
  if v_actor is null or not is_current_user_admin() then
    raise exception 'forbidden';
  end if;

  insert into announcements(title, content, text, priority, active, created_by)
  values (
    coalesce(nullif(trim(p_title), ''), left(p_text, 120)),
    p_text,
    p_text,
    coalesce(p_priority, 'normal'),
    coalesce(p_active, true),
    v_actor
  )
  returning * into v_row;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values (
    'rpc_announcement_post',
    'info',
    'broadcast',
    v_actor,
    json_build_object(
      'announcement_id', v_row.id,
      'title', v_row.title
    )
  );

  return query select
    v_row.id::text,
    v_row.text,
    v_row.priority,
    v_row.active,
    v_row.created_at,
    v_row.created_by;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_announcement_post', 'error', SQLERRM, v_actor, json_build_object());
  raise;
end;
$$;

-- ============================================
-- Announcements: Fetch next unseen
-- ============================================
-- Drop to allow return signature adjustments when needed
drop function if exists rpc_announcement_next();
create function rpc_announcement_next()
returns table (
  id text,
  text text,
  priority text,
  active boolean,
  created_at timestamptz,
  created_by uuid,
  seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  return query
  select a.id::text,
    a.text::text,
         coalesce(a.priority, 'normal')::text,
         coalesce(a.active, true)::boolean,
         a.created_at::timestamptz,
         a.created_by::uuid,
         ar.seen_at::timestamptz
  from announcements a
  left join announcement_receipts ar
    on ar.announcement_id = a.id
   and ar.user_id = v_user
  where ar.id is null
  order by a.created_at desc
  limit 1;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_announcement_next', 'error', SQLERRM, v_user, json_build_object());
  raise;
end;
$$;

-- ============================================
-- Announcements: Mark seen
-- ============================================
-- Drop to allow signature changes without manual cleanup
drop function if exists rpc_announcement_mark_seen(bigint);
drop function if exists rpc_announcement_mark_seen(text);
create function rpc_announcement_mark_seen(p_announcement_id text)
returns table (
  announcement_id text,
  seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_target announcements.id%type;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  begin
    v_target := p_announcement_id::uuid;
  exception when invalid_text_representation then
    raise exception 'announcement_not_found';
  end;

  if not exists (select 1 from announcements where id = v_target) then
    raise exception 'announcement_not_found';
  end if;

  update announcement_receipts as ar
  set seen_at = now()
  where ar.announcement_id = v_target
    and ar.user_id = v_user;

  if not found then
  insert into announcement_receipts as ar (announcement_id, user_id, seen_at)
  values (v_target, v_user, now());
  end if;

  return query
  select ar.announcement_id::text, ar.seen_at
  from announcement_receipts as ar
  where ar.announcement_id = v_target
    and ar.user_id = v_user;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_announcement_mark_seen', 'error', SQLERRM, v_user, json_build_object('announcement_id', p_announcement_id));
  raise;
end;
$$;
