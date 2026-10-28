-- Student push notifications (Web Push) — v1.
-- Mirrors the transactional email pipeline: an outbox table, a claim RPC for the dispatcher,
-- a singleton config row holding the dispatch key, and a per-minute cron that enqueues
-- "due tomorrow" reminders and kicks the push_dispatcher edge function.
-- Messages in v1: new assignment published to the student; assignment due in ~24 hours.
-- Rollback: supabase/rollbacks/20261028170000_student_push_notifications.rollback.sql

-- ───────────────────────────── subscriptions (one row per device) ─────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text,
  failure_count integer not null default 0 check (failure_count >= 0)
);
create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions(user_id) where disabled_at is null;
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

drop policy if exists push_subscriptions_own_rows on public.push_subscriptions;
create policy push_subscriptions_own_rows on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.push_subscriptions is
  'Web Push subscriptions. A user manages only their own devices; the dispatcher (service role) disables dead endpoints.';

-- ───────────────────────────── outbox (server-only) ─────────────────────────────
create table if not exists public.push_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  url text not null default '/',
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  available_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','processing','sent','skipped','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_notification_outbox_claim_idx
  on public.push_notification_outbox(status, next_attempt_at, available_at)
  where status in ('pending','processing');
alter table public.push_notification_outbox enable row level security;
revoke all on table public.push_notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.push_notification_outbox to service_role;

comment on table public.push_notification_outbox is
  'Queued push messages. Never readable by students; written by triggers/cron, drained by push_dispatcher.';

-- ───────────────────────────── dispatcher config (singleton) ─────────────────────────────
create table if not exists public.push_dispatch_config (
  singleton boolean primary key default true check (singleton),
  dispatch_key text not null,
  function_url text,
  vapid_public_key text,
  vapid_private_key text,
  vapid_subject text,
  updated_at timestamptz not null default now()
);
alter table public.push_dispatch_config enable row level security;
revoke all on table public.push_dispatch_config from public, anon, authenticated;
grant select, insert, update on table public.push_dispatch_config to service_role;

do $$
declare v_key text;
begin
  if exists (select 1 from pg_extension where extname = 'pgcrypto') then
    v_key := encode(extensions.gen_random_bytes(32), 'hex');
  else
    v_key := md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text);
  end if;
  insert into public.push_dispatch_config(singleton, dispatch_key, function_url)
  values (true, v_key, 'https://sozodkxwhubespiedgxm.supabase.co/functions/v1/push_dispatcher')
  on conflict (singleton) do update set
    function_url = coalesce(public.push_dispatch_config.function_url, excluded.function_url),
    updated_at = now();
end $$;

-- ───────────────────────────── enqueue helper ─────────────────────────────
create or replace function private.enqueue_push(
  p_user_id uuid, p_event_type text, p_title text, p_body text, p_url text,
  p_idempotency_key text, p_payload jsonb default '{}'::jsonb, p_available_at timestamptz default now()
) returns void language plpgsql set search_path = '' as $$
begin
  if p_user_id is null then return; end if;
  -- Only students who turned notifications on get queue rows; keeps the outbox small.
  if not exists (select 1 from public.push_subscriptions s where s.user_id = p_user_id and s.disabled_at is null) then
    return;
  end if;
  insert into public.push_notification_outbox(user_id, event_type, title, body, url, payload, idempotency_key, available_at)
  values (p_user_id, p_event_type, left(p_title, 120), left(p_body, 240), coalesce(p_url, '/'), coalesce(p_payload, '{}'::jsonb),
          p_idempotency_key, greatest(coalesce(p_available_at, now()), now()))
  on conflict (idempotency_key) do nothing;
