-- Secure, auditable Cambridge retakes.
--
-- A retake archives the complete active submission and then removes it from
-- quiz_scores in the same transaction. Existing test shells therefore keep
-- treating quiz_scores as the source of active attempts, while the original
-- work remains available for audit and reporting.

create table if not exists public.cambridge_quiz_score_history (
  id uuid primary key default gen_random_uuid(),
  original_score_id uuid not null,
  school_id uuid not null references public.schools(id) on delete restrict,
  student_name text not null,
  student_class text,
  quiz_name text not null,
  score integer not null,
  total_questions integer not null,
  percentage integer not null,
  answers jsonb,
  submitted_at timestamptz,
  time_taken_seconds integer,
  scores_released boolean not null default false,
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  attempt_snapshot jsonb not null,
  archived_action text not null default 'retake_authorized'
    check (archived_action = 'retake_authorized'),
  archived_by uuid references auth.users(id) on delete set null,
  archived_by_name text not null,
  archived_by_role text not null
    check (archived_by_role in ('teacher', 'school_admin', 'superadmin')),
  archive_reason text,
  archived_at timestamptz not null default now(),
  constraint cambridge_quiz_score_history_original_action_key
    unique (original_score_id, archived_action),
  constraint cambridge_quiz_score_history_reason_length
    check (archive_reason is null or char_length(archive_reason) <= 500)
);

create index if not exists cambridge_quiz_score_history_school_student_idx
  on public.cambridge_quiz_score_history (school_id, student_name, archived_at desc);

create index if not exists cambridge_quiz_score_history_school_quiz_idx
  on public.cambridge_quiz_score_history (school_id, quiz_name, archived_at desc);

create index if not exists cambridge_quiz_score_history_released_by_idx
  on public.cambridge_quiz_score_history (released_by)
  where released_by is not null;

create index if not exists cambridge_quiz_score_history_archived_by_idx
  on public.cambridge_quiz_score_history (archived_by)
  where archived_by is not null;

alter table public.cambridge_quiz_score_history enable row level security;

drop policy if exists cambridge_quiz_score_history_deny_direct
  on public.cambridge_quiz_score_history;
create policy cambridge_quiz_score_history_deny_direct
  on public.cambridge_quiz_score_history
  for all
  to authenticated
  using (false)
  with check (false);

-- History is deliberately not exposed through direct table access. Future UI
-- reads should use a scoped RPC so answer payloads cannot leak across classes.
revoke all on table public.cambridge_quiz_score_history from public, anon, authenticated;

