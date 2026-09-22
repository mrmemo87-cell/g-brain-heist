-- School Subjects v2 / 3 of 3
-- Learning catalogue and superadmin academic-attention inbox.

create or replace function public.rpc_student_academic_subjects(p_student_id uuid default null::uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_student uuid:=coalesce(p_student_id,auth.uid());
  v_school uuid;
  v_year uuid;
  v_grade text;
  v_teacher uuid;
begin
  if v_caller is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;

  -- Teachers see every allocated school subject independently, even when two
  -- subjects share the same canonical academic resource map.
  if v_student=v_caller then
    select t.id into v_teacher from public.teachers t where t.user_id=v_caller;
    if v_teacher is not null then
      select sm.school_id into v_school
      from public.school_members sm
      where sm.user_id=v_caller and sm.status='active'
      order by sm.joined_at desc nulls last,sm.id limit 1;
      if v_school is null then
        select u.school_id into v_school from public.users u where u.id=v_caller;
      end if;

      if v_school is not null and exists(
        select 1 from public.class_teacher_assignments cta
        where cta.teacher_user_id=v_caller and cta.school_id=v_school and cta.active
      ) then
        v_year:=public.academic_resolve_year_id(v_school,now());
        return jsonb_build_object(
          'success',true,'ready',true,'academicYearId',v_year,'gradeLevel',null,
          'subjects',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',ss.id,
              'schoolSubjectId',ss.id,
              'code',coalesce(nullif(ss.code,''),public.academic_normalize_subject_key(ss.name)),
              'name',ss.name,
              'canonicalName',academic.name,
              'academicSubjectId',ss.academic_subject_id,
              'mappingStatus',case when ss.academic_subject_id is null then 'unmapped' else 'mapped' end,
              'requirement','teacher_allocation',
              'scopeId',offering.curriculum_scope_id,
              'approvedQuestionCount',case
                when ss.academic_subject_id is null or offering.curriculum_scope_id is null then 0
                else (
                  select count(distinct im.assessment_item_id)
                  from public.curriculum_item_objective_mappings im
                  join public.curriculum_assessment_items ai
                    on ai.id=im.assessment_item_id and ai.is_active
                  join public.questions q
                    on q.id::text=ai.source_record_id
                  where im.curriculum_scope_id=offering.curriculum_scope_id
                    and im.academic_subject_id=ss.academic_subject_id
                    and im.status='approved' and im.mapping_role='primary'
                    and im.superseded_at is null
                    and q.academic_subject_id=ss.academic_subject_id
                    and q.is_active and q.verification_status='verified' and q.analytics_eligible
                )
              end
            ) order by ss.name)
            from (
              select distinct cta.school_subject_id
              from public.class_teacher_assignments cta
              where cta.teacher_user_id=v_caller and cta.school_id=v_school and cta.active
                and cta.school_subject_id is not null
            ) allocated
            join public.school_subjects ss on ss.id=allocated.school_subject_id and ss.is_active
            left join public.academic_subjects academic
              on academic.id=ss.academic_subject_id and academic.is_active
            left join lateral (
              select so.curriculum_scope_id
              from public.school_subject_offerings so
              where so.school_subject_id=ss.id and so.status='active'
                and (v_year is null or so.academic_year_id=v_year)
              order by so.updated_at desc limit 1
            ) offering on true
          ),'[]'::jsonb)
        );
      end if;
    end if;
  end if;

  select u.school_id into v_school from public.users u where u.id=v_student;
  if v_school is null then
    return jsonb_build_object('success',true,'ready',false,'code','school_required','subjects','[]'::jsonb);
  end if;

  if v_caller<>v_student and not(
    public.can_administer_school(v_school) or public.is_school_owner(v_school)
    or exists(
      select 1
      from public.class_students cs
      join public.class_teacher_assignments cta on cta.class_id=cs.class_id and cta.active
      where cs.student_id=v_student and cta.teacher_user_id=v_caller and cta.school_id=v_school
    )
  ) then
    raise exception using errcode='42501',message='student_academic_subject_access_denied';
  end if;

  select ae.academic_year_id,ae.grade_level into v_year,v_grade
  from public.student_academic_enrolments ae
  join public.school_academic_years y on y.id=ae.academic_year_id and y.status='current'
  where ae.student_id=v_student and ae.school_id=v_school
    and current_date between ae.starts_on and coalesce(ae.ends_on,current_date)
  order by ae.starts_on desc,ae.created_at desc limit 1;

  if v_year is null or v_grade is null then
    return jsonb_build_object('success',true,'ready',false,'code','current_grade_enrolment_required','subjects','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'success',true,'ready',true,'academicYearId',v_year,'gradeLevel',v_grade,
    'subjects',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ss.id,
        'schoolSubjectId',ss.id,
        'code',coalesce(nullif(ss.code,''),public.academic_normalize_subject_key(ss.name)),
        'name',ss.name,
        'canonicalName',academic.name,
        'academicSubjectId',ss.academic_subject_id,
        'mappingStatus',case when ss.academic_subject_id is null then 'unmapped' else 'mapped' end,
        'requirement',offering.access_mode,
        'scopeId',offering.curriculum_scope_id,
        'approvedQuestionCount',case
          when ss.academic_subject_id is null or offering.curriculum_scope_id is null then 0
          else (
            select count(distinct im.assessment_item_id)
            from public.curriculum_item_objective_mappings im
            join public.curriculum_assessment_items ai
              on ai.id=im.assessment_item_id and ai.is_active
            join public.questions q on q.id::text=ai.source_record_id
            where im.curriculum_scope_id=offering.curriculum_scope_id
              and im.academic_subject_id=ss.academic_subject_id
              and im.status='approved' and im.mapping_role='primary'
              and im.superseded_at is null
              and q.academic_subject_id=ss.academic_subject_id
              and q.is_active and q.verification_status='verified' and q.analytics_eligible
          )
        end
      ) order by ss.name)
      from public.school_subject_offerings offering
      join public.school_subjects ss
        on ss.id=offering.school_subject_id and ss.school_id=v_school and ss.is_active
      left join public.academic_subjects academic
        on academic.id=ss.academic_subject_id and academic.is_active
      where offering.school_id=v_school
        and offering.academic_year_id=v_year
        and offering.grade_level=v_grade
        and offering.status='active'
        and (
          offering.access_mode='all_grade'
          or exists(
            select 1 from public.school_subject_enrolments e
            where e.student_id=v_student and e.school_subject_id=ss.id
              and e.academic_year_id=v_year and e.status='active'
              and current_date>=e.starts_on
              and (e.ends_on is null or current_date<=e.ends_on)
          )
        )
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_student_academic_subjects(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_student_academic_subjects(uuid)
  to authenticated,service_role;

-- Question authorization follows the canonical map of the allocated school
-- subject. The local label can be supplied as p_subject (e.g. ESL) and still
-- resolves to English resources without merging the two school subjects.
create or replace function public.get_all_active_questions(
  p_subject text default null::text,
  p_difficulty text default null::text,
  p_teacher_id uuid default null::uuid,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table(
  id uuid,
  teacher_id uuid,
  subject text,
  subject_id text,
  topic text,
  topic_name text,
  difficulty text,
  question_text text,
  image_url text,
  image_alt_text text,
  question_type text,
  options jsonb,
  correct_answer text,
  explanation text,
  hints text[],
  time_limit integer,
  points integer,
  tags text[],
  grade_level text,
  is_public boolean,
  is_active boolean,
  times_answered integer,
  times_correct integer,
  created_at timestamptz,
  updated_at timestamptz,
  creator_name text,
  creator_school_id uuid,
  is_mine boolean,
  content_origin text,
  verification_status text,
  analytics_eligible boolean,
  verified_at timestamptz,
  verified_by uuid,
  verified_by_authority text,
  verified_content_hash text,
  current_content_hash text,
  content_version text,
  content_revision integer,
  eligible_grade_levels smallint[]
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_teacher uuid;
  v_school uuid;
  v_year uuid;
  v_has_allocations boolean:=false;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='authentication_required';
  end if;
  select t.id into v_teacher from public.teachers t where t.user_id=v_actor;
  if v_teacher is null then
    raise exception using errcode='42501',message='teacher_required';
  end if;
  if p_teacher_id is not null and p_teacher_id<>v_teacher then
    raise exception using errcode='42501',message='cannot_browse_another_teacher_pool';
  end if;

  select sm.school_id into v_school
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id limit 1;
  if v_school is null then select u.school_id into v_school from public.users u where u.id=v_actor; end if;
  if v_school is not null then
    v_year:=public.academic_resolve_year_id(v_school,now());
    select exists(
      select 1 from public.class_teacher_assignments cta
      join public.classes c on c.id=cta.class_id and c.school_id=cta.school_id
      where cta.teacher_user_id=v_actor and cta.school_id=v_school and cta.active
        and coalesce(c.is_active,true)
    ) into v_has_allocations;
  end if;

  return query
  with authorized_scopes as materialized (
    select distinct
      ss.id as school_subject_id,
      ss.name as school_subject_name,
      academic.name as canonical_subject_name,
      c.grade_level,
      ss.academic_subject_id,
      offering.curriculum_scope_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id=cta.class_id and c.school_id=cta.school_id
      and coalesce(c.is_active,true) and c.grade_level~'^[0-9]+$'
    join public.school_subjects ss
      on ss.id=cta.school_subject_id and ss.school_id=cta.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id and academic.is_active
    join public.school_subject_offerings offering
      on offering.school_subject_id=ss.id and offering.school_id=cta.school_id
      and offering.grade_level=c.grade_level and offering.status='active'
      and offering.curriculum_scope_id is not null
      and (v_year is null or offering.academic_year_id=v_year)
    where v_has_allocations and cta.teacher_user_id=v_actor
      and cta.school_id=v_school and cta.active

    union all

    -- Legacy allocations not yet linked to a school_subject_id remain fail-closed
    -- to the existing governed curriculum map during transition.
    select distinct
      null::uuid,
      cta.subject,
      academic.name,
      c.grade_level,
      mapping.academic_subject_id,
      mapping.curriculum_scope_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id=cta.class_id and c.school_id=cta.school_id
      and coalesce(c.is_active,true) and c.grade_level~'^[0-9]+$'
    join public.school_curriculum_scope_mappings mapping
      on mapping.school_id=v_school and mapping.grade_level=c.grade_level
      and mapping.status='active'
      and (v_year is null or mapping.academic_year_id=v_year)
    join public.academic_subjects academic on academic.id=mapping.academic_subject_id and academic.is_active
    where v_has_allocations and cta.teacher_user_id=v_actor and cta.school_id=v_school
      and cta.active and cta.school_subject_id is null
      and private.teacher_assignment_subject_key(cta.subject)=private.teacher_assignment_subject_key(academic.name)

    union all

    select distinct
      ss.id,
      ss.name,
      academic.name,
      offering.grade_level,
      ss.academic_subject_id,
      offering.curriculum_scope_id
    from public.school_subject_offerings offering
    join public.school_subjects ss
      on ss.id=offering.school_subject_id and ss.school_id=offering.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic on academic.id=ss.academic_subject_id and academic.is_active
    where not v_has_allocations and v_school is not null
      and offering.school_id=v_school and offering.status='active'
      and offering.curriculum_scope_id is not null
      and (v_year is null or offering.academic_year_id=v_year)
  ),
  authorized_verified as materialized (
    select distinct q0.id
    from public.questions q0
    join authorized_scopes scope
      on scope.academic_subject_id=q0.academic_subject_id
      and scope.grade_level::smallint=any(q0.eligible_grade_levels)
    join public.curriculum_assessment_items item
      on item.source_type='question_bank' and item.source_record_id=q0.id::text
      and item.source_item_key='question' and item.is_active
      and item.content_hash=q0.verified_content_hash
    join public.curriculum_item_objective_mappings im
      on im.assessment_item_id=item.id
      and im.curriculum_scope_id=scope.curriculum_scope_id
      and im.academic_subject_id=q0.academic_subject_id
      and im.status='approved' and im.mapping_role='primary'
      and im.item_content_hash=item.content_hash
    join public.curriculum_framework_versions fv
      on fv.id=im.framework_version_id and fv.status in ('published','retired')
      and fv.content_hash=im.curriculum_version_content_hash
    where q0.is_active and q0.content_origin='brain_heist'
      and q0.verification_status='verified' and q0.analytics_eligible and q0.is_public
      and q0.current_content_hash=q0.verified_content_hash
      and (
        p_subject is null
        or lower(trim(scope.school_subject_name))=lower(trim(p_subject))
        or lower(trim(scope.canonical_subject_name))=lower(trim(p_subject))
        or lower(trim(q0.subject))=lower(trim(p_subject))
      )
      and (p_difficulty is null or q0.difficulty=p_difficulty)
  ),
  candidate_ids as materialized (
    select av.id from authorized_verified av
    union
    select q0.id
    from public.questions q0
    where q0.is_active and q0.content_origin='teacher' and q0.teacher_id=v_teacher
      and (p_subject is null or lower(trim(q0.subject))=lower(trim(p_subject)))
      and (p_difficulty is null or q0.difficulty=p_difficulty)
  ),
  paged as materialized (
    select q0.id,q0.created_at
    from candidate_ids ids
    join public.questions q0 on q0.id=ids.id
    order by q0.created_at desc
    limit greatest(1,least(coalesce(p_limit,500),1000))
    offset greatest(coalesce(p_offset,0),0)
  )
  select
    q.id,q.teacher_id,q.subject,q.subject_id,q.topic,q.topic_name,q.difficulty,
    q.question_text,q.image_url,q.image_alt_text,q.question_type,q.options,
    q.correct_answer,q.explanation,q.hints,q.time_limit,q.points,q.tags,q.grade_level,
    q.is_public,q.is_active,q.times_answered,q.times_correct,q.created_at,q.updated_at,
    case when q.content_origin='brain_heist' then 'Brains Heist' else coalesce(u.username,'Teacher') end,
    case when q.content_origin='brain_heist' then null else u.school_id end,
    q.content_origin='teacher' and q.teacher_id=v_teacher,
    q.content_origin,q.verification_status,q.analytics_eligible,q.verified_at,q.verified_by,
    q.verified_by_authority,q.verified_content_hash,q.current_content_hash,
    q.content_version,q.content_revision,q.eligible_grade_levels
  from paged page
  join public.questions q on q.id=page.id
  left join public.teachers t on t.id=q.teacher_id
  left join public.users u on u.id=t.user_id
  order by page.created_at desc;
end;
$$;

create or replace function public.rpc_superadmin_subject_mapping_requests(
  p_status text default 'pending'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null or not coalesce(public.is_superadmin(v_actor),false) then
    raise exception using errcode='42501',message='superadmin_access_required';
  end if;
  if p_status not in ('pending','resolved','dismissed','all') then
    raise exception using errcode='22023',message='invalid_mapping_request_status';
  end if;

  return jsonb_build_object(
    'success',true,
    'requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',request.id,
        'schoolId',request.school_id,
        'schoolName',school.name,
        'schoolSubjectId',request.school_subject_id,
        'subjectName',subject.name,
        'subjectCode',subject.code,
        'status',request.status,
        'requestedBy',request.requested_by,
        'requestedAt',request.requested_at,
        'resolvedBy',request.resolved_by,
        'resolvedAt',request.resolved_at,
        'resolutionNote',request.resolution_note
      ) order by case request.status when 'pending' then 0 else 1 end,request.requested_at desc)
      from public.school_subject_mapping_requests request
      join public.schools school on school.id=request.school_id
      join public.school_subjects subject on subject.id=request.school_subject_id
      where p_status='all' or request.status=p_status
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.rpc_superadmin_subject_mapping_requests(text)
  from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_subject_mapping_requests(text)
  to authenticated,service_role;
