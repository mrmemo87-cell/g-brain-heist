-- Compact live delivery metadata; never selects form or draft payloads.
set lock_timeout='3s';
create index if not exists idx_ielts_assignments_student_event_latest
on public.ielts_exam_assignments(student_id,exam_event_id,created_at desc,id desc);

CREATE OR REPLACE FUNCTION public.rpc_ielts_exam_status(p_exam_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := now();
  v_event public.ielts_exam_events%rowtype;
  v_assignment public.ielts_exam_assignments%rowtype;
  v_attempt public.ielts_exam_attempts%rowtype;
  v_form_available boolean := false;
  v_student_school_id uuid;
  v_remaining int := 0;
  v_content_available boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'server_now', v_now
    );
  end if;

  if not exists(select 1 from public.ielts_exam_assignments a where a.exam_event_id=p_exam_event_id and private.ielts_self_screener_assignment(a.id))
    and not private.actor_can_access_school_programme(private.ielts_exam_event_school(p_exam_event_id),'ielts',false) then
    return jsonb_build_object('allowed',false,'reason','ielts_not_in_school_agreement','server_now',v_now);
  end if;
  perform private.finalize_expired_ielts_screener(p_exam_event_id);

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
  order by a.created_at desc, a.id desc
  limit 1;

  if v_assignment.id is null or (not private.ielts_self_screener_assignment(v_assignment.id) and (
     v_event.school_id is null
     or v_assignment.school_id is distinct from v_event.school_id
     or v_student_school_id is distinct from v_event.school_id)) then
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

  select exists(select 1
  from public.ielts_exam_forms f
  where f.id = v_assignment.form_id
    and f.exam_event_id = v_event.id
    and f.is_active = true) into v_form_available;

  -- A scheduled event never exposes content merely because its clock reached
  -- starts_at. New/not-started attempts require the confirmed live state and
  -- the event window. An already-running attempt may continue past the shared
  -- event end only when its own (manager-extended) timer is still active.
  -- Terminal assignment/attempt states and expired attempts always fail closed.
  v_content_available := (v_assignment.delivery_kind<>'self_service' or private.ielts_screener_release_eligible(v_event.id))
    and v_form_available
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

  else
    v_remaining := greatest(
      0,
      floor(extract(epoch from (v_event.ends_at - v_now)))::int
    );
  end if;

  -- Preserve teacher presence without writing unchanged draft payloads.
  -- A heartbeat is at most once per 30 seconds, scoped to this authorized attempt.
  if v_content_available and v_event.status='live' and v_attempt.status='in_progress' then
    update public.ielts_exam_attempts set last_heartbeat_at=v_now
    where id=v_attempt.id and student_id=auth.uid() and status='in_progress'
      and (last_heartbeat_at is null or last_heartbeat_at < v_now-interval '30 seconds');
  end if;

  return jsonb_build_object(
    'allowed', v_content_available,
    'reason', case
      when v_assignment.status = 'void' then 'assignment_void'
      when v_event.status not in ('live', 'paused') then 'exam_not_available'
      when not v_form_available then 'form_unavailable'
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
    'remaining_seconds', v_remaining
  );
end;
$function$;

revoke all on function public.rpc_ielts_exam_status(uuid) from public,anon;
grant execute on function public.rpc_ielts_exam_status(uuid) to authenticated;
reset lock_timeout;

