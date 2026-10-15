-- Classroom P1: preserve verified grading while isolating non-critical workloads.
-- Preconditioned surgical patch: only remove redundant focus refresh on newly
-- inserted observations. Replays continue refreshing as previously designed.
do $patch$
declare
  v_rec record;
  v_def text;
  v_old text;
  v_new text;
begin
  for v_rec in
    select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname in ('ingest_verified_assignment_registry_evidence',
                        'ingest_verified_assignment_diagnostic_evidence')
  loop
    v_def:=pg_get_functiondef(v_rec.oid);
    if position(E'  v_quality text;\n' in v_def)=0 then
      raise exception 'Unexpected observation function declaration %',v_rec.proname;
    end if;
    if v_rec.proname='ingest_verified_assignment_registry_evidence' then
      v_old:=E'    on conflict(student_id,source_key) do nothing;\n\n    perform public.student_learning_refresh_focus_state(\n      p_student_id,v_skill_key\n    );';
      v_new:=E'    on conflict(student_id,source_key) do nothing;\n    get diagnostics v_observation_inserted = row_count;\n    -- AFTER INSERT trigger refreshed new evidence already; keep replay refresh.\n    if v_observation_inserted = 0 then\n      perform public.student_learning_refresh_focus_state(p_student_id,v_skill_key);\n    end if;';
    else
      v_old:=E'    on conflict (student_id, source_key) do nothing;\n\n    perform public.student_learning_refresh_focus_state(\n      p_student_id, v_skill_key\n    );';
      v_new:=E'    on conflict (student_id, source_key) do nothing;\n    get diagnostics v_observation_inserted = row_count;\n    -- AFTER INSERT trigger refreshed new evidence already; keep replay refresh.\n    if v_observation_inserted = 0 then\n      perform public.student_learning_refresh_focus_state(p_student_id,v_skill_key);\n    end if;';
    end if;
    if position(v_old in v_def)=0 then
      raise exception 'Unexpected observation conflict handler %',v_rec.proname;
    end if;
    v_def:=replace(v_def,E'  v_quality text;\n',
                         E'  v_quality text;\n  v_observation_inserted integer;\n');
    v_def:=replace(v_def,v_old,v_new);
    execute v_def;
  end loop;
  if not found then
    raise exception 'Academic evidence function patch prerequisites missing';
  end if;
end;
$patch$;

-- Multi-tab presence: 60-second heartbeat continues, repeated browser-focus
-- calls inside 45 seconds do not issue redundant user_presence UPDATEs.
create or replace function public.rpc_touch_last_seen()
returns timestamptz language plpgsql security definer set search_path = '' as $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  insert into public.user_presence(user_id,last_active_at) values(v_actor,v_now)
    on conflict (user_id) do update
      set last_active_at=excluded.last_active_at
      where public.user_presence.last_active_at is null
        or public.user_presence.last_active_at < excluded.last_active_at - interval '45 seconds';
  return v_now;
end;
$function$;
revoke all on function public.rpc_touch_last_seen() from public,anon;
grant execute on function public.rpc_touch_last_seen() to authenticated;

-- Private durable per-school refresh schedule, with bounded catch-up and retry.
create table if not exists private.school_head_refresh_schedule(
  school_id uuid primary key references public.schools(id) on delete cascade,
  next_refresh_at timestamptz not null default clock_timestamp(),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  failure_count integer not null default 0 check(failure_count>=0),
  last_error text
);
create index if not exists school_head_refresh_due_idx
  on private.school_head_refresh_schedule(next_refresh_at);
alter table private.school_head_refresh_schedule enable row level security;
revoke all on private.school_head_refresh_schedule from public,anon,authenticated,service_role;

-- The manual public refresh-all RPC remains unchanged. The cron job now
-- refreshes up to 3 active owner-managed schools per run instead of all 18
-- in a single 12-19s transaction. Failure of one school rolls back its own work.
create or replace function private.run_school_head_refresh_batch(p_limit integer default 3)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_school record; v_done integer:=0; v_failed integer:=0; v_error text;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('brains-heist:school-head-refresh-batch',0)
  ) then return jsonb_build_object('status','busy','refreshed',0,'failed',0); end if;
  for v_school in
    select s.id from public.schools s
    left join private.school_head_refresh_schedule st on st.school_id=s.id
    where s.status='active'
      and exists(select 1 from public.school_members sm
        where sm.school_id=s.id and sm.is_owner and sm.status='active')
      and coalesce(st.next_refresh_at,'-infinity'::timestamptz) <= clock_timestamp()
    order by coalesce(st.next_refresh_at,'-infinity'::timestamptz),s.id
    limit least(greatest(coalesce(p_limit,3),1),5)
  loop
    begin
      perform private.refresh_school_head_decision_alerts(v_school.id,30);
      insert into private.school_head_refresh_schedule
        (school_id,next_refresh_at,last_success_at,last_attempt_at,failure_count,last_error)
      values (v_school.id,clock_timestamp()+interval '1 hour',
        clock_timestamp(),clock_timestamp(),0,null)
      on conflict (school_id) do update set
        next_refresh_at=excluded.next_refresh_at,
        last_success_at=excluded.last_success_at,
        last_attempt_at=excluded.last_attempt_at,
        failure_count=0,last_error=null;
      v_done:=v_done+1;
    exception when others then
      v_error:=left(SQLSTATE||': '||SQLERRM,500);
      insert into private.school_head_refresh_schedule
        (school_id,next_refresh_at,last_attempt_at,failure_count,last_error)
      values (v_school.id,clock_timestamp()+interval '5 minutes',
        clock_timestamp(),1,v_error)
      on conflict (school_id) do update set
        next_refresh_at=excluded.next_refresh_at,
        last_attempt_at=excluded.last_attempt_at,
        failure_count=private.school_head_refresh_schedule.failure_count+1,
        last_error=excluded.last_error;
      raise warning 'School head refresh failed for school %, error %',v_school.id,v_error;
      v_failed:=v_failed+1;
    end;
  end loop;
  return jsonb_build_object('status','ok','refreshed',v_done,'failed',v_failed);
end;
$function$;
revoke all on function private.run_school_head_refresh_batch(integer)
  from public,anon,authenticated,service_role;

-- Separate bounded analytics, delivery and retention. pg_cron is already active.
select cron.schedule('school-head-decision-center','*/2 * * * *',
  $cron$set statement_timeout='45s';select private.run_school_head_refresh_batch(3);$cron$);
select cron.schedule('school-head-decision-notifications','5-55/10 * * * *',
  $cron$set statement_timeout='45s';select private.dispatch_school_head_decision_notifications(null);$cron$);
select cron.schedule('school-head-snapshot-retention','43 3 * * *',
  $cron$delete from public.school_head_metric_snapshots
  where snapshot_date<current_date-400;$cron$);

-- Preserve one-minute provider delivery; move expensive cleanup/reminder scans
-- to independent schedules. Existing due-reminder window is two hours wide.
select cron.schedule('school-email-dispatcher','* * * * *',
  $cron$select net.http_post(
    url := (select function_url from public.school_email_dispatch_config where singleton=true),
    headers := jsonb_build_object('Content-Type','application/json',
      'x-school-email-dispatch-key',(select dispatch_key from public.school_email_dispatch_config where singleton=true)),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );$cron$);
select cron.schedule('school-email-cleanup','3-58/5 * * * *',
  $cron$select public.rpc_school_email_cleanup();$cron$);
select cron.schedule('school-email-reminders','7-57/10 * * * *',
  $cron$select public.rpc_enqueue_due_email_reminders();$cron$);
