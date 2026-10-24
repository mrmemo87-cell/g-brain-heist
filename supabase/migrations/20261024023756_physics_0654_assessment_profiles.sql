-- Programme-aware external AO metadata. No question publication or registry expansion.
-- Preserves current live alias fixes and teacher allocation checks.
alter table public.verified_question_assessment_profiles
  add column if not exists syllabus_tier text,
  add column if not exists syllabus_reference text,
  add column if not exists objective_components jsonb not null default '[]'::jsonb;

-- Internal validator shared by package dry-runs and profile governance.
-- 0654 component codes below are BH identifiers for paraphrased syllabus bullets,
-- not official Cambridge sub-AO numbering. MCQs provide no AO3 practical evidence.
create or replace function private.validate_external_question_assessment_profile(
  p_subject text, p_profile jsonb, p_mcq_only boolean default false
) returns void language plpgsql security invoker set search_path = '' as $function$
declare
  v_programme text := p_profile->>'programmeCode';
  v_paper text := p_profile->>'paperComponent';
  v_mode text := p_profile->>'evidenceMode';
  v_primary text := p_profile->>'primaryAssessmentObjective';
  v_aos text[];
  v_component text;
begin
  if jsonb_typeof(p_profile) is distinct from 'object'
     or (p_profile->>'providerName') is distinct from 'Cambridge International Education'
     or jsonb_typeof(p_profile->'assessmentObjectives') is distinct from 'array' then
    raise exception 'invalid_external_assessment_profile';
  end if;
  select array_agg(value) into v_aos from jsonb_array_elements_text(p_profile->'assessmentObjectives');
  if coalesce(cardinality(v_aos),0) not between 1 and 3
     or v_primary is null or not coalesce(v_primary=any(v_aos),false)
     or exists(select 1 from unnest(v_aos) x where x is null or x not in ('AO1','AO2','AO3'))
     or cardinality(v_aos)<>(select count(distinct x) from unnest(v_aos) x) then
    raise exception 'invalid_external_assessment_objectives';
  end if;
  if v_programme='0455' then
    if lower(trim(p_subject)) is distinct from 'economics'
       or (p_profile->>'sourceVersion') is distinct from '2027-2029' then
      raise exception 'unsupported_economics_assessment_profile_version';
    end if;
    if v_paper='paper_1' then
      if nullif(p_profile->>'paperSection','') is not null or v_mode is distinct from 'mcq'
         or 'AO3'=any(v_aos) then raise exception 'invalid_0455_paper_1_profile'; end if;
    elsif v_paper='paper_2' and not p_mcq_only then
      if not coalesce((p_profile->>'paperSection'='section_a' and v_mode='data_response')
         or (p_profile->>'paperSection'='section_b' and v_mode='structured_response'),false) then
        raise exception 'invalid_0455_paper_2_profile';
      end if;
    else raise exception 'invalid_0455_paper_component'; end if;
  elsif v_programme='0654' then
    if lower(trim(p_subject)) is distinct from 'physics'
       or (p_profile->>'sourceVersion') is distinct from '2025-2027'
       or v_paper is null or v_paper not in ('paper_1','paper_2')
       or v_mode is distinct from 'mcq' or 'AO3'=any(v_aos)
       or nullif(p_profile->>'paperSection','') is not null
       or not coalesce((p_profile->>'syllabusTier'='core' and v_paper in ('paper_1','paper_2'))
          or (p_profile->>'syllabusTier'='supplement' and v_paper='paper_2'),false)
       or coalesce(p_profile->>'syllabusReference','') !~ '^P[1256]([.][0-9]+){1,4}$'
       or jsonb_typeof(p_profile->'objectiveComponents') is distinct from 'array'
       or jsonb_array_length(p_profile->'objectiveComponents') not between 1 and 4 then
      raise exception 'invalid_0654_physics_mcq_profile';
    end if;
    for v_component in select jsonb_array_elements_text(p_profile->'objectiveComponents') loop
      if v_component is null or v_component not in (
        'BH-CIE0654-AO1-concepts','BH-CIE0654-AO1-terminology',
        'BH-CIE0654-AO1-apparatus-safety','BH-CIE0654-AO1-applications',
        'BH-CIE0654-AO2-select-information','BH-CIE0654-AO2-representations',
        'BH-CIE0654-AO2-numerical-data','BH-CIE0654-AO2-patterns-conclusions',
        'BH-CIE0654-AO2-reasoned-explanations','BH-CIE0654-AO2-predictions',
        'BH-CIE0654-AO2-problem-solving')
        or not (split_part(v_component,'-',3)=any(v_aos)) then
        raise exception 'invalid_0654_objective_component';
      end if;
    end loop;
  else raise exception 'unsupported_external_assessment_programme'; end if;
end;
$function$;
revoke all on function private.validate_external_question_assessment_profile(text,jsonb,boolean)
  from public,anon,authenticated;
grant execute on function private.validate_external_question_assessment_profile(text,jsonb,boolean)
  to service_role;

