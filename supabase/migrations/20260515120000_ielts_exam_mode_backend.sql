-- Controlled IELTS Exam Mode backend foundation.
--
-- Security model:
-- - IELTS practice-mode tables are untouched. These tables live beside the existing IELTS schema.
-- - Students should interact with exam mode through SECURITY DEFINER RPCs only.
-- - Answer keys are stored only in ielts_exam_forms.answer_key. No student SELECT policy is
--   created for ielts_exam_forms, and student-facing RPCs build a public form payload that
--   deliberately omits answer_key.
-- - Timers are server-authoritative: attempts get server started_at/ends_at values and all
--   autosave/submit paths compare now() against ielts_exam_attempts.ends_at.
-- - Emergency controls are scoped through can_manage_ielts_exam()/can_monitor_ielts_exam()
--   and append immutable audit rows for operational traceability.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid();
$$;

create table if not exists public.superadmins (
  user_id uuid primary key references public.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references public.users(id) on delete set null
);

create or replace function public.is_superadmin(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.superadmins sa
    where sa.user_id = coalesce(p_user_id, auth.uid())
  )
  or exists (
    select 1
    from public.users u
    where u.id = coalesce(p_user_id, auth.uid())
      and coalesce(u.is_admin, false) = true
  );
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists public.ielts_exam_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'paused', 'closed', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes int not null check (duration_minutes > 0),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.ielts_exam_forms (
  id uuid primary key default gen_random_uuid(),
  exam_event_id uuid not null references public.ielts_exam_events(id) on delete cascade,
  form_code text not null,
  reading_payload jsonb not null default '{}'::jsonb,
  listening_payload jsonb not null default '{}'::jsonb,
  writing_payload jsonb not null default '{}'::jsonb,
  speaking_payload jsonb,
  answer_key jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (exam_event_id, form_code)
);

