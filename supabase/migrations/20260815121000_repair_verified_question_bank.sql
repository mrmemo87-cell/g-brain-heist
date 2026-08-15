-- Repair the five known scoring defects without mutating verified content,
-- retire the 96 reviewed exact duplicate pairs, and archive the QA-only
-- curriculum framework. Assignment snapshots and attempt history are retained.

create table if not exists public.verified_question_duplicate_reviews (
  duplicate_question_id uuid primary key references public.questions(id) on delete restrict,
  canonical_question_id uuid not null references public.questions(id) on delete restrict,
  review_key text not null,
  review_reason text not null,
  canonical_reference_count integer not null,
  duplicate_reference_count integer not null,
  reviewed_by_authority text not null,
  reviewed_at timestamptz not null default now(),
  retired_at timestamptz not null default now(),
  check (canonical_question_id <> duplicate_question_id),
  check (length(trim(review_key)) >= 3),
  check (length(trim(review_reason)) >= 10)
);

alter table public.verified_question_duplicate_reviews enable row level security;
revoke all on table public.verified_question_duplicate_reviews from public, anon, authenticated, service_role;
grant select, insert on table public.verified_question_duplicate_reviews to service_role;
create index if not exists verified_question_duplicate_reviews_canonical_idx
  on public.verified_question_duplicate_reviews(canonical_question_id);

create table if not exists public.verified_question_content_repairs (
  original_question_id uuid primary key references public.questions(id) on delete restrict,
  replacement_question_id uuid not null unique references public.questions(id) on delete restrict,
  repair_key text not null,
  defect_type text not null,
  original_content_hash text not null,
  replacement_content_hash text not null,
  repaired_by_authority text not null,
  repaired_at timestamptz not null default now(),
  check (original_question_id <> replacement_question_id),
  check (original_content_hash ~ '^[0-9a-f]{64}$'),
  check (replacement_content_hash ~ '^[0-9a-f]{64}$')
);

alter table public.verified_question_content_repairs enable row level security;
revoke all on table public.verified_question_content_repairs from public, anon, authenticated, service_role;
grant select, insert on table public.verified_question_content_repairs to service_role;

-- The exact-pair review uses normalized prompt and answer plus the complete
-- ordered options payload. Every reviewed pair also has identical subject,
-- topic, eligible-grade and curriculum-objective metadata.
create temporary table tmp_verified_duplicate_review on commit drop as
with base as (
  select q.*,
    lower(regexp_replace(trim(q.question_text), '\s+', ' ', 'g')) normalized_question,
    lower(trim(q.correct_answer)) normalized_answer,
    q.options::text normalized_options
  from public.questions q
  where q.content_origin = 'brain_heist' and q.verification_status = 'verified'
    and q.analytics_eligible and q.is_active
), duplicate_groups as (
  select normalized_question, normalized_answer, normalized_options
  from base
  group by normalized_question, normalized_answer, normalized_options
  having count(*) = 2
), reference_counts as (
  select b.id,
    (select count(*) from public.assignment_questions x where x.question_id = b.id)
    + (select count(*) from public.question_attempts x where x.question_id = b.id)
    + (select count(*) from public.student_assignment_answers x where x.question_id = b.id)
    + (select count(*) from public.quest_run_nodes x where x.question_id = b.id) as reference_count
  from base b
), ranked as (
  select b.*,
    r.reference_count,
    row_number() over (
      partition by b.normalized_question, b.normalized_answer, b.normalized_options
      order by r.reference_count desc, b.created_at, b.id
    ) duplicate_rank
  from base b
  join duplicate_groups g using (normalized_question, normalized_answer, normalized_options)
  join reference_counts r on r.id = b.id
)
select duplicate.id duplicate_question_id,
  canonical.id canonical_question_id,
  duplicate.reference_count duplicate_reference_count,
  canonical.reference_count canonical_reference_count,
  encode(extensions.digest(concat_ws(E'\n', duplicate.normalized_question,
    duplicate.normalized_answer, duplicate.normalized_options), 'sha256'), 'hex') review_key,
  duplicate.subject, duplicate.topic_name, duplicate.eligible_grade_levels,
  duplicate.curriculum_objective
from ranked duplicate
join ranked canonical
  on canonical.normalized_question = duplicate.normalized_question
 and canonical.normalized_answer = duplicate.normalized_answer
 and canonical.normalized_options = duplicate.normalized_options
 and canonical.duplicate_rank = 1
where duplicate.duplicate_rank = 2;

do $review$
declare
  v_pair_count integer;
  v_metadata_mismatch integer;
