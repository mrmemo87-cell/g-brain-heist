-- Atomic service-role importer for registry-governed Brains Heist Verified MCQ packages.
-- Canonical skill identity comes from Academic Skill Registry; external paper/AO
-- metadata is governed separately through verified_question_assessment_profiles.

create table if not exists public.registry_verified_question_import_releases (
  id uuid primary key default gen_random_uuid(),
  package_id text not null,
  package_version text not null,
  schema_version integer not null,
  content_version text not null,
  registry_version_id uuid not null references public.academic_skill_registry_versions(id) on delete restrict,
  academic_subject_id uuid not null references public.academic_subjects(id) on delete restrict,
  package_hash text not null,
  question_count integer not null,
  taxonomy_count integer not null,
  assessment_profile_count integer not null,
  release_notes text,
  imported_by_authority text not null,
  imported_at timestamptz not null default now(),
  constraint registry_verified_question_import_release_identity_check
    check (
      package_id ~ '^[a-z0-9][a-z0-9._-]{2,119}$'
      and package_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$'
      and schema_version=1
      and question_count between 1 and 500
      and taxonomy_count>=question_count
      and assessment_profile_count between 0 and question_count
      and package_hash ~ '^[0-9a-f]{64}$'
    ),
  unique(package_id,package_version)
);

alter table public.registry_verified_question_import_releases enable row level security;
revoke all on table public.registry_verified_question_import_releases
from public,anon,authenticated;
grant select,insert on table public.registry_verified_question_import_releases
to service_role;

