-- Phase 4: one authoritative Student Academic Profile contract for UI and reports.
-- Teachers are restricted to subjects they actively teach to the student; students/admins retain their normal scope.

create or replace function public.rpc_student_academic_profile(
  p_student_id uuid default null,
  p_subject text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_student_id uuid := coalesce(p_student_id, (select auth.uid()));
  v_school_id uuid;
  v_is_self boolean := false;
  v_is_school_admin boolean := false;
  v_is_teacher boolean := false;
  v_allowed_subjects text[] := array[]::text[];
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_student_id is null then raise exception 'Student is required'; end if;

  select u.school_id into v_school_id
  from public.users u
  where u.id = v_student_id;

  if v_school_id is null then raise exception 'Student is not attached to a school'; end if;

  v_is_self := v_caller = v_student_id;

  select exists (
    select 1
    from public.school_members sm
    where sm.school_id = v_school_id
      and sm.user_id = v_caller
      and sm.status = 'active'
      and sm.role_in_school = 'school_admin'
  ) into v_is_school_admin;

  select coalesce(array_agg(distinct lower(trim(cta.subject))) filter (where nullif(trim(cta.subject), '') is not null), array[]::text[])
  into v_allowed_subjects
  from public.class_students cs
  join public.class_teacher_assignments cta
    on cta.class_id = cs.class_id
   and cta.school_id = v_school_id
   and cta.teacher_user_id = v_caller
   and cta.active is true
  where cs.student_id = v_student_id;

  v_is_teacher := cardinality(v_allowed_subjects) > 0;

  if not (v_is_self or v_is_school_admin or v_is_teacher) then
    raise exception 'Not authorized';
  end if;

  if p_subject is not null and v_is_teacher and not (v_is_self or v_is_school_admin)
     and not lower(trim(p_subject)) = any(v_allowed_subjects) then
    raise exception 'Not authorized for requested subject';
  end if;

  with student_row as (
    select u.id, u.full_name, u.username, u.grade, u.batch, u.school_id
    from public.users u
    where u.id = v_student_id
  ),
  scoped_assignments as (
    select
      r.assignment_id,
      r.student_id,
      r.correct,
      r.incorrect,
      r.accuracy,
      r.score,
      r.time_taken_seconds,
      r.completed_at,
      coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''), nullif(trim(a.subject_id), ''), 'General') as subject,
      coalesce(nullif(trim(a.topic_name), ''), nullif(trim(a.title), ''), 'General') as topic,
      coalesce(nullif(trim(a.title), ''), nullif(trim(a.topic_name), ''), 'Assignment') as title,
      a.batch,
      a.assigned_at,
      a.due_at
    from public.student_assignment_results r
    join public.assignments a on a.id = r.assignment_id
    where r.student_id = v_student_id
      and (p_date_from is null or r.completed_at >= p_date_from)
      and (p_date_to is null or r.completed_at <= p_date_to)
      and (p_subject is null or lower(trim(coalesce(a.subject_name, a.subject, a.subject_id, 'General'))) = lower(trim(p_subject)))
      and (
        v_is_self or v_is_school_admin
        or lower(trim(coalesce(a.subject_name, a.subject, a.subject_id, 'General'))) = any(v_allowed_subjects)
      )
  ),
  scoped_focus as (
    select s.*
    from public.student_learning_focus_states s
    where s.student_id = v_student_id
      and (p_subject is null or lower(trim(s.subject)) = lower(trim(p_subject)))
      and (v_is_self or v_is_school_admin or lower(trim(s.subject)) = any(v_allowed_subjects))
      and (p_date_from is null or s.last_observed_at >= p_date_from)
      and (p_date_to is null or s.first_observed_at <= p_date_to)
  ),
  scoped_timeline as (
    select o.*
    from public.student_learning_observations o
    where o.student_id = v_student_id
      and (p_subject is null or lower(trim(o.subject)) = lower(trim(p_subject)))
      and (v_is_self or v_is_school_admin or lower(trim(o.subject)) = any(v_allowed_subjects))
      and (p_date_from is null or o.observed_at >= p_date_from)
      and (p_date_to is null or o.observed_at <= p_date_to)
  ),
  subjects as (
    select subject from scoped_assignments
    union
    select subject from scoped_focus
  ),
  subject_summary as (
    select
      sub.subject,
      coalesce((select round(avg(a.accuracy)::numeric, 1) from scoped_assignments a where lower(a.subject)=lower(sub.subject)), null) as assignment_average,
      (select count(*) from scoped_assignments a where lower(a.subject)=lower(sub.subject))::integer as completed_assignments,
      (select count(*) from scoped_focus f where lower(f.subject)=lower(sub.subject) and f.current_status='persistent')::integer as persistent_focus_count,
      (select count(*) from scoped_focus f where lower(f.subject)=lower(sub.subject) and f.current_status='improving')::integer as improving_count,
      (select count(*) from scoped_focus f where lower(f.subject)=lower(sub.subject) and f.current_status='resolved')::integer as resolved_count,
      (select count(*) from scoped_focus f where lower(f.subject)=lower(sub.subject) and f.current_status in ('emerging_strength','consistent_strength'))::integer as strength_count,
      (select max(t.observed_at) from scoped_timeline t where lower(t.subject)=lower(sub.subject)) as latest_evidence_at
    from subjects sub
  )
  select jsonb_build_object(
    'student', jsonb_build_object(
      'id', sr.id,
      'name', coalesce(nullif(trim(sr.full_name), ''), sr.username),
      'username', sr.username,
      'grade', sr.grade,
      'class_name', sr.batch,
      'school_id', sr.school_id
    ),
    'scope', jsonb_build_object(
      'subject', p_subject,
      'date_from', p_date_from,
      'date_to', p_date_to,
      'viewer', case when v_is_self then 'student' when v_is_school_admin then 'school_admin' else 'teacher' end,
      'allowed_subjects', case when v_is_teacher and not (v_is_self or v_is_school_admin) then to_jsonb(v_allowed_subjects) else '[]'::jsonb end
    ),
    'summary', jsonb_build_object(
      'subjects_tracked', (select count(*) from subjects),
      'completed_assignments', (select count(*) from scoped_assignments),
      'assignment_average', (select round(avg(accuracy)::numeric, 1) from scoped_assignments),
      'persistent_focus_count', (select count(*) from scoped_focus where current_status='persistent'),
      'recurring_focus_count', (select count(*) from scoped_focus where current_status in ('new_focus','recurring')),
      'improving_count', (select count(*) from scoped_focus where current_status='improving'),
      'resolved_count', (select count(*) from scoped_focus where current_status='resolved'),
      'strength_count', (select count(*) from scoped_focus where current_status in ('emerging_strength','consistent_strength'))
    ),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', ss.subject,
        'assignment_average', ss.assignment_average,
        'completed_assignments', ss.completed_assignments,
        'persistent_focus_count', ss.persistent_focus_count,
        'improving_count', ss.improving_count,
        'resolved_count', ss.resolved_count,
        'strength_count', ss.strength_count,
        'latest_evidence_at', ss.latest_evidence_at
      ) order by ss.subject)
      from subject_summary ss
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_id', a.assignment_id,
        'title', a.title,
        'subject', a.subject,
        'topic', a.topic,
        'class_name', a.batch,
        'assigned_at', a.assigned_at,
        'due_at', a.due_at,
        'completed_at', a.completed_at,
        'score', a.score,
        'accuracy', a.accuracy,
        'correct', a.correct,
        'incorrect', a.incorrect,
        'time_taken_seconds', a.time_taken_seconds
      ) order by a.completed_at desc, a.assignment_id)
      from scoped_assignments a
    ), '[]'::jsonb),
    'focus_areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject', f.subject,
        'topic', f.topic,
        'skill', f.skill,
        'subskill', f.subskill,
        'skill_key', f.skill_key,
        'status', f.current_status,
        'trend', f.trend,
        'priority', f.priority,
        'first_observed_at', f.first_observed_at,
        'last_observed_at', f.last_observed_at,
        'focus_occurrences', f.focus_occurrences,
        'developing_occurrences', f.developing_occurrences,
        'strength_occurrences', f.strength_occurrences,
        'latest_evidence_percentage', f.latest_evidence_percentage,
        'evidence_items', f.evidence_items,
        'evidence_occurrences', f.evidence_occurrences
      ) order by
        case f.priority when 'high' then 1 when 'medium' then 2 else 3 end,
        f.last_observed_at desc,
        f.subject,
        f.skill)
      from scoped_focus f
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(x.payload order by x.observed_at desc, x.id desc)
      from (
        select o.id, o.observed_at, jsonb_build_object(
          'id', o.id,
          'subject', o.subject,
          'topic', o.topic,
          'skill', o.skill,
          'subskill', o.subskill,
          'observation_type', o.observation_type,
          'source_type', o.source_type,
          'source_id', o.source_id,
          'observed_at', o.observed_at,
          'evidence_percentage', o.evidence_percentage,
          'evidence_count', o.evidence_count,
          'evidence_quality', o.evidence_quality,
          'contributes_to_focus_state', o.contributes_to_focus_state,
          'evidence', o.evidence
        ) as payload
        from scoped_timeline o
        order by o.observed_at desc, o.created_at desc, o.id desc
        limit 300
      ) x
    ), '[]'::jsonb)
  ) into v_result
  from student_row sr;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.rpc_student_academic_profile(uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.rpc_student_academic_profile(uuid, text, timestamptz, timestamptz) to authenticated, service_role;
