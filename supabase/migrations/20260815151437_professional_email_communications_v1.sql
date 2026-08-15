-- Professional transactional email communications v1.
-- Reconciles the live school dispatcher contract with source control and adds
-- a service-only outbox, delivery-event ledger, preferences, suppressions,
-- role-aware events, reminders, and provider delivery-state tracking.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table if exists public.demo_requests
  add column if not exists website text;

-- ---------------------------------------------------------------------------
-- Reconcile the existing assignment and guardian delivery infrastructure.
-- ---------------------------------------------------------------------------

alter table if exists public.assignment_email_notifications
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error text,
  add column if not exists provider_message_id text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists delivery_status text not null default 'not_sent',
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz;

alter table if exists public.assignment_email_notifications
  drop constraint if exists assignment_email_notifications_status_check;
alter table if exists public.assignment_email_notifications
  add constraint assignment_email_notifications_status_check
  check (status in ('pending','processing','sent','cancelled','failed','skipped'));
alter table if exists public.assignment_email_notifications
  drop constraint if exists assignment_email_notifications_delivery_status_check;
alter table if exists public.assignment_email_notifications
  add constraint assignment_email_notifications_delivery_status_check
  check (delivery_status in ('not_sent','accepted','delivered','delayed','bounced','complained','suppressed','failed'));

create table if not exists public.guardian_invitation_email_notifications (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique references public.guardian_invitations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  invited_email text not null,
  raw_token text,
  available_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','processing','sent','cancelled','failed','skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivery_status text not null default 'not_sent'
    check (delivery_status in ('not_sent','accepted','delivered','delayed','bounced','complained','suppressed','failed')),
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz
);

alter table if exists public.guardian_invitation_email_notifications
  add column if not exists delivery_status text not null default 'not_sent',
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz;

alter table if exists public.school_request_email_deliveries
  add column if not exists delivery_status text not null default 'not_sent',
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz;

create table if not exists public.school_email_dispatch_config (
  singleton boolean primary key default true check (singleton),
  dispatch_key text not null,
  function_url text,
  updated_at timestamptz not null default now()
);
alter table public.school_email_dispatch_config add column if not exists function_url text;
insert into public.school_email_dispatch_config(singleton, dispatch_key, function_url)
values (
  true,
  encode(extensions.gen_random_bytes(32), 'hex'),
  'https://sozodkxwhubespiedgxm.supabase.co/functions/v1/school_email_dispatcher'
)
on conflict (singleton) do update set
  function_url = coalesce(public.school_email_dispatch_config.function_url, excluded.function_url),
  updated_at = now();

alter table public.school_email_dispatch_config enable row level security;
revoke all on table public.school_email_dispatch_config from public, anon, authenticated;
grant select, insert, update on table public.school_email_dispatch_config to service_role;

create index if not exists assignment_email_notifications_claim_idx
  on public.assignment_email_notifications(status, next_attempt_at, available_at)
  where status in ('pending','processing');
create index if not exists guardian_email_notifications_claim_idx
  on public.guardian_invitation_email_notifications(status, next_attempt_at, available_at)
  where status in ('pending','processing');
create index if not exists assignment_email_notifications_provider_idx
  on public.assignment_email_notifications(provider_message_id)
  where provider_message_id is not null;
create index if not exists guardian_email_notifications_provider_idx
  on public.guardian_invitation_email_notifications(provider_message_id)
  where provider_message_id is not null;
create index if not exists school_request_email_provider_idx
  on public.school_request_email_deliveries(provider_message_id)
  where provider_message_id is not null;

alter table public.guardian_invitation_email_notifications enable row level security;
revoke all on table public.guardian_invitation_email_notifications from public, anon, authenticated;
grant select, insert, update, delete on table public.guardian_invitation_email_notifications to service_role;

drop function if exists public.rpc_claim_assignment_email_notifications(integer);
create function public.rpc_claim_assignment_email_notifications(p_limit integer default 30)
returns setof public.assignment_email_notifications
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    select q.id
    from public.assignment_email_notifications q
    where q.status = 'pending'
      and q.available_at <= now()
      and coalesce(q.next_attempt_at, q.available_at) <= now()
    order by q.available_at, q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  )
  update public.assignment_email_notifications q
  set status='processing', attempts=q.attempts+1, updated_at=now()
  from claimed c where q.id=c.id
  returning q.*;
$$;

drop function if exists public.rpc_claim_guardian_invitation_email_notifications(integer);
create function public.rpc_claim_guardian_invitation_email_notifications(p_limit integer default 30)
returns setof public.guardian_invitation_email_notifications
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    select q.id
    from public.guardian_invitation_email_notifications q
    where q.status = 'pending'
      and q.available_at <= now()
      and coalesce(q.next_attempt_at, q.available_at) <= now()
    order by q.available_at, q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  )
  update public.guardian_invitation_email_notifications q
  set status='processing', attempts=q.attempts+1, updated_at=now()
  from claimed c where q.id=c.id
  returning q.*;
