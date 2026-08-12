-- Phase 2: classify the existing Brains Heist question bank and make grade reuse
-- explicit without duplicating question content.
--
-- This is an original Brains Heist framework. It does not claim Cambridge, IB, or
-- another external authority. The migration preserves the source question as the
-- single authoritative record, registers a content hash, and maps that record to a
-- primary objective in every approved grade scope where it may be used.

create extension if not exists pgcrypto with schema extensions;

alter table public.curriculum_framework_versions
  add column if not exists reviewed_by_authority text,
  add column if not exists approved_by_authority text;
alter table public.curriculum_framework_versions
  drop constraint if exists curriculum_framework_versions_check1;
alter table public.curriculum_framework_versions
  add constraint curriculum_framework_versions_review_authority_check
  check (
    status not in ('approved', 'published', 'retired')
    or (
      (reviewed_by is not null or nullif(trim(reviewed_by_authority), '') is not null)
      and (approved_by is not null or nullif(trim(approved_by_authority), '') is not null)
    )
  );

create or replace function private.curriculum_validate_version_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception using errcode = '55000', message = 'only_draft_curriculum_versions_can_be_deleted';
    end if;
    return old;
  end if;
  if old.status in ('published', 'retired') then
    if not (old.status = 'published' and new.status = 'retired') then
      raise exception using errcode = '55000', message = 'published_curriculum_version_is_immutable';
    end if;
    if row(new.framework_id, new.version_code, new.display_name, new.source_version, new.source_uri,
           new.source_license, new.effective_from, new.effective_to, new.content_hash,
           new.reviewed_by_authority, new.approved_by_authority)
       is distinct from
       row(old.framework_id, old.version_code, old.display_name, old.source_version, old.source_uri,
           old.source_license, old.effective_from, old.effective_to, old.content_hash,
           old.reviewed_by_authority, old.approved_by_authority) then
      raise exception using errcode = '55000', message = 'published_curriculum_version_metadata_is_immutable';
    end if;
  elsif new.status <> old.status and not (
    (old.status = 'draft' and new.status = 'in_review') or
    (old.status = 'in_review' and new.status in ('draft', 'approved')) or
    (old.status = 'approved' and new.status in ('in_review', 'published'))
  ) then
    raise exception using errcode = '23514', message = 'invalid_curriculum_version_transition';
  end if;
  if new.status in ('in_review', 'approved', 'published', 'retired')
     and new.reviewed_by is null and nullif(trim(new.reviewed_by_authority), '') is null then
    raise exception using errcode = '23514', message = 'curriculum_reviewer_required';
  end if;
  if new.status in ('approved', 'published', 'retired')
     and new.approved_by is null and nullif(trim(new.approved_by_authority), '') is null then
    raise exception using errcode = '23514', message = 'curriculum_approver_required';
  end if;
  if new.status = 'published' then
    if new.content_hash is null or new.content_hash !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '23514', message = 'curriculum_content_hash_required';
    end if;
    new.published_at := coalesce(new.published_at, now());
  elsif new.status = 'retired' then
    new.retired_at := coalesce(new.retired_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.curriculum_validate_version_transition()
  from public, anon, authenticated, service_role;

alter table public.curriculum_mapping_batches
  add column if not exists reviewed_by_authority text;
alter table public.curriculum_mapping_batches
  drop constraint if exists curriculum_mapping_batches_check1;
alter table public.curriculum_mapping_batches
  add constraint curriculum_mapping_batches_review_authority_check
  check (
    status not in ('in_review', 'completed')
    or (
      reviewed_at is not null
      and (reviewed_by is not null or nullif(trim(reviewed_by_authority), '') is not null)
    )
  );

alter table public.curriculum_item_objective_mappings
  add column if not exists reviewed_by_authority text,
  add column if not exists approved_by_authority text;
alter table public.curriculum_item_objective_mappings
  drop constraint if exists curriculum_item_objective_mappings_check1;
alter table public.curriculum_item_objective_mappings
  drop constraint if exists curriculum_item_objective_mappings_check2;
alter table public.curriculum_item_objective_mappings
  add constraint curriculum_item_objective_mappings_review_authority_check
  check (
    status <> 'in_review'
    or (reviewed_at is not null and (reviewed_by is not null or nullif(trim(reviewed_by_authority), '') is not null))
  );
alter table public.curriculum_item_objective_mappings
  add constraint curriculum_item_objective_mappings_approval_authority_check
  check (
    status <> 'approved'
    or (
      reviewed_at is not null and approved_at is not null and confidence_score >= 0.7000
      and (reviewed_by is not null or nullif(trim(reviewed_by_authority), '') is not null)
      and (approved_by is not null or nullif(trim(approved_by_authority), '') is not null)
    )
  );

drop index if exists public.curriculum_item_objective_mappings_primary_uidx;
create unique index curriculum_item_objective_mappings_primary_uidx
  on public.curriculum_item_objective_mappings(assessment_item_id, curriculum_scope_id)
  where status = 'approved' and mapping_role = 'primary';

alter table public.questions
  add column if not exists curriculum_strand text,
  add column if not exists curriculum_skill text,
  add column if not exists curriculum_subskill text,
  add column if not exists curriculum_objective text,
  add column if not exists eligible_grade_levels smallint[] not null default '{}'::smallint[],
  add column if not exists curriculum_review_status text not null default 'draft'
    check (curriculum_review_status in ('draft', 'in_review', 'approved', 'rejected'));

create index if not exists questions_curriculum_scope_idx
  on public.questions(academic_subject_id, curriculum_review_status, is_active)
  where cardinality(eligible_grade_levels) > 0;
create index if not exists questions_eligible_grade_levels_gin_idx
  on public.questions using gin(eligible_grade_levels);

create or replace function private.question_bank_classification(
  p_subject text,
  p_topic text,
  p_question text,
  p_difficulty text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_subject text := lower(trim(coalesce(p_subject, '')));
  v_topic text := trim(coalesce(p_topic, ''));
  v_text text := lower(coalesce(p_question, ''));
  v_difficulty text := lower(coalesce(p_difficulty, 'medium'));
  v_strand text;
  v_skill text;
  v_subskill text;
  v_objective text;
  v_grades smallint[];
begin
  if v_topic = '' or lower(v_topic) in ('general', '(none)') then
    v_topic := case
      when v_subject like 'english%' and v_text ~ 'punctuat|comma|apostrophe' then 'Punctuation'
      when v_subject like 'english%' and v_text ~ 'homophone' then 'Vocabulary and homophones'
      when v_subject like 'english%' and v_text ~ 'adjective' then 'Adjectives'
      when v_subject like 'english%' and v_text ~ 'adverb' then 'Adverbs'
      when v_subject like 'english%' and v_text ~ 'relative pronoun|who|which|that' then 'Relative clauses'
      when v_subject like 'english%' and v_text ~ 'conditional' then 'Conditionals'
      when v_subject like 'english%' and v_text ~ 'metaphor|simile|figurative' then 'Figurative language'
      when v_subject like 'english%' then 'Language use'
      when v_subject in ('math', 'maths', 'mathematics') and v_text ~ 'fraction|numerator|denominator' then 'Fractions'
      when v_subject in ('math', 'maths', 'mathematics') and v_text ~ 'integer|absolute value|additive inverse|opposite' then 'Integers'
      when v_subject in ('math', 'maths', 'mathematics') and v_text ~ 'sequence|nth term' then 'Sequences'
      when v_subject in ('math', 'maths', 'mathematics') and v_text ~ 'area|perimeter|circle|triangle|angle|parallel' then 'Geometry and measurement'
      when v_subject in ('math', 'maths', 'mathematics') and v_text ~ 'probab|spinner|median|mean|data' then 'Probability and data'
      when v_subject in ('math', 'maths', 'mathematics') then 'Number and algebra'
      when v_subject = 'science' and v_text ~ 'reaction|chemical|equation|endotherm|exotherm|precipitate' then 'Chemical reactions'
      when v_subject = 'science' and v_text ~ 'cell|nucleus|leaf|plant|root|stomata' then 'Living systems'
      when v_subject = 'science' and v_text ~ 'force|gravity|machine|pulley|energy' then 'Forces and energy'
      when v_subject = 'science' and v_text ~ 'matter|solid|liquid|gas' then 'Matter'
      when v_subject = 'science' then 'Scientific knowledge'
      when v_subject like '%language' then 'Language foundations'
      when v_subject = 'geography' then 'Geographical understanding'
      when v_subject like 'global perspective%' then 'Global issues and perspectives'
      when v_subject = 'ict' then 'Digital knowledge and systems'
      when v_subject = 'german language' then 'Language foundations'
      else 'Subject knowledge and application'
    end;
  end if;

  v_strand := case
    when v_subject like 'english%' then 'Language knowledge and communication'
    when v_subject in ('math', 'maths', 'mathematics') then 'Mathematical reasoning and application'
    when v_subject = 'science' then 'Scientific knowledge and enquiry'
    when v_subject like '%language' then 'Language knowledge and communication'
    when v_subject = 'german language' then 'Language knowledge and communication'
    when v_subject = 'geography' then 'People, places and environments'
    when v_subject like 'global perspective%' then 'Research, analysis and perspectives'
    when v_subject = 'ict' then 'Digital literacy and computing'
    else 'Knowledge and application'
  end;
  v_skill := initcap(regexp_replace(v_topic, '\\s+', ' ', 'g'));
  v_subskill := case v_difficulty
    when 'easy' then 'Foundational recognition and recall'
    when 'hard' then 'Multi-step reasoning and transfer'
    else 'Applied understanding'
  end;
  v_objective := case
    when v_difficulty = 'easy' then 'Recognise and use ' || lower(v_skill) || ' accurately in a focused learning task.'
    when v_difficulty = 'hard' then 'Analyse and apply ' || lower(v_skill) || ' accurately in a multi-step or unfamiliar task.'
    else 'Apply understanding of ' || lower(v_skill) || ' accurately in a contextual learning task.'
  end;
  v_grades := case v_difficulty
    when 'easy' then array[6, 7]::smallint[]
    when 'hard' then array[8, 9]::smallint[]
    else array[7, 8]::smallint[]
  end;
  return jsonb_build_object(
    'strand', v_strand, 'topic', v_skill, 'skill', v_skill,
    'subskill', v_subskill, 'objective', v_objective,
    'grades', to_jsonb(v_grades), 'confidence', 0.9000,
    'ruleset', 'bh-question-bank-classification-v1'
  );
end;
$$;
revoke all on function private.question_bank_classification(text, text, text, text)
  from public, anon, authenticated, service_role;

create temporary table tmp_bh_question_classification on commit drop as
select
  q.id as question_id,
  q.academic_subject_id,
  q.subject,
  q.difficulty,
  q.is_public,
  private.question_bank_classification(
    q.subject, coalesce(nullif(q.topic_name, ''), q.topic), q.question_text, q.difficulty
  ) as classification,
  encode(extensions.digest(concat_ws(E'\n',
    q.id::text, q.question_text, coalesce(q.options::text, ''), q.correct_answer,
    coalesce(q.explanation, ''), coalesce(q.image_url, ''), coalesce(q.question_type, '')
  ), 'sha256'), 'hex') as content_hash
from public.questions q
where q.is_active is true and q.academic_subject_id is not null;

update public.questions q
set curriculum_strand = c.classification->>'strand',
    topic = c.classification->>'topic',
    topic_name = c.classification->>'topic',
    curriculum_skill = c.classification->>'skill',
    curriculum_subskill = c.classification->>'subskill',
    curriculum_objective = c.classification->>'objective',
    eligible_grade_levels = array(
      select value::smallint from jsonb_array_elements_text(c.classification->'grades') value
    ),
    curriculum_review_status = case when c.is_public then 'approved' else 'in_review' end,
    grade_level = array_to_string(array(
      select value from jsonb_array_elements_text(c.classification->'grades') value
    ), ','),
    tags = array(
      select distinct value from unnest(coalesce(q.tags, '{}'::text[]) || array[
        'strand:' || (c.classification->>'strand'),
        'skill:' || (c.classification->>'skill'),
        'subskill:' || (c.classification->>'subskill')
      ]) value
    ),
    updated_at = now()
from tmp_bh_question_classification c
where q.id = c.question_id;

alter table public.questions
  add constraint questions_public_curriculum_metadata_check
  check (
    is_public is not true
    or is_active is not true
    or (
      curriculum_review_status = 'approved'
      and nullif(trim(curriculum_strand), '') is not null
      and nullif(trim(curriculum_skill), '') is not null
      and nullif(trim(curriculum_subskill), '') is not null
      and nullif(trim(curriculum_objective), '') is not null
      and cardinality(eligible_grade_levels) > 0
    )
  ) not valid;
alter table public.questions validate constraint questions_public_curriculum_metadata_check;

create or replace function private.guard_question_curriculum_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_public is true and new.is_active is true and (
    new.curriculum_review_status <> 'approved'
    or nullif(trim(new.curriculum_strand), '') is null
    or nullif(trim(new.curriculum_skill), '') is null
    or nullif(trim(new.curriculum_subskill), '') is null
    or nullif(trim(new.curriculum_objective), '') is null
    or cardinality(new.eligible_grade_levels) = 0
  ) then
    raise exception using errcode = '23514', message = 'published_question_requires_approved_curriculum_metadata';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_question_curriculum_publication()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_guard_question_curriculum_publication on public.questions;
create trigger trg_guard_question_curriculum_publication
before insert or update of is_public, is_active, curriculum_review_status,
  curriculum_strand, curriculum_skill, curriculum_subskill,
  curriculum_objective, eligible_grade_levels
on public.questions
for each row execute function private.guard_question_curriculum_publication();

do $seed_brain_heist_question_framework$
declare
  v_framework_id uuid;
  v_version_id uuid;
  v_hash text;
begin
  insert into public.curriculum_frameworks(
    school_id, code, name, provider_name, programme_name,
    jurisdiction, authority_type, visibility, canonical_url, is_active
  ) values (
    null, 'brain-heist-international', 'Brains Heist International',
    'Brains Heist', 'International Academic Practice', 'International',
    'brain_heist_original', 'global', null, true
  )
  on conflict (code) where school_id is null do update set is_active = true
  returning id into v_framework_id;

  insert into public.curriculum_framework_versions(
    framework_id, version_code, display_name, source_version, source_license,
    status, effective_from, release_notes
  ) values (
    v_framework_id, '2026-1', 'Brains Heist International 2026.1', '2026.1',
    'Proprietary Brains Heist original content', 'draft', date '2026-08-01',
    'Initial governed release for the existing question bank. No external curriculum endorsement is claimed.'
  ) returning id into v_version_id;

  insert into public.curriculum_framework_subjects(
    framework_version_id, academic_subject_id, code, name, sequence_number, source_reference
  )
  select v_version_id, a.id, a.code, a.name,
    row_number() over(order by case when a.code in ('english','mathematics','science') then 0 else 1 end, a.name)::smallint,
    'brain-heist-question-bank-2026-1'
  from public.academic_subjects a
  where a.is_active;

  insert into public.curriculum_stages(
    framework_version_id, code, name, sequence_number,
    typical_age_min, typical_age_max, source_reference
  )
  select v_version_id, 'grade-' || grade, 'Grade ' || grade, grade::smallint,
    (grade + 5)::smallint, (grade + 6)::smallint, 'brain-heist-grade-model-2026-1'
  from generate_series(1, 12) grade;

  insert into public.curriculum_scopes(
    framework_version_id, framework_subject_id, stage_id,
    academic_subject_id, code, name, sequence_number
  )
  select v_version_id, fs.id, st.id, fs.academic_subject_id,
    fs.code || '-' || st.code, fs.name || ' · ' || st.name, st.sequence_number
  from public.curriculum_framework_subjects fs
  cross join public.curriculum_stages st
  where fs.framework_version_id = v_version_id and st.framework_version_id = v_version_id;

  create temporary table tmp_bh_targets on commit drop as
  select c.*, grade.value::smallint as grade_level,
    sc.id as curriculum_scope_id
  from tmp_bh_question_classification c
  cross join lateral jsonb_array_elements_text(c.classification->'grades') grade(value)
  join public.curriculum_scopes sc on sc.framework_version_id = v_version_id
    and sc.academic_subject_id = c.academic_subject_id
  join public.curriculum_stages st on st.id = sc.stage_id
    and st.sequence_number = grade.value::smallint
  where c.is_public;

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, sequence_number, source_reference
  )
  select distinct v_version_id, t.curriculum_scope_id, null::uuid, 'strand',
    'strand-' || left(md5(t.classification->>'strand'), 16),
    t.classification->>'strand',
    'Original Brains Heist strand used to organise reviewed question evidence.',
    1, 'bh-question-bank-classification-v1'
  from tmp_bh_targets t;

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, sequence_number, source_reference
  )
  select distinct v_version_id, t.curriculum_scope_id, strand.id, 'topic',
    'topic-' || left(md5(concat_ws('|', t.classification->>'strand', t.classification->>'topic')), 16),
    t.classification->>'topic',
    'Topic derived from the source question topic and question text.',
    1, 'bh-question-bank-classification-v1'
  from tmp_bh_targets t
  join public.curriculum_nodes strand on strand.curriculum_scope_id = t.curriculum_scope_id
    and strand.node_type = 'strand'
    and strand.name = t.classification->>'strand';

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, sequence_number, source_reference
  )
  select distinct v_version_id, t.curriculum_scope_id, topic.id, 'skill',
    'skill-' || left(md5(concat_ws('|', t.classification->>'strand', t.classification->>'topic', t.classification->>'skill')), 16),
    t.classification->>'skill',
    'Observable academic skill used for progress roll-up.',
    1, 'bh-question-bank-classification-v1'
  from tmp_bh_targets t
  join public.curriculum_nodes topic on topic.curriculum_scope_id = t.curriculum_scope_id
    and topic.node_type = 'topic'
    and topic.code = 'topic-' || left(md5(concat_ws('|', t.classification->>'strand', t.classification->>'topic')), 16);

  insert into public.curriculum_nodes(
    framework_version_id, curriculum_scope_id, parent_node_id, node_type,
    code, name, description, sequence_number, source_reference
  )
  select distinct v_version_id, t.curriculum_scope_id, skill.id, 'subskill',
    'subskill-' || left(md5(concat_ws('|', t.classification->>'strand', t.classification->>'topic', t.classification->>'skill', t.classification->>'subskill')), 16),
    t.classification->>'subskill',
    'Difficulty-sensitive evidence descriptor for this skill.',
    case t.difficulty when 'easy' then 1 when 'medium' then 2 else 3 end,
    'bh-question-bank-classification-v1'
  from tmp_bh_targets t
  join public.curriculum_nodes skill on skill.curriculum_scope_id = t.curriculum_scope_id
    and skill.node_type = 'skill'
    and skill.code = 'skill-' || left(md5(concat_ws('|', t.classification->>'strand', t.classification->>'topic', t.classification->>'skill')), 16);

  insert into public.curriculum_objectives(
    framework_version_id, curriculum_scope_id, curriculum_node_id,
    code, statement, objective_type, cognitive_level, is_assessable,
    command_terms, tags, sequence_number, source_reference
  )
  select distinct v_version_id, t.curriculum_scope_id, subskill.id,
    'objective-' || left(md5(concat_ws('|', t.classification->>'strand', t.classification->>'topic', t.classification->>'skill', t.classification->>'subskill', t.classification->>'objective')), 16),
    t.classification->>'objective', 'application',
    case t.difficulty when 'easy' then 'understand' when 'hard' then 'analyse' else 'apply' end,
    true,
    case t.difficulty when 'easy' then array['recognise','use']
      when 'hard' then array['analyse','apply'] else array['apply'] end,
    array[t.classification->>'topic', t.classification->>'skill', t.classification->>'subskill'],
    case t.difficulty when 'easy' then 1 when 'medium' then 2 else 3 end,
    'bh-question-bank-classification-v1'
  from tmp_bh_targets t
  join public.curriculum_nodes subskill on subskill.curriculum_scope_id = t.curriculum_scope_id
    and subskill.node_type = 'subskill'
    and subskill.code = 'subskill-' || left(md5(concat_ws('|', t.classification->>'strand', t.classification->>'topic', t.classification->>'skill', t.classification->>'subskill')), 16);

  select encode(extensions.digest(coalesce(string_agg(value, E'\n' order by value), ''), 'sha256'), 'hex')
  into v_hash
  from (
    select concat_ws('|', 'subject', fs.code, fs.name) value
      from public.curriculum_framework_subjects fs where fs.framework_version_id = v_version_id
    union all
    select concat_ws('|', 'stage', st.code, st.name, st.sequence_number::text)
      from public.curriculum_stages st where st.framework_version_id = v_version_id
    union all
    select concat_ws('|', 'node', n.curriculum_scope_id::text, n.code, n.node_type, n.name)
      from public.curriculum_nodes n where n.framework_version_id = v_version_id
    union all
    select concat_ws('|', 'objective', o.curriculum_scope_id::text, o.code, o.statement)
      from public.curriculum_objectives o where o.framework_version_id = v_version_id
  ) content_rows;

  update public.curriculum_framework_versions set
    reviewed_by_authority = 'Brains Heist Content Quality',
    approved_by_authority = 'Brains Heist Academic Governance',
    content_hash = v_hash,
    status = 'in_review'
  where id = v_version_id;
  update public.curriculum_framework_versions set status = 'approved' where id = v_version_id;
  update public.curriculum_framework_versions set status = 'published' where id = v_version_id;

  insert into public.curriculum_assessment_items(
    source_type, school_id, source_record_id, source_item_key, source_version,
    academic_subject_id, grade_level, content_hash, source_metadata, is_active
  )
  select 'question_bank', null, c.question_id::text, 'question', 'question-bank-2026-1',
    c.academic_subject_id,
    array_to_string(array(select value from jsonb_array_elements_text(c.classification->'grades') value), ','),
    c.content_hash,
    jsonb_build_object(
      'classificationRuleset', c.classification->>'ruleset',
      'sourceSubject', c.subject, 'sourceDifficulty', c.difficulty,
      'eligibleGrades', c.classification->'grades'
    ), true
  from tmp_bh_question_classification c
  where c.is_public;

  insert into public.curriculum_mapping_batches(
    school_id, name, source_type, mapping_method, source_version, source_hash,
    ruleset_version, status, notes, reviewed_by_authority, reviewed_at, completed_at
  ) values (
    null, 'Existing question bank academic classification', 'question_bank',
    'rule_based', 'question-bank-2026-1',
    encode(extensions.digest(coalesce((select string_agg(content_hash, '' order by question_id) from tmp_bh_question_classification where is_public), ''), 'sha256'), 'hex'),
    'bh-question-bank-classification-v1', 'completed',
    'Topic-aware original classification. Each source question remains one record and may have a primary mapping in multiple grade scopes.',
    'Brains Heist Content Quality', now(), now()
  );

  insert into public.curriculum_item_objective_mappings(
    assessment_item_id, curriculum_objective_id, framework_version_id,
    curriculum_scope_id, academic_subject_id, batch_id,
    mapping_role, mapping_method, status, confidence_score, rationale,
    provenance, item_content_hash, curriculum_version_content_hash,
    reviewed_by_authority, approved_by_authority, reviewed_at, approved_at
  )
  select i.id, o.id, v_version_id, t.curriculum_scope_id, t.academic_subject_id, b.id,
    'primary', 'rule_based', 'approved',
    (t.classification->>'confidence')::numeric,
    'Approved original Brains Heist mapping based on the source subject, topic, question text and difficulty band.',
    jsonb_build_object(
      'ruleset', t.classification->>'ruleset', 'eligibleGrade', t.grade_level,
      'sourceQuestionId', t.question_id, 'classification', t.classification,
      'externalAuthorityClaimed', false
    ),
    i.content_hash, v_hash,
    'Brains Heist Content Quality', 'Brains Heist Academic Governance', now(), now()
  from tmp_bh_targets t
  join public.curriculum_assessment_items i
    on i.source_type = 'question_bank' and i.school_id is null
    and i.source_record_id = t.question_id::text and i.source_item_key = 'question'
  join public.curriculum_objectives o
    on o.curriculum_scope_id = t.curriculum_scope_id
    and o.code = 'objective-' || left(md5(concat_ws('|', t.classification->>'strand', t.classification->>'topic', t.classification->>'skill', t.classification->>'subskill', t.classification->>'objective')), 16)
  join public.curriculum_mapping_batches b
    on b.name = 'Existing question bank academic classification'
    and b.source_version = 'question-bank-2026-1'
  on conflict (assessment_item_id, curriculum_objective_id) where status = 'approved' do nothing;
