-- 2026-10-15 P0 classroom fix. Existing student answers/results untouched.
-- Result and evidence-work request are committed atomically; costly processing is NOT.
create table if not exists private.assignment_evidence_jobs (
  assignment_id uuid not null,
  student_id uuid not null,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  requested_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  last_error text,
  primary key (assignment_id, student_id),
  constraint assignment_evidence_jobs_result_fk
    foreign key (assignment_id, student_id)
    references public.student_assignment_results(assignment_id, student_id)
    on delete cascade
);
create index if not exists assignment_evidence_jobs_due_idx
  on private.assignment_evidence_jobs(available_at,requested_at)
  where status='pending';
alter table private.assignment_evidence_jobs enable row level security;
revoke all on private.assignment_evidence_jobs from public, anon, authenticated, service_role;

create or replace function private.enqueue_verified_assignment_evidence_row(
  p_assignment_id uuid, p_student_id uuid
) returns void language plpgsql security definer set search_path = '' as $body$
begin
  insert into private.assignment_evidence_jobs
      (assignment_id, student_id, status, attempts, requested_at, available_at, processed_at, last_error)
  values (p_assignment_id, p_student_id, 'pending', 0, clock_timestamp(), clock_timestamp(), null, null)
  on conflict (assignment_id,student_id) do update set
      status = 'pending', attempts = 0, requested_at = excluded.requested_at,
      available_at = excluded.available_at, processed_at = null, last_error = null;
end;
$body$;
revoke all on function private.enqueue_verified_assignment_evidence_row(uuid,uuid)
  from public,anon,authenticated,service_role;

-- Preserve existing deferred result trigger, replace expensive handler ONLY.
create or replace function private.capture_verified_assignment_diagnostic_evidence()
returns trigger language plpgsql security definer set search_path = '' as $body$
begin
  perform private.enqueue_verified_assignment_evidence_row(new.assignment_id,new.student_id);
  return new;
end;
$body$;
revoke all on function private.capture_verified_assignment_diagnostic_evidence()
  from public,anon,authenticated,service_role;

-- Preserve result-before-completion compatibility without recomputation.
create or replace function private.capture_completed_assignment_evidence()
returns trigger language plpgsql security definer set search_path = '' as $body$
begin
  if exists (select 1 from public.student_assignment_results r
             where r.assignment_id=new.assignment_id and r.student_id=new.student_id) then
    perform private.enqueue_verified_assignment_evidence_row(new.assignment_id,new.student_id);
  end if;
  return new;
end;
$body$;
revoke all on function private.capture_completed_assignment_evidence()
  from public,anon,authenticated,service_role;

-- One worker globally; SKIP LOCKED and per-student lock remain inside ingest.
-- Exceptions roll back both academic pipelines as one unit, then record retry state.
create or replace function private.process_one_verified_assignment_evidence()
returns text language plpgsql security definer set search_path = '' as $body$
declare v_job private.assignment_evidence_jobs%rowtype; v_next_attempt integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('brains-heist:assignment-evidence-worker:v1',0)
  ) then return 'busy'; end if;
  select * into v_job from private.assignment_evidence_jobs j
   where j.status='pending' and j.available_at <= clock_timestamp()
   order by j.available_at,j.requested_at
   for update skip locked limit 1;
  if not found then return 'empty'; end if;
  begin
    perform private.ingest_verified_assignment_registry_evidence(v_job.assignment_id,v_job.student_id);
    perform private.ingest_verified_assignment_diagnostic_evidence(v_job.assignment_id,v_job.student_id);
    update private.assignment_evidence_jobs
      set status='done', processed_at=clock_timestamp(), last_error=null
      where assignment_id=v_job.assignment_id and student_id=v_job.student_id;
    return 'done';
  exception when others then
    v_next_attempt := v_job.attempts + 1;
    update private.assignment_evidence_jobs
      set attempts=v_next_attempt,
          status=case when v_next_attempt>=8 then 'failed' else 'pending' end,
          available_at=clock_timestamp() + pg_catalog.make_interval(secs =>
            least(3600,20*pg_catalog.power(2,least(v_next_attempt,7))::integer)),
          last_error=left(SQLSTATE || ': ' || SQLERRM,900)
    where assignment_id=v_job.assignment_id and student_id=v_job.student_id;
    raise warning 'BH assignment evidence retry attempt %, state %',v_next_attempt,SQLSTATE;
    return case when v_next_attempt>=8 then 'failed' else 'retry' end;
  end;
