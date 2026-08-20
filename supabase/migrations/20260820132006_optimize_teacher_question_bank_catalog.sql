-- Optimize the shared teacher Question Bank catalogue without changing its
-- authorization semantics. The previous implementation called
-- private.verified_question_has_curriculum_mapping() once per candidate
-- question. That helper re-joined the full curriculum graph each time and
-- caused browser-facing RPC calls to hit the statement timeout for teachers
-- with larger verified catalogues.
--
-- This version resolves the caller's authorized curriculum scopes once and
-- performs a single set-based join across verified question mappings. Teacher
-- owned questions remain private to the caller. Subject, difficulty, school,
-- academic-year, class-allocation, grade and curriculum mapping guards are
-- preserved.

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
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_teacher uuid;
  v_school_id uuid;
  v_academic_year_id uuid;
  v_has_allocations boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select t.id
  into v_teacher
  from public.teachers t
  where t.user_id = v_actor;

  if v_teacher is null then
    raise exception using errcode = '42501', message = 'teacher_required';
  end if;

  if p_teacher_id is not null and p_teacher_id <> v_teacher then
    raise exception using errcode = '42501', message = 'cannot_browse_another_teacher_pool';
  end if;

  select sm.school_id
  into v_school_id
  from public.school_members sm
  where sm.user_id = v_actor
    and sm.status = 'active'
  order by sm.joined_at desc nulls last, sm.id
  limit 1;

  if v_school_id is null then
    select u.school_id
    into v_school_id
    from public.users u
    where u.id = v_actor;
  end if;

  if v_school_id is not null then
    v_academic_year_id := public.academic_resolve_year_id(v_school_id, now());

    select exists (
      select 1
      from public.class_teacher_assignments cta
      join public.classes c
        on c.id = cta.class_id
       and c.school_id = cta.school_id
      where cta.teacher_user_id = v_actor
        and cta.school_id = v_school_id
        and cta.active
        and coalesce(c.is_active, true)
    )
    into v_has_allocations;
  end if;

  return query
  with authorized_scopes as materialized (
    select distinct
      private.teacher_assignment_subject_key(cta.subject) as subject_key,
      c.grade_level,
      scm.academic_subject_id,
      scm.curriculum_scope_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id = cta.class_id
     and c.school_id = cta.school_id
     and coalesce(c.is_active, true)
     and c.grade_level ~ '^[0-9]+$'
    join public.school_curriculum_scope_mappings scm
      on scm.school_id = v_school_id
     and (v_academic_year_id is null or scm.academic_year_id = v_academic_year_id)
     and scm.grade_level = c.grade_level
     and scm.status = 'active'
    where v_has_allocations
      and cta.teacher_user_id = v_actor
      and cta.school_id = v_school_id
      and cta.active

    union all

    select
      null::text as subject_key,
      scm.grade_level,
      scm.academic_subject_id,
      scm.curriculum_scope_id
    from public.school_curriculum_scope_mappings scm
    where not v_has_allocations
      and v_school_id is not null
      and scm.school_id = v_school_id
      and (v_academic_year_id is null or scm.academic_year_id = v_academic_year_id)
      and scm.status = 'active'
      and scm.grade_level ~ '^[0-9]+$'
  ),
  authorized_verified as materialized (
    select distinct q0.id
    from public.questions q0
    join authorized_scopes s
      on s.academic_subject_id = q0.academic_subject_id
     and (
       s.subject_key is null
       or s.subject_key = private.teacher_assignment_subject_key(q0.subject)
     )
     and s.grade_level::smallint = any(q0.eligible_grade_levels)
    join public.curriculum_assessment_items i
      on i.source_type = 'question_bank'
     and i.source_record_id = q0.id::text
     and i.source_item_key = 'question'
     and i.is_active
     and i.content_hash = q0.verified_content_hash
    join public.curriculum_item_objective_mappings im
      on im.assessment_item_id = i.id
     and im.curriculum_scope_id = s.curriculum_scope_id
     and im.academic_subject_id = q0.academic_subject_id
     and im.status = 'approved'
     and im.mapping_role = 'primary'
     and im.item_content_hash = i.content_hash
    join public.curriculum_framework_versions fv
      on fv.id = im.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = im.curriculum_version_content_hash
    where q0.is_active
      and q0.content_origin = 'brain_heist'
      and q0.verification_status = 'verified'
      and q0.analytics_eligible
      and q0.is_public
      and q0.current_content_hash = q0.verified_content_hash
      and (p_subject is null or q0.subject = p_subject)
      and (p_difficulty is null or q0.difficulty = p_difficulty)
  ),
  candidate_ids as materialized (
    select av.id
    from authorized_verified av

    union all

    select q0.id
    from public.questions q0
    where q0.is_active
      and q0.content_origin = 'teacher'
      and q0.teacher_id = v_teacher
      and (p_subject is null or q0.subject = p_subject)
      and (p_difficulty is null or q0.difficulty = p_difficulty)
  ),
  paged as materialized (
    select q0.id, q0.created_at
    from candidate_ids ci
    join public.questions q0 on q0.id = ci.id
    order by q0.created_at desc
    limit greatest(1, least(coalesce(p_limit, 500), 1000))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    q.id,
    q.teacher_id,
    q.subject,
    q.subject_id,
    q.topic,
    q.topic_name,
    q.difficulty,
    q.question_text,
    q.image_url,
    q.image_alt_text,
    q.question_type,
    q.options,
    q.correct_answer,
    q.explanation,
    q.hints,
    q.time_limit,
    q.points,
    q.tags,
    q.grade_level,
    q.is_public,
    q.is_active,
    q.times_answered,
    q.times_correct,
    q.created_at,
    q.updated_at,
    case
      when q.content_origin = 'brain_heist' then 'Brains Heist'
      else coalesce(u.username, 'Teacher')
    end,
    case
      when q.content_origin = 'brain_heist' then null
      else u.school_id
    end,
    q.content_origin = 'teacher' and q.teacher_id = v_teacher,
    q.content_origin,
    q.verification_status,
    q.analytics_eligible,
    q.verified_at,
    q.verified_by,
    q.verified_by_authority,
    q.verified_content_hash,
    q.current_content_hash,
    q.content_version,
    q.content_revision,
    q.eligible_grade_levels
  from paged pg
  join public.questions q on q.id = pg.id
  left join public.teachers t on t.id = q.teacher_id
  left join public.users u on u.id = t.user_id
  order by pg.created_at desc;
end;
$function$;
