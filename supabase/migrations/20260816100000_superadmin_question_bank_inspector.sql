-- Platform-wide, read-only question-bank governance for superadmins.
--
-- The RPC deliberately returns provenance and quality signals without granting
-- direct browser access to questions, teacher profiles, or school records.

create or replace function public.rpc_superadmin_question_bank_inspector(
  p_pool text default 'verified',
  p_search text default null,
  p_subject text default null,
  p_school_id uuid default null,
  p_status text default 'all',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_pool text := lower(coalesce(nullif(trim(p_pool), ''), 'verified'));
  v_search text := nullif(trim(p_search), '');
  v_subject text := nullif(trim(p_subject), '');
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'all'));
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'platform_superadmin_access_required';
  end if;

  if v_pool not in ('verified', 'teacher', 'archive') then
    raise exception using errcode = '22023', message = 'invalid_question_pool';
  end if;

  if v_status not in ('all', 'active', 'inactive', 'visual', 'needs_attention', 'high_usage') then
    raise exception using errcode = '22023', message = 'invalid_question_status_filter';
  end if;

  with base as (
    select
      q.*,
      case
        when q.content_origin = 'brain_heist' and q.verification_status = 'verified' then 'verified'
        when q.content_origin = 'teacher' then 'teacher'
        else 'archive'
      end as pool_key,
      t.user_id as teacher_user_id,
      t.verified as teacher_verified,
      coalesce(nullif(u.full_name, ''), nullif(u.username, ''), 'Unlinked teacher record') as teacher_name,
      u.avatar_url as teacher_avatar_url,
      coalesce(u.school_id, membership.school_id) as resolved_school_id,
      coalesce(nullif(s.name, ''), nullif(t.school_name, ''), nullif(u.school, ''), 'Independent / school unavailable') as school_name,
      s.logo_url as school_logo_url,
      s.status as school_status,
      (t.id is not null and u.id is not null) as profile_linked,
      case
        when q.content_origin = 'brain_heist' and q.verification_status = 'verified'
          and q.current_content_hash is not null
          and q.verified_content_hash is not null
          and q.current_content_hash = q.verified_content_hash then 'sealed'
        when q.content_origin = 'brain_heist' and q.verification_status = 'verified' then 'drift'
        when q.content_origin = 'teacher' then 'classroom'
        else 'retired'
      end as integrity_state,
      case
        when q.content_origin = 'brain_heist' and q.verification_status = 'verified' then
          q.current_content_hash is null
          or q.verified_content_hash is null
          or q.current_content_hash <> q.verified_content_hash
          or not coalesce(q.analytics_eligible, false)
          or not coalesce(q.is_active, false)
          or not coalesce(q.is_public, false)
        when q.content_origin = 'teacher' then
          t.id is null
          or u.id is null
          or coalesce(u.school_id, membership.school_id) is null
          or not coalesce(q.is_active, false)
          or length(trim(coalesce(q.question_text, ''))) < 10
          or length(trim(coalesce(q.correct_answer, ''))) < 1
        else true
      end as needs_attention,
      round(
        case when coalesce(q.times_answered, 0) > 0
          then (100.0 * coalesce(q.times_correct, 0) / q.times_answered)
          else null
        end,
        1
      ) as accuracy_percent
    from public.questions q
    left join public.teachers t on t.id = q.teacher_id
    left join public.users u on u.id = t.user_id
    left join lateral (
      select sm.school_id
      from public.school_members sm
      where sm.user_id = t.user_id and sm.status = 'active'
      order by case sm.role_in_school when 'teacher' then 0 when 'school_admin' then 1 else 2 end,
        sm.joined_at desc
      limit 1
    ) membership on true
    left join public.schools s on s.id = coalesce(u.school_id, membership.school_id)
  ),
  selected as (
    select * from base where pool_key = v_pool
  ),
  filtered as (
    select *
    from selected b
    where (v_subject is null or lower(b.subject) = lower(v_subject))
      and (p_school_id is null or b.resolved_school_id = p_school_id)
      and (
        v_search is null
        or concat_ws(' ', b.question_text, b.correct_answer, b.subject, b.topic,
          b.topic_name, b.teacher_name, b.school_name, b.verified_external_id,
          b.content_version, b.curriculum_skill, b.curriculum_objective
        ) ilike '%' || v_search || '%'
      )
      and (
        v_status = 'all'
        or (v_status = 'active' and b.is_active)
        or (v_status = 'inactive' and not b.is_active)
        or (v_status = 'visual' and b.image_url is not null)
        or (v_status = 'needs_attention' and b.needs_attention)
        or (v_status = 'high_usage' and coalesce(b.times_answered, 0) >= 20)
      )
  )
  select jsonb_build_object(
    'success', true,
    'summary', (
      select jsonb_build_object(
        'totalQuestions', count(*),
        'verifiedQuestions', count(*) filter (where pool_key = 'verified'),
        'teacherQuestions', count(*) filter (where pool_key = 'teacher'),
        'archivedQuestions', count(*) filter (where pool_key = 'archive'),
        'visualQuestions', count(*) filter (where image_url is not null),
        'teacherAuthors', count(distinct teacher_id) filter (where pool_key = 'teacher'),
        'teacherSchools', count(distinct resolved_school_id) filter (where pool_key = 'teacher'),
        'needsAttention', count(*) filter (where needs_attention)
      )
      from base
    ),
    'filters', jsonb_build_object(
      'subjects', coalesce((
        select jsonb_agg(jsonb_build_object('name', subject, 'count', question_count) order by subject)
        from (
          select subject, count(*) as question_count
          from selected
          group by subject
        ) subject_counts
      ), '[]'::jsonb),
      'schools', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', resolved_school_id,
          'name', school_name,
          'count', question_count
        ) order by school_name)
        from (
          select resolved_school_id, school_name, count(*) as question_count
          from selected
          where resolved_school_id is not null
          group by resolved_school_id, school_name
        ) school_counts
      ), '[]'::jsonb)
    ),
    'pool', v_pool,
    'total', (select count(*) from filtered),
    'limit', v_limit,
    'offset', v_offset,
    'questions', coalesce((
      select jsonb_agg(page.payload order by page.needs_attention desc, page.created_at desc, page.id)
      from (
        select
          b.id,
          b.created_at,
          b.needs_attention,
          jsonb_strip_nulls(jsonb_build_object(
            'id', b.id,
            'pool', b.pool_key,
            'subject', b.subject,
            'topic', coalesce(nullif(b.topic_name, ''), nullif(b.topic, ''), 'General'),
            'difficulty', b.difficulty,
            'questionText', b.question_text,
            'questionType', b.question_type,
            'options', b.options,
            'correctAnswer', b.correct_answer,
            'explanation', b.explanation,
            'imageUrl', b.image_url,
            'imageAltText', b.image_alt_text,
            'gradeLevel', b.grade_level,
            'eligibleGradeLevels', to_jsonb(b.eligible_grade_levels),
            'curriculum', jsonb_strip_nulls(jsonb_build_object(
              'strand', b.curriculum_strand,
              'skill', b.curriculum_skill,
              'subskill', b.curriculum_subskill,
              'objective', b.curriculum_objective,
              'reviewStatus', b.curriculum_review_status
            )),
            'verificationStatus', b.verification_status,
            'analyticsEligible', b.analytics_eligible,
            'integrityState', b.integrity_state,
            'needsAttention', b.needs_attention,
            'isPublic', b.is_public,
            'isActive', b.is_active,
            'timesAnswered', coalesce(b.times_answered, 0),
            'timesCorrect', coalesce(b.times_correct, 0),
            'accuracyPercent', b.accuracy_percent,
            'contentVersion', b.content_version,
            'contentRevision', b.content_revision,
            'externalId', b.verified_external_id,
            'verifiedByAuthority', b.verified_by_authority,
            'verifiedAt', b.verified_at,
            'createdAt', b.created_at,
            'updatedAt', b.updated_at,
            'teacher', case when b.pool_key = 'teacher' then jsonb_build_object(
              'teacherId', b.teacher_id,
              'userId', b.teacher_user_id,
              'name', b.teacher_name,
              'avatarUrl', b.teacher_avatar_url,
              'verified', coalesce(b.teacher_verified, false),
              'profileLinked', b.profile_linked,
              'schoolId', b.resolved_school_id,
              'schoolName', b.school_name,
              'schoolLogoUrl', b.school_logo_url,
              'schoolStatus', b.school_status
            ) else null end
          )) as payload
        from filtered b
        order by b.needs_attention desc, b.created_at desc, b.id
        limit v_limit offset v_offset
      ) page
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.rpc_superadmin_question_bank_inspector(text,text,text,uuid,text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_superadmin_question_bank_inspector(text,text,text,uuid,text,integer,integer)
  to authenticated, service_role;

comment on function public.rpc_superadmin_question_bank_inspector(text,text,text,uuid,text,integer,integer) is
  'Read-only, fail-closed question-bank governance catalog for Brains Heist platform superadmins.';
