-- Schema v2 importer for immutable, checksum-addressed question visuals.
--
-- Visual files are reviewed in Git, deployed through the production CDN, and
-- verified byte-for-byte by the CLI before this service-role-only RPC runs.

alter table public.questions add column if not exists image_alt_text text;

alter table public.questions drop constraint if exists questions_image_alt_text_check;
alter table public.questions add constraint questions_image_alt_text_check check (
  image_alt_text is null or length(trim(image_alt_text)) between 20 and 240
);

alter table public.verified_question_import_releases
  drop constraint if exists verified_question_import_releases_schema_version_check;
alter table public.verified_question_import_releases
  add constraint verified_question_import_releases_schema_version_check
    check (schema_version in (1, 2));
alter table public.verified_question_import_releases
  add column if not exists asset_count integer not null default 0 check (asset_count >= 0),
  add column if not exists visual_question_count integer not null default 0 check (visual_question_count >= 0);

create table if not exists public.verified_question_visual_assets (
  id uuid primary key,
  release_id uuid not null references public.verified_question_import_releases(id) on delete restrict,
  asset_id text not null,
  source_file text not null,
  public_path text not null,
  public_url text not null,
  mime_type text not null,
  sha256 text not null,
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  alt_text text not null check (length(trim(alt_text)) between 20 and 240),
  license text not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (release_id, asset_id),
  unique (release_id, sha256),
  check (asset_id ~ '^[a-z0-9][a-z0-9-]{5,100}$'),
  check (mime_type = 'image/svg+xml'),
  check (sha256 ~ '^[0-9a-f]{64}$'),
  check (public_path ~ '^/question-assets/[0-9-]+/[a-z0-9-]+\.[0-9a-f]{12}\.svg$'),
  check (public_url = 'https://www.brainsheist.com' || public_path),
  check (source_file = 'public' || public_path),
  check (position(substr(sha256, 1, 12) in public_path) > 0),
  check (license = 'Brains Heist original educational artwork'),
  check (source = 'Brains Heist Visual System')
);

