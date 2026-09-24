-- Fix verified school signup class placement.
-- A student-selected approved class must remain authoritative and may not
-- silently degrade to an awaiting-placement record.

create or replace function private.academic_sync_operational_student_placement(
  p_school_id uuid,
  p_student_id uuid,
  p_class_id uuid,
  p_actor uuid,
  p_source text default 'school_admin'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_year public.school_academic_years%rowtype;
  v_class public.classes%rowtype;
  v_existing public.student_academic_enrolments%rowtype;
  v_id uuid;
  v_source text;
begin
  if p_school_id is null or p_student_id is null or p_class_id is null then
    raise exception using errcode = '23502',
      message = 'operational_student_placement_context_required';
  end if;

  if not exists (
    select 1
    from public.school_members sm
    where sm.school_id = p_school_id
      and sm.user_id = p_student_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
  ) then
    raise exception using errcode = '23514',
      message = 'operational_student_membership_required';
  end if;

  select * into v_class
  from public.classes c
  where c.id = p_class_id
    and c.school_id = p_school_id
    and coalesce(c.is_active, true);

  if v_class.id is null then
    raise exception using errcode = '23503',
      message = 'operational_student_class_not_available';
  end if;

  select * into v_year
  from public.school_academic_years y
  where y.id = public.academic_resolve_operational_year_id(p_school_id, now())
    and y.school_id = p_school_id;

  if v_year.id is null then
    raise exception using errcode = '23503',
      message = 'operational_academic_year_not_available';
  end if;

  v_source := lower(trim(coalesce(p_source,'')));
  if v_source not in ('school_admin','current_placement_baseline','placement_event','import') then
    v_source := 'placement_event';
  end if;

  select e.* into v_existing
  from public.student_academic_enrolments e
  where e.school_id = p_school_id
    and e.student_id = p_student_id
    and e.academic_year_id = v_year.id
  order by case e.context_quality when 'confirmed' then 0 else 1 end,
           e.updated_at desc,
           e.id
  limit 1
  for update;

  if v_existing.id is not null then
    update public.student_academic_enrolments e
    set class_id = v_class.id,
        grade_level = v_class.grade_level,
        class_code = v_class.class_code,
        starts_on = coalesce(e.starts_on, v_year.starts_on),
        ends_on = coalesce(e.ends_on, v_year.ends_on),
        context_quality = 'confirmed',
        source = v_source,
        created_by = coalesce(e.created_by, p_actor),
        updated_at = now()
    where e.id = v_existing.id
    returning e.id into v_id;
  else
    insert into public.student_academic_enrolments (
      school_id,student_id,academic_year_id,class_id,grade_level,class_code,
      starts_on,ends_on,context_quality,source,created_by
    ) values (
      p_school_id,p_student_id,v_year.id,v_class.id,v_class.grade_level,v_class.class_code,
      v_year.starts_on,v_year.ends_on,'confirmed',v_source,p_actor
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function private.academic_sync_operational_student_placement(uuid,uuid,uuid,uuid,text)
from public,anon,authenticated,service_role;

create or replace function public.rpc_setup_approved_class_enrollment(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.school_members%rowtype;
  v_class public.classes%rowtype;
  v_current_class_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success',false,'error','Not authenticated');
  end if;

  select * into v_member
  from public.school_members sm
  where sm.user_id=v_uid
    and sm.status='active'
    and sm.role_in_school='student'
  for update;

  if v_member.id is null then
    return jsonb_build_object('success',false,'error','Active student membership required.');
  end if;

  select * into v_class
  from public.classes c
  where c.id=p_class_id
    and c.school_id=v_member.school_id
    and c.is_active is distinct from false
  for share;

  if v_class.id is null then
    return jsonb_build_object(
      'success',false,
      'status','awaiting_placement',
      'error','Choose an approved active class from your school.'
    );
  end if;

  select cs.class_id into v_current_class_id
  from public.class_students cs
  join public.classes current_class on current_class.id=cs.class_id
  where cs.student_id=v_uid
    and current_class.school_id=v_member.school_id
  order by cs.joined_at,cs.class_id
  limit 1;

  if v_current_class_id is not null and v_current_class_id<>v_class.id then
    return jsonb_build_object(
      'success',false,
      'error','You are already placed in a class. Ask a school administrator to move you.'
    );
  end if;

  insert into public.class_students(class_id,student_id)
  values(v_class.id,v_uid)
  on conflict (class_id,student_id) do nothing;

  update public.users
  set grade=v_class.grade_level,
      batch=v_class.class_code,
      updated_at=now()
  where id=v_uid;

  perform private.academic_sync_operational_student_placement(
    v_member.school_id,
    v_uid,
    v_class.id,
    v_uid,
    'placement_event'
  );

  insert into public.school_student_placement_history(
    school_id,student_user_id,actor_user_id,event_type,
    to_class_id,to_class_code,to_grade,reason,effective_date,metadata
  )
  select
    v_member.school_id,
    v_uid,
    v_uid,
    'assigned',
    v_class.id,
    v_class.class_code,
    v_class.grade_level,
    'Student selected an approved class during verified onboarding',
    current_date,
    jsonb_build_object('source','verified_self_registration')
  where not exists(
    select 1
    from public.school_student_placement_history h
    where h.school_id=v_member.school_id
      and h.student_user_id=v_uid
      and h.to_class_id=v_class.id
      and h.metadata->>'source'='verified_self_registration'
  );

  update public.school_student_placement_exceptions e
  set status='resolved',
      resolved_at=now(),
      resolved_by=v_uid,
      resolution_action='verified_self_registration',
      resolution_note='Student selected an approved registration class during verified onboarding.',
      resolution_effective_date=current_date
  where e.school_id=v_member.school_id
    and e.student_user_id=v_uid
    and e.status='open'
    and e.issue_code='student_self_reported_missing_class';

  return jsonb_build_object(
    'success',true,
    'status','enrolled',
    'class_id',v_class.id,
    'class_code',v_class.class_code,
    'created_class',false,
    'enrolled',true
  );
end;
$$;

revoke all on function public.rpc_setup_approved_class_enrollment(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_setup_approved_class_enrollment(uuid)
to authenticated;

notify pgrst,'reload schema';
