-- IELTS Exam Mode live-launch safety.
--
-- Live is a controlled state transition, never an exam-creation shortcut:
-- - new events can only start as draft or scheduled;
-- - draft -> scheduled is an audited, manager-only schedule transition;
-- - scheduled -> live requires an explicit confirmation and readiness checks;
-- - live -> paused is the only supported pause transition;
-- - paused -> live preserves the existing monitor workflow but validates the
--   state, school, schedule, active form, and assignments;
-- - direct client writes cannot bypass the audited RPC boundary.

-- Keep the readiness rules shared by launch and resume so the two paths cannot
-- drift. This function is intentionally not executable through the Data API.
create or replace function public.ielts_exam_assert_live_ready(
  p_exam_event_id uuid,
  p_school_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_form_count bigint := 0;
  v_active_form_id uuid;
  v_assignment_count bigint := 0;
  v_invalid_assignment_count bigint := 0;
begin
  if p_school_id is null then
    raise exception 'school_required';
  end if;

  select count(*)
  into v_active_form_count
  from public.ielts_exam_forms f
  where f.exam_event_id = p_exam_event_id
    and f.is_active = true;

  if v_active_form_count = 0 then
    raise exception 'active_form_required';
  end if;
  if v_active_form_count <> 1 then
    raise exception 'exactly_one_active_form_required';
  end if;

  select f.id
  into v_active_form_id
  from public.ielts_exam_forms f
  where f.exam_event_id = p_exam_event_id
    and f.is_active = true
  order by f.created_at, f.id
  limit 1;

  select
    count(*) filter (where a.status <> 'void'),
    count(*) filter (
      where a.status <> 'void'
        and (
          a.school_id is distinct from p_school_id
          or a.form_id is distinct from v_active_form_id
          or u.id is null
          or u.school_id is distinct from p_school_id
          or (
            a.class_id is not null
            and (
              c.id is null
              or c.school_id is distinct from p_school_id
              or coalesce(c.is_active, true) is not true
            )
          )
        )
    )
  into v_assignment_count, v_invalid_assignment_count
  from public.ielts_exam_assignments a
  left join public.users u
    on u.id = a.student_id
  left join public.classes c
    on c.id = a.class_id
  where a.exam_event_id = p_exam_event_id;

  if v_assignment_count = 0 then
    raise exception 'assignments_required';
  end if;
  if v_invalid_assignment_count <> 0 then
    raise exception 'invalid_exam_assignments';
  end if;

  return jsonb_build_object(
    'active_form_id', v_active_form_id,
    'assignment_count', v_assignment_count
  );
end;
$$;

-- Managers retain full control. Assigned teachers can use emergency controls
-- only through both an active school teaching membership and an active class
-- link belonging to this exact exam school.
create or replace function public.ielts_exam_actor_can_control(
  p_exam_event_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_school_id is not null
    and (
      public.can_manage_ielts_exam(p_exam_event_id)
      or exists (
        select 1
        from public.ielts_exam_assignments a
        join public.classes c
          on c.id = a.class_id
         and c.school_id = p_school_id
         and coalesce(c.is_active, true) = true
        join public.class_teacher_assignments cta
          on cta.class_id = c.id
         and cta.school_id = p_school_id
         and cta.teacher_user_id = auth.uid()
         and coalesce(cta.active, true) = true
        join public.school_members sm
          on sm.school_id = p_school_id
         and sm.user_id = auth.uid()
         and sm.status = 'active'
         and coalesce(sm.can_teach, false) = true
        where a.exam_event_id = p_exam_event_id
          and a.school_id = p_school_id
          and a.status <> 'void'
      )
    );
$$;

-- Defense in depth for privileged/direct SQL paths. The transaction-local
-- guard is set only after the launch/resume RPC has completed all checks.
create or replace function public.ielts_exam_guard_live_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_guard_exam_id text := coalesce(
    current_setting('brainsheist.ielts_live_transition_exam_id', true),
    ''
  );
  v_guard_actor_id text := coalesce(
    current_setting('brainsheist.ielts_live_transition_actor_id', true),
    ''
  );
  v_guard_action text := coalesce(
    current_setting('brainsheist.ielts_live_transition_action', true),
    ''
  );
begin
  if tg_op = 'INSERT' and new.status = 'live' then
    raise exception 'direct_live_creation_forbidden';
  end if;

  if tg_op = 'UPDATE'
     and old.status is distinct from new.status
     and new.status = 'live' then
    if v_guard_exam_id <> new.id::text
       or v_guard_actor_id <> coalesce(auth.uid()::text, '') then
      raise exception 'live_transition_requires_rpc';
    end if;

    if old.status = 'scheduled' and v_guard_action <> 'launch' then
      raise exception 'invalid_launch_transition';
    elsif old.status = 'paused' and v_guard_action <> 'resume' then
      raise exception 'invalid_resume_transition';
    elsif old.status not in ('scheduled', 'paused') then
      raise exception 'invalid_live_transition';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ielts_exam_guard_live_status_transition
  on public.ielts_exam_events;
create trigger trg_ielts_exam_guard_live_status_transition
before insert or update of status on public.ielts_exam_events
for each row
execute function public.ielts_exam_guard_live_status_transition();

-- Preserve the existing signature while removing live/terminal-state creation.
create or replace function public.rpc_ielts_create_exam_event(
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_minutes int,
  p_status text default 'draft',
  p_school_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_school_id uuid;
  v_school_id uuid;
  v_initial_status text := coalesce(p_status, 'draft');
  v_event public.ielts_exam_events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'title_required';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid_exam_window';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'invalid_duration';
  end if;
  if p_starts_at + make_interval(mins => p_duration_minutes) > p_ends_at then
    raise exception 'duration_exceeds_exam_window';
  end if;
  if v_initial_status not in ('draft', 'scheduled') then
    raise exception 'invalid_initial_status';
  end if;

  select u.school_id
  into v_actor_school_id
  from public.users u
  where u.id = auth.uid();

  v_school_id := coalesce(p_school_id, v_actor_school_id);

  if v_school_id is null then
    raise exception 'school_required';
  end if;
  if not public.can_create_ielts_exam(v_school_id) then
    raise exception 'forbidden';
  end if;

  insert into public.ielts_exam_events (
    school_id,
    title,
    description,
    status,
    starts_at,
    ends_at,
    duration_minutes,
    created_by
  ) values (
    v_school_id,
    trim(p_title),
    p_description,
    v_initial_status,
    p_starts_at,
    p_ends_at,
    p_duration_minutes,
    auth.uid()
  )
  returning * into v_event;

  insert into public.ielts_exam_audit_log (
    actor_id,
    exam_event_id,
    action,
    payload
  ) values (
    auth.uid(),
    v_event.id,
    'create_exam_event',
    jsonb_build_object(
      'title', v_event.title,
      'status', v_event.status,
      'school_id', v_event.school_id,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at
    )
  );

  return to_jsonb(v_event);
end;
$$;

create or replace function public.rpc_ielts_schedule_exam(
  p_exam_event_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_minutes int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_event public.ielts_exam_events%rowtype;
  v_previous_starts_at timestamptz;
  v_previous_ends_at timestamptz;
  v_previous_duration_minutes int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_starts_at is null
     or p_ends_at is null
     or p_ends_at <= p_starts_at
     or p_ends_at <= v_now then
    raise exception 'invalid_exam_window';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'invalid_duration';
  end if;
  if p_starts_at + make_interval(mins => p_duration_minutes) > p_ends_at then
    raise exception 'duration_exceeds_exam_window';
  end if;

  select e.*
  into v_event
  from public.ielts_exam_events e
  where e.id = p_exam_event_id
  for update;

  if v_event.id is null then
    raise exception 'exam_not_found';
  end if;
  if v_event.school_id is null then
    raise exception 'school_required';
  end if;
  if not public.can_manage_ielts_exam(v_event.id)
     or not public.can_create_ielts_exam(v_event.school_id) then
    raise exception 'forbidden';
  end if;
  if v_event.status <> 'draft' then
    raise exception 'invalid_schedule_state';
  end if;

  v_previous_starts_at := v_event.starts_at;
  v_previous_ends_at := v_event.ends_at;
  v_previous_duration_minutes := v_event.duration_minutes;

  update public.ielts_exam_events e
  set status = 'scheduled',
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      duration_minutes = p_duration_minutes,
      updated_at = v_now
  where e.id = v_event.id
    and e.status = 'draft'
  returning e.* into v_event;

  if v_event.id is null then
    raise exception 'invalid_schedule_state';
  end if;

  insert into public.ielts_exam_audit_log (
    actor_id,
    exam_event_id,
    action,
    payload
  ) values (
    auth.uid(),
    p_exam_event_id,
    'schedule_exam',
    jsonb_build_object(
      'previous_status', 'draft',
      'status', 'scheduled',
      'school_id', v_event.school_id,
      'previous_starts_at', v_previous_starts_at,
      'previous_ends_at', v_previous_ends_at,
      'previous_duration_minutes', v_previous_duration_minutes,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'duration_minutes', v_event.duration_minutes
    )
  );

  return jsonb_build_object(
    'exam_event_id', v_event.id,
    'previous_status', 'draft',
    'status', v_event.status,
    'starts_at', v_event.starts_at,
    'ends_at', v_event.ends_at,
    'duration_minutes', v_event.duration_minutes,
    'server_now', v_now
  );
end;
$$;

create or replace function public.rpc_ielts_launch_exam(
  p_exam_event_id uuid,
  p_confirmation text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_event public.ielts_exam_events%rowtype;
  v_readiness jsonb;
  v_active_form_id uuid;
  v_assignment_count bigint;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_confirmation is distinct from 'LAUNCH' then
    raise exception 'launch_confirmation_required';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'reason_too_long';
  end if;

  select e.*
  into v_event
  from public.ielts_exam_events e
  where e.id = p_exam_event_id
  for update;

  if v_event.id is null then
    raise exception 'exam_not_found';
  end if;
  if v_event.school_id is null then
    raise exception 'school_required';
  end if;
  if not public.can_manage_ielts_exam(v_event.id)
     or not public.can_create_ielts_exam(v_event.school_id) then
    raise exception 'forbidden';
  end if;
  if v_event.status <> 'scheduled' then
    raise exception 'invalid_launch_state';
  end if;
  if v_event.starts_at > v_now then
    raise exception 'exam_not_started';
  end if;
  if v_event.ends_at <= v_now then
    raise exception 'exam_window_expired';
  end if;
  if v_event.ends_at <= v_event.starts_at
     or v_event.duration_minutes <= 0
     or v_event.starts_at + make_interval(mins => v_event.duration_minutes) > v_event.ends_at then
    raise exception 'invalid_exam_window';
  end if;

  v_readiness := public.ielts_exam_assert_live_ready(
    v_event.id,
    v_event.school_id
  );
  v_active_form_id := (v_readiness ->> 'active_form_id')::uuid;
  v_assignment_count := (v_readiness ->> 'assignment_count')::bigint;

  perform set_config(
    'brainsheist.ielts_live_transition_exam_id',
    v_event.id::text,
    true
  );
  perform set_config(
    'brainsheist.ielts_live_transition_actor_id',
    auth.uid()::text,
    true
  );
  perform set_config(
    'brainsheist.ielts_live_transition_action',
    'launch',
    true
  );

  update public.ielts_exam_events e
  set status = 'live',
      updated_at = v_now
  where e.id = v_event.id
    and e.status = 'scheduled'
  returning e.* into v_event;

  if v_event.id is null then
    raise exception 'invalid_launch_state';
  end if;

  -- The trigger capability is single-use within this transaction. Clear every
  -- dimension immediately after the guarded state change so later SQL in the
  -- same transaction cannot replay it for another live transition.
  perform set_config('brainsheist.ielts_live_transition_exam_id', '', true);
  perform set_config('brainsheist.ielts_live_transition_actor_id', '', true);
  perform set_config('brainsheist.ielts_live_transition_action', '', true);

  insert into public.ielts_exam_audit_log (
    actor_id,
    exam_event_id,
    action,
    payload
  ) values (
    auth.uid(),
    p_exam_event_id,
    'launch_exam',
    jsonb_build_object(
      'previous_status', 'scheduled',
      'status', 'live',
      'school_id', v_event.school_id,
      'active_form_id', v_active_form_id,
      'assignment_count', v_assignment_count,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'confirmed', true,
      'reason', nullif(trim(coalesce(p_reason, '')), '')
    )
  );

  return jsonb_build_object(
    'exam_event_id', v_event.id,
    'previous_status', 'scheduled',
    'status', v_event.status,
    'active_form_id', v_active_form_id,
    'assignment_count', v_assignment_count,
    'server_now', v_now
  );
end;
$$;

-- Pausing is the only supported route into paused. Requiring live as the prior
-- state prevents draft -> paused -> resume from bypassing launch confirmation.
create or replace function public.rpc_ielts_pause_exam(
  p_exam_event_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_event public.ielts_exam_events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'reason_too_long';
  end if;

  select e.*
  into v_event
  from public.ielts_exam_events e
  where e.id = p_exam_event_id
  for update;

  if v_event.id is null then
    raise exception 'exam_not_found';
  end if;
  if v_event.school_id is null then
    raise exception 'school_required';
  end if;
  if not public.ielts_exam_actor_can_control(v_event.id, v_event.school_id) then
    raise exception 'forbidden';
  end if;
  if v_event.status <> 'live' then
    raise exception 'invalid_pause_state';
  end if;

  update public.ielts_exam_events e
  set status = 'paused',
      updated_at = v_now
  where e.id = v_event.id
    and e.status = 'live'
  returning e.* into v_event;

  if v_event.id is null then
    raise exception 'invalid_pause_state';
  end if;

  insert into public.ielts_exam_audit_log (
    actor_id,
    exam_event_id,
    action,
    payload
  ) values (
    auth.uid(),
    p_exam_event_id,
    'pause_exam',
    jsonb_build_object(
      'previous_status', 'live',
      'status', 'paused',
      'school_id', v_event.school_id,
      'reason', nullif(trim(coalesce(p_reason, '')), '')
    )
  );

  return jsonb_build_object(
    'exam_event_id', v_event.id,
    'previous_status', 'live',
    'status', v_event.status,
    'server_now', v_now
  );
end;
$$;

-- Keep the existing resume signature so the monitor UI remains compatible.
create or replace function public.rpc_ielts_resume_exam(
  p_exam_event_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_event public.ielts_exam_events%rowtype;
  v_readiness jsonb;
  v_active_form_id uuid;
  v_assignment_count bigint;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'reason_too_long';
  end if;

  select e.*
  into v_event
  from public.ielts_exam_events e
  where e.id = p_exam_event_id
  for update;

  if v_event.id is null then
    raise exception 'exam_not_found';
  end if;
  if v_event.school_id is null then
    raise exception 'school_required';
  end if;
  if not public.ielts_exam_actor_can_control(v_event.id, v_event.school_id) then
    raise exception 'forbidden';
  end if;
  if v_event.status <> 'paused' then
    raise exception 'invalid_resume_state';
  end if;
  if v_event.starts_at > v_now then
    raise exception 'exam_not_started';
  end if;
  if v_event.ends_at <= v_now then
    raise exception 'exam_window_expired';
  end if;
  if v_event.ends_at <= v_event.starts_at
     or v_event.duration_minutes <= 0
     or v_event.starts_at + make_interval(mins => v_event.duration_minutes) > v_event.ends_at then
    raise exception 'invalid_exam_window';
  end if;
  v_readiness := public.ielts_exam_assert_live_ready(
    v_event.id,
    v_event.school_id
  );
  v_active_form_id := (v_readiness ->> 'active_form_id')::uuid;
  v_assignment_count := (v_readiness ->> 'assignment_count')::bigint;

  perform set_config(
    'brainsheist.ielts_live_transition_exam_id',
    v_event.id::text,
    true
  );
  perform set_config(
    'brainsheist.ielts_live_transition_actor_id',
    auth.uid()::text,
    true
  );
  perform set_config(
    'brainsheist.ielts_live_transition_action',
    'resume',
    true
  );

  update public.ielts_exam_events e
  set status = 'live',
      updated_at = v_now
  where e.id = v_event.id
    and e.status = 'paused'
  returning e.* into v_event;

  if v_event.id is null then
    raise exception 'invalid_resume_state';
  end if;

  perform set_config('brainsheist.ielts_live_transition_exam_id', '', true);
  perform set_config('brainsheist.ielts_live_transition_actor_id', '', true);
  perform set_config('brainsheist.ielts_live_transition_action', '', true);

  insert into public.ielts_exam_audit_log (
    actor_id,
    exam_event_id,
    action,
    payload
  ) values (
    auth.uid(),
    p_exam_event_id,
    'resume_exam',
    jsonb_build_object(
      'previous_status', 'paused',
      'status', 'live',
      'school_id', v_event.school_id,
      'active_form_id', v_active_form_id,
      'assignment_count', v_assignment_count,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'reason', nullif(trim(coalesce(p_reason, '')), '')
    )
  );

  return jsonb_build_object(
    'exam_event_id', v_event.id,
    'previous_status', 'paused',
    'status', v_event.status,
    'active_form_id', v_active_form_id,
    'assignment_count', v_assignment_count,
    'server_now', v_now
  );
end;
$$;

-- Student bootstrap remains useful while an event is scheduled (it can show a
-- waiting state and server-authoritative times), but protected form content is
-- returned only after the confirmed launch transition. Unassigned/cross-school
-- callers receive no event metadata from this SECURITY DEFINER boundary.
create or replace function public.rpc_ielts_exam_whoami(p_exam_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_event public.ielts_exam_events%rowtype;
  v_assignment public.ielts_exam_assignments%rowtype;
  v_attempt public.ielts_exam_attempts%rowtype;
  v_form public.ielts_exam_forms%rowtype;
  v_student_school_id uuid;
  v_remaining int := 0;
  v_drafts jsonb := '[]'::jsonb;
  v_content_available boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'server_now', v_now
    );
  end if;

  select u.school_id
  into v_student_school_id
  from public.users u
  where u.id = auth.uid();

  select e.*
  into v_event
  from public.ielts_exam_events e
  where e.id = p_exam_event_id;

  if v_event.id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'exam_not_found',
      'server_now', v_now
    );
  end if;

  select a.*
  into v_assignment
  from public.ielts_exam_assignments a
  where a.exam_event_id = p_exam_event_id
    and a.student_id = auth.uid()
  limit 1;

  if v_assignment.id is null
     or v_event.school_id is null
     or v_assignment.school_id is distinct from v_event.school_id
     or v_student_school_id is distinct from v_event.school_id then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'not_assigned',
      'server_now', v_now
    );
  end if;

  select a.*
  into v_attempt
  from public.ielts_exam_attempts a
  where a.assignment_id = v_assignment.id;

  select f.*
  into v_form
  from public.ielts_exam_forms f
  where f.id = v_assignment.form_id
    and f.exam_event_id = v_event.id
    and f.is_active = true;

  -- A scheduled event never exposes content merely because its clock reached
  -- starts_at. New/not-started attempts require the confirmed live state and
  -- the event window. An already-running attempt may continue past the shared
  -- event end only when its own (manager-extended) timer is still active.
  -- Terminal assignment/attempt states and expired attempts always fail closed.
  v_content_available := v_form.id is not null
    and v_assignment.status in ('assigned', 'started')
    and (
      (
        v_event.status = 'live'
        and v_now >= v_event.starts_at
        and v_now < v_event.ends_at
        and (
          v_attempt.id is null
          or v_attempt.status = 'not_started'
        )
      )
      or (
        v_event.status in ('live', 'paused')
        and v_attempt.status = 'in_progress'
        and v_attempt.ends_at is not null
        and v_now < v_attempt.ends_at
      )
    );

  if v_attempt.id is not null and v_attempt.ends_at is not null then
    v_remaining := greatest(
      0,
      floor(extract(epoch from (v_attempt.ends_at - v_now)))::int
    );

    if v_content_available then
      select coalesce(jsonb_agg(jsonb_build_object(
        'section', d.section,
        'payload', d.payload,
        'draft_version', d.draft_version,
        'server_saved_at', d.server_saved_at,
        'client_saved_at', d.client_saved_at
      ) order by d.section), '[]'::jsonb)
      into v_drafts
      from public.ielts_exam_drafts d
      where d.attempt_id = v_attempt.id;
    end if;
  else
    v_remaining := greatest(
      0,
      floor(extract(epoch from (v_event.ends_at - v_now)))::int
    );
  end if;

  return jsonb_build_object(
    'allowed', v_content_available,
    'reason', case
      when v_assignment.status = 'void' then 'assignment_void'
      when v_event.status not in ('live', 'paused') then 'exam_not_available'
      when v_form.id is null then 'form_unavailable'
      when not v_content_available then 'exam_not_available'
      else 'ok'
    end,
    'exam_event_id', v_event.id,
    'assignment_id', v_assignment.id,
    'attempt_id', v_attempt.id,
    'status', coalesce(v_attempt.status, v_assignment.status),
    'attempt_status', coalesce(v_attempt.status, v_assignment.status),
    'event_status', v_event.status,
    'server_now', v_now,
    'starts_at', v_event.starts_at,
    'ends_at', coalesce(v_attempt.ends_at, v_event.ends_at),
    'remaining_seconds', v_remaining,
    'form_public_payload', case
      when not v_content_available then null
      else jsonb_build_object(
        'id', v_form.id,
        'form_code', v_form.form_code,
        'reading_payload', v_form.reading_payload,
        'listening_payload', v_form.listening_payload,
        'writing_payload', v_form.writing_payload,
        'speaking_payload', v_form.speaking_payload
      )
    end,
    'drafts', v_drafts
  );
end;
$$;

-- Attempt creation/resume is live-only. This is the authoritative boundary:
-- a scheduled event reaching starts_at does not become startable until an
-- administrator completes rpc_ielts_launch_exam. Existing in-progress attempts
-- still resume through this function after a paused event is returned to live,
-- including a manager-approved extension past the shared event end, but never
-- after their own timer expires or after reaching a terminal state.
create or replace function public.rpc_ielts_start_attempt(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_assignment public.ielts_exam_assignments%rowtype;
  v_event public.ielts_exam_events%rowtype;
  v_attempt public.ielts_exam_attempts%rowtype;
  v_student_school_id uuid;
  v_lock_token text;
  v_ends_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select u.school_id
  into v_student_school_id
  from public.users u
  where u.id = auth.uid();

  select a.*
  into v_assignment
  from public.ielts_exam_assignments a
  where a.id = p_assignment_id
  for update;

  if v_assignment.id is null then
    raise exception 'assignment_not_found';
  end if;
  if v_assignment.student_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  if v_assignment.status = 'void' then
    raise exception 'assignment_void';
  end if;
  if v_assignment.status not in ('assigned', 'started') then
    raise exception 'assignment_not_startable';
  end if;

  select e.*
  into v_event
  from public.ielts_exam_events e
  where e.id = v_assignment.exam_event_id;

  if v_event.id is null then
    raise exception 'exam_not_found';
  end if;
  if v_event.school_id is null
     or v_assignment.school_id is distinct from v_event.school_id
     or v_student_school_id is distinct from v_event.school_id then
    raise exception 'forbidden';
  end if;

  select a.*
  into v_attempt
  from public.ielts_exam_attempts a
  where a.assignment_id = p_assignment_id
  for update;

  if v_event.status <> 'live' then
    raise exception 'exam_not_startable';
  end if;

  if v_attempt.id is null or v_attempt.status = 'not_started' then
    if v_now < v_event.starts_at or v_now >= v_event.ends_at then
      raise exception 'outside_exam_window';
    end if;
  elsif v_attempt.status = 'in_progress' then
    if v_attempt.ends_at is null or v_now >= v_attempt.ends_at then
      raise exception 'attempt_expired';
    end if;
  else
    raise exception 'attempt_not_startable';
  end if;

  if not exists (
    select 1
    from public.ielts_exam_forms f
    where f.id = v_assignment.form_id
      and f.exam_event_id = v_event.id
      and f.is_active = true
  ) then
    raise exception 'form_unavailable';
  end if;

  if v_attempt.id is null then
    v_lock_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_ends_at := least(
      v_now + make_interval(mins => v_event.duration_minutes),
      v_event.ends_at
    );

    insert into public.ielts_exam_attempts (
      assignment_id,
      exam_event_id,
      student_id,
      form_id,
      status,
      started_at,
      ends_at,
      last_heartbeat_at,
      lock_token
    ) values (
      v_assignment.id,
      v_assignment.exam_event_id,
      v_assignment.student_id,
      v_assignment.form_id,
      'in_progress',
      v_now,
      v_ends_at,
      v_now,
      v_lock_token
    )
    returning * into v_attempt;

    update public.ielts_exam_assignments a
    set status = 'started'
    where a.id = v_assignment.id;
  elsif v_attempt.status = 'not_started' then
    v_lock_token := coalesce(
      v_attempt.lock_token,
      encode(extensions.gen_random_bytes(32), 'hex')
    );
    v_ends_at := least(
      v_now + make_interval(mins => v_event.duration_minutes),
      v_event.ends_at
    );

    update public.ielts_exam_attempts a
    set status = 'in_progress',
        started_at = coalesce(a.started_at, v_now),
        ends_at = coalesce(a.ends_at, v_ends_at),
        last_heartbeat_at = v_now,
        lock_token = v_lock_token,
        updated_at = v_now
    where a.id = v_attempt.id
    returning * into v_attempt;

    update public.ielts_exam_assignments a
    set status = 'started'
    where a.id = v_assignment.id;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'assignment_id', v_attempt.assignment_id,
    'exam_event_id', v_attempt.exam_event_id,
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'ends_at', v_attempt.ends_at,
    'server_now', v_now,
    'remaining_seconds', greatest(
      0,
      floor(extract(epoch from (v_attempt.ends_at - v_now)))::int
    ),
    'lock_token', v_attempt.lock_token
  );
end;
$$;

-- RLS still governs reads. All client-side event mutations now go through the
-- audited SECURITY DEFINER functions above.
revoke all privileges on table public.ielts_exam_events from anon, authenticated;
grant select on table public.ielts_exam_events to authenticated;

revoke all on function public.ielts_exam_assert_live_ready(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.ielts_exam_actor_can_control(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.ielts_exam_guard_live_status_transition()
  from public, anon, authenticated, service_role;

revoke all on function public.rpc_ielts_create_exam_event(
  text, text, timestamptz, timestamptz, int, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_create_exam_event(
  text, text, timestamptz, timestamptz, int, text, uuid
) to authenticated;

revoke all on function public.rpc_ielts_schedule_exam(
  uuid, timestamptz, timestamptz, int
) from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_schedule_exam(
  uuid, timestamptz, timestamptz, int
) to authenticated;

revoke all on function public.rpc_ielts_launch_exam(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_launch_exam(uuid, text, text)
  to authenticated;

revoke all on function public.rpc_ielts_pause_exam(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_pause_exam(uuid, text)
  to authenticated;

revoke all on function public.rpc_ielts_resume_exam(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_resume_exam(uuid, text)
  to authenticated;

revoke all on function public.rpc_ielts_exam_whoami(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_exam_whoami(uuid)
  to authenticated;

revoke all on function public.rpc_ielts_start_attempt(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_start_attempt(uuid)
  to authenticated;

comment on function public.rpc_ielts_create_exam_event(
  text, text, timestamptz, timestamptz, int, text, uuid
) is 'Creates a school-scoped IELTS event in draft or scheduled state. Live creation is rejected.';

comment on function public.rpc_ielts_schedule_exam(
  uuid, timestamptz, timestamptz, int
) is 'Moves a school-scoped draft IELTS event to scheduled with a validated window and immutable audit entry.';

comment on function public.rpc_ielts_launch_exam(uuid, text, text)
is 'Explicitly confirmed, school-scoped, readiness-validated scheduled-to-live transition with an immutable audit entry.';

comment on function public.rpc_ielts_pause_exam(uuid, text)
is 'Pauses only a live IELTS event through a school-scoped emergency control and audits the transition.';

comment on function public.rpc_ielts_resume_exam(uuid, text)
is 'Resumes only a paused IELTS event after school, schedule, form, and assignment validation; audits the transition.';

comment on function public.rpc_ielts_exam_whoami(uuid)
is 'Student bootstrap scoped to the authenticated assignment and school. Scheduled events expose waiting metadata only; form content is live/paused-only.';

comment on function public.rpc_ielts_start_attempt(uuid)
is 'Starts or resumes the authenticated student assignment only while its school-scoped event is explicitly live and inside its configured window.';
