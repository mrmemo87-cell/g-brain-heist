-- Guardian parent dashboard contract hardening.
-- Applies to every verified guardian relationship in every school.
-- Keeps school scoping and guardian verification fail-closed while exposing only
-- the minimum additional identity/evidence metadata needed by the parent UI.

create or replace function public.rpc_guardian_my_children()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'relationship_id',r.id,
    'student_id',u.id,
    'student_name',coalesce(nullif(trim(u.full_name),''),u.username),
    'relationship_label',r.relationship_label,
    'grade',u.grade,
    'class_name',coalesce(
      (
        select nullif(trim(c.class_code),'')
        from public.class_students cs
        join public.classes c on c.id=cs.class_id
        where cs.student_id=u.id
          and c.school_id=r.school_id
          and c.is_active is true
        order by c.created_at desc,c.id desc
        limit 1
      ),
      nullif(trim(u.batch),''),
      '—'
    ),
    'school_id',s.id,
    'school_name',s.name,
    'school_logo_url',s.logo_url,
    'avatar_url',u.avatar_url,
    'verified_at',r.verified_at
  ) order by s.name,coalesce(u.full_name,u.username)),'[]'::jsonb)
  into v_result
  from public.student_guardian_relationships r
  join public.users u on u.id=r.student_id and u.school_id=r.school_id
  join public.schools s on s.id=r.school_id
  where r.guardian_user_id=v_caller
    and r.status='active';

  return v_result;
end;
$$;

revoke all on function public.rpc_guardian_my_children() from public, anon, authenticated;
grant execute on function public.rpc_guardian_my_children() to authenticated, service_role;

