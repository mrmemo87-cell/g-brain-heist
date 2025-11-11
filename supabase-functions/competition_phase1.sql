-- ============================================
-- Silk Road Competition Phase 1 RPCs
-- ============================================

set check_function_bodies = off;

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
language sql
security definer
set search_path = public
as $$
  select u.id,
         u.username,
         u.xp,
         u.coins,
         u.streak,
         u.batch,
         coalesce(u.grade::int, p_grade)
  from users u
  where u.grade::int = p_grade
    and coalesce(u.is_banned, false) = false
  order by u.xp desc, u.coins desc
  limit greatest(p_limit, 1);
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
language sql
security definer
set search_path = public
as $$
  select u.id,
         u.username,
         u.xp,
         u.coins,
         u.streak,
         u.batch,
         coalesce(u.grade::int, 0)
  from users u
  where u.batch = p_batch
    and coalesce(u.is_banned, false) = false
  order by u.xp desc, u.coins desc
  limit greatest(p_limit, 1);
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
create or replace function rpc_admin_reset_user(p_user_id uuid)
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
      streak = 0,
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

  if v_batch is not null and v_batch not in ('8A', '8B', '8C', '9A', '9B', '9C') then
    raise exception 'invalid_batch';
  end if;

  if v_batch is not null and v_grade is not null then
    if left(v_batch, 1) <> v_grade::text then
      raise exception 'batch_grade_mismatch';
    end if;
  end if;

  if v_grade is null then
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
      streak = 0,
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
create or replace function rpc_announcement_post(p_text text)
returns table (
  id bigint,
  text text,
  created_at timestamptz
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

  insert into announcements(text, created_by)
  values (p_text, v_actor)
  returning * into v_row;

  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_announcement_post', 'info', 'broadcast', v_actor, json_build_object('announcement_id', v_row.id));

  return query select v_row.id, v_row.text, v_row.created_at;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_announcement_post', 'error', SQLERRM, v_actor, json_build_object());
  raise;
end;
$$;

-- ============================================
-- Announcements: Fetch next unseen
-- ============================================
create or replace function rpc_announcement_next()
returns table (
  id bigint,
  text text,
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
  select a.id,
         a.text,
         a.created_at,
         a.created_by,
         ar.seen_at
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
create or replace function rpc_announcement_mark_seen(p_announcement_id bigint)
returns table (
  announcement_id bigint,
  seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_receipt announcement_receipts%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from announcements where id = p_announcement_id) then
    raise exception 'announcement_not_found';
  end if;

  insert into announcement_receipts(announcement_id, user_id, seen_at)
  values (p_announcement_id, v_user, now())
  on conflict (announcement_id, user_id)
  do update set seen_at = excluded.seen_at
  returning * into v_receipt;

  return query select v_receipt.announcement_id, v_receipt.seen_at;
exception when others then
  insert into rpc_event_log(function_name, log_level, message, user_id, context)
  values ('rpc_announcement_mark_seen', 'error', SQLERRM, v_user, json_build_object('announcement_id', p_announcement_id));
  raise;
end;
$$;
