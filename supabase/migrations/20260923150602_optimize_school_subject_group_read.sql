-- Optimize school-admin teaching-group reads after automatic by-class group materialization.
-- Production migration version: 20260923150602.
-- Replaces per-group roster evaluation with one set-based school/year read.

create or replace function public.rpc_school_admin_subject_groups(
  p_school_id uuid,
  p_offering_id uuid default null::uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_year_id uuid;
begin
  if auth.uid() is null
     or not coalesce(public.can_administer_school(p_school_id), false) then
    raise exception using errcode='42501', message='school_administrator_access_required';
  end if;

  v_year_id := public.academic_resolve_operational_year_id(p_school_id, now());

  return coalesce((
    with base_groups as materialized (
      select
        g.id,
        g.school_id,
        g.school_subject_offering_id,
        g.name,
        g.group_type,
        g.registration_class_id,
        g.status,
        g.sort_order,
        o.id as offering_id,
        o.academic_year_id,
        o.grade_level,
        o.access_mode,
        o.delivery_mode,
        o.school_subject_id,
        s.name as school_subject_name,
        s.academic_subject_id,
        a.name as academic_subject_name,
        a.code as academic_subject_code
      from public.school_subject_groups g
      join public.school_subject_offerings o
        on o.id = g.school_subject_offering_id
       and o.school_id = g.school_id
      join public.school_subjects s
        on s.id = o.school_subject_id
       and s.school_id = g.school_id
      left join public.academic_subjects a
        on a.id = s.academic_subject_id
      where g.school_id = p_school_id
        and g.status = 'active'
        and o.status = 'active'
        and o.academic_year_id = v_year_id
        and (p_offering_id is null or o.id = p_offering_id)
    ),
    offering_set as materialized (
      select distinct
        bg.offering_id,
        bg.school_id,
        bg.academic_year_id,
        bg.grade_level,
        bg.access_mode,
        bg.school_subject_id
      from base_groups bg
    ),
    offering_students as materialized (
      select distinct
        os.offering_id,
        u.id as student_id,
        c.id as class_id
      from offering_set os
      join public.student_academic_enrolments ae
        on ae.school_id = os.school_id
       and ae.academic_year_id = os.academic_year_id
       and ae.grade_level = os.grade_level
       and ae.starts_on <= current_date
       and (ae.ends_on is null or ae.ends_on >= current_date)
      join public.school_members sm
        on sm.school_id = os.school_id
       and sm.user_id = ae.student_id
       and sm.status = 'active'
       and sm.role_in_school = 'student'
      join public.users u
        on u.id = sm.user_id
       and not coalesce(u.is_banned, false)
       and (u.banned_until is null or u.banned_until <= now())
      join public.class_students cs
        on cs.student_id = u.id
       and cs.class_id = ae.class_id
      join public.classes c
        on c.id = cs.class_id
       and c.school_id = os.school_id
       and c.grade_level = os.grade_level
       and coalesce(c.is_active, true)
      where os.access_mode = 'all_grade'
         or exists (
           select 1
           from public.school_subject_enrolments e
           where e.school_id = os.school_id
             and e.school_subject_id = os.school_subject_id
             and e.academic_year_id = os.academic_year_id
             and e.student_id = u.id
             and e.status = 'active'
             and e.starts_on <= current_date
             and (e.ends_on is null or e.ends_on >= current_date)
         )
    ),
    group_student_counts as (
      select
        bg.id as group_id,
        count(distinct os.student_id)::integer as student_count
      from base_groups bg
      left join offering_students os
        on os.offering_id = bg.offering_id
       and (
         (bg.group_type = 'class' and os.class_id = bg.registration_class_id)
         or bg.group_type = 'whole_grade'
         or (
           bg.group_type = 'custom'
           and exists (
             select 1
             from public.school_subject_group_students m
             where m.group_id = bg.id
               and m.school_id = bg.school_id
               and m.student_id = os.student_id
               and m.status = 'active'
               and m.starts_on <= current_date
               and (m.ends_on is null or m.ends_on >= current_date)
           )
         )
       )
      group by bg.id
    ),
    group_teachers as (
      select
        t.group_id,
        jsonb_agg(
          jsonb_build_object(
            'userId', t.teacher_user_id,
            'name', coalesce(nullif(u.full_name,''), u.username),
            'canCreate', t.can_create,
            'canGrade', t.can_grade
          )
          order by u.username
        ) as teachers
      from public.school_subject_group_teachers t
      join public.users u
        on u.id = t.teacher_user_id
      join public.school_members sm
        on sm.school_id = t.school_id
       and sm.user_id = t.teacher_user_id
       and sm.status = 'active'
       and (sm.can_teach or sm.role_in_school = 'teacher')
      where t.school_id = p_school_id
        and t.active
      group by t.group_id
    )
    select jsonb_agg(
      jsonb_build_object(
        'id', bg.id,
        'schoolId', bg.school_id,
        'offeringId', bg.offering_id,
        'schoolSubjectId', bg.school_subject_id,
        'schoolSubjectName', bg.school_subject_name,
        'academicSubjectId', bg.academic_subject_id,
        'academicSubjectName', bg.academic_subject_name,
        'academicSubjectCode', bg.academic_subject_code,
        'academicYearId', bg.academic_year_id,
        'gradeLevel', bg.grade_level,
        'accessMode', bg.access_mode,
        'deliveryMode', bg.delivery_mode,
        'name', bg.name,
        'groupType', bg.group_type,
        'registrationClassId', bg.registration_class_id,
        'status', bg.status,
        'studentCount', coalesce(sc.student_count, 0),
        'teachers', coalesce(gt.teachers, '[]'::jsonb)
      )
      order by bg.sort_order, bg.name
    )
    from base_groups bg
    left join group_student_counts sc
      on sc.group_id = bg.id
    left join group_teachers gt
      on gt.group_id = bg.id
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.rpc_school_admin_subject_groups(uuid,uuid)
from public, anon, authenticated, service_role;

grant execute on function public.rpc_school_admin_subject_groups(uuid,uuid)
to authenticated, service_role;
