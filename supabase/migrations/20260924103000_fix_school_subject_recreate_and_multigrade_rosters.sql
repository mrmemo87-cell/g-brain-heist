-- Fix school-subject recreation and multi-grade selected rosters.
-- Archived subjects no longer reserve their name; active names remain unique.
-- Selected-student writes and catalogue reads are scoped to the offering grade.

alter table public.school_subjects
  drop constraint if exists school_subjects_school_id_name_key;

create unique index if not exists school_subjects_school_active_name_uq
  on public.school_subjects (school_id, lower(trim(name)))
  where is_active;

CREATE OR REPLACE FUNCTION public.rpc_school_admin_save_school_subject(p_school_id uuid, p_name text, p_school_subject_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_academic_subject_id uuid DEFAULT NULL::uuid, p_academic_year_id uuid DEFAULT NULL::uuid, p_grade_level text DEFAULT NULL::text, p_curriculum_scope_id uuid DEFAULT NULL::uuid, p_access_mode text DEFAULT 'all_grade'::text, p_selected_student_ids uuid[] DEFAULT '{}'::uuid[], p_teacher_user_id uuid DEFAULT NULL::uuid, p_class_ids uuid[] DEFAULT '{}'::uuid[], p_replace_teacher_allocations boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_name text:=trim(coalesce(p_name,''));
  v_code text:=nullif(trim(coalesce(p_code,'')),'');
  v_subject_id uuid:=p_school_subject_id;
  v_student uuid;
  v_class uuid;
  v_start date;
  v_request_id uuid;
  v_school_name text;
  v_result jsonb;
  v_offering_id uuid;
  v_request_was_pending boolean:=false;
begin
  if v_actor is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;
  if length(v_name)<2 then
    return jsonb_build_object('success',false,'code','subject_name_required');
  end if;
  if exists(
    select 1 from public.school_subjects s
    where s.school_id=p_school_id and s.id is distinct from v_subject_id
      and s.is_active
      and lower(trim(s.name))=lower(v_name)
  ) then
    return jsonb_build_object('success',false,'code','subject_name_already_exists');
  end if;
  if v_subject_id is not null and not exists(
    select 1 from public.school_subjects s where s.id=v_subject_id and s.school_id=p_school_id
  ) then
    return jsonb_build_object('success',false,'code','school_subject_not_found');
  end if;
  if p_academic_subject_id is not null and not exists(
    select 1 from public.academic_subjects a where a.id=p_academic_subject_id and a.is_active
  ) then
    return jsonb_build_object('success',false,'code','academic_subject_not_found');
  end if;
  if p_curriculum_scope_id is not null and p_academic_subject_id is null then
    return jsonb_build_object('success',false,'code','academic_mapping_required_for_scope');
  end if;

  if p_grade_level is not null then
    if trim(p_grade_level)!~'^(?:[1-9]|1[0-2])$' then
      return jsonb_build_object('success',false,'code','invalid_grade_level');
    end if;
    if p_academic_year_id is null or not exists(
      select 1 from public.school_academic_years y where y.id=p_academic_year_id and y.school_id=p_school_id
    ) then
      return jsonb_build_object('success',false,'code','academic_year_not_found');
    end if;
    if p_access_mode not in ('all_grade','selected') then
      return jsonb_build_object('success',false,'code','invalid_subject_access_mode');
    end if;
    if p_curriculum_scope_id is not null and not exists(
      select 1
      from public.curriculum_scopes sc
      join public.curriculum_stages st on st.id=sc.stage_id
      join public.curriculum_framework_versions fv on fv.id=sc.framework_version_id
      where sc.id=p_curriculum_scope_id
        and sc.academic_subject_id=p_academic_subject_id
        and st.sequence_number::text=trim(p_grade_level)
        and fv.status='published'
    ) then
      return jsonb_build_object('success',false,'code','offering_scope_does_not_match_grade_subject');
    end if;

    select y.starts_on into v_start from public.school_academic_years y where y.id=p_academic_year_id;

    if p_access_mode='selected' then
      if cardinality(coalesce(p_selected_student_ids,'{}'::uuid[]))=0 then
        return jsonb_build_object('success',false,'code','select_at_least_one_student');
      end if;
      foreach v_student in array coalesce(p_selected_student_ids,'{}'::uuid[])
      loop
        if not exists(
          select 1 from public.student_academic_enrolments ae
          join public.users u on u.id=ae.student_id
          where ae.student_id=v_student and ae.school_id=p_school_id
            and ae.academic_year_id=p_academic_year_id and ae.grade_level=trim(p_grade_level)
            and u.school_id=p_school_id
        ) then
          return jsonb_build_object('success',false,'code','selected_student_not_in_grade');
        end if;
      end loop;
    end if;

    if p_teacher_user_id is not null then
      if not exists(
        select 1 from public.school_members sm
        where sm.school_id=p_school_id and sm.user_id=p_teacher_user_id
          and sm.status='active' and sm.can_teach
      ) then
        return jsonb_build_object('success',false,'code','teacher_not_available_in_school');
      end if;
      if cardinality(coalesce(p_class_ids,'{}'::uuid[]))=0 then
        return jsonb_build_object('success',false,'code','teacher_class_required');
      end if;
      foreach v_class in array coalesce(p_class_ids,'{}'::uuid[])
      loop
        if not exists(
          select 1 from public.classes c
          where c.id=v_class and c.school_id=p_school_id
            and c.is_active is distinct from false and c.grade_level::text=trim(p_grade_level)
        ) then
          return jsonb_build_object('success',false,'code','class_not_in_selected_grade');
        end if;
      end loop;
    end if;
  end if;

  if v_subject_id is null then
    insert into public.school_subjects(
      school_id,name,code,is_active,created_by,academic_subject_id,archived_at,archived_by
    ) values (
      p_school_id,v_name,v_code,true,v_actor,p_academic_subject_id,null,null
    ) returning id into v_subject_id;
  else
    update public.school_subjects
    set name=v_name,code=v_code,academic_subject_id=p_academic_subject_id,
        is_active=true,archived_at=null,archived_by=null
    where id=v_subject_id and school_id=p_school_id;
  end if;

  update public.class_teacher_assignments
  set subject=v_name
  where school_id=p_school_id and school_subject_id=v_subject_id;

  if p_academic_subject_id is null then
    select (mr.status='pending') into v_request_was_pending
    from public.school_subject_mapping_requests mr
    where mr.school_subject_id=v_subject_id;
    v_request_was_pending:=coalesce(v_request_was_pending,false);

    insert into public.school_subject_mapping_requests(
      school_id,school_subject_id,status,requested_by,requested_at,
      resolved_by,resolved_at,resolution_note,updated_at
    ) values (
      p_school_id,v_subject_id,'pending',v_actor,now(),null,null,null,now()
    )
    on conflict (school_subject_id) do update
    set status='pending',
        requested_by=case when public.school_subject_mapping_requests.status='pending'
          then public.school_subject_mapping_requests.requested_by else excluded.requested_by end,
        requested_at=case when public.school_subject_mapping_requests.status='pending'
          then public.school_subject_mapping_requests.requested_at else excluded.requested_at end,
        resolved_by=case when public.school_subject_mapping_requests.status='pending'
          then public.school_subject_mapping_requests.resolved_by else null end,
        resolved_at=case when public.school_subject_mapping_requests.status='pending'
          then public.school_subject_mapping_requests.resolved_at else null end,
        resolution_note=case when public.school_subject_mapping_requests.status='pending'
          then public.school_subject_mapping_requests.resolution_note else null end,
        updated_at=now()
    returning id into v_request_id;

    if not v_request_was_pending then
      select s.name into v_school_name from public.schools s where s.id=p_school_id;
      insert into public.transactional_email_outbox(
        event_type,category,audience,recipient_user_id,recipient_email,school_id,
        school_name_override,template_key,template_version,payload,idempotency_key,
        available_at,status
      ) values (
        'school_subject_mapping_requested','platform_operations','platform_owner',null,null,p_school_id,
        v_school_name,'owner_school_request','professional-v1',
        jsonb_build_object(
          'school_name',v_school_name,
          'school_id',p_school_id,
          'subject',v_name,
          'status','Academic mapping needed: '||v_name,
          'request_id',v_request_id,
          'school_subject_id',v_subject_id,
          'mapping_request_id',v_request_id
        ),
        'school-subject-mapping-request:'||v_request_id::text,now(),'pending'
      ) on conflict (idempotency_key) do nothing;
    end if;
  else
    update public.school_subject_mapping_requests
    set status='resolved',resolved_by=v_actor,resolved_at=now(),
        resolution_note='Mapped by school administrator',updated_at=now()
    where school_subject_id=v_subject_id and status='pending';
  end if;

  if p_grade_level is not null then
    insert into public.school_subject_offerings(
      school_id,school_subject_id,academic_year_id,grade_level,curriculum_scope_id,
      access_mode,status,created_by
    ) values (
      p_school_id,v_subject_id,p_academic_year_id,trim(p_grade_level),p_curriculum_scope_id,
      p_access_mode,'active',v_actor
    )
    on conflict (school_subject_id,academic_year_id,grade_level) do update
    set curriculum_scope_id=excluded.curriculum_scope_id,
        access_mode=excluded.access_mode,status='active',updated_at=now()
    returning id into v_offering_id;

    if p_access_mode='selected' then
      foreach v_student in array coalesce(p_selected_student_ids,'{}'::uuid[])
      loop
        insert into public.school_subject_enrolments(
          school_id,school_subject_id,academic_year_id,student_id,status,
          starts_on,ends_on,created_by
        ) values (
          p_school_id,v_subject_id,p_academic_year_id,v_student,'active',v_start,null,v_actor
        )
        on conflict (student_id,academic_year_id,school_subject_id) do update
        set status='active',ends_on=null,created_by=v_actor,updated_at=now();
      end loop;

      update public.school_subject_enrolments e
      set status='withdrawn',ends_on=current_date,updated_at=now()
      where e.school_id=p_school_id and e.school_subject_id=v_subject_id
        and e.academic_year_id=p_academic_year_id and e.status='active'
        and exists (
          select 1
          from public.student_academic_enrolments ae
          where ae.school_id=p_school_id
            and ae.student_id=e.student_id
            and ae.academic_year_id=p_academic_year_id
            and ae.grade_level=trim(p_grade_level)
            and ae.starts_on<=current_date
            and (ae.ends_on is null or ae.ends_on>=current_date)
        )
        and not(e.student_id=any(coalesce(p_selected_student_ids,'{}'::uuid[])));
    else
      update public.school_subject_enrolments e
      set status='withdrawn',ends_on=current_date,updated_at=now()
      where e.school_id=p_school_id and e.school_subject_id=v_subject_id
        and e.academic_year_id=p_academic_year_id and e.status='active'
        and exists (
          select 1
          from public.student_academic_enrolments ae
          where ae.school_id=p_school_id
            and ae.student_id=e.student_id
            and ae.academic_year_id=p_academic_year_id
            and ae.grade_level=trim(p_grade_level)
            and ae.starts_on<=current_date
            and (ae.ends_on is null or ae.ends_on>=current_date)
        );
    end if;

    if p_replace_teacher_allocations then
      update public.class_teacher_assignments cta
      set active=false
      from public.classes c
      where cta.class_id=c.id and cta.school_id=p_school_id
        and cta.school_subject_id=v_subject_id and cta.active
        and c.grade_level::text=trim(p_grade_level);
    end if;

    if p_teacher_user_id is not null then
      foreach v_class in array coalesce(p_class_ids,'{}'::uuid[])
      loop
        select public.admin_allocate_teacher_to_school_subject(
          p_school_id,v_class,p_teacher_user_id,v_subject_id,true
        ) into v_result;
        if coalesce((v_result->>'success')::boolean,false) is not true then
          raise exception using errcode='P0001',message='teacher_allocation_failed',
            detail=coalesce(v_result->>'error','Teacher allocation could not be saved.');
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'success',true,'schoolSubjectId',v_subject_id,'offeringId',v_offering_id,
    'name',v_name,'academicSubjectId',p_academic_subject_id,
    'mappingStatus',case when p_academic_subject_id is null then 'unmapped' else 'mapped' end,
    'mappingRequestId',v_request_id
  );
