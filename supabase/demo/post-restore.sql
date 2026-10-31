-- Runs on the DEMO project only, after schema + content have been restored.
-- Makes the demo self-contained and unable to contact anyone.

\set ON_ERROR_STOP on

-- Demo marker: this table exists ONLY in the demo database. It is created by the
-- first post-restore run (when the database has no schools/users yet) and every
-- demo script refuses to run where it is missing. Production never has it.
do $$
begin
  if to_regclass('private.demo_environment') is null then
    if exists (select 1 from public.schools) or exists (select 1 from public.users) then
      raise exception 'Refusing: this database has real schools/users and no demo marker';
    end if;
    create table private.demo_environment (
      singleton boolean primary key default true check (singleton),
      project_ref text not null,
      marked_at timestamptz not null default now()
    );
    revoke all on private.demo_environment from public, anon, authenticated;
    insert into private.demo_environment(project_ref) values ('lvkmkgjpcbdyzdkbqcgc');
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Hard outbound kill switch: pg_net requests are silently dropped.
--    No email, push, webhook or AI call can leave this database.
create or replace function private.demo_block_outbound_http()
returns trigger language plpgsql as $$
begin
  return null;
end $$;

drop trigger if exists demo_block_outbound_http on net.http_request_queue;
create trigger demo_block_outbound_http
  before insert on net.http_request_queue
  for each row execute function private.demo_block_outbound_http();

-- 2. Dispatch configuration stays empty (production values are never copied).
delete from public.school_email_dispatch_config;
delete from public.push_dispatch_config;

-- 3. Auth sign-up hooks, minus the "new user" welcome email trigger.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists a_roster_identity_claim_on_auth_insert on auth.users;
create trigger a_roster_identity_claim_on_auth_insert after insert on auth.users
  for each row execute function private.trg_claim_roster_identity_auth();

drop trigger if exists a_roster_identity_claim_on_auth_verified on auth.users;
create trigger a_roster_identity_claim_on_auth_verified
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function private.trg_claim_roster_identity_auth();

-- 4. Only the background jobs the learning engine needs. No email/push dispatchers.
do $$
declare j text;
begin
  foreach j in array array[
    'brains-heist-assignment-evidence-worker',
    'brains-heist-question-learning-catalogue',
    'school-head-decision-center',
    'class-conquest-finalize'
  ] loop
    perform cron.unschedule(j) where exists (select 1 from cron.job where jobname = j);
  end loop;
end $$;

select cron.schedule('brains-heist-assignment-evidence-worker', '10 seconds',
  'call private.run_assignment_evidence_worker();');
select cron.schedule('brains-heist-question-learning-catalogue', '* * * * *',
  'select private.refresh_question_learning_catalogue()');
select cron.schedule('school-head-decision-center', '*/2 * * * *',
  'call private.run_school_head_refresh_worker();');
select cron.schedule('class-conquest-finalize', '15 18 * * 5',
  'select public.rpc_finalize_class_conquest();');

-- 5. Content hygiene. The question bank is copied whole; references to production people
--    and another school's private pool must not survive in the demo.
do $$
begin
  set local session_replication_role = replica;
  delete from public.questions q where q.pool_scope = 'school';                  -- a real school's private questions
  update public.questions q set teacher_id = null
   where teacher_id is not null and not exists (select 1 from public.teachers t where t.id = q.teacher_id);
  update public.questions q set verified_by = null
   where verified_by is not null and not exists (select 1 from auth.users u where u.id = q.verified_by);
  set local session_replication_role = origin;
end $$;
