-- Follow 20261015223000 even when the authoring host's UTC clock is earlier.
-- Claims commit before analytics. Never hold a queue-row lock during ingestion.
alter table private.assignment_evidence_jobs
  drop constraint assignment_evidence_jobs_status_check;
alter table private.assignment_evidence_jobs
  add constraint assignment_evidence_jobs_status_check
    check(status in ('pending','processing','done','failed')),
  add column revision bigint not null default 1,
  add column lease_token uuid,
  add column lease_until timestamptz,
  add column started_at timestamptz;
create index assignment_evidence_jobs_expired_idx
  on private.assignment_evidence_jobs(lease_until) where status='processing';

create or replace function private.enqueue_verified_assignment_evidence_row(
  p_assignment_id uuid,p_student_id uuid
) returns void language plpgsql security definer set search_path='' as $fn$
begin
  insert into private.assignment_evidence_jobs as j
    (assignment_id,student_id,status,attempts,requested_at,available_at)
  values(p_assignment_id,p_student_id,'pending',0,clock_timestamp(),clock_timestamp())
  on conflict(assignment_id,student_id) do update set
    revision=j.revision+1,status='pending',attempts=0,
    requested_at=excluded.requested_at,available_at=excluded.available_at,
    processed_at=null,last_error=null,lease_token=null,lease_until=null;
end;
$fn$;
revoke all on function private.enqueue_verified_assignment_evidence_row(uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function private.recover_assignment_evidence_leases()
returns integer language plpgsql security definer set search_path='' as $fn$
declare v_count integer;
begin
  with expired as (
    select assignment_id,student_id from private.assignment_evidence_jobs
    where status='processing' and lease_until<clock_timestamp()
    order by lease_until for update skip locked limit 20
  )
  update private.assignment_evidence_jobs j set
    status=case when j.attempts>=8 then 'failed' else 'pending' end,
    available_at=clock_timestamp()+pg_catalog.make_interval(secs=>least(3600,20*(2^least(j.attempts,7))::integer)),
    lease_token=null,lease_until=null,
    last_error='57014: Worker lease expired; prior processing transaction was interrupted'
  from expired e where j.assignment_id=e.assignment_id and j.student_id=e.student_id;
  get diagnostics v_count=row_count;
  return v_count;
end;
$fn$;
revoke all on function private.recover_assignment_evidence_leases()
  from public,anon,authenticated,service_role;

create or replace function private.claim_verified_assignment_evidence()
returns private.assignment_evidence_jobs language plpgsql security definer set search_path='' as $fn$
declare v_job private.assignment_evidence_jobs;
begin
  perform private.recover_assignment_evidence_leases();
  with next_job as (
    select assignment_id,student_id from private.assignment_evidence_jobs
    where status='pending' and attempts<8 and available_at<=clock_timestamp()
    order by available_at,requested_at,assignment_id,student_id
    for update skip locked limit 1
  )
  update private.assignment_evidence_jobs j set
    status='processing',attempts=j.attempts+1,started_at=clock_timestamp(),
    lease_token=pg_catalog.gen_random_uuid(),lease_until=clock_timestamp()+interval '3 minutes'
  from next_job n where j.assignment_id=n.assignment_id and j.student_id=n.student_id
  returning j.* into v_job;
  return v_job;
end;
$fn$;
revoke all on function private.claim_verified_assignment_evidence()
  from public,anon,authenticated,service_role;

create or replace function private.process_claimed_assignment_evidence(p_job private.assignment_evidence_jobs)
returns text language plpgsql security definer set search_path='' as $fn$
declare v_error text;v_count integer;
begin
  -- A revoked/superseded claim must never acknowledge newer work.
  if not exists(select 1 from private.assignment_evidence_jobs j
    where j.assignment_id=p_job.assignment_id and j.student_id=p_job.student_id
      and j.revision=p_job.revision and j.status='processing' and j.lease_token=p_job.lease_token) then
    return 'superseded';
  end if;
  begin
    perform private.ingest_verified_assignment_registry_evidence(p_job.assignment_id,p_job.student_id);
    perform private.ingest_verified_assignment_diagnostic_evidence(p_job.assignment_id,p_job.student_id);
  exception when query_canceled or others then
    -- OTHERS does not include QUERY_CANCELED. Both lanes roll back together.
    v_error=left(SQLSTATE||': '||SQLERRM,900);
    update private.assignment_evidence_jobs j set
      status=case when j.attempts>=8 then 'failed' else 'pending' end,
      available_at=clock_timestamp()+pg_catalog.make_interval(secs=>least(3600,20*(2^least(j.attempts,7))::integer)),
      lease_token=null,lease_until=null,last_error=v_error
    where j.assignment_id=p_job.assignment_id and j.student_id=p_job.student_id
      and j.revision=p_job.revision and j.lease_token=p_job.lease_token;
    raise warning 'BH evidence job unsuccessful, state %',left(v_error,5);
    return 'retry';
  end;
  update private.assignment_evidence_jobs j set status='done',processed_at=clock_timestamp(),
    lease_token=null,lease_until=null,last_error=null
  where j.assignment_id=p_job.assignment_id and j.student_id=p_job.student_id
    and j.revision=p_job.revision and j.lease_token=p_job.lease_token;
  get diagnostics v_count=row_count;
  return case when v_count=1 then 'done' else 'superseded' end;
end;
$fn$;
revoke all on function private.process_claimed_assignment_evidence(private.assignment_evidence_jobs)
  from public,anon,authenticated,service_role;

-- Compatibility/diagnostic function only. Cron must use CALL below so that
-- the claim is committed independently, including on connection termination.
create or replace function private.process_one_verified_assignment_evidence()
returns text language plpgsql security definer set search_path='' as $fn$
declare v_job private.assignment_evidence_jobs;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('brains-heist:assignment-evidence-worker:v2',0)) then
    return 'busy';
  end if;
  v_job=private.claim_verified_assignment_evidence();
  if v_job.assignment_id is null then return 'empty';end if;
  return private.process_claimed_assignment_evidence(v_job);