begin
  select count(*) into v_pair_count from tmp_verified_duplicate_review;
  if v_pair_count <> 96 then
    raise exception using errcode = '55000',
      message = format('verified_duplicate_review_set_changed: expected 96 pairs, found %s', v_pair_count);
  end if;

  select count(*) into v_metadata_mismatch
  from tmp_verified_duplicate_review r
  join public.questions c on c.id = r.canonical_question_id
  join public.questions d on d.id = r.duplicate_question_id
  where lower(trim(c.subject)) <> lower(trim(d.subject))
     or c.academic_subject_id is distinct from d.academic_subject_id
     or lower(trim(coalesce(c.topic_name, c.topic, ''))) <> lower(trim(coalesce(d.topic_name, d.topic, '')))
     or c.eligible_grade_levels is distinct from d.eligible_grade_levels
     or coalesce(c.curriculum_objective, '') <> coalesce(d.curriculum_objective, '');
  if v_metadata_mismatch <> 0 then
    raise exception using errcode = '55000', message = 'verified_duplicate_metadata_mismatch';
  end if;
end;
$review$;

insert into public.verified_question_duplicate_reviews(
  duplicate_question_id, canonical_question_id, review_key, review_reason,
  canonical_reference_count, duplicate_reference_count, reviewed_by_authority
)
select duplicate_question_id, canonical_question_id, review_key,
  'Exact normalized prompt, answer, ordered options, subject, topic, grade scope and objective match.',
  canonical_reference_count, duplicate_reference_count,
  'Brains Heist Content Quality'
from tmp_verified_duplicate_review;

update public.questions q
set verification_status = 'retired', analytics_eligible = false,
    is_public = false, is_active = false, updated_at = now()
from tmp_verified_duplicate_review r
where q.id = r.duplicate_question_id;

update public.curriculum_assessment_items i
set is_active = false, retired_at = now(), updated_at = now()
from tmp_verified_duplicate_review r
where i.source_type = 'question_bank' and i.school_id is null
  and i.source_record_id = r.duplicate_question_id::text
  and i.source_item_key = 'question' and i.is_active;

-- Build immutable replacement records for the five scoring defects. The
-- replacement keeps the original curriculum classification and approved scope
-- mappings, while historical assignments continue using their old snapshots.
create temporary table tmp_verified_scoring_fixes (
  original_question_id uuid primary key,
  replacement_question_id uuid not null unique,
  external_id text not null unique,
  defect_type text not null,
  options jsonb not null,
  correct_answer text not null,
  explanation text
) on commit drop;

insert into tmp_verified_scoring_fixes values
  (
    'c283d024-8ea5-4a5e-86a9-c16837796d36',
    (substr(md5('verified-question:bh-repair-2026.1.1-en-past-continuous-001'),1,8)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-en-past-continuous-001'),9,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-en-past-continuous-001'),13,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-en-past-continuous-001'),17,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-en-past-continuous-001'),21,12))::uuid,
    'bh-repair-2026.1.1-en-past-continuous-001', 'duplicate_option',
    '["While she was walking, she saw an accident.","While she walking, she saw an accident.","While she was walking, she was seeing an accident.","While she walked, she was seeing an accident."]'::jsonb,
    'While she was walking, she saw an accident.',
    'Use the past continuous for the ongoing action after “while” and the past simple for the shorter event.'
  ),
  (
    'c2f188de-11b6-4787-a739-b404ffcb27c5',
    (substr(md5('verified-question:bh-repair-2026.1.1-de-brain-location-001'),1,8)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-de-brain-location-001'),9,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-de-brain-location-001'),13,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-de-brain-location-001'),17,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-de-brain-location-001'),21,12))::uuid,
    'bh-repair-2026.1.1-de-brain-location-001', 'letter_answer_key',
    '["Im Kopf 🧠","Im Fuß 🦶","In der Hand ✋","In der Hausaufgabe"]'::jsonb,
    'Im Kopf 🧠', 'Das Gehirn befindet sich im Kopf.'
  ),
  (
    '1ee7aaaf-125a-41e4-92af-3554e510c3a4',
    (substr(md5('verified-question:bh-repair-2026.1.1-de-berlin-preposition-001'),1,8)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-de-berlin-preposition-001'),9,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-de-berlin-preposition-001'),13,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-de-berlin-preposition-001'),17,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-de-berlin-preposition-001'),21,12))::uuid,
    'bh-repair-2026.1.1-de-berlin-preposition-001', 'punctuation_answer_key',
    '["Ich wohne im Berlin.","Ich wohne auf Berlin.","Ich wohne bei Berlin.","Ich wohne in Berlin."]'::jsonb,
    'Ich wohne in Berlin.', 'For a city, German uses “in” without an article: “Ich wohne in Berlin.”'
  ),
  (
    '658b0b3c-26a1-41c5-90dc-22e594e5e860',
    (substr(md5('verified-question:bh-repair-2026.1.1-math-addition-001'),1,8)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-math-addition-001'),9,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-math-addition-001'),13,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-math-addition-001'),17,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-math-addition-001'),21,12))::uuid,
    'bh-repair-2026.1.1-math-addition-001', 'letter_answer_key',
    '["20","60","100","200"]'::jsonb,
    '100', 'Adding 2 to 98 gives 100.'
  ),
  (
    'd8a0e687-a5b6-4ff4-9177-046aef5a7aac',
    (substr(md5('verified-question:bh-repair-2026.1.1-science-chemical-energy-001'),1,8)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-science-chemical-energy-001'),9,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-science-chemical-energy-001'),13,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-science-chemical-energy-001'),17,4)||'-'||substr(md5('verified-question:bh-repair-2026.1.1-science-chemical-energy-001'),21,12))::uuid,
    'bh-repair-2026.1.1-science-chemical-energy-001', 'wording_answer_key',
    '["Kinetic energy","Thermal energy","Chemical energy","Nuclear energy"]'::jsonb,
    'Chemical energy', 'Energy stored in chemical bonds is chemical energy.'
  );

