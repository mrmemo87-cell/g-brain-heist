-- Game-event push notifications — v1, on top of 20261028170000_student_push_notifications.
--   1. PvP defence: when someone attacks you (you lost coins, or your defence held).
--      At most one per student per 3-hour block; attacks overnight become one 07:00 message.
--   2. Streak reminder: at 18:30–19:30 Bishkek time, if yesterday's streak will break at midnight.
--   3. Clans: chat (throttled), join requests (to leader/officers), request answered, power-ups,
--      rivalry wars (declared, accepted, live, finished).
-- Game messages respect quiet hours (22:00–07:00 Asia/Bishkek) and a per-student "Game alerts"
-- switch (push_preferences.game_events). Assignment and teacher messages are unaffected.
-- Also hardens the assignment triggers: they run as definer and can never block an assignment write.
-- Rollback: supabase/rollbacks/20261029120000_game_event_push_notifications.rollback.sql

-- ───────────────────────────── per-student preferences ─────────────────────────────
create table if not exists public.push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game_events boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.push_preferences enable row level security;
revoke all on table public.push_preferences from public, anon, authenticated;
grant select, insert, update on table public.push_preferences to authenticated;
grant select, insert, update, delete on table public.push_preferences to service_role;

drop policy if exists push_preferences_own_row on public.push_preferences;
create policy push_preferences_own_row on public.push_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.push_preferences is
  'Per-student notification choices. No row = defaults (game alerts on).';

-- ───────────────────────────── quiet hours ─────────────────────────────
-- 22:00–07:00 Asia/Bishkek → hold until 07:00; otherwise send now.
create or replace function private.game_push_available_at(p_now timestamptz default now())
returns timestamptz language sql stable set search_path = '' as $$
  select case
    when extract(hour from (p_now at time zone 'Asia/Bishkek')) >= 22
      then (((p_now at time zone 'Asia/Bishkek')::date + 1) + time '07:00') at time zone 'Asia/Bishkek'
    when extract(hour from (p_now at time zone 'Asia/Bishkek')) < 7
      then (((p_now at time zone 'Asia/Bishkek')::date) + time '07:00') at time zone 'Asia/Bishkek'
    else p_now
  end;
$$;
revoke all on function private.game_push_available_at(timestamptz) from public, anon, authenticated;

create or replace function private.enqueue_game_push(
  p_user_id uuid, p_event_type text, p_title text, p_body text, p_url text,
  p_idempotency_key text, p_payload jsonb default '{}'::jsonb, p_now timestamptz default now()
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.push_preferences p where p.user_id = p_user_id and not p.game_events) then
    return;
  end if;
  perform private.enqueue_push(p_user_id, p_event_type, p_title, p_body, p_url,
    p_idempotency_key, p_payload, private.game_push_available_at(p_now));
