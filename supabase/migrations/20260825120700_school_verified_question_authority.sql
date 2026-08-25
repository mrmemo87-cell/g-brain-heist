-- School-verified question authority
--
-- Authorship and publication scope are deliberately separate:
--   * content_origin records who authored the item (Brains Heist or teacher);
--   * pool_scope controls where a governed item may be used.
--
-- Only Global Verified and School Verified items can contribute to the
-- Academic Profile. Teacher Pool items remain private to their author.

alter table public.questions
  add column if not exists pool_scope text not null default 'teacher',
  add column if not exists owner_school_id uuid
    references public.schools(id) on delete restrict;

update public.questions
set pool_scope = case
      when content_origin = 'brain_heist' then 'global'
      else 'teacher'
    end,
    owner_school_id = null
where pool_scope is distinct from case
        when content_origin = 'brain_heist' then 'global'
        else 'teacher'
      end
   or owner_school_id is not null;

alter table public.questions
  drop constraint if exists questions_pool_scope_check,
  drop constraint if exists questions_authority_invariants_check;

alter table public.questions
  add constraint questions_pool_scope_check
    check (pool_scope in ('global', 'school', 'teacher')),
  add constraint questions_authority_invariants_check check (
    (
      pool_scope = 'global'
      and content_origin = 'brain_heist'
      and owner_school_id is null
      and verification_status in ('verified', 'retired')
      and verified_at is not null
      and nullif(trim(verified_by_authority), '') is not null
      and verified_content_hash ~ '^[0-9a-f]{64}$'
      and current_content_hash = verified_content_hash
      and content_fingerprint ~ '^[0-9a-f]{64}$'
      and nullif(trim(curriculum_strand), '') is not null
      and nullif(trim(curriculum_skill), '') is not null
      and nullif(trim(curriculum_subskill), '') is not null
      and nullif(trim(curriculum_objective), '') is not null
      and cardinality(eligible_grade_levels) > 0
      and curriculum_review_status = 'approved'
      and (
        (verification_status = 'verified' and analytics_eligible and is_public)
        or (verification_status = 'retired' and not analytics_eligible and not is_public)
      )
    ) or (
      pool_scope = 'school'
      and content_origin = 'teacher'
      and owner_school_id is not null
      and teacher_id is not null
      and verification_status in ('verified', 'retired')
      and verified_at is not null
      and nullif(trim(verified_by_authority), '') is not null
      and verified_content_hash ~ '^[0-9a-f]{64}$'
      and current_content_hash = verified_content_hash
      and content_fingerprint ~ '^[0-9a-f]{64}$'
      and nullif(trim(curriculum_strand), '') is not null
      and nullif(trim(curriculum_skill), '') is not null
      and nullif(trim(curriculum_subskill), '') is not null
      and nullif(trim(curriculum_objective), '') is not null
      and cardinality(eligible_grade_levels) > 0
      and curriculum_review_status = 'approved'
      and not is_public
      and (
        (verification_status = 'verified' and analytics_eligible)
        or (verification_status = 'retired' and not analytics_eligible)
      )
    ) or (
      pool_scope = 'teacher'
      and content_origin = 'teacher'
      and owner_school_id is null
      and verification_status in ('unverified', 'in_review', 'rejected')
      and not analytics_eligible
      and not is_public
      and verified_at is null
      and verified_by is null
      and verified_by_authority is null
      and verified_content_hash is null
      and curriculum_strand is null
      and curriculum_skill is null
      and curriculum_subskill is null
      and curriculum_objective is null
      and (
        (verification_status = 'unverified' and curriculum_review_status = 'draft')
        or (verification_status = 'in_review' and curriculum_review_status = 'in_review')
        or (verification_status = 'rejected' and curriculum_review_status = 'rejected')
      )
    )
  );

create index if not exists questions_owner_school_id_idx
  on public.questions(owner_school_id)
  where owner_school_id is not null;
