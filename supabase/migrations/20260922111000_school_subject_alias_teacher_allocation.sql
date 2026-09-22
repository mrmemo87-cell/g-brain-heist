-- Keep teacher permissions canonical when a school uses a local subject label.
-- Example: Silk Road can allocate "ESL" while the stored teacher permission
-- remains "English", preserving the existing question-bank and reporting rules.

create or replace function public.admin_allocate_teacher_to_class_subject(
  p_school_id uuid,
  p_class_id uuid,
  p_teacher_user_id uuid,
  p_subject text,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allocation_id uuid;
  v_subject text := trim(coalesce(p_subject, ''));
begin
  if (select auth.uid()) is null
     or not coalesce(public.can_administer_school(p_school_id), false) then
    return jsonb_build_object('success', false, 'error', 'You do not have permission to manage teacher allocations.');
  end if;

  if not exists (
    select 1 from public.classes
    where id = p_class_id and school_id = p_school_id and is_active is distinct from false
  ) then
    return jsonb_build_object('success', false, 'error', 'Choose an active class from this school.');
  end if;

  if not exists (
    select 1 from public.school_members
    where school_id = p_school_id
      and user_id = p_teacher_user_id
      and status = 'active'
      and can_teach
  ) then
    return jsonb_build_object('success', false, 'error', 'Choose a member with active teaching access.');
  end if;

  select subject.name into v_subject
  from public.academic_subject_aliases alias
  join public.academic_subjects subject
    on subject.id = alias.academic_subject_id and subject.is_active
  where alias.alias_key = public.academic_normalize_subject_key(p_subject)
    and (alias.school_id = p_school_id or alias.school_id is null)
  order by (alias.school_id = p_school_id) desc, alias.school_id nulls last
  limit 1;

  v_subject := coalesce(nullif(trim(v_subject), ''), trim(p_subject));

  select id into v_allocation_id
  from public.class_teacher_assignments
  where school_id = p_school_id
    and class_id = p_class_id
    and teacher_user_id = p_teacher_user_id
    and private.teacher_assignment_subject_key(subject) = private.teacher_assignment_subject_key(v_subject);

  if v_allocation_id is null then
    insert into public.class_teacher_assignments(
      school_id, class_id, teacher_user_id, subject, active, created_by
    ) values (
      p_school_id, p_class_id, p_teacher_user_id, v_subject, p_active, (select auth.uid())
    ) returning id into v_allocation_id;
  else
    update public.class_teacher_assignments
    set active = p_active,
        subject = v_subject
    where id = v_allocation_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'allocation_id', v_allocation_id,
    'canonical_subject', v_subject
  );
end;
$$;

revoke all on function public.admin_allocate_teacher_to_class_subject(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_allocate_teacher_to_class_subject(uuid, uuid, uuid, text, boolean)
  to authenticated;

create or replace function public.rpc_school_admin_subject_provisioning_state(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not (
    public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)
  ) then
    raise exception using errcode = '42501', message = 'school_administrator_access_required';
  end if;

  return jsonb_build_object(
    'success', true,
    'offerings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mappingId', m.id,
        'schoolSubjectId', m.school_subject_id,
        'academicYearId', m.academic_year_id,
        'gradeLevel', m.grade_level,
        'academicSubjectId', m.academic_subject_id,
        'canonicalName', a.name,
        'displayName', coalesce(nullif(trim(m.display_name), ''), a.name),
        'scopeId', m.curriculum_scope_id,
        'accessMode', case when m.subject_requirement = 'elective' then 'selected' else 'all_grade' end,
        'selectedStudentIds', coalesce((
          select jsonb_agg(se.student_id order by se.student_id)
          from public.student_subject_enrolments se
          where se.school_id = m.school_id
            and se.academic_year_id = m.academic_year_id
            and se.academic_subject_id = m.academic_subject_id
            and se.status = 'active'
            and exists (
              select 1 from public.student_academic_enrolments e
              where e.student_id = se.student_id
                and e.school_id = m.school_id
                and e.academic_year_id = m.academic_year_id
                and e.grade_level = m.grade_level
            )
        ), '[]'::jsonb),
        'teacherUserIds', coalesce((
          select jsonb_agg(distinct cta.teacher_user_id)
          from public.class_teacher_assignments cta
          join public.classes c on c.id = cta.class_id and c.school_id = cta.school_id
          where cta.school_id = m.school_id
            and cta.active
            and c.grade_level::text = m.grade_level
            and private.teacher_assignment_subject_key(cta.subject) = private.teacher_assignment_subject_key(a.name)
        ), '[]'::jsonb),
        'classIds', coalesce((
          select jsonb_agg(distinct cta.class_id)
          from public.class_teacher_assignments cta
          join public.classes c on c.id = cta.class_id and c.school_id = cta.school_id
          where cta.school_id = m.school_id
            and cta.active
            and c.grade_level::text = m.grade_level
            and private.teacher_assignment_subject_key(cta.subject) = private.teacher_assignment_subject_key(a.name)
        ), '[]'::jsonb)
      ) order by m.academic_year_id desc, m.grade_level, coalesce(m.display_name, a.name))
      from public.school_curriculum_scope_mappings m
      join public.academic_subjects a on a.id = m.academic_subject_id
      where m.school_id = p_school_id
        and m.status in ('planned', 'active')
        and (m.school_subject_id is not null or nullif(trim(m.display_name), '') is not null)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_school_admin_subject_provisioning_state(uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_school_admin_subject_provisioning_state(uuid)
  to authenticated, service_role;