create or replace function public.rpc_guardian_child_progress(p_student_id uuid, p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_days integer := greatest(30,least(coalesce(p_days,90),365));
  v_start timestamptz := now()-make_interval(days=>greatest(30,least(coalesce(p_days,90),365)));
  v_school_id uuid;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  select r.school_id
  into v_school_id
  from public.student_guardian_relationships r
  where r.guardian_user_id=v_caller
    and r.student_id=p_student_id
    and r.status='active';

  if v_school_id is null then raise exception 'You are not authorised to view this student'; end if;

  with child as (
    select
      u.id,
      coalesce(nullif(trim(u.full_name),''),u.username) name,
      u.grade,
      coalesce(
        (
          select nullif(trim(c.class_code),'')
          from public.class_students cs
          join public.classes c on c.id=cs.class_id
          where cs.student_id=u.id
            and c.school_id=v_school_id
            and c.is_active is true
          order by c.created_at desc,c.id desc
          limit 1
        ),
        nullif(trim(u.batch),''),
        '—'
      ) class_name,
      u.avatar_url,
      s.name school_name,
      s.logo_url
    from public.users u
    join public.schools s on s.id=v_school_id
    where u.id=p_student_id and u.school_id=v_school_id
  ),
  current_focus as (
    select f.*
    from public.student_learning_focus_states f
    where f.school_id=v_school_id and f.student_id=p_student_id
  ),
  period_results as (
    select
      r.assignment_id,
      r.accuracy,
      r.correct,
      r.incorrect,
      r.score,
      r.completed_at,
      coalesce(nullif(trim(a.subject_name),''),nullif(trim(a.subject),''),nullif(trim(a.subject_id),''),'General') subject,
      coalesce(nullif(trim(a.title),''),nullif(trim(a.topic_name),''),'Assignment') title,
      coalesce(nullif(trim(a.topic_name),''),'General') topic
    from public.student_assignment_results r
    join public.assignments a on a.id=r.assignment_id and a.school_id=v_school_id
    where r.student_id=p_student_id and r.completed_at>=v_start
  ),
  period_assignments as (
    select
      sa.assignment_id,
      sa.status,
      sa.due_at,
      coalesce(nullif(trim(a.subject_name),''),nullif(trim(a.subject),''),nullif(trim(a.subject_id),''),'General') subject
    from public.student_assignments sa
    join public.assignments a on a.id=sa.assignment_id and a.school_id=v_school_id
    where sa.student_id=p_student_id and sa.assigned_at>=v_start
  ),
  subjects as (
    select subject from period_results
    union
    select subject from current_focus
  ),
  subject_rows as (
    select
      s.subject,
      (select round(avg(r.accuracy)::numeric,1) from period_results r where lower(r.subject)=lower(s.subject)) assignment_average,
      (select count(*) from period_results r where lower(r.subject)=lower(s.subject))::int completed_assignments,
      (select count(*) from current_focus f where lower(f.subject)=lower(s.subject) and f.current_status='persistent')::int persistent_focus_count,
      (select count(*) from current_focus f where lower(f.subject)=lower(s.subject) and f.current_status='improving')::int improving_count,
      (select count(*) from current_focus f where lower(f.subject)=lower(s.subject) and f.current_status='resolved')::int resolved_count,
      (select count(*) from current_focus f where lower(f.subject)=lower(s.subject) and f.current_status in('emerging_strength','consistent_strength'))::int strength_count
    from subjects s
  ),
  safe_timeline as (
    select
      o.id,
      o.subject,
      o.topic,
      o.skill,
      o.subskill,
      o.observation_type,
      o.source_type,
      o.source_id,
      o.observed_at,
      o.evidence_percentage,
      o.evidence_quality
    from public.student_learning_observations o
    where o.school_id=v_school_id
      and o.student_id=p_student_id
      and o.observed_at>=v_start
      and o.source_type in('assignment_result','writing_attempt')
    order by o.observed_at desc,o.id desc
    limit 120
  )
  select jsonb_build_object(
    'child',jsonb_build_object(
      'id',c.id,
      'name',c.name,
      'grade',c.grade,
      'class_name',c.class_name,
      'school_id',v_school_id,
      'school_name',c.school_name,
      'school_logo_url',c.logo_url,
      'avatar_url',c.avatar_url
    ),
    'period',jsonb_build_object('days',v_days,'start',v_start,'end',now()),
    'summary',jsonb_build_object(
      'assignment_average',(select round(avg(accuracy)::numeric,1) from period_results),
      'completed_assignments',(select count(*) from period_results),
      'assigned_assignments',(select count(*) from period_assignments),
      'overdue_assignments',(select count(*) from period_assignments where status<>'completed' and due_at is not null and due_at<now()),
      'persistent_focus_count',(select count(*) from current_focus where current_status='persistent'),
      'recurring_focus_count',(select count(*) from current_focus where current_status in('new_focus','recurring')),
      'improving_count',(select count(*) from current_focus where current_status='improving'),
      'resolved_count',(select count(*) from current_focus where current_status='resolved'),
      'strength_count',(select count(*) from current_focus where current_status in('emerging_strength','consistent_strength'))
    ),
    'subjects',coalesce((select jsonb_agg(to_jsonb(sr) order by sr.subject) from subject_rows sr),'[]'::jsonb),
    'focus_areas',coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject',f.subject,
        'topic',f.topic,
        'skill',f.skill,
        'subskill',f.subskill,
        'skill_key',f.skill_key,
        'status',f.current_status,
        'trend',f.trend,
        'priority',f.priority,
        'first_observed_at',f.first_observed_at,
        'last_observed_at',f.last_observed_at,
        'evidence_items',f.evidence_items,
        'latest_evidence_percentage',f.latest_evidence_percentage
      ) order by case f.priority when 'high' then 1 when 'medium' then 2 else 3 end,f.last_observed_at desc)
      from current_focus f
      where f.current_status in('new_focus','recurring','persistent')
    ),'[]'::jsonb),
    'improving',coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject',f.subject,
        'skill',f.skill,
        'subskill',f.subskill,
        'last_observed_at',f.last_observed_at,
        'evidence_items',f.evidence_items
      ) order by f.last_observed_at desc)
      from current_focus f where f.current_status='improving'
    ),'[]'::jsonb),
    'resolved',coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject',f.subject,
        'skill',f.skill,
        'subskill',f.subskill,
        'last_observed_at',f.last_observed_at,
        'evidence_items',f.evidence_items
      ) order by f.last_observed_at desc)
      from current_focus f where f.current_status='resolved'
    ),'[]'::jsonb),
    'strengths',coalesce((
      select jsonb_agg(jsonb_build_object(
        'subject',f.subject,
        'skill',f.skill,
        'subskill',f.subskill,
        'status',f.current_status,
        'last_observed_at',f.last_observed_at,
        'evidence_items',f.evidence_items
      ) order by f.last_observed_at desc)
      from current_focus f where f.current_status in('emerging_strength','consistent_strength')
    ),'[]'::jsonb),
    'recent_assignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignment_id',r.assignment_id,
        'title',r.title,
        'subject',r.subject,
        'topic',r.topic,
        'accuracy',r.accuracy,
        'correct',r.correct,
        'incorrect',r.incorrect,
        'completed_at',r.completed_at
      ) order by r.completed_at desc)
      from period_results r
    ),'[]'::jsonb),
    'timeline',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,
        'subject',t.subject,
        'topic',t.topic,
        'skill',t.skill,
        'subskill',t.subskill,
        'observation_type',t.observation_type,
        'source_type',t.source_type,
        'source_id',t.source_id,
        'observed_at',t.observed_at,
        'evidence_percentage',t.evidence_percentage,
        'evidence_quality',t.evidence_quality
      ) order by t.observed_at desc,t.id desc)
      from safe_timeline t
    ),'[]'::jsonb)
  )
  into v_result
  from child c;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke all on function public.rpc_guardian_child_progress(uuid,integer) from public, anon, authenticated;
grant execute on function public.rpc_guardian_child_progress(uuid,integer) to authenticated, service_role;
