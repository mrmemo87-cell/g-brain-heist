-- Enforce the product promise that Brains Heist Verified questions used as
-- official Academic Profile evidence are valid for the school's active
-- curriculum, subject and grade. Ambiguous mappings are deliberately withheld.

-- 1) Repair active school mappings that still point at an empty curriculum
-- scope when a newer populated PUBLISHED scope exists in the SAME framework.
with current_stats as (
  select
    cs.id as scope_id,
    cs.academic_subject_id,
    st.sequence_number::text as grade_level,
    fv.framework_id,
    count(o.id) filter (where o.is_assessable) as assessable_count
  from public.curriculum_scopes cs
  join public.curriculum_stages st on st.id = cs.stage_id
  join public.curriculum_framework_versions fv on fv.id = cs.framework_version_id
  left join public.curriculum_objectives o on o.curriculum_scope_id = cs.id
  group by cs.id, cs.academic_subject_id, st.sequence_number, fv.framework_id
), replacements as (
  select scm.id as mapping_id, repl.scope_id as replacement_scope_id
  from public.school_curriculum_scope_mappings scm
  join current_stats cur on cur.scope_id = scm.curriculum_scope_id
  join lateral (
    select cs2.id as scope_id
    from public.curriculum_scopes cs2
    join public.curriculum_stages st2 on st2.id = cs2.stage_id
    join public.curriculum_framework_versions fv2 on fv2.id = cs2.framework_version_id
    where cs2.academic_subject_id = scm.academic_subject_id
      and st2.sequence_number::text = scm.grade_level
      and fv2.framework_id = cur.framework_id
      and fv2.status = 'published'
      and exists (
        select 1 from public.curriculum_objectives o2
        where o2.curriculum_scope_id = cs2.id and o2.is_assessable
      )
    order by fv2.published_at desc nulls last, fv2.created_at desc, cs2.id
    limit 1
  ) repl on true
  where scm.status = 'active'
    and cur.assessable_count = 0
)
update public.school_curriculum_scope_mappings scm
set curriculum_scope_id = r.replacement_scope_id,
    mapping_quality = 'estimated',
    confirmed_at = null,
    confirmed_by = null
from replacements r
where scm.id = r.mapping_id
  and scm.curriculum_scope_id <> r.replacement_scope_id;

-- 2) Backfill ONLY deterministic mappings: current verified question metadata
-- must exactly match one assessable objective statement in the active scope.
with target_pairs as (
  select distinct
    q.id as question_id,
    q.curriculum_objective,
    q.verified_content_hash,
    scm.curriculum_scope_id,
    scm.academic_subject_id,
    i.id as item_id,
    i.content_hash as item_content_hash
  from public.questions q
  join public.school_curriculum_scope_mappings scm
    on scm.status = 'active'
   and scm.academic_subject_id = q.academic_subject_id
   and scm.grade_level::smallint = any(q.eligible_grade_levels)
  join public.curriculum_assessment_items i
    on i.source_type = 'question_bank'
   and i.source_record_id = q.id::text
   and i.source_item_key = 'question'
   and i.is_active
   and i.content_hash = q.verified_content_hash
  where q.content_origin = 'brain_heist'
    and q.verification_status = 'verified'
    and q.analytics_eligible
    and q.is_public
    and q.is_active
    and q.current_content_hash = q.verified_content_hash
    and not exists (
      select 1
      from public.curriculum_item_objective_mappings im
      where im.assessment_item_id = i.id
        and im.curriculum_scope_id = scm.curriculum_scope_id
        and im.academic_subject_id = scm.academic_subject_id
        and im.status = 'approved'
        and im.mapping_role = 'primary'
        and im.item_content_hash = i.content_hash
    )
), exact_candidates as (
  select
    tp.*,
    o.id as objective_id,
    o.framework_version_id,
    fv.content_hash as version_content_hash,
    count(*) over (partition by tp.item_id, tp.curriculum_scope_id) as candidate_count
  from target_pairs tp
  join public.curriculum_objectives o
    on o.curriculum_scope_id = tp.curriculum_scope_id
   and o.is_assessable
  join public.curriculum_framework_versions fv
    on fv.id = o.framework_version_id
   and fv.status = 'published'
  where lower(regexp_replace(trim(o.statement), '\s+', ' ', 'g'))
      = lower(regexp_replace(trim(tp.curriculum_objective), '\s+', ' ', 'g'))
)
insert into public.curriculum_item_objective_mappings (
  assessment_item_id,
  curriculum_objective_id,
  framework_version_id,
  curriculum_scope_id,
  academic_subject_id,
  mapping_role,
  mapping_method,
  status,
  confidence_score,
  rationale,
  provenance,
  item_content_hash,
  curriculum_version_content_hash,
  reviewed_by_authority,
  approved_by_authority,
  reviewed_at,
  approved_at
)
select
  ec.item_id,
  ec.objective_id,
  ec.framework_version_id,
  ec.curriculum_scope_id,
  ec.academic_subject_id,
  'primary',
  'rule_based',
  'approved',
  1.0000,
  'Exact governed objective statement match during verified-question curriculum coverage repair.',
  jsonb_build_object(
    'source', 'verified-question-scope-coverage-repair',
    'matchMethod', 'exact_objective_statement',
    'repairVersion', '2026-08-19'
  ),
  ec.item_content_hash,
  ec.version_content_hash,
  'Brains Heist Content Quality',
  'Brains Heist Academic Governance',
  now(),
  now()
