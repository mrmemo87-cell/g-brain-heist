-- Allow an allocated teacher to maintain the roster of a custom teaching group.
-- Selecting a valid learner also activates the matching selective subject enrolment
-- for the current operational academic year, so newly joined students do not need
-- a separate school-admin enrolment step before they can join the group.

create or replace function public.rpc_teacher_set_subject_group_students(
  p_school_id uuid,
  p_group_id uuid,
  p_student_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid := auth.uid();
  v_group public.school_subject_groups;
  v_offering public.school_subject_offerings;
begin
  if v_actor is null then
    raise exception using errcode='42501', message='authentication_required';
  end if;
  if p_student_ids is null or array_position(p_student_ids,null) is not null then
    raise exception 'student_ids_required';
  end if;

  select * into v_group
  from public.school_subject_groups
  where id=p_group_id and school_id=p_school_id and status='active'
  for update;
  if not found or v_group.group_type <> 'custom' then
    raise exception 'active_custom_group_required';
  end if;

  if not exists (
    select 1
    from public.school_subject_group_teachers gt
    join public.school_members sm
      on sm.school_id=gt.school_id
     and sm.user_id=gt.teacher_user_id
     and sm.status='active'
     and (sm.can_teach or sm.role_in_school='teacher')
    where gt.school_id=p_school_id
      and gt.group_id=p_group_id
      and gt.teacher_user_id=v_actor
      and gt.active
      and gt.can_create
  ) then
    raise exception using errcode='42501', message='teaching_group_create_allocation_required';
  end if;

  select * into v_offering
  from public.school_subject_offerings
  where id=v_group.school_subject_offering_id
    and school_id=p_school_id
    and status='active'
    and academic_year_id=public.academic_resolve_operational_year_id(p_school_id,now());
  if not found then
    raise exception 'active_subject_offering_required';
  end if;

  if exists (
    select 1
    from unnest(p_student_ids) selected(student_id)
    where not exists (
      select 1
      from public.student_academic_enrolments ae
      join public.school_members sm
        on sm.school_id=ae.school_id
       and sm.user_id=ae.student_id
       and sm.status='active'
       and sm.role_in_school='student'
      join public.users u
        on u.id=ae.student_id
       and not coalesce(u.is_banned,false)
       and (u.banned_until is null or u.banned_until<=now())
      left join public.classes c
        on c.id=ae.class_id
       and c.school_id=ae.school_id
       and c.grade_level=v_offering.grade_level
       and coalesce(c.is_active,true)
      left join public.class_students cs
        on cs.class_id=c.id
       and cs.student_id=ae.student_id
      where ae.student_id=selected.student_id
        and ae.school_id=p_school_id
        and ae.academic_year_id=v_offering.academic_year_id
        and ae.grade_level=v_offering.grade_level
        and ae.starts_on<=current_date
        and (ae.ends_on is null or ae.ends_on>=current_date)
        and (ae.class_id is null or (c.id is not null and cs.student_id is not null))
    )
  ) then
    raise exception 'student_not_eligible_for_subject_group';
  end if;

  insert into public.school_subject_enrolments(
    school_id,school_subject_id,academic_year_id,student_id,status,starts_on,ends_on,created_by
  )
  select
    p_school_id,v_offering.school_subject_id,v_offering.academic_year_id,selected.student_id,
    'active',current_date,null,v_actor
  from (select distinct unnest(p_student_ids) student_id) selected
  on conflict (student_id,academic_year_id,school_subject_id)
  do update set
    status='active',
    starts_on=least(public.school_subject_enrolments.starts_on,current_date),
    ends_on=null,
    updated_at=now();

  update public.school_subject_group_students
     set status='withdrawn',
         ends_on=greatest(starts_on,current_date),
         updated_at=now()
   where group_id=p_group_id
     and status='active'
     and not(student_id=any(p_student_ids));

  insert into public.school_subject_group_students(
    school_id,group_id,student_id,status,starts_on,ends_on,created_by
  )
  select p_school_id,p_group_id,selected.student_id,'active',current_date,null,v_actor
  from (select distinct unnest(p_student_ids) student_id) selected
  where not exists (
    select 1
    from public.school_subject_group_students existing
    where existing.group_id=p_group_id
      and existing.student_id=selected.student_id
      and existing.status='active'
  );
end
$function$;

revoke all on function public.rpc_teacher_set_subject_group_students(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.rpc_teacher_set_subject_group_students(uuid,uuid,uuid[]) to authenticated;
