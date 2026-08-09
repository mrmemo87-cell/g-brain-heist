-- Phase 5: School Head longitudinal academic intelligence.
-- Executive aggregates come from the same assignment + learning-memory evidence used by Student Academic Profiles.

create or replace function public.school_head_get_learning_intelligence(
  p_school_id uuid,
  p_days integer default 90
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(7, least(coalesce(p_days, 90), 365));
  v_start timestamptz := now() - make_interval(days => greatest(7, least(coalesce(p_days, 90), 365)));
  v_result jsonb;
begin
  if (select auth.uid()) is null or not public.is_school_owner(p_school_id) then
    raise exception 'Forbidden: active School Head authority is required';
  end if;

  with active_students as (
    select distinct u.id, coalesce(nullif(trim(u.full_name), ''), u.username) as student_name, u.grade, u.batch
    from public.school_members sm
    join public.users u on u.id = sm.user_id and u.school_id = sm.school_id
    where sm.school_id = p_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  ),
  student_class as (
    select distinct on (cs.student_id)
      cs.student_id,
      c.id as class_id,
      coalesce(nullif(trim(c.class_code), ''), nullif(trim(c.class_name), ''), 'Unassigned') as class_name,
      c.grade_level
    from public.class_students cs
    join public.classes c on c.id = cs.class_id and c.school_id = p_school_id and c.is_active is true
    join active_students s on s.id = cs.student_id
    order by cs.student_id, c.created_at desc, c.id
  ),
  school_focus as (
    select f.*
    from public.student_learning_focus_states f
    join active_students s on s.id = f.student_id
    where f.school_id = p_school_id
  ),
  recent_observations as (
    select o.*
    from public.student_learning_observations o
    join active_students s on s.id = o.student_id
    where o.school_id = p_school_id
      and o.observed_at >= v_start
  ),
  period_assignments as (
    select
      r.student_id,
      r.accuracy,
      r.completed_at,
      coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''), nullif(trim(a.subject_id), ''), 'General') as subject
    from public.student_assignment_results r
    join public.assignments a on a.id = r.assignment_id and a.school_id = p_school_id
    join active_students s on s.id = r.student_id
    where r.completed_at >= v_start
  ),
  subject_names as (
    select subject from school_focus
    union
    select subject from period_assignments
  ),
  subject_rows as (
    select
      n.subject,
      (select count(distinct f.student_id) from school_focus f where lower(f.subject)=lower(n.subject))::integer as students_tracked,
      (select round(avg(a.accuracy)::numeric,1) from period_assignments a where lower(a.subject)=lower(n.subject)) as assignment_average,
      (select count(*) from period_assignments a where lower(a.subject)=lower(n.subject))::integer as completed_assignments,
      (select count(*) from school_focus f where lower(f.subject)=lower(n.subject) and f.current_status='persistent')::integer as persistent_areas,
      (select count(distinct f.student_id) from school_focus f where lower(f.subject)=lower(n.subject) and f.current_status='persistent')::integer as persistent_students,
      (select count(distinct f.student_id) from school_focus f where lower(f.subject)=lower(n.subject) and f.current_status='improving')::integer as improving_students,
      (select count(distinct f.student_id) from school_focus f where lower(f.subject)=lower(n.subject) and f.current_status='resolved')::integer as resolved_students,
      (select count(*) from school_focus f where lower(f.subject)=lower(n.subject) and f.current_status in ('emerging_strength','consistent_strength'))::integer as strength_areas,
      (select max(f.last_observed_at) from school_focus f where lower(f.subject)=lower(n.subject)) as latest_evidence_at
    from subject_names n
  ),
  class_rows as (
    select
      sc.class_id,
      sc.class_name,
      count(distinct sc.student_id)::integer as student_count,
      count(distinct f.student_id)::integer as tracked_students,
      (select round(avg(pa.accuracy)::numeric,1)
       from period_assignments pa join student_class sx on sx.student_id=pa.student_id
       where sx.class_id=sc.class_id) as assignment_average,
      count(distinct f.student_id) filter (where f.current_status='persistent')::integer as persistent_students,
      count(distinct f.student_id) filter (where f.current_status='improving')::integer as improving_students,
      count(distinct f.student_id) filter (where f.current_status='resolved')::integer as resolved_students,
      count(*) filter (where f.current_status='persistent')::integer as persistent_areas,
      count(*) filter (where f.priority='high')::integer as high_priority_areas
    from student_class sc
    left join school_focus f on f.student_id=sc.student_id
    group by sc.class_id, sc.class_name
  ),
  priority_skills as (
    select
      f.subject,
      f.topic,
      f.skill,
      count(distinct f.student_id) filter (where f.current_status='persistent')::integer as persistent_students,
      count(distinct f.student_id) filter (where f.current_status in ('new_focus','recurring'))::integer as recurring_students,
      count(distinct f.student_id) filter (where f.current_status='improving')::integer as improving_students,
      min(f.first_observed_at) as first_observed_at,
      max(f.last_observed_at) as last_observed_at,
      round(avg(f.latest_evidence_percentage)::numeric,1) as average_latest_evidence,
      count(distinct f.student_id) filter (
        where f.current_status='persistent' and f.last_observed_at < now() - interval '60 days'
      )::integer as stale_persistent_students
    from school_focus f
    where f.current_status in ('new_focus','recurring','persistent','improving')
    group by f.subject,f.topic,f.skill
  ),
  student_support as (
    select
      s.id as student_id,
      s.student_name,
      coalesce(sc.class_name, s.batch, 'Unassigned') as class_name,
      s.grade,
      count(*) filter (where f.current_status='persistent')::integer as persistent_count,
      count(*) filter (where f.current_status in ('new_focus','recurring'))::integer as recurring_count,
      count(*) filter (where f.current_status='improving')::integer as improving_count,
      count(*) filter (where f.current_status='resolved')::integer as resolved_count,
      count(*) filter (where f.current_status in ('emerging_strength','consistent_strength'))::integer as strength_count,
      max(f.last_observed_at) as latest_evidence_at,
      min(f.first_observed_at) filter (where f.current_status='persistent') as earliest_persistent_at,
      array_remove(array_agg(distinct f.subject) filter (where f.current_status in ('persistent','recurring','new_focus')), null) as focus_subjects
    from active_students s
    left join student_class sc on sc.student_id=s.id
    left join school_focus f on f.student_id=s.id
    group by s.id,s.student_name,s.grade,s.batch,sc.class_name
  ),
  strength_skills as (
    select f.subject,f.topic,f.skill,count(distinct f.student_id)::integer as students
    from school_focus f
    where f.current_status='consistent_strength'
    group by f.subject,f.topic,f.skill
  )
  select jsonb_build_object(
    'success', true,
    'school_id', p_school_id,
    'period', jsonb_build_object('days',v_days,'start',v_start,'end',now()),
    'summary', jsonb_build_object(
      'students', (select count(*) from active_students),
      'students_with_learning_memory', (select count(distinct student_id) from school_focus),
      'students_with_persistent_focus', (select count(*) from student_support where persistent_count>0),
      'students_improving', (select count(*) from student_support where improving_count>0),
      'students_with_resolved_areas', (select count(*) from student_support where resolved_count>0),
      'students_with_consistent_strengths', (select count(*) from student_support where strength_count>0),
      'persistent_focus_areas', (select count(*) from school_focus where current_status='persistent'),
      'stale_persistent_areas', (select count(*) from school_focus where current_status='persistent' and last_observed_at < now()-interval '60 days'),
      'recent_evidence_items', (select count(*) from recent_observations),
      'period_assignment_average', (select round(avg(accuracy)::numeric,1) from period_assignments),
      'period_completed_assignments', (select count(*) from period_assignments)
    ),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object(
      'subject',subject,'students_tracked',students_tracked,'assignment_average',assignment_average,
      'completed_assignments',completed_assignments,'persistent_areas',persistent_areas,
      'persistent_students',persistent_students,'improving_students',improving_students,
      'resolved_students',resolved_students,'strength_areas',strength_areas,'latest_evidence_at',latest_evidence_at
    ) order by persistent_students desc, subject) from subject_rows), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object(
      'class_id',class_id,'class_name',class_name,'student_count',student_count,'tracked_students',tracked_students,
      'assignment_average',assignment_average,'persistent_students',persistent_students,'improving_students',improving_students,
      'resolved_students',resolved_students,'persistent_areas',persistent_areas,'high_priority_areas',high_priority_areas
    ) order by persistent_students desc,class_name) from class_rows), '[]'::jsonb),
    'priority_skills', coalesce((select jsonb_agg(jsonb_build_object(
      'subject',subject,'topic',topic,'skill',skill,'persistent_students',persistent_students,
      'recurring_students',recurring_students,'improving_students',improving_students,
      'first_observed_at',first_observed_at,'last_observed_at',last_observed_at,
      'average_latest_evidence',average_latest_evidence,'stale_persistent_students',stale_persistent_students
    ) order by persistent_students desc,recurring_students desc,subject,skill)
      from (select * from priority_skills order by persistent_students desc,recurring_students desc limit 30) q), '[]'::jsonb),
    'students_needing_support', coalesce((select jsonb_agg(jsonb_build_object(
      'student_id',student_id,'student_name',student_name,'class_name',class_name,'grade',grade,
      'persistent_count',persistent_count,'recurring_count',recurring_count,'improving_count',improving_count,
      'resolved_count',resolved_count,'strength_count',strength_count,'latest_evidence_at',latest_evidence_at,
      'earliest_persistent_at',earliest_persistent_at,'focus_subjects',to_jsonb(coalesce(focus_subjects,array[]::text[]))
    ) order by persistent_count desc,recurring_count desc,student_name)
      from (select * from student_support where persistent_count>0 or recurring_count>0 order by persistent_count desc,recurring_count desc limit 50) q), '[]'::jsonb),
    'school_strengths', coalesce((select jsonb_agg(jsonb_build_object(
      'subject',subject,'topic',topic,'skill',skill,'students',students
    ) order by students desc,subject,skill)
      from (select * from strength_skills order by students desc limit 20) q), '[]'::jsonb),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.school_head_get_learning_intelligence(uuid, integer) from public, anon, authenticated;
grant execute on function public.school_head_get_learning_intelligence(uuid, integer) to authenticated, service_role;