end;
$function$
;

revoke all on function public.rpc_school_admin_save_school_subject(uuid,text,uuid,text,uuid,uuid,text,uuid,text,uuid[],uuid,uuid[],boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_save_school_subject(uuid,text,uuid,text,uuid,uuid,text,uuid,text,uuid[],uuid,uuid[],boolean)
  to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rpc_school_admin_subject_catalog(p_school_id uuid, p_include_archived boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_year_id uuid;
  v_year_name text;
begin
  if v_actor is null or not (public.can_administer_school(p_school_id) or public.is_school_owner(p_school_id)) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;

  select y.id,y.name into v_year_id,v_year_name
  from public.school_academic_years y
  where y.school_id=p_school_id
  order by case y.status when 'current' then 0 when 'planned' then 1 else 2 end,y.starts_on desc
  limit 1;

  return jsonb_build_object(
    'success',true,
    'schoolId',p_school_id,
    'academicYearId',v_year_id,
    'academicYearName',v_year_name,
    'subjects',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,
        'name',s.name,
        'code',s.code,
        'isActive',s.is_active,
        'academicSubjectId',s.academic_subject_id,
        'academicSubjectName',a.name,
        'mappingStatus',case when s.academic_subject_id is null then 'unmapped' else 'mapped' end,
        'mappingRequestStatus',mr.status,
        'createdAt',s.created_at,
        'updatedAt',s.updated_at,
        'offerings',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',o.id,
            'academicYearId',o.academic_year_id,
            'gradeLevel',o.grade_level,
            'curriculumScopeId',o.curriculum_scope_id,
            'accessMode',o.access_mode,
            'deliveryMode',o.delivery_mode,
            'status',o.status,
            'selectedStudentIds',coalesce((
              select jsonb_agg(e.student_id order by e.student_id)
              from public.school_subject_enrolments e
              where e.school_subject_id=s.id
                and e.academic_year_id=o.academic_year_id
                and e.status='active'
                and current_date>=e.starts_on
                and (e.ends_on is null or current_date<=e.ends_on)
                and exists (
                  select 1
                  from public.student_academic_enrolments ae
                  where ae.school_id=p_school_id
                    and ae.student_id=e.student_id
                    and ae.academic_year_id=o.academic_year_id
                    and ae.grade_level=o.grade_level
                    and ae.starts_on<=current_date
                    and (ae.ends_on is null or ae.ends_on>=current_date)
                )
            ),'[]'::jsonb),
            'teacherUserIds',coalesce((
              select jsonb_agg(distinct gt.teacher_user_id)
              from public.school_subject_groups g
              join public.school_subject_group_teachers gt
                on gt.group_id=g.id and gt.school_id=g.school_id and gt.active
              where g.school_id=p_school_id
                and g.school_subject_offering_id=o.id
                and g.status='active'
            ),'[]'::jsonb),
            'classIds',coalesce((
              select jsonb_agg(distinct g.registration_class_id)
              from public.school_subject_groups g
              where g.school_id=p_school_id
                and g.school_subject_offering_id=o.id
                and g.status='active'
                and g.group_type='class'
                and g.registration_class_id is not null
            ),'[]'::jsonb),
            'groupCount',(
              select count(*)::integer from public.school_subject_groups g
              where g.school_id=p_school_id and g.school_subject_offering_id=o.id and g.status='active'
            )
          ) order by o.grade_level::integer)
          from public.school_subject_offerings o
          where o.school_subject_id=s.id
            and (v_year_id is null or o.academic_year_id=v_year_id)
            and o.status='active'
        ),'[]'::jsonb)
      ) order by s.is_active desc,lower(s.name))
      from public.school_subjects s
      left join public.academic_subjects a on a.id=s.academic_subject_id
      left join public.school_subject_mapping_requests mr on mr.school_subject_id=s.id
      where s.school_id=p_school_id and (p_include_archived or s.is_active)
    ),'[]'::jsonb)
  );
end;
$function$
;

revoke all on function public.rpc_school_admin_subject_catalog(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_school_admin_subject_catalog(uuid,boolean)
  to authenticated,service_role;

notify pgrst,'reload schema';
