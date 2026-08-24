-- PDF-first teacher question batches with immutable extraction provenance.
--
-- Teacher submissions may be used as private classroom material while they are
-- in review, but they remain permanently excluded from verified Academic
-- Profile evidence until a separate governed promotion process is completed.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Private PDF source bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'teacher-question-sources',
  'teacher-question-sources',
  false,
  6291456,
  array['application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Teachers upload own question source PDFs" on storage.objects;
create policy "Teachers upload own question source PDFs"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'teacher-question-sources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(split_part(name, '.', -1)) = 'pdf'
  and exists (
    select 1
    from public.teachers t
    where t.user_id = (select auth.uid())
  )
);

-- Source PDFs stay private. The authenticated extraction function reads them
-- with its server-only service credential after verifying the teacher and path.

-- ---------------------------------------------------------------------------
-- 2. Immutable extraction, batch and item provenance
-- ---------------------------------------------------------------------------

create table if not exists public.teacher_question_pdf_extractions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  teacher_user_id uuid not null references auth.users(id) on delete restrict,
  school_id uuid references public.schools(id) on delete set null,
  source_bucket text not null default 'teacher-question-sources'
    check (source_bucket = 'teacher-question-sources'),
  source_object_path text not null unique,
  source_file_name text not null,
  source_file_sha256 text not null check (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  source_file_size integer not null check (source_file_size between 1 and 6291456),
  detected_page_count integer check (detected_page_count between 1 and 60),
  extraction_model text not null,
  extraction_schema_version integer not null default 1 check (extraction_schema_version = 1),
  extracted_question_count integer not null check (extracted_question_count between 1 and 50),
  extraction_payload jsonb not null check (jsonb_typeof(extraction_payload) = 'object'),
  extraction_payload_sha256 text not null check (extraction_payload_sha256 ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz not null default now(),
  check (length(trim(source_object_path)) between 40 and 700),
  check (length(trim(source_file_name)) between 5 and 255),
  check (length(trim(extraction_model)) between 2 and 120)
);

create table if not exists public.teacher_question_batches (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  teacher_user_id uuid not null references auth.users(id) on delete restrict,
  school_id uuid references public.schools(id) on delete set null,
  extraction_id uuid not null unique
    references public.teacher_question_pdf_extractions(id) on delete restrict,
  status text not null default 'in_review'
    check (status in ('in_review', 'approved_for_governance', 'returned', 'rejected')),
  submitted_question_count integer not null check (submitted_question_count between 1 and 50),
  created_question_count integer not null check (created_question_count between 0 and submitted_question_count),
  duplicate_question_count integer not null check (duplicate_question_count = submitted_question_count - created_question_count),
  submitted_at timestamptz not null default now()
);

create table if not exists public.teacher_question_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.teacher_question_batches(id) on delete restrict,
  question_id uuid not null references public.questions(id) on delete restrict,
  source_index integer not null check (source_index between 1 and 50),
  source_page integer check (source_page between 1 and 60),
  submitted_content_hash text not null check (submitted_content_hash ~ '^[0-9a-f]{64}$'),
  question_snapshot jsonb not null check (jsonb_typeof(question_snapshot) = 'object'),
  taxonomy_proposal jsonb not null check (jsonb_typeof(taxonomy_proposal) = 'object'),
  extraction_confidence numeric(4,3) not null check (extraction_confidence between 0 and 1),
  needs_human_attention boolean not null default true,
  created_at timestamptz not null default now(),
  unique (batch_id, source_index),
  unique (batch_id, question_id)
);

alter table public.teacher_question_pdf_extractions enable row level security;
alter table public.teacher_question_batches enable row level security;
alter table public.teacher_question_batch_items enable row level security;

revoke all on table public.teacher_question_pdf_extractions
  from public, anon, authenticated, service_role;
revoke all on table public.teacher_question_batches
  from public, anon, authenticated, service_role;
