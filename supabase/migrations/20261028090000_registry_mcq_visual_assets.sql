-- Registry MCQ packages, schema v2: checksum-addressed SVG visuals.
--
-- Extends public.rpc_import_registry_verified_mcq_package so a Physics 0654
-- package can carry graphs. Schema v1 packages behave exactly as before.
-- A v2 package must declare assetBaseUrl, assetDirectory and assets; each
-- visual question must name its asset and repeat its public URL, alt text and
-- SHA-256. The image URL is part of the question content hash, so a changed
-- graph is a changed question. Optional visualSpec (the data the SVG was drawn
-- from) is stored in questions.visual_spec.
--
-- Applied by text replacement with exact-marker guards, following
-- 20260816121000_version_verified_question_visual_asset_paths.sql.

alter table public.registry_verified_question_import_releases
  drop constraint registry_verified_question_import_release_identity_check;
alter table public.registry_verified_question_import_releases
  add constraint registry_verified_question_import_release_identity_check check (
    package_id ~ '^[a-z0-9][a-z0-9._-]{2,119}$'
    and package_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$'
    and schema_version in (1, 2)
    and question_count between 1 and 500
    and taxonomy_count >= question_count
    and assessment_profile_count between 0 and question_count
    and package_hash ~ '^[0-9a-f]{64}$'
  );

