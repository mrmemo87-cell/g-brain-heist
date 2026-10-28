-- Game-event push notifications — v1, on top of 20261028170000_student_push_notifications.
--   1. PvP defence: when someone attacks you (you lost coins, or your defence held).
--      At most one per student per 3-hour block; attacks overnight become one 07:00 message.
--   2. Streak reminder: at 18:30–19:30 Bishkek time, if yesterday's streak will break at midnight.
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

-- ───────────────────────────── 1. PvP defence ─────────────────────────────
create or replace function private.push_pvp_defence(
  p_attacker uuid, p_defender uuid, p_response jsonb, p_now timestamptz default now()
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_result text := p_response->>'result';
  v_name text;
  v_loss integer;
  v_send_at timestamptz;
  v_local timestamp;
  v_key text;
begin
  if p_defender is null or p_defender = p_attacker or v_result not in ('win', 'lose') then return; end if;
  select coalesce(nullif(trim(u.username), ''), 'Someone') into v_name from public.users u where u.id = p_attacker;
  v_name := left(coalesce(v_name, 'Someone'), 40);
  v_loss := greatest(coalesce(nullif(p_response->'defender_deltas'->>'coins_loss', '')::numeric, 0), 0)::integer;

  v_send_at := private.game_push_available_at(p_now);
  v_local := v_send_at at time zone 'Asia/Bishkek';
  v_key := case
    when v_send_at > p_now then 'pvp-defence-' || p_defender::text || '-' || v_local::date::text || '-overnight'
    else 'pvp-defence-' || p_defender::text || '-' || v_local::date::text || '-' || (extract(hour from v_local)::int / 3)::text
  end;

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
