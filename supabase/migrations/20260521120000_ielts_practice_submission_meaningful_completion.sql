-- Unified IELTS practice submission vs meaningful completion.

alter table if exists public.ielts_practice_assignment_item_students
  add column if not exists submitted_at timestamptz,
  add column if not exists meaningful_completed_at timestamptz;

create or replace function public.rpc_ielts_practice_mark_item_submitted(
  p_assignment_id uuid,
  p_assignment_item_id uuid,
  p_practice_attempt_type text default null,
  p_practice_attempt_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ielts_practice_assert_item_progress_scope(p_assignment_id, p_assignment_item_id, auth.uid());

  insert into public.ielts_practice_assignment_item_students (
    assignment_id,
    assignment_item_id,
    student_id,
    status,
    practice_attempt_type,
    practice_attempt_id,
    started_at,
    submitted_at
  ) values (
    p_assignment_id,
    p_assignment_item_id,
    auth.uid(),
    'in_progress',
    nullif(trim(p_practice_attempt_type), ''),
    p_practice_attempt_id,
    now(),
    now()
  )
  on conflict (assignment_item_id, student_id)
  do update set
    status = case when public.ielts_practice_assignment_item_students.status = 'completed' then 'completed' else 'in_progress' end,
    practice_attempt_type = coalesce(nullif(trim(p_practice_attempt_type), ''), public.ielts_practice_assignment_item_students.practice_attempt_type),
    practice_attempt_id = coalesce(p_practice_attempt_id, public.ielts_practice_assignment_item_students.practice_attempt_id),
    started_at = coalesce(public.ielts_practice_assignment_item_students.started_at, now()),
    submitted_at = coalesce(public.ielts_practice_assignment_item_students.submitted_at, now());

  update public.ielts_practice_assignment_students
  set status = case when status = 'completed' then status else 'in_progress' end
  where assignment_id = p_assignment_id
    and student_id = auth.uid();

  return public.ielts_practice_assignment_progress_payload(p_assignment_id, auth.uid());
end;
$$;

create or replace function public.rpc_ielts_practice_mark_item_completed(
  p_assignment_id uuid,
  p_assignment_item_id uuid,
  p_practice_attempt_type text default null,
  p_practice_attempt_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ielts_practice_assert_item_progress_scope(p_assignment_id, p_assignment_item_id, auth.uid());

  insert into public.ielts_practice_assignment_item_students (
    assignment_id,
    assignment_item_id,
    student_id,
    status,
    practice_attempt_type,
    practice_attempt_id,
    started_at,
    submitted_at,
    completed_at,
    meaningful_completed_at
  ) values (
    p_assignment_id,
    p_assignment_item_id,
    auth.uid(),
    'completed',
    nullif(trim(p_practice_attempt_type), ''),
    p_practice_attempt_id,
    now(),
    now(),
    now(),
    now()
  )
  on conflict (assignment_item_id, student_id)
  do update set
    status = 'completed',
    practice_attempt_type = coalesce(nullif(trim(p_practice_attempt_type), ''), public.ielts_practice_assignment_item_students.practice_attempt_type),
    practice_attempt_id = coalesce(p_practice_attempt_id, public.ielts_practice_assignment_item_students.practice_attempt_id),
    started_at = coalesce(public.ielts_practice_assignment_item_students.started_at, now()),
    submitted_at = coalesce(public.ielts_practice_assignment_item_students.submitted_at, now()),
    completed_at = coalesce(public.ielts_practice_assignment_item_students.completed_at, now()),
    meaningful_completed_at = coalesce(public.ielts_practice_assignment_item_students.meaningful_completed_at, now());

  perform public.ielts_practice_sync_parent_completion(p_assignment_id, auth.uid());

  return public.ielts_practice_assignment_progress_payload(p_assignment_id, auth.uid());
end;
$$;

grant execute on function public.rpc_ielts_practice_mark_item_submitted(uuid, uuid, text, uuid) to authenticated;