create table if not exists public.ielts_exam_assignments (
  id uuid primary key default gen_random_uuid(),
  exam_event_id uuid not null references public.ielts_exam_events(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  form_id uuid not null references public.ielts_exam_forms(id) on delete restrict,
  status text not null default 'assigned' check (status in ('assigned', 'started', 'submitted', 'auto_submitted', 'void')),
  created_at timestamptz not null default now(),
  unique (exam_event_id, student_id)
);

create table if not exists public.ielts_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.ielts_exam_assignments(id) on delete cascade,
  exam_event_id uuid not null references public.ielts_exam_events(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  form_id uuid not null references public.ielts_exam_forms(id) on delete restrict,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'submitted', 'auto_submitted', 'locked', 'void')),
  started_at timestamptz,
  ends_at timestamptz,
  submitted_at timestamptz,
  last_heartbeat_at timestamptz,
  lock_token text,
  active_section text,
  current_question_index int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ielts_exam_drafts (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.ielts_exam_attempts(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  section text not null,
  payload jsonb not null default '{}'::jsonb,
  draft_version int not null default 1,
  client_saved_at timestamptz,
  server_saved_at timestamptz not null default now(),
  unique (attempt_id, section)
);

create table if not exists public.ielts_exam_incidents (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.ielts_exam_attempts(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  incident_type text not null,
  severity text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ielts_exam_submissions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.ielts_exam_attempts(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  submitted_at timestamptz not null default now(),
  grading_status text not null default 'pending',
  grading_result jsonb
);

create table if not exists public.ielts_exam_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  exam_event_id uuid references public.ielts_exam_events(id) on delete set null,
  attempt_id uuid references public.ielts_exam_attempts(id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Scale indexes
-- -----------------------------------------------------------------------------

create index if not exists idx_ielts_exam_events_school_id on public.ielts_exam_events(school_id);
create index if not exists idx_ielts_exam_events_status on public.ielts_exam_events(status);
create index if not exists idx_ielts_exam_events_starts_ends on public.ielts_exam_events(starts_at, ends_at);

create index if not exists idx_ielts_exam_forms_exam_event_id on public.ielts_exam_forms(exam_event_id);
create index if not exists idx_ielts_exam_forms_is_active on public.ielts_exam_forms(is_active);

create index if not exists idx_ielts_exam_assignments_exam_event_id on public.ielts_exam_assignments(exam_event_id);
create index if not exists idx_ielts_exam_assignments_student_id on public.ielts_exam_assignments(student_id);
create index if not exists idx_ielts_exam_assignments_school_id on public.ielts_exam_assignments(school_id);
create index if not exists idx_ielts_exam_assignments_class_id on public.ielts_exam_assignments(class_id);
create index if not exists idx_ielts_exam_assignments_form_id on public.ielts_exam_assignments(form_id);
create index if not exists idx_ielts_exam_assignments_status on public.ielts_exam_assignments(status);

create index if not exists idx_ielts_exam_attempts_exam_event_id on public.ielts_exam_attempts(exam_event_id);
create index if not exists idx_ielts_exam_attempts_student_id on public.ielts_exam_attempts(student_id);
create index if not exists idx_ielts_exam_attempts_form_id on public.ielts_exam_attempts(form_id);
create index if not exists idx_ielts_exam_attempts_status on public.ielts_exam_attempts(status);
create index if not exists idx_ielts_exam_attempts_last_heartbeat_at on public.ielts_exam_attempts(last_heartbeat_at);
create index if not exists idx_ielts_exam_attempts_submitted_at on public.ielts_exam_attempts(submitted_at);

create index if not exists idx_ielts_exam_drafts_attempt_id on public.ielts_exam_drafts(attempt_id);
create index if not exists idx_ielts_exam_drafts_student_id on public.ielts_exam_drafts(student_id);
create index if not exists idx_ielts_exam_drafts_server_saved_at on public.ielts_exam_drafts(server_saved_at);

create index if not exists idx_ielts_exam_incidents_attempt_id on public.ielts_exam_incidents(attempt_id);
create index if not exists idx_ielts_exam_incidents_student_id on public.ielts_exam_incidents(student_id);
create index if not exists idx_ielts_exam_incidents_created_at on public.ielts_exam_incidents(created_at);

create index if not exists idx_ielts_exam_submissions_attempt_id on public.ielts_exam_submissions(attempt_id);
create index if not exists idx_ielts_exam_submissions_student_id on public.ielts_exam_submissions(student_id);
create index if not exists idx_ielts_exam_submissions_submitted_at on public.ielts_exam_submissions(submitted_at);
create index if not exists idx_ielts_exam_submissions_grading_status on public.ielts_exam_submissions(grading_status);

create index if not exists idx_ielts_exam_audit_log_actor_id on public.ielts_exam_audit_log(actor_id);
create index if not exists idx_ielts_exam_audit_log_exam_event_id on public.ielts_exam_audit_log(exam_event_id);
create index if not exists idx_ielts_exam_audit_log_attempt_id on public.ielts_exam_audit_log(attempt_id);
create index if not exists idx_ielts_exam_audit_log_created_at on public.ielts_exam_audit_log(created_at);

-- -----------------------------------------------------------------------------
-- Management helpers that depend on exam tables
-- -----------------------------------------------------------------------------

create or replace function public.can_manage_ielts_exam(p_exam_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.ielts_exam_events e
      where e.id = p_exam_event_id
        and e.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.ielts_exam_events e
      join public.school_members sm on sm.school_id = e.school_id
      where e.id = p_exam_event_id
        and e.school_id is not null
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role_in_school = 'school_admin'
    );
$$;

create or replace function public.can_monitor_ielts_exam(p_exam_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_ielts_exam(p_exam_event_id)
    or exists (
      select 1
      from public.ielts_exam_assignments a
      join public.class_teacher_assignments cta on cta.class_id = a.class_id
      where a.exam_event_id = p_exam_event_id
        and a.class_id is not null
        and cta.teacher_user_id = auth.uid()
        and coalesce(cta.active, true) = true
    );
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.ielts_exam_events enable row level security;
alter table public.ielts_exam_forms enable row level security;
alter table public.ielts_exam_assignments enable row level security;
alter table public.ielts_exam_attempts enable row level security;
alter table public.ielts_exam_drafts enable row level security;
alter table public.ielts_exam_incidents enable row level security;
alter table public.ielts_exam_submissions enable row level security;
alter table public.ielts_exam_audit_log enable row level security;

-- Avoid inherited broad grants; RPCs are the intended student access surface.
revoke all on public.ielts_exam_forms from anon, authenticated;
revoke all on public.ielts_exam_audit_log from anon, authenticated;

drop policy if exists ielts_exam_events_select_monitor on public.ielts_exam_events;
create policy ielts_exam_events_select_monitor
  on public.ielts_exam_events for select to authenticated
  using (public.can_monitor_ielts_exam(id));

drop policy if exists ielts_exam_events_manage on public.ielts_exam_events;
create policy ielts_exam_events_manage
  on public.ielts_exam_events for all to authenticated
  using (public.can_manage_ielts_exam(id))
  with check (
    public.is_superadmin(auth.uid())
    or created_by = auth.uid()
    or exists (
      select 1 from public.school_members sm
      where sm.school_id = ielts_exam_events.school_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role_in_school = 'school_admin'
    )
  );

-- Only exam managers can directly read forms; students receive public form JSON via RPC.
drop policy if exists ielts_exam_forms_select_managers on public.ielts_exam_forms;
create policy ielts_exam_forms_select_managers
  on public.ielts_exam_forms for select to authenticated
  using (public.can_manage_ielts_exam(exam_event_id));

drop policy if exists ielts_exam_forms_manage on public.ielts_exam_forms;
create policy ielts_exam_forms_manage
  on public.ielts_exam_forms for all to authenticated
  using (public.can_manage_ielts_exam(exam_event_id))
  with check (public.can_manage_ielts_exam(exam_event_id));

drop policy if exists ielts_exam_assignments_select_owner_or_monitor on public.ielts_exam_assignments;
create policy ielts_exam_assignments_select_owner_or_monitor
  on public.ielts_exam_assignments for select to authenticated
  using (student_id = auth.uid() or public.can_monitor_ielts_exam(exam_event_id));

drop policy if exists ielts_exam_assignments_manage on public.ielts_exam_assignments;
create policy ielts_exam_assignments_manage
  on public.ielts_exam_assignments for all to authenticated
  using (public.can_manage_ielts_exam(exam_event_id))
  with check (public.can_manage_ielts_exam(exam_event_id));

drop policy if exists ielts_exam_attempts_select_owner_or_monitor on public.ielts_exam_attempts;
create policy ielts_exam_attempts_select_owner_or_monitor
  on public.ielts_exam_attempts for select to authenticated
  using (student_id = auth.uid() or public.can_monitor_ielts_exam(exam_event_id));

drop policy if exists ielts_exam_drafts_select_owner_or_monitor on public.ielts_exam_drafts;
create policy ielts_exam_drafts_select_owner_or_monitor
  on public.ielts_exam_drafts for select to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.ielts_exam_attempts a
      where a.id = ielts_exam_drafts.attempt_id
        and public.can_monitor_ielts_exam(a.exam_event_id)
    )
  );

drop policy if exists ielts_exam_incidents_select_owner_or_monitor on public.ielts_exam_incidents;
create policy ielts_exam_incidents_select_owner_or_monitor
  on public.ielts_exam_incidents for select to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.ielts_exam_attempts a
      where a.id = ielts_exam_incidents.attempt_id
        and public.can_monitor_ielts_exam(a.exam_event_id)
    )
  );

drop policy if exists ielts_exam_submissions_select_owner_or_monitor on public.ielts_exam_submissions;
create policy ielts_exam_submissions_select_owner_or_monitor
  on public.ielts_exam_submissions for select to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.ielts_exam_attempts a
      where a.id = ielts_exam_submissions.attempt_id
        and public.can_monitor_ielts_exam(a.exam_event_id)
    )
  );