end $$;
revoke all on function private.enqueue_game_push(uuid, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;

-- Throttle key: one message per user per block of p_minutes; anything held overnight shares one key.
create or replace function private.game_push_bucket_key(p_prefix text, p_user_id uuid, p_now timestamptz, p_minutes integer)
returns text language sql stable set search_path = '' as $$
  select case
    when private.game_push_available_at(p_now) > p_now
      then p_prefix || '-' || p_user_id::text || '-' || ((private.game_push_available_at(p_now) at time zone 'Asia/Bishkek')::date)::text || '-overnight'
    else p_prefix || '-' || p_user_id::text || '-' || ((p_now at time zone 'Asia/Bishkek')::date)::text || '-'
      || ((extract(hour from (p_now at time zone 'Asia/Bishkek'))::int * 60
           + extract(minute from (p_now at time zone 'Asia/Bishkek'))::int) / greatest(p_minutes, 1))::text
  end;
$$;
revoke all on function private.game_push_bucket_key(text, uuid, timestamptz, integer) from public, anon, authenticated;

-- ───────────────────────────── 1. PvP defence ─────────────────────────────
create or replace function private.push_pvp_defence(
  p_attacker uuid, p_defender uuid, p_response jsonb, p_now timestamptz default now()
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_result text := p_response->>'result';
  v_name text;
  v_loss integer;
  v_key text;
begin
  if p_defender is null or p_defender = p_attacker or v_result not in ('win', 'lose') then return; end if;
  select coalesce(nullif(trim(u.username), ''), 'Someone') into v_name from public.users u where u.id = p_attacker;
  v_name := left(coalesce(v_name, 'Someone'), 40);
  v_loss := greatest(coalesce(nullif(p_response->'defender_deltas'->>'coins_loss', '')::numeric, 0), 0)::integer;

  v_key := private.game_push_bucket_key('pvp-defence', p_defender, p_now, 180);

  perform private.enqueue_game_push(
    p_defender, 'pvp_defence',
    case when v_result = 'win' then '⚔️ ' || v_name || ' raided you' else '🛡️ You held off ' || v_name end,
    case when v_result = 'win'
      then case when v_loss > 0 then 'They took ' || v_loss || ' coins. Hit back!' else 'Hit back!' end
      else 'Your defences held. Want revenge?' end,
    '/?view=pvp', v_key,
    jsonb_build_object('attacker_id', p_attacker, 'result', v_result, 'coins_loss', v_loss),
    p_now);
end $$;
revoke all on function private.push_pvp_defence(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;

create or replace function private.trg_push_pvp_defence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.push_pvp_defence(new.attacker_id, new.defender_id, new.response, now());
  exception when others then
    raise warning 'push_pvp_defence skipped: %', sqlerrm;  -- a notification must never undo an attack
  end;
  return new;
end $$;
revoke all on function private.trg_push_pvp_defence() from public, anon, authenticated;
drop trigger if exists push_pvp_defence on public.pvp_attack_attempts;
create trigger push_pvp_defence
  after insert on public.pvp_attack_attempts
  for each row execute function private.trg_push_pvp_defence();

-- ───────────────────────────── 2. streak reminder ─────────────────────────────
create or replace function public.rpc_enqueue_streak_push_reminders(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Bishkek';
  v_today date := (p_now at time zone 'Asia/Bishkek')::date;
  v_count integer := 0;
  r record;
begin
  if v_local::time < time '18:30' or v_local::time >= time '19:30' then
    return jsonb_build_object('streak_reminders', 0, 'skipped', 'outside_window');
  end if;
  for r in
    select y.user_id, y.streak
    from public.daily_streak_rewards y
    where y.reward_date = v_today - 1
      and y.streak >= 2
      and not exists (select 1 from public.daily_streak_rewards t where t.user_id = y.user_id and t.reward_date = v_today)
      and exists (select 1 from public.push_subscriptions s where s.user_id = y.user_id and s.disabled_at is null)
  loop
    perform private.enqueue_game_push(
      r.user_id, 'streak_reminder',
      '🔥 Keep your ' || r.streak || '-day streak',
      'Finish today''s mission before midnight to keep it going.',
      '/?view=dashboard',
      'streak-reminder-' || r.user_id::text || '-' || v_today::text,
      jsonb_build_object('streak', r.streak, 'date', v_today),
      p_now);
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('streak_reminders', v_count);
end $$;
revoke all on function public.rpc_enqueue_streak_push_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_enqueue_streak_push_reminders(timestamptz) to service_role;

-- ───────────────────────────── 3. clans ─────────────────────────────
create or replace function private.clan_label(p_clan_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select left(coalesce(nullif(trim(c.name), ''), 'your clan'), 40) from public.clans c where c.id = p_clan_id
$$;
revoke all on function private.clan_label(uuid) from public, anon, authenticated;

create or replace function private.player_label(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select left(coalesce((select nullif(trim(u.username), '') from public.users u where u.id = p_user_id), 'Someone'), 40)
$$;
revoke all on function private.player_label(uuid) from public, anon, authenticated;

-- Members of a clan, optionally only some roles, optionally excluding one user (the actor).
create or replace function private.clan_recipients(p_clan_id uuid, p_roles text[] default null, p_except uuid default null)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.user_id from public.clan_members m
  where m.clan_id = p_clan_id
    and (p_roles is null or m.role = any(p_roles))
    and (p_except is null or m.user_id <> p_except)
$$;
revoke all on function private.clan_recipients(uuid, text[], uuid) from public, anon, authenticated;

-- Chat: "💬 Clan · Aidai: see you at the raid". One per member per clan per 30 minutes.
create or replace function private.push_clan_chat(p_clan_id uuid, p_sender uuid, p_message text, p_now timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_clan text := private.clan_label(p_clan_id); v_text text;
begin
  v_text := left(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'), 100);
  if trim(v_text) = '' then return; end if;
  for v_member in select * from private.clan_recipients(p_clan_id, null, p_sender) loop
    perform private.enqueue_game_push(v_member, 'clan_chat', '💬 ' || v_clan,
      private.player_label(p_sender) || ': ' || v_text, '/?view=clan',
      private.game_push_bucket_key('clan-chat-' || p_clan_id::text, v_member, p_now, 30),
      jsonb_build_object('clan_id', p_clan_id), p_now);
  end loop;
end $$;
revoke all on function private.push_clan_chat(uuid, uuid, text, timestamptz) from public, anon, authenticated;

create or replace function private.trg_push_clan_chat()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin perform private.push_clan_chat(new.clan_id, new.user_id, new.message, now());
  exception when others then raise warning 'push_clan_chat skipped: %', sqlerrm; end;
  return new;
end $$;
revoke all on function private.trg_push_clan_chat() from public, anon, authenticated;
drop trigger if exists push_clan_chat on public.clan_chat;
create trigger push_clan_chat after insert on public.clan_chat
  for each row execute function private.trg_push_clan_chat();

-- Join requests: new → leader and officers; answered → the player who asked.
create or replace function private.push_clan_join_request(p_request_id uuid, p_clan_id uuid, p_user_id uuid,
  p_old_status text, p_new_status text, p_now timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_clan text := private.clan_label(p_clan_id);
begin
  if p_old_status is null and p_new_status = 'pending' then
    for v_member in select * from private.clan_recipients(p_clan_id, array['leader', 'officer'], p_user_id) loop
      perform private.enqueue_game_push(v_member, 'clan_join_request', '🙋 Join request',
        private.player_label(p_user_id) || ' wants to join ' || v_clan || '.', '/?view=clan',
        'clan-join-request-' || p_request_id::text || '-' || v_member::text,
        jsonb_build_object('clan_id', p_clan_id, 'request_id', p_request_id), p_now);
    end loop;
  elsif coalesce(p_old_status, '') <> p_new_status and p_new_status in ('approved', 'rejected') then
    perform private.enqueue_game_push(p_user_id, 'clan_join_answer',
      case when p_new_status = 'approved' then '✅ Welcome to ' || v_clan else 'Clan request' end,
      case when p_new_status = 'approved' then 'Your request was approved. Say hi in clan chat!'
           else 'Your request to join ' || v_clan || ' was not accepted this time.' end,
      '/?view=clan', 'clan-join-answer-' || p_request_id::text,
      jsonb_build_object('clan_id', p_clan_id, 'request_id', p_request_id, 'status', p_new_status), p_now);
  end if;
end $$;
revoke all on function private.push_clan_join_request(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;

create or replace function private.trg_push_clan_join_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.push_clan_join_request(new.id, new.clan_id, new.user_id,
      case when tg_op = 'INSERT' then null else old.status end, new.status, now());
  exception when others then raise warning 'push_clan_join_request skipped: %', sqlerrm; end;
  return new;
end $$;
revoke all on function private.trg_push_clan_join_request() from public, anon, authenticated;
drop trigger if exists push_clan_join_request on public.clan_join_requests;
create trigger push_clan_join_request after insert or update of status on public.clan_join_requests
  for each row execute function private.trg_push_clan_join_request();

-- Power-ups: "⚡ Double Coins is on · Aidai powered up Clan for 60 minutes."
create or replace function private.push_clan_buff(p_buff_id uuid, p_clan_id uuid, p_template_id uuid, p_actor uuid, p_now timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_name text; v_minutes integer; v_clan text := private.clan_label(p_clan_id);
begin
  select left(coalesce(nullif(trim(t.name), ''), 'A power-up'), 40), t.duration_minutes into v_name, v_minutes
  from public.clan_buff_templates t where t.id = p_template_id;
  v_name := coalesce(v_name, 'A power-up');
  for v_member in select * from private.clan_recipients(p_clan_id, null, p_actor) loop
    perform private.enqueue_game_push(v_member, 'clan_buff', '⚡ ' || v_name || ' is on',
      private.player_label(p_actor) || ' powered up ' || v_clan
        || case when v_minutes > 0 then ' for ' || v_minutes || ' minutes.' else '.' end,
      '/?view=clan', 'clan-buff-' || p_buff_id::text || '-' || v_member::text,
      jsonb_build_object('clan_id', p_clan_id, 'buff_id', p_buff_id), p_now);
  end loop;
end $$;
revoke all on function private.push_clan_buff(uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function private.trg_push_clan_buff()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin perform private.push_clan_buff(new.id, new.clan_id, new.template_id, new.activated_by, now());
  exception when others then raise warning 'push_clan_buff skipped: %', sqlerrm; end;
  return new;
end $$;
revoke all on function private.trg_push_clan_buff() from public, anon, authenticated;
drop trigger if exists push_clan_buff on public.clan_buffs;
create trigger push_clan_buff after insert on public.clan_buffs
  for each row execute function private.trg_push_clan_buff();

-- Rivalry wars: declared → defender leader/officers; accepted (prep) → attacker leader/officers;
-- live → everyone in both clans; settled → everyone in both clans (won / lost / draw).
create or replace function private.push_rivalry_war(p_war_id uuid, p_attacker uuid, p_defender uuid,
  p_old_status text, p_new_status text, p_winner uuid, p_now timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_clan uuid; v_other text;
begin
  if p_new_status is not distinct from p_old_status then return; end if;
  if p_new_status = 'pending_response' then
    for v_member in select * from private.clan_recipients(p_defender, array['leader', 'officer']) loop
      perform private.enqueue_game_push(v_member, 'rivalry_war', '⚔️ ' || private.clan_label(p_attacker) || ' declared war',
        'Accept or decline the challenge in Rivalry.', '/?view=rivalry',
        'rivalry-' || p_war_id::text || '-declared-' || v_member::text, jsonb_build_object('war_id', p_war_id), p_now);
    end loop;
  elsif p_new_status = 'prep' then
    for v_member in select * from private.clan_recipients(p_attacker, array['leader', 'officer']) loop
      perform private.enqueue_game_push(v_member, 'rivalry_war', '⚔️ Challenge accepted',
        private.clan_label(p_defender) || ' accepted your war. Get your clan ready!', '/?view=rivalry',
        'rivalry-' || p_war_id::text || '-prep-' || v_member::text, jsonb_build_object('war_id', p_war_id), p_now);
    end loop;
  elsif p_new_status in ('live', 'settled') then
    foreach v_clan in array array[p_attacker, p_defender] loop
      v_other := private.clan_label(case when v_clan = p_attacker then p_defender else p_attacker end);
      for v_member in select * from private.clan_recipients(v_clan) loop
        perform private.enqueue_game_push(v_member, 'rivalry_war',
          case when p_new_status = 'live' then '🔥 War is live'
               when p_winner = v_clan then '🏆 Your clan won the war'
               when p_winner is null then '🤝 War ended in a draw'
               else 'War over' end,
          case when p_new_status = 'live' then 'Fight ' || v_other || ' now in Rivalry.'
               when p_winner = v_clan then 'You beat ' || v_other || '. Claim your rewards!'
               when p_winner is null then 'Your war with ' || v_other || ' is over.'
               else v_other || ' won this time. Check your rewards.' end,
          '/?view=rivalry', 'rivalry-' || p_war_id::text || '-' || p_new_status || '-' || v_member::text,
          jsonb_build_object('war_id', p_war_id), p_now);
      end loop;
    end loop;
  end if;
end $$;
revoke all on function private.push_rivalry_war(uuid, uuid, uuid, text, text, uuid, timestamptz) from public, anon, authenticated;

create or replace function private.trg_push_rivalry_war()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.push_rivalry_war(new.id, new.attacker_clan_id, new.defender_clan_id,
      case when tg_op = 'INSERT' then null else old.status end, new.status, new.winner_clan_id, now());
  exception when others then raise warning 'push_rivalry_war skipped: %', sqlerrm; end;
  return new;
end $$;
revoke all on function private.trg_push_rivalry_war() from public, anon, authenticated;
drop trigger if exists push_rivalry_war on public.rivalry_wars;
create trigger push_rivalry_war after insert or update of status on public.rivalry_wars
  for each row execute function private.trg_push_rivalry_war();

-- ───────────────────────────── harden assignment triggers ─────────────────────────────
-- Run as definer (so push_subscriptions RLS never hides a student's device from the check), and
-- swallow errors so a notification problem can never block a teacher saving an assignment.
create or replace function private.trg_push_student_assignment_inserted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.push_new_assignment_for_student(new.assignment_id, new.student_id);
  exception when others then
    raise warning 'push_new_assignment skipped: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function private.trg_push_student_assignment_inserted() from public, anon, authenticated;

create or replace function private.trg_push_assignment_published()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if coalesce(old.publish_status, 'published') = 'published' or coalesce(new.publish_status, 'published') <> 'published' then
    return new;
  end if;
  begin
    for r in select sa.student_id from public.student_assignments sa where sa.assignment_id = new.id loop
      perform private.push_new_assignment_for_student(new.id, r.student_id);
    end loop;
  exception when others then
    raise warning 'push_assignment_published skipped: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function private.trg_push_assignment_published() from public, anon, authenticated;

-- ───────────────────────────── cron: add the streak reminder ─────────────────────────────
do $$
declare v_command text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is unavailable; schedule rpc_enqueue_streak_push_reminders with the platform scheduler.';
    return;
  end if;
  v_command := $cmd$
    select public.rpc_push_cleanup();
    select public.rpc_enqueue_due_push_reminders();
    select public.rpc_enqueue_streak_push_reminders();
    select net.http_post(
      url := (select function_url from public.push_dispatch_config where singleton = true),
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-push-dispatch-key', (select dispatch_key from public.push_dispatch_config where singleton = true)),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cmd$;
  perform cron.unschedule(jobid) from cron.job where jobname = 'brains-heist-push-dispatcher';
  perform cron.schedule('brains-heist-push-dispatcher', '* * * * *', v_command);
end $$;
