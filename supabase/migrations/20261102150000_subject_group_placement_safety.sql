-- Subject-group placement safety.
--
-- Incident (2026-11-02): a school administrator selected a new Grade 7 learner for the
-- ESL subject in the Subjects editor. That editor only writes the selective subject
-- enrolment; it never touched the custom teaching group, so the ESL teacher's roster
-- did not show the learner. Earlier, the same gap had led staff to create a second,
-- near-duplicate custom group ("7 ESL" next to "Grade 7 ESL") just to seat one student.
--
-- This migration closes the gap in three places, all additive:
--   1. rpc_school_admin_save_school_subject now places newly selected students into the
--      offering's custom teaching group when there is exactly one, withdraws group
--      membership for students who are deselected, and reports what it did so the UI
--      can say so (or prompt when a choice is needed).
--   2. rpc_school_admin_offering_placement lists students who have selective access to
--      an offering but sit in none of its active custom groups ("not yet in a group"),
--      so the gap is visible and fixable in one click instead of being silent.
--   3. rpc_school_admin_save_subject_group refuses to create a custom group whose name
--      normalises to an existing active custom group on the same offering unless the
--      caller explicitly allows it (after the UI has asked).

-- ---------------------------------------------------------------------------
-- 3a. Name key used to spot near-duplicate custom groups.
--     "Grade 7 ESL", "7 ESL", "G7 ESL", "ESL grade 7" all map to "7 esl".
-- ---------------------------------------------------------------------------
create or replace function private.subject_group_name_key(p_name text)
returns text
language sql
immutable
set search_path=''
as $$
  select coalesce((
    select string_agg(tok, ' ' order by tok)
    from unnest(
      regexp_split_to_array(
        regexp_replace(
          regexp_replace(
            -- "g7", "gr7", "grade7", "yr7" → "7"
            regexp_replace(lower(coalesce(p_name,'')), '\m(grade|gr|g|year|yr|y)\s*(\d+)\M', ' \2 ', 'g'),
            '\m(grade|group|gr|g|year|yr|class|set|team)\M', ' ', 'g'
          ),
          '[^a-z0-9]+', ' ', 'g'
        ),
        '\s+'
      )
    ) tok
    where tok <> ''
  ), '');
$$;

revoke all on function private.subject_group_name_key(text)
  from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 2. Placement overview for one offering: custom groups + students not yet placed.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_school_admin_offering_placement(
  p_school_id uuid,
  p_offering_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_offering public.school_subject_offerings;
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;

  select * into v_offering
  from public.school_subject_offerings o
  where o.id=p_offering_id and o.school_id=p_school_id and o.status='active';
  if not found then
    raise exception 'active_subject_offering_required';
  end if;

  return jsonb_build_object(
    'offeringId', v_offering.id,
    'deliveryMode', v_offering.delivery_mode,
    'accessMode', v_offering.access_mode,
    'customGroups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'studentCount', (
          select count(*) from public.school_subject_group_students m
          where m.group_id=g.id and m.status='active'
        ),
        'teacherNames', coalesce((
          select jsonb_agg(coalesce(nullif(u.full_name,''),u.username) order by u.username)
          from public.school_subject_group_teachers t
          join public.users u on u.id=t.teacher_user_id
          where t.group_id=g.id and t.active
        ), '[]'::jsonb)
      ) order by g.sort_order, g.name)
      from public.school_subject_groups g
      where g.school_id=p_school_id
        and g.school_subject_offering_id=v_offering.id
        and g.status='active'
        and g.group_type='custom'
    ), '[]'::jsonb),
    'unplaced', case
      when v_offering.delivery_mode <> 'custom_groups' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
          'studentId', r.student_id,
          'name', coalesce(nullif(u.full_name,''),u.username,u.email,'Student'),
          'classCode', r.class_code
        ) order by coalesce(nullif(u.full_name,''),u.username,u.email))
        from private.subject_offering_eligible_students(v_offering.id) r
        join public.users u on u.id=r.student_id
        where not exists (
          select 1
          from public.school_subject_group_students m
          join public.school_subject_groups g on g.id=m.group_id
          where g.school_id=p_school_id
            and g.school_subject_offering_id=v_offering.id
            and g.status='active'
            and g.group_type='custom'
            and m.student_id=r.student_id
            and m.status='active'
        )
      ), '[]'::jsonb)
    end
  );
end;
$function$;

