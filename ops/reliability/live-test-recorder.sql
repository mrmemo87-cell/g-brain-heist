-- Temporary production observability; deploy with the Supabase migration API.
-- No application triggers, public RPCs, raw SQL text, student data, or tokens.
-- 10-second samples; 1-minute statement totals; rolling 48-hour retention.
-- Automatically unschedules itself after seven days. Explicit operator rearming only.
set lock_timeout = '1s';
set statement_timeout = '15s';

create table private.reliability_capture_config (
  singleton boolean primary key default true check (singleton),
  created_at timestamptz not null default clock_timestamp(),
  enabled_until timestamptz not null default clock_timestamp() + interval '7 days',
  last_detail_at timestamptz,
  last_prune_at timestamptz,
  check (enabled_until <= created_at + interval '7 days 1 minute')
);
create table private.reliability_samples (
  sampled_at timestamptz primary key,
  payload jsonb not null,
  capture_ms double precision not null
);
alter table private.reliability_capture_config enable row level security;
alter table private.reliability_samples enable row level security;
revoke all on private.reliability_capture_config, private.reliability_samples
  from public, anon, authenticated, service_role;
insert into private.reliability_capture_config(singleton) values (true);

create function private.capture_reliability_sample() returns void
language plpgsql security invoker set search_path = '' as $$
declare
  started timestamptz := clock_timestamp();
  cfg private.reliability_capture_config;
  activity jsonb;
  details jsonb;
  statements jsonb;
  database_totals jsonb;
  evidence jsonb;
  cron_activity jsonb;
  do_detail boolean;
  recorder_job bigint;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('brains-heist:reliability-recorder:v1',0)
  ) then return; end if;
  select * into cfg from private.reliability_capture_config where singleton;
  if not found then return; end if;
  select jobid into recorder_job from cron.job
    where jobname='brains-heist-live-test-recorder' and username=current_user;
  if started >= cfg.enabled_until then
    delete from private.reliability_samples where sampled_at < started-interval '48 hours';
    if recorder_job is not null then perform cron.unschedule(recorder_job); end if;
    return;
  end if;
  do_detail := cfg.last_detail_at is null or cfg.last_detail_at <= started-interval '60 seconds';

  -- pg_stat_activity reports are sampled, not per-request tracing.
  with sessions as materialized (
    select pid,usename,state,wait_event_type,wait_event,query_start,xact_start,
      query_id,datname,query
    from pg_catalog.pg_stat_activity where backend_type='client backend'
  ), roles as (
    select usename role,state,count(*) connections from sessions group by usename,state
  )
  select jsonb_build_object(
    'connections',(select count(*) from sessions),
    'max_connections',current_setting('max_connections')::integer,
    'active',(select count(*) from sessions where state='active' and pid<>pg_backend_pid()),
    'lock_waiters',(select count(*) from sessions where wait_event_type='Lock'),
    'io_waiters',(select count(*) from sessions where state='active' and wait_event_type='IO'),
    'idle_in_transaction',(select count(*) from sessions where state like 'idle in transaction%'),
    'roles',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from roles r)
  ),
  (select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (
    select s.pid,s.usename role,s.state,s.wait_event_type,s.wait_event,
      s.query_id::text query_id,
      round(extract(epoch from (started-s.query_start))*1000) query_age_ms,
      round(extract(epoch from (started-s.xact_start))*1000) transaction_age_ms,
      case
        when s.query like '%rpc_submit_assignment_answer_v2%' then 'assignment_answer'
        when s.query like '%rpc_submit_assignment_result_v2%' then 'assignment_finalize'
        when s.query like '%rpc_get_student_assignment%' then 'assignment_read'
        when s.query like '%rpc_teacher_assignment%' then 'teacher_assignment_report'
        when s.query like '%run_assignment_evidence_worker%' then 'assignment_evidence_worker'
        when s.query like '%school_head%' then 'school_head'
        when s.usename='supabase_auth_admin' then 'auth'
        else 'other'
      end operation,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'pid',b.pid,'role',b.usename,'query_id',b.query_id::text,
        'transaction_age_ms',round(extract(epoch from (started-b.xact_start))*1000)
      )),'[]'::jsonb) from sessions b where b.pid=any(pg_catalog.pg_blocking_pids(s.pid))) blockers
    from sessions s
    where s.pid<>pg_backend_pid() and s.datname=current_database()
      and (s.wait_event_type='Lock' or s.state like 'idle in transaction%'
        or (s.state='active' and s.query_start<started-interval '500 milliseconds'))
    order by (s.wait_event_type='Lock') desc nulls last,s.query_start
    limit 12
  ) q)
  into activity,details;

  if do_detail then
    select jsonb_build_object(
      'stats_reset',d.stats_reset,'commits',d.xact_commit,'rollbacks',d.xact_rollback,
      'deadlocks',d.deadlocks,'blocks_read',d.blks_read,'blocks_hit',d.blks_hit,
      'temp_bytes',d.temp_bytes,'block_read_ms',d.blk_read_time,'block_write_ms',d.blk_write_time,
      'statement_stats_reset',(select stats_reset from extensions.pg_stat_statements_info)
    ) into database_totals from pg_catalog.pg_stat_database d where d.datname=current_database();

    -- Cumulative totals: compare successive snapshots, handling resets/eviction.
    -- Parameter values and query strings are deliberately never persisted.
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into statements from (
      select s.userid::bigint role_oid,s.queryid::text query_id,s.toplevel,s.calls,
        s.total_exec_time,s.max_exec_time,s.rows,s.shared_blks_hit,s.shared_blks_read,
        s.temp_blks_written,s.shared_blk_read_time,s.shared_blk_write_time,s.wal_bytes,s.stats_since,
        case
          when s.query like '%rpc_submit_assignment_answer_v2%' then 'assignment_answer'
          when s.query like '%rpc_submit_assignment_result_v2%' then 'assignment_finalize'
          when s.query like '%rpc_get_student_assignment%' then 'assignment_read'
          when s.query like '%rpc_teacher_assignment%' then 'teacher_assignment_report'
          when s.query like '%rpc_auth_bootstrap%' then 'auth_bootstrap'
          when s.query like '%run_assignment_evidence_worker%' then 'assignment_evidence_worker'
          when s.query like '%school_head%' then 'school_head'
          else 'other'
        end operation
      from extensions.pg_stat_statements s
      where s.dbid=(select oid from pg_catalog.pg_database where datname=current_database())
        and s.queryid is not null and s.query !~* 'reliability_(samples|capture_config|sample)'
        and s.query !~* '^(CREATE|ALTER|GRANT|REVOKE|DROP|COMMENT|--|SET)'
      order by (s.query ~ 'rpc_.*assignment|rpc_auth_bootstrap|run_assignment_evidence_worker|school_head') desc,
        s.total_exec_time desc
      limit 60
    ) q;

    select jsonb_build_object(
      'pending',count(*) filter(where status='pending'),
      'processing',count(*) filter(where status='processing'),
      'failed',count(*) filter(where status='failed'),
      'oldest_pending_at',min(requested_at) filter(where status='pending'),
      'overdue',count(*) filter(where status='pending' and requested_at<started-interval '15 minutes')
    ) into evidence from private.assignment_evidence_jobs where status<>'done';

    -- Use runid's primary key, not an unindexed timestamp scan of historical cron logs.
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into cron_activity from (
      select j.jobname,r.runid,r.status,r.start_time,r.end_time,
        round(extract(epoch from (coalesce(r.end_time,started)-r.start_time))*1000) duration_ms
      from (select jobid,runid,status,start_time,end_time from cron.job_run_details
        order by runid desc limit 200) r
      join cron.job j using(jobid)
      where j.jobname<>'brains-heist-live-test-recorder'
        and (r.status='running' or (r.status='failed' and r.start_time>=started-interval '2 minutes'))
      order by r.runid desc limit 12
    ) q;
    update private.reliability_capture_config set last_detail_at=started where singleton;
  end if;

  if cfg.last_prune_at is null or cfg.last_prune_at<started-interval '1 hour' then
    delete from private.reliability_samples where sampled_at<started-interval '48 hours';
    -- Delete only this recorder's old log rows, via the primary-key tail cutoff.
    if recorder_job is not null then
      delete from cron.job_run_details where runid in (
        select runid from (select runid,jobid,end_time from cron.job_run_details
          order by runid desc limit 10000) recent
        where jobid=recorder_job and end_time<started-interval '2 hours'
      );
    end if;
    update private.reliability_capture_config set last_prune_at=started where singleton;
  end if;

  insert into private.reliability_samples(sampled_at,payload,capture_ms)
  values(started,jsonb_strip_nulls(jsonb_build_object(
    'activity',activity,'sessions',details,'database_totals',database_totals,
    'statement_totals',statements,'evidence',evidence,'cron_activity',cron_activity
  )),extract(epoch from(clock_timestamp()-started))*1000);
end;
$$;
revoke all on function private.capture_reliability_sample()
  from public, anon, authenticated, service_role;
grant execute on function private.capture_reliability_sample() to postgres;

-- Defensive limits are separate SQL statements so they apply to the sampler query.
select cron.schedule('brains-heist-live-test-recorder','10 seconds',
  $job$set statement_timeout='1500ms'; set lock_timeout='100ms'; select private.capture_reliability_sample();$job$);
select private.capture_reliability_sample();