create index if not exists questions_school_verified_catalog_idx
  on public.questions(owner_school_id, academic_subject_id, is_active)
  where pool_scope = 'school'
    and verification_status = 'verified'
    and analytics_eligible;
create index if not exists questions_teacher_private_catalog_idx
  on public.questions(teacher_id, created_at desc)
  where pool_scope = 'teacher';

create or replace function private.enforce_question_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'service_role');
  v_content_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_content_changed := row(
      new.subject, new.topic, new.topic_name, new.question_text, new.options,
      new.correct_answer, new.explanation, new.image_url, new.question_type
    ) is distinct from row(
      old.subject, old.topic, old.topic_name, old.question_text, old.options,
      old.correct_answer, old.explanation, old.image_url, old.question_type
    );

    if old.pool_scope in ('global', 'school')
       and old.verification_status in ('verified', 'retired')
       and v_content_changed then
      raise exception using errcode = '55000',
        message = 'verified_question_content_is_immutable';
    end if;

    if not v_service and row(
      new.content_origin, new.pool_scope, new.owner_school_id,
      new.verification_status, new.analytics_eligible, new.verified_at,
      new.verified_by, new.verified_by_authority, new.verified_content_hash,
      new.content_version
    ) is distinct from row(
      old.content_origin, old.pool_scope, old.owner_school_id,
      old.verification_status, old.analytics_eligible, old.verified_at,
      old.verified_by, old.verified_by_authority, old.verified_content_hash,
      old.content_version
    ) then
      raise exception using errcode = '42501',
        message = 'question_authority_fields_are_protected';
    end if;
  end if;

  if not v_service and (tg_op = 'INSERT' or new.pool_scope = 'teacher') then
    new.content_origin := 'teacher';
    new.pool_scope := 'teacher';
    new.owner_school_id := null;
    new.verification_status := 'unverified';
    new.analytics_eligible := false;
    new.is_public := false;
    new.verified_at := null;
    new.verified_by := null;
    new.verified_by_authority := null;
    new.verified_content_hash := null;
    new.curriculum_review_status := 'draft';
    new.curriculum_strand := null;
    new.curriculum_skill := null;
    new.curriculum_subskill := null;
    new.curriculum_objective := null;
  end if;

  new.current_content_hash := private.question_content_hash(
    new.id, new.question_text, new.options, new.correct_answer,
    new.explanation, new.image_url, new.question_type
  );
  new.content_fingerprint := private.question_content_fingerprint(
    new.subject, coalesce(nullif(new.topic_name, ''), new.topic),
    new.question_text, new.options, new.correct_answer, new.question_type
  );

  if tg_op = 'UPDATE'
     and new.pool_scope = 'teacher'
     and v_content_changed then
    new.content_revision := old.content_revision + 1;
    new.content_version := 'teacher-' || new.content_revision::text;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_question_authority()
  from public, anon, authenticated, service_role;

-- Direct table access is deliberately narrower than the catalogue RPC.
-- The policy is still useful as a defence-in-depth boundary for ad-hoc reads.
drop policy if exists questions_select_authorized on public.questions;
drop policy if exists questions_insert_teacher_private on public.questions;
drop policy if exists questions_update_teacher_private on public.questions;
drop policy if exists questions_delete_teacher_private on public.questions;

