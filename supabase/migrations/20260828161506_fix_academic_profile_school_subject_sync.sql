create or replace function public.rpc_student_academic_subjects_for_year(
  p_student_id uuid,
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_student uuid := coalesce(p_student_id, auth.uid());
  v_school uuid;
  v_year uuid;
  v_operational_year uuid;
  v_grade text;
  v_class uuid;
  v_is_admin boolean := false;
  v_is_self boolean := false;
  v_is_teacher boolean := false;
begin
  if v_caller is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select u.school_id into v_school
  from public.users u
  where u.id = v_student;

  if v_school is null then
    return jsonb_build_object(
      'success', true, 'ready', false, 'code', 'school_required',
      'subjects', '[]'::jsonb
    );
  end if;

  select y.id into v_year
  from public.school_academic_years y
  where y.id = p_academic_year_id
    and y.school_id = v_school;

  if v_year is null then
    raise exception using errcode = '42501',
      message = 'academic_year_not_available_for_student';
  end if;

  v_is_self := v_caller = v_student;
  v_is_admin := public.can_administer_school(v_school)
    or public.is_school_owner(v_school);
  v_is_teacher := exists (
    select 1
    from public.teachers t
    where t.user_id = v_caller
  );
  v_operational_year := public.academic_resolve_year_id(v_school, now());

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

  if v_grade is null or v_class is null then
    return jsonb_build_object(
      'success', true, 'ready', false,
      'code', 'academic_year_enrolment_required',
      'academicYearId', v_year,
      'subjects', '[]'::jsonb
    );
  end if;

  if not (v_is_self or v_is_admin) then
    if not v_is_teacher or not (
      exists (
        select 1
        from public.class_teacher_assignments cta
        where cta.school_id = v_school
          and cta.class_id = v_class
          and cta.teacher_user_id = v_caller
          and cta.active
      )
      or exists (
        select 1
        from private.school_year_teacher_allocation_snapshots snap
        where snap.school_id = v_school
          and snap.academic_year_id = v_year
          and snap.class_id = v_class
          and snap.teacher_user_id = v_caller
      )
    ) then
      raise exception using errcode = '42501',
        message = 'student_academic_subject_access_denied';
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'ready', true,
    'academicYearId', v_year,
    'gradeLevel', v_grade,
    'subjects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', catalog.id,
          'code', catalog.code,
          'name', catalog.name,
          'requirement', catalog.requirement,
          'scopeId', catalog.scope_id,
          'approvedQuestionCount', 0
        )
        order by catalog.name
      )
      from (
        select distinct on (candidate.subject_key)
          candidate.id,
          candidate.code,
          candidate.name,
          candidate.requirement,
          candidate.scope_id,
          candidate.subject_key
        from (
          select
            subject.id,
            subject.code,
            subject.name,
            mapping.subject_requirement as requirement,
            mapping.curriculum_scope_id as scope_id,
            private.teacher_assignment_subject_key(subject.name) as subject_key,
            0 as priority
          from public.school_curriculum_scope_mappings mapping
          join public.academic_subjects subject
            on subject.id = mapping.academic_subject_id
           and subject.is_active
          where mapping.school_id = v_school
            and mapping.academic_year_id = v_year
            and mapping.grade_level = v_grade
            and mapping.status = 'active'
            and (
              mapping.subject_requirement = 'required'
              or exists (
                select 1
                from public.student_subject_enrolments subject_enrolment
                where subject_enrolment.student_id = v_student
                  and subject_enrolment.school_id = v_school
                  and subject_enrolment.academic_year_id = v_year
                  and subject_enrolment.academic_subject_id = subject.id
                  and subject_enrolment.status = 'active'
              )
            )
            and (
              v_is_self
              or v_is_admin
              or exists (
                select 1
                from public.class_teacher_assignments cta
                where cta.school_id = v_school
                  and cta.class_id = v_class
                  and cta.teacher_user_id = v_caller
                  and cta.active
                  and private.teacher_assignment_subject_key(cta.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
              or exists (
                select 1
                from private.school_year_teacher_allocation_snapshots snap
                where snap.school_id = v_school
                  and snap.academic_year_id = v_year
                  and snap.class_id = v_class
                  and snap.teacher_user_id = v_caller
                  and private.teacher_assignment_subject_key(snap.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
            )

          union all

          select
            subject.id,
            subject.code,
            subject.name,
            'required'::text as requirement,
            null::uuid as scope_id,
            private.teacher_assignment_subject_key(subject.name) as subject_key,
            1 as priority
          from public.class_teacher_assignments cta
          join public.academic_subjects subject
            on subject.is_active
           and private.teacher_assignment_subject_key(subject.name) =
               private.teacher_assignment_subject_key(cta.subject)
          where cta.school_id = v_school
            and cta.class_id = v_class
            and cta.active
            and (v_is_self or v_is_admin or cta.teacher_user_id = v_caller)

          union all

          select
            subject.id,
            subject.code,
            subject.name,
            'required'::text as requirement,
            null::uuid as scope_id,
            private.teacher_assignment_subject_key(subject.name) as subject_key,
            2 as priority
          from private.school_year_teacher_allocation_snapshots snap
          join public.academic_subjects subject
            on subject.is_active
           and private.teacher_assignment_subject_key(subject.name) =
               private.teacher_assignment_subject_key(snap.subject)
          where snap.school_id = v_school
            and snap.academic_year_id = v_year
            and snap.class_id = v_class
            and (v_is_self or v_is_admin or snap.teacher_user_id = v_caller)
        ) candidate
        order by candidate.subject_key, candidate.priority, candidate.name
      ) catalog
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_student_academic_subjects_for_year(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_student_academic_subjects_for_year(uuid, uuid)
  to authenticated, service_role;

create or replace function public.rpc_teacher_academic_profile_students_for_year(
  p_academic_year_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_school_id uuid;
  v_is_admin boolean := false;
  v_is_teacher boolean := false;
  v_operational_year_id uuid;
  v_result jsonb;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select y.school_id into v_school_id
  from public.school_academic_years y
  where y.id = p_academic_year_id;

  if v_school_id is null then
    raise exception 'Academic year not found';
  end if;

  v_is_admin := public.can_administer_school(v_school_id)
    or public.is_school_owner(v_school_id);
  v_is_teacher := exists (
    select 1 from public.teachers t where t.user_id = v_caller
  );

  if not v_is_admin and not v_is_teacher then
    raise exception 'Not authorized';
  end if;

  v_operational_year_id := public.academic_resolve_year_id(v_school_id, now());

  with roster_candidates as (
    select
      e.student_id,
      e.school_id,
      e.academic_year_id,
      e.class_id,
      e.grade_level,
      e.class_code,
      e.starts_on,
      0 as source_rank
    from public.student_academic_enrolments e
    join public.school_members sm
      on sm.school_id = e.school_id
     and sm.user_id = e.student_id
     and sm.status = 'active'
     and sm.role_in_school = 'student'
    where e.school_id = v_school_id
      and e.academic_year_id = p_academic_year_id

    union all

    select
      sm.user_id as student_id,
      v_school_id as school_id,
      p_academic_year_id as academic_year_id,
      school_class.id as class_id,
      school_class.grade_level,
      school_class.class_code,
      null::date as starts_on,
      1 as source_rank
    from public.school_members sm
    join public.class_students cs
      on cs.student_id = sm.user_id
    join public.classes school_class
      on school_class.id = cs.class_id
     and school_class.school_id = v_school_id
     and coalesce(school_class.is_active, true)
    where sm.school_id = v_school_id
      and sm.status = 'active'
      and sm.role_in_school = 'student'
      and p_academic_year_id = v_operational_year_id
      and not exists (
        select 1
        from public.student_academic_enrolments existing
        where existing.school_id = v_school_id
          and existing.academic_year_id = p_academic_year_id
          and existing.student_id = sm.user_id
      )
  ),
  roster as (
    select distinct on (candidate.student_id)
      candidate.student_id,
      candidate.school_id,
      candidate.academic_year_id,
      candidate.class_id,
      candidate.grade_level,
      candidate.class_code
    from roster_candidates candidate
    order by candidate.student_id,
             candidate.source_rank,
             candidate.starts_on desc nulls last,
             candidate.class_id
  )
  select coalesce(
    jsonb_agg(
      row_data
      order by row_data->>'grade',
               row_data->>'class_name',
               row_data->>'student_name'
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select jsonb_build_object(
      'student_id', u.id,
      'student_name', coalesce(nullif(trim(u.full_name), ''), u.username),
      'username', u.username,
      'class_name', coalesce(
        nullif(trim(school_class.class_code), ''),
        nullif(trim(school_class.class_name), ''),
        nullif(trim(roster_row.class_code), ''),
        '—'
      ),
      'grade', roster_row.grade_level,
      'school_id', roster_row.school_id,
      'subjects', coalesce((
        select to_jsonb(array_agg(distinct subject_name order by subject_name))
        from (
          select subject.name as subject_name
          from public.school_curriculum_scope_mappings mapping
          join public.academic_subjects subject
            on subject.id = mapping.academic_subject_id
           and subject.is_active
          where mapping.school_id = roster_row.school_id
            and mapping.academic_year_id = roster_row.academic_year_id
            and mapping.grade_level = roster_row.grade_level
            and mapping.status = 'active'
            and (
              mapping.subject_requirement = 'required'
              or exists (
                select 1
                from public.student_subject_enrolments subject_enrolment
                where subject_enrolment.student_id = roster_row.student_id
                  and subject_enrolment.school_id = roster_row.school_id
                  and subject_enrolment.academic_year_id = roster_row.academic_year_id
                  and subject_enrolment.academic_subject_id = subject.id
                  and subject_enrolment.status = 'active'
              )
            )
            and (
              v_is_admin
              or exists (
                select 1
                from public.class_teacher_assignments cta
                where cta.school_id = roster_row.school_id
                  and cta.class_id = roster_row.class_id
                  and cta.teacher_user_id = v_caller
                  and cta.active
                  and private.teacher_assignment_subject_key(cta.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
              or exists (
                select 1
                from private.school_year_teacher_allocation_snapshots snap
                where snap.school_id = roster_row.school_id
                  and snap.academic_year_id = roster_row.academic_year_id
                  and snap.class_id = roster_row.class_id
                  and snap.teacher_user_id = v_caller
                  and private.teacher_assignment_subject_key(snap.subject) =
                      private.teacher_assignment_subject_key(subject.name)
              )
            )

          union

          select trim(cta.subject) as subject_name
          from public.class_teacher_assignments cta
          where cta.school_id = roster_row.school_id
            and cta.class_id = roster_row.class_id
            and cta.active
            and (v_is_admin or cta.teacher_user_id = v_caller)
            and nullif(trim(cta.subject), '') is not null

          union

          select trim(snap.subject) as subject_name
          from private.school_year_teacher_allocation_snapshots snap
          where snap.school_id = roster_row.school_id
            and snap.academic_year_id = roster_row.academic_year_id
            and snap.class_id = roster_row.class_id
            and (v_is_admin or snap.teacher_user_id = v_caller)
            and nullif(trim(snap.subject), '') is not null
        ) subjects_for_student
      ), '[]'::jsonb)
    ) as row_data
    from roster roster_row
    join public.users u
      on u.id = roster_row.student_id
     and u.school_id = roster_row.school_id
    left join public.classes school_class
      on school_class.id = roster_row.class_id
     and school_class.school_id = roster_row.school_id
    where v_is_admin
      or exists (
        select 1
        from public.class_teacher_assignments cta
        where cta.school_id = roster_row.school_id
          and cta.class_id = roster_row.class_id
          and cta.teacher_user_id = v_caller
          and cta.active
      )
      or exists (
        select 1
        from private.school_year_teacher_allocation_snapshots snap
        where snap.school_id = roster_row.school_id
          and snap.academic_year_id = roster_row.academic_year_id
          and snap.class_id = roster_row.class_id
          and snap.teacher_user_id = v_caller
      )
  ) rows;

  return v_result;
end;
$function$;

revoke all on function public.rpc_teacher_academic_profile_students_for_year(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_teacher_academic_profile_students_for_year(uuid)
  to authenticated, service_role;

create or replace function public.rpc_student_academic_profile_for_year(
  p_student_id uuid,
  p_subject text,
  p_academic_year_id uuid,
  p_date_from timestamp with time zone default null::timestamp with time zone,
  p_date_to timestamp with time zone default null::timestamp with time zone
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid := coalesce(p_student_id, auth.uid());
  v_school_id uuid;
  v_year public.school_academic_years%rowtype;
  v_enrol public.student_academic_enrolments%rowtype;
  v_from timestamptz;
  v_to timestamptz;
  v_result jsonb;
  v_focus jsonb := '[]'::jsonb;
  v_subjects jsonb := '[]'::jsonb;
  v_catalog jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select u.school_id into v_school_id
  from public.users u
  where u.id = v_student_id;

  select * into v_year
  from public.school_academic_years y
  where y.id = p_academic_year_id
    and y.school_id = v_school_id;

  if not found then
    raise exception 'Academic year not available for student';
  end if;

  v_from := greatest(
    v_year.starts_on::timestamptz,
    coalesce(p_date_from, v_year.starts_on::timestamptz)
  );
  v_to := least(
    ((v_year.ends_on + 1)::date)::timestamptz - interval '1 millisecond',
    coalesce(
      p_date_to,
      ((v_year.ends_on + 1)::date)::timestamptz - interval '1 millisecond'
    )
  );

  v_result := public.rpc_student_academic_profile(
    v_student_id,
    p_subject,
    v_from,
    v_to
  );

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

  v_result := jsonb_set(
    v_result,
    '{scope}',
    coalesce(v_result->'scope', '{}'::jsonb) || jsonb_build_object(
      'academic_year_id', v_year.id,
      'academic_year_name', v_year.name,
      'academic_year_status', v_year.status,
      'archived', v_year.id <> public.academic_resolve_year_id(v_school_id, now())
    ),
    true
  );

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_focus
  from jsonb_array_elements(coalesce(v_result->'focus_areas', '[]'::jsonb)) item
  where exists (
    select 1
    from public.student_learning_focus_states f
    where f.student_id = v_student_id
      and f.skill_key = item->>'skill_key'
      and f.academic_year_id = p_academic_year_id
  );

  v_result := jsonb_set(v_result, '{focus_areas}', v_focus, true);

  select coalesce(
    jsonb_agg(
      item || jsonb_build_object(
        'persistent_focus_count', (
          select count(*)
          from jsonb_array_elements(v_focus) f
          where lower(f->>'subject') = lower(item->>'subject')
            and f->>'status' = 'persistent'
        ),
        'improving_count', (
          select count(*)
          from jsonb_array_elements(v_focus) f
          where lower(f->>'subject') = lower(item->>'subject')
            and f->>'status' = 'improving'
        ),
        'resolved_count', (
          select count(*)
          from jsonb_array_elements(v_focus) f
          where lower(f->>'subject') = lower(item->>'subject')
            and f->>'status' = 'resolved'
        ),
        'strength_count', (
          select count(*)
          from jsonb_array_elements(v_focus) f
          where lower(f->>'subject') = lower(item->>'subject')
            and f->>'status' in ('emerging_strength', 'consistent_strength')
        )
      )
    ),
    '[]'::jsonb
  )
  into v_subjects
  from jsonb_array_elements(coalesce(v_result->'subjects', '[]'::jsonb)) item
  where coalesce((item->>'completed_assignments')::integer, 0) > 0
     or exists (
       select 1
       from jsonb_array_elements(v_focus) f
       where lower(f->>'subject') = lower(item->>'subject')
     );

  v_catalog := public.rpc_student_academic_subjects_for_year(
    v_student_id,
    p_academic_year_id
  );

  select coalesce(jsonb_agg(merged.item order by merged.item->>'subject'), '[]'::jsonb)
  into v_subjects
  from (
    select existing.item
    from jsonb_array_elements(v_subjects) existing(item)

    union all

    select jsonb_build_object(
      'subject', catalog_item->>'name',
      'assignment_average', null,
      'completed_assignments', 0,
      'persistent_focus_count', 0,
      'improving_count', 0,
      'resolved_count', 0,
      'strength_count', 0,
      'latest_evidence_at', null
    )
    from jsonb_array_elements(coalesce(v_catalog->'subjects', '[]'::jsonb)) catalog_item
    where (p_subject is null
      or private.teacher_assignment_subject_key(catalog_item->>'name') =
         private.teacher_assignment_subject_key(p_subject))
      and not exists (
        select 1
        from jsonb_array_elements(v_subjects) existing
        where private.teacher_assignment_subject_key(existing->>'subject') =
              private.teacher_assignment_subject_key(catalog_item->>'name')
      )
  ) merged;

  v_result := jsonb_set(v_result, '{subjects}', v_subjects, true);
  v_result := jsonb_set(
    v_result,
    '{summary}',
    coalesce(v_result->'summary', '{}'::jsonb) || jsonb_build_object(
      'subjects_tracked', jsonb_array_length(v_subjects),
      'persistent_focus_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' = 'persistent'
      ),
      'recurring_focus_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' in ('new_focus', 'recurring')
      ),
      'improving_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' = 'improving'
      ),
      'resolved_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' = 'resolved'
      ),
      'strength_count', (
        select count(*)
        from jsonb_array_elements(v_focus) f
        where f->>'status' in ('emerging_strength', 'consistent_strength')
      )
    ),
    true
  );

  return v_result;
end;
$function$;

revoke all on function public.rpc_student_academic_profile_for_year(
  uuid, text, uuid, timestamp with time zone, timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.rpc_student_academic_profile_for_year(
  uuid, text, uuid, timestamp with time zone, timestamp with time zone
) to authenticated, service_role;
