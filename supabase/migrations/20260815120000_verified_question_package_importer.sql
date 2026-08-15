-- Atomic, versioned importer for Brains Heist Verified question packages.
--
-- The browser never receives this authority. Only service_role may execute the
-- import RPC, and every package is validated and committed in one transaction.

create extension if not exists pgcrypto with schema extensions;

-- Official content is owned by the platform authority, not by an individual
-- teacher. Legacy rows retain their teacher_id for historical provenance.
alter table public.questions alter column teacher_id drop not null;
alter table public.questions add column if not exists verified_external_id text;

create unique index if not exists questions_verified_external_id_uidx
  on public.questions(verified_external_id)
  where verified_external_id is not null;

create table if not exists public.verified_question_import_releases (
  id uuid primary key default gen_random_uuid(),
  package_id text not null,
  package_version text not null,
  schema_version integer not null,
  content_version text not null,
  framework_version_id uuid not null references public.curriculum_framework_versions(id) on delete restrict,
  package_hash text not null,
  question_count integer not null check (question_count > 0),
  subject_counts jsonb not null,
  release_notes text,
  imported_by_authority text not null,
  imported_at timestamptz not null default now(),
  unique (package_id, package_version),
  unique (package_hash),
  check (package_id ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  check (package_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$'),
  check (schema_version = 1),
  check (length(trim(content_version)) between 3 and 100),
  check (package_hash ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(subject_counts) = 'object'),
  check (length(trim(imported_by_authority)) between 3 and 200)
);

alter table public.verified_question_import_releases enable row level security;
revoke all on table public.verified_question_import_releases from public, anon, authenticated, service_role;
grant select, insert on table public.verified_question_import_releases to service_role;

create index if not exists verified_question_import_releases_imported_at_idx
  on public.verified_question_import_releases(imported_at desc);

create or replace function public.rpc_import_verified_question_package(
  p_package jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security invoker
-- A legacy tier-assignment trigger still resolves public.questions through the
-- caller search path. This is SECURITY INVOKER and service-role-only, so keeping
-- public explicitly fixed here does not create a privilege-escalation boundary.
set search_path = public, pg_temp
as $function$
declare
  v_package_id text;
  v_package_version text;
  v_content_version text;
  v_framework_code text;
  v_framework_version_code text;
  v_authority text;
  v_package_hash text;
  v_framework_version public.curriculum_framework_versions%rowtype;
  v_existing_release public.verified_question_import_releases%rowtype;
  v_batch_id uuid;
  v_question jsonb;
  v_mapping jsonb;
  v_question_id uuid;
  v_subject public.academic_subjects%rowtype;
  v_scope public.curriculum_scopes%rowtype;
  v_objective public.curriculum_objectives%rowtype;
  v_item_id uuid;
  v_question_hash text;
  v_fingerprint text;
  v_options jsonb;
  v_question_type text;
  v_correct_answer text;
  v_external_id text;
  v_grade smallint;
  v_question_count integer;
  v_mapping_count integer := 0;
  v_subject_counts jsonb;
begin
  if p_package is null or jsonb_typeof(p_package) <> 'object' then
    raise exception using errcode = '22023', message = 'verified_question_package_object_required';
  end if;
  if coalesce((p_package->>'schemaVersion')::integer, 0) <> 1 then
    raise exception using errcode = '22023', message = 'unsupported_verified_question_package_schema';
  end if;

  v_package_id := trim(p_package->>'packageId');
  v_package_version := trim(p_package->>'packageVersion');
  v_content_version := trim(p_package->>'contentVersion');
  v_framework_code := trim(p_package#>>'{curriculum,frameworkCode}');
  v_framework_version_code := trim(p_package#>>'{curriculum,versionCode}');
  v_authority := trim(p_package->>'authority');

  if v_package_id !~ '^[a-z0-9][a-z0-9._-]{2,119}$'
     or v_package_version !~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$'
     or length(v_content_version) not between 3 and 100
     or length(v_authority) not between 3 and 200 then
    raise exception using errcode = '22023', message = 'invalid_verified_question_package_identity';
  end if;
  if jsonb_typeof(p_package->'questions') <> 'array' then
    raise exception using errcode = '22023', message = 'verified_question_package_questions_array_required';
  end if;
  v_question_count := jsonb_array_length(p_package->'questions');
  if v_question_count < 1 or v_question_count > 500 then
    raise exception using errcode = '22023', message = 'verified_question_package_requires_1_to_500_questions';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_package->'questions') q
    group by trim(q->>'externalId') having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'duplicate_external_id_inside_verified_question_package';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_package->'questions') q
    group by lower(trim(q->>'subjectCode')), lower(trim(q->>'topic')),
      lower(regexp_replace(trim(q->>'questionText'), '\s+', ' ', 'g')),
      q->'options', lower(trim(q->>'correctAnswer')), lower(trim(q->>'questionType'))
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'duplicate_content_inside_verified_question_package';
  end if;

  v_package_hash := encode(extensions.digest(p_package::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext('verified-question-package:' || v_package_id || ':' || v_package_version));

  select * into v_existing_release
  from public.verified_question_import_releases r
  where r.package_id = v_package_id and r.package_version = v_package_version;
  if found then
    if v_existing_release.package_hash <> v_package_hash then
      raise exception using errcode = '23505', message = 'verified_question_package_version_hash_conflict';
    end if;
    return jsonb_build_object(
      'success', true, 'dryRun', p_dry_run, 'alreadyImported', true,
      'releaseId', v_existing_release.id, 'packageHash', v_package_hash,
      'questionCount', v_existing_release.question_count,
      'subjectCounts', v_existing_release.subject_counts
    );
  end if;

  select fv.* into v_framework_version
  from public.curriculum_framework_versions fv
  join public.curriculum_frameworks f on f.id = fv.framework_id
  where f.code = v_framework_code and f.is_active
    and fv.version_code = v_framework_version_code and fv.status = 'published';
  if not found then
    raise exception using errcode = '23503', message = 'published_curriculum_framework_version_not_found';
  end if;

  select coalesce(jsonb_object_agg(subject_code, subject_count), '{}'::jsonb)
  into v_subject_counts
  from (
    select q->>'subjectCode' subject_code, count(*) subject_count
    from jsonb_array_elements(p_package->'questions') q
    group by q->>'subjectCode'
  ) counts;

  -- Validate the complete package against live governed curriculum before any
  -- insert. A failing question aborts the entire function call.
  for v_question in select value from jsonb_array_elements(p_package->'questions') loop
    v_external_id := trim(v_question->>'externalId');
    v_question_type := trim(v_question->>'questionType');
    v_correct_answer := v_question->>'correctAnswer';
    v_options := coalesce(v_question->'options', '[]'::jsonb);
    v_grade := (v_question->>'grade')::smallint;

    if v_external_id !~ '^[a-z0-9][a-z0-9._-]{5,119}$'
       or nullif(trim(v_question->>'questionText'), '') is null
       or nullif(trim(v_correct_answer), '') is null
       or trim(v_question->>'difficulty') not in ('easy', 'medium', 'hard')
       or v_question_type not in ('multiple_choice', 'true_false', 'short_answer')
       or v_grade not between 1 and 12
       or coalesce((v_question->>'points')::integer, 0) not between 1 and 100
       or coalesce((v_question->>'timeLimit')::integer, 0) not between 10 and 600
       or nullif(trim(v_question->>'explanation'), '') is null then
      raise exception using errcode = '22023', message = 'invalid_verified_question:' || coalesce(v_external_id, 'unknown');
    end if;
    if jsonb_typeof(v_question->'mappings') <> 'array' or jsonb_array_length(v_question->'mappings') < 1 then
      raise exception using errcode = '22023', message = 'verified_question_mapping_required:' || v_external_id;
    end if;
    if v_question_type in ('multiple_choice', 'true_false') then
      if jsonb_typeof(v_options) <> 'array'
         or (v_question_type = 'multiple_choice' and jsonb_array_length(v_options) <> 4)
         or (v_question_type = 'true_false' and jsonb_array_length(v_options) <> 2)
         or exists (
           select 1 from jsonb_array_elements(v_options) option_value
           where jsonb_typeof(option_value) <> 'string'
         )
         or exists (
           select 1 from (
             select lower(trim(value #>> '{}')) option_text, count(*)
             from jsonb_array_elements(v_options)
             group by lower(trim(value #>> '{}'))
             having count(*) > 1 or lower(trim(value #>> '{}')) = ''
           ) duplicates
         )
         or not exists (
           select 1 from jsonb_array_elements(v_options) option_value
           where option_value #>> '{}' = v_correct_answer
         ) then
        raise exception using errcode = '22023', message = 'invalid_scored_options:' || v_external_id;
      end if;
    elsif jsonb_array_length(v_options) <> 0 then
      raise exception using errcode = '22023', message = 'short_answer_options_must_be_empty:' || v_external_id;
    end if;

    select * into v_subject from public.academic_subjects
    where code = trim(v_question->>'subjectCode') and is_active;
    if not found then
      raise exception using errcode = '23503', message = 'academic_subject_not_found:' || v_external_id;
    end if;
    if trim(v_question->>'subject') <> v_subject.name then
      raise exception using errcode = '22023', message = 'academic_subject_name_mismatch:' || v_external_id;
    end if;

    if exists (select 1 from public.questions where verified_external_id = v_external_id) then
      raise exception using errcode = '23505', message = 'verified_question_external_id_conflict:' || v_external_id;
    end if;

    v_question_id := (
      substr(md5('verified-question:' || v_external_id), 1, 8) || '-' ||
      substr(md5('verified-question:' || v_external_id), 9, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 13, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 17, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 21, 12)
    )::uuid;
    v_fingerprint := private.question_content_fingerprint(
      v_subject.name, trim(v_question->>'topic'), v_question->>'questionText',
      v_options, v_correct_answer, v_question_type
    );
    if exists (
      select 1 from public.questions q
      where q.content_origin = 'brain_heist' and q.is_active
        and q.content_fingerprint = v_fingerprint
    ) then
      raise exception using errcode = '23505', message = 'active_verified_question_duplicate:' || v_external_id;
    end if;

    for v_mapping in select value from jsonb_array_elements(v_question->'mappings') loop
      select cs.* into v_scope
      from public.curriculum_scopes cs
      where cs.framework_version_id = v_framework_version.id
        and cs.academic_subject_id = v_subject.id
        and cs.code = trim(v_mapping->>'scopeCode');
      if not found then
        raise exception using errcode = '23503', message = 'curriculum_scope_not_found:' || v_external_id;
      end if;
      select o.* into v_objective
      from public.curriculum_objectives o
      where o.framework_version_id = v_framework_version.id
        and o.curriculum_scope_id = v_scope.id
        and o.code = trim(v_mapping->>'objectiveCode')
        and o.is_assessable;
      if not found then
        raise exception using errcode = '23503', message = 'assessable_curriculum_objective_not_found:' || v_external_id;
      end if;
      if (trim(split_part(v_mapping->>'scopeCode', '-grade-', 2)))::smallint <> v_grade then
        raise exception using errcode = '22023', message = 'question_grade_scope_mismatch:' || v_external_id;
      end if;
      v_mapping_count := v_mapping_count + 1;
    end loop;
  end loop;

  if p_dry_run then
    return jsonb_build_object(
      'success', true, 'dryRun', true, 'alreadyImported', false,
      'packageHash', v_package_hash, 'questionCount', v_question_count,
      'mappingCount', v_mapping_count, 'subjectCounts', v_subject_counts,
      'frameworkVersionId', v_framework_version.id
    );
  end if;

  insert into public.curriculum_mapping_batches(
    school_id, name, source_type, mapping_method, source_version, source_hash,
    ruleset_version, status, notes, reviewed_by_authority, reviewed_at, completed_at
  ) values (
    null, left('Verified question package ' || v_package_id || ' ' || v_package_version, 200),
    'question_bank', 'imported', v_content_version, v_package_hash,
    'verified-question-package-schema-v1', 'completed',
    'Validated, versioned Brains Heist Verified question package.',
    'Brains Heist Content Quality', now(), now()
  ) returning id into v_batch_id;

  for v_question in select value from jsonb_array_elements(p_package->'questions') loop
    v_external_id := trim(v_question->>'externalId');
    v_question_type := trim(v_question->>'questionType');
    v_correct_answer := v_question->>'correctAnswer';
    v_options := coalesce(v_question->'options', '[]'::jsonb);
    v_grade := (v_question->>'grade')::smallint;
    select * into v_subject from public.academic_subjects
    where code = trim(v_question->>'subjectCode') and is_active;
    v_question_id := (
      substr(md5('verified-question:' || v_external_id), 1, 8) || '-' ||
      substr(md5('verified-question:' || v_external_id), 9, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 13, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 17, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 21, 12)
    )::uuid;
    v_question_hash := private.question_content_hash(
      v_question_id, v_question->>'questionText', v_options, v_correct_answer,
      v_question->>'explanation', null, v_question_type
    );

    insert into public.questions(
      id, teacher_id, subject, topic, topic_name, difficulty, question_text,
      question_type, options, correct_answer, explanation, hints, time_limit,
      points, tags, grade_level, grade, lang, is_public, is_active,
      academic_subject_id, curriculum_strand, curriculum_skill,
      curriculum_subskill, curriculum_objective, eligible_grade_levels,
      curriculum_review_status, content_origin, verification_status,
      analytics_eligible, verified_at, verified_by_authority,
      verified_content_hash, content_version, content_revision,
      verified_external_id
    ) values (
      v_question_id, null, v_subject.name, trim(v_question->>'topic'), trim(v_question->>'topic'),
      trim(v_question->>'difficulty'), v_question->>'questionText', v_question_type,
      v_options, v_correct_answer, v_question->>'explanation',
      array(select jsonb_array_elements_text(coalesce(v_question->'hints', '[]'::jsonb))),
      (v_question->>'timeLimit')::integer, (v_question->>'points')::integer,
      array(select jsonb_array_elements_text(coalesce(v_question->'tags', '[]'::jsonb))),
      'Grade ' || v_grade::text, v_grade, coalesce(nullif(trim(v_question->>'language'), ''), 'en'),
      true, true, v_subject.id, trim(v_question#>>'{curriculum,strand}'),
      trim(v_question#>>'{curriculum,skill}'), trim(v_question#>>'{curriculum,subskill}'),
      trim(v_question#>>'{curriculum,objective}'), array[v_grade]::smallint[],
      'approved', 'brain_heist', 'verified', true, now(), v_authority,
      v_question_hash, v_content_version, 1, v_external_id
    );

    insert into public.curriculum_assessment_items(
      source_type, school_id, source_record_id, source_item_key, source_version,
      academic_subject_id, grade_level, content_hash, source_metadata, is_active
    ) values (
      'question_bank', null, v_question_id::text, 'question', v_content_version,
      v_subject.id, v_grade::text, v_question_hash,
      jsonb_build_object(
        'verifiedExternalId', v_external_id, 'packageId', v_package_id,
        'packageVersion', v_package_version, 'schemaVersion', 1,
        'eligibleGrades', jsonb_build_array(v_grade)
      ), true
    ) returning id into v_item_id;

    for v_mapping in select value from jsonb_array_elements(v_question->'mappings') loop
      select cs.* into v_scope from public.curriculum_scopes cs
      where cs.framework_version_id = v_framework_version.id
        and cs.academic_subject_id = v_subject.id and cs.code = trim(v_mapping->>'scopeCode');
      select o.* into v_objective from public.curriculum_objectives o
      where o.framework_version_id = v_framework_version.id
        and o.curriculum_scope_id = v_scope.id and o.code = trim(v_mapping->>'objectiveCode');
      insert into public.curriculum_item_objective_mappings(
        assessment_item_id, curriculum_objective_id, framework_version_id,
        curriculum_scope_id, academic_subject_id, batch_id, mapping_role,
        mapping_method, status, confidence_score, rationale, provenance,
        item_content_hash, curriculum_version_content_hash,
        reviewed_by_authority, approved_by_authority, reviewed_at, approved_at
      ) values (
        v_item_id, v_objective.id, v_framework_version.id, v_scope.id,
        v_subject.id, v_batch_id, 'primary', 'imported', 'approved', 1.0000,
        'Direct package mapping reviewed against the stated Brains Heist original objective.',
        jsonb_build_object(
          'packageId', v_package_id, 'packageVersion', v_package_version,
          'verifiedExternalId', v_external_id, 'externalAuthorityClaimed', false
        ),
        v_question_hash, v_framework_version.content_hash,
        'Brains Heist Content Quality', v_authority, now(), now()
      );
    end loop;
  end loop;

  insert into public.verified_question_import_releases(
    package_id, package_version, schema_version, content_version,
    framework_version_id, package_hash, question_count, subject_counts,
    release_notes, imported_by_authority
  ) values (
    v_package_id, v_package_version, 1, v_content_version,
    v_framework_version.id, v_package_hash, v_question_count, v_subject_counts,
    nullif(trim(p_package->>'releaseNotes'), ''), v_authority
  ) returning * into v_existing_release;

  return jsonb_build_object(
    'success', true, 'dryRun', false, 'alreadyImported', false,
    'releaseId', v_existing_release.id, 'packageHash', v_package_hash,
    'questionCount', v_question_count, 'mappingCount', v_mapping_count,
    'subjectCounts', v_subject_counts,
    'frameworkVersionId', v_framework_version.id
  );
end;
$function$;

revoke all on function public.rpc_import_verified_question_package(jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.rpc_import_verified_question_package(jsonb, boolean)
  to service_role;

comment on function public.rpc_import_verified_question_package(jsonb, boolean) is
  'Service-role-only atomic importer for immutable, versioned Brains Heist Verified question packages.';
