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
