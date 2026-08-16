-- Make the schema v2 visual importer package-version aware.
--
-- The first visual release intentionally allowed only the reviewed 2026-7-0
-- directory. Future schema v2 releases must be equally strict without
-- hard-coding that first directory: the immutable asset directory must be the
-- semantic package version with dots replaced by hyphens.

do $upgrade$
declare
  v_signature regprocedure := to_regprocedure(
    'public.rpc_import_verified_question_package_v2(jsonb,boolean)'
  );
  v_definition text;
  v_updated text;
begin
  if v_signature is null then
    raise exception using
      errcode = '42883',
      message = 'verified_question_visual_importer_v2_not_found';
  end if;

  v_definition := pg_get_functiondef(v_signature);

  if position($marker$  v_subject_counts jsonb;
begin$marker$ in v_definition) = 0
     or position($marker$  v_authority := trim(p_package->>'authority');$marker$ in v_definition) = 0
     or position($marker$trim(v_asset->>'sourceFile') !~ '^public/question-assets/2026-7-0/[a-z0-9-]+\.[0-9a-f]{12}\.svg$'$marker$ in v_definition) = 0 then
    raise exception using
      errcode = '55000',
      message = 'verified_question_visual_importer_v2_definition_drift';
  end if;

  v_updated := replace(
    v_definition,
    $old$  v_subject_counts jsonb;
begin$old$,
    $new$  v_subject_counts jsonb;
  v_asset_directory text;
begin$new$
  );
  v_updated := replace(
    v_updated,
    $old$  v_authority := trim(p_package->>'authority');$old$,
    $new$  v_authority := trim(p_package->>'authority');
  v_asset_directory := replace(v_package_version, '.', '-');$new$
  );
  v_updated := replace(
    v_updated,
    $old$trim(v_asset->>'sourceFile') !~ '^public/question-assets/2026-7-0/[a-z0-9-]+\.[0-9a-f]{12}\.svg$'$old$,
    $new$trim(v_asset->>'sourceFile') !~ (
         '^public/question-assets/' || v_asset_directory || '/[a-z0-9-]+\.[0-9a-f]{12}\.svg$'
       )$new$
  );

  if v_updated = v_definition
     or position('2026-7-0' in v_updated) > 0
     or position('v_asset_directory' in v_updated) = 0 then
    raise exception using
      errcode = '55000',
      message = 'verified_question_visual_importer_v2_upgrade_failed';
  end if;

  execute v_updated;
end;
$upgrade$;

comment on function public.rpc_import_verified_question_package_v2(jsonb, boolean) is
  'Service-role-only atomic importer for schema v2 verified question packages with package-version-bound immutable visual asset paths.';