do $fix_guard$
declare v_found integer;
begin
  select count(*) into v_found
  from tmp_verified_scoring_fixes f
  join public.questions q on q.id = f.original_question_id
  where q.content_origin = 'brain_heist';
  if v_found <> 5 then
    raise exception using errcode = '55000', message = 'verified_scoring_fix_source_set_changed';
  end if;
end;
$fix_guard$;

insert into public.questions(
  id, teacher_id, subject, topic, difficulty, question_text, question_type,
  options, correct_answer, explanation, hints, time_limit, points, tags,
  grade_level, is_public, is_active, times_answered, times_correct, subject_id,
  topic_name, image_url, tier_level, grade, lang, academic_subject_id,
  curriculum_strand, curriculum_skill, curriculum_subskill,
  curriculum_objective, eligible_grade_levels, curriculum_review_status,
  content_origin, verification_status, analytics_eligible, verified_at,
  verified_by_authority, verified_content_hash, content_version,
  content_revision, verified_external_id
)
select f.replacement_question_id, null,
  case when lower(q.subject) in ('math', 'maths') then 'Mathematics' else q.subject end,
  q.topic, q.difficulty, q.question_text, q.question_type,
  f.options, f.correct_answer, coalesce(f.explanation, q.explanation), q.hints,
  q.time_limit, q.points, q.tags || array['repair:2026.1.1'], q.grade_level,
  true, true, 0, 0, q.subject_id, q.topic_name, q.image_url, q.tier_level,
  q.grade, q.lang, q.academic_subject_id, q.curriculum_strand,
  q.curriculum_skill, q.curriculum_subskill, q.curriculum_objective,
  q.eligible_grade_levels, 'approved', 'brain_heist', 'verified', true, now(),
  'Brains Heist Academic Governance',
  private.question_content_hash(
    f.replacement_question_id, q.question_text, f.options, f.correct_answer,
    coalesce(f.explanation, q.explanation), q.image_url, q.question_type
  ),
  'brain-heist-2026-1.1', 1, f.external_id
from tmp_verified_scoring_fixes f
join public.questions q on q.id = f.original_question_id;

insert into public.curriculum_assessment_items(
  source_type, school_id, source_record_id, source_item_key, source_version,
  academic_subject_id, grade_level, content_hash, source_metadata, is_active
)
select 'question_bank', null, replacement.id::text, 'question', 'question-bank-2026-1.1',
  replacement.academic_subject_id,
  array_to_string(replacement.eligible_grade_levels, ','),
  replacement.current_content_hash,
  jsonb_build_object(
    'repairKey', 'verified-scoring-defects-2026-1.1',
    'supersedesQuestionId', f.original_question_id,
    'verifiedExternalId', f.external_id,
    'defectType', f.defect_type,
    'eligibleGrades', to_jsonb(replacement.eligible_grade_levels)
  ), true
from tmp_verified_scoring_fixes f
join public.questions replacement on replacement.id = f.replacement_question_id;