from exact_candidates ec
where ec.candidate_count = 1
  and not exists (
    select 1
    from public.curriculum_item_objective_mappings existing
    where existing.assessment_item_id = ec.item_id
      and existing.curriculum_objective_id = ec.objective_id
      and existing.status = 'approved'
  );

-- 3) Canonical exact-scope authority check used by the picker and assignment guard.
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
     and im.item_content_hash = i.content_hash
    join public.curriculum_framework_versions fv
      on fv.id = im.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = im.curriculum_version_content_hash
    where q.id = p_question_id
      and q.content_origin = 'brain_heist'
      and q.verification_status = 'verified'
      and q.analytics_eligible
      and q.is_public
      and q.is_active
      and q.current_content_hash = q.verified_content_hash
      and q.academic_subject_id = p_academic_subject_id
      and p_grade_level ~ '^[0-9]+$'
      and p_grade_level::smallint = any(q.eligible_grade_levels)
  );
$$;

revoke all on function private.verified_question_has_curriculum_mapping(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;

-- 4) Official verified picker: a Brains Heist question is visible only when it
-- has exact curriculum authority for at least one grade/subject class allocated
-- to this teacher in this school. Teacher-owned My Pool behavior is unchanged.
create or replace function public.get_all_active_questions(
  p_subject text default null::text,
  p_difficulty text default null::text,
  p_teacher_id uuid default null::uuid,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table(
  id uuid, teacher_id uuid, subject text, subject_id text, topic text, topic_name text,
  difficulty text, question_text text, image_url text, image_alt_text text,
  question_type text, options jsonb, correct_answer text, explanation text, hints text[],
  time_limit integer, points integer, tags text[], grade_level text, is_public boolean,
  is_active boolean, times_answered integer, times_correct integer,
  created_at timestamptz, updated_at timestamptz, creator_name text,
  creator_school_id uuid, is_mine boolean, content_origin text,
  verification_status text, analytics_eligible boolean, verified_at timestamptz,
  verified_by uuid, verified_by_authority text, verified_content_hash text,
  current_content_hash text, content_version text, content_revision integer,
  eligible_grade_levels smallint[]
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
    raise exception using errcode = '42501', message = 'cannot_browse_another_teacher_pool';
  end if;

  select sm.school_id into v_school_id
  from public.school_members sm
  where sm.user_id = v_actor and sm.status = 'active'
  order by sm.joined_at desc nulls last, sm.id
  limit 1;
  if v_school_id is null then
    select u.school_id into v_school_id from public.users u where u.id = v_actor;
  end if;

  if v_school_id is not null then
    v_academic_year_id := public.academic_resolve_year_id(v_school_id, now());
    select exists (
      select 1
      from public.class_teacher_assignments cta
      join public.classes c on c.id = cta.class_id and c.school_id = cta.school_id
      where cta.teacher_user_id = v_actor
        and cta.school_id = v_school_id
        and cta.active
        and coalesce(c.is_active, true)
    ) into v_has_allocations;
  end if;

  return query
  select
    q.id, q.teacher_id, q.subject, q.subject_id, q.topic, q.topic_name,
    q.difficulty, q.question_text, q.image_url, q.image_alt_text,
    q.question_type, q.options, q.correct_answer, q.explanation, q.hints,
    q.time_limit, q.points, q.tags, q.grade_level, q.is_public, q.is_active,
    q.times_answered, q.times_correct, q.created_at, q.updated_at,
    case when q.content_origin = 'brain_heist' then 'Brains Heist'
         else coalesce(u.username, 'Teacher') end,
    case when q.content_origin = 'brain_heist' then null else u.school_id end,
    q.content_origin = 'teacher' and q.teacher_id = v_teacher,
    q.content_origin, q.verification_status, q.analytics_eligible, q.verified_at,
    q.verified_by, q.verified_by_authority, q.verified_content_hash,
    q.current_content_hash, q.content_version, q.content_revision,
    q.eligible_grade_levels
  from public.questions q
  left join public.teachers t on t.id = q.teacher_id
  left join public.users u on u.id = t.user_id
  where q.is_active
    and (p_subject is null or q.subject = p_subject)
    and (p_difficulty is null or q.difficulty = p_difficulty)
    and (
      (
        q.content_origin = 'brain_heist'
        and q.verification_status = 'verified'
        and q.analytics_eligible
        and q.is_public
        and q.current_content_hash = q.verified_content_hash
        and v_school_id is not null
        and (
          (
            v_has_allocations
            and exists (
              select 1
              from public.class_teacher_assignments cta
              join public.classes c
                on c.id = cta.class_id and c.school_id = cta.school_id
              where cta.teacher_user_id = v_actor
                and cta.school_id = v_school_id
                and cta.active
                and coalesce(c.is_active, true)
                and private.teacher_assignment_subject_key(cta.subject)
                    = private.teacher_assignment_subject_key(q.subject)
                and c.grade_level ~ '^[0-9]+$'
                and private.verified_question_has_curriculum_mapping(
                  q.id, v_school_id, v_academic_year_id,
                  c.grade_level, q.academic_subject_id
                )
            )
          )
          or (
            not v_has_allocations
            and exists (
              select 1
              from public.school_curriculum_scope_mappings scm
              where scm.school_id = v_school_id
                and (v_academic_year_id is null or scm.academic_year_id = v_academic_year_id)
                and scm.academic_subject_id = q.academic_subject_id
                and scm.status = 'active'
                and private.verified_question_has_curriculum_mapping(
                  q.id, v_school_id, v_academic_year_id,
                  scm.grade_level, q.academic_subject_id
                )
            )
          )
        )
      )
      or (q.content_origin = 'teacher' and q.teacher_id = v_teacher)
    )
  order by q.created_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.get_all_active_questions(text, text, uuid, integer, integer) from public, anon;
grant execute on function public.get_all_active_questions(text, text, uuid, integer, integer) to authenticated, service_role;

-- 5) Resolve the actual grade(s) reached by an assignment and reject any
-- official Brains Heist question that is grade-ineligible or lacks an exact
-- active-scope mapping. Drafts may be saved; scheduled/published work must pass.
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
begin
  select * into v_assignment
  from public.assignments a
  where a.id = p_assignment_id;
  if not found then return; end if;

  if coalesce(v_assignment.publish_status, 'published') = 'draft' then
    return;
  end if;

  if v_assignment.school_id is null
     or v_assignment.academic_year_id is null
     or v_assignment.academic_subject_id is null then
    raise exception using
      errcode = '23514',
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
     and upper(regexp_replace(trim(c.class_code), '\s+', '', 'g'))
       = upper(regexp_replace(trim(coalesce(sa.batch, '')), '\s+', '', 'g'))
    where sa.assignment_id = p_assignment_id
      and nullif(trim(c.grade_level), '') is not null;
  end if;

  if cardinality(v_grades) = 0 then
    raise exception using
      errcode = '23514',
      message = 'assignment_grade_context_required_for_verified_evidence';
  end if;

  select count(*)::integer into v_question_count
  from public.assignment_questions aq
  where aq.assignment_id = p_assignment_id;
  if v_question_count = 0 then
    raise exception using errcode = '23514', message = 'published_assignment_requires_questions';
  end if;

  for v_question in
    select q.id, q.content_origin, q.verification_status, q.analytics_eligible,
           q.is_public, q.is_active, q.current_content_hash, q.verified_content_hash,
           q.eligible_grade_levels, q.academic_subject_id
    from public.assignment_questions aq
    join public.questions q on q.id = aq.question_id
    where aq.assignment_id = p_assignment_id
  loop
    if v_question.content_origin <> 'brain_heist' then
      continue;
    end if;

    if v_question.verification_status <> 'verified'
       or not coalesce(v_question.analytics_eligible, false)
       or not coalesce(v_question.is_public, false)
       or not coalesce(v_question.is_active, false)
       or v_question.current_content_hash is null
       or v_question.verified_content_hash is null
       or v_question.current_content_hash <> v_question.verified_content_hash then
      raise exception using
        errcode = '23514',
        message = 'assignment_contains_non_authoritative_brains_heist_question',
        detail = 'question_id=' || v_question.id::text;
    end if;

    foreach v_grade in array v_grades loop
      if v_grade !~ '^[0-9]+$'
         or v_question.eligible_grade_levels is null
         or not (v_grade::smallint = any(v_question.eligible_grade_levels)) then
        raise exception using
          errcode = '23514',
          message = 'verified_question_not_eligible_for_assignment_grade',
          detail = 'question_id=' || v_question.id::text || '; grade=' || coalesce(v_grade, 'unknown');
      end if;

      if not private.verified_question_has_curriculum_mapping(
        v_question.id,
        v_assignment.school_id,
        v_assignment.academic_year_id,
        v_grade,
        v_assignment.academic_subject_id
      ) then
        raise exception using
          errcode = '23514',
          message = 'verified_question_not_mapped_for_assignment_curriculum',
          detail = 'question_id=' || v_question.id::text || '; grade=' || v_grade;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function private.assert_assignment_verified_question_scope_coverage(uuid) from public, anon, authenticated;

create or replace function private.trg_assert_assignment_verified_question_scope_coverage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
begin
  if tg_table_name = 'assignment_questions' then
    v_assignment_id := coalesce(new.assignment_id, old.assignment_id);
  else
    v_assignment_id := coalesce(new.id, old.id);
  end if;
  perform private.assert_assignment_verified_question_scope_coverage(v_assignment_id);
  return coalesce(new, old);
end;
$$;

revoke all on function private.trg_assert_assignment_verified_question_scope_coverage() from public, anon, authenticated;

drop trigger if exists trg_assignment_question_verified_scope_guard on public.assignment_questions;
create constraint trigger trg_assignment_question_verified_scope_guard
after insert or update or delete on public.assignment_questions
deferrable initially deferred
for each row execute function private.trg_assert_assignment_verified_question_scope_coverage();

drop trigger if exists trg_assignment_verified_scope_guard on public.assignments;
create constraint trigger trg_assignment_verified_scope_guard
after insert or update on public.assignments
deferrable initially deferred
for each row execute function private.trg_assert_assignment_verified_question_scope_coverage();

-- 6) Support custom/All assignments by resolving a student-specific grade from
-- the assignment roster when the assignment itself has no single class grade.
create or replace function public.student_learning_ingest_assignment_result(
  p_assignment_id uuid,
  p_student_id uuid,
  p_completed_at timestamptz,
  p_accuracy integer,
  p_score integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment record;
  v_school_id uuid;
  v_expected_count integer := 0;
  v_answered_count integer := 0;
  v_effective_grade text;
  v_effective_class_id uuid;
  v_effective_class_code text;
  v_group record;
  v_percentage numeric;
  v_kind text;
  v_skill_key text;
  v_source_key text;
  v_quality text;
  v_contributes boolean;
begin
  if p_assignment_id is null or p_student_id is null or p_completed_at is null then return; end if;

  select a.school_id, a.class_id, a.teacher_id, a.title, a.difficulty,
    a.academic_year_id, a.academic_term_id, a.academic_subject_id,
    a.grade_level_snapshot, a.class_code_snapshot,
    coalesce(nullif(trim(a.subject_name), ''), nullif(trim(a.subject), ''),
      nullif(trim(a.subject_id), ''), 'General') as subject_name,
    sa.status, sa.batch as student_batch, r.correct, r.incorrect,
    count(aq.question_id)::integer as expected_count
  into v_assignment
  from public.assignments a
  join public.student_assignments sa on sa.assignment_id = a.id and sa.student_id = p_student_id
  join public.student_assignment_results r on r.assignment_id = a.id and r.student_id = p_student_id
  left join public.assignment_questions aq on aq.assignment_id = a.id
  where a.id = p_assignment_id
  group by a.school_id, a.class_id, a.teacher_id, a.title, a.difficulty,
    a.academic_year_id, a.academic_term_id, a.academic_subject_id,
    a.grade_level_snapshot, a.class_code_snapshot, a.subject_name, a.subject,
    a.subject_id, sa.status, sa.batch, r.correct, r.incorrect;

  if not found then return; end if;

  v_expected_count := coalesce(v_assignment.expected_count, 0);
  select count(*)::integer into v_answered_count
  from public.student_assignment_answers saa
  where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id;

  if v_assignment.status <> 'completed'
    or v_expected_count <= 0
    or v_answered_count <> v_expected_count
    or (coalesce(v_assignment.correct, 0) + coalesce(v_assignment.incorrect, 0)) <> v_expected_count
    or v_assignment.academic_year_id is null
    or v_assignment.academic_subject_id is null then
    return;
  end if;

  select coalesce(v_assignment.school_id, u.school_id) into v_school_id
  from public.users u where u.id = p_student_id;
  if v_school_id is null then return; end if;

  v_effective_grade := nullif(trim(v_assignment.grade_level_snapshot), '');
  v_effective_class_id := v_assignment.class_id;
  v_effective_class_code := nullif(trim(v_assignment.class_code_snapshot), '');

  if v_effective_grade is null then
    select c.grade_level, c.id, c.class_code
    into v_effective_grade, v_effective_class_id, v_effective_class_code
    from public.classes c
    where c.school_id = v_school_id
      and upper(regexp_replace(trim(c.class_code), '\s+', '', 'g'))
        = upper(regexp_replace(trim(coalesce(v_assignment.student_batch, '')), '\s+', '', 'g'))
      and coalesce(c.is_active, true)
    order by c.id
    limit 1;
  end if;

  if v_effective_grade is null or v_effective_grade !~ '^[0-9]+$' then return; end if;

  for v_group in
    select
      im.curriculum_objective_id,
      im.curriculum_scope_id,
      o.code as objective_code,
      o.statement as objective_statement,
      objective_node.node_type as curriculum_node_type,
      case
        when objective_node.node_type = 'subskill' and parent_node.node_type = 'skill'
          then coalesce(grandparent_node.name, parent_node.name)
        when objective_node.node_type = 'skill'
          then coalesce(parent_node.name, objective_node.name)
        else objective_node.name
      end as topic_name,
      case
        when objective_node.node_type = 'subskill' and parent_node.node_type = 'skill'
          then parent_node.name
        when objective_node.node_type = 'skill'
          then objective_node.name
        else coalesce(
          case when count(distinct nullif(trim(q.curriculum_skill), '')) = 1
            then min(nullif(trim(q.curriculum_skill), '')) end,
          objective_node.name,
          o.statement
        )
      end as skill_name,
      case
        when objective_node.node_type = 'subskill' then objective_node.name
        else case when count(distinct nullif(trim(q.curriculum_subskill), '')) = 1
          then min(nullif(trim(q.curriculum_subskill), '')) end
      end as subskill_name,
      count(*)::integer as question_count,
      count(*) filter (where saa.is_correct is true)::integer as correct_count,
      array_agg(distinct saa.question_id order by saa.question_id) as question_ids
    from public.student_assignment_answers saa
    join public.assignment_questions aq
      on aq.assignment_id = saa.assignment_id
     and aq.question_id = saa.question_id
     and aq.analytics_eligible_snapshot
     and aq.content_origin_snapshot = 'brain_heist'
     and aq.verification_status_snapshot = 'verified'
    join public.questions q
      on q.id = saa.question_id
     and q.content_origin = 'brain_heist'
     and q.verification_status = 'verified'
     and q.analytics_eligible
     and q.is_public
     and q.is_active
     and q.current_content_hash = q.verified_content_hash
     and aq.question_content_hash = q.verified_content_hash
     and v_effective_grade::smallint = any(q.eligible_grade_levels)
    join public.curriculum_assessment_items i
      on i.source_type = 'question_bank'
     and i.source_record_id = saa.question_id::text
     and i.source_item_key = 'question'
     and i.is_active
     and i.content_hash = q.verified_content_hash
    join public.school_curriculum_scope_mappings scm
      on scm.school_id = v_school_id
     and scm.academic_year_id = v_assignment.academic_year_id
     and scm.grade_level = v_effective_grade
     and scm.academic_subject_id = v_assignment.academic_subject_id
     and scm.status = 'active'
    join public.curriculum_item_objective_mappings im
      on im.assessment_item_id = i.id
     and im.curriculum_scope_id = scm.curriculum_scope_id
     and im.academic_subject_id = v_assignment.academic_subject_id
     and im.status = 'approved'
     and im.mapping_role = 'primary'
     and im.item_content_hash = i.content_hash
    join public.curriculum_framework_versions fv
      on fv.id = im.framework_version_id
     and fv.status in ('published', 'retired')
     and fv.content_hash = im.curriculum_version_content_hash
    join public.curriculum_objectives o on o.id = im.curriculum_objective_id
    join public.curriculum_nodes objective_node on objective_node.id = o.curriculum_node_id
    left join public.curriculum_nodes parent_node on parent_node.id = objective_node.parent_node_id
    left join public.curriculum_nodes grandparent_node on grandparent_node.id = parent_node.parent_node_id
    where saa.assignment_id = p_assignment_id and saa.student_id = p_student_id
    group by im.curriculum_objective_id, im.curriculum_scope_id, o.code, o.statement,
      objective_node.node_type, objective_node.name,
      parent_node.node_type, parent_node.name, grandparent_node.name
  loop
    if v_group.question_count <= 0 then continue; end if;

    v_percentage := round((v_group.correct_count::numeric / v_group.question_count::numeric) * 100, 2);
    v_kind := case when v_percentage < 60 then 'focus'
      when v_percentage >= 80 then 'strength' else 'developing' end;
    v_quality := case when v_group.question_count < 3 then 'provisional'
      when v_group.question_count < 6 then 'standard' else 'strong' end;
    v_contributes := v_group.question_count >= 3;
    v_skill_key := concat_ws(':', 'objective', v_group.curriculum_objective_id::text);
    v_source_key := concat_ws(':', 'assignment', p_assignment_id::text,
      'objective', v_group.curriculum_objective_id::text);

    insert into public.student_learning_observations (
      school_id, student_id, subject, topic, skill, subskill, skill_key,
      observation_type, source_type, source_id, source_key, observed_at,
      evidence_percentage, evidence_count, evidence_quality,
      contributes_to_focus_state, evidence, system_generated
    ) values (
      v_school_id, p_student_id, v_assignment.subject_name, v_group.topic_name,
      v_group.skill_name, v_group.subskill_name, v_skill_key, v_kind,
      'assignment_result', p_assignment_id, v_source_key, p_completed_at,
      v_percentage, v_group.question_count, v_quality, v_contributes,
      jsonb_build_object(
        'source_label', 'Brains Heist Verified assignment evidence',
        'assignment_id', p_assignment_id,
        'assignment_title', v_assignment.title,
        'class_id', v_effective_class_id,
        'class_code', v_effective_class_code,
        'teacher_id', v_assignment.teacher_id,
        'academic_year_id', v_assignment.academic_year_id,
        'academic_term_id', v_assignment.academic_term_id,
        'academic_subject_id', v_assignment.academic_subject_id,
        'grade_level', v_effective_grade,
        'curriculum_scope_id', v_group.curriculum_scope_id,
        'curriculum_objective_id', v_group.curriculum_objective_id,
        'objective_code', v_group.objective_code,
        'objective', v_group.objective_statement,
        'curriculum_node_type', v_group.curriculum_node_type,
        'strand_topic', v_group.topic_name,
        'skill', v_group.skill_name,
        'subskill', v_group.subskill_name,
        'question_ids', to_jsonb(v_group.question_ids),
        'verified_question_count', v_group.question_count,
        'correct', v_group.correct_count,
        'incorrect', v_group.question_count - v_group.correct_count,
        'question_count', v_group.question_count,
        'expected_question_count', v_expected_count,
        'answered_question_count', v_answered_count,
        'overall_accuracy', p_accuracy,
        'overall_score', p_score,
        'classification_thresholds', jsonb_build_object('focus_below', 60, 'strength_from', 80),
        'evidence_quality', v_quality,
        'contributes_to_focus_state', v_contributes,
        'evidence_provenance', 'brains_heist_verified_question'
      ),
      true
    )
    on conflict (student_id, source_key) do update set
      observed_at = excluded.observed_at,
      observation_type = excluded.observation_type,
      evidence_percentage = excluded.evidence_percentage,
      evidence_count = excluded.evidence_count,
      evidence_quality = excluded.evidence_quality,
      contributes_to_focus_state = excluded.contributes_to_focus_state,
      evidence = excluded.evidence;
  end loop;
end;
$$;

-- Keep the existing trigger caller able to invoke the ingestion function.
revoke all on function public.student_learning_ingest_assignment_result(uuid, uuid, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.student_learning_ingest_assignment_result(uuid, uuid, timestamptz, integer, integer) to service_role;
