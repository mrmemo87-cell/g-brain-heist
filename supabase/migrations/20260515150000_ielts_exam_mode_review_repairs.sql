-- Forward-only repair migration for environments where the original IELTS Exam Mode
-- migrations were already applied before review fixes were added in source control.
--
-- Do not recreate tables or drop data here. These CREATE OR REPLACE FUNCTION
-- statements only repair function behavior in-place:
-- 1. Expired autosaves always fail, even while an exam event is paused.
-- 2. Active form creation serializes deactivation/upsert by locking the parent event row.
-- 3. Monitor-only admin detail responses omit protected answer_key values.

create or replace function public.rpc_ielts_autosave_attempt(
  p_attempt_id uuid,
  p_lock_token text,
  p_section text,
  p_payload jsonb,
  p_draft_version int,
  p_client_saved_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_attempt public.ielts_exam_attempts%rowtype;
  v_draft public.ielts_exam_drafts%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if nullif(trim(coalesce(p_section, '')), '') is null then raise exception 'section_required'; end if;

  select a.*
  into v_attempt
  from public.ielts_exam_attempts a
  where a.id = p_attempt_id
  for update;

  if v_attempt.id is null then raise exception 'attempt_not_found'; end if;
  if v_attempt.student_id <> auth.uid() then raise exception 'forbidden'; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'attempt_not_in_progress'; end if;
  if v_attempt.lock_token is null or v_attempt.lock_token <> p_lock_token then raise exception 'invalid_lock_token'; end if;
  if v_now > v_attempt.ends_at then raise exception 'attempt_time_expired'; end if;

  insert into public.ielts_exam_drafts (attempt_id, student_id, section, payload, draft_version, client_saved_at, server_saved_at)
  values (v_attempt.id, v_attempt.student_id, p_section, coalesce(p_payload, '{}'::jsonb), p_draft_version, p_client_saved_at, v_now)
  on conflict (attempt_id, section) do update
    set payload = excluded.payload,
        draft_version = greatest(public.ielts_exam_drafts.draft_version, excluded.draft_version),
        client_saved_at = excluded.client_saved_at,
        server_saved_at = excluded.server_saved_at
  returning * into v_draft;

  update public.ielts_exam_attempts
  set last_heartbeat_at = v_now, updated_at = v_now
  where id = v_attempt.id;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'section', v_draft.section,
    'draft_version', v_draft.draft_version,
    'server_saved_at', v_draft.server_saved_at,
    'server_now', v_now
  );
end;
$$;

create or replace function public.rpc_ielts_create_exam_form(
  p_exam_event_id uuid,
  p_form_code text,
  p_reading_payload jsonb,
  p_listening_payload jsonb,
  p_writing_payload jsonb,
  p_answer_key jsonb,
  p_speaking_payload jsonb default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.ielts_exam_forms%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_ielts_exam(p_exam_event_id) then raise exception 'forbidden'; end if;
  if nullif(trim(coalesce(p_form_code, '')), '') is null then raise exception 'form_code_required'; end if;
  if public.ielts_jsonb_contains_answer_key(p_reading_payload)
     or public.ielts_jsonb_contains_answer_key(p_listening_payload)
     or public.ielts_jsonb_contains_answer_key(p_writing_payload)
     or public.ielts_jsonb_contains_answer_key(p_speaking_payload) then
    raise exception 'public_payload_contains_answer_key';
  end if;

  perform 1
  from public.ielts_exam_events
  where id = p_exam_event_id
  for update;

  if coalesce(p_is_active, true) then
    update public.ielts_exam_forms
    set is_active = false
    where exam_event_id = p_exam_event_id;
  end if;

  insert into public.ielts_exam_forms (
    exam_event_id, form_code, reading_payload, listening_payload, writing_payload,
    speaking_payload, answer_key, is_active
  ) values (
    p_exam_event_id, trim(p_form_code), coalesce(p_reading_payload, '{}'::jsonb),
    coalesce(p_listening_payload, '{}'::jsonb), coalesce(p_writing_payload, '{}'::jsonb),
    p_speaking_payload, coalesce(p_answer_key, '{}'::jsonb), coalesce(p_is_active, true)
  )
  on conflict (exam_event_id, form_code) do update
    set reading_payload = excluded.reading_payload,
        listening_payload = excluded.listening_payload,
        writing_payload = excluded.writing_payload,
        speaking_payload = excluded.speaking_payload,
        answer_key = excluded.answer_key,
        is_active = excluded.is_active
  returning * into v_form;

  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, action, payload)
  values (auth.uid(), p_exam_event_id, 'create_exam_form', jsonb_build_object('form_id', v_form.id, 'form_code', v_form.form_code, 'is_active', v_form.is_active));

  return to_jsonb(v_form);
end;
$$;

create or replace function public.rpc_ielts_get_exam_admin_detail(p_exam_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ielts_exam_events%rowtype;
  v_classes jsonb := '[]'::jsonb;
  v_students jsonb := '[]'::jsonb;
  v_forms jsonb := '[]'::jsonb;
  v_assignments jsonb := '[]'::jsonb;
  v_is_manager boolean := false;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_event from public.ielts_exam_events where id = p_exam_event_id;
  if v_event.id is null then raise exception 'exam_not_found'; end if;
  v_is_manager := public.can_manage_ielts_exam(p_exam_event_id);
  if not v_is_manager and not public.can_monitor_ielts_exam(p_exam_event_id) then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(
    case when v_is_manager then to_jsonb(f) else to_jsonb(f) - 'answer_key' end
    order by f.created_at desc
  ), '[]'::jsonb)
  into v_forms
  from public.ielts_exam_forms f
  where f.exam_event_id = p_exam_event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'school_id', c.school_id,
    'class_code', c.class_code,
    'class_name', c.class_name,
    'grade_level', c.grade_level,
    'is_active', c.is_active
  ) order by c.class_name), '[]'::jsonb)
  into v_classes
  from public.classes c
  where c.school_id = v_event.school_id
    and coalesce(c.is_active, true) = true
    and (
      public.can_manage_ielts_exam(p_exam_event_id)
      or exists (
        select 1 from public.class_teacher_assignments cta
        where cta.class_id = c.id and cta.teacher_user_id = auth.uid() and coalesce(cta.active, true) = true
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', u.id,
    'username', u.username,
    'email', u.email,
    'class_id', cs.class_id,
    'class_name', c.class_name,
    'grade', u.grade,
    'batch', u.batch
  ) order by c.class_name, u.username), '[]'::jsonb)
  into v_students
  from public.users u
  left join public.class_students cs on cs.student_id = u.id
  left join public.classes c on c.id = cs.class_id
  where u.school_id = v_event.school_id
    and coalesce(u.role, 'student') = 'student'
    and (
      public.can_manage_ielts_exam(p_exam_event_id)
      or exists (
        select 1 from public.class_teacher_assignments cta
        where cta.class_id = cs.class_id and cta.teacher_user_id = auth.uid() and coalesce(cta.active, true) = true
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'student_id', a.student_id,
    'username', u.username,
    'class_id', a.class_id,
    'class_name', c.class_name,
    'form_id', a.form_id,
    'status', a.status,
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  into v_assignments
  from public.ielts_exam_assignments a
  join public.users u on u.id = a.student_id
  left join public.classes c on c.id = a.class_id
  where a.exam_event_id = p_exam_event_id;

  return jsonb_build_object(
    'exam', to_jsonb(v_event),
    'forms', v_forms,
    'classes', v_classes,
    'students', v_students,
    'assignments', v_assignments
  );
end;
$$;