end;
$fn$;
revoke all on function private.process_one_verified_assignment_evidence()
  from public,anon,authenticated,service_role;

-- SECURITY INVOKER, no SET clause: PostgreSQL requires this for COMMIT in CALL.
-- Only the owner/cron may execute. Session lock survives the per-job commits;
-- cron disconnect releases it even if the backend is canceled or terminated.
create or replace procedure private.run_assignment_evidence_worker()
language plpgsql security invoker as $proc$
declare v_job private.assignment_evidence_jobs;v_deadline timestamptz=clock_timestamp()+interval '5 seconds';v_i integer;
begin
  if not pg_catalog.pg_try_advisory_lock(pg_catalog.hashtextextended('brains-heist:assignment-evidence-worker:v2',0)) then return;end if;
  for v_i in 1..20 loop
    perform pg_catalog.set_config('lock_timeout','2s',true);
    v_job=private.claim_verified_assignment_evidence();
    commit;
    exit when v_job.assignment_id is null;
    perform pg_catalog.set_config('lock_timeout','2s',true);
    perform private.process_claimed_assignment_evidence(v_job);
    commit;
    exit when clock_timestamp()>=v_deadline;
  end loop;
  perform pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended('brains-heist:assignment-evidence-worker:v2',0));
end;
$proc$;
revoke all on procedure private.run_assignment_evidence_worker() from public,anon,authenticated,service_role;

create or replace function private.check_assignment_evidence_backlog()
returns text language plpgsql security definer set search_path='' as $fn$
declare v_pending bigint;v_failed bigint;v_oldest timestamptz;v_recovered integer;
begin
  v_recovered=private.recover_assignment_evidence_leases();
  select count(*) filter(where status in ('pending','processing')),
    count(*) filter(where status='failed'),min(requested_at) filter(where status in ('pending','processing'))
  into v_pending,v_failed,v_oldest from private.assignment_evidence_jobs;
  if v_failed>0 or v_recovered>0 or v_oldest<clock_timestamp()-interval '10 minutes' then
    raise warning 'BH evidence backlog: pending %, failed %, recovered %, oldest %',v_pending,v_failed,v_recovered,v_oldest;
    return 'warning';
  end if;
  return 'ok';
end;
$fn$;
revoke all on function private.check_assignment_evidence_backlog() from public,anon,authenticated,service_role;

-- Catch cancellations explicitly in the bounded one-school function.
do $patch$
declare v_def text;
begin
  v_def=pg_catalog.pg_get_functiondef('private.run_school_head_refresh_batch(integer)'::regprocedure);
  if position('exception when others then' in v_def)=0 then raise exception 'Unexpected school refresh handler';end if;
  execute replace(v_def,'exception when others then','exception when query_canceled or others then');
end;
$patch$;
-- Commit each school separately; a later killed refresh cannot undo earlier schools.
create or replace procedure private.run_school_head_refresh_worker()
language plpgsql security invoker as $proc$
declare v_i integer;v_result jsonb;v_deadline timestamptz=clock_timestamp()+interval '5 seconds';
begin
  if not pg_catalog.pg_try_advisory_lock(pg_catalog.hashtextextended('brains-heist:school-head-refresh-worker:v2',0)) then return;end if;
  for v_i in 1..3 loop
    perform pg_catalog.set_config('lock_timeout','2s',true);
    v_result=private.run_school_head_refresh_batch(1);
    commit;
    exit when clock_timestamp()>=v_deadline;
    exit when coalesce((v_result->>'refreshed')::integer,0)+coalesce((v_result->>'failed')::integer,0)=0;
  end loop;
  perform pg_catalog.pg_advisory_unlock(pg_catalog.hashtextextended('brains-heist:school-head-refresh-worker:v2',0));
end;
$proc$;
revoke all on procedure private.run_school_head_refresh_worker() from public,anon,authenticated,service_role;

-- Single top-level CALL is essential: no surrounding BEGIN or multi-statement command.
select cron.schedule('brains-heist-assignment-evidence-worker','10 seconds',
  $cron$call private.run_assignment_evidence_worker();$cron$);
select cron.schedule('school-head-decision-center','*/2 * * * *',
  $cron$call private.run_school_head_refresh_worker();$cron$);
