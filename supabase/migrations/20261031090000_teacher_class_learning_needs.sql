-- Class-level view of shared learning needs.
--
-- Teachers plan lessons for a class, but every learning-need screen was per student. This RPC
-- answers "which needs do students in this class share?" for one subject: each active focus
-- (registry key, current academic year) with the students who have it, so a need shared by
-- eight students becomes a whole-class starter and a need held by one stays individual practice.
--
-- Authorization is per student, reusing the intervention gate
-- (public.student_learning_can_manage_intervention): students the caller may not manage for this
-- subject are silently dropped and reported in students_excluded. Read-only.

create or replace function public.rpc_teacher_class_learning_needs(p_student_ids uuid[], p_subject text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_subject text := lower(trim(coalesce(p_subject, '')));
  v_ids uuid[];
  v_excluded integer := 0;
  v_result jsonb;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;
  if v_subject = '' then raise exception 'A subject is required'; end if;
  if coalesce(cardinality(p_student_ids), 0) = 0 then
    return jsonb_build_object('needs', '[]'::jsonb, 'students', '[]'::jsonb, 'students_considered', 0, 'students_excluded', 0);
  end if;
  if cardinality(p_student_ids) > 200 then raise exception 'Too many students for one class view'; end if;

  select coalesce(array_agg(s.id), '{}'::uuid[]) into v_ids
  from unnest(p_student_ids) as s(id)
  where public.student_learning_can_manage_intervention(s.id, p_subject);
  v_excluded := cardinality(p_student_ids) - coalesce(cardinality(v_ids), 0);

  with roster as (
    select u.id, coalesce(nullif(trim(u.full_name), ''), u.username) as name, u.school_id,
      public.academic_resolve_operational_year_id(u.school_id, now()) as year_id
    from public.users u
    where u.id = any(v_ids)
  ),
  focus as (
    select f.student_id, r.name, f.skill_key, f.subject, f.topic, f.skill, f.subskill,
      f.current_status, f.trend, f.priority, f.evidence_items, f.last_observed_at,
      exists (
        select 1 from public.student_learning_professional_reviews pr
        where pr.student_id = f.student_id and pr.skill_key = f.skill_key and pr.decision = 'confirmed'
      ) as confirmed,
      exists (
        select 1 from public.student_learning_interventions i
        where i.student_id = f.student_id and i.skill_key = f.skill_key and i.status in ('planned', 'active')
      ) as plan_open
    from public.student_learning_focus_states f
    join roster r on r.id = f.student_id
    where f.academic_year_id = r.year_id
      and f.current_status in ('new_focus', 'recurring', 'persistent', 'improving')
      and lower(trim(f.subject)) = v_subject
      and f.skill_key like 'registry:%'
  ),
  needs as (
    select skill_key, min(subject) as subject, min(topic) as topic, min(skill) as skill, min(subskill) as subskill,
      count(*)::integer as student_count,
      sum(evidence_items)::integer as evidence_items,
      count(*) filter (where confirmed)::integer as confirmed_count,
      count(*) filter (where plan_open)::integer as plan_count,
      count(*) filter (where current_status in ('recurring', 'persistent'))::integer as recurring_count,
      max(last_observed_at) as last_observed_at,
      jsonb_agg(jsonb_build_object(
        'id', student_id, 'name', name, 'status', current_status, 'trend', trend,
        'evidence_items', evidence_items, 'last_observed_at', last_observed_at,
        'confirmed', confirmed, 'plan_open', plan_open
      ) order by evidence_items desc, name) as students
    from focus
    group by skill_key
  )
  select jsonb_build_object(
    'subject', p_subject,
    'students_considered', coalesce(cardinality(v_ids), 0),
    'students_excluded', v_excluded,
    'needs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'skill_key', n.skill_key, 'subject', n.subject, 'topic', n.topic, 'skill', n.skill, 'subskill', n.subskill,
        'student_count', n.student_count, 'evidence_items', n.evidence_items,
        'confirmed_count', n.confirmed_count, 'plan_count', n.plan_count, 'recurring_count', n.recurring_count,
        'last_observed_at', n.last_observed_at, 'students', n.students
      ) order by n.student_count desc, n.evidence_items desc, n.subskill)
      from needs n
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name,
        'need_count', (select count(*) from focus f where f.student_id = r.id),
        'has_evidence', exists (
          select 1 from public.student_learning_focus_states f
          where f.student_id = r.id and f.academic_year_id = r.year_id and lower(trim(f.subject)) = v_subject),
        'confirmed_count', (select count(*) from focus f where f.student_id = r.id and f.confirmed),
        'plan_count', (select count(*) from focus f where f.student_id = r.id and f.plan_open)
      ) order by r.name)
      from roster r
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.rpc_teacher_class_learning_needs(uuid[], text) from public, anon;
grant execute on function public.rpc_teacher_class_learning_needs(uuid[], text) to authenticated, service_role;
