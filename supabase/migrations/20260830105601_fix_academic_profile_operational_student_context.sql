-- Keep operational/current Academic Profiles tied to the live School Admin placement.
-- Historical years continue to use academic enrolment history.

do $migration$
declare
  v_oid oid;
  v_def text;
  v_old text := $old$
  select e.grade_level, e.class_id
  into v_grade, v_class
  from public.student_academic_enrolments e
  where e.student_id = v_student
    and e.school_id = v_school
    and e.academic_year_id = v_year
  order by case e.context_quality when 'confirmed' then 0 else 1 end,
           e.updated_at desc,
           e.id
  limit 1;

  if v_grade is null and v_year = v_operational_year then
    select c.grade_level, c.id
    into v_grade, v_class
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = v_school
     and coalesce(c.is_active, true)
    join public.school_members sm
      on sm.school_id = v_school
     and sm.user_id = cs.student_id
     and sm.status = 'active'
     and sm.role_in_school = 'student'
    where cs.student_id = v_student
    order by cs.joined_at desc nulls last, c.created_at desc, c.id
    limit 1;
  end if;
$old$;
  v_new text := $new$
  if v_year = v_operational_year then
    -- Current/operational year: live class placement is authoritative.
    select c.grade_level, c.id
    into v_grade, v_class
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = v_school
     and coalesce(c.is_active, true)
    join public.school_members sm
      on sm.school_id = v_school
     and sm.user_id = cs.student_id
     and sm.status = 'active'
     and sm.role_in_school = 'student'
    where cs.student_id = v_student
    order by cs.joined_at desc nulls last, c.created_at desc, c.id
    limit 1;
  else
    -- Historical years remain reproducible from year-specific enrolment history.
    select e.grade_level, e.class_id
    into v_grade, v_class
    from public.student_academic_enrolments e
    where e.student_id = v_student
      and e.school_id = v_school
      and e.academic_year_id = v_year
    order by case e.context_quality when 'confirmed' then 0 else 1 end,
             e.updated_at desc,
             e.id
    limit 1;
  end if;
$new$;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'rpc_student_academic_subjects_for_year'
    and pg_get_function_identity_arguments(p.oid) = 'p_student_id uuid, p_academic_year_id uuid';

  if v_oid is null then
    raise exception 'rpc_student_academic_subjects_for_year signature not found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position(v_new in v_def) = 0 then
    if position(v_old in v_def) = 0 then
      raise exception 'rpc_student_academic_subjects_for_year live-placement patch target not found';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;
end;
$migration$;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_old_declare text := $old$
  v_enrol public.student_academic_enrolments%rowtype;
  v_from timestamptz;
$old$;
  v_new_declare text := $new$
  v_enrol public.student_academic_enrolments%rowtype;
  v_live_class public.classes%rowtype;
  v_operational_year_id uuid;
  v_from timestamptz;