end;
$body$;
revoke all on function private.process_one_verified_assignment_evidence()
  from public,anon,authenticated,service_role;

-- pg_cron is installed; one task per minute intentionally bounds write load.
select cron.schedule('brains-heist-assignment-evidence-worker', '* * * * *',
$cron$set lock_timeout = '2s';
set statement_timeout = '120s';
select private.process_one_verified_assignment_evidence();$cron$);

-- A cheap five-minute watchdog makes retries / stuck evidence visible in PG logs.
create or replace function private.check_assignment_evidence_backlog()
returns text language plpgsql security definer set search_path = '' as $body$
declare v_pending bigint; v_failed bigint; v_oldest timestamptz;
begin
  select count(*) filter(where status='pending'),
         count(*) filter(where status='failed'),
         min(requested_at) filter(where status='pending')
    into v_pending,v_failed,v_oldest
  from private.assignment_evidence_jobs;
  if v_failed > 0 or (v_oldest is not null
      and v_oldest < clock_timestamp() - interval '10 minutes') then
    raise warning 'BH assignment evidence backlog: pending %, failed %, oldest %',
       v_pending, v_failed, v_oldest;
    return 'warning';
  end if;
  return 'ok';
end;
$body$;
revoke all on function private.check_assignment_evidence_backlog()
  from public,anon,authenticated,service_role;
select cron.schedule('brains-heist-assignment-evidence-watchdog','*/5 * * * *',
  $cron$select private.check_assignment_evidence_backlog();$cron$);