revoke all on function public.rpc_school_admin_offering_placement(uuid,uuid) from public,anon;
grant execute on function public.rpc_school_admin_offering_placement(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. Duplicate guard on custom-group creation. A 7-argument overload carries the
--     explicit allowance; p_allow_similar has NO default so the overload never
--     collides with the existing 6-argument signature, which becomes a thin
--     wrapper that always applies the guard. Callers that pass p_allow_similar
--     resolve to the new function; everyone else keeps the old contract.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_school_admin_save_subject_group(
  p_school_id uuid,
  p_offering_id uuid,
  p_name text,
  p_group_type text,
  p_registration_class_id uuid,
  p_group_id uuid,
  p_allow_similar boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
  v_access_mode text;
  v_seed_selected boolean := false;
  v_similar text;
begin
  if auth.uid() is null or not coalesce(public.can_administer_school(p_school_id),false) then
    raise exception using errcode='42501',message='school_administrator_access_required';
  end if;

  select o.access_mode
  into v_access_mode
  from public.school_subject_offerings o
  where o.id=p_offering_id
    and o.school_id=p_school_id
    and o.status='active'
    and o.academic_year_id=public.academic_resolve_operational_year_id(p_school_id,now());

  if v_access_mode is null then
    raise exception 'current_subject_offering_required';
  end if;

  if p_group_type='custom' and not coalesce(p_allow_similar,false) then
    select g.name into v_similar
    from public.school_subject_groups g
    where g.school_id=p_school_id
      and g.school_subject_offering_id=p_offering_id
      and g.status='active'
      and g.group_type='custom'
      and g.id is distinct from p_group_id
      and private.subject_group_name_key(g.name)=private.subject_group_name_key(p_name)
    limit 1;
    if v_similar is not null then
      raise exception using
        errcode='P0001',
        message='similar_custom_group_exists',
        detail=v_similar;
    end if;
  end if;

  if p_group_id is null then
    if p_group_type='custom'
       and v_access_mode='selected'
       and not exists (
         select 1
         from public.school_subject_groups g
         where g.school_id=p_school_id
           and g.school_subject_offering_id=p_offering_id
           and g.status='active'
           and g.group_type='custom'
       ) then
      v_seed_selected := true;
    end if;

    insert into public.school_subject_groups(
      school_id,school_subject_offering_id,name,group_type,registration_class_id,created_by
    )
    values(
      p_school_id,p_offering_id,p_name,p_group_type,p_registration_class_id,auth.uid()
    )
    returning id into v_id;

    if v_seed_selected then
      insert into public.school_subject_group_students(
        school_id,group_id,student_id,status,starts_on,ends_on,created_by
      )
      select
        p_school_id,
        v_id,
        r.student_id,
        'active',
        current_date,
        null,
        auth.uid()
      from private.subject_offering_eligible_students(p_offering_id) r
      on conflict do nothing;
    end if;
  else
    update public.school_subject_groups
    set name=p_name,
        group_type=p_group_type,
        registration_class_id=p_registration_class_id
    where id=p_group_id
      and school_id=p_school_id
      and school_subject_offering_id=p_offering_id
      and status='active'
    returning id into v_id;

    if v_id is null then
      raise exception 'active_subject_group_not_found';
    end if;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.rpc_school_admin_save_subject_group(uuid,uuid,text,text,uuid,uuid,boolean)
  from public,anon;
grant execute on function public.rpc_school_admin_save_subject_group(uuid,uuid,text,text,uuid,uuid,boolean)
  to authenticated;

create or replace function public.rpc_school_admin_save_subject_group(
  p_school_id uuid,
  p_offering_id uuid,
  p_name text,
  p_group_type text,
  p_registration_class_id uuid default null,
  p_group_id uuid default null
)
returns uuid
language sql
security definer
set search_path=''
as $$
  select public.rpc_school_admin_save_subject_group(
    p_school_id,p_offering_id,p_name,p_group_type,p_registration_class_id,p_group_id,false
  );
$$;

revoke all on function public.rpc_school_admin_save_subject_group(uuid,uuid,text,text,uuid,uuid)
  from public,anon;
grant execute on function public.rpc_school_admin_save_subject_group(uuid,uuid,text,text,uuid,uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Subject save places selected students into the sole custom group.
-- ---------------------------------------------------------------------------
create or replace function public.rpc_school_admin_save_school_subject(
  p_school_id uuid,
  p_name text,
  p_school_subject_id uuid default null,
  p_code text default null,
  p_academic_subject_id uuid default null,
  p_academic_year_id uuid default null,
  p_grade_level text default null,
  p_curriculum_scope_id uuid default null,
  p_access_mode text default 'all_grade',
  p_selected_student_ids uuid[] default '{}'::uuid[],
  p_teacher_user_id uuid default null,
  p_class_ids uuid[] default '{}'::uuid[],
  p_replace_teacher_allocations boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
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
  -- placement reporting
  v_delivery_mode text;
  v_custom_group_count integer:=0;
  v_sole_group_id uuid;
  v_sole_group_name text;
  v_placed_count integer:=0;
  v_unplaced_count integer:=0;
  v_placement jsonb:=null;
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

    select o.delivery_mode into v_delivery_mode
    from public.school_subject_offerings o where o.id=v_offering_id;

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

      -- Placement: keep custom teaching groups in step with the selective audience.
      -- A student removed from the subject must not linger on a group roster, and a
      -- student added to the subject lands in the teaching group automatically when
      -- there is exactly one. With several groups the choice is the administrator's,
      -- so the gap is reported instead of guessed.
      update public.school_subject_group_students m
      set status='withdrawn',ends_on=greatest(m.starts_on,current_date),updated_at=now()
      from public.school_subject_groups g
      where g.id=m.group_id
        and g.school_id=p_school_id
        and g.school_subject_offering_id=v_offering_id
        and g.status='active'
        and g.group_type='custom'
        and m.status='active'
        and not(m.student_id=any(coalesce(p_selected_student_ids,'{}'::uuid[])));

      select count(*), (array_agg(g.id))[1]
      into v_custom_group_count, v_sole_group_id
      from public.school_subject_groups g
      where g.school_id=p_school_id
        and g.school_subject_offering_id=v_offering_id
        and g.status='active'
        and g.group_type='custom';

      if v_custom_group_count=1 then
        select g.name into v_sole_group_name from public.school_subject_groups g where g.id=v_sole_group_id;
        insert into public.school_subject_group_students(
          school_id,group_id,student_id,status,starts_on,ends_on,created_by
        )
        select p_school_id,v_sole_group_id,selected.student_id,'active',current_date,null,v_actor
        from (select distinct unnest(coalesce(p_selected_student_ids,'{}'::uuid[])) student_id) selected
        where not exists(
          select 1 from public.school_subject_group_students m
          where m.group_id=v_sole_group_id and m.student_id=selected.student_id and m.status='active'
        );
        get diagnostics v_placed_count = row_count;
      end if;

      select count(*) into v_unplaced_count
      from (select distinct unnest(coalesce(p_selected_student_ids,'{}'::uuid[])) student_id) selected
      where not exists(
        select 1
        from public.school_subject_group_students m
        join public.school_subject_groups g on g.id=m.group_id
        where g.school_id=p_school_id
          and g.school_subject_offering_id=v_offering_id
          and g.status='active'
          and g.group_type='custom'
          and m.student_id=selected.student_id
          and m.status='active'
      );

      v_placement:=jsonb_build_object(
        'deliveryMode',v_delivery_mode,
        'customGroupCount',v_custom_group_count,
        'placedGroupId',case when v_placed_count>0 then v_sole_group_id end,
        'placedGroupName',case when v_placed_count>0 then v_sole_group_name end,
        'placedGroupTeachers',case when v_placed_count>0 then coalesce((
          select jsonb_agg(coalesce(nullif(u.full_name,''),u.username) order by u.username)
          from public.school_subject_group_teachers t
          join public.users u on u.id=t.teacher_user_id
          where t.group_id=v_sole_group_id and t.active
        ),'[]'::jsonb) end,
        'placedCount',v_placed_count,
        'unplacedCount',v_unplaced_count
      );
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
    'mappingRequestId',v_request_id,
    'placement',v_placement
  );
end;
$function$;

revoke all on function public.rpc_school_admin_save_school_subject(uuid,text,uuid,text,uuid,uuid,text,uuid,text,uuid[],uuid,uuid[],boolean)
  from public,anon;
grant execute on function public.rpc_school_admin_save_school_subject(uuid,text,uuid,text,uuid,uuid,text,uuid,text,uuid[],uuid,uuid[],boolean)
  to authenticated;