$$;

revoke all on function public.rpc_claim_assignment_email_notifications(integer) from public, anon, authenticated;
revoke all on function public.rpc_claim_guardian_invitation_email_notifications(integer) from public, anon, authenticated;
grant execute on function public.rpc_claim_assignment_email_notifications(integer) to service_role;
grant execute on function public.rpc_claim_guardian_invitation_email_notifications(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Unified service-only transactional email subsystem.
-- ---------------------------------------------------------------------------

create table if not exists public.email_communication_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('academic','school_operations','billing','reminders','digests')),
  email_enabled boolean not null default true,
  digest_frequency text not null default 'immediate' check (digest_frequency in ('immediate','daily','weekly','never')),
  locale text not null default 'en',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table public.email_communication_preferences enable row level security;
drop policy if exists email_communication_preferences_self_read on public.email_communication_preferences;
create policy email_communication_preferences_self_read
  on public.email_communication_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists email_communication_preferences_self_write on public.email_communication_preferences;
create policy email_communication_preferences_self_write
  on public.email_communication_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists email_communication_preferences_self_update on public.email_communication_preferences;
create policy email_communication_preferences_self_update
  on public.email_communication_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on table public.email_communication_preferences from anon;
grant select, insert, update on table public.email_communication_preferences to authenticated;
grant all on table public.email_communication_preferences to service_role;

create table if not exists public.transactional_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  category text not null default 'school_operations'
    check (category in ('security','academic','school_operations','billing','reminders','digests','platform_operations')),
  audience text not null
    check (audience in ('school_head','school_admin','teacher','student','parent','applicant','platform_owner')),
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text,
  school_id uuid references public.schools(id) on delete set null,
  school_name_override text,
  template_key text not null,
  template_version text not null default 'professional-v1',
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  available_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','processing','accepted','delivered','delayed','bounced','complained','suppressed','failed','cancelled','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  provider_message_id text,
  last_error text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    recipient_user_id is not null
    or nullif(trim(recipient_email), '') is not null
    or audience = 'platform_owner'
  )
);
comment on table public.transactional_email_outbox is
  'Service-only immutable-event email outbox. Provider acceptance is distinct from final delivery.';
create index if not exists transactional_email_outbox_claim_idx
  on public.transactional_email_outbox(status, next_attempt_at, available_at)
  where status in ('pending','processing','delayed');
create index if not exists transactional_email_outbox_provider_idx
  on public.transactional_email_outbox(provider_message_id)
  where provider_message_id is not null;
create index if not exists transactional_email_outbox_school_idx
  on public.transactional_email_outbox(school_id, created_at desc);
alter table public.transactional_email_outbox enable row level security;
revoke all on table public.transactional_email_outbox from public, anon, authenticated;
grant select, insert, update on table public.transactional_email_outbox to service_role;

create table if not exists public.email_provider_events (
  provider_event_id text primary key,
  provider_message_id text not null,
  event_type text not null,
  recipient_hash text,
  occurred_at timestamptz,
  received_at timestamptz not null default now()
);
create index if not exists email_provider_events_message_idx
  on public.email_provider_events(provider_message_id, received_at desc);
alter table public.email_provider_events enable row level security;
revoke all on table public.email_provider_events from public, anon, authenticated;
grant select, insert on table public.email_provider_events to service_role;

create table if not exists public.email_suppressions (
  recipient_hash text primary key,
  reason text not null check (reason in ('bounced','complained','suppressed','manual')),
  provider_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
revoke all on table public.email_suppressions from public, anon, authenticated;
grant select, insert, update on table public.email_suppressions to service_role;

create table if not exists public.email_delivery_archive (
  id bigserial primary key,
  source_table text not null,
  source_id uuid,
  snapshot jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.email_delivery_archive enable row level security;
revoke all on table public.email_delivery_archive from public, anon, authenticated;
grant select, insert on table public.email_delivery_archive to service_role;

create or replace function private.enqueue_transactional_email(
  p_event_type text,
  p_category text,
  p_audience text,
  p_template_key text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,
  p_recipient_user_id uuid default null,
  p_recipient_email text default null,
  p_school_id uuid default null,
  p_school_name_override text default null,
  p_available_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.transactional_email_outbox(
    event_type, category, audience, template_key, idempotency_key, payload,
    recipient_user_id, recipient_email, school_id, school_name_override, available_at
  ) values (
    left(trim(p_event_type),100), p_category, p_audience, left(trim(p_template_key),100),
    left(trim(p_idempotency_key),300), coalesce(p_payload,'{}'::jsonb), p_recipient_user_id,
    nullif(lower(trim(p_recipient_email)),''), p_school_id, nullif(trim(p_school_name_override),''),
    coalesce(p_available_at,now())
  ) on conflict (idempotency_key) do update set
    available_at=least(public.transactional_email_outbox.available_at,excluded.available_at),
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.enqueue_transactional_email(text,text,text,text,text,jsonb,uuid,text,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function private.enqueue_transactional_email(text,text,text,text,text,jsonb,uuid,text,uuid,text,timestamptz) to service_role;

create or replace function public.rpc_claim_transactional_email_outbox(p_limit integer default 50)
returns setof public.transactional_email_outbox
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    select q.id
    from public.transactional_email_outbox q
    where q.status in ('pending','delayed')
      and q.available_at <= now()
      and coalesce(q.next_attempt_at, q.available_at) <= now()
    order by q.available_at, q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,50),100))
  )
  update public.transactional_email_outbox q
  set status='processing', attempts=q.attempts+1, updated_at=now()
  from claimed c where q.id=c.id
  returning q.*;
