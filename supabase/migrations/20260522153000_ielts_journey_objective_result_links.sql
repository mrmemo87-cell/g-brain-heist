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

    select coalesce(jsonb_agg(jsonb_build_object('assignment_id', s.assignment_id, 'title', coalesce(a.title, 'IELTS Practice'), 'status', s.status, 'assigned_at', coalesce((to_jsonb(s)->>'assigned_at')::timestamptz, s.created_at), 'started_at', (to_jsonb(s)->>'started_at')::timestamptz, 'completed_at', s.completed_at, 'due_at', a.due_at) order by coalesce(a.due_at, coalesce((to_jsonb(s)->>'assigned_at')::timestamptz, s.created_at)) asc nulls last), '[]'::jsonb)
    into v_assigned_practice
    from public.ielts_practice_assignment_students s
    left join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = v_student_id and s.status in ('assigned', 'in_progress', 'overdue');

    select coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id', s.assignment_id,
      'title', coalesce(a.title, 'IELTS Practice'),
      'status', s.status,
      'completed_at', s.completed_at,
      'due_at', a.due_at,
      'skills', coalesce(meta.skills, '[]'::jsonb),
      'objective_skill_count', coalesce(meta.objective_skill_count, 0),
      'productive_skill_count', coalesce(meta.productive_skill_count, 0),
      'has_finalized_review', coalesce(meta.has_finalized_review, false),
      'review_result_link', meta.review_result_link,
      'objective_attempt_id', meta.objective_attempt_id,
      'objective_result_link', meta.objective_result_link,
      'score_correct', meta.score_correct,
      'score_total', meta.score_total,
      'percent_correct', meta.percent_correct,
      'estimated_band', meta.estimated_band,
      'feedback_status', case when coalesce(meta.productive_skill_count, 0) = 0 then 'not_required' when coalesce(meta.has_finalized_review, false) then 'feedback_ready' else 'awaiting_feedback' end,
      'feedback_preview', case when coalesce(meta.productive_skill_count, 0) = 0 then 'Result available.' when coalesce(meta.has_finalized_review, false) then 'Reviewed IELTS feedback is ready.' else 'Teacher feedback will appear after finalization.' end
    ) order by s.completed_at desc nulls last), '[]'::jsonb)
    into v_completed_practice
    from public.ielts_practice_assignment_students s
    left join public.ielts_practice_assignments a on a.id = s.assignment_id
    left join lateral (
      select
        jsonb_agg(distinct i.skill) filter (where i.skill is not null) as skills,
        count(*) filter (where i.skill in ('reading', 'listening')) as objective_skill_count,
        count(*) filter (where i.skill in ('writing', 'speaking')) as productive_skill_count,
        max(case when i.skill = 'reading' then '/ielts/reading/result/' || ra_match.id::text when i.skill = 'listening' then '/ielts/listening/result/' || la_match.id::text else null end) filter (where i.skill in ('reading', 'listening') and coalesce(ra_match.id, la_match.id) is not null) as objective_result_link,
        max(coalesce(ra_match.id::text, la_match.id::text)) filter (where i.skill in ('reading', 'listening')) as objective_attempt_id,
        max(coalesce(ra_match.raw_score, la_match.raw_score)) as score_correct,
        max(coalesce(ra_match.total_questions, la_match.total_questions)) as score_total,
        max(coalesce(ra_match.percent, la_match.percent)) as percent_correct,
        max(case when coalesce(ra_match.total_questions, la_match.total_questions, 0) > 0 and coalesce(ra_match.percent, la_match.percent, 0) >= 1 then coalesce(ra_match.est_band, la_match.est_band, ra_match.estimated_band, la_match.estimated_band) else null end) as estimated_band,
        exists (
          select 1 from public.ielts_productive_skill_reviews r
          where r.student_id = v_student_id and (to_jsonb(r)->>'review_status' = 'finalized' or to_jsonb(r)->>'review_status' is null)
          and coalesce(to_jsonb(r)->>'attempt_type', '') = any(array_agg(i.skill) filter (where i.skill in ('writing', 'speaking')))
        ) as has_finalized_review,
        max('/ielts/review-result/' || (to_jsonb(r2)->>'attempt_type') || '/' || (to_jsonb(r2)->>'attempt_id')) filter (where r2.id is not null) as review_result_link
      from public.ielts_practice_assignment_items i
      left join lateral (
        select ra.id, ra.raw_score, ra.total_questions, ra.percent, ra.est_band, null::numeric as estimated_band
        from public.ielts_reading_attempts ra
        where i.skill = 'reading'
          and ra.user_id = v_student_id
          and ra.set_id::text = i.content_id
          and coalesce(ra.completed_at, ra.started_at) is not null
        order by coalesce(ra.completed_at, ra.started_at) desc, ra.started_at desc, ra.id desc
        limit 1
      ) ra_match on true
      left join lateral (
        select la.id, la.raw_score, la.total_questions, la.percent, la.est_band, null::numeric as estimated_band
        from public.ielts_listening_attempts la
        where i.skill = 'listening'
          and la.user_id = v_student_id
          and la.set_id::text = i.content_id
          and coalesce(la.completed_at, la.started_at) is not null
        order by coalesce(la.completed_at, la.started_at) desc, la.started_at desc, la.id desc
        limit 1
      ) la_match on true
      left join public.ielts_productive_skill_reviews r2 on r2.student_id = v_student_id and (to_jsonb(r2)->>'review_status' = 'finalized' or to_jsonb(r2)->>'review_status' is null) and (to_jsonb(r2)->>'attempt_type') = i.skill
      where i.assignment_id = s.assignment_id
    ) meta on true
    where s.student_id = v_student_id and s.status = 'completed';
  end if;

  return jsonb_build_object('student_id', v_student_id,'target_band', null,'current_estimates', jsonb_build_object('reading', v_reading, 'listening', v_listening, 'writing', v_writing, 'speaking', v_speaking, 'overall', v_overall),'confidence_level', v_confidence,'recent_practice', v_recent_practice,'recent_exam_mode_submissions', v_recent_exam_submissions,'assigned_practice_summary', coalesce(v_assigned_summary, jsonb_build_object('total', 0, 'assigned', 0, 'in_progress', 0, 'completed', 0, 'overdue', 0)),'assigned_practice', v_assigned_practice,'completed_practice', v_completed_practice,'teacher_feedback', v_teacher_feedback,'weak_skill', v_weak_skill,'next_recommendation', v_next_recommendation);
end;
$$;

grant execute on function public.rpc_ielts_student_journey(uuid) to authenticated;