revoke all on table public.teacher_question_batch_items
  from public, anon, authenticated, service_role;

grant select, insert on table public.teacher_question_pdf_extractions to service_role;
grant select on table public.teacher_question_batches to service_role;
grant select on table public.teacher_question_batch_items to service_role;

create index if not exists teacher_question_pdf_extractions_teacher_idx
  on public.teacher_question_pdf_extractions(teacher_id, completed_at desc);
create index if not exists teacher_question_batches_teacher_idx
  on public.teacher_question_batches(teacher_id, submitted_at desc);
create index if not exists teacher_question_batches_status_idx
  on public.teacher_question_batches(status, submitted_at desc);
create index if not exists teacher_question_batch_items_question_idx
  on public.teacher_question_batch_items(question_id, created_at desc);

create or replace function private.reject_teacher_question_batch_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'teacher_question_batch_records_are_append_only';
end;
$function$;

revoke all on function private.reject_teacher_question_batch_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_teacher_question_pdf_extractions_immutable
  on public.teacher_question_pdf_extractions;
create trigger trg_teacher_question_pdf_extractions_immutable
before update or delete on public.teacher_question_pdf_extractions
for each row execute function private.reject_teacher_question_batch_mutation();

drop trigger if exists trg_teacher_question_batches_immutable
  on public.teacher_question_batches;
create trigger trg_teacher_question_batches_immutable
before update or delete on public.teacher_question_batches
for each row execute function private.reject_teacher_question_batch_mutation();

drop trigger if exists trg_teacher_question_batch_items_immutable
  on public.teacher_question_batch_items;
create trigger trg_teacher_question_batch_items_immutable
before update or delete on public.teacher_question_batch_items
for each row execute function private.reject_teacher_question_batch_mutation();

-- ---------------------------------------------------------------------------
-- 3. Extend the protected teacher-question workflow with in_review
-- ---------------------------------------------------------------------------

alter table public.questions
  drop constraint if exists questions_authority_invariants_check;