$$;
revoke all on function public.rpc_claim_transactional_email_outbox(integer) from public, anon, authenticated;
grant execute on function public.rpc_claim_transactional_email_outbox(integer) to service_role;

create or replace function public.rpc_email_is_suppressed(p_recipient_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists(select 1 from public.email_suppressions s where s.recipient_hash=p_recipient_hash); $$;
revoke all on function public.rpc_email_is_suppressed(text) from public, anon, authenticated;
grant execute on function public.rpc_email_is_suppressed(text) to service_role;

create or replace function private.archive_assignment_email_before_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.email_delivery_archive(source_table,source_id,snapshot)
  values ('assignment_email_notifications',old.id,to_jsonb(old));
  return old;
end; $$;
revoke all on function private.archive_assignment_email_before_delete() from public, anon, authenticated;
drop trigger if exists archive_assignment_email_before_delete on public.assignment_email_notifications;
create trigger archive_assignment_email_before_delete before delete on public.assignment_email_notifications
for each row execute function private.archive_assignment_email_before_delete();

-- ---------------------------------------------------------------------------
-- Event producers. Payloads intentionally contain no marks, private notes,
-- evidence, passwords, or reusable school invitation codes.
-- ---------------------------------------------------------------------------

create or replace function private.trg_email_school_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    perform private.enqueue_transactional_email(
      'school_request_'||new.status,'school_operations','applicant','school_request_status',
      'school-request-'||new.id::text||'-'||new.status,
      jsonb_build_object('request_id',new.id,'school_name',new.requested_name,'status',new.status),
      new.requested_by,null,new.approved_school_id,new.requested_name,now()
    );
    perform private.enqueue_transactional_email(
      'school_request_received','platform_operations','platform_owner','owner_school_request',
      'owner-school-request-'||new.id::text||'-'||new.status,
      jsonb_build_object('request_id',new.id,'school_name',new.requested_name,'status',new.status),
      null,null,new.approved_school_id,new.requested_name,now()
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_school_request() from public, anon, authenticated;
drop trigger if exists professional_email_school_request on public.school_requests;
create trigger professional_email_school_request after insert or update of status on public.school_requests
for each row execute function private.trg_email_school_request();

create or replace function private.trg_email_assignment_result()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_assignment record; v_teacher_user_id uuid;
begin
  select a.id,a.school_id,a.title,a.subject_name,t.user_id into v_assignment
  from public.assignments a join public.teachers t on t.id=a.teacher_id
  where a.id=new.assignment_id;
  v_teacher_user_id := v_assignment.user_id;
  if v_assignment.id is null then return new; end if;
  perform private.enqueue_transactional_email(
    'assignment_result_ready','academic','student','assignment_result_ready',
    'assignment-result-'||new.assignment_id::text||'-'||new.student_id::text,
    jsonb_build_object('assignment_id',new.assignment_id,'title',v_assignment.title,'subject',v_assignment.subject_name),
    new.student_id,null,v_assignment.school_id,null,now()
  );
  if v_teacher_user_id is not null then
    perform private.enqueue_transactional_email(
      'assignment_submission_received','school_operations','teacher','assignment_submission_received',
      'assignment-submission-'||new.assignment_id::text||'-'||new.student_id::text,
      jsonb_build_object('assignment_id',new.assignment_id,'student_id',new.student_id,'title',v_assignment.title,'subject',v_assignment.subject_name),
      v_teacher_user_id,null,v_assignment.school_id,null,now()
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_assignment_result() from public, anon, authenticated;
drop trigger if exists professional_email_assignment_result on public.student_assignment_results;
create trigger professional_email_assignment_result after insert on public.student_assignment_results
for each row execute function private.trg_email_assignment_result();

create or replace function private.trg_email_ielts_preference()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_school_id uuid;
begin
  if coalesce(new.notify_by_email,false) and new.email_sent_at is null
     and (tg_op='INSERT' or coalesce(old.notify_by_email,false)=false or old.email_sent_at is distinct from new.email_sent_at) then
    select u.school_id into v_school_id from public.users u where u.id=new.user_id;
    perform private.enqueue_transactional_email(
      'ielts_result_ready','academic','student','ielts_result_ready',
      'ielts-result-'||new.id::text,
      jsonb_build_object('preference_id',new.id,'attempt_type',new.attempt_type,'attempt_id',new.attempt_id),
      case when nullif(trim(new.alternate_email),'') is null then new.user_id else null end,
      nullif(trim(new.alternate_email),''),v_school_id,null,now()
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_ielts_preference() from public, anon, authenticated;
drop trigger if exists professional_email_ielts_preference on public.ielts_notification_preferences;
create trigger professional_email_ielts_preference after insert or update of notify_by_email,email_sent_at,alternate_email
on public.ielts_notification_preferences for each row execute function private.trg_email_ielts_preference();

create or replace function private.trg_email_ielts_review_finalized()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(new.finalized,false) and (tg_op='INSERT' or coalesce(old.finalized,false)=false) then
    perform private.enqueue_transactional_email(
      'ielts_feedback_ready','academic','student','ielts_feedback_ready',
      'ielts-feedback-'||new.id::text,
      jsonb_build_object('review_id',new.id,'attempt_type',new.attempt_type,'attempt_id',new.attempt_id),
      new.student_id,null,new.school_id,null,now()
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_ielts_review_finalized() from public, anon, authenticated;
drop trigger if exists professional_email_ielts_review_finalized on public.ielts_productive_skill_reviews;
create trigger professional_email_ielts_review_finalized after insert or update of finalized
on public.ielts_productive_skill_reviews for each row execute function private.trg_email_ielts_review_finalized();

create or replace function private.trg_email_academic_report_finalized()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_guardian record;
begin
  if new.status='final' and new.student_id is not null and (tg_op='INSERT' or old.status is distinct from 'final') then
    perform private.enqueue_transactional_email(
      'academic_report_ready','academic','student','academic_report_ready',
      'academic-report-student-'||new.id::text,
      jsonb_build_object('report_id',new.id,'report_type',new.report_type,'period_end',new.period_end),
      new.student_id,null,new.school_id,null,now()
    );
    for v_guardian in
      select r.guardian_user_id from public.student_guardian_relationships r
      where r.school_id=new.school_id and r.student_id=new.student_id
        and r.status='active' and r.revoked_at is null
    loop
      perform private.enqueue_transactional_email(
        'academic_report_ready','academic','parent','academic_report_ready',
        'academic-report-parent-'||new.id::text||'-'||v_guardian.guardian_user_id::text,
        jsonb_build_object('report_id',new.id,'student_id',new.student_id,'report_type',new.report_type,'period_end',new.period_end),
        v_guardian.guardian_user_id,null,new.school_id,null,now()
      );
    end loop;
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_academic_report_finalized() from public, anon, authenticated;
drop trigger if exists professional_email_academic_report_finalized on public.academic_report_snapshots;
create trigger professional_email_academic_report_finalized after insert or update of status
on public.academic_report_snapshots for each row execute function private.trg_email_academic_report_finalized();

create or replace function private.trg_email_school_member_joined()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='active' and (tg_op='INSERT' or old.status is distinct from 'active') then
    perform private.enqueue_transactional_email(
      'school_membership_active','school_operations',
      case when new.role_in_school in ('school_head','school_admin','teacher','student','parent') then new.role_in_school else 'student' end,
      'school_membership_active','school-membership-'||new.id::text,
      jsonb_build_object('membership_id',new.id,'role',new.role_in_school),
      new.user_id,null,new.school_id,null,now()
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_school_member_joined() from public, anon, authenticated;
drop trigger if exists professional_email_school_member_joined on public.school_members;
create trigger professional_email_school_member_joined after insert or update of status
on public.school_members for each row execute function private.trg_email_school_member_joined();

create or replace function private.trg_email_school_member_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.status='active' and new.status is distinct from 'active' then
    perform private.enqueue_transactional_email(
      'school_membership_changed','school_operations',
      case when new.role_in_school in ('school_head','school_admin','teacher','student','parent') then new.role_in_school else 'student' end,
      'school_membership_changed','school-membership-change-'||new.id::text||'-'||coalesce(new.status,'inactive'),
      jsonb_build_object('membership_id',new.id,'role',new.role_in_school,'status',coalesce(new.status,'inactive')),
      new.user_id,null,new.school_id,null,now()
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_school_member_changed() from public, anon, authenticated;
drop trigger if exists professional_email_school_member_changed on public.school_members;
create trigger professional_email_school_member_changed after update of status
on public.school_members for each row execute function private.trg_email_school_member_changed();

create or replace function private.trg_email_guardian_access_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_event text; v_status text;
begin
  if tg_op='INSERT' and new.status='active' then
    v_event:='guardian_access_confirmed'; v_status:='active';
  elsif tg_op='UPDATE' and (new.status is distinct from old.status or new.revoked_at is distinct from old.revoked_at) then
    v_event:='guardian_access_changed';
    v_status:=case when new.revoked_at is not null then 'revoked' else coalesce(new.status,'updated') end;
  else return new;
  end if;
  perform private.enqueue_transactional_email(
    v_event,'school_operations','parent','guardian_access_status',
    'guardian-access-'||new.id::text||'-'||v_status,
    jsonb_build_object('relationship_id',new.id,'student_id',new.student_id,'status',v_status,'relationship',new.relationship_label),
    new.guardian_user_id,null,new.school_id,null,now()
  );
  return new;
end; $$;
revoke all on function private.trg_email_guardian_access_changed() from public, anon, authenticated;
drop trigger if exists professional_email_guardian_access_changed on public.student_guardian_relationships;
create trigger professional_email_guardian_access_changed after insert or update of status,revoked_at
on public.student_guardian_relationships for each row execute function private.trg_email_guardian_access_changed();

create or replace function private.trg_email_teacher_allocation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_class_name text;
begin
  if new.active and (tg_op='INSERT' or coalesce(old.active,false)=false) then
    select coalesce(nullif(trim(c.class_name),''),nullif(trim(c.class_code),''),'Class')
      into v_class_name from public.classes c where c.id=new.class_id;
    perform private.enqueue_transactional_email(
      'teacher_allocation_active','school_operations','teacher','teacher_allocation_active',
      'teacher-allocation-'||new.id::text,
      jsonb_build_object('allocation_id',new.id,'class_name',v_class_name,'subject',new.subject),
      new.teacher_user_id,null,new.school_id,null,now()
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_teacher_allocation() from public, anon, authenticated;
drop trigger if exists professional_email_teacher_allocation on public.class_teacher_assignments;
create trigger professional_email_teacher_allocation after insert or update of active
on public.class_teacher_assignments for each row execute function private.trg_email_teacher_allocation();

create or replace function private.trg_email_assignment_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_student record; v_template text; v_event text;
begin
  if old.publish_status is distinct from new.publish_status and new.publish_status='draft' then
    v_template:='assignment_cancelled'; v_event:='assignment_cancelled';
  elsif new.publish_status<>'draft' and (
    old.title is distinct from new.title or old.due_at is distinct from new.due_at
    or old.assigned_at is distinct from new.assigned_at
  ) then
    v_template:='assignment_updated'; v_event:='assignment_updated';
  else return new;
  end if;
  for v_student in
    select sa.student_id from public.student_assignments sa where sa.assignment_id=new.id
  loop
    perform private.enqueue_transactional_email(
      v_event,'school_operations','student',v_template,
      v_event||'-'||new.id::text||'-'||v_student.student_id::text||'-'||new.updated_at::text,
      jsonb_build_object('assignment_id',new.id,'title',new.title,'subject',new.subject_name,'due_at',new.due_at),
      v_student.student_id,null,new.school_id,null,now()
    );
  end loop;
  return new;
end; $$;
revoke all on function private.trg_email_assignment_changed() from public, anon, authenticated;
drop trigger if exists professional_email_assignment_changed on public.assignments;
create trigger professional_email_assignment_changed after update of publish_status,title,due_at,assigned_at
on public.assignments for each row execute function private.trg_email_assignment_changed();

create or replace function private.trg_email_admission_candidate()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if nullif(lower(trim(new.email)),'') is not null
     and (tg_op='INSERT' or new.status is distinct from old.status) then
    perform private.enqueue_transactional_email(
      'admission_status_'||coalesce(new.status,'updated'),'school_operations','applicant','admission_status',
      'admission-status-'||new.id::text||'-'||coalesce(new.status,'updated'),
      jsonb_build_object('candidate_id',new.id,'candidate_name',new.full_name,'applied_grade',new.applied_grade,'status',coalesce(new.status,'updated')),
      null,new.email,new.school_id,null,now()
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_admission_candidate() from public, anon, authenticated;
drop trigger if exists professional_email_admission_candidate on public.adm_candidates;
create trigger professional_email_admission_candidate after insert or update of status
on public.adm_candidates for each row execute function private.trg_email_admission_candidate();

create or replace function private.enqueue_school_leadership(
  p_school_id uuid, p_event_type text, p_category text, p_template_key text,
  p_idempotency_prefix text, p_payload jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare v_member record;
begin
  for v_member in
    select sm.user_id,sm.role_in_school from public.school_members sm
    where sm.school_id=p_school_id and sm.status='active'
      and sm.role_in_school in ('school_head','school_admin')
  loop
    perform private.enqueue_transactional_email(
      p_event_type,p_category,
      case when v_member.role_in_school='school_head' then 'school_head' else 'school_admin' end,
      p_template_key,p_idempotency_prefix||'-'||v_member.user_id::text,p_payload,
      v_member.user_id,null,p_school_id,null,now()
    );
  end loop;
end; $$;
revoke all on function private.enqueue_school_leadership(uuid,text,text,text,text,jsonb) from public, anon, authenticated;

create or replace function private.trg_email_school_quote()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    perform private.enqueue_school_leadership(
      new.school_id,'billing_quote_'||new.status,'billing','billing_quote_status',
      'billing-quote-'||new.id::text||'-'||new.status,
      jsonb_build_object('quote_id',new.id,'title',new.title,'status',new.status,'expires_at',new.expires_at)
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_school_quote() from public, anon, authenticated;
drop trigger if exists professional_email_school_quote on public.school_billing_quotes;
create trigger professional_email_school_quote after insert or update of status
on public.school_billing_quotes for each row execute function private.trg_email_school_quote();

create or replace function private.trg_email_billing_subscription()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status
     or new.cancel_at_period_end is distinct from old.cancel_at_period_end
     or new.current_period_end is distinct from old.current_period_end then
    perform private.enqueue_school_leadership(
      new.school_id,'billing_subscription_'||new.status,'billing','billing_subscription_status',
      'billing-subscription-'||new.id::text||'-'||new.status||'-'||coalesce(new.current_period_end::text,'none')||'-'||coalesce(new.cancel_at_period_end,false)::text,
      jsonb_build_object('subscription_id',new.id,'plan',new.plan,'status',new.status,'period_end',new.current_period_end,'cancel_at_period_end',new.cancel_at_period_end,'management_url',new.management_url,'update_payment_url',new.update_payment_url)
    );
  end if;
  return new;
end; $$;
revoke all on function private.trg_email_billing_subscription() from public, anon, authenticated;
drop trigger if exists professional_email_billing_subscription on public.billing_subscriptions;
create trigger professional_email_billing_subscription after insert or update of status,cancel_at_period_end,current_period_end
on public.billing_subscriptions for each row execute function private.trg_email_billing_subscription();

-- Reminders are idempotent; the cron may safely run every minute.
create or replace function public.rpc_enqueue_due_email_reminders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_assignment_count integer:=0; v_guardian_count integer:=0; v_subscription_count integer:=0; r record;
begin
  for r in
    select sa.assignment_id,sa.student_id,a.school_id,a.title,a.subject_name,a.due_at
    from public.student_assignments sa join public.assignments a on a.id=sa.assignment_id
    where sa.status not in ('completed','submitted') and a.due_at between now()+interval '23 hours' and now()+interval '25 hours'
  loop
    perform private.enqueue_transactional_email('assignment_due_reminder','reminders','student','assignment_due_reminder',
      'assignment-due-24h-'||r.assignment_id::text||'-'||r.student_id::text||'-'||r.due_at::text,
      jsonb_build_object('assignment_id',r.assignment_id,'title',r.title,'subject',r.subject_name,'due_at',r.due_at),
      r.student_id,null,r.school_id,null,now());
    v_assignment_count:=v_assignment_count+1;
  end loop;

  for r in
    select i.id,i.school_id,i.student_id,i.invited_email,i.relationship_label,i.expires_at
    from public.guardian_invitations i
    where i.claimed_at is null and i.revoked_at is null and i.expires_at between now()+interval '23 hours' and now()+interval '25 hours'
  loop
    perform private.enqueue_transactional_email('guardian_invitation_expiry_reminder','reminders','parent','guardian_invitation_reminder',
      'guardian-invite-reminder-'||r.id::text,
      jsonb_build_object('invitation_id',r.id,'student_id',r.student_id,'relationship',r.relationship_label,'expires_at',r.expires_at),
      null,r.invited_email,r.school_id,null,now());
    v_guardian_count:=v_guardian_count+1;
  end loop;

  for r in
    select s.id,s.school_id,s.plan,s.current_period_end,s.management_url
    from public.billing_subscriptions s
    where s.status in ('active','trialing') and s.cancel_at_period_end=false
      and s.current_period_end between now()+interval '6 days 23 hours' and now()+interval '7 days 1 hour'
  loop
    perform private.enqueue_school_leadership(r.school_id,'billing_renewal_reminder','billing','billing_renewal_reminder',
      'billing-renewal-7d-'||r.id::text||'-'||r.current_period_end::text,
      jsonb_build_object('subscription_id',r.id,'plan',r.plan,'period_end',r.current_period_end,'management_url',r.management_url));
    v_subscription_count:=v_subscription_count+1;
  end loop;

  return jsonb_build_object('assignment_reminders',v_assignment_count,'guardian_reminders',v_guardian_count,'subscription_reminders',v_subscription_count);
end; $$;
revoke all on function public.rpc_enqueue_due_email_reminders() from public, anon, authenticated;
grant execute on function public.rpc_enqueue_due_email_reminders() to service_role;

-- Backfill the confirmed IELTS email backlog into the real queue. Existing
-- email_sent_at values remain untouched and provider acceptance will update it.
insert into public.transactional_email_outbox(
  event_type,category,audience,recipient_user_id,recipient_email,school_id,
  template_key,payload,idempotency_key,available_at
)
select 'ielts_result_ready','academic','student',
  case when nullif(trim(p.alternate_email),'') is null then p.user_id else null end,
  nullif(lower(trim(p.alternate_email)),''),u.school_id,'ielts_result_ready',
  jsonb_build_object('preference_id',p.id,'attempt_type',p.attempt_type,'attempt_id',p.attempt_id),
  'ielts-result-'||p.id::text,coalesce(p.created_at,now())
from public.ielts_notification_preferences p
left join public.users u on u.id=p.user_id
where coalesce(p.notify_by_email,false) and p.email_sent_at is null
on conflict (idempotency_key) do nothing;

-- Email acceptance can only be recorded by the dispatcher. Admins may still
-- record manually operated SMS and in-app channels.
create or replace function public.admin_ielts_mark_notification_sent(
  p_pref_id bigint, p_channel text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_column text; v_actor uuid;
begin
  v_actor:=public.ielts_actor_uid('d3ce5bf4-423a-4b2d-9efe-62311fad4be9'::uuid);
  if not exists(
    select 1 from public.admin_roles ar
    where ar.user_id=v_actor and ar.scope='ielts' and ar.role='admin'
  ) then raise exception 'not_ielts_admin'; end if;
  select p.user_id into v_user from public.ielts_notification_preferences p where p.id=p_pref_id;
  if p_channel='email' then
    raise exception 'email_status_is_provider_managed';
  elsif p_channel='sms' then
    update public.ielts_notification_preferences set sms_sent_at=now(),updated_at=now() where id=p_pref_id;
    v_column:='sms_sent_at';
  elsif p_channel='in_app' then
    update public.ielts_notification_preferences set in_app_shown_at=now(),updated_at=now() where id=p_pref_id;
    v_column:='in_app_shown_at';
  else raise exception 'invalid_channel';
  end if;
  perform public.ielts_audit(
    'mark_notification_sent',v_user,'notification_preference',p_pref_id::text,
    jsonb_build_object('channel',p_channel,'field',v_column),v_actor
  );
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.admin_ielts_mark_notification_sent(bigint,text) from public, anon;
grant execute on function public.admin_ielts_mark_notification_sent(bigint,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Dispatcher wake-up, cleanup and source-controlled cron contract.
-- ---------------------------------------------------------------------------

create or replace function public.trg_kick_school_email_dispatcher()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_key text; v_url text;
begin
  select c.dispatch_key,c.function_url into v_key,v_url
  from public.school_email_dispatch_config c where c.singleton=true;
  if coalesce(v_key,'')<>'' and coalesce(v_url,'')<>'' then
    perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-school-email-dispatch-key',v_key),body:='{}'::jsonb,timeout_milliseconds:=20000);
  end if;
  return null;
exception when others then return null;
end; $$;
revoke all on function public.trg_kick_school_email_dispatcher() from public, anon, authenticated;

drop trigger if exists transactional_email_kick_dispatcher on public.transactional_email_outbox;
create trigger transactional_email_kick_dispatcher after insert on public.transactional_email_outbox
for each statement execute function public.trg_kick_school_email_dispatcher();
drop trigger if exists guardian_invitation_email_kick_dispatcher on public.guardian_invitation_email_notifications;
create trigger guardian_invitation_email_kick_dispatcher after insert on public.guardian_invitation_email_notifications
for each statement execute function public.trg_kick_school_email_dispatcher();
drop trigger if exists assignment_email_kick_dispatcher on public.assignment_email_notifications;
create trigger assignment_email_kick_dispatcher after insert on public.assignment_email_notifications
for each statement execute function public.trg_kick_school_email_dispatcher();

create or replace function public.rpc_school_email_cleanup()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_assignment integer; v_guardian integer; v_outbox integer;
begin
  update public.assignment_email_notifications set status='pending',next_attempt_at=now(),updated_at=now(),last_error='Recovered stale processing claim'
  where status='processing' and updated_at<now()-interval '10 minutes'; get diagnostics v_assignment=row_count;
  update public.guardian_invitation_email_notifications set status='pending',next_attempt_at=now(),updated_at=now(),last_error='Recovered stale processing claim'
  where status='processing' and updated_at<now()-interval '10 minutes'; get diagnostics v_guardian=row_count;
  update public.transactional_email_outbox set status='pending',next_attempt_at=now(),updated_at=now(),last_error='Recovered stale processing claim'
  where status='processing' and updated_at<now()-interval '10 minutes'; get diagnostics v_outbox=row_count;
  delete from public.email_provider_events where received_at<now()-interval '180 days';
  return jsonb_build_object('assignment_recovered',v_assignment,'guardian_recovered',v_guardian,'outbox_recovered',v_outbox);
end; $$;
revoke all on function public.rpc_school_email_cleanup() from public, anon, authenticated;
grant execute on function public.rpc_school_email_cleanup() to service_role;

do $$
declare v_command text;
begin
  v_command := $cmd$
    select public.rpc_school_email_cleanup();
    select public.rpc_enqueue_due_email_reminders();
    select net.http_post(
      url := (select function_url from public.school_email_dispatch_config where singleton=true),
      headers := jsonb_build_object('Content-Type','application/json','x-school-email-dispatch-key',(select dispatch_key from public.school_email_dispatch_config where singleton=true)),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cmd$;
  perform cron.schedule('school-email-dispatcher','* * * * *',v_command);
end $$;

-- Superadmin-only aggregate operations view: no recipient addresses or payloads.
create or replace function public.rpc_email_operations_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_actor is null or not coalesce(public.is_superadmin(v_actor),false) then raise exception 'Superadmin access required'; end if;
  select jsonb_build_object(
    'generated_at',now(),
    'outbox',jsonb_build_object(
      'pending',count(*) filter(where status='pending'),
      'processing',count(*) filter(where status='processing'),
      'accepted',count(*) filter(where status='accepted'),
      'delivered',count(*) filter(where status='delivered'),
      'failed',count(*) filter(where status in ('failed','bounced','complained','suppressed')),
      'oldest_pending_at',min(created_at) filter(where status='pending')
    ),
    'ielts_backlog',(
      select count(*) from public.ielts_notification_preferences p
      where coalesce(p.notify_by_email,false) and p.email_sent_at is null
    )
  ) into v_result from public.transactional_email_outbox;
  return v_result;
end; $$;
revoke all on function public.rpc_email_operations_snapshot() from public, anon;
grant execute on function public.rpc_email_operations_snapshot() to authenticated;

-- Extend the existing school-admin invitation history with real delivery state.
create or replace function public.rpc_school_guardian_management_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_caller uuid:=(select auth.uid()); v_school_id uuid; v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  select sm.school_id into v_school_id from public.school_members sm
  where sm.user_id=v_caller and sm.status='active' and sm.role_in_school='school_admin'
  order by sm.is_owner desc,sm.joined_at limit 1;
  if v_school_id is null then raise exception 'School administration access required'; end if;
  select jsonb_build_object(
    'school_id',v_school_id,
    'students',coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id',u.id,'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'class_name',coalesce(nullif(trim(c.class_code),''),nullif(trim(u.batch),''),'—'),
        'grade',coalesce(c.grade_level::text,nullif(trim(u.grade::text),''))
      ) order by coalesce(c.grade_level::text,u.grade::text),coalesce(c.class_code,u.batch),coalesce(u.full_name,u.username))
      from public.school_members sm join public.users u on u.id=sm.user_id and u.school_id=sm.school_id
      left join public.class_students cs on cs.student_id=u.id
      left join public.classes c on c.id=cs.class_id and c.school_id=v_school_id and c.is_active=true
      where sm.school_id=v_school_id and sm.status='active' and sm.role_in_school='student'
    ),'[]'::jsonb),
    'relationships',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'student_id',r.student_id,'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'guardian_user_id',r.guardian_user_id,'guardian_email',ga.primary_email,'guardian_name',ga.display_name,
        'relationship_label',r.relationship_label,'status',r.status,'verified_at',r.verified_at,'revoked_at',r.revoked_at
      ) order by r.created_at desc)
      from public.student_guardian_relationships r join public.users u on u.id=r.student_id
      left join public.guardian_accounts ga on ga.user_id=r.guardian_user_id
      where r.school_id=v_school_id
    ),'[]'::jsonb),
    'invitations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'student_id',i.student_id,'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
        'invited_email',i.invited_email,'relationship_label',i.relationship_label,
        'expires_at',i.expires_at,'created_at',i.created_at,'claimed_at',i.claimed_at,'revoked_at',i.revoked_at,
        'status',case when i.revoked_at is not null then 'revoked' when i.claimed_at is not null then 'claimed' when i.expires_at<now() then 'expired' else 'pending' end,
        'email_status',coalesce(q.status,'not_sent'),'email_delivery_status',coalesce(q.delivery_status,'not_sent'),
        'email_sent_at',q.sent_at,'email_delivered_at',q.delivered_at,
        'email_last_error',q.last_error,'email_attempts',coalesce(q.attempts,0)
      ) order by i.created_at desc)
      from public.guardian_invitations i join public.users u on u.id=i.student_id
      left join lateral (
        select n.status,n.delivery_status,n.sent_at,n.delivered_at,n.last_error,n.attempts
        from public.guardian_invitation_email_notifications n where n.invitation_id=i.id
        order by n.created_at desc limit 1
      ) q on true where i.school_id=v_school_id
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;
revoke all on function public.rpc_school_guardian_management_snapshot() from public, anon;
grant execute on function public.rpc_school_guardian_management_snapshot() to authenticated;

-- Explicit grants for the migration-created sequence used by service-role archive writes.
grant usage, select on sequence public.email_delivery_archive_id_seq to service_role;