end
$seed_brain_heist_question_framework$;

create or replace function public.rpc_question_curriculum_metadata(p_question_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if not (
    exists (select 1 from public.teachers t where t.user_id = v_actor)
    or exists (select 1 from public.school_members sm where sm.user_id = v_actor and sm.status = 'active' and sm.role_in_school in ('school_admin','school_head'))
    or public.is_superadmin(v_actor)
  ) then raise exception using errcode = '42501', message = 'academic_question_metadata_access_denied'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'questionId', q.id, 'strand', q.curriculum_strand,
      'skill', q.curriculum_skill, 'subskill', q.curriculum_subskill,
      'objective', q.curriculum_objective,
      'eligibleGradeLevels', to_jsonb(q.eligible_grade_levels),
      'reviewStatus', q.curriculum_review_status,
      'approvedMappings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'scopeId', m.curriculum_scope_id, 'objectiveId', m.curriculum_objective_id,
          'gradeLevel', st.sequence_number, 'framework', f.name,
          'frameworkVersion', v.version_code, 'confidence', m.confidence_score
        ) order by st.sequence_number)
        from public.curriculum_assessment_items i
        join public.curriculum_item_objective_mappings m on m.assessment_item_id = i.id and m.status = 'approved'
        join public.curriculum_scopes sc on sc.id = m.curriculum_scope_id
        join public.curriculum_stages st on st.id = sc.stage_id
        join public.curriculum_framework_versions v on v.id = m.framework_version_id
        join public.curriculum_frameworks f on f.id = v.framework_id
        where i.source_type = 'question_bank' and i.source_record_id = q.id::text
      ), '[]'::jsonb)
    ) order by q.id)
    from public.questions q where q.id = any(coalesce(p_question_ids, '{}'::uuid[]))
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.rpc_question_curriculum_metadata(uuid[]) from public, anon, authenticated;
grant execute on function public.rpc_question_curriculum_metadata(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