$new$;
  v_old_year_guard text := $old$
  if not found then
    raise exception 'Academic year not available for student';
  end if;

  v_from := greatest(
$old$;
  v_new_year_guard text := $new$
  if not found then
    raise exception 'Academic year not available for student';
  end if;

  v_operational_year_id := public.academic_resolve_operational_year_id(v_school_id, now());

  v_from := greatest(
$new$;
  v_old_context text := $old$
  select e.* into v_enrol
  from public.student_academic_enrolments e
  where e.student_id = v_student_id
    and e.school_id = v_school_id
    and e.academic_year_id = p_academic_year_id
  order by case e.context_quality when 'confirmed' then 0 else 1 end,
           e.updated_at desc,
           e.id
  limit 1;

  if v_enrol.id is not null then
    v_result := jsonb_set(
      v_result,
      '{student}',
      coalesce(v_result->'student', '{}'::jsonb) || jsonb_build_object(
        'grade', v_enrol.grade_level,
        'class_name', coalesce(
          (
            select coalesce(
              nullif(trim(c.class_code), ''),
              nullif(trim(c.class_name), '')
            )
            from public.classes c
            where c.id = v_enrol.class_id
          ),
          v_enrol.class_code
        )
      ),
      true
    );
  end if;
$old$;
  v_new_context text := $new$
  if v_year.id = v_operational_year_id then
    -- Current/operational year: mirror the active live placement shown by School Admin.
    select c.* into v_live_class
    from public.class_students cs
    join public.classes c
      on c.id = cs.class_id
     and c.school_id = v_school_id
     and coalesce(c.is_active, true)
    join public.school_members sm
      on sm.school_id = v_school_id
     and sm.user_id = cs.student_id
     and sm.status = 'active'
     and sm.role_in_school = 'student'
    where cs.student_id = v_student_id
    order by cs.joined_at desc nulls last, c.created_at desc, c.id
    limit 1;

    if v_live_class.id is not null then
      v_result := jsonb_set(
        v_result,
        '{student}',
        coalesce(v_result->'student', '{}'::jsonb) || jsonb_build_object(
          'grade', v_live_class.grade_level,
          'class_name', coalesce(
            nullif(trim(v_live_class.class_code), ''),
            nullif(trim(v_live_class.class_name), ''),
            '—'
          )
        ),
        true
      );
    end if;
  else
    -- Historical years continue to use the stored academic-year enrolment.
    select e.* into v_enrol
    from public.student_academic_enrolments e
    where e.student_id = v_student_id
      and e.school_id = v_school_id
      and e.academic_year_id = p_academic_year_id
    order by case e.context_quality when 'confirmed' then 0 else 1 end,
             e.updated_at desc,
             e.id
    limit 1;

    if v_enrol.id is not null then
      v_result := jsonb_set(
        v_result,
        '{student}',
        coalesce(v_result->'student', '{}'::jsonb) || jsonb_build_object(
          'grade', v_enrol.grade_level,
          'class_name', coalesce(
            (
              select coalesce(
                nullif(trim(c.class_code), ''),
                nullif(trim(c.class_name), '')
              )
              from public.classes c
              where c.id = v_enrol.class_id
            ),
            v_enrol.class_code
          )
        ),
        true
      );
    end if;
  end if;
$new$;
  v_old_archived text := $old$'archived', v_year.id <> public.academic_resolve_year_id(v_school_id, now())$old$;
  v_new_archived text := $new$'archived', v_year.id <> v_operational_year_id$new$;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'rpc_student_academic_profile_for_year'
    and pg_get_function_identity_arguments(p.oid) =
      'p_student_id uuid, p_subject text, p_academic_year_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone';

  if v_oid is null then
    raise exception 'rpc_student_academic_profile_for_year signature not found';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position(v_new_declare in v_def) = 0 then
    if position(v_old_declare in v_def) = 0 then
      raise exception 'rpc_student_academic_profile_for_year declaration patch target not found';
    end if;
    v_def := replace(v_def, v_old_declare, v_new_declare);
  end if;

  if position(v_new_year_guard in v_def) = 0 then
    if position(v_old_year_guard in v_def) = 0 then
      raise exception 'rpc_student_academic_profile_for_year operational-year patch target not found';
    end if;
    v_def := replace(v_def, v_old_year_guard, v_new_year_guard);
  end if;

  if position(v_new_context in v_def) = 0 then
    if position(v_old_context in v_def) = 0 then
      raise exception 'rpc_student_academic_profile_for_year live-context patch target not found';
    end if;
    v_def := replace(v_def, v_old_context, v_new_context);
  end if;

  if position(v_new_archived in v_def) = 0 then
    if position(v_old_archived in v_def) = 0 then
      raise exception 'rpc_student_academic_profile_for_year archived-state patch target not found';
    end if;
    v_def := replace(v_def, v_old_archived, v_new_archived);
  end if;

  execute v_def;
end;
$migration$;

-- Keep canonical current-year enrolment aligned when a live class placement is actually changed.
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
        source = coalesce(nullif(trim(p_source), ''), 'school_admin'),
        created_by = coalesce(e.created_by, p_actor),
        updated_at = now()
    where e.id = v_existing.id
    returning e.id into v_id;
  else
    insert into public.student_academic_enrolments (
      school_id,
      student_id,
      academic_year_id,
      class_id,
      grade_level,
      class_code,
      starts_on,
      ends_on,
      context_quality,
      source,
      created_by
    ) values (
      p_school_id,
      p_student_id,
      v_year.id,
      v_class.id,
      v_class.grade_level,
      v_class.class_code,
      v_year.starts_on,
      v_year.ends_on,
      'confirmed',
      coalesce(nullif(trim(p_source), ''), 'school_admin'),
      p_actor
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function private.academic_sync_operational_student_placement(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_old text := $old$update public.users set school_id=p_school_id,grade=v_to.grade_level,batch=v_to.class_code,updated_at=now() where id=p_student_id;$old$;
  v_new text := $new$update public.users set school_id=p_school_id,grade=v_to.grade_level,batch=v_to.class_code,updated_at=now() where id=p_student_id;
  perform private.academic_sync_operational_student_placement(p_school_id,p_student_id,v_to.id,v_actor,'school_admin');$new$;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'rpc_school_admin_transfer_student_placement'
    and pg_get_function_identity_arguments(p.oid) =
      'p_school_id uuid, p_student_id uuid, p_expected_from_class_id uuid, p_to_class_id uuid, p_reason text, p_effective_date date, p_exception_id uuid';

  if v_oid is null then
    raise exception 'rpc_school_admin_transfer_student_placement signature not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('private.academic_sync_operational_student_placement' in v_def) = 0 then
    if position(v_old in v_def) = 0 then
      raise exception 'rpc_school_admin_transfer_student_placement sync patch target not found';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;
end;
$migration$;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_old text := $old$update public.users set grade=v_class.grade_level,batch=v_class.class_code,updated_at=now() where id=v_uid;$old$;
  v_new text := $new$update public.users set grade=v_class.grade_level,batch=v_class.class_code,updated_at=now() where id=v_uid;
  perform private.academic_sync_operational_student_placement(v_member.school_id,v_uid,v_class.id,v_uid,'verified_self_registration');$new$;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'rpc_setup_approved_class_enrollment'
    and pg_get_function_identity_arguments(p.oid) = 'p_class_id uuid';

  if v_oid is null then
    raise exception 'rpc_setup_approved_class_enrollment signature not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('private.academic_sync_operational_student_placement' in v_def) = 0 then
    if position(v_old in v_def) = 0 then
      raise exception 'rpc_setup_approved_class_enrollment sync patch target not found';
    end if;
    execute replace(v_def, v_old, v_new);
  end if;
end;
$migration$;
