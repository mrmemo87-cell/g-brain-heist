-- Harden IELTS Exam Mode live state sync for student screens.
-- Adds explicit event_status and attempt_status fields so polling can detect
-- monitor pause/resume separately from the attempt lifecycle.

create or replace function public.rpc_ielts_exam_whoami(p_exam_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_event public.ielts_exam_events%rowtype;
  v_assignment public.ielts_exam_assignments%rowtype;
  v_attempt public.ielts_exam_attempts%rowtype;
  v_form public.ielts_exam_forms%rowtype;
  v_remaining int := 0;
  v_drafts jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('allowed', false, 'reason', 'not_authenticated', 'server_now', v_now);
  end if;

  select * into v_event from public.ielts_exam_events where id = p_exam_event_id;
  if v_event.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'exam_not_found', 'server_now', v_now);
  end if;

  select * into v_assignment
  from public.ielts_exam_assignments
  where exam_event_id = p_exam_event_id and student_id = auth.uid()
  limit 1;

  if v_assignment.id is null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'not_assigned',
      'exam_event_id', p_exam_event_id,
      'event_status', v_event.status,
      'attempt_status', null,
      'server_now', v_now,
      'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at,
      'remaining_seconds', 0
    );
  end if;

  select * into v_attempt from public.ielts_exam_attempts where assignment_id = v_assignment.id;
  select * into v_form from public.ielts_exam_forms where id = v_assignment.form_id and is_active = true;

  if v_attempt.id is not null and v_attempt.ends_at is not null then
    v_remaining := greatest(0, floor(extract(epoch from (v_attempt.ends_at - v_now)))::int);
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
  else
    v_remaining := greatest(0, floor(extract(epoch from (v_event.ends_at - v_now)))::int);
  end if;

  return jsonb_build_object(
    'allowed', v_event.status in ('scheduled', 'live', 'paused') and v_assignment.status <> 'void' and v_form.id is not null,
    'reason', case
      when v_assignment.status = 'void' then 'assignment_void'
      when v_form.id is null then 'form_unavailable'
      when v_event.status not in ('scheduled', 'live', 'paused') then 'exam_not_available'
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
    'form_public_payload', case when v_form.id is null then null else jsonb_build_object(
      'id', v_form.id,
      'form_code', v_form.form_code,
      'reading_payload', v_form.reading_payload,
      'listening_payload', v_form.listening_payload,
      'writing_payload', v_form.writing_payload,
      'speaking_payload', v_form.speaking_payload
    ) end,
    'drafts', v_drafts
  );
end;
$$;
