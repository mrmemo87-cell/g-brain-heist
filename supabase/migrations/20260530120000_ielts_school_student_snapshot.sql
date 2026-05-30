-- School-admin IELTS student progress snapshot.
-- Security: SECURITY DEFINER with explicit role and school checks. Teachers are not
-- granted IELTS admin snapshot access unless they are also platform admins.

create or replace function public.rpc_ielts_school_student_snapshot(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_student public.users%rowtype;
  v_class_id uuid;
  v_class_name text;
  v_actor_can_view boolean := false;
  v_reading numeric;
  v_listening numeric;
  v_writing numeric;
  v_speaking numeric;
  v_overall numeric;
  v_last_activity timestamptz;
  v_status_label text;
  v_assignments_active jsonb := '[]'::jsonb;
  v_assignments_completed jsonb := '[]'::jsonb;
  v_objective_activity jsonb := '[]'::jsonb;
  v_reviewed_feedback jsonb := '[]'::jsonb;
  v_pending_reviews jsonb := '[]'::jsonb;
  v_needs_attention jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then raise exception 'not_authenticated'; end if;
  if p_student_id is null then raise exception 'student_required'; end if;

  select * into v_student from public.users where id = p_student_id;
  if not found then raise exception 'student_not_found'; end if;

  if coalesce(v_student.role, 'student') <> 'student' then
    raise exception 'student_not_found';
  end if;

  select c.id, coalesce(c.class_name, c.class_code)
  into v_class_id, v_class_name
  from public.class_students cs
  join public.classes c on c.id = cs.class_id
  where cs.student_id = p_student_id
    and c.school_id = v_student.school_id
    and coalesce(c.is_active, true) = true
  order by c.class_name nulls last, c.class_code nulls last
  limit 1;

  select exists (
    select 1 from public.users u
    where u.id = v_actor_id
      and (
        coalesce(u.is_admin, false) = true
        or coalesce(u.role, '') in ('admin', 'superadmin')
        or (coalesce(u.role, '') = 'school_admin' and u.school_id = v_student.school_id)
      )
  ) or exists (
    select 1 from public.school_members sm
    where sm.school_id = v_student.school_id
      and sm.user_id = v_actor_id
      and sm.status = 'active'
      and sm.role_in_school in ('school_admin', 'admin', 'superadmin')
  ) into v_actor_can_view;

  if not v_actor_can_view then
    raise exception 'forbidden';
  end if;

  select
    max(estimated_band) filter (where skill = 'reading'),
    max(estimated_band) filter (where skill = 'listening'),
    max(estimated_band) filter (where skill = 'writing'),
    max(estimated_band) filter (where skill = 'speaking'),
    max(last_activity_at)
  into v_reading, v_listening, v_writing, v_speaking, v_last_activity
  from public.ielts_latest_skill_readiness(p_student_id);

  select round(avg(value)::numeric, 1)
  into v_overall
  from (values (v_reading), (v_listening), (v_writing), (v_speaking)) estimates(value)
  where value is not null;

  v_status_label := case
    when v_overall is null then 'Not enough data'
    when v_overall >= 7 then 'Ready'
    when v_overall >= 5.5 then 'On track'
    else 'More practice needed'
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'title', title,
    'due_at', due_at,
    'status', status,
    'progress', jsonb_build_object('completed_count', completed_count, 'total_count', total_count),
    'items', items
  ) order by due_at asc nulls last, assigned_at desc), '[]'::jsonb)
  into v_assignments_active
  from (
    select
      coalesce(a.title, 'IELTS Practice') as title,
      a.due_at,
      s.status,
      s.assigned_at,
      count(i.id)::int as total_count,
      count(i.id) filter (where item_s.status = 'completed')::int as completed_count,
      coalesce(jsonb_agg(jsonb_build_object(
        'skill', i.skill,
        'title', coalesce(i.title, initcap(i.skill) || ' practice'),
        'status', coalesce(item_s.status, 'assigned'),
        'completed_at', item_s.completed_at,
        'submitted_at', item_s.submitted_at,
        'finalized_at', r.reviewed_at,
        'feedback_status', case
          when i.skill in ('writing', 'speaking') and r.finalized = true then 'feedback_ready'
          when i.skill in ('writing', 'speaking') and item_s.submitted_at is not null then 'awaiting_feedback'
          else null
        end,
        'cta', case
          when i.skill in ('reading', 'listening') and item_s.status = 'completed' and item_s.practice_attempt_id is not null
            then jsonb_build_object('label', 'View result', 'route', '/ielts/' || i.skill || '/result/' || item_s.practice_attempt_id::text)
          when i.skill in ('writing', 'speaking') and r.finalized = true and item_s.practice_attempt_id is not null
            then jsonb_build_object('label', 'View feedback', 'route', '/ielts/review-result/' || i.skill || '/' || item_s.practice_attempt_id::text)
          else null
        end
      ) order by i.order_index, i.created_at) filter (where i.id is not null), '[]'::jsonb) as items
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    left join public.ielts_practice_assignment_items i on i.assignment_id = a.id
    left join public.ielts_practice_assignment_item_students item_s on item_s.assignment_item_id = i.id and item_s.student_id = s.student_id
    left join public.ielts_productive_skill_reviews r on r.attempt_type = i.skill and r.attempt_id = item_s.practice_attempt_id::text and r.student_id = s.student_id
    where s.student_id = p_student_id
      and a.school_id = v_student.school_id
      and s.status in ('assigned', 'in_progress', 'overdue')
      and a.status <> 'archived'
    group by a.id, a.title, a.due_at, s.status, s.assigned_at
  ) rows;

  select coalesce(jsonb_agg(jsonb_build_object(
    'title', title,
    'due_at', due_at,
    'status', status,
    'progress', jsonb_build_object('completed_count', completed_count, 'total_count', total_count),
    'items', items
  ) order by completed_at desc nulls last), '[]'::jsonb)
  into v_assignments_completed
  from (
    select
      coalesce(a.title, 'IELTS Practice') as title,
      a.due_at,
      s.status,
      s.completed_at,
      count(i.id)::int as total_count,
      count(i.id) filter (where item_s.status = 'completed')::int as completed_count,
      coalesce(jsonb_agg(jsonb_build_object(
        'skill', i.skill,
        'title', coalesce(i.title, initcap(i.skill) || ' practice'),
        'status', coalesce(item_s.status, 'assigned'),
        'completed_at', item_s.completed_at,
        'submitted_at', item_s.submitted_at,
        'finalized_at', r.reviewed_at,
        'feedback_status', case
          when i.skill in ('writing', 'speaking') and r.finalized = true then 'feedback_ready'
          when i.skill in ('writing', 'speaking') and item_s.submitted_at is not null then 'awaiting_feedback'
          else null
        end,
        'cta', case
          when i.skill in ('reading', 'listening') and item_s.status = 'completed' and item_s.practice_attempt_id is not null
            then jsonb_build_object('label', 'View result', 'route', '/ielts/' || i.skill || '/result/' || item_s.practice_attempt_id::text)
          when i.skill in ('writing', 'speaking') and r.finalized = true and item_s.practice_attempt_id is not null
            then jsonb_build_object('label', 'View feedback', 'route', '/ielts/review-result/' || i.skill || '/' || item_s.practice_attempt_id::text)
          else null
        end
      ) order by i.order_index, i.created_at) filter (where i.id is not null), '[]'::jsonb) as items
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    left join public.ielts_practice_assignment_items i on i.assignment_id = a.id
    left join public.ielts_practice_assignment_item_students item_s on item_s.assignment_item_id = i.id and item_s.student_id = s.student_id
    left join public.ielts_productive_skill_reviews r on r.attempt_type = i.skill and r.attempt_id = item_s.practice_attempt_id::text and r.student_id = s.student_id
    where s.student_id = p_student_id
      and a.school_id = v_student.school_id
      and s.status = 'completed'
      and a.status <> 'archived'
    group by a.id, a.title, a.due_at, s.status, s.completed_at
  ) rows;

  select coalesce(jsonb_agg(jsonb_build_object(
    'skill', skill,
    'title', initcap(skill) || ' objective result',
    'status', 'Completed',
    'occurred_at', last_activity_at,
    'band', estimated_band,
    'route', case when source_id is not null then '/ielts/' || skill || '/result/' || source_id else null end
  ) order by last_activity_at desc nulls last), '[]'::jsonb)
  into v_objective_activity
  from (
    select * from public.ielts_latest_skill_readiness(p_student_id)
    where skill in ('reading', 'listening')
    order by last_activity_at desc nulls last
    limit 6
  ) r;

  select coalesce(jsonb_agg(jsonb_build_object(
    'skill', attempt_type,
    'title', initcap(attempt_type) || ' feedback',
    'status', 'Feedback ready',
    'occurred_at', reviewed_at,
    'band', overall_band,
    'route', '/ielts/review-result/' || attempt_type || '/' || attempt_id
  ) order by reviewed_at desc nulls last), '[]'::jsonb)
  into v_reviewed_feedback
  from public.ielts_productive_skill_reviews
  where student_id = p_student_id
    and school_id = v_student.school_id
    and finalized = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'skill', i.skill,
    'title', coalesce(i.title, initcap(i.skill) || ' practice'),
    'status', 'Review pending',
    'occurred_at', item_s.submitted_at
  ) order by item_s.submitted_at desc nulls last), '[]'::jsonb)
  into v_pending_reviews
  from public.ielts_practice_assignment_item_students item_s
  join public.ielts_practice_assignments a on a.id = item_s.assignment_id
  join public.ielts_practice_assignment_items i on i.id = item_s.assignment_item_id
  left join public.ielts_productive_skill_reviews r on r.attempt_type = i.skill and r.attempt_id = item_s.practice_attempt_id::text and r.student_id = item_s.student_id and r.school_id = v_student.school_id
  where item_s.student_id = p_student_id
    and a.school_id = v_student.school_id
    and a.status <> 'archived'
    and i.skill in ('writing', 'speaking')
    and item_s.submitted_at is not null
    and coalesce(r.finalized, false) = false;

  if v_last_activity is null or v_last_activity < now() - interval '14 days' then
    v_needs_attention := v_needs_attention || jsonb_build_array('No recent IELTS activity.');
  end if;
  if exists (select 1 from (values ('Reading', v_reading), ('Listening', v_listening), ('Writing', v_writing), ('Speaking', v_speaking)) s(skill, band) where band is not null and band < 5.5) then
    v_needs_attention := v_needs_attention || jsonb_build_array('One or more IELTS skills are below the on-track band range.');
  end if;
  if jsonb_array_length(v_pending_reviews) > 0 then
    v_needs_attention := v_needs_attention || jsonb_build_array('Writing or speaking submissions are waiting for review.');
  end if;
  if exists (
    select 1 from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = p_student_id and a.school_id = v_student.school_id and s.status = 'assigned' and a.status <> 'archived'
  ) then
    v_needs_attention := v_needs_attention || jsonb_build_array('At least one assigned IELTS task has not been started.');
  end if;
  if exists (
    select 1 from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = p_student_id and a.school_id = v_student.school_id and a.due_at is not null and a.due_at < now() and s.status not in ('completed', 'excused') and a.status <> 'archived'
  ) then
    v_needs_attention := v_needs_attention || jsonb_build_array('At least one IELTS assignment is overdue.');
  end if;

  return jsonb_build_object(
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', coalesce(v_student.username, v_student.email),
      'username', v_student.username,
      'avatar_url', v_student.avatar_url,
      'class_id', v_class_id,
      'class_name', v_class_name,
      'batch', v_student.batch,
      'school_id', v_student.school_id,
      'last_activity_at', v_last_activity
    ),
    'readiness', jsonb_build_object(
      'status_label', v_status_label,
      'target_band', null,
      'overall_band', v_overall,
      'reading_band', v_reading,
      'listening_band', v_listening,
      'writing_band', v_writing,
      'speaking_band', v_speaking,
      'sources', jsonb_build_object(
        'Reading', 'latest objective result',
        'Listening', 'latest objective result',
        'Writing', 'latest finalized feedback',
        'Speaking', 'latest finalized feedback'
      )
    ),
    'assignments', jsonb_build_object('active', v_assignments_active, 'completed', v_assignments_completed),
    'recent_activity', jsonb_build_object(
      'objective_results', v_objective_activity,
      'reviewed_feedback', v_reviewed_feedback,
      'pending_reviews', v_pending_reviews
    ),
    'needs_attention', v_needs_attention
  );
end;
$$;

revoke execute on function public.rpc_ielts_school_student_snapshot(uuid) from public;
grant execute on function public.rpc_ielts_school_student_snapshot(uuid) to authenticated;
