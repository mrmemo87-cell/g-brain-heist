-- Proving Grounds arena: named test accounts and device reports.
--
-- Test accounts (owner-managed, no RPC): skip the play window, the daily cap, the assignment
-- requirement, the ticket cost and the weekly ticket reset. Rewards are still paid and recorded
-- normally so the pilot exercises the real paths. The table lives in private and is fail-closed.
--
-- Device reports: the client sends one small report per match (screen size, canvas size, frames
-- drawn, errors) so a black screen on a student's phone can be diagnosed from the database.

create table if not exists private.arena_test_accounts (
  user_id uuid primary key references public.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
revoke all on table private.arena_test_accounts from public, anon, authenticated;

create or replace function private.arena_is_test_account(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.arena_test_accounts t where t.user_id = p_uid)
$$;
revoke all on function private.arena_is_test_account(uuid) from public, anon, authenticated;

alter table public.arena_matches add column if not exists client_report jsonb;

-- Rules: a test account is always open with no cap.
create or replace function private.arena_rules(p_uid uuid)
returns table (school_id uuid, class_id uuid, enabled boolean, daily_cap integer, window_start time, window_end time,
               weekend_all_day boolean, require_assignment boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text; v_school uuid; v_banned boolean; v_class uuid;
  v_school_row public.arena_settings%rowtype; v_class_row public.arena_settings%rowtype;
  v_enabled boolean; v_cap integer; v_start time; v_end time; v_weekend boolean;
begin
  select u.role, u.school_id, coalesce(u.is_banned, false) into v_role, v_school, v_banned from public.users u where u.id = p_uid;
  if not found or v_banned then return query select null::uuid, null::uuid, false, 0, null::time, null::time, false, false, 'no_user'; return; end if;
  if v_role <> 'student' then return query select v_school, null::uuid, false, 0, null::time, null::time, false, false, 'not_student'; return; end if;
  if v_school is null then return query select null::uuid, null::uuid, false, 0, null::time, null::time, false, false, 'no_school'; return; end if;

  select c.id into v_class
  from public.class_students cs join public.classes c on c.id = cs.class_id
  where cs.student_id = p_uid and coalesce(c.is_active, true)
  order by cs.joined_at desc nulls last limit 1;

  if private.arena_is_test_account(p_uid) then
    return query select v_school, v_class, true, 999, '00:00'::time, '23:59:59'::time, true, false, null::text; return;
  end if;

  select * into v_school_row from public.arena_settings s where s.school_id = v_school and s.class_id is null;
  v_enabled := coalesce(v_school_row.enabled, true);
  v_cap := coalesce(v_school_row.daily_cap, 5);
  v_start := coalesce(v_school_row.window_start, '15:00'::time);
  v_end := coalesce(v_school_row.window_end, '23:59'::time);
  v_weekend := coalesce(v_school_row.weekend_all_day, true);
  if not v_enabled then
    return query select v_school, v_class, false, v_cap, v_start, v_end, v_weekend, false, 'school_off'; return;
  end if;
  if v_class is not null then
    select * into v_class_row from public.arena_settings s where s.school_id = v_school and s.class_id = v_class;
    if found and not v_class_row.enabled then
      return query select v_school, v_class, false, v_cap, v_start, v_end, v_weekend, v_class_row.require_assignment, 'class_off'; return;
    end if;
  end if;
  return query select v_school, v_class, true, v_cap, v_start, v_end, v_weekend, coalesce(v_class_row.require_assignment, false), null::text;
end $$;
revoke all on function private.arena_rules(uuid) from public, anon, authenticated;

-- Tickets: a test account keeps its balance across weeks and above the cap of 10.
create or replace function private.arena_sync_tickets(p_uid uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_week date := private.arena_week_start(private.arena_today()); v_tickets integer;
begin
  update public.users u
  set arena_tickets = case when u.arena_tickets_week is distinct from v_week and not private.arena_is_test_account(p_uid) then 0 else u.arena_tickets end,
      arena_tickets_week = v_week
  where u.id = p_uid
  returning arena_tickets into v_tickets;
  return coalesce(v_tickets, 0);
end $$;
revoke all on function private.arena_sync_tickets(uuid) from public, anon, authenticated;

create or replace function private.arena_grant_tickets(p_uid uuid, p_amount integer, p_source text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_tickets integer; v_granted integer;
begin
  if p_amount <= 0 then return 0; end if;
  if not exists (select 1 from public.users u where u.id = p_uid and u.role = 'student') then return 0; end if;
  v_tickets := private.arena_sync_tickets(p_uid);
  v_granted := case when private.arena_is_test_account(p_uid) then p_amount else least(p_amount, greatest(0, 10 - v_tickets)) end;
  if v_granted = 0 then return 0; end if;
  update public.users set arena_tickets = arena_tickets + v_granted where id = p_uid;
  insert into private.arena_ticket_ledger (user_id, amount, source) values (p_uid, v_granted, p_source);
  return v_granted;
end $$;
revoke all on function private.arena_grant_tickets(uuid, integer, text) from public, anon, authenticated;

-- Start: a test account needs no ticket and spends none.
create or replace function public.rpc_arena_start_match(p_fighter text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); r record; v_tickets integer; v_trophies integer; v_power integer; v_avg numeric; v_id uuid; v_test boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_fighter not in ('rivet', 'fizz', 'vex', 'boulder') then raise exception 'INVALID_FIGHTER'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('arena'));
  v_test := private.arena_is_test_account(v_uid);
  select * into r from private.arena_rules(v_uid);
  if not r.enabled then raise exception 'ARENA_CLOSED:%', coalesce(r.reason, 'school_off'); end if;
  if not private.arena_open_now(r.window_start, r.window_end, r.weekend_all_day) then raise exception 'ARENA_CLOSED:window'; end if;
  if r.require_assignment and private.arena_blocking_assignment(v_uid) then raise exception 'ARENA_CLOSED:assignment'; end if;
  if private.arena_played_today(v_uid) >= r.daily_cap then raise exception 'DAILY_CAP'; end if;
  v_tickets := private.arena_sync_tickets(v_uid);
  if v_tickets < 1 and not v_test then raise exception 'NO_TICKETS'; end if;
  select coalesce(u.arena_trophies, 0) into v_trophies from public.users u where u.id = v_uid;
  if v_trophies < (case p_fighter when 'vex' then 40 when 'boulder' then 100 else 0 end) then raise exception 'FIGHTER_LOCKED'; end if;

  select max(m.power) filter (where m.fighter = p_fighter), avg(m.power) into v_power, v_avg from private.arena_mastery(v_uid) m;
  v_power := coalesce(v_power, 1);

  -- A match left open is abandoned: it was paid for and pays nothing.
  update public.arena_matches set finished_at = now(), result = 'abandoned'
  where user_id = v_uid and finished_at is null;

  if not v_test then
    update public.users set arena_tickets = arena_tickets - 1 where id = v_uid;
    v_tickets := v_tickets - 1;
  end if;
  insert into public.arena_matches (user_id, school_id, class_id, fighter, power, bot_power)
  values (v_uid, r.school_id, r.class_id, p_fighter, v_power, greatest(1, least(5, round(coalesce(v_avg, 1))::integer)))
  returning id into v_id;
  return jsonb_build_object('match_id', v_id, 'fighter', p_fighter, 'power', v_power,
    'bot_power', greatest(1, least(5, round(coalesce(v_avg, 1))::integer)), 'tickets', v_tickets);
end $$;
revoke all on function public.rpc_arena_start_match(text) from public, anon;
grant execute on function public.rpc_arena_start_match(text) to authenticated;

-- Abandon: a test account spent nothing, so nothing is refunded.
create or replace function public.rpc_arena_abandon_match(p_match_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); m public.arena_matches%rowtype; v_refund boolean := false; v_tickets integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext('arena'));
  select * into m from public.arena_matches where id = p_match_id and user_id = v_uid for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if m.finished_at is not null then
    return jsonb_build_object('refunded', false, 'repeated', true, 'tickets', private.arena_sync_tickets(v_uid));
  end if;
  update public.arena_matches set finished_at = now(), result = 'abandoned' where id = p_match_id;
  if extract(epoch from (now() - m.started_at)) < 60 and not private.arena_is_test_account(v_uid) then
    v_refund := private.arena_grant_tickets(v_uid, 1, 'refund:' || p_match_id::text) > 0;
  end if;
  v_tickets := private.arena_sync_tickets(v_uid);
  return jsonb_build_object('refunded', v_refund, 'tickets', v_tickets);
end $$;
revoke all on function public.rpc_arena_abandon_match(uuid) from public, anon;
grant execute on function public.rpc_arena_abandon_match(uuid) to authenticated;

-- Device report: one small JSON object per match, written by its owner while the match is recent.
create or replace function public.rpc_arena_client_report(p_match_id uuid, p_report jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' or pg_column_size(p_report) > 8192 then raise exception 'INVALID_REPORT'; end if;
  update public.arena_matches set client_report = p_report
  where id = p_match_id and user_id = v_uid and started_at > now() - interval '1 hour';
  return found;
end $$;
revoke all on function public.rpc_arena_client_report(uuid, jsonb) from public, anon;
grant execute on function public.rpc_arena_client_report(uuid, jsonb) to authenticated;