do $migration$
declare
  v_def text;
  v_new text;
  v_marker text;
  v_with text;
  v_count integer;
  v_replacements text[][] := array[
    -- 1. accept schema v2
    array[
      $m$  if v_schema_version<>1 then$m$,
      $r$  if v_schema_version not in (1,2) then$r$
    ],
    -- 2. validate visuals before any write
    array[
      $m$  v_package_hash:=encode(extensions.digest(p_package::text,'sha256'),'hex');$m$,
      $r$  if v_schema_version=2 then
    if p_package->>'assetBaseUrl' is distinct from 'https://www.brainsheist.com'
       or coalesce(p_package->>'assetDirectory','') !~ '^[a-z0-9][a-z0-9-]{2,80}$'
       or jsonb_typeof(p_package->'assets') is distinct from 'array'
       or jsonb_array_length(p_package->'assets') not between 1 and 100 then
      raise exception using errcode='22023',
        message='invalid_registry_visual_package';
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_package->'assets') a
      group by trim(a->>'assetId') having count(*)>1
    ) then
      raise exception using errcode='23505',
        message='duplicate_asset_id_inside_registry_verified_package';
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_package->'assets') a
      where trim(a->>'assetId') !~ '^[a-z0-9][a-z0-9-]{5,100}$'
         or trim(a->>'mimeType') is distinct from 'image/svg+xml'
         or trim(a->>'sha256') !~ '^[0-9a-f]{64}$'
         or coalesce((a->>'width')::integer,0)<>640
         or coalesce((a->>'height')::integer,0)<>360
         or length(trim(coalesce(a->>'altText',''))) not between 20 and 240
         or trim(a->>'altText') ~* '(correct answer|the answer is)'
         or trim(a->>'license') is distinct from 'Brains Heist original educational artwork'
         or trim(a->>'source') is distinct from 'Brains Heist Visual System'
         or trim(a->>'sourceFile') !~ ('^public/question-assets/'||(p_package->>'assetDirectory')||'/[a-z0-9-]+\.[0-9a-f]{12}\.svg$')
         or trim(a->>'publicPath') is distinct from '/'||substr(trim(a->>'sourceFile'),8)
         or trim(a->>'publicUrl') is distinct from 'https://www.brainsheist.com'||trim(a->>'publicPath')
         or position(substr(trim(a->>'sha256'),1,12) in trim(a->>'publicPath'))=0
    ) then
      raise exception using errcode='22023',
        message='invalid_registry_visual_asset';
    end if;
    if exists(
      select 1
      from jsonb_array_elements(p_package->'questions') q
      left join lateral (
        select a.value as asset from jsonb_array_elements(p_package->'assets') a
        where trim(a.value->>'assetId')=trim(q.value->>'visualAssetId')
      ) x on true
      where (
        nullif(trim(q.value->>'visualAssetId'),'') is null
        and (nullif(trim(q.value->>'imageUrl'),'') is not null
             or nullif(trim(q.value->>'imageAltText'),'') is not null
             or q.value ? 'visualSpec')
      ) or (
        nullif(trim(q.value->>'visualAssetId'),'') is not null
        and (x.asset is null
             or trim(q.value->>'imageUrl') is distinct from trim(x.asset->>'publicUrl')
             or trim(q.value->>'imageAltText') is distinct from trim(x.asset->>'altText')
             or trim(q.value->>'visualAssetSha256') is distinct from trim(x.asset->>'sha256')
             or (q.value ? 'visualSpec' and (
               jsonb_typeof(q.value->'visualSpec') is distinct from 'object'
               or (q.value->'visualSpec'->>'type') not in ('graph','diagram','table')
               or trim(q.value->'visualSpec'->>'alt_text') is distinct from trim(x.asset->>'altText'))))
      )
    ) then
      raise exception using errcode='23503',
        message='registry_visual_asset_link_mismatch';
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_package->'assets') a
      where not exists(
        select 1 from jsonb_array_elements(p_package->'questions') q
        where trim(q->>'visualAssetId')=trim(a->>'assetId'))
    ) then
      raise exception using errcode='22023',
        message='unused_registry_visual_asset';
    end if;
  elsif exists(
    select 1 from jsonb_array_elements(p_package->'questions') q
    where q ? 'visualAssetId' or q ? 'imageUrl' or q ? 'imageAltText' or q ? 'visualSpec'
  ) then
    raise exception using errcode='22023',
      message='registry_visuals_require_schema_v2';
  end if;

  v_package_hash:=encode(extensions.digest(p_package::text,'sha256'),'hex');$r$
    ],
    -- 3. the image is part of the hashed content
    array[
      $m$      v_question->>'explanation',
      null,
      'multiple_choice'$m$,
      $r$      v_question->>'explanation',
      nullif(trim(v_question->>'imageUrl'),''),
      'multiple_choice'$r$
    ],
    -- 4. store image, alt text and source data
    array[
      $m$      verified_content_hash,content_version,content_revision,verified_external_id
    ) values ($m$,
      $r$      verified_content_hash,content_version,content_revision,verified_external_id,
      image_url,image_alt_text,visual_spec
    ) values ($r$
    ],
    array[
      $m$      v_question_hash,v_content_version,1,v_external_id
    );$m$,
      $r$      v_question_hash,v_content_version,1,v_external_id,
      nullif(trim(v_question->>'imageUrl'),''),
      nullif(trim(v_question->>'imageAltText'),''),
      case when jsonb_typeof(v_question->'visualSpec')='object' then v_question->'visualSpec' end
    );$r$
    ],
    -- 5. record the schema version actually imported
    array[
      $m$    v_package_id,v_package_version,1,v_content_version,$m$,
      $r$    v_package_id,v_package_version,v_schema_version,v_content_version,$r$
    ]
  ];
  i integer;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='rpc_import_registry_verified_mcq_package'
    and pg_get_function_identity_arguments(p.oid)='p_package jsonb, p_dry_run boolean';
  if v_def is null then
    raise exception 'rpc_import_registry_verified_mcq_package_not_found';
  end if;

  v_new := v_def;
  for i in 1..array_length(v_replacements,1) loop
    v_marker := v_replacements[i][1];
    v_with := v_replacements[i][2];
    v_count := (length(v_new)-length(replace(v_new,v_marker,'')))/length(v_marker);
    if v_count<>1 then
      raise exception 'registry_visual_migration_marker_% found % times', i, v_count;
    end if;
    v_new := replace(v_new,v_marker,v_with);
  end loop;

  execute v_new;
end
$migration$;

revoke all on function public.rpc_import_registry_verified_mcq_package(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rpc_import_registry_verified_mcq_package(jsonb,boolean) to service_role;

comment on function public.rpc_import_registry_verified_mcq_package(jsonb,boolean) is
  'Service-role-only atomic importer for registry-tagged MCQ packages. Schema v2 adds checksum-addressed SVG visuals; the image URL is hashed into the question content.';