insert into public.curriculum_mapping_batches(
  school_id, name, source_type, mapping_method, source_version, source_hash,
  ruleset_version, status, notes, reviewed_by_authority, reviewed_at, completed_at
)
select null, 'Verified scoring defect replacements 2026.1.1', 'question_bank',
  'imported', 'question-bank-2026-1.1',
  encode(extensions.digest(string_agg(replacement.current_content_hash, '' order by replacement.id), 'sha256'), 'hex'),
  'verified-scoring-repair-v1', 'completed',
  'Five immutable replacement questions for exact-answer scoring defects.',
  'Brains Heist Content Quality', now(), now()
from tmp_verified_scoring_fixes f
join public.questions replacement on replacement.id = f.replacement_question_id;

insert into public.curriculum_item_objective_mappings(
  assessment_item_id, curriculum_objective_id, framework_version_id,
  curriculum_scope_id, academic_subject_id, batch_id, mapping_role,
  mapping_method, status, confidence_score, rationale, provenance,
  item_content_hash, curriculum_version_content_hash,
  reviewed_by_authority, approved_by_authority, reviewed_at, approved_at
)
select new_item.id, old_mapping.curriculum_objective_id,
  old_mapping.framework_version_id, old_mapping.curriculum_scope_id,
  old_mapping.academic_subject_id, batch.id, old_mapping.mapping_role,
  'imported', 'approved', 1.0000,
  'Immutable scoring repair retains the reviewed curriculum objective of the original question.',
  jsonb_build_object(
    'repairKey', 'verified-scoring-defects-2026-1.1',
    'supersedesQuestionId', f.original_question_id,
    'sourceMappingId', old_mapping.id,
    'externalAuthorityClaimed', false
  ),
  new_item.content_hash, old_mapping.curriculum_version_content_hash,
  'Brains Heist Content Quality', 'Brains Heist Academic Governance', now(), now()
from tmp_verified_scoring_fixes f
join public.curriculum_assessment_items old_item
  on old_item.source_type = 'question_bank' and old_item.school_id is null
 and old_item.source_record_id = f.original_question_id::text and old_item.source_item_key = 'question'
join public.curriculum_item_objective_mappings old_mapping
  on old_mapping.assessment_item_id = old_item.id
 and old_mapping.status = 'approved' and old_mapping.mapping_role = 'primary'
join public.curriculum_assessment_items new_item
  on new_item.source_type = 'question_bank' and new_item.school_id is null
 and new_item.source_record_id = f.replacement_question_id::text and new_item.source_item_key = 'question'
join public.curriculum_mapping_batches batch
  on batch.name = 'Verified scoring defect replacements 2026.1.1'
 and batch.source_version = 'question-bank-2026-1.1';

insert into public.verified_question_content_repairs(
  original_question_id, replacement_question_id, repair_key, defect_type,
  original_content_hash, replacement_content_hash, repaired_by_authority
)
select f.original_question_id, f.replacement_question_id,
  'verified-scoring-defects-2026-1.1', f.defect_type,
  original.current_content_hash, replacement.current_content_hash,
  'Brains Heist Academic Governance'
from tmp_verified_scoring_fixes f
join public.questions original on original.id = f.original_question_id
join public.questions replacement on replacement.id = f.replacement_question_id;

update public.questions q
set verification_status = 'retired', analytics_eligible = false,
    is_public = false, is_active = false, updated_at = now()
from tmp_verified_scoring_fixes f
where q.id = f.original_question_id;

update public.curriculum_assessment_items i
set is_active = false, retired_at = now(), updated_at = now()
from tmp_verified_scoring_fixes f
where i.source_type = 'question_bank' and i.school_id is null
  and i.source_record_id = f.original_question_id::text
  and i.source_item_key = 'question' and i.is_active;

-- The QA framework contains only eight QA scopes and no item mappings. Archive
-- its school links, retire the published version, and hide the framework.
update public.school_curriculum_scope_mappings sm
set status = 'archived',
    notes = concat_ws(E'\n', nullif(trim(sm.notes), ''),
      'Archived: temporary Grade 8 QA curriculum retired after question-bank verification.'),
    updated_at = now()
where sm.curriculum_scope_id in (
  select cs.id
  from public.curriculum_scopes cs
  join public.curriculum_framework_versions fv on fv.id = cs.framework_version_id
  join public.curriculum_frameworks f on f.id = fv.framework_id
  where f.code = 'qa-sam-g8-2026' and fv.version_code = '2026-qa-v1'
) and sm.status in ('planned', 'active');

update public.curriculum_framework_versions fv
set status = 'retired'
from public.curriculum_frameworks f
where f.id = fv.framework_id and f.code = 'qa-sam-g8-2026'
  and fv.version_code = '2026-qa-v1' and fv.status = 'published';

update public.curriculum_frameworks
set is_active = false, updated_at = now()
where code = 'qa-sam-g8-2026' and is_active;