create table if not exists public.verified_question_visual_links (
  question_id uuid primary key references public.questions(id) on delete restrict,
  visual_asset_id uuid not null references public.verified_question_visual_assets(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.verified_question_visual_assets enable row level security;
alter table public.verified_question_visual_links enable row level security;
revoke all on table public.verified_question_visual_assets from public, anon, authenticated, service_role;
revoke all on table public.verified_question_visual_links from public, anon, authenticated, service_role;
grant select, insert on table public.verified_question_visual_assets to service_role;
grant select, insert on table public.verified_question_visual_links to service_role;

create index if not exists verified_question_visual_assets_release_idx
  on public.verified_question_visual_assets(release_id);
create index if not exists verified_question_visual_links_asset_idx
  on public.verified_question_visual_links(visual_asset_id);

create or replace function public.rpc_import_verified_question_package_v2(
  p_package jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security invoker
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
  v_asset jsonb;
  v_question_id uuid;
  v_asset_uuid uuid;
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
  v_visual_asset_id text;
  v_image_url text;
  v_image_alt_text text;
  v_grade smallint;
  v_question_count integer;
  v_asset_count integer;
  v_visual_question_count integer := 0;
  v_mapping_count integer := 0;
  v_subject_counts jsonb;
begin
  if p_package is null or jsonb_typeof(p_package) <> 'object' then
    raise exception using errcode = '22023', message = 'verified_question_package_object_required';
  end if;
  if coalesce((p_package->>'schemaVersion')::integer, 0) <> 2 then
    raise exception using errcode = '22023', message = 'verified_question_visual_package_schema_2_required';
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
     or length(v_authority) not between 3 and 200
     or p_package->>'assetBaseUrl' <> 'https://www.brainsheist.com' then
    raise exception using errcode = '22023', message = 'invalid_verified_question_visual_package_identity';
  end if;
  if jsonb_typeof(p_package->'questions') <> 'array'
     or jsonb_typeof(p_package->'assets') <> 'array' then
    raise exception using errcode = '22023', message = 'verified_question_visual_package_arrays_required';
  end if;
  v_question_count := jsonb_array_length(p_package->'questions');
  v_asset_count := jsonb_array_length(p_package->'assets');
  if v_question_count < 1 or v_question_count > 500 then
    raise exception using errcode = '22023', message = 'verified_question_package_requires_1_to_500_questions';
  end if;
  if v_asset_count < 1 or v_asset_count > 100 then
    raise exception using errcode = '22023', message = 'verified_question_visual_package_requires_1_to_100_assets';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_package->'questions') q
    group by trim(q->>'externalId') having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'duplicate_external_id_inside_verified_question_package';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_package->'assets') a
    group by trim(a->>'assetId') having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'duplicate_asset_id_inside_verified_question_package';
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

  for v_asset in select value from jsonb_array_elements(p_package->'assets') loop
    if trim(v_asset->>'assetId') !~ '^[a-z0-9][a-z0-9-]{5,100}$'
       or trim(v_asset->>'mimeType') <> 'image/svg+xml'
       or trim(v_asset->>'sha256') !~ '^[0-9a-f]{64}$'
       or coalesce((v_asset->>'width')::integer, 0) <> 640
       or coalesce((v_asset->>'height')::integer, 0) <> 360
       or length(trim(v_asset->>'altText')) not between 20 and 240
       or trim(v_asset->>'license') <> 'Brains Heist original educational artwork'
       or trim(v_asset->>'source') <> 'Brains Heist Visual System'
       or trim(v_asset->>'sourceFile') !~ '^public/question-assets/2026-7-0/[a-z0-9-]+\.[0-9a-f]{12}\.svg$'
       or trim(v_asset->>'publicPath') <> '/' || substr(trim(v_asset->>'sourceFile'), 8)
       or trim(v_asset->>'publicUrl') <> 'https://www.brainsheist.com' || trim(v_asset->>'publicPath')
       or position(substr(trim(v_asset->>'sha256'), 1, 12) in trim(v_asset->>'publicPath')) = 0 then
      raise exception using errcode = '22023', message = 'invalid_verified_visual_asset:' || coalesce(v_asset->>'assetId', 'unknown');
    end if;
  end loop;

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
      'assetCount', v_existing_release.asset_count,
      'visualQuestionCount', v_existing_release.visual_question_count,
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

  for v_question in select value from jsonb_array_elements(p_package->'questions') loop
    v_external_id := trim(v_question->>'externalId');
    v_question_type := trim(v_question->>'questionType');
    v_correct_answer := v_question->>'correctAnswer';
    v_options := coalesce(v_question->'options', '[]'::jsonb);
    v_grade := (v_question->>'grade')::smallint;
    v_visual_asset_id := nullif(trim(v_question->>'visualAssetId'), '');
    v_image_url := nullif(trim(v_question->>'imageUrl'), '');
    v_image_alt_text := nullif(trim(v_question->>'imageAltText'), '');

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
         or exists (select 1 from jsonb_array_elements(v_options) value where jsonb_typeof(value) <> 'string')
         or exists (
           select 1 from (
             select lower(trim(value #>> '{}')) option_text, count(*)
             from jsonb_array_elements(v_options)
             group by lower(trim(value #>> '{}'))
             having count(*) > 1 or lower(trim(value #>> '{}')) = ''
           ) duplicates
         )
         or not exists (select 1 from jsonb_array_elements(v_options) value where value #>> '{}' = v_correct_answer) then
        raise exception using errcode = '22023', message = 'invalid_scored_options:' || v_external_id;
      end if;
    elsif jsonb_array_length(v_options) <> 0 then
      raise exception using errcode = '22023', message = 'short_answer_options_must_be_empty:' || v_external_id;
    end if;

    if v_visual_asset_id is null then
      if v_image_url is not null or v_image_alt_text is not null or nullif(trim(v_question->>'visualAssetSha256'), '') is not null then
        raise exception using errcode = '22023', message = 'unlinked_visual_metadata:' || v_external_id;
      end if;
    else
      select value into v_asset from jsonb_array_elements(p_package->'assets')
      where trim(value->>'assetId') = v_visual_asset_id;
      if v_asset is null
         or v_image_url <> trim(v_asset->>'publicUrl')
         or v_image_alt_text <> trim(v_asset->>'altText')
         or trim(v_question->>'visualAssetSha256') <> trim(v_asset->>'sha256') then
        raise exception using errcode = '23503', message = 'visual_asset_link_mismatch:' || v_external_id;
      end if;
      v_visual_question_count := v_visual_question_count + 1;
    end if;

    select * into v_subject from public.academic_subjects
    where code = trim(v_question->>'subjectCode') and is_active;
    if not found then raise exception using errcode = '23503', message = 'academic_subject_not_found:' || v_external_id; end if;
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
      select 1 from public.questions q where q.content_origin = 'brain_heist'
        and q.is_active and q.content_fingerprint = v_fingerprint
    ) then
      raise exception using errcode = '23505', message = 'active_verified_question_duplicate:' || v_external_id;
    end if;

    for v_mapping in select value from jsonb_array_elements(v_question->'mappings') loop
      select cs.* into v_scope from public.curriculum_scopes cs
      where cs.framework_version_id = v_framework_version.id
        and cs.academic_subject_id = v_subject.id and cs.code = trim(v_mapping->>'scopeCode');
      if not found then raise exception using errcode = '23503', message = 'curriculum_scope_not_found:' || v_external_id; end if;
      select o.* into v_objective from public.curriculum_objectives o
      where o.framework_version_id = v_framework_version.id
        and o.curriculum_scope_id = v_scope.id
        and o.code = trim(v_mapping->>'objectiveCode') and o.is_assessable;
      if not found then raise exception using errcode = '23503', message = 'assessable_curriculum_objective_not_found:' || v_external_id; end if;
      if (trim(split_part(v_mapping->>'scopeCode', '-grade-', 2)))::smallint <> v_grade then
        raise exception using errcode = '22023', message = 'question_grade_scope_mismatch:' || v_external_id;
      end if;
      v_mapping_count := v_mapping_count + 1;
    end loop;
  end loop;

  if v_visual_question_count < 1 then
    raise exception using errcode = '22023', message = 'verified_question_visual_package_requires_visual_questions';
  end if;
  if p_dry_run then
    return jsonb_build_object(
      'success', true, 'dryRun', true, 'alreadyImported', false,
      'packageHash', v_package_hash, 'questionCount', v_question_count,
      'assetCount', v_asset_count, 'visualQuestionCount', v_visual_question_count,
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
    'verified-question-package-schema-v2', 'completed',
    'Validated Brains Heist package with immutable checksum-addressed visual assets.',
    'Brains Heist Content Quality', now(), now()
  ) returning id into v_batch_id;

  for v_question in select value from jsonb_array_elements(p_package->'questions') loop
    v_external_id := trim(v_question->>'externalId');
    v_question_type := trim(v_question->>'questionType');
    v_correct_answer := v_question->>'correctAnswer';
    v_options := coalesce(v_question->'options', '[]'::jsonb);
    v_grade := (v_question->>'grade')::smallint;
    v_image_url := nullif(trim(v_question->>'imageUrl'), '');
    v_image_alt_text := nullif(trim(v_question->>'imageAltText'), '');
    select * into v_subject from public.academic_subjects where code = trim(v_question->>'subjectCode') and is_active;
    v_question_id := (
      substr(md5('verified-question:' || v_external_id), 1, 8) || '-' ||
      substr(md5('verified-question:' || v_external_id), 9, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 13, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 17, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 21, 12)
    )::uuid;
    v_question_hash := private.question_content_hash(
      v_question_id, v_question->>'questionText', v_options, v_correct_answer,
      v_question->>'explanation', v_image_url, v_question_type
    );

    insert into public.questions(
      id, teacher_id, subject, topic, topic_name, difficulty, question_text,
      image_url, image_alt_text, question_type, options, correct_answer,
      explanation, hints, time_limit, points, tags, grade_level, grade, lang,
      is_public, is_active, academic_subject_id, curriculum_strand,
      curriculum_skill, curriculum_subskill, curriculum_objective,
      eligible_grade_levels, curriculum_review_status, content_origin,
      verification_status, analytics_eligible, verified_at,
      verified_by_authority, verified_content_hash, content_version,
      content_revision, verified_external_id
    ) values (
      v_question_id, null, v_subject.name, trim(v_question->>'topic'), trim(v_question->>'topic'),
      trim(v_question->>'difficulty'), v_question->>'questionText', v_image_url,
      v_image_alt_text, v_question_type, v_options, v_correct_answer,
      v_question->>'explanation',
      array(select jsonb_array_elements_text(coalesce(v_question->'hints', '[]'::jsonb))),
      (v_question->>'timeLimit')::integer, (v_question->>'points')::integer,
      array(select jsonb_array_elements_text(coalesce(v_question->'tags', '[]'::jsonb))),
      'Grade ' || v_grade::text, v_grade,
      coalesce(nullif(trim(v_question->>'language'), ''), 'en'), true, true,
      v_subject.id, trim(v_question#>>'{curriculum,strand}'),
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
      jsonb_strip_nulls(jsonb_build_object(
        'verifiedExternalId', v_external_id, 'packageId', v_package_id,
        'packageVersion', v_package_version, 'schemaVersion', 2,
        'eligibleGrades', jsonb_build_array(v_grade),
        'visualAssetId', nullif(trim(v_question->>'visualAssetId'), ''),
        'visualAssetSha256', nullif(trim(v_question->>'visualAssetSha256'), '')
      )), true
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
        jsonb_strip_nulls(jsonb_build_object(
          'packageId', v_package_id, 'packageVersion', v_package_version,
          'verifiedExternalId', v_external_id, 'externalAuthorityClaimed', false,
          'visualAssetId', nullif(trim(v_question->>'visualAssetId'), '')
        )),
        v_question_hash, v_framework_version.content_hash,
        'Brains Heist Content Quality', v_authority, now(), now()
      );
    end loop;
  end loop;

  insert into public.verified_question_import_releases(
    package_id, package_version, schema_version, content_version,
    framework_version_id, package_hash, question_count, subject_counts,
    release_notes, imported_by_authority, asset_count, visual_question_count
  ) values (
    v_package_id, v_package_version, 2, v_content_version,
    v_framework_version.id, v_package_hash, v_question_count, v_subject_counts,
    nullif(trim(p_package->>'releaseNotes'), ''), v_authority,
    v_asset_count, v_visual_question_count
  ) returning * into v_existing_release;

  for v_asset in select value from jsonb_array_elements(p_package->'assets') loop
    v_asset_uuid := (
      substr(md5('verified-question-asset:' || v_package_id || ':' || v_package_version || ':' || trim(v_asset->>'assetId')), 1, 8) || '-' ||
      substr(md5('verified-question-asset:' || v_package_id || ':' || v_package_version || ':' || trim(v_asset->>'assetId')), 9, 4) || '-' ||
      substr(md5('verified-question-asset:' || v_package_id || ':' || v_package_version || ':' || trim(v_asset->>'assetId')), 13, 4) || '-' ||
      substr(md5('verified-question-asset:' || v_package_id || ':' || v_package_version || ':' || trim(v_asset->>'assetId')), 17, 4) || '-' ||
      substr(md5('verified-question-asset:' || v_package_id || ':' || v_package_version || ':' || trim(v_asset->>'assetId')), 21, 12)
    )::uuid;
    insert into public.verified_question_visual_assets(
      id, release_id, asset_id, source_file, public_path, public_url,
      mime_type, sha256, width, height, alt_text, license, source
    ) values (
      v_asset_uuid, v_existing_release.id, trim(v_asset->>'assetId'),
      trim(v_asset->>'sourceFile'), trim(v_asset->>'publicPath'),
      trim(v_asset->>'publicUrl'), trim(v_asset->>'mimeType'),
      trim(v_asset->>'sha256'), (v_asset->>'width')::integer,
      (v_asset->>'height')::integer, trim(v_asset->>'altText'),
      trim(v_asset->>'license'), trim(v_asset->>'source')
    );
  end loop;

  for v_question in
    select value from jsonb_array_elements(p_package->'questions')
    where nullif(trim(value->>'visualAssetId'), '') is not null
  loop
    v_external_id := trim(v_question->>'externalId');
    v_question_id := (
      substr(md5('verified-question:' || v_external_id), 1, 8) || '-' ||
      substr(md5('verified-question:' || v_external_id), 9, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 13, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 17, 4) || '-' ||
      substr(md5('verified-question:' || v_external_id), 21, 12)
    )::uuid;
    select a.id into v_asset_uuid from public.verified_question_visual_assets a
    where a.release_id = v_existing_release.id
      and a.asset_id = trim(v_question->>'visualAssetId');
    insert into public.verified_question_visual_links(question_id, visual_asset_id)
    values (v_question_id, v_asset_uuid);
  end loop;

  return jsonb_build_object(
    'success', true, 'dryRun', false, 'alreadyImported', false,
    'releaseId', v_existing_release.id, 'packageHash', v_package_hash,
    'questionCount', v_question_count, 'assetCount', v_asset_count,
    'visualQuestionCount', v_visual_question_count, 'mappingCount', v_mapping_count,
    'subjectCounts', v_subject_counts, 'frameworkVersionId', v_framework_version.id
  );
end;
$function$;

revoke all on function public.rpc_import_verified_question_package_v2(jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.rpc_import_verified_question_package_v2(jsonb, boolean)
  to service_role;

comment on function public.rpc_import_verified_question_package_v2(jsonb, boolean) is
  'Service-role-only atomic importer for schema v2 Brains Heist packages with checksum-addressed visual assets.';
