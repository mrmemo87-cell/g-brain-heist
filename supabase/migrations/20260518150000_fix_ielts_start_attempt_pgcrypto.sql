-- Repair IELTS Exam Mode start attempt token generation when pgcrypto is installed
-- outside the SECURITY DEFINER search_path.
--
-- Forward-only repair: do not change behavior beyond schema-qualifying pgcrypto.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.rpc_ielts_start_attempt(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_assignment public.ielts_exam_assignments%rowtype;
  v_event public.ielts_exam_events%rowtype;
  v_attempt public.ielts_exam_attempts%rowtype;
  v_lock_token text;
  v_ends_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_assignment from public.ielts_exam_assignments where id = p_assignment_id for update;
  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if v_assignment.student_id <> auth.uid() then raise exception 'forbidden'; end if;
  if v_assignment.status = 'void' then raise exception 'assignment_void'; end if;

  select * into v_event from public.ielts_exam_events where id = v_assignment.exam_event_id;
  if v_event.status not in ('scheduled', 'live') then raise exception 'exam_not_startable'; end if;
  if v_now < v_event.starts_at or v_now >= v_event.ends_at then raise exception 'outside_exam_window'; end if;

  select * into v_attempt from public.ielts_exam_attempts where assignment_id = p_assignment_id for update;
  if v_attempt.id is null then
    v_lock_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_ends_at := least(v_now + make_interval(mins => v_event.duration_minutes), v_event.ends_at);

    insert into public.ielts_exam_attempts (
      assignment_id, exam_event_id, student_id, form_id, status, started_at, ends_at,
      last_heartbeat_at, lock_token
    ) values (
      v_assignment.id, v_assignment.exam_event_id, v_assignment.student_id, v_assignment.form_id,
      'in_progress', v_now, v_ends_at, v_now, v_lock_token
    ) returning * into v_attempt;

    update public.ielts_exam_assignments set status = 'started' where id = v_assignment.id;
  elsif v_attempt.status = 'not_started' then
    v_lock_token := coalesce(v_attempt.lock_token, encode(extensions.gen_random_bytes(32), 'hex'));
    v_ends_at := least(v_now + make_interval(mins => v_event.duration_minutes), v_event.ends_at);
    update public.ielts_exam_attempts
    set status = 'in_progress', started_at = coalesce(started_at, v_now), ends_at = coalesce(ends_at, v_ends_at),
        last_heartbeat_at = v_now, lock_token = v_lock_token, updated_at = v_now
    where id = v_attempt.id
    returning * into v_attempt;
    update public.ielts_exam_assignments set status = 'started' where id = v_assignment.id;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'assignment_id', v_attempt.assignment_id,
    'exam_event_id', v_attempt.exam_event_id,
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'ends_at', v_attempt.ends_at,
    'server_now', v_now,
    'remaining_seconds', greatest(0, floor(extract(epoch from (v_attempt.ends_at - v_now)))::int),
    'lock_token', v_attempt.lock_token
  );
end;
$$;