create policy questions_select_authorized
on public.questions for select to authenticated
using (
  (
    pool_scope = 'teacher'
    and exists (
      select 1 from public.teachers t
      where t.id = questions.teacher_id
        and t.user_id = (select auth.uid())
    )
  )
  or (
    pool_scope = 'global'
    and content_origin = 'brain_heist'
    and verification_status = 'verified'
    and analytics_eligible
    and is_public
    and is_active
    and current_content_hash = verified_content_hash
    and (
      exists (select 1 from public.teachers t where t.user_id = (select auth.uid()))
      or exists (
        select 1 from public.users u
        where u.id = (select auth.uid())
          and (u.role in ('admin', 'school_admin', 'school_head') or coalesce(u.is_admin, false))
      )
      or exists (
        select 1
        from public.assignment_questions aq
        join public.student_assignments sa on sa.assignment_id = aq.assignment_id
        where aq.question_id = questions.id
          and sa.student_id = (select auth.uid())
      )
    )
  )
  or (
    pool_scope = 'school'
    and content_origin = 'teacher'
    and verification_status = 'verified'
    and analytics_eligible
    and not is_public
    and is_active
    and current_content_hash = verified_content_hash
    and (
      exists (
        select 1
        from public.school_members sm
        where sm.user_id = (select auth.uid())
          and sm.school_id = questions.owner_school_id
          and sm.status = 'active'
      )
      or exists (
        select 1
        from public.users u
        where u.id = (select auth.uid())
          and u.school_id = questions.owner_school_id
      )
      or exists (
        select 1
        from public.assignment_questions aq
        join public.student_assignments sa on sa.assignment_id = aq.assignment_id
        join public.assignments a on a.id = aq.assignment_id
        where aq.question_id = questions.id
          and sa.student_id = (select auth.uid())
          and a.school_id = questions.owner_school_id
      )
    )
  )
);

create policy questions_insert_teacher_private
on public.questions for insert to authenticated
with check (
  pool_scope = 'teacher'
  and content_origin = 'teacher'
  and owner_school_id is null
  and verification_status = 'unverified'
  and not analytics_eligible
  and not is_public
  and exists (
    select 1 from public.teachers t
    where t.id = questions.teacher_id
      and t.user_id = (select auth.uid())
  )
);

create policy questions_update_teacher_private
on public.questions for update to authenticated
using (
  pool_scope = 'teacher'
  and exists (
    select 1 from public.teachers t
    where t.id = questions.teacher_id
      and t.user_id = (select auth.uid())
  )
)
with check (
  pool_scope = 'teacher'
  and content_origin = 'teacher'
  and owner_school_id is null
  and verification_status = 'unverified'
  and not analytics_eligible
  and not is_public
  and exists (
    select 1 from public.teachers t
    where t.id = questions.teacher_id
      and t.user_id = (select auth.uid())
  )
);

create policy questions_delete_teacher_private
on public.questions for delete to authenticated
using (
  pool_scope = 'teacher'
  and exists (
    select 1 from public.teachers t
    where t.id = questions.teacher_id
      and t.user_id = (select auth.uid())
  )
);

create or replace function private.verified_question_has_curriculum_mapping(
  p_question_id uuid,
  p_school_id uuid,
  p_academic_year_id uuid,
  p_grade_level text,
  p_academic_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions q
    join public.curriculum_assessment_items i
      on i.source_type = 'question_bank'
     and i.source_record_id = q.id::text
     and i.source_item_key = 'question'
     and i.is_active
     and i.content_hash = q.verified_content_hash
     and (
       (q.pool_scope = 'global' and i.school_id is null)
       or (q.pool_scope = 'school' and i.school_id = q.owner_school_id)
     )
    join public.school_curriculum_scope_mappings scm
      on scm.school_id = p_school_id
     and (p_academic_year_id is null or scm.academic_year_id = p_academic_year_id)
     and scm.grade_level = p_grade_level
     and scm.academic_subject_id = p_academic_subject_id
     and scm.status = 'active'
    join public.curriculum_item_objective_mappings im
      on im.assessment_item_id = i.id
     and im.curriculum_scope_id = scm.curriculum_scope_id
     and im.academic_subject_id = p_academic_subject_id
     and im.status = 'approved'
     and im.mapping_role = 'primary'
     and im.superseded_at is null
     and im.item_content_hash = i.content_hash
    join public.curriculum_framework_versions fv
      on fv.id = im.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = im.curriculum_version_content_hash
    where q.id = p_question_id
      and q.verification_status = 'verified'
      and q.analytics_eligible
      and q.is_active
      and q.current_content_hash = q.verified_content_hash
      and q.academic_subject_id = p_academic_subject_id
      and p_grade_level ~ '^[0-9]+$'
      and p_grade_level::smallint = any(q.eligible_grade_levels)
      and (
        (q.pool_scope = 'global'
          and q.content_origin = 'brain_heist'
          and q.owner_school_id is null
          and q.is_public)
        or (q.pool_scope = 'school'
          and q.content_origin = 'teacher'
          and q.owner_school_id = p_school_id
          and not q.is_public)
      )
  );
