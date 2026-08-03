-- Authorise Cambridge retakes against one exact, canonical attempt.
--
-- The previous compatibility implementation grouped rows by display name,
-- class, and quiz name. That could archive a different test version and could
-- not safely distinguish legacy students who share a name. Modern attempts
-- have immutable student/test/version identity; legacy rows fail closed until
-- their student identity is reconciled.

create or replace function public.allow_cambridge_retake(
  p_score_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_score public.quiz_scores%rowtype;
  v_actor_name text;
  v_actor_role text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_history_id uuid;
begin
  if v_actor_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  if p_score_id is null then
    return jsonb_build_object('success', false, 'error', 'Submission is required');
  end if;

  if v_reason is null then
    return jsonb_build_object(
      'success', false,
      'error', 'A reason is required to authorize a retake',
      'code', 'CAMBRIDGE_REASON_REQUIRED'
    );
  end if;

  if char_length(v_reason) > 500 then
    return jsonb_build_object(
      'success', false,
      'error', 'Reason must be 500 characters or fewer',
      'code', 'CAMBRIDGE_REASON_TOO_LONG'
    );
  end if;

  select qs.*
  into v_score
  from public.quiz_scores qs
  where qs.id = p_score_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Submission not found or retake already allowed');
  end if;

  if v_score.student_id is null
     or nullif(trim(v_score.test_id), '') is null
     or nullif(trim(v_score.quiz_version), '') is null then
    return jsonb_build_object(
      'success', false,
      'error', 'This legacy submission needs an identity review before a retake can be allowed',
      'code', 'CAMBRIDGE_IDENTITY_REVIEW_REQUIRED'
    );
  end if;

  if not public.can_manage_cambridge_score(v_score.id, true) then
    return jsonb_build_object(
      'success', false,
      'error', 'Only the assigned class and subject teacher can allow this retake'
    );
  end if;

  select coalesce(nullif(trim(u.full_name), ''), nullif(trim(u.username), ''), u.email, v_actor_id::text)
  into v_actor_name
  from public.users u
  where u.id = v_actor_id;
  v_actor_name := coalesce(v_actor_name, v_actor_id::text);

  if public.is_superadmin(v_actor_id) then
    v_actor_role := 'superadmin';
  else
    select sm.role_in_school
    into v_actor_role
    from public.school_members sm
    where sm.user_id = v_actor_id
      and sm.school_id = v_score.school_id
      and sm.status = 'active'
      and sm.role_in_school in ('teacher', 'school_admin')
    order by case when sm.role_in_school = 'school_admin' then 0 else 1 end
    limit 1;
  end if;

  if v_actor_role is null then
    return jsonb_build_object('success', false, 'error', 'You do not manage this school submission');
  end if;

  insert into public.cambridge_quiz_score_history (
    original_score_id,
    school_id,
    student_id,
    student_name,
    student_class,
    quiz_name,
    test_id,
    quiz_version,
    attempt_number,
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
    archived_action,
    archived_by,
    archived_by_name,
    archived_by_role,
    archive_reason
  ) values (
    v_score.id,
    v_score.school_id,
    v_score.student_id,
    v_score.student_name,
    v_score.student_class,
    v_score.quiz_name,
    v_score.test_id,
    v_score.quiz_version,
    v_score.attempt_number,
    v_score.score,
    v_score.total_questions,
    v_score.percentage,
    v_score.answers,
    v_score.submitted_at,
    v_score.time_taken_seconds,
    coalesce(v_score.scores_released, false),
    v_score.released_at,
    v_score.released_by,
    to_jsonb(v_score),
    'retake_authorized',
    v_actor_id,
    v_actor_name,
    v_actor_role,
    v_reason
  )
  returning id into v_history_id;

  delete from public.quiz_scores
  where id = v_score.id
    and student_id = v_score.student_id
    and test_id = v_score.test_id
    and quiz_version = v_score.quiz_version;

  if not found then
    -- Raising rolls back the history insert before the exception handler
    -- converts this otherwise unreachable race into a structured response.
    raise exception using
      errcode = 'P4C01',
      message = 'The selected Cambridge attempt changed while the retake was being authorized';
  end if;

  return jsonb_build_object(
    'success', true,
    'history_id', v_history_id,
    'archived_attempt_count', 1,
    'student_id', v_score.student_id,
    'test_id', v_score.test_id,
    'quiz_version', v_score.quiz_version,
    'attempt_number', v_score.attempt_number,
    'message', 'Retake allowed. The exact test version was preserved in history.'
  );
exception
  when sqlstate 'P4C01' then
    return jsonb_build_object(
      'success', false,
      'error', 'The selected Cambridge attempt changed while the retake was being authorized',
      'code', 'CAMBRIDGE_ATTEMPT_CONFLICT'
    );
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'Retake was already allowed for this submission');
end;
$$;

comment on function public.allow_cambridge_retake(uuid, text) is
  'Archives exactly one identified Cambridge attempt and version. Legacy name-only attempts fail closed pending identity review.';

revoke all on function public.allow_cambridge_retake(uuid, text) from public, anon;
grant execute on function public.allow_cambridge_retake(uuid, text) to authenticated;

notify pgrst, 'reload schema';
