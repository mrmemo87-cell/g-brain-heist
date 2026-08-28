create or replace function public.rpc_guardian_child_academic_year_progress(
  p_student_id uuid,
  p_subject text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_school_id uuid;
  v_year_id uuid;
  v_year public.school_academic_years%rowtype;
  v_grade text;
  v_class_id uuid;
  v_class_name text;
  v_start timestamptz;
  v_end timestamptz;
  v_subject_key text := nullif(private.teacher_assignment_subject_key(coalesce(p_subject, '')), '');
  v_result jsonb;
begin
  if v_caller is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select r.school_id
  into v_school_id
  from public.student_guardian_relationships r
  where r.guardian_user_id = v_caller
    and r.student_id = p_student_id
    and r.status = 'active'
  order by r.verified_at desc nulls last, r.id
  limit 1;

  if v_school_id is null then
    raise exception using errcode = '42501', message = 'guardian_student_access_denied';
  end if;

  v_year_id := public.academic_resolve_year_id(v_school_id, now());

  if v_year_id is null then
    select y.id
    into v_year_id
    from public.school_academic_years y
    where y.school_id = v_school_id
    order by case y.status when 'current' then 0 else 1 end,
             y.starts_on desc,
             y.created_at desc,
             y.id
    limit 1;
  end if;

  select *
  into v_year
  from public.school_academic_years y
  where y.id = v_year_id
    and y.school_id = v_school_id;

  if v_year.id is null then
    raise exception 'Current academic year is not configured for this school';
  end if;

  v_start := v_year.starts_on::timestamptz;
  v_end := least(now(), ((v_year.ends_on + 1)::date)::timestamptz - interval '1 millisecond');

  select e.grade_level,
         e.class_id,
         coalesce(
           (select coalesce(nullif(trim(c.class_code), ''), nullif(trim(c.class_name), '')) from public.classes c where c.id = e.class_id),
           e.class_code
         )
  into v_grade, v_class_id, v_class_name
  from public.student_academic_enrolments e
  where e.student_id = p_student_id
    and e.school_id = v_school_id
    and e.academic_year_id = v_year_id
  order by case e.context_quality when 'confirmed' then 0 else 1 end,
           e.updated_at desc,
           e.id
  limit 1;

  if v_grade is null or v_class_id is null then
    select c.grade_level,
           c.id,
           coalesce(nullif(trim(c.class_code), ''), nullif(trim(c.class_name), ''))
    into v_grade, v_class_id, v_class_name
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = v_school_id
     and coalesce(c.is_active, true)
    where cs.student_id = p_student_id
    order by cs.joined_at desc nulls last, c.created_at desc, c.id
    limit 1;
  end if;

  with scoped_results as (
    select
      r.assignment_id,
      r.verified_question_count,
      r.correct,
      r.incorrect,
      r.accuracy,
      r.score,
      r.time_taken_seconds,
      r.completed_at,
      coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''), nullif(trim(a.subject_id), ''), 'General') as subject,
      coalesce(nullif(trim(a.title), ''), nullif(trim(a.topic_name), ''), 'Assignment') as title,
      coalesce(nullif(trim(a.topic_name), ''), 'General') as topic
    from private.student_verified_assignment_summaries r
    join public.assignments a
      on a.id = r.assignment_id
     and a.school_id = v_school_id
    where r.student_id = p_student_id
      and r.completed_at >= v_start
      and r.completed_at <= v_end
      and (v_subject_key is null or private.teacher_assignment_subject_key(coalesce(a.subject_name, a.subject, a.subject_id, 'General')) = v_subject_key)
  ),
  scoped_assignments as (
    select
      sa.assignment_id,
      sa.status,
      sa.due_at,
      coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''), nullif(trim(a.subject_id), ''), 'General') as subject
    from public.student_assignments sa
    join public.assignments a
      on a.id = sa.assignment_id
     and a.school_id = v_school_id
    where sa.student_id = p_student_id
      and sa.assigned_at >= v_start
      and sa.assigned_at <= v_end
      and (v_subject_key is null or private.teacher_assignment_subject_key(coalesce(a.subject_name, a.subject, a.subject_id, 'General')) = v_subject_key)
  ),
  scoped_focus as (
    select f.*
    from public.student_learning_focus_states f
    where f.school_id = v_school_id
      and f.student_id = p_student_id
      and f.academic_year_id = v_year_id
      and (v_subject_key is null or private.teacher_assignment_subject_key(f.subject) = v_subject_key)
      and exists (
        select 1
        from public.student_learning_observations o
        where o.school_id = v_school_id
          and o.student_id = p_student_id
          and o.academic_year_id = v_year_id
          and o.skill_key = f.skill_key
          and public.student_learning_observation_is_qualified(o.source_type, o.contributes_to_focus_state, o.evidence)
      )
  ),
  scoped_timeline as (
    select o.*
    from public.student_learning_observations o
    where o.school_id = v_school_id
      and o.student_id = p_student_id
      and o.academic_year_id = v_year_id
      and o.observed_at >= v_start
      and o.observed_at <= v_end
      and (v_subject_key is null or private.teacher_assignment_subject_key(o.subject) = v_subject_key)
      and public.student_learning_observation_is_qualified(o.source_type, o.contributes_to_focus_state, o.evidence)
  ),
  subject_candidates as (
    select subject.name,
           private.teacher_assignment_subject_key(subject.name) as subject_key,
           0 as priority
    from public.school_curriculum_scope_mappings mapping
    join public.academic_subjects subject
      on subject.id = mapping.academic_subject_id
     and subject.is_active
    where mapping.school_id = v_school_id
      and mapping.academic_year_id = v_year_id
      and mapping.grade_level = v_grade
      and mapping.status = 'active'
      and (
        mapping.subject_requirement = 'required'
        or exists (
          select 1
          from public.student_subject_enrolments se
          where se.student_id = p_student_id
            and se.school_id = v_school_id
            and se.academic_year_id = v_year_id
            and se.academic_subject_id = subject.id
            and se.status = 'active'
        )
      )

    union all

    select subject.name,
           private.teacher_assignment_subject_key(subject.name),
           1
    from public.class_teacher_assignments cta
    join public.academic_subjects subject
      on subject.is_active
     and private.teacher_assignment_subject_key(subject.name) = private.teacher_assignment_subject_key(cta.subject)
    where cta.school_id = v_school_id
      and cta.class_id = v_class_id
      and cta.active

    union all

    select subject.name,
           private.teacher_assignment_subject_key(subject.name),
           2
    from private.school_year_teacher_allocation_snapshots snap
    join public.academic_subjects subject
      on subject.is_active
     and private.teacher_assignment_subject_key(subject.name) = private.teacher_assignment_subject_key(snap.subject)
    where snap.school_id = v_school_id
      and snap.academic_year_id = v_year_id
      and snap.class_id = v_class_id

    union all

    select r.subject, private.teacher_assignment_subject_key(r.subject), 3 from scoped_results r
    union all
    select f.subject, private.teacher_assignment_subject_key(f.subject), 3 from scoped_focus f
  ),
  available_subjects as (
    select distinct on (subject_key) name, subject_key
    from subject_candidates
    where nullif(subject_key, '') is not null
    order by subject_key, priority, name
  ),
  selected_subjects as (
    select a.name as subject
    from available_subjects a
    where v_subject_key is null or a.subject_key = v_subject_key
  ),
  subject_rows as (
    select
      s.subject,
      (select round(avg(r.accuracy)::numeric, 1) from scoped_results r where private.teacher_assignment_subject_key(r.subject) = private.teacher_assignment_subject_key(s.subject)) as assignment_average,
      (select count(*)::int from scoped_results r where private.teacher_assignment_subject_key(r.subject) = private.teacher_assignment_subject_key(s.subject)) as completed_assignments,
      (select count(*)::int from scoped_assignments a where private.teacher_assignment_subject_key(a.subject) = private.teacher_assignment_subject_key(s.subject)) as assigned_assignments,
      (select count(*)::int from scoped_assignments a where private.teacher_assignment_subject_key(a.subject) = private.teacher_assignment_subject_key(s.subject) and a.status <> 'completed' and a.due_at is not null and a.due_at < now()) as overdue_assignments,
      (select count(*)::int from scoped_focus f where private.teacher_assignment_subject_key(f.subject) = private.teacher_assignment_subject_key(s.subject) and f.current_status = 'persistent') as persistent_focus_count,
      (select count(*)::int from scoped_focus f where private.teacher_assignment_subject_key(f.subject) = private.teacher_assignment_subject_key(s.subject) and f.current_status in ('new_focus','recurring')) as recurring_focus_count,
      (select count(*)::int from scoped_focus f where private.teacher_assignment_subject_key(f.subject) = private.teacher_assignment_subject_key(s.subject) and f.current_status = 'improving') as improving_count,
      (select count(*)::int from scoped_focus f where private.teacher_assignment_subject_key(f.subject) = private.teacher_assignment_subject_key(s.subject) and f.current_status = 'resolved') as resolved_count,
      (select count(*)::int from scoped_focus f where private.teacher_assignment_subject_key(f.subject) = private.teacher_assignment_subject_key(s.subject) and f.current_status in ('emerging_strength','consistent_strength')) as strength_count,
      (select max(t.observed_at) from scoped_timeline t where private.teacher_assignment_subject_key(t.subject) = private.teacher_assignment_subject_key(s.subject)) as latest_evidence_at
    from selected_subjects s
  ),
  child as (
    select
      u.id,
      coalesce(nullif(trim(u.full_name), ''), u.username) as name,
      u.username,
      u.avatar_url,
      s.name as school_name,
      s.logo_url as school_logo_url
    from public.users u
    join public.schools s on s.id = v_school_id
    where u.id = p_student_id
      and u.school_id = v_school_id
  )
  select jsonb_build_object(
    'child', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'username', c.username,
      'grade', v_grade,
      'class_name', coalesce(v_class_name, '—'),
      'school_id', v_school_id,
      'school_name', c.school_name,
      'school_logo_url', c.school_logo_url,
      'avatar_url', c.avatar_url
    ),
    'academic_year', jsonb_build_object(
      'id', v_year.id,
      'name', v_year.name,
      'status', v_year.status,
      'starts_on', v_year.starts_on,
      'ends_on', v_year.ends_on
    ),
    'period', jsonb_build_object(
      'mode', 'current_academic_year',
      'label', v_year.name,
      'days', greatest(1, (least(current_date, v_year.ends_on) - v_year.starts_on) + 1),
      'start', v_start,
      'end', v_end
    ),
    'selected_subject', p_subject,
    'available_subjects', coalesce((select jsonb_agg(a.name order by a.name) from available_subjects a), '[]'::jsonb),
    'summary', jsonb_build_object(
      'assignment_average', (select round(avg(r.accuracy)::numeric, 1) from scoped_results r),
      'completed_assignments', (select count(*) from scoped_results),
      'assigned_assignments', (select count(*) from scoped_assignments),
      'overdue_assignments', (select count(*) from scoped_assignments a where a.status <> 'completed' and a.due_at is not null and a.due_at < now()),
      'persistent_focus_count', (select count(*) from scoped_focus where current_status = 'persistent'),
      'recurring_focus_count', (select count(*) from scoped_focus where current_status in ('new_focus','recurring')),
      'improving_count', (select count(*) from scoped_focus where current_status = 'improving'),
      'resolved_count', (select count(*) from scoped_focus where current_status = 'resolved'),
      'strength_count', (select count(*) from scoped_focus where current_status in ('emerging_strength','consistent_strength'))
    ),
    'subjects', coalesce((select jsonb_agg(to_jsonb(sr) order by sr.subject) from subject_rows sr), '[]'::jsonb),
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
        'evidence_items', f.evidence_items,
        'latest_evidence_percentage', f.latest_evidence_percentage
      ) order by case f.priority when 'high' then 1 when 'medium' then 2 else 3 end, f.last_observed_at desc)
      from scoped_focus f
      where f.current_status in ('new_focus','recurring','persistent')
    ), '[]'::jsonb),
    'improving', coalesce((
      select jsonb_agg(jsonb_build_object('subject',f.subject,'skill',f.skill,'subskill',f.subskill,'last_observed_at',f.last_observed_at,'evidence_items',f.evidence_items) order by f.last_observed_at desc)
      from scoped_focus f where f.current_status = 'improving'
    ), '[]'::jsonb),
    'resolved', coalesce((
      select jsonb_agg(jsonb_build_object('subject',f.subject,'skill',f.skill,'subskill',f.subskill,'last_observed_at',f.last_observed_at,'evidence_items',f.evidence_items) order by f.last_observed_at desc)
      from scoped_focus f where f.current_status = 'resolved'
    ), '[]'::jsonb),
    'strengths', coalesce((
      select jsonb_agg(jsonb_build_object('subject',f.subject,'skill',f.skill,'subskill',f.subskill,'status',f.current_status,'last_observed_at',f.last_observed_at,'evidence_items',f.evidence_items) order by f.last_observed_at desc)
      from scoped_focus f where f.current_status in ('emerging_strength','consistent_strength')
    ), '[]'::jsonb),
    'recent_assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_id', r.assignment_id,
        'title', r.title,
        'subject', r.subject,
        'topic', r.topic,
        'accuracy', r.accuracy,
        'correct', r.correct,
        'incorrect', r.incorrect,
        'completed_at', r.completed_at
      ) order by r.completed_at desc)
      from scoped_results r
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'subject', t.subject,
        'topic', t.topic,
        'skill', t.skill,
        'subskill', t.subskill,
        'observation_type', t.observation_type,
        'source_type', t.source_type,
        'source_id', t.source_id,
        'observed_at', t.observed_at,
        'evidence_percentage', t.evidence_percentage,
        'evidence_quality', t.evidence_quality
      ) order by t.observed_at desc, t.id desc)
      from scoped_timeline t
    ), '[]'::jsonb)
  )
  into v_result
  from child c;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.rpc_guardian_child_academic_year_progress(uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_guardian_child_academic_year_progress(uuid, text) to authenticated, service_role;