create or replace function public.allow_cambridge_retake(
  p_score_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_score public.quiz_scores%rowtype;
  v_actor_role text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_history_id uuid;
  v_archived_count integer := 0;
  v_deleted_count integer := 0;
  v_is_superadmin boolean := false;
  v_actor_name text;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  if p_score_id is null then
    return jsonb_build_object('success', false, 'error', 'Submission is required');
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    return jsonb_build_object('success', false, 'error', 'Reason must be 500 characters or fewer');
  end if;

  select qs.*
    into v_score
  from public.quiz_scores qs
  where qs.id = p_score_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Submission not found or retake already allowed');
  end if;

  if v_score.school_id is null then
    return jsonb_build_object('success', false, 'error', 'Submission is not linked to a school');
  end if;

  select coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), u.email, v_actor::text)
    into v_actor_name
  from public.users u
  where u.id = v_actor;

  v_actor_name := coalesce(v_actor_name, v_actor::text);

  v_is_superadmin := public.is_superadmin(v_actor);

  if v_is_superadmin then
    v_actor_role := 'superadmin';
  else
    select sm.role_in_school
      into v_actor_role
    from public.school_members sm
    where sm.user_id = v_actor
      and sm.school_id = v_score.school_id
      and sm.status = 'active'
      and sm.role_in_school in ('teacher', 'school_admin')
    order by case when sm.role_in_school = 'school_admin' then 0 else 1 end
    limit 1;
  end if;

  if v_actor_role is null then
    return jsonb_build_object('success', false, 'error', 'You do not manage this school submission');
  end if;

  if v_actor_role = 'teacher' and not exists (
    select 1
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id = cta.class_id
     and c.school_id = v_score.school_id
    join public.class_students cs
      on cs.class_id = cta.class_id
    join public.users student
      on student.id = cs.student_id
     and student.school_id = v_score.school_id
    where cta.teacher_user_id = v_actor
      and cta.school_id = v_score.school_id
      and cta.active = true
      and cta.can_grade = true
      and (c.class_code = v_score.student_class or c.class_name = v_score.student_class)
      and (
        lower(trim(student.username)) = lower(trim(v_score.student_name))
        or lower(trim(coalesce(student.full_name, ''))) = lower(trim(v_score.student_name))
      )
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'Only the assigned class teacher can allow this retake'
    );
  end if;

  -- Lock and archive every active duplicate for the same student, class and
  -- test. Legacy tests could create duplicate rows; leaving one behind would
  -- keep the student card marked Completed after a retake was approved.
  perform 1
  from public.quiz_scores qs
  where qs.school_id = v_score.school_id
    and lower(trim(qs.student_name)) = lower(trim(v_score.student_name))
    and qs.student_class is not distinct from v_score.student_class
    and qs.quiz_name = v_score.quiz_name
  for update;

  insert into public.cambridge_quiz_score_history (
    original_score_id,
    school_id,
    student_name,
    student_class,
    quiz_name,
    score,
    total_questions,
    percentage,
    answers,
    submitted_at,
    time_taken_seconds,
    scores_released,
    released_at,
    released_by,
    attempt_snapshot,
    archived_by,
    archived_by_name,
    archived_by_role,
    archive_reason
  )
  select
    qs.id,
    qs.school_id,
    qs.student_name,
    qs.student_class,
    qs.quiz_name,
    qs.score,
    qs.total_questions,
    qs.percentage,
    qs.answers,
    qs.submitted_at,
    qs.time_taken_seconds,
    coalesce(qs.scores_released, false),
    qs.released_at,
    qs.released_by,
    to_jsonb(qs),
    v_actor,
    v_actor_name,
    v_actor_role,
    v_reason
  from public.quiz_scores qs
  where qs.school_id = v_score.school_id
    and lower(trim(qs.student_name)) = lower(trim(v_score.student_name))
    and qs.student_class is not distinct from v_score.student_class
    and qs.quiz_name = v_score.quiz_name;

  get diagnostics v_archived_count = row_count;

  select h.id
    into v_history_id
  from public.cambridge_quiz_score_history h
  where h.original_score_id = v_score.id
    and h.archived_action = 'retake_authorized';

  delete from public.quiz_scores
  where school_id = v_score.school_id
    and lower(trim(student_name)) = lower(trim(v_score.student_name))
    and student_class is not distinct from v_score.student_class
    and quiz_name = v_score.quiz_name;

  get diagnostics v_deleted_count = row_count;

  if v_archived_count = 0 or v_deleted_count <> v_archived_count then
    raise exception 'Submission group changed while the retake was being authorized';
  end if;

  return jsonb_build_object(
    'success', true,
    'history_id', v_history_id,
    'archived_attempt_count', v_archived_count,
    'student_name', v_score.student_name,
    'student_class', v_score.student_class,
    'quiz_name', v_score.quiz_name,
    'authorized_by_role', v_actor_role,
    'message', 'Retake allowed. The original attempt was preserved in history.'
  );
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'Retake was already allowed for this submission');
end;
$$;

comment on function public.allow_cambridge_retake(uuid, text) is
  'Archives an active Cambridge submission and allows a new attempt. Teachers are limited to enrolled students in assigned classes; school admins are school-scoped.';

revoke all on function public.allow_cambridge_retake(uuid, text) from public, anon;
grant execute on function public.allow_cambridge_retake(uuid, text) to authenticated;

-- Backwards-compatible school-admin endpoint. Its former hard-delete behavior
-- now uses the same audited permission path.
create or replace function public.school_admin_delete_quiz_submission(p_score_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select public.allow_cambridge_retake(p_score_id, 'School administrator authorized a retake');
$$;

revoke all on function public.school_admin_delete_quiz_submission(uuid) from public, anon;
grant execute on function public.school_admin_delete_quiz_submission(uuid) to authenticated;

-- Retakes must go through the audited RPC. RLS policies alone were too broad:
-- a teacher could previously delete any score in the same school.
drop policy if exists "qs_delete_school_staff" on public.quiz_scores;
drop policy if exists "School admins and teachers can delete quiz scores" on public.quiz_scores;
drop policy if exists "Teachers can delete quiz scores" on public.quiz_scores;
drop policy if exists "School admins can delete quiz scores" on public.quiz_scores;

revoke delete, truncate on table public.quiz_scores from anon, authenticated;

notify pgrst, 'reload schema';