alter table public.questions
  add constraint questions_authority_invariants_check check (
    (
      content_origin = 'brain_heist'
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
      content_origin = 'teacher'
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

-- ---------------------------------------------------------------------------
-- 4. Atomic teacher submission boundary
-- ---------------------------------------------------------------------------

create or replace function public.rpc_teacher_submit_question_batch(
  p_extraction_id uuid,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_teacher public.teachers%rowtype;
  v_extraction public.teacher_question_pdf_extractions%rowtype;
  v_batch_id uuid;
  v_item jsonb;
  v_taxonomy jsonb;
  v_options jsonb;
  v_question_id uuid;
  v_question_hash text;
  v_fingerprint text;
  v_subject text;
  v_topic text;
  v_difficulty text;
  v_question_type text;
  v_question_text text;
  v_correct_answer text;
  v_explanation text;
  v_grades smallint[];
  v_source_index integer;
  v_count integer;
  v_created integer := 0;
  v_ao text;
  v_cognitive text;
  v_confidence numeric;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select t.* into v_teacher
  from public.teachers t
  where t.user_id = v_actor;

  if v_teacher.id is null then
    raise exception using errcode = '42501', message = 'teacher_required';
  end if;

  if p_extraction_id is null then
    raise exception using errcode = '22023', message = 'pdf_extraction_required';
  end if;

  select e.* into v_extraction
  from public.teacher_question_pdf_extractions e
  where e.id = p_extraction_id
    and e.teacher_id = v_teacher.id
    and e.teacher_user_id = v_actor;

  if v_extraction.id is null then
    raise exception using errcode = '42501', message = 'teacher_pdf_extraction_access_denied';
  end if;

  if exists (
    select 1 from public.teacher_question_batches b
    where b.extraction_id = p_extraction_id
  ) then
    raise exception using errcode = '23505', message = 'teacher_question_batch_already_submitted';
  end if;

  if jsonb_typeof(p_questions) <> 'array' then
    raise exception using errcode = '22023', message = 'questions_array_required';
  end if;

  v_count := jsonb_array_length(p_questions);
  if v_count < 1 or v_count > 50 then
    raise exception using errcode = '22023', message = 'question_batch_requires_1_to_50_questions';
  end if;

  -- Create the immutable batch first. The whole RPC is one transaction, so any
  -- invalid item rolls back both the batch and every inserted question.
  insert into public.teacher_question_batches (
    teacher_id, teacher_user_id, school_id, extraction_id,
    submitted_question_count, created_question_count, duplicate_question_count
  ) values (
    v_teacher.id, v_actor, v_extraction.school_id, v_extraction.id,
    v_count, 0, v_count
  ) returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_questions)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = 'question_batch_item_object_required';
    end if;

    v_source_index := coalesce((v_item ->> 'source_index')::integer, 0);
    v_subject := trim(coalesce(v_item ->> 'subject', ''));
    v_topic := coalesce(nullif(trim(v_item ->> 'topic'), ''), 'General');
    v_difficulty := lower(trim(coalesce(v_item ->> 'difficulty', '')));
    v_question_type := lower(trim(coalesce(v_item ->> 'question_type', '')));
    v_question_text := trim(coalesce(v_item ->> 'question_text', ''));
    v_correct_answer := trim(coalesce(v_item ->> 'correct_answer', ''));
    v_explanation := trim(coalesce(v_item ->> 'explanation', ''));
    v_options := coalesce(v_item -> 'options', '[]'::jsonb);
    v_taxonomy := v_item -> 'taxonomy_proposal';
    v_confidence := coalesce((v_item ->> 'extraction_confidence')::numeric, -1);

    if v_source_index < 1 or v_source_index > 50
       or v_subject not in (
         'Maths', 'Science', 'Biology', 'Chemistry', 'Physics', 'English',
         'Russian Language', 'Kyrgyz Language', 'German Language', 'Geography',
         'Global Perspective', 'Travel & Tourism', 'ICT'
       )
       or length(v_topic) not between 1 and 160
       or v_difficulty not in ('easy', 'medium', 'hard')
       or v_question_type not in ('multiple_choice', 'true_false', 'short_answer')
       or length(v_question_text) not between 5 and 4000
       or length(v_correct_answer) not between 1 and 2000
       or length(v_explanation) > 5000
       or v_confidence < 0 or v_confidence > 1 then
      raise exception using errcode = '22023', message = format('invalid_question_batch_item_%s', v_source_index);
    end if;

    if exists (
      select 1
      from public.class_teacher_assignments cta
      where cta.teacher_user_id = v_actor
        and cta.active is distinct from false
    ) and not exists (
      select 1
      from public.class_teacher_assignments cta
      where cta.teacher_user_id = v_actor
        and cta.active is distinct from false
        and private.teacher_assignment_subject_key(cta.subject)
          = private.teacher_assignment_subject_key(v_subject)
    ) then
      raise exception using errcode = '42501', message = format('teacher_subject_not_assigned_%s', v_source_index);
    end if;

    if jsonb_typeof(v_item -> 'eligible_grade_levels') <> 'array' then
      raise exception using errcode = '22023', message = format('grade_levels_required_at_item_%s', v_source_index);
    end if;
    select coalesce(array_agg(distinct value::smallint order by value::smallint), '{}'::smallint[])
      into v_grades
    from jsonb_array_elements_text(v_item -> 'eligible_grade_levels') grade(value)
    where value ~ '^[0-9]{1,2}$' and value::integer between 1 and 12;
    if cardinality(v_grades) < 1 then
      raise exception using errcode = '22023', message = format('grade_levels_required_at_item_%s', v_source_index);
    end if;

    if v_question_type = 'multiple_choice' then
      if jsonb_typeof(v_options) <> 'array'
         or jsonb_array_length(v_options) < 2
         or jsonb_array_length(v_options) > 6
         or exists (select 1 from jsonb_array_elements(v_options) option where jsonb_typeof(option) <> 'string')
         or (select count(*) from jsonb_array_elements_text(v_options))
            <> (select count(distinct lower(trim(value))) from jsonb_array_elements_text(v_options) option(value))
         or not exists (
           select 1 from jsonb_array_elements_text(v_options) option(value)
           where lower(trim(value)) = lower(v_correct_answer)
         ) then
        raise exception using errcode = '22023', message = format('invalid_multiple_choice_at_item_%s', v_source_index);
      end if;
    elsif v_question_type = 'true_false' then
      v_options := '["True", "False"]'::jsonb;
      if lower(v_correct_answer) not in ('true', 'false') then
        raise exception using errcode = '22023', message = format('invalid_true_false_at_item_%s', v_source_index);
      end if;
    else
      v_options := '[]'::jsonb;
    end if;

    if jsonb_typeof(v_taxonomy) <> 'object'
       or length(trim(coalesce(v_taxonomy ->> 'primary_skill_name', ''))) not between 3 and 160
       or length(trim(coalesce(v_taxonomy ->> 'atomic_subskill_name', ''))) not between 3 and 200
       or length(trim(coalesce(v_taxonomy ->> 'evidence_statement', ''))) not between 20 and 500
       or coalesce((v_taxonomy ->> 'confidence_score')::numeric, -1) < 0
       or coalesce((v_taxonomy ->> 'confidence_score')::numeric, -1) > 1 then
      raise exception using errcode = '22023', message = format('taxonomy_proposal_required_at_item_%s', v_source_index);
    end if;

    v_ao := upper(trim(coalesce(v_taxonomy ->> 'assessment_process_code', '')));
    v_cognitive := lower(trim(coalesce(v_taxonomy ->> 'cognitive_process', '')));
    if not (
      (v_ao = 'AO1' and v_cognitive in ('remember', 'understand'))
      or (v_ao = 'AO2' and v_cognitive = 'apply')
      or (v_ao = 'AO3' and v_cognitive = 'analyze')
      or (v_ao = 'AO4' and v_cognitive = 'evaluate')
    ) then
      raise exception using errcode = '22023', message = format('invalid_assessment_process_at_item_%s', v_source_index);
    end if;

    v_fingerprint := private.question_content_fingerprint(
      v_subject, v_topic, v_question_text, v_options, v_correct_answer, v_question_type
    );
    v_question_id := null;
    v_question_hash := null;

    insert into public.questions (
      teacher_id, subject, subject_id, topic, topic_name, difficulty,
      question_text, question_type, options, correct_answer, explanation,
      hints, time_limit, points, tags, grade_level, eligible_grade_levels,
      content_origin, verification_status, analytics_eligible, is_public,
      curriculum_review_status
    ) values (
      v_teacher.id,
      v_subject,
      nullif(trim(v_item ->> 'subject_id'), ''),
      v_topic,
      v_topic,
      v_difficulty,
      v_question_text,
      v_question_type,
      v_options,
      v_correct_answer,
      nullif(v_explanation, ''),
      '{}'::text[],
      greatest(10, least(coalesce((v_item ->> 'time_limit')::integer, 30), 1800)),
      greatest(1, least(coalesce((v_item ->> 'points')::integer,
        case v_difficulty when 'hard' then 20 when 'medium' then 15 else 10 end), 30)),
      array[
        trim(v_taxonomy ->> 'primary_skill_name'),
        trim(v_taxonomy ->> 'atomic_subskill_name'),
        v_ao
      ]::text[],
      array_to_string(v_grades, ','),
      v_grades,
      'teacher',
      'in_review',
      false,
      false,
      'in_review'
    ) on conflict (teacher_id, content_fingerprint)
      where content_origin = 'teacher' and is_active
      do nothing
    returning id, current_content_hash into v_question_id, v_question_hash;

    if v_question_id is not null then
      v_created := v_created + 1;
    else
      select q.id, q.current_content_hash
        into v_question_id, v_question_hash
      from public.questions q
      where q.teacher_id = v_teacher.id
        and q.content_origin = 'teacher'
        and q.is_active
        and q.content_fingerprint = v_fingerprint
      order by q.created_at
      limit 1;
    end if;

    if v_question_id is null or v_question_hash is null then
      raise exception using errcode = '23514', message = format('question_batch_item_not_persisted_%s', v_source_index);
    end if;

    insert into public.teacher_question_batch_items (
      batch_id, question_id, source_index, source_page,
      submitted_content_hash, question_snapshot, taxonomy_proposal,
      extraction_confidence, needs_human_attention
    ) values (
      v_batch_id,
      v_question_id,
      v_source_index,
      case when coalesce((v_item ->> 'source_page')::integer, 0) between 1 and 60
        then (v_item ->> 'source_page')::integer else null end,
      v_question_hash,
      jsonb_build_object(
        'subject', v_subject,
        'topic', v_topic,
        'difficulty', v_difficulty,
        'question_type', v_question_type,
        'question_text', v_question_text,
        'options', v_options,
        'correct_answer', v_correct_answer,
        'explanation', v_explanation,
        'eligible_grade_levels', to_jsonb(v_grades),
        'content_hash', v_question_hash
      ),
      v_taxonomy,
      v_confidence,
      coalesce((v_item ->> 'needs_human_attention')::boolean, true)
    );
  end loop;

  update public.teacher_question_batches
  set created_question_count = v_created,
      duplicate_question_count = v_count - v_created
  where id = v_batch_id;

  -- A narrowly scoped trigger below permits only this initial counter
  -- finalization. The batch and its evidence remain immutable afterward.

  return jsonb_build_object(
    'success', true,
    'batchId', v_batch_id,
    'status', 'in_review',
    'submitted', v_count,
    'created', v_created,
    'duplicatesSkipped', v_count - v_created,
    'academicProfileEligible', false
  );
end;
$function$;

-- The batch table is immutable, so final counters are recorded by a narrowly
-- scoped BEFORE UPDATE trigger that only allows the submit RPC's same-transaction
-- zero-to-final counter transition. Every later update remains rejected.
create or replace function private.finalize_teacher_question_batch_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.created_question_count = 0
     and old.duplicate_question_count = old.submitted_question_count
     and new.teacher_id = old.teacher_id
     and new.teacher_user_id = old.teacher_user_id
     and new.school_id is not distinct from old.school_id
     and new.extraction_id = old.extraction_id
     and new.status = old.status
     and new.submitted_question_count = old.submitted_question_count
     and new.created_question_count between 0 and old.submitted_question_count
     and new.duplicate_question_count = old.submitted_question_count - new.created_question_count
     and new.submitted_at = old.submitted_at then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'teacher_question_batch_records_are_append_only';
end;
$function$;

revoke all on function private.finalize_teacher_question_batch_counts()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_teacher_question_batches_immutable
  on public.teacher_question_batches;
create trigger trg_teacher_question_batches_immutable
before update or delete on public.teacher_question_batches
for each row execute function private.finalize_teacher_question_batch_counts();

revoke all on function public.rpc_teacher_submit_question_batch(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_teacher_submit_question_batch(uuid, jsonb)
  to authenticated, service_role;

comment on table public.teacher_question_pdf_extractions is
  'Immutable server-authenticated provenance for private teacher PDF extraction results.';
comment on table public.teacher_question_batches is
  'Immutable teacher submissions awaiting human content and taxonomy governance.';
comment on table public.teacher_question_batch_items is
  'Frozen question snapshots and AI-assisted taxonomy proposals; never official evidence by themselves.';
comment on function public.rpc_teacher_submit_question_batch(uuid, jsonb) is
  'Atomic teacher-only submission of a reviewed PDF extraction. Creates private in-review questions that remain Academic Profile ineligible.';

-- ---------------------------------------------------------------------------
-- 5. Add exact in-review visibility to the existing superadmin content vault
-- ---------------------------------------------------------------------------

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
    raise exception using errcode = '42501', message = 'platform_superadmin_access_required';
  end if;

  if v_pool not in ('verified', 'teacher', 'archive') then
    raise exception using errcode = '22023', message = 'invalid_question_pool';
  end if;

  if v_status not in ('all', 'active', 'inactive', 'visual', 'needs_attention', 'high_usage', 'in_review') then
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
      submission.submission_item_id,
      submission.submission_batch_id,
      submission.submission_status,
      submission.submitted_at,
      submission.source_page,
      submission.taxonomy_proposal,
      submission.extraction_confidence,
      submission.needs_human_attention as submission_needs_human_attention,
      submission.submitted_content_hash,
      submission.source_file_name,
      submission.extraction_model,
      case
        when q.content_origin = 'brain_heist' and q.verification_status = 'verified'
          and q.current_content_hash is not null
          and q.verified_content_hash is not null
          and q.current_content_hash = q.verified_content_hash then 'sealed'
        when q.content_origin = 'brain_heist' and q.verification_status = 'verified' then 'drift'
        when q.content_origin = 'teacher' and q.verification_status = 'in_review' then 'review'
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
          q.verification_status = 'in_review'
          or submission.submission_item_id is not null and submission.submitted_content_hash is distinct from q.current_content_hash
          or t.id is null
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
    left join lateral (
      select
        i.id as submission_item_id,
        b.id as submission_batch_id,
        b.status as submission_status,
        b.submitted_at,
        i.source_page,
        i.taxonomy_proposal,
        i.extraction_confidence,
        i.needs_human_attention,
        i.submitted_content_hash,
        e.source_file_name,
        e.extraction_model
      from public.teacher_question_batch_items i
      join public.teacher_question_batches b on b.id = i.batch_id
      join public.teacher_question_pdf_extractions e on e.id = b.extraction_id
      where i.question_id = q.id
      order by b.submitted_at desc, i.created_at desc, i.id desc
      limit 1
    ) submission on true
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
          b.content_version, b.curriculum_skill, b.curriculum_objective,
          b.taxonomy_proposal ->> 'primary_skill_name',
          b.taxonomy_proposal ->> 'atomic_subskill_name',
          b.taxonomy_proposal ->> 'assessment_process_code'
        ) ilike '%' || v_search || '%'
      )
      and (
        v_status = 'all'
        or (v_status = 'active' and b.is_active)
        or (v_status = 'inactive' and not b.is_active)
        or (v_status = 'visual' and b.image_url is not null)
        or (v_status = 'needs_attention' and b.needs_attention)
        or (v_status = 'high_usage' and coalesce(b.times_answered, 0) >= 20)
        or (v_status = 'in_review' and b.verification_status = 'in_review')
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
        'needsAttention', count(*) filter (where needs_attention),
        'inReviewQuestions', count(*) filter (where pool_key = 'teacher' and verification_status = 'in_review')
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
            ) else null end,
            'submission', case when b.submission_item_id is not null then jsonb_build_object(
              'itemId', b.submission_item_id,
              'batchId', b.submission_batch_id,
              'status', b.submission_status,
              'submittedAt', b.submitted_at,
              'sourcePage', b.source_page,
              'sourceFileName', b.source_file_name,
              'extractionModel', b.extraction_model,
              'extractionConfidence', b.extraction_confidence,
              'needsHumanAttention', b.submission_needs_human_attention,
              'sourceDrift', b.submitted_content_hash is distinct from b.current_content_hash,
              'taxonomyProposal', b.taxonomy_proposal
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