CREATE OR REPLACE FUNCTION public.rpc_govern_verified_question_assessment_profile(p_question_id uuid, p_profile jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_question public.questions%rowtype;
  v_provider text;
  v_programme text;
  v_source_version text;
  v_paper text;
  v_section text;
  v_mode text;
  v_primary_ao text;
  v_aos text[];
  v_source_reference text;
  v_profile_hash text;
  v_profile_id uuid;
begin
  if p_question_id is null or p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception using errcode='22023',message='question_and_assessment_profile_required';
  end if;

  select q.* into v_question
  from public.questions q
  where q.id=p_question_id
    and q.is_active
    and q.content_origin='brain_heist'
    and q.verification_status='verified'
    and q.analytics_eligible
    and q.current_content_hash=q.verified_content_hash;

  if v_question.id is null then
    raise exception using errcode='23514',message='assessment_profile_requires_current_verified_question';
  end if;

  v_provider := trim(p_profile->>'providerName');
  v_programme := trim(p_profile->>'programmeCode');
  v_source_version := trim(p_profile->>'sourceVersion');
  v_paper := trim(p_profile->>'paperComponent');
  v_section := nullif(trim(p_profile->>'paperSection'),'');
  v_mode := trim(p_profile->>'evidenceMode');
  v_primary_ao := upper(trim(p_profile->>'primaryAssessmentObjective'));
  v_source_reference := nullif(trim(p_profile->>'sourceReference'),'');
  select coalesce(array_agg(distinct upper(trim(value)) order by upper(trim(value))),array[]::text[])
  into v_aos
  from jsonb_array_elements_text(coalesce(p_profile->'assessmentObjectives','[]'::jsonb));

  perform private.validate_external_question_assessment_profile(v_question.subject,p_profile,false);

  v_profile_hash := encode(extensions.digest(
    jsonb_build_object(
      'questionId',p_question_id,
      'questionContentHash',v_question.current_content_hash,
      'providerName',v_provider,
      'programmeCode',v_programme,
      'sourceVersion',v_source_version,
      'paperComponent',v_paper,
      'paperSection',v_section,
      'evidenceMode',v_mode,
      'primaryAssessmentObjective',v_primary_ao,
      'assessmentObjectives',to_jsonb(v_aos),
      'sourceReference',v_source_reference,
      'syllabusTier',p_profile->>'syllabusTier',
      'syllabusReference',p_profile->>'syllabusReference',
      'objectiveComponents',p_profile->'objectiveComponents'
    )::text,
    'sha256'
  ),'hex');

  update public.verified_question_assessment_profiles
  set status='retired',updated_at=now()
  where question_id=p_question_id
    and provider_name=v_provider
    and programme_code=v_programme
    and source_version=v_source_version
    and status='active'
    and (question_content_hash <> v_question.current_content_hash or profile_hash <> v_profile_hash);

  insert into public.verified_question_assessment_profiles(
    question_id,question_content_hash,provider_name,programme_code,source_version,
    paper_component,paper_section,evidence_mode,primary_assessment_objective,
    assessment_objectives,source_reference,profile_hash,status,syllabus_tier,syllabus_reference,objective_components
  ) values (
    p_question_id,v_question.current_content_hash,v_provider,v_programme,v_source_version,
    v_paper,v_section,v_mode,v_primary_ao,v_aos,v_source_reference,v_profile_hash,'active',
    p_profile->>'syllabusTier',p_profile->>'syllabusReference',coalesce(p_profile->'objectiveComponents','[]'::jsonb)
  )
  on conflict (question_id,question_content_hash,provider_name,programme_code,source_version)
    where status='active'
  do update set
    paper_component=excluded.paper_component,
    paper_section=excluded.paper_section,
    evidence_mode=excluded.evidence_mode,
    primary_assessment_objective=excluded.primary_assessment_objective,
    assessment_objectives=excluded.assessment_objectives,
    source_reference=excluded.source_reference,
    profile_hash=excluded.profile_hash,
    syllabus_tier=excluded.syllabus_tier,
    syllabus_reference=excluded.syllabus_reference,
    objective_components=excluded.objective_components,
    updated_at=now()
  returning id into v_profile_id;

  return jsonb_build_object(
    'success',true,
    'profileId',v_profile_id,
    'profileHash',v_profile_hash,
    'questionId',p_question_id,
    'questionContentHash',v_question.current_content_hash
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_import_registry_verified_mcq_package(p_package jsonb, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  if not coalesce(p_dry_run,true) and coalesce(v_authority,'') like 'PENDING%' then
    raise exception 'human_review_authority_required_for_publication';
  end if;

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

  if not private.academic_registry_subject_matches(v_registry.id,v_subject.name) then
    raise exception using errcode='22023',
      message='registry_package_subject_mismatch';
  end if;

  if not exists(
    select 1
    from public.academic_skill_registry_subject_aliases a
    where a.registry_version_id=v_registry.id
      and a.alias_normalized in (lower(trim(v_subject.name)),public.academic_normalize_subject_key(v_subject.name))
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

    if v_question ? 'assessmentProfile' then
      perform private.validate_external_question_assessment_profile(v_subject.name,v_question->'assessmentProfile',true);
    end if;
    if v_question ? 'curriculumPhase' and not coalesce(
      v_question->>'curriculumPhase'='upper_secondary'
      and v_question->'assessmentProfile'->>'programmeCode'='0654'
      and v_question->'assessmentProfile'->>'sourceVersion'='2025-2027'
      and not exists(select 1 from unnest(v_eligible_grades) g where g<9),false) then
      raise exception 'unsupported_registry_package_phase_override';
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
          when v_question->>'curriculumPhase'='upper_secondary' then not ('upper_secondary'=any(v_subskill.applicable_phases))
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

    -- The first taxonomy is the publication-facing canonical taxonomy.
    select * into v_primary_skill
    from public.academic_skill_registry_nodes
    where registry_version_id=v_registry.id
      and code=trim(v_primary_taxonomy->>'primarySkillCode')
      and node_type='skill'
      and status='active';

    select * into v_primary_subskill
    from public.academic_skill_registry_nodes
    where registry_version_id=v_registry.id
      and code=trim(v_primary_taxonomy->>'atomicSubskillCode')
      and parent_id=v_primary_skill.id
      and node_type='subskill'
      and status='active';

    if v_primary_skill.id is null or v_primary_subskill.id is null then
      raise exception using errcode='23503',
        message='primary_registry_taxonomy_invalid:'||v_external_id;
    end if;

    if v_question ? 'assessmentProfile' then
      v_profile:=v_question->'assessmentProfile';
      perform private.validate_external_question_assessment_profile(v_subject.name,v_profile,true);
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

    select * into v_primary_skill
    from public.academic_skill_registry_nodes
    where registry_version_id=v_registry.id
      and code=trim(v_primary_taxonomy->>'primarySkillCode')
      and node_type='skill'
      and status='active';

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
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_teacher_question_browser(p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  v_actor uuid:=auth.uid(); v_teacher uuid; v_school uuid; v_year uuid;
  p_subject text:=nullif(p_filters->>'subject','');
  p_difficulty text:=nullif(p_filters->>'difficulty','');
  v_limit integer:=greatest(1,least(coalesce((p_filters->>'limit')::integer,60),100));
  v_after_time timestamptz:=(p_filters->'cursor'->>'createdAt')::timestamptz;
  v_after_id uuid:=(p_filters->'cursor'->>'id')::uuid;
  v_questions jsonb; v_facets jsonb; v_ids uuid[]; v_metadata jsonb; v_more boolean;
begin
  if v_actor is null then raise exception using errcode='42501',message='authentication_required'; end if;
  select t.id into v_teacher from public.teachers t where t.user_id=v_actor;
  if v_teacher is null then raise exception using errcode='42501',message='teacher_required'; end if;


  select sm.school_id into v_school
  from public.school_members sm
  where sm.user_id=v_actor and sm.status='active'
  order by sm.joined_at desc nulls last,sm.id limit 1;
  if v_school is null then select u.school_id into v_school from public.users u where u.id=v_actor; end if;
  if v_school is not null then v_year:=public.academic_resolve_operational_year_id(v_school,now()); end if;


  if (v_after_time is null)<>(v_after_id is null) then raise exception 'invalid_question_cursor'; end if;
  with authorized_scopes as materialized (
    select distinct
      ss.id as school_subject_id,
      ss.name as school_subject_name,
      academic.name as canonical_subject_name,
      o.grade_level,
      ss.academic_subject_id,
      o.curriculum_scope_id
    from public.school_subject_group_teachers gt
    join public.school_subject_groups g
      on g.id=gt.group_id and g.school_id=gt.school_id and g.status='active'
    join public.school_subject_offerings o
      on o.id=g.school_subject_offering_id and o.school_id=g.school_id and o.status='active'
    join public.school_subjects ss
      on ss.id=o.school_subject_id and ss.school_id=o.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id and academic.is_active
    where gt.teacher_user_id=v_actor
      and gt.school_id=v_school
      and gt.active
      and o.grade_level~'^[0-9]+$'
      and (v_year is null or o.academic_year_id=v_year)

    union

    select distinct
      ss.id,
      ss.name,
      academic.name,
      c.grade_level,
      ss.academic_subject_id,
      o.curriculum_scope_id
    from public.class_teacher_assignments cta
    join public.classes c
      on c.id=cta.class_id and c.school_id=cta.school_id
      and coalesce(c.is_active,true) and c.grade_level~'^[0-9]+$'
    join public.school_subjects ss
      on ss.id=cta.school_subject_id and ss.school_id=cta.school_id
      and ss.is_active and ss.academic_subject_id is not null
    join public.academic_subjects academic
      on academic.id=ss.academic_subject_id and academic.is_active
    join public.school_subject_offerings o
      on o.school_subject_id=ss.id and o.school_id=cta.school_id
      and o.grade_level=c.grade_level and o.status='active'
      and o.grade_level~'^[0-9]+$'
      and (v_year is null or o.academic_year_id=v_year)
    where cta.teacher_user_id=v_actor and cta.school_id=v_school and cta.active
  ),
  page as materialized (
    select q0.id,q0.created_at from public.questions q0
    where q0.is_active and ((q0.pool_scope='teacher' and q0.content_origin='teacher' and q0.teacher_id=v_teacher
      and (p_subject is null or lower(trim(q0.subject))=lower(trim(p_subject)))
      and (p_difficulty is null or q0.difficulty=p_difficulty)) or (q0.verification_status='verified' and q0.analytics_eligible
      and exists (select 1 from authorized_scopes scope
        where scope.academic_subject_id=q0.academic_subject_id
          and scope.grade_level::smallint=any(q0.eligible_grade_levels)
          and (exists (
        select 1 from public.curriculum_assessment_items item
        join public.curriculum_item_objective_mappings im on im.assessment_item_id=item.id
        join public.curriculum_framework_versions fv on fv.id=im.framework_version_id
        where item.source_type='question_bank' and item.source_record_id=q0.id::text
          and item.source_item_key='question' and item.is_active
          and item.content_hash=q0.verified_content_hash
          and ((q0.pool_scope='global' and item.school_id is null)
            or (q0.pool_scope='school' and item.school_id=v_school))
          and im.curriculum_scope_id=scope.curriculum_scope_id
          and im.academic_subject_id=q0.academic_subject_id
          and im.status='approved' and im.mapping_role='primary'
          and im.superseded_at is null and im.item_content_hash=item.content_hash
          and fv.status in ('published','retired')
          and fv.content_hash=im.curriculum_version_content_hash
      ) or exists (
        select 1 from public.verified_question_registry_taxonomy tx
        join public.academic_skill_registry_versions rv
          on rv.id=tx.registry_version_id and rv.status='published'
        join public.academic_skill_registry_nodes skill
          on skill.id=tx.primary_skill_node_id and skill.registry_version_id=rv.id
          and skill.node_type='skill' and skill.status='active'
        join public.academic_skill_registry_nodes subskill
          on subskill.id=tx.atomic_subskill_node_id and subskill.registry_version_id=rv.id
          and subskill.parent_id=skill.id and subskill.node_type='subskill' and subskill.status='active'
        join public.academic_skill_evidence_focuses focus
          on focus.id=tx.evidence_focus_id and focus.status='active'
          and focus.registry_version_id=rv.id and focus.atomic_subskill_node_id=subskill.id
        where tx.question_id=q0.id and tx.question_content_hash=q0.verified_content_hash
          and tx.review_status='approved' and not tx.human_review_required
          and private.academic_registry_subject_matches(rv.id,scope.canonical_subject_name)
      ))
      and q0.is_active
      and q0.verification_status='verified' and q0.analytics_eligible
      and q0.current_content_hash=q0.verified_content_hash
      and (
        (q0.pool_scope='global' and q0.content_origin='brain_heist'
          and q0.owner_school_id is null and q0.is_public)
        or (q0.pool_scope='school' and q0.content_origin='teacher'
          and q0.owner_school_id=v_school and not q0.is_public)
      )
      and (
        p_subject is null
        or lower(trim(scope.school_subject_name))=lower(trim(p_subject))
        or lower(trim(scope.canonical_subject_name))=lower(trim(p_subject))
        or lower(trim(q0.subject))=lower(trim(p_subject))
      )
      and (p_difficulty is null or q0.difficulty=p_difficulty))))
      and (nullif(p_filters->>'pool','') is null or (p_filters->>'pool'='verified' and q0.pool_scope in ('global','school')) or
        q0.pool_scope=case p_filters->>'pool' when 'mine' then 'teacher' when 'brains-heist' then 'global' else p_filters->>'pool' end)
      and (nullif(p_filters->>'topic','') is null or coalesce(nullif(q0.topic_name,''),nullif(q0.topic,''),'General')=p_filters->>'topic')
      and (nullif(p_filters->>'type','') is null or q0.question_type=p_filters->>'type')
      and (not (p_filters ? 'subjects') or exists(select 1 from jsonb_array_elements_text(p_filters->'subjects') s(value)
        where private.question_browse_subject_key(q0.subject)=private.question_browse_subject_key(s.value)))
      and (not (p_filters ? 'grades') or q0.pool_scope='teacher' or q0.eligible_grade_levels @>
        array(select value::smallint from jsonb_array_elements_text(p_filters->'grades')))
      and (nullif(p_filters->>'xp','') is null or case p_filters->>'xp'
        when 'low' then q0.points<=10 when 'medium' then q0.points>10 and q0.points<=20 when 'high' then q0.points>20 else true end)
      and (nullif(trim(p_filters->>'search'),'') is null or private.question_browse_matches_search(q0,p_filters->>'search'))
      and (v_after_time is null or (q0.created_at,q0.id)<(v_after_time,v_after_id))
    order by q0.created_at desc,q0.id desc limit v_limit+1 offset greatest(coalesce((p_filters->>'offset')::integer,0),0)
  ), rows as (
    select to_jsonb(q)||jsonb_build_object('is_mine',q.pool_scope='teacher' and q.teacher_id=v_teacher,
      'assessment_profiles',coalesce((select jsonb_agg(jsonb_build_object(
        'programmeCode',ap.programme_code,'sourceVersion',ap.source_version,
        'paperComponent',ap.paper_component,'primaryAssessmentObjective',ap.primary_assessment_objective,
        'assessmentObjectives',ap.assessment_objectives,'syllabusTier',ap.syllabus_tier,
        'syllabusReference',ap.syllabus_reference,'objectiveComponents',ap.objective_components) order by ap.programme_code)
        from public.verified_question_assessment_profiles ap where ap.question_id=q.id
          and ap.question_content_hash=q.current_content_hash and ap.status='active'),'[]'::jsonb),
      'creator_name',case when q.pool_scope='global' then 'Brains Heist' else coalesce(u.username,'Teacher') end,
      'creator_school_id',case when q.pool_scope='global' then null when q.pool_scope='school' then q.owner_school_id else u.school_id end) payload,
      q.id,q.created_at
    from page join public.questions q on q.id=page.id
    left join public.teachers t on t.id=q.teacher_id left join public.users u on u.id=t.user_id
    order by q.created_at desc,q.id desc limit v_limit
  )
  select coalesce(jsonb_agg(payload order by created_at desc,id desc),'[]'::jsonb),array_agg(id order by created_at desc,id desc),
    (select count(*)>v_limit from page)
  into v_questions,v_ids,v_more from rows;
  if coalesce(cardinality(v_ids),0)>0 and coalesce((p_filters->>'metadata')::boolean,true) then
    v_metadata:=public.rpc_question_curriculum_metadata(v_ids);
  end if;
  return jsonb_build_object('questions',v_questions,'metadata',coalesce(v_metadata,'[]'::jsonb),
    'hasMore',v_more,'nextCursor',case when v_more then jsonb_build_object(
      'createdAt',v_questions->-1->>'created_at','id',v_questions->-1->>'id') else null end);
end;
$function$
;

revoke all on function public.rpc_govern_verified_question_assessment_profile(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.rpc_govern_verified_question_assessment_profile(uuid,jsonb) to service_role;
revoke all on function public.rpc_import_registry_verified_mcq_package(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rpc_import_registry_verified_mcq_package(jsonb,boolean) to service_role;
revoke all on function public.rpc_teacher_question_browser(jsonb) from public,anon;
grant execute on function public.rpc_teacher_question_browser(jsonb) to authenticated,service_role;

-- Append external AO metadata to future immutable evidence snapshots.
CREATE OR REPLACE FUNCTION private.materialize_verified_assignment_registry_evidence(p_assignment_id uuid, p_student_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assignment record;
  v_school_id uuid;
  v_effective_grade text;
  v_inserted integer:=0;
begin
  if p_assignment_id is null or p_student_id is null then return 0; end if;

  select
    a.school_id,a.class_id,a.class_code_snapshot,a.academic_year_id,a.academic_term_id,
    a.academic_subject_id,a.grade_level_snapshot,
    coalesce(nullif(trim(a.subject_name),''),nullif(trim(a.subject),''),nullif(trim(a.subject_id),''),'General') as subject_name,
    sa.batch as student_batch,sa.status,result.completed_at
  into v_assignment
  from public.assignments a
  join public.student_assignments sa
    on sa.assignment_id=a.id and sa.student_id=p_student_id
  join public.student_assignment_results result
    on result.assignment_id=a.id and result.student_id=p_student_id
  where a.id=p_assignment_id;

  if not found
     or v_assignment.status<>'completed'
     or v_assignment.completed_at is null
     or v_assignment.academic_year_id is null then
    return 0;
  end if;

  select coalesce(v_assignment.school_id,u.school_id)
  into v_school_id
  from public.users u
  where u.id=p_student_id;
  if v_school_id is null then return 0; end if;

  v_effective_grade:=nullif(trim(v_assignment.grade_level_snapshot),'');
  if v_effective_grade is null then
    select c.grade_level into v_effective_grade
    from public.classes c
    where c.school_id=v_school_id
      and (
        c.id=v_assignment.class_id
        or upper(regexp_replace(trim(c.class_code),'\s+','','g'))=
           upper(regexp_replace(trim(coalesce(v_assignment.student_batch,'')),'\s+','','g'))
      )
      and coalesce(c.is_active,true)
    order by (c.id=v_assignment.class_id) desc,c.id
    limit 1;
  end if;
  if v_effective_grade is null or v_effective_grade !~ '^[0-9]+$' then return 0; end if;

  with eligible as (
    select
      saa.id as answer_id,
      saa.question_id,
      saa.is_correct,
      coalesce(saa.answered_at,v_assignment.completed_at) as answered_at,
      q.current_content_hash as question_content_hash,
      rt.id as registry_taxonomy_id,
      rt.registry_version_id,
      rt.primary_skill_node_id,
      rt.atomic_subskill_node_id,
      rt.evidence_focus_id,
      rv.code as registry_version_code,
      skill.code as primary_skill_code,
      skill.name as primary_skill_name,
      subskill.code as atomic_subskill_code,
      subskill.name as atomic_subskill_name,
      focus.code as evidence_focus_code,
      focus.name as evidence_focus_name,
      rt.assessment_process_code,
      rt.cognitive_process,
      rt.evidence_statement,
      rt.confidence_score,
      rt.taxonomy_version,
      rt.taxonomy_hash,
      case when q.pool_scope='global'
        then 'brains_heist_verified_registry_question'
        else 'school_verified_registry_question'
      end as evidence_authority,
      exists(
        select 1
        from public.student_learning_intervention_practice_assignments practice
        where practice.assignment_id=p_assignment_id
          and practice.student_id=p_student_id
      ) as is_targeted_practice
    from public.student_assignment_answers saa
    join public.assignment_questions aq
      on aq.assignment_id=saa.assignment_id
     and aq.question_id=saa.question_id
     and aq.analytics_eligible_snapshot
     and aq.pool_scope_snapshot in ('global','school')
     and aq.verification_status_snapshot='verified'
    join public.questions q
      on q.id=saa.question_id
     and q.pool_scope=aq.pool_scope_snapshot
     and q.owner_school_id is not distinct from aq.owner_school_id_snapshot
     and q.verification_status='verified'
     and q.analytics_eligible
     and q.is_active
     and q.current_content_hash=q.verified_content_hash
     and aq.question_content_hash=q.current_content_hash
     and v_effective_grade::smallint=any(q.eligible_grade_levels)
     and (
       (q.pool_scope='global' and q.content_origin='brain_heist' and q.owner_school_id is null and q.is_public)
       or
       (q.pool_scope='school' and q.content_origin='teacher' and q.owner_school_id=v_school_id and not q.is_public)
     )
    join public.verified_question_registry_taxonomy rt
      on rt.question_id=q.id
     and rt.question_content_hash=aq.question_content_hash
     and rt.review_status='approved'
     and not rt.human_review_required
    join public.academic_skill_registry_versions rv
      on rv.id=rt.registry_version_id
     and rv.status='published'
     and private.academic_registry_subject_matches(rv.id,q.subject)
    join public.academic_skill_registry_nodes skill
      on skill.id=rt.primary_skill_node_id
     and skill.registry_version_id=rv.id
     and skill.node_type='skill'
     and skill.status='active'
    join public.academic_skill_registry_nodes subskill
      on subskill.id=rt.atomic_subskill_node_id
     and subskill.registry_version_id=rv.id
     and subskill.parent_id=skill.id
     and subskill.node_type='subskill'
     and subskill.status='active'
    join public.academic_skill_evidence_focuses focus
      on focus.id=rt.evidence_focus_id
     and focus.registry_version_id=rv.id
     and focus.atomic_subskill_node_id=subskill.id
     and focus.status='active'
    where saa.assignment_id=p_assignment_id
      and saa.student_id=p_student_id
      and saa.grading_status='graded'
      and saa.is_correct is not null
  )
  insert into public.student_learning_registry_item_evidence(
    school_id,student_id,assignment_id,answer_id,question_id,
    academic_year_id,academic_term_id,academic_subject_id,
    registry_version_id,primary_skill_node_id,atomic_subskill_node_id,
    evidence_focus_id,registry_taxonomy_id,grade_level,question_content_hash,
    is_correct,is_independent_assessment,answered_at,evidence_authority,
    taxonomy_snapshot,taxonomy_snapshot_hash
  )
  select
    v_school_id,p_student_id,p_assignment_id,e.answer_id,e.question_id,
    v_assignment.academic_year_id,v_assignment.academic_term_id,v_assignment.academic_subject_id,
    e.registry_version_id,e.primary_skill_node_id,e.atomic_subskill_node_id,
    e.evidence_focus_id,e.registry_taxonomy_id,v_effective_grade,e.question_content_hash,
    e.is_correct,not e.is_targeted_practice,e.answered_at,e.evidence_authority,
    jsonb_build_object(
      'registryVersionCode',e.registry_version_code,
      'primarySkillCode',e.primary_skill_code,
      'primarySkillName',e.primary_skill_name,
      'atomicSubskillCode',e.atomic_subskill_code,
      'atomicSubskillName',e.atomic_subskill_name,
      'evidenceFocusCode',e.evidence_focus_code,
      'evidenceFocusName',e.evidence_focus_name,
      'assessmentProcessCode',e.assessment_process_code,
      'cognitiveProcess',e.cognitive_process,
      'evidenceStatement',e.evidence_statement,
      'mappingConfidence',e.confidence_score,
      'taxonomyVersion',e.taxonomy_version,
      'registryTaxonomyHash',e.taxonomy_hash,
      'externalAssessmentProfiles',coalesce((select jsonb_agg(jsonb_build_object(
        'programmeCode',ap.programme_code,'sourceVersion',ap.source_version,
        'primaryAssessmentObjective',ap.primary_assessment_objective,'assessmentObjectives',ap.assessment_objectives,
        'syllabusTier',ap.syllabus_tier,'syllabusReference',ap.syllabus_reference,
        'objectiveComponents',ap.objective_components,'profileHash',ap.profile_hash) order by ap.programme_code,ap.source_version,ap.profile_hash)
        from public.verified_question_assessment_profiles ap where ap.question_id=e.question_id
          and ap.question_content_hash=e.question_content_hash and ap.status='active'),'[]'::jsonb),
      'isTargetedPractice',e.is_targeted_practice
    ),
    encode(extensions.digest(jsonb_build_object(
      'registryVersionCode',e.registry_version_code,
      'primarySkillCode',e.primary_skill_code,
      'atomicSubskillCode',e.atomic_subskill_code,
      'evidenceFocusCode',e.evidence_focus_code,
      'assessmentProcessCode',e.assessment_process_code,
      'cognitiveProcess',e.cognitive_process,
      'evidenceStatement',e.evidence_statement,
      'mappingConfidence',e.confidence_score,
      'taxonomyVersion',e.taxonomy_version,
      'registryTaxonomyHash',e.taxonomy_hash,
      'externalAssessmentProfiles',coalesce((select jsonb_agg(jsonb_build_object(
        'programmeCode',ap.programme_code,'sourceVersion',ap.source_version,
        'primaryAssessmentObjective',ap.primary_assessment_objective,'assessmentObjectives',ap.assessment_objectives,
        'syllabusTier',ap.syllabus_tier,'syllabusReference',ap.syllabus_reference,
        'objectiveComponents',ap.objective_components,'profileHash',ap.profile_hash) order by ap.programme_code,ap.source_version,ap.profile_hash)
        from public.verified_question_assessment_profiles ap where ap.question_id=e.question_id
          and ap.question_content_hash=e.question_content_hash and ap.status='active'),'[]'::jsonb),
      'isTargetedPractice',e.is_targeted_practice
    )::text,'sha256'),'hex')
  from eligible e
  on conflict(answer_id,registry_taxonomy_id) do nothing;

  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$function$
;
-- Explicit school offering context; grade numbering does not define Cambridge stage.
create table if not exists public.physics_programme_offering_mappings (
  offering_id uuid primary key references public.school_subject_offerings(id) on delete restrict,
  programme_code text not null check(programme_code='0654'),
  source_version text not null check(source_version='2025-2027'),
  registry_phase text not null check(registry_phase='upper_secondary'),
  reviewed_by_authority text not null check(length(trim(reviewed_by_authority)) between 3 and 200),
  reviewed_at timestamptz not null default now(),
  status text not null default 'active' check(status in ('active','retired'))
);
alter table public.physics_programme_offering_mappings enable row level security;
revoke all on public.physics_programme_offering_mappings from public,anon,authenticated;
grant select,insert,update on public.physics_programme_offering_mappings to service_role;

-- Aggregate only; exact teaching-group authorization is checked before any data read.
create or replace function public.rpc_teacher_physics_assessment_breakdown(p_school_id uuid,p_group_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_result jsonb; v_phase text;
begin
  if auth.uid() is null or not exists(select 1 from public.school_members sm
    where sm.school_id=p_school_id and sm.user_id=auth.uid() and sm.status='active') or not exists (
    select 1 from public.school_subject_group_teachers t
    join public.school_subject_groups g on g.id=t.group_id and g.school_id=t.school_id and g.status='active'
    join public.school_subject_offerings o on o.id=g.school_subject_offering_id and o.school_id=g.school_id and o.status='active'
    join public.school_subjects ss on ss.id=o.school_subject_id and ss.school_id=o.school_id and ss.is_active
    join public.academic_subjects s on s.id=ss.academic_subject_id and s.code='physics' and s.is_active
    where t.school_id=p_school_id and t.group_id=p_group_id and t.teacher_user_id=auth.uid() and t.active
  ) then raise exception using errcode='42501',message='physics_teaching_group_access_required'; end if;

  select m.registry_phase into v_phase from public.physics_programme_offering_mappings m
  join public.school_subject_groups g on g.school_subject_offering_id=m.offering_id
  where g.id=p_group_id and g.school_id=p_school_id and m.status='active'
    and m.programme_code='0654' and m.source_version='2025-2027';

  with items as materialized (
    select e.*,coalesce(e.is_independent_assessment,false)
      and private.registry_question_answer_is_fresh(e.student_id,e.assignment_id,e.question_id,e.answered_at) independent_fresh
    from public.student_learning_registry_item_evidence e
    join public.assignments a on a.id=e.assignment_id and a.school_id=e.school_id and a.subject_group_id=p_group_id
    join public.academic_subjects s on s.id=e.academic_subject_id and s.code='physics'
    where e.school_id=p_school_id and exists (
      select 1 from public.school_subject_group_students gs where gs.school_id=e.school_id and gs.group_id=p_group_id
        and gs.student_id=e.student_id and gs.status='active'
    )
  ), profiles as (
    select distinct i.answer_id,i.question_id,i.assignment_id,i.student_id,i.is_correct,i.independent_fresh,p.value profile
    from items i cross join lateral jsonb_array_elements(coalesce(i.taxonomy_snapshot->'externalAssessmentProfiles','[]'::jsonb)) p
    where p.value->>'programmeCode'='0654' and p.value->>'sourceVersion'='2025-2027'
  ), component_items as (
    select distinct p.answer_id,p.question_id,p.assignment_id,p.student_id,p.is_correct,p.independent_fresh,
      p.profile->>'primaryAssessmentObjective' ao,c.value component
    from profiles p cross join lateral jsonb_array_elements_text(coalesce(p.profile->'objectiveComponents','[]'::jsonb)) c
  ), breakdown as (
    select ao,component,count(*) item_count,count(*) filter(where is_correct) correct_count,
      count(*) filter(where independent_fresh) independent_fresh_count,
      count(*) filter(where independent_fresh and is_correct) independent_fresh_correct_count,
      count(distinct question_id) filter(where independent_fresh) distinct_questions,
      count(distinct assignment_id) filter(where independent_fresh) distinct_assignments,
      count(distinct student_id) filter(where independent_fresh) students_with_independent_evidence
    from component_items group by ao,component
  ) select jsonb_build_object('success',true,'programmeCode','0654','sourceVersion','2025-2027',
    'registryPhase',v_phase,'programmeConfigured',v_phase is not null,
    'components',coalesce((select jsonb_agg(jsonb_build_object(
      'ao',ao,'component',component,'itemCount',item_count,'correctCount',correct_count,
      'independentFreshCount',independent_fresh_count,'independentFreshCorrectCount',independent_fresh_correct_count,
      'practiceOrRepeatedCount',item_count-independent_fresh_count,'distinctQuestions',distinct_questions,
      'distinctAssignments',distinct_assignments,'studentsWithIndependentEvidence',students_with_independent_evidence
    ) order by ao,component) from breakdown),'[]'::jsonb),
    'disclosure','Descriptive evidence only. No grade, band or mastery estimate. MCQs do not assess AO3 practical performance. Components overlap and must not be summed as separate marks.') into v_result;
  return v_result;
end;
$function$;
revoke all on function public.rpc_teacher_physics_assessment_breakdown(uuid,uuid) from public,anon;
grant execute on function public.rpc_teacher_physics_assessment_breakdown(uuid,uuid) to authenticated;

-- Optional explicit phase for published registry metadata, matching the generation RPC.
-- Existing three-argument calls retain their current grade-based behaviour.
create or replace function public.rpc_academic_evidence_focuses_for_subskill(
  p_subject_key text,p_grade_level integer,p_atomic_subskill_code text,p_phase text
) returns jsonb language plpgsql security invoker set search_path='' as $function$
declare v_result jsonb;
begin
  if p_phase is null then
    return public.rpc_academic_evidence_focuses_for_subskill(p_subject_key,p_grade_level,p_atomic_subskill_code);
  end if;
  if auth.uid() is null or p_phase not in ('primary','lower_secondary','upper_secondary') then
    raise exception using errcode='42501',message='authenticated_valid_phase_required';
  end if;
  select jsonb_build_object('focuses',coalesce(jsonb_agg(jsonb_build_object(
    'code',f.code,'name',f.name,'description',f.description,'sourceMethod',f.source_method
  ) order by f.name),'[]'::jsonb)) into v_result
  from public.academic_skill_registry_subject_aliases a
  join public.academic_skill_registry_versions v on v.id=a.registry_version_id and v.status='published'
  join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code=p_atomic_subskill_code
    and n.node_type='subskill' and n.status='active' and p_phase=any(n.applicable_phases)
  join public.academic_skill_registry_nodes skill on skill.id=n.parent_id and skill.node_type='skill'
    and skill.status='active' and p_phase=any(skill.applicable_phases)
  join public.academic_skill_registry_nodes strand on strand.id=skill.parent_id and strand.node_type='strand' and strand.status='active'
  join public.academic_skill_evidence_focuses f on f.atomic_subskill_node_id=n.id and f.registry_version_id=v.id
    and f.status='active' and p_phase=any(f.applicable_phases)
  where a.alias_normalized=lower(trim(p_subject_key)) and a.status='active'
    and (a.allowed_strand_codes is null or strand.code=any(a.allowed_strand_codes));
  return v_result;
end;
$function$;
revoke all on function public.rpc_academic_evidence_focuses_for_subskill(text,integer,text,text) from public,anon;
grant execute on function public.rpc_academic_evidence_focuses_for_subskill(text,integer,text,text) to authenticated;

CREATE OR REPLACE FUNCTION private.question_browse_matches_search(p_question public.questions, p_search text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select nullif(pg_catalog.btrim(p_search),'') is null
    or pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',p_question.question_text,
      p_question.correct_answer,p_question.subject,p_question.topic,p_question.topic_name,p_question.difficulty,
      pg_catalog.array_to_string(p_question.tags,' '),p_question.curriculum_strand,p_question.curriculum_skill,
      p_question.curriculum_subskill,p_question.curriculum_objective)),pg_catalog.lower(pg_catalog.btrim(p_search)))>0
    or exists (
      select 1 from public.verified_question_registry_taxonomy tx
      join public.academic_skill_registry_versions rv on rv.id=tx.registry_version_id and rv.status='published'
        and private.academic_registry_subject_matches(rv.id,p_question.subject)
      join public.academic_skill_registry_nodes skill on skill.id=tx.primary_skill_node_id and skill.status='active' and skill.registry_version_id=rv.id and skill.node_type='skill'
      join public.academic_skill_registry_nodes subskill on subskill.id=tx.atomic_subskill_node_id and subskill.status='active' and subskill.registry_version_id=rv.id
        and subskill.parent_id=skill.id and subskill.node_type='subskill'
      left join public.academic_skill_registry_nodes strand on strand.id=skill.parent_id
      join public.academic_skill_evidence_focuses focus on focus.id=tx.evidence_focus_id and focus.status='active' and focus.registry_version_id=rv.id and focus.atomic_subskill_node_id=subskill.id
      where tx.question_id=p_question.id and tx.question_content_hash=p_question.current_content_hash
        and tx.review_status='approved' and not tx.human_review_required
        and p_question.is_active and p_question.analytics_eligible and p_question.verification_status='verified'
        and p_question.current_content_hash=p_question.verified_content_hash
        and pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',strand.name,skill.name,subskill.name,
          focus.name,tx.evidence_statement)),pg_catalog.lower(pg_catalog.btrim(p_search)))>0
    )
    or exists (
      select 1 from public.verified_question_assessment_profiles ap
      where ap.question_id=p_question.id and ap.question_content_hash=p_question.current_content_hash
        and ap.status='active' and p_question.is_active and p_question.analytics_eligible
        and p_question.verification_status='verified' and p_question.current_content_hash=p_question.verified_content_hash
        and pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',ap.programme_code,ap.source_version,
          ap.syllabus_tier,ap.syllabus_reference,ap.primary_assessment_objective,
          pg_catalog.array_to_string(ap.assessment_objectives,' '))),pg_catalog.lower(pg_catalog.btrim(p_search)))>0
    )
$function$
;
revoke all on function private.question_browse_matches_search(public.questions,text) from public,anon,authenticated;