drop policy if exists ielts_exam_audit_log_select_managers on public.ielts_exam_audit_log;
create policy ielts_exam_audit_log_select_managers
  on public.ielts_exam_audit_log for select to authenticated
  using (
    public.is_superadmin(auth.uid())
    or (exam_event_id is not null and public.can_manage_ielts_exam(exam_event_id))
    or (attempt_id is not null and exists (
      select 1 from public.ielts_exam_attempts a
      where a.id = ielts_exam_audit_log.attempt_id
        and public.can_manage_ielts_exam(a.exam_event_id)
    ))
  );

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

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
    ) end
  );
end;
$$;

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
    v_lock_token := encode(gen_random_bytes(32), 'hex');
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
    v_lock_token := coalesce(v_attempt.lock_token, encode(gen_random_bytes(32), 'hex'));
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

create or replace function public.rpc_ielts_submit_attempt(
  p_attempt_id uuid,
  p_lock_token text,
  p_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_attempt public.ielts_exam_attempts%rowtype;
  v_submission public.ielts_exam_submissions%rowtype;
  v_status text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then raise exception 'idempotency_key_required'; end if;

  select * into v_attempt from public.ielts_exam_attempts where id = p_attempt_id for update;
  if v_attempt.id is null then raise exception 'attempt_not_found'; end if;
  if v_attempt.student_id <> auth.uid() then raise exception 'forbidden'; end if;
  if v_attempt.lock_token is null or v_attempt.lock_token <> p_lock_token then raise exception 'invalid_lock_token'; end if;

  select * into v_submission from public.ielts_exam_submissions where attempt_id = p_attempt_id;
  if v_submission.id is not null then
    if v_submission.idempotency_key = p_idempotency_key then
      return jsonb_build_object('submission_id', v_submission.id, 'attempt_id', p_attempt_id, 'status', v_attempt.status, 'submitted_at', v_submission.submitted_at, 'idempotent_replay', true);
    end if;
    raise exception 'attempt_already_submitted';
  end if;

  if v_attempt.status not in ('in_progress', 'locked') then
    raise exception 'attempt_not_submittable';
  end if;

  v_status := case when v_attempt.ends_at is not null and v_now > v_attempt.ends_at then 'auto_submitted' else 'submitted' end;

  insert into public.ielts_exam_submissions (attempt_id, student_id, payload, idempotency_key, submitted_at)
  values (v_attempt.id, v_attempt.student_id, coalesce(p_payload, '{}'::jsonb), p_idempotency_key, v_now)
  returning * into v_submission;

  update public.ielts_exam_attempts
  set status = v_status, submitted_at = v_now, last_heartbeat_at = v_now, updated_at = v_now
  where id = v_attempt.id;

  update public.ielts_exam_assignments
  set status = v_status
  where id = v_attempt.assignment_id;

  return jsonb_build_object(
    'submission_id', v_submission.id,
    'attempt_id', v_attempt.id,
    'status', v_status,
    'submitted_at', v_submission.submitted_at,
    'grading_status', v_submission.grading_status,
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.rpc_ielts_exam_monitoring(p_exam_event_id uuid)
returns table (
  student_id uuid,
  name text,
  username text,
  class_id uuid,
  class_name text,
  status text,
  started_at timestamptz,
  ends_at timestamptz,
  remaining_seconds int,
  last_heartbeat_at timestamptz,
  last_save_age_seconds int,
  incident_count bigint,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_monitor_ielts_exam(p_exam_event_id) then raise exception 'forbidden'; end if;

  return query
  select
    u.id as student_id,
    u.username::text as name,
    u.username::text as username,
    c.id as class_id,
    c.class_name::text as class_name,
    coalesce(a.status, ass.status)::text as status,
    a.started_at,
    a.ends_at,
    case when a.ends_at is null then null else greatest(0, floor(extract(epoch from (a.ends_at - now())))::int) end as remaining_seconds,
    a.last_heartbeat_at,
    case when d.last_save_at is null then null else greatest(0, floor(extract(epoch from (now() - d.last_save_at)))::int) end as last_save_age_seconds,
    coalesce(i.incident_count, 0)::bigint as incident_count,
    coalesce(a.submitted_at, s.submitted_at) as submitted_at
  from public.ielts_exam_assignments ass
  join public.users u on u.id = ass.student_id
  left join public.classes c on c.id = ass.class_id
  left join public.ielts_exam_attempts a on a.assignment_id = ass.id
  left join public.ielts_exam_submissions s on s.attempt_id = a.id
  left join lateral (
    select max(server_saved_at) as last_save_at
    from public.ielts_exam_drafts d
    where d.attempt_id = a.id
  ) d on true
  left join lateral (
    select count(*) as incident_count
    from public.ielts_exam_incidents inc
    where inc.attempt_id = a.id
  ) i on true
  where ass.exam_event_id = p_exam_event_id
  order by c.class_name nulls last, u.username;
end;
$$;

create or replace function public.rpc_ielts_log_incident(
  p_attempt_id uuid,
  p_lock_token text,
  p_incident_type text,
  p_severity text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ielts_exam_attempts%rowtype;
  v_incident public.ielts_exam_incidents%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_attempt from public.ielts_exam_attempts where id = p_attempt_id;
  if v_attempt.id is null then raise exception 'attempt_not_found'; end if;
  if v_attempt.student_id <> auth.uid() then raise exception 'forbidden'; end if;
  if v_attempt.lock_token is null or v_attempt.lock_token <> p_lock_token then raise exception 'invalid_lock_token'; end if;

  insert into public.ielts_exam_incidents (attempt_id, student_id, incident_type, severity, payload)
  values (v_attempt.id, v_attempt.student_id, p_incident_type, p_severity, coalesce(p_payload, '{}'::jsonb))
  returning * into v_incident;

  update public.ielts_exam_attempts
  set last_heartbeat_at = now(), updated_at = now()
  where id = v_attempt.id;

  return jsonb_build_object('incident_id', v_incident.id, 'created_at', v_incident.created_at);
end;
$$;

create or replace function public.rpc_ielts_pause_exam(p_exam_event_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_event public.ielts_exam_events%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_monitor_ielts_exam(p_exam_event_id) then raise exception 'forbidden'; end if;
  update public.ielts_exam_events set status = 'paused', updated_at = now() where id = p_exam_event_id returning * into v_event;
  if v_event.id is null then raise exception 'exam_not_found'; end if;
  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, action, payload)
  values (auth.uid(), p_exam_event_id, 'pause_exam', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('exam_event_id', p_exam_event_id, 'status', v_event.status, 'server_now', now());
end;
$$;

create or replace function public.rpc_ielts_resume_exam(p_exam_event_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_event public.ielts_exam_events%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_monitor_ielts_exam(p_exam_event_id) then raise exception 'forbidden'; end if;
  update public.ielts_exam_events set status = 'live', updated_at = now() where id = p_exam_event_id returning * into v_event;
  if v_event.id is null then raise exception 'exam_not_found'; end if;
  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, action, payload)
  values (auth.uid(), p_exam_event_id, 'resume_exam', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('exam_event_id', p_exam_event_id, 'status', v_event.status, 'server_now', now());
end;
$$;

create or replace function public.rpc_ielts_extend_attempt(p_attempt_id uuid, p_extra_minutes int, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_attempt public.ielts_exam_attempts%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_extra_minutes is null or p_extra_minutes <= 0 then raise exception 'invalid_extra_minutes'; end if;
  select * into v_attempt from public.ielts_exam_attempts where id = p_attempt_id for update;
  if v_attempt.id is null then raise exception 'attempt_not_found'; end if;
  if not public.can_monitor_ielts_exam(v_attempt.exam_event_id) then raise exception 'forbidden'; end if;
  update public.ielts_exam_attempts
  set ends_at = coalesce(ends_at, now()) + make_interval(mins => p_extra_minutes), updated_at = now()
  where id = p_attempt_id returning * into v_attempt;
  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, attempt_id, action, payload)
  values (auth.uid(), v_attempt.exam_event_id, p_attempt_id, 'extend_attempt', jsonb_build_object('extra_minutes', p_extra_minutes, 'reason', p_reason, 'new_ends_at', v_attempt.ends_at));
  return jsonb_build_object('attempt_id', p_attempt_id, 'ends_at', v_attempt.ends_at, 'server_now', now());
end;
$$;

create or replace function public.rpc_ielts_force_submit_attempt(p_attempt_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.ielts_exam_attempts%rowtype;
  v_submission public.ielts_exam_submissions%rowtype;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_attempt from public.ielts_exam_attempts where id = p_attempt_id for update;
  if v_attempt.id is null then raise exception 'attempt_not_found'; end if;
  if not public.can_monitor_ielts_exam(v_attempt.exam_event_id) then raise exception 'forbidden'; end if;

  select * into v_submission from public.ielts_exam_submissions where attempt_id = p_attempt_id;
  if v_submission.id is null then
    select coalesce(jsonb_object_agg(section, payload), '{}'::jsonb) into v_payload
    from public.ielts_exam_drafts where attempt_id = p_attempt_id;
    insert into public.ielts_exam_submissions(attempt_id, student_id, payload, idempotency_key, submitted_at)
    values (p_attempt_id, v_attempt.student_id, coalesce(v_payload, '{}'::jsonb), 'force:' || p_attempt_id::text, now())
    returning * into v_submission;
  end if;

  update public.ielts_exam_attempts set status = 'auto_submitted', submitted_at = coalesce(submitted_at, now()), updated_at = now() where id = p_attempt_id;
  update public.ielts_exam_assignments set status = 'auto_submitted' where id = v_attempt.assignment_id;
  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, attempt_id, action, payload)
  values (auth.uid(), v_attempt.exam_event_id, p_attempt_id, 'force_submit_attempt', jsonb_build_object('reason', p_reason, 'submission_id', v_submission.id));
  return jsonb_build_object('attempt_id', p_attempt_id, 'submission_id', v_submission.id, 'status', 'auto_submitted', 'server_now', now());
end;
$$;

create or replace function public.rpc_ielts_void_attempt(p_attempt_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_attempt public.ielts_exam_attempts%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_attempt from public.ielts_exam_attempts where id = p_attempt_id for update;
  if v_attempt.id is null then raise exception 'attempt_not_found'; end if;
  if not public.can_monitor_ielts_exam(v_attempt.exam_event_id) then raise exception 'forbidden'; end if;
  update public.ielts_exam_attempts set status = 'void', updated_at = now() where id = p_attempt_id;
  update public.ielts_exam_assignments set status = 'void' where id = v_attempt.assignment_id;
  insert into public.ielts_exam_audit_log(actor_id, exam_event_id, attempt_id, action, payload)
  values (auth.uid(), v_attempt.exam_event_id, p_attempt_id, 'void_attempt', jsonb_build_object('reason', p_reason));
  return jsonb_build_object('attempt_id', p_attempt_id, 'status', 'void', 'server_now', now());
end;
$$;

-- -----------------------------------------------------------------------------
-- Comments and grants
-- -----------------------------------------------------------------------------

comment on table public.ielts_exam_events is 'Controlled IELTS Exam Mode exam windows. Practice-mode IELTS tables are intentionally untouched.';
comment on table public.ielts_exam_forms is 'Exam form payloads plus protected answer_key. Students must never receive direct SELECT access; use rpc_ielts_exam_whoami public payload.';
comment on column public.ielts_exam_forms.answer_key is 'Protected grading key. Never expose through student RPCs or RLS policies.';
comment on table public.ielts_exam_attempts is 'Server-authoritative exam attempt state, timer, lock token, and heartbeat.';
comment on table public.ielts_exam_drafts is 'Autosaved section drafts keyed by attempt and section for resume support.';
comment on table public.ielts_exam_submissions is 'Single idempotent submission per attempt; answer_key is deliberately not joined or returned.';
comment on table public.ielts_exam_incidents is 'Server-side proctoring/technical incidents logged by attempt owners.';
comment on table public.ielts_exam_audit_log is 'Immutable operational audit trail for emergency teacher/admin controls.';

comment on function public.rpc_ielts_exam_whoami(uuid) is 'Student exam bootstrap. Returns public form payload without answer_key and server-authoritative timing.';
comment on function public.rpc_ielts_start_attempt(uuid) is 'Starts exactly one attempt for the authenticated student assignment and returns server timer plus lock token.';
comment on function public.rpc_ielts_autosave_attempt(uuid, text, text, jsonb, int, timestamptz) is 'Owner-only autosave guarded by lock_token and server timer.';
comment on function public.rpc_ielts_submit_attempt(uuid, text, jsonb, text) is 'Atomic owner-only idempotent submission. Never exposes answer_key.';
comment on function public.rpc_ielts_exam_monitoring(uuid) is 'Teacher/admin monitoring view scoped by school or class assignment.';
comment on function public.rpc_ielts_log_incident(uuid, text, text, text, jsonb) is 'Owner-only incident logging guarded by lock_token.';

-- Tables are readable only where RLS allows; writes should go through RPCs or managers.
grant select on public.ielts_exam_events to authenticated;
grant select on public.ielts_exam_assignments to authenticated;
grant select on public.ielts_exam_attempts to authenticated;
grant select on public.ielts_exam_drafts to authenticated;
grant select on public.ielts_exam_incidents to authenticated;
grant select on public.ielts_exam_submissions to authenticated;

grant execute on function public.current_user_id() to authenticated;
grant execute on function public.is_superadmin(uuid) to authenticated;
grant execute on function public.can_manage_ielts_exam(uuid) to authenticated;
grant execute on function public.can_monitor_ielts_exam(uuid) to authenticated;
grant execute on function public.rpc_ielts_exam_whoami(uuid) to authenticated;
grant execute on function public.rpc_ielts_start_attempt(uuid) to authenticated;
grant execute on function public.rpc_ielts_autosave_attempt(uuid, text, text, jsonb, int, timestamptz) to authenticated;
grant execute on function public.rpc_ielts_submit_attempt(uuid, text, jsonb, text) to authenticated;
grant execute on function public.rpc_ielts_exam_monitoring(uuid) to authenticated;
grant execute on function public.rpc_ielts_log_incident(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.rpc_ielts_pause_exam(uuid, text) to authenticated;
grant execute on function public.rpc_ielts_resume_exam(uuid, text) to authenticated;
grant execute on function public.rpc_ielts_extend_attempt(uuid, int, text) to authenticated;
grant execute on function public.rpc_ielts_force_submit_attempt(uuid, text) to authenticated;
grant execute on function public.rpc_ielts_void_attempt(uuid, text) to authenticated;