end $$;
revoke all on function private.enqueue_push(uuid, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;

-- ───────────────────────────── "new assignment" triggers ─────────────────────────────
create or replace function private.push_new_assignment_for_student(p_assignment_id uuid, p_student_id uuid)
returns void language plpgsql set search_path = '' as $$
declare a record;
begin
  select id, title, subject_name, publish_status, assigned_at into a from public.assignments where id = p_assignment_id;
  if not found then return; end if;
  if coalesce(a.publish_status, 'published') <> 'published' then return; end if;
  perform private.enqueue_push(
    p_student_id, 'assignment_published',
    'New assignment from your teacher',
    coalesce(nullif(trim(a.title), ''), 'Assignment') || case when a.subject_name is not null then ' · ' || a.subject_name else '' end,
    '/?view=dashboard&tab=assignments',
    'new-assignment-' || a.id::text || '-' || p_student_id::text,
    jsonb_build_object('assignment_id', a.id, 'title', a.title, 'subject', a.subject_name),
    coalesce(a.assigned_at, now()));
end $$;
revoke all on function private.push_new_assignment_for_student(uuid, uuid) from public, anon, authenticated;

create or replace function private.trg_push_student_assignment_inserted()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform private.push_new_assignment_for_student(new.assignment_id, new.student_id);
  return new;
end $$;
revoke all on function private.trg_push_student_assignment_inserted() from public, anon, authenticated;
drop trigger if exists push_student_assignment_inserted on public.student_assignments;
create trigger push_student_assignment_inserted
  after insert on public.student_assignments
  for each row execute function private.trg_push_student_assignment_inserted();

create or replace function private.trg_push_assignment_published()
returns trigger language plpgsql set search_path = '' as $$
declare r record;
begin
  if coalesce(old.publish_status, 'published') = 'published' or coalesce(new.publish_status, 'published') <> 'published' then
    return new;
  end if;
  for r in select sa.student_id from public.student_assignments sa where sa.assignment_id = new.id loop
    perform private.push_new_assignment_for_student(new.id, r.student_id);
  end loop;
  return new;
end $$;
revoke all on function private.trg_push_assignment_published() from public, anon, authenticated;
drop trigger if exists push_assignment_published on public.assignments;
create trigger push_assignment_published
  after update of publish_status on public.assignments
  for each row execute function private.trg_push_assignment_published();

-- ───────────────────────────── "due tomorrow" reminders (cron) ─────────────────────────────
create or replace function public.rpc_enqueue_due_push_reminders()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer := 0; r record;
begin
  for r in
    select sa.assignment_id, sa.student_id, a.title, a.subject_name, coalesce(sa.due_at, a.due_at) as due_at
    from public.student_assignments sa
    join public.assignments a on a.id = sa.assignment_id
    join public.push_subscriptions s on s.user_id = sa.student_id and s.disabled_at is null
    where sa.status not in ('completed', 'submitted')
      and coalesce(a.publish_status, 'published') = 'published'
      and coalesce(sa.due_at, a.due_at) between now() + interval '23 hours' and now() + interval '25 hours'
    group by sa.assignment_id, sa.student_id, a.title, a.subject_name, coalesce(sa.due_at, a.due_at)
  loop
    perform private.enqueue_push(
      r.student_id, 'assignment_due_reminder',
      'Due tomorrow',
      coalesce(nullif(trim(r.title), ''), 'Your assignment') || ' is due tomorrow.',
      '/?view=dashboard&tab=assignments',
      'assignment-due-24h-push-' || r.assignment_id::text || '-' || r.student_id::text || '-' || r.due_at::text,
      jsonb_build_object('assignment_id', r.assignment_id, 'title', r.title, 'subject', r.subject_name, 'due_at', r.due_at),
      now());
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('assignment_due_reminders', v_count);
end $$;
revoke all on function public.rpc_enqueue_due_push_reminders() from public, anon, authenticated;
grant execute on function public.rpc_enqueue_due_push_reminders() to service_role;

-- ───────────────────────────── dispatcher RPCs ─────────────────────────────
create or replace function public.rpc_claim_push_notifications(p_limit integer default 50)
returns setof public.push_notification_outbox
language sql security definer set search_path = '' as $$
  with claimed as (
    select q.id
    from public.push_notification_outbox q
    where q.status = 'pending'
      and q.available_at <= now()
      and coalesce(q.next_attempt_at, q.available_at) <= now()
    order by q.available_at, q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  )
  update public.push_notification_outbox q
  set status = 'processing', attempts = q.attempts + 1, updated_at = now()
  from claimed c where q.id = c.id
  returning q.*;
$$;
revoke all on function public.rpc_claim_push_notifications(integer) from public, anon, authenticated;
grant execute on function public.rpc_claim_push_notifications(integer) to service_role;

-- Recovers stale claims. Retention of sent rows is left to a later, separately reviewed migration.
create or replace function public.rpc_push_cleanup()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_recovered integer := 0;
begin
  update public.push_notification_outbox
  set status = 'pending', next_attempt_at = now(), updated_at = now(), last_error = 'Recovered stale processing claim'
  where status = 'processing' and updated_at < now() - interval '10 minutes';
  get diagnostics v_recovered = row_count;
  return jsonb_build_object('recovered', v_recovered);
end $$;
revoke all on function public.rpc_push_cleanup() from public, anon, authenticated;
grant execute on function public.rpc_push_cleanup() to service_role;

-- ───────────────────────────── per-minute cron (production only) ─────────────────────────────
do $$
declare v_command text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is unavailable; schedule rpc_push_cleanup/rpc_enqueue_due_push_reminders and the push_dispatcher call with the platform scheduler.';
    return;
  end if;
  v_command := $cmd$
    select public.rpc_push_cleanup();
    select public.rpc_enqueue_due_push_reminders();
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