-- Lifecycle writes already happen on schools / billing_subscriptions triggers.
CREATE OR REPLACE FUNCTION public.get_school_plan_details(p_school_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_plan text;
  v_effective_plan text;
  v_trial_end timestamptz;
  v_active boolean;
  v_limits jsonb;
  v_members integer;
  v_pilot_state text;
  v_capacity jsonb;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  v_school_id := coalesce(
    p_school_id,
    (select u.school_id from public.users u where u.id = v_actor)
  );
  if v_school_id is null then
    return jsonb_build_object('success', true, 'plan', 'none', 'is_active', false, 'pilot_state', 'not_started');
  end if;

  if not (
    public.is_superadmin(v_actor)
    or exists(
      select 1 from public.school_members sm
      where sm.school_id = v_school_id
        and sm.user_id = v_actor
        and sm.status = 'active'
    )
  ) then
    return jsonb_build_object('success', false, 'error', 'Not a member of this school');
  end if;

  -- Reads no longer synchronize lifecycle: school and billing triggers own writes.

  select s.school_plan, s.trial_ends_at
  into v_plan, v_trial_end
  from public.schools s
  where s.id = v_school_id;

  v_effective_plan := private.professional_onboarding_active_plan(v_school_id);
  v_active := v_effective_plan in ('pilot','core','standard','pro','enterprise');

  select b.capacity into v_capacity
  from public.billing_subscriptions b
  where b.school_id = v_school_id
    and b.status in ('active','trialing','past_due')
    and (b.current_period_end is null or b.current_period_end > now())
    and b.capacity is not null
    and b.capacity <> '{}'::jsonb
  order by b.updated_at desc, b.created_at desc
  limit 1;

  if v_capacity is not null then
    v_limits := jsonb_build_object(
      'game', coalesce((v_capacity ->> 'platform')::integer, 0),
      'cambridge', coalesce((v_capacity ->> 'cambridge')::integer, 0),
      'ielts', coalesce((v_capacity ->> 'ielts')::integer, 0),
      'writing', coalesce((v_capacity ->> 'writing')::integer, 0),
      'admissions', coalesce((v_capacity ->> 'admissions')::integer, 0)
    );
  else
    v_limits := public.get_plan_seat_limits(
      case when v_effective_plan = 'free' then coalesce(v_plan, 'none') else v_effective_plan end
    );
  end if;

  select count(*)::integer into v_members
  from public.school_members sm
  where sm.school_id = v_school_id and sm.status = 'active';

  select spl.state into v_pilot_state
  from public.school_pilot_lifecycle spl
  where spl.school_id = v_school_id;

  return jsonb_build_object(
    'success', true,
    'school_id', v_school_id,
    'plan', case when v_effective_plan = 'free' then coalesce(v_plan, 'none') else v_effective_plan end,
    'effective_plan', v_effective_plan,
    'is_active', v_active,
    'trial_ends_at', v_trial_end,
    'pilot_state', coalesce(v_pilot_state, 'not_started'),
    'seats', v_limits,
    'current_members', v_members,
    'trial_expired', coalesce(v_plan = 'pilot' and (v_trial_end is null or v_trial_end <= now()), false)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION private.sync_school_pilot_lifecycle(p_school_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_school public.schools%rowtype; v_paid boolean;
begin
  if p_school_id is null then return; end if;
  select * into v_school from public.schools s where s.id=p_school_id;
  if not found then return; end if;
  insert into public.school_pilot_lifecycle(school_id) values(p_school_id) on conflict(school_id) do nothing;
  select exists(
    select 1 from public.billing_subscriptions bs
    where bs.school_id=p_school_id and bs.plan in ('core','standard','pro','enterprise')
      and bs.status in ('active','trialing','past_due')
      and (bs.current_period_end is null or bs.current_period_end>now())
      and (not bs.is_comp or bs.comp_expires_at is null or bs.comp_expires_at>now())
  ) into v_paid;
  if v_paid or v_school.school_plan in ('core','standard','pro','enterprise') then
    update public.school_pilot_lifecycle set state='converted',converted_at=coalesce(converted_at,now()),updated_at=now()
    where school_id=p_school_id and state<>'cancelled' and (state is distinct from 'converted' or converted_at is null);
  elsif v_school.school_plan='pilot' and v_school.trial_ends_at>now() then
    update public.school_pilot_lifecycle set state='active',ends_at=v_school.trial_ends_at,
      started_at=coalesce(started_at,v_school.trial_ends_at-interval '30 days'),updated_at=now()
    where school_id=p_school_id and state<>'cancelled' and (state is distinct from 'active' or ends_at is distinct from v_school.trial_ends_at or started_at is null);
  elsif v_school.trial_ends_at is not null then
    update public.school_pilot_lifecycle set state='expired',ends_at=v_school.trial_ends_at,
      started_at=coalesce(started_at,v_school.trial_ends_at-interval '30 days'),updated_at=now()
    where school_id=p_school_id and state not in ('converted','cancelled') and (state is distinct from 'expired' or ends_at is distinct from v_school.trial_ends_at or started_at is null);
  else
    update public.school_pilot_lifecycle set state='not_started',started_at=null,ends_at=null,updated_at=now()
    where school_id=p_school_id and state not in ('converted','cancelled','expired') and (state is distinct from 'not_started' or started_at is not null or ends_at is not null);
  end if;
end;
$function$;

-- Re-declared public SECURITY DEFINER functions must explicitly deny PUBLIC/anon.
revoke all on function public.get_school_plan_details(uuid) from public,anon;

-- Idempotent rewards for concurrent achievement checks.
CREATE OR REPLACE FUNCTION public.check_assignment_achievements(p_user_id uuid)
 RETURNS TABLE(achievement_id text, achievement_name text, achievement_icon text, xp_reward integer, coin_reward integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_award_count integer;
  v_assignments_completed INT;
  v_perfect_scores INT;
  v_early_submissions INT;
  v_achievement RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  p_user_id := auth.uid();  -- [Patch F] force self-only
  -- Count assignments
  SELECT COUNT(*) INTO v_assignments_completed
  FROM student_assignment_results WHERE student_id = p_user_id;

  SELECT COUNT(*) INTO v_perfect_scores
  FROM student_assignment_results WHERE student_id = p_user_id AND accuracy = 100;

  SELECT COUNT(*) INTO v_early_submissions
  FROM student_assignment_results sar
  JOIN assignments a ON a.id = sar.assignment_id
  WHERE sar.student_id = p_user_id
    AND a.due_at IS NOT NULL
    AND sar.completed_at < a.due_at - INTERVAL '1 day';

  -- Check each assignment achievement
  FOR v_achievement IN 
    SELECT * FROM achievements 
    WHERE category = 'assignments'
  LOOP
    -- Skip if earned
    IF EXISTS (
      SELECT 1 FROM user_achievements 
      WHERE user_id = p_user_id AND user_achievements.achievement_id = v_achievement.id
      AND earned_at IS NOT NULL
    ) THEN
      CONTINUE;
    END IF;

    -- Check condition
    IF (v_achievement.condition_type = 'assignments_completed' AND v_assignments_completed >= v_achievement.condition_value) OR
       (v_achievement.condition_type = 'perfect_scores' AND v_perfect_scores >= v_achievement.condition_value) OR
       (v_achievement.condition_type = 'early_submissions' AND v_early_submissions >= v_achievement.condition_value) THEN
       
      -- Award achievement
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, progress, target)
      VALUES (p_user_id, v_achievement.id, NOW(), v_achievement.condition_value, v_achievement.condition_value)
      ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key
      DO UPDATE SET earned_at = NOW() WHERE user_achievements.earned_at IS NULL;
      GET DIAGNOSTICS v_new_award_count = ROW_COUNT;
      IF v_new_award_count = 0 THEN CONTINUE; END IF;

      -- Award rewards
      UPDATE users 
      SET xp = xp + COALESCE(v_achievement.reward_xp, 0),
          coins = coins + COALESCE(v_achievement.reward_coins, 0)
      WHERE id = p_user_id;

      RETURN QUERY SELECT 
        v_achievement.id::TEXT,
        v_achievement.name::TEXT,
        v_achievement.icon::TEXT,
        COALESCE(v_achievement.reward_xp, 0)::INT,
        COALESCE(v_achievement.reward_coins, 0)::INT;
    END IF;
  END LOOP;
END;
$function$;

revoke all on function public.check_assignment_achievements(uuid) from public,anon;

-- Keep all three internal school-subject mapping tables fully private.
-- The old assignments teacher policies accessed them as SECURITY INVOKER RLS,
-- raising 42501 during unrelated student question-attempt reads.
-- This helper is explicit, caller-bound, and only answers teacher membership.
create or replace function public.can_access_assigned_school_subject_group(
  p_school_id uuid, p_group_id uuid, p_academic_year_id uuid,
  p_require_create boolean default false
) returns boolean
language sql stable security definer set search_path = '' as $helper$
  select auth.uid() is not null
    and exists(
      select 1
      from public.school_subject_group_teachers gt
      join public.school_subject_groups g
        on g.id=gt.group_id and g.school_id=gt.school_id and g.status='active'
      join public.school_subject_offerings o
        on o.id=g.school_subject_offering_id and o.school_id=g.school_id and o.status='active'
      where gt.group_id=p_group_id and gt.school_id=p_school_id
        and gt.teacher_user_id=auth.uid() and gt.active
        and o.academic_year_id=p_academic_year_id
        and (not p_require_create or gt.can_create)
    )
$helper$;
revoke all on function public.can_access_assigned_school_subject_group(uuid,uuid,uuid,boolean)
  from public,anon,service_role;
grant execute on function public.can_access_assigned_school_subject_group(uuid,uuid,uuid,boolean)
  to authenticated;

drop policy if exists assignments_teacher_group_select on public.assignments;
create policy assignments_teacher_group_select on public.assignments
  for select to authenticated
  using (
    subject_group_id is not null
    and public.can_access_assigned_school_subject_group(
      school_id,subject_group_id,academic_year_id,false)
  );
drop policy if exists assignments_teacher_group_update on public.assignments;
create policy assignments_teacher_group_update on public.assignments
  for update to authenticated
  using (
    subject_group_id is not null
    and public.can_access_assigned_school_subject_group(
      school_id,subject_group_id,academic_year_id,true)
  )
  with check (
    subject_group_id is not null
    and public.can_access_assigned_school_subject_group(
      school_id,subject_group_id,academic_year_id,true)
  );

-- Service role still needs GRANT despite BYPASSRLS.
grant select,update on public.assignment_email_notifications to service_role;
-- No automatic historical evidence replay. Reconcile separately under control.
