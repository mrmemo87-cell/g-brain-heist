create or replace function private.year_rollover_set_target_enrolment(
  p_plan_id uuid,
  p_student_id uuid,
  p_class_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.school_year_rollover_plans%rowtype;
  v_source public.school_academic_years%rowtype;
  v_target public.school_academic_years%rowtype;
  v_class public.classes%rowtype;
  v_existing public.student_academic_enrolments%rowtype;
  v_count integer := 0;
  v_id uuid;
begin
  select * into v_plan
  from public.school_year_rollover_plans p
  where p.id = p_plan_id;
  select * into v_source from public.school_academic_years y
  where y.id = v_plan.source_academic_year_id and y.school_id = v_plan.school_id;
  select * into v_target from public.school_academic_years y
  where y.id = v_plan.target_academic_year_id and y.school_id = v_plan.school_id;
  select * into v_class from public.classes c
  where c.id = p_class_id and c.school_id = v_plan.school_id and coalesce(c.is_active, false);

  if v_plan.id is null or v_target.id is null or v_class.id is null then
    raise exception using errcode = '23503', message = 'rollover_target_context_missing';
  end if;

  if not exists (
    select 1
    from public.school_members sm
    where sm.school_id = v_plan.school_id
      and sm.user_id = p_student_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  ) then
    raise exception using errcode = '23514',
      message = 'rollover_student_membership_required';
  end if;

  select count(*)::integer into v_count
  from public.student_academic_enrolments e
  where e.student_id = p_student_id
    and e.academic_year_id = v_target.id;

  if v_count > 1 then
    raise exception using errcode = '23514',
      message = 'rollover_target_enrolment_requires_individual_review';
  end if;

  select * into v_existing
  from public.student_academic_enrolments e
  where e.student_id = p_student_id
    and e.academic_year_id = v_target.id
  order by e.created_at desc, e.id desc
  limit 1
  for update;

  if found then
    update public.student_academic_enrolments e
    set class_id = v_class.id,
        grade_level = v_class.grade_level,
        class_code = v_class.class_code,
        starts_on = v_target.starts_on,
        ends_on = v_target.ends_on,
        context_quality = 'confirmed',
        source = 'school_admin',
        created_by = coalesce(e.created_by, p_actor),
        updated_at = now()
    where e.id = v_existing.id
    returning e.id into v_id;
  else
    insert into public.student_academic_enrolments(
      school_id, student_id, academic_year_id, class_id,
      grade_level, class_code, starts_on, ends_on,
      context_quality, source, created_by
    ) values (
      v_plan.school_id, p_student_id, v_target.id, v_class.id,
      v_class.grade_level, v_class.class_code, v_target.starts_on, v_target.ends_on,
      'confirmed', 'school_admin', p_actor
    ) returning id into v_id;
  end if;

  update public.student_academic_enrolments e
  set ends_on = least(coalesce(e.ends_on, v_source.ends_on), v_source.ends_on),
      updated_at = now()
  where e.student_id = p_student_id
    and e.academic_year_id = v_source.id;

  return v_id;
end;
$function$;