$$;
revoke all on function private.verified_question_has_curriculum_mapping(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;

drop function if exists public.get_all_active_questions(text, text, uuid, integer, integer);
create function public.get_all_active_questions(
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
  eligible_grade_levels smallint[],
  pool_scope text,
  owner_school_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  select t.id into v_teacher
  from public.teachers t
  where t.user_id = v_actor;
  if v_teacher is null then
    raise exception using errcode = '42501', message = 'teacher_required';
  end if;
  if p_teacher_id is not null and p_teacher_id <> v_teacher then
    raise exception using errcode = '42501',
      message = 'cannot_browse_another_teacher_pool';
  end if;

  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id = v_actor and sm.status = 'active'
  order by sm.joined_at desc nulls last, sm.id
  limit 1;
  if v_school_id is null then
    select u.school_id into v_school_id
    from public.users u where u.id = v_actor;
  end if;

  if v_school_id is not null then
    v_academic_year_id := public.academic_resolve_year_id(v_school_id, now());
    select exists (
      select 1
      from public.class_teacher_assignments cta
      join public.classes c
        on c.id = cta.class_id and c.school_id = cta.school_id
      where cta.teacher_user_id = v_actor
        and cta.school_id = v_school_id
        and cta.active
        and coalesce(c.is_active, true)
    ) into v_has_allocations;
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

    select null::text, scm.grade_level, scm.academic_subject_id,
      scm.curriculum_scope_id
    from public.school_curriculum_scope_mappings scm
    where not v_has_allocations
      and v_school_id is not null
      and scm.school_id = v_school_id
      and (v_academic_year_id is null or scm.academic_year_id = v_academic_year_id)
      and scm.status = 'active'
      and scm.grade_level ~ '^[0-9]+$'
  ),
  authorized_official as materialized (
    select distinct q0.id
    from public.questions q0
    join authorized_scopes scope_authority
      on scope_authority.academic_subject_id = q0.academic_subject_id
     and (
       scope_authority.subject_key is null
       or scope_authority.subject_key = private.teacher_assignment_subject_key(q0.subject)
     )
     and scope_authority.grade_level::smallint = any(q0.eligible_grade_levels)
    join public.curriculum_assessment_items i
      on i.source_type = 'question_bank'
     and i.source_record_id = q0.id::text
     and i.source_item_key = 'question'
     and i.is_active
     and i.content_hash = q0.verified_content_hash
     and (
       (q0.pool_scope = 'global' and i.school_id is null)
       or (q0.pool_scope = 'school' and i.school_id = v_school_id)
     )
    join public.curriculum_item_objective_mappings im
      on im.assessment_item_id = i.id
     and im.curriculum_scope_id = scope_authority.curriculum_scope_id
     and im.academic_subject_id = q0.academic_subject_id
     and im.status = 'approved'
     and im.mapping_role = 'primary'
     and im.superseded_at is null
     and im.item_content_hash = i.content_hash
    join public.curriculum_framework_versions fv
      on fv.id = im.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = im.curriculum_version_content_hash
    where q0.is_active
      and q0.verification_status = 'verified'
      and q0.analytics_eligible
      and q0.current_content_hash = q0.verified_content_hash
      and (
        (q0.pool_scope = 'global'
          and q0.content_origin = 'brain_heist'
          and q0.owner_school_id is null
          and q0.is_public)
        or (q0.pool_scope = 'school'
          and q0.content_origin = 'teacher'
          and q0.owner_school_id = v_school_id
          and not q0.is_public)
      )
      and (p_subject is null or q0.subject = p_subject)
      and (p_difficulty is null or q0.difficulty = p_difficulty)
  ),
  candidate_ids as materialized (
    select ao.id from authorized_official ao
    union all
    select q0.id
    from public.questions q0
    where q0.is_active
      and q0.pool_scope = 'teacher'
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
    q.id, q.teacher_id, q.subject, q.subject_id, q.topic, q.topic_name,
    q.difficulty, q.question_text, q.image_url, q.image_alt_text,
    q.question_type, q.options, q.correct_answer, q.explanation, q.hints,
    q.time_limit, q.points, q.tags, q.grade_level, q.is_public, q.is_active,
    q.times_answered, q.times_correct, q.created_at, q.updated_at,
    case when q.pool_scope = 'global' then 'Brains Heist'
      else coalesce(u.username, 'Teacher') end,
    case when q.pool_scope = 'global' then null
      when q.pool_scope = 'school' then q.owner_school_id
      else u.school_id end,
    q.pool_scope = 'teacher' and q.teacher_id = v_teacher,
    q.content_origin, q.verification_status, q.analytics_eligible,
    q.verified_at, q.verified_by, q.verified_by_authority,
    q.verified_content_hash, q.current_content_hash, q.content_version,
    q.content_revision, q.eligible_grade_levels, q.pool_scope,
    q.owner_school_id
  from paged pg
  join public.questions q on q.id = pg.id
  left join public.teachers t on t.id = q.teacher_id
  left join public.users u on u.id = t.user_id
  order by pg.created_at desc;
end;
$$;
revoke all on function public.get_all_active_questions(text, text, uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_all_active_questions(text, text, uuid, integer, integer)
  to authenticated, service_role;

create or replace function private.assert_assignment_verified_question_scope_coverage(
  p_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.assignments%rowtype;
  v_grades text[] := '{}'::text[];
  v_grade text;
  v_question record;
  v_question_count integer := 0;
  v_official_question_count integer := 0;
begin
  select * into v_assignment
  from public.assignments a where a.id = p_assignment_id;
  if not found then return; end if;
  if coalesce(v_assignment.publish_status, 'published') = 'draft' then return; end if;

  select count(*)::integer,
    count(*) filter (where q.pool_scope in ('global', 'school'))::integer
  into v_question_count, v_official_question_count
  from public.assignment_questions aq
  join public.questions q on q.id = aq.question_id
  where aq.assignment_id = p_assignment_id;

  if v_question_count = 0 then
    raise exception using errcode = '23514',
      message = 'published_assignment_requires_questions';
  end if;
  if v_official_question_count = 0 then return; end if;

  if v_assignment.school_id is null
     or v_assignment.academic_year_id is null
     or v_assignment.academic_subject_id is null then
    raise exception using errcode = '23514',
      message = 'assignment_academic_context_required_for_verified_evidence';
  end if;

  if nullif(trim(v_assignment.grade_level_snapshot), '') is not null then
    v_grades := array[v_assignment.grade_level_snapshot];
  else
    select coalesce(array_agg(distinct c.grade_level order by c.grade_level), '{}'::text[])
    into v_grades
    from public.student_assignments sa
    join public.classes c
      on c.school_id = v_assignment.school_id
     and upper(regexp_replace(trim(c.class_code), '\s+', '', 'g')) =
       upper(regexp_replace(trim(coalesce(sa.batch, '')), '\s+', '', 'g'))
    where sa.assignment_id = p_assignment_id
      and nullif(trim(c.grade_level), '') is not null;
  end if;
  if cardinality(v_grades) = 0 then
    raise exception using errcode = '23514',
      message = 'assignment_grade_context_required_for_verified_evidence';
  end if;

  for v_question in
    select q.id, q.pool_scope, q.content_origin, q.owner_school_id,
      q.verification_status, q.analytics_eligible, q.is_public, q.is_active,
      q.current_content_hash, q.verified_content_hash,
      q.eligible_grade_levels, q.academic_subject_id
    from public.assignment_questions aq
    join public.questions q on q.id = aq.question_id
    where aq.assignment_id = p_assignment_id
  loop
    if v_question.pool_scope = 'teacher' then continue; end if;

    if v_question.verification_status <> 'verified'
       or not coalesce(v_question.analytics_eligible, false)
       or not coalesce(v_question.is_active, false)
       or v_question.current_content_hash is null
       or v_question.verified_content_hash is null
       or v_question.current_content_hash <> v_question.verified_content_hash
       or not (
         (v_question.pool_scope = 'global'
           and v_question.content_origin = 'brain_heist'
           and v_question.owner_school_id is null
           and v_question.is_public)
         or (v_question.pool_scope = 'school'
           and v_question.content_origin = 'teacher'
           and v_question.owner_school_id = v_assignment.school_id
           and not v_question.is_public)
       ) then
      raise exception using errcode = '23514',
        message = 'assignment_contains_non_authoritative_verified_question',
        detail = 'question_id=' || v_question.id::text;
    end if;

    foreach v_grade in array v_grades loop
      if v_grade !~ '^[0-9]+$'
         or v_question.eligible_grade_levels is null
         or not (v_grade::smallint = any(v_question.eligible_grade_levels)) then
        raise exception using errcode = '23514',
          message = 'verified_question_not_eligible_for_assignment_grade',
          detail = 'question_id=' || v_question.id::text ||
            '; grade=' || coalesce(v_grade, 'unknown');
      end if;

      if not private.verified_question_has_curriculum_mapping(
        v_question.id, v_assignment.school_id, v_assignment.academic_year_id,
        v_grade, v_assignment.academic_subject_id
      ) then
        raise exception using errcode = '23514',
          message = 'verified_question_not_mapped_for_assignment_curriculum',
          detail = 'question_id=' || v_question.id::text || '; grade=' || v_grade;
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on function private.assert_assignment_verified_question_scope_coverage(uuid)
  from public, anon, authenticated, service_role;

alter table public.assignment_questions
  add column if not exists pool_scope_snapshot text,
  add column if not exists owner_school_id_snapshot uuid;

-- This is a metadata-only backfill. Suppress the deferred assignment-release
-- validator so historical assignments are not re-released or requalified.
alter table public.assignment_questions
  disable trigger trg_assignment_question_verified_scope_guard;

update public.assignment_questions aq
set pool_scope_snapshot = q.pool_scope,
    owner_school_id_snapshot = q.owner_school_id
from public.questions q
where q.id = aq.question_id
  and (aq.pool_scope_snapshot is null
    or aq.owner_school_id_snapshot is distinct from q.owner_school_id);

alter table public.assignment_questions
  enable trigger trg_assignment_question_verified_scope_guard;

create or replace function private.capture_assignment_question_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question public.questions;
  v_assignment_teacher uuid;
  v_assignment_school uuid;
  v_taxonomy record;
begin
  if tg_op = 'UPDATE' and new.question_id = old.question_id then
    new.question_snapshot := old.question_snapshot;
    new.question_content_hash := old.question_content_hash;
    new.content_origin_snapshot := old.content_origin_snapshot;
    new.pool_scope_snapshot := old.pool_scope_snapshot;
    new.owner_school_id_snapshot := old.owner_school_id_snapshot;
    new.verification_status_snapshot := old.verification_status_snapshot;
    new.analytics_eligible_snapshot := old.analytics_eligible_snapshot;
    new.diagnostic_taxonomy_id := old.diagnostic_taxonomy_id;
    new.diagnostic_taxonomy_hash := old.diagnostic_taxonomy_hash;
    new.snapshotted_at := old.snapshotted_at;
    return new;
  end if;

  select a.teacher_id, a.school_id
  into v_assignment_teacher, v_assignment_school
  from public.assignments a where a.id = new.assignment_id;
  if v_assignment_teacher is null then
    raise exception using errcode = '23503', message = 'assignment_not_found';
  end if;

  select q.* into v_question
  from public.questions q
  where q.id = new.question_id
    and q.is_active
    and (
      (q.pool_scope = 'global'
        and q.content_origin = 'brain_heist'
        and q.verification_status = 'verified'
        and q.analytics_eligible
        and q.is_public
        and q.owner_school_id is null
        and q.current_content_hash = q.verified_content_hash)
      or (q.pool_scope = 'school'
        and q.content_origin = 'teacher'
        and q.verification_status = 'verified'
        and q.analytics_eligible
        and not q.is_public
        and q.owner_school_id = v_assignment_school
        and q.current_content_hash = q.verified_content_hash)
      or (q.pool_scope = 'teacher'
        and q.content_origin = 'teacher'
        and q.teacher_id = v_assignment_teacher)
    );
  if v_question.id is null then
    raise exception using errcode = '42501',
      message = 'question_not_authorized_for_assignment';
  end if;

  select t.id, t.taxonomy_hash into v_taxonomy
  from private.active_verified_question_diagnostic_taxonomy t
  where t.question_id = v_question.id
    and t.question_content_hash = v_question.current_content_hash
  order by t.created_at desc, t.id desc
  limit 1;

  new.question_snapshot := to_jsonb(v_question);
  new.question_content_hash := v_question.current_content_hash;
  new.content_origin_snapshot := v_question.content_origin;
  new.pool_scope_snapshot := v_question.pool_scope;
  new.owner_school_id_snapshot := v_question.owner_school_id;
  new.verification_status_snapshot := v_question.verification_status;
  new.analytics_eligible_snapshot :=
    v_question.pool_scope in ('global', 'school')
    and v_question.verification_status = 'verified'
    and v_question.analytics_eligible
    and v_question.current_content_hash = v_question.verified_content_hash;
  new.diagnostic_taxonomy_id := v_taxonomy.id;
  new.diagnostic_taxonomy_hash := v_taxonomy.taxonomy_hash;
  new.snapshotted_at := now();
  return new;
end;
$$;
revoke all on function private.capture_assignment_question_snapshot()
  from public, anon, authenticated, service_role;

create or replace function private.guard_assignment_question_snapshot_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.question_id = old.question_id
     and row(
       new.question_snapshot, new.question_content_hash,
       new.content_origin_snapshot, new.pool_scope_snapshot,
       new.owner_school_id_snapshot, new.verification_status_snapshot,
       new.analytics_eligible_snapshot, new.snapshotted_at,
       new.diagnostic_taxonomy_id, new.diagnostic_taxonomy_hash
     ) is distinct from row(
       old.question_snapshot, old.question_content_hash,
       old.content_origin_snapshot, old.pool_scope_snapshot,
       old.owner_school_id_snapshot, old.verification_status_snapshot,
       old.analytics_eligible_snapshot, old.snapshotted_at,
       old.diagnostic_taxonomy_id, old.diagnostic_taxonomy_hash
     ) then
    raise exception using errcode = '55000',
      message = 'assignment_question_snapshot_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_assignment_question_snapshot_immutability()
  from public, anon, authenticated, service_role;

create or replace function private.validate_verified_question_diagnostic_taxonomy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source record;
  v_superseded public.verified_question_diagnostic_taxonomy%rowtype;
  v_expected_hash text;
begin
  select q.verified_external_id, q.topic, q.curriculum_strand,
    q.verified_content_hash, q.pool_scope, q.owner_school_id,
    i.id as assessment_item_id, s.code as scope_code, o.code as objective_code
  into v_source
  from public.questions q
  join public.curriculum_assessment_items i
    on i.id = new.assessment_item_id
   and i.source_type = 'question_bank'
   and i.source_record_id = q.id::text
   and i.source_item_key = 'question'
   and i.is_active
   and i.content_hash = q.verified_content_hash
   and (
     (q.pool_scope = 'global' and i.school_id is null)
     or (q.pool_scope = 'school' and i.school_id = q.owner_school_id)
   )
  join public.curriculum_item_objective_mappings m
    on m.id = new.curriculum_mapping_id
   and m.assessment_item_id = i.id
   and m.status = 'approved'
   and m.mapping_role = 'primary'
   and m.superseded_at is null
   and m.item_content_hash = i.content_hash
  join public.curriculum_framework_versions fv
    on fv.id = m.framework_version_id
   and fv.status in ('published', 'retired')
   and fv.content_hash = m.curriculum_version_content_hash
  join public.curriculum_scopes s on s.id = m.curriculum_scope_id
  join public.curriculum_objectives o
    on o.id = m.curriculum_objective_id and o.is_assessable
  where q.id = new.question_id
    and q.verification_status = 'verified'
    and q.analytics_eligible
    and q.is_active
    and q.current_content_hash = q.verified_content_hash
    and (
      (q.pool_scope = 'global'
        and q.content_origin = 'brain_heist'
        and q.owner_school_id is null
        and q.is_public)
      or (q.pool_scope = 'school'
        and q.content_origin = 'teacher'
        and q.owner_school_id is not null
        and not q.is_public)
    );

  if not found then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_requires_current_verified_mapped_question';
  end if;
  if new.question_content_hash <> v_source.verified_content_hash then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_question_hash_mismatch';
  end if;
  if new.scope_code <> v_source.scope_code
     or new.objective_code <> v_source.objective_code then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_objective_mapping_mismatch';
  end if;
  if lower(trim(new.atomic_subskill_name)) in (
      lower(trim(coalesce(v_source.topic, ''))),
      lower(trim(coalesce(v_source.curriculum_strand, '')))
    ) then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_subskill_must_be_atomic';
  end if;
  if lower(new.primary_skill_code) =
       'apply-' || public.curriculum_normalize_code(coalesce(v_source.topic, '')) then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_skill_must_not_be_generic_apply_topic';
  end if;

  if new.supersedes_taxonomy_id is not null then
    select * into v_superseded
    from public.verified_question_diagnostic_taxonomy t
    where t.id = new.supersedes_taxonomy_id;
    if not found or v_superseded.question_id <> new.question_id
       or v_superseded.created_at >= new.created_at then
      raise exception using errcode = '23514',
        message = 'diagnostic_taxonomy_invalid_supersession';
    end if;
  end if;

  v_expected_hash := encode(extensions.digest(
    jsonb_build_object(
      'questionId', new.question_id,
      'questionContentHash', new.question_content_hash,
      'curriculumMappingId', new.curriculum_mapping_id,
      'scopeCode', new.scope_code,
      'objectiveCode', new.objective_code,
      'packageVersion', new.package_version,
      'taxonomyVersion', new.taxonomy_version,
      'primarySkillCode', new.primary_skill_code,
      'primarySkillName', new.primary_skill_name,
      'atomicSubskillCode', new.atomic_subskill_code,
      'atomicSubskillName', new.atomic_subskill_name,
      'assessmentProcessCode', new.assessment_process_code,
      'cognitiveProcess', new.cognitive_process,
      'evidenceStatement', new.evidence_statement,
      'secondarySkillCodes', to_jsonb(new.secondary_skill_codes),
      'reviewStatus', new.review_status,
      'humanReviewRequired', new.human_review_required,
      'confidenceScore', new.confidence_score
    )::text,
    'sha256'
  ), 'hex');

  if nullif(new.taxonomy_hash, '') is not null
     and new.taxonomy_hash <> v_expected_hash then
    raise exception using errcode = '23514',
      message = 'diagnostic_taxonomy_hash_mismatch';
  end if;
  new.taxonomy_hash := v_expected_hash;
  return new;
end;
$$;
revoke all on function private.validate_verified_question_diagnostic_taxonomy()
  from public, anon, authenticated, service_role;

comment on column public.questions.pool_scope is
  'Publication authority: global Brains Heist Verified, one-school Verified, or teacher-private.';
comment on column public.questions.owner_school_id is
  'Required only for School Verified questions; never grants access to teacher-private drafts.';
comment on function public.get_all_active_questions(text, text, uuid, integer, integer) is
  'Teacher catalogue containing exact-curriculum Global Verified, same-school Verified, and only the caller own Teacher Pool.';