create or replace function public.rpc_import_registry_verified_mcq_package(
  p_package jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_schema_version integer;
  v_package_id text;
  v_package_version text;
  v_content_version text;
  v_registry_code text;
  v_subject_code text;
  v_authority text;
  v_package_hash text;
  v_registry public.academic_skill_registry_versions%rowtype;
  v_subject public.academic_subjects%rowtype;
  v_existing_release public.registry_verified_question_import_releases%rowtype;
  v_question jsonb;
  v_taxonomy jsonb;
  v_question_id uuid;
  v_question_hash text;
  v_fingerprint text;
  v_external_id text;
  v_options jsonb;
  v_correct_answer text;
  v_eligible_grades smallint[];
  v_primary_taxonomy jsonb;
  v_primary_skill public.academic_skill_registry_nodes%rowtype;
  v_primary_subskill public.academic_skill_registry_nodes%rowtype;
  v_primary_focus public.academic_skill_evidence_focuses%rowtype;
  v_skill public.academic_skill_registry_nodes%rowtype;
  v_subskill public.academic_skill_registry_nodes%rowtype;
  v_focus public.academic_skill_evidence_focuses%rowtype;
  v_strand public.academic_skill_registry_nodes%rowtype;
  v_question_count integer:=0;
  v_taxonomy_count integer:=0;
  v_profile_count integer:=0;
  v_release_id uuid;
  v_profile jsonb;
begin
  if p_package is null or jsonb_typeof(p_package)<>'object' then
    raise exception using errcode='22023',
      message='registry_verified_package_object_required';
  end if;

  v_schema_version:=coalesce((p_package->>'schemaVersion')::integer,0);
  v_package_id:=trim(p_package->>'packageId');
  v_package_version:=trim(p_package->>'packageVersion');
  v_content_version:=trim(p_package->>'contentVersion');
  v_registry_code:=trim(p_package->>'registryVersion');
  v_subject_code:=trim(p_package->>'subjectCode');
  v_authority:=trim(p_package->>'authority');

  if v_schema_version<>1 then
    raise exception using errcode='22023',
      message='unsupported_registry_verified_package_schema';
  end if;
  if v_package_id !~ '^[a-z0-9][a-z0-9._-]{2,119}$'
     or v_package_version !~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$'
     or length(v_content_version) not between 3 and 100
     or length(v_authority) not between 3 and 200 then
    raise exception using errcode='22023',
      message='invalid_registry_verified_package_identity';
  end if;
  if jsonb_typeof(p_package->'questions')<>'array' then
    raise exception using errcode='22023',
      message='registry_verified_package_questions_array_required';
  end if;

  v_question_count:=jsonb_array_length(p_package->'questions');
  if v_question_count<1 or v_question_count>500 then
    raise exception using errcode='22023',
      message='registry_verified_package_requires_1_to_500_questions';
  end if;

  select * into v_registry
  from public.academic_skill_registry_versions
  where code=v_registry_code and status='published';
  if not found then
    raise exception using errcode='23503',
      message='published_registry_version_not_found';
  end if;

  select * into v_subject
  from public.academic_subjects
  where code=v_subject_code and is_active;
  if not found then
    raise exception using errcode='23503',
      message='academic_subject_not_found';
  end if;

  if public.academic_normalize_subject_key(v_subject.name)<>v_registry.subject_key then
    raise exception using errcode='22023',
      message='registry_package_subject_mismatch';
  end if;

  if not exists(
    select 1
    from public.academic_skill_registry_subject_aliases a
    where a.registry_version_id=v_registry.id
      and a.alias_normalized=public.academic_normalize_subject_key(v_subject.name)
      and a.status='active'
  ) then
    raise exception using errcode='23503',
      message='registry_subject_alias_not_active';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_package->'questions') q
    group by trim(q->>'externalId')
    having count(*)>1
  ) then
    raise exception using errcode='23505',
      message='duplicate_external_id_inside_registry_verified_package';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_package->'questions') q
    group by
      lower(regexp_replace(trim(q->>'questionText'),'\s+',' ','g')),
      q->'options',
      lower(trim(q->>'correctAnswer'))
    having count(*)>1
  ) then
    raise exception using errcode='23505',
      message='duplicate_content_inside_registry_verified_package';
  end if;

  v_package_hash:=encode(extensions.digest(p_package::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(
    hashtext('registry-verified-package:'||v_package_id||':'||v_package_version)
  );

  select * into v_existing_release
  from public.registry_verified_question_import_releases
  where package_id=v_package_id and package_version=v_package_version;

  if found then
    if v_existing_release.package_hash<>v_package_hash then
      raise exception using errcode='23505',
        message='registry_verified_package_version_hash_conflict';
    end if;
    return jsonb_build_object(
      'success',true,
      'dryRun',p_dry_run,
      'alreadyImported',true,
      'releaseId',v_existing_release.id,
      'packageHash',v_package_hash,
      'questionCount',v_existing_release.question_count,
      'taxonomyCount',v_existing_release.taxonomy_count,
      'assessmentProfileCount',v_existing_release.assessment_profile_count,
      'registryVersion',v_registry.code
    );
  end if;

  -- Validate the entire package before writing any rows.
  for v_question in
    select value from jsonb_array_elements(p_package->'questions')
  loop
    v_external_id:=trim(v_question->>'externalId');
    v_options:=coalesce(v_question->'options','[]'::jsonb);
    v_correct_answer:=v_question->>'correctAnswer';

    if v_external_id !~ '^[a-z0-9][a-z0-9._-]{5,119}$'
       or nullif(trim(v_question->>'questionText'),'') is null
       or nullif(trim(v_correct_answer),'') is null
       or trim(v_question->>'difficulty') not in ('easy','medium','hard')
       or coalesce(trim(v_question->>'questionType'),'')<>'multiple_choice'
       or coalesce((v_question->>'points')::integer,0)<>1
       or coalesce((v_question->>'timeLimit')::integer,0) not between 20 and 180
       or nullif(trim(v_question->>'explanation'),'') is null
       or coalesce(nullif(trim(v_question->>'language'),''),'en')<>'en' then
      raise exception using errcode='22023',
        message='invalid_registry_verified_mcq:'||coalesce(v_external_id,'unknown');
    end if;

    if jsonb_typeof(v_options)<>'array'
       or jsonb_array_length(v_options)<>4
       or exists(
         select 1 from jsonb_array_elements(v_options) option_value
         where jsonb_typeof(option_value)<>'string'
            or nullif(trim(option_value#>>'{}'),'') is null
       )
       or exists(
         select 1
         from (
           select lower(trim(value#>>'{}')) option_text,count(*)
           from jsonb_array_elements(v_options)
           group by lower(trim(value#>>'{}'))
           having count(*)>1
         ) duplicates
       )
       or not exists(
         select 1 from jsonb_array_elements(v_options) option_value
         where option_value#>>'{}'=v_correct_answer
       ) then
      raise exception using errcode='22023',
        message='invalid_registry_verified_mcq_options:'||v_external_id;
    end if;

    if jsonb_typeof(v_question->'eligibleGrades')<>'array'
       or jsonb_array_length(v_question->'eligibleGrades')<1
       or jsonb_array_length(v_question->'eligibleGrades')>4
       or exists(
         select 1
         from jsonb_array_elements_text(v_question->'eligibleGrades') g
         where g !~ '^[0-9]{1,2}$' or g::integer not between 1 and 12
       ) then
      raise exception using errcode='22023',
        message='invalid_registry_verified_mcq_grades:'||v_external_id;
    end if;

    select array_agg(distinct g::smallint order by g::smallint)
    into v_eligible_grades
    from jsonb_array_elements_text(v_question->'eligibleGrades') g;

    if jsonb_typeof(v_question->'taxonomies')<>'array'
       or jsonb_array_length(v_question->'taxonomies')<1
       or jsonb_array_length(v_question->'taxonomies')>4 then
      raise exception using errcode='22023',
        message='registry_taxonomy_required:'||v_external_id;
    end if;

    if exists(
      select 1
      from jsonb_array_elements(v_question->'taxonomies') tx
      group by
        trim(tx->>'atomicSubskillCode'),
        trim(tx->>'evidenceFocusCode'),
        trim(tx->>'assessmentProcessCode')
      having count(*)>1
    ) then
      raise exception using errcode='23505',
        message='duplicate_registry_taxonomy_inside_question:'||v_external_id;
    end if;

    v_primary_taxonomy:=v_question->'taxonomies'->0;

    for v_taxonomy in
      select value from jsonb_array_elements(v_question->'taxonomies')
    loop
      select * into v_skill
      from public.academic_skill_registry_nodes
      where registry_version_id=v_registry.id
        and code=trim(v_taxonomy->>'primarySkillCode')
        and node_type='skill'
        and status='active';
      if not found then
        raise exception using errcode='23503',
          message='registry_primary_skill_not_found:'||v_external_id||':'||
            coalesce(trim(v_taxonomy->>'primarySkillCode'),'');
      end if;

      select * into v_subskill
      from public.academic_skill_registry_nodes
      where registry_version_id=v_registry.id
        and code=trim(v_taxonomy->>'atomicSubskillCode')
        and node_type='subskill'
        and parent_id=v_skill.id
        and status='active';
      if not found then
        raise exception using errcode='23503',
          message='registry_atomic_subskill_not_found:'||v_external_id||':'||
            coalesce(trim(v_taxonomy->>'atomicSubskillCode'),'');
      end if;

      select * into v_focus
      from public.academic_skill_evidence_focuses
      where registry_version_id=v_registry.id
        and atomic_subskill_node_id=v_subskill.id
        and code=trim(v_taxonomy->>'evidenceFocusCode')
        and status='active';
      if not found then
        raise exception using errcode='23503',
          message='registry_evidence_focus_not_found:'||v_external_id||':'||
            coalesce(trim(v_taxonomy->>'evidenceFocusCode'),'');
      end if;

      if trim(v_taxonomy->>'assessmentProcessCode') not in ('BH-AO1','BH-AO2','BH-AO3','BH-AO4')
         or trim(v_taxonomy->>'cognitiveProcess') not in ('remember','understand','apply','analyze','evaluate')
         or nullif(trim(v_taxonomy->>'evidenceStatement'),'') is null
         or length(trim(v_taxonomy->>'evidenceStatement')) not between 12 and 2000 then
        raise exception using errcode='22023',
          message='invalid_registry_taxonomy_metadata:'||v_external_id;
      end if;

      if (
        (trim(v_taxonomy->>'assessmentProcessCode')='BH-AO1'
          and trim(v_taxonomy->>'cognitiveProcess') not in ('remember','understand'))
        or (trim(v_taxonomy->>'assessmentProcessCode')='BH-AO2'
          and trim(v_taxonomy->>'cognitiveProcess')<>'apply')
        or (trim(v_taxonomy->>'assessmentProcessCode')='BH-AO3'
          and trim(v_taxonomy->>'cognitiveProcess')<>'analyze')
        or (trim(v_taxonomy->>'assessmentProcessCode')='BH-AO4'
          and trim(v_taxonomy->>'cognitiveProcess')<>'evaluate')
      ) then
        raise exception using errcode='22023',
          message='registry_taxonomy_process_cognitive_mismatch:'||v_external_id;
      end if;

      if exists(
        select 1 from unnest(v_eligible_grades) grade
        where case
          when grade between 1 and 6 then not ('primary'=any(v_subskill.applicable_phases))
          when grade between 7 and 9 then not ('lower_secondary'=any(v_subskill.applicable_phases))
          when grade between 10 and 12 then not ('upper_secondary'=any(v_subskill.applicable_phases))
          else true
        end
      ) then
        raise exception using errcode='22023',
          message='registry_subskill_not_applicable_to_grade:'||v_external_id;
      end if;

      v_taxonomy_count:=v_taxonomy_count+1;
    end loop;

    -- Validate the primary taxonomy can provide the required publication metadata.
    select skill.*,subskill.id as subskill_id_dummy
    into v_primary_skill
    from public.academic_skill_registry_nodes skill
    join public.academic_skill_registry_nodes subskill
      on subskill.registry_version_id=skill.registry_version_id
     and subskill.parent_id=skill.id
     and subskill.code=trim(v_primary_taxonomy->>'atomicSubskillCode')
     and subskill.node_type='subskill'
     and subskill.status='active'
    where skill.registry_version_id=v_registry.id
      and skill.code=trim(v_primary_taxonomy->>'primarySkillCode')
      and skill.node_type='skill'
      and skill.status='active';
    if not found then
      raise exception using errcode='23503',
        message='primary_registry_taxonomy_invalid:'||v_external_id;
    end if;

    if v_question ? 'assessmentProfile' then
      v_profile:=v_question->'assessmentProfile';
      if jsonb_typeof(v_profile)<>'object'
         or trim(v_profile->>'providerName')<>'Cambridge International Education'
         or trim(v_profile->>'programmeCode')<>'0455'
         or trim(v_profile->>'sourceVersion')<>'2027-2029'
         or trim(v_profile->>'paperComponent')<>'paper_1'
         or coalesce(nullif(trim(v_profile->>'paperSection'),''),'')<>''
         or trim(v_profile->>'evidenceMode')<>'mcq'
         or upper(trim(v_profile->>'primaryAssessmentObjective')) not in ('AO1','AO2')
         or jsonb_typeof(v_profile->'assessmentObjectives')<>'array'
         or jsonb_array_length(v_profile->'assessmentObjectives')<1
         or exists(
           select 1
           from jsonb_array_elements_text(v_profile->'assessmentObjectives') ao
           where upper(trim(ao)) not in ('AO1','AO2')
         ) then
        raise exception using errcode='22023',
          message='invalid_0455_paper_1_assessment_profile:'||v_external_id;
      end if;
      v_profile_count:=v_profile_count+1;
    end if;

    if exists(
      select 1 from public.questions q
      where q.verified_external_id=v_external_id
    ) then
      raise exception using errcode='23505',
        message='registry_verified_external_id_conflict:'||v_external_id;
    end if;

    v_fingerprint:=private.question_content_fingerprint(
      v_subject.name,
      trim(v_question->>'topic'),
      v_question->>'questionText',
      v_options,
      v_correct_answer,
      'multiple_choice'
    );
    if exists(
      select 1 from public.questions q
      where q.content_origin='brain_heist'
        and q.is_active
        and q.content_fingerprint=v_fingerprint
    ) then
      raise exception using errcode='23505',
        message='active_registry_verified_question_duplicate:'||v_external_id;
    end if;
  end loop;

  if p_dry_run then
    return jsonb_build_object(
      'success',true,
      'dryRun',true,
      'alreadyImported',false,
      'packageHash',v_package_hash,
      'questionCount',v_question_count,
      'taxonomyCount',v_taxonomy_count,
      'assessmentProfileCount',v_profile_count,
      'registryVersion',v_registry.code,
      'academicSubjectId',v_subject.id
    );
  end if;

  -- All package content is valid. Publish atomically.
  for v_question in
    select value from jsonb_array_elements(p_package->'questions')
  loop
    v_external_id:=trim(v_question->>'externalId');
    v_options:=v_question->'options';
    v_correct_answer:=v_question->>'correctAnswer';
    select array_agg(distinct g::smallint order by g::smallint)
    into v_eligible_grades
    from jsonb_array_elements_text(v_question->'eligibleGrades') g;
    v_primary_taxonomy:=v_question->'taxonomies'->0;

    select skill.*,strand.id as parent_id
    into v_primary_skill
    from public.academic_skill_registry_nodes skill
    join public.academic_skill_registry_nodes strand
      on strand.id=skill.parent_id
     and strand.node_type='strand'
     and strand.status='active'
    where skill.registry_version_id=v_registry.id
      and skill.code=trim(v_primary_taxonomy->>'primarySkillCode')
      and skill.node_type='skill'
      and skill.status='active';

    select * into v_primary_subskill
    from public.academic_skill_registry_nodes
    where registry_version_id=v_registry.id
      and code=trim(v_primary_taxonomy->>'atomicSubskillCode')
      and parent_id=v_primary_skill.id
      and node_type='subskill'
      and status='active';

    select * into v_primary_focus
    from public.academic_skill_evidence_focuses
    where registry_version_id=v_registry.id
      and atomic_subskill_node_id=v_primary_subskill.id
      and code=trim(v_primary_taxonomy->>'evidenceFocusCode')
      and status='active';

    select * into v_strand
    from public.academic_skill_registry_nodes
    where id=v_primary_skill.parent_id
      and registry_version_id=v_registry.id
      and node_type='strand'
      and status='active';

    v_question_id:=(
      substr(md5('registry-verified-question:'||v_external_id),1,8)||'-'||
      substr(md5('registry-verified-question:'||v_external_id),9,4)||'-'||
      substr(md5('registry-verified-question:'||v_external_id),13,4)||'-'||
      substr(md5('registry-verified-question:'||v_external_id),17,4)||'-'||
      substr(md5('registry-verified-question:'||v_external_id),21,12)
    )::uuid;

    v_question_hash:=private.question_content_hash(
      v_question_id,
      v_question->>'questionText',
      v_options,
      v_correct_answer,
      v_question->>'explanation',
      null,
      'multiple_choice'
    );

    insert into public.questions(
      id,teacher_id,subject,subject_id,topic,topic_name,difficulty,
      question_text,question_type,options,correct_answer,explanation,hints,
      time_limit,points,tags,grade_level,grade,lang,is_public,is_active,
      academic_subject_id,curriculum_strand,curriculum_skill,curriculum_subskill,
      curriculum_objective,eligible_grade_levels,curriculum_review_status,
      content_origin,pool_scope,owner_school_id,verification_status,
      analytics_eligible,verified_at,verified_by,verified_by_authority,
      verified_content_hash,content_version,content_revision,verified_external_id
    ) values (
      v_question_id,null,v_subject.name,v_subject.code,
      trim(v_question->>'topic'),trim(v_question->>'topic'),
      trim(v_question->>'difficulty'),v_question->>'questionText',
      'multiple_choice',v_options,v_correct_answer,v_question->>'explanation',
      array(select jsonb_array_elements_text(coalesce(v_question->'hints','[]'::jsonb))),
      (v_question->>'timeLimit')::integer,1,
      array(select jsonb_array_elements_text(coalesce(v_question->'tags','[]'::jsonb))),
      'Grade '||v_eligible_grades[1]::text,v_eligible_grades[1],'en',
      true,true,v_subject.id,
      v_strand.name,v_primary_skill.name,v_primary_subskill.name,
      trim(v_primary_taxonomy->>'evidenceStatement'),
      v_eligible_grades,'approved',
      'brain_heist','global',null,'verified',
      true,now(),null,v_authority,
      v_question_hash,v_content_version,1,v_external_id
    );

    for v_taxonomy in
      select value from jsonb_array_elements(v_question->'taxonomies')
    loop
      select * into v_skill
      from public.academic_skill_registry_nodes
      where registry_version_id=v_registry.id
        and code=trim(v_taxonomy->>'primarySkillCode')
        and node_type='skill' and status='active';

      select * into v_subskill
      from public.academic_skill_registry_nodes
      where registry_version_id=v_registry.id
        and code=trim(v_taxonomy->>'atomicSubskillCode')
        and parent_id=v_skill.id
        and node_type='subskill' and status='active';

      select * into v_focus
      from public.academic_skill_evidence_focuses
      where registry_version_id=v_registry.id
        and atomic_subskill_node_id=v_subskill.id
        and code=trim(v_taxonomy->>'evidenceFocusCode')
        and status='active';

      insert into public.verified_question_registry_taxonomy(
        question_id,question_content_hash,registry_version_id,
        primary_skill_node_id,atomic_subskill_node_id,evidence_focus_id,
        taxonomy_version,assessment_process_code,cognitive_process,
        evidence_statement,confidence_score,review_status,human_review_required,
        source_method,reviewed_by_authority,taxonomy_hash
      ) values (
        v_question_id,v_question_hash,v_registry.id,
        v_skill.id,v_subskill.id,v_focus.id,
        v_content_version||':'||v_external_id,
        trim(v_taxonomy->>'assessmentProcessCode'),
        trim(v_taxonomy->>'cognitiveProcess'),
        trim(v_taxonomy->>'evidenceStatement'),
        1,'approved',false,'verified_package_import',
        v_authority,'pending'
      );
    end loop;

    if v_question ? 'assessmentProfile' then
      perform public.rpc_govern_verified_question_assessment_profile(
        v_question_id,v_question->'assessmentProfile'
      );
    end if;
  end loop;

  insert into public.registry_verified_question_import_releases(
    package_id,package_version,schema_version,content_version,
    registry_version_id,academic_subject_id,package_hash,
    question_count,taxonomy_count,assessment_profile_count,
    release_notes,imported_by_authority
  ) values (
    v_package_id,v_package_version,1,v_content_version,
    v_registry.id,v_subject.id,v_package_hash,
    v_question_count,v_taxonomy_count,v_profile_count,
    nullif(trim(p_package->>'releaseNotes'),''),
    v_authority
  ) returning id into v_release_id;

  return jsonb_build_object(
    'success',true,
    'dryRun',false,
    'alreadyImported',false,
    'releaseId',v_release_id,
    'packageHash',v_package_hash,
    'questionCount',v_question_count,
    'taxonomyCount',v_taxonomy_count,
    'assessmentProfileCount',v_profile_count,
    'registryVersion',v_registry.code,
    'academicSubjectId',v_subject.id
  );
end;
$function$;

revoke all on function public.rpc_import_registry_verified_mcq_package(jsonb,boolean)
from public,anon,authenticated;
grant execute on function public.rpc_import_registry_verified_mcq_package(jsonb,boolean)
to service_role;

comment on function public.rpc_import_registry_verified_mcq_package(jsonb,boolean) is
  'Service-role-only atomic importer for original Brains Heist Verified MCQ packages governed directly by the Academic Skill Registry, Evidence Focus, internal BH-AO process, and optional external assessment profile.';

comment on table public.registry_verified_question_import_releases is
  'Immutable release ledger for atomic registry-governed Brains Heist Verified question packages.';
