create or replace function public.rpc_ielts_student_journey(p_student_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := coalesce(p_student_id, auth.uid());
  v_student_school_id uuid;
  v_actor_id uuid := auth.uid();
  v_can_view boolean := false;
  v_reading numeric;
  v_listening numeric;
  v_writing numeric;
  v_speaking numeric;
  v_overall numeric;
  v_estimate_count int := 0;
  v_recent_practice jsonb := '[]'::jsonb;
  v_recent_exam_submissions jsonb := '[]'::jsonb;
  v_assigned_summary jsonb := jsonb_build_object('total', 0, 'assigned', 0, 'in_progress', 0, 'completed', 0, 'overdue', 0);
  v_assigned_total int := 0;
  v_activity_count int := 0;
  v_confidence text := 'low';
  v_weak_skill text;
  v_next_recommendation text;
  v_assigned_practice jsonb := '[]'::jsonb;
  v_completed_practice jsonb := '[]'::jsonb;
  v_teacher_feedback jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;
  if v_student_id is null then raise exception 'student_required'; end if;
  select u.school_id into v_student_school_id from public.users u where u.id = v_student_id;
  v_can_view := v_student_id = v_actor_id;

  if not v_can_view and v_student_school_id is not null then
    select exists (select 1 from public.users u where u.id = v_actor_id and (coalesce(u.is_admin, false) = true or coalesce(u.role, '') in ('admin', 'superadmin') or (coalesce(u.role, '') = 'school_admin' and u.school_id = v_student_school_id)))
      or exists (select 1 from public.school_members sm where sm.school_id = v_student_school_id and sm.user_id = v_actor_id and sm.status = 'active' and sm.role_in_school in ('school_admin', 'admin', 'superadmin'))
      or exists (
        select 1 from public.classes c
        join public.class_teacher_assignments cta on cta.class_id = c.id
        join public.class_students cs on cs.class_id = c.id
        where c.school_id = v_student_school_id and coalesce(c.is_active, true) = true and cta.teacher_user_id = v_actor_id and coalesce(cta.active, true) = true and cs.student_id = v_student_id
      ) into v_can_view;
  end if;
  if not v_can_view then raise exception 'forbidden'; end if;

  select max(estimated_band) filter (where skill = 'reading'),
         max(estimated_band) filter (where skill = 'listening'),
         max(estimated_band) filter (where skill = 'writing'),
         max(estimated_band) filter (where skill = 'speaking')
  into v_reading, v_listening, v_writing, v_speaking
  from public.ielts_latest_skill_readiness(v_student_id);

  select count(*) filter (where value is not null), round(avg(value)::numeric, 1)
  into v_estimate_count, v_overall
  from (values (v_reading), (v_listening), (v_writing), (v_speaking)) estimates(value);

  select skill into v_weak_skill
  from (values ('reading', v_reading), ('listening', v_listening), ('writing', v_writing), ('speaking', v_speaking)) skills(skill, value)
  where value is not null
  order by value asc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('source', source_type, 'skill', skill, 'id', source_id, 'occurred_at', last_activity_at, 'estimated_band', estimated_band, 'confidence', confidence) order by last_activity_at desc nulls last), '[]'::jsonb)
  into v_recent_practice
  from (select * from public.ielts_latest_skill_readiness(v_student_id) order by last_activity_at desc nulls last limit 5) r;

  if to_regclass('public.ielts_practice_assignment_students') is not null then
    select jsonb_build_object(
      'total', coalesce(count(s.id), 0),
      'assigned', coalesce(count(s.id) filter (where s.status = 'assigned'), 0),
      'in_progress', coalesce(count(s.id) filter (where s.status = 'in_progress'), 0),
      'completed', coalesce(count(s.id) filter (where s.status = 'completed'), 0),
      'overdue', coalesce(count(s.id) filter (where s.status = 'overdue' or (a.due_at is not null and a.due_at < now() and s.status not in ('completed', 'excused'))), 0)
    ), count(s.id)
    into v_assigned_summary, v_assigned_total
    from public.ielts_practice_assignment_students s
    left join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = v_student_id;

    select coalesce(jsonb_agg(jsonb_build_object('assignment_id', s.assignment_id, 'title', coalesce(a.title, 'IELTS Practice'), 'status', s.status, 'assigned_at', s.assigned_at, 'started_at', s.started_at, 'completed_at', s.completed_at, 'due_at', a.due_at) order by coalesce(a.due_at, s.assigned_at) asc nulls last), '[]'::jsonb)
    into v_assigned_practice
    from public.ielts_practice_assignment_students s
    left join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = v_student_id and s.status in ('assigned', 'in_progress', 'overdue');

    select coalesce(jsonb_agg(jsonb_build_object('assignment_id', s.assignment_id, 'title', coalesce(a.title, 'IELTS Practice'), 'status', s.status, 'completed_at', s.completed_at, 'due_at', a.due_at) order by s.completed_at desc nulls last), '[]'::jsonb)
    into v_completed_practice
    from public.ielts_practice_assignment_students s
    left join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = v_student_id and s.status = 'completed';
  end if;

  if to_regclass('public.ielts_productive_skill_reviews') is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'review_id', r.id,
      'skill', r.attempt_type,
      'attempt_id', r.attempt_id,
      'overall_band', r.overall_band,
      'rubric_summary',
        trim(both ' ' from concat_ws(' · ',
          case when r.rubric ? 'task_achievement' then 'TA ' || coalesce(r.rubric->>'task_achievement', '—') end,
          case when r.rubric ? 'coherence_cohesion' then 'CC ' || coalesce(r.rubric->>'coherence_cohesion', '—') end,
          case when r.rubric ? 'lexical_resource' then 'LR ' || coalesce(r.rubric->>'lexical_resource', '—') end,
          case when r.rubric ? 'grammatical_range_accuracy' then 'GRA ' || coalesce(r.rubric->>'grammatical_range_accuracy', '—') end,
          case when r.rubric ? 'fluency_coherence' then 'FC ' || coalesce(r.rubric->>'fluency_coherence', '—') end,
          case when r.rubric ? 'pronunciation' then 'PR ' || coalesce(r.rubric->>'pronunciation', '—') end
        )),
      'feedback_preview', left(coalesce(r.feedback, ''), 160),
      'reviewed_at', r.reviewed_at,
      'review_result_link', '/ielts/review-result/' || r.attempt_type || '/' || r.attempt_id
    ) order by r.reviewed_at desc nulls last), '[]'::jsonb)
    into v_teacher_feedback
    from public.ielts_productive_skill_reviews r
    where r.student_id = v_student_id
      and r.review_status = 'finalized'
      and r.attempt_type in ('writing', 'speaking');
  end if;

  if to_regclass('public.ielts_exam_submissions') is not null and to_regclass('public.ielts_exam_attempts') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ielts_exam_submissions' and column_name = 'student_id') then
      select coalesce(jsonb_agg(jsonb_build_object(
        'source', 'exam_mode',
        'submission_id', s.id,
        'attempt_id', s.attempt_id,
        'title', coalesce(e.title, 'IELTS Exam Mode'),
        'submitted_at', s.submitted_at,
        'grading_status', s.grading_status,
        'attempt_status', a.status,
        'exam_event_id', a.exam_event_id,
        'result_status', case when s.grading_status in ('pending', 'queued') then 'Submitted — results pending' else s.grading_status end
      ) order by s.submitted_at desc), '[]'::jsonb)
      into v_recent_exam_submissions
      from public.ielts_exam_submissions s
      left join public.ielts_exam_attempts a on a.id = s.attempt_id
      left join public.ielts_exam_events e on e.id = a.exam_event_id
      where s.student_id = v_student_id and coalesce(a.status, '') in ('submitted', 'auto_submitted');
    end if;
  end if;

  v_activity_count := coalesce(jsonb_array_length(v_recent_practice), 0) + coalesce(jsonb_array_length(v_recent_exam_submissions), 0);
  v_confidence := case when v_estimate_count >= 3 and v_activity_count >= 5 then 'high' when v_estimate_count >= 1 or v_activity_count >= 2 or v_assigned_total > 0 then 'medium' else 'low' end;
  v_next_recommendation := case when v_weak_skill is not null then 'Focus your next practice on ' || v_weak_skill || ' to improve your estimated readiness.' when v_assigned_total > 0 then 'Open your assigned IELTS practice and complete the next pending task.' else 'Complete a reading or listening practice set to start building your readiness estimate.' end;

  return jsonb_build_object(
    'student_id', v_student_id,
    'target_band', null,
    'current_estimates', jsonb_build_object('reading', v_reading, 'listening', v_listening, 'writing', v_writing, 'speaking', v_speaking, 'overall', v_overall),
    'confidence_level', v_confidence,
    'recent_practice', v_recent_practice,
    'recent_exam_mode_submissions', v_recent_exam_submissions,
    'assigned_practice_summary', coalesce(v_assigned_summary, jsonb_build_object('total', 0, 'assigned', 0, 'in_progress', 0, 'completed', 0, 'overdue', 0)),
    'assigned_practice', v_assigned_practice,
    'completed_practice', v_completed_practice,
    'teacher_feedback', v_teacher_feedback,
    'weak_skill', v_weak_skill,
    'next_recommendation', v_next_recommendation
  );
end;
$$;

grant execute on function public.rpc_ielts_student_journey(uuid) to authenticated;
