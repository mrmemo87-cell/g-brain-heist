alter table public.academic_skill_registry_subject_aliases
  add column if not exists allowed_programme_codes text[];

with seed(alias_normalized,allowed_programme_codes) as(values
('biology',array['0097','0893','0610']::text[]),
('chemistry',array['0097','0893','0620']::text[]),
('computing',array['0059','0860','0478']::text[]),
('digital literacy',array['0072','0082','0417']::text[]),
('english',array['0058','0861','0500']::text[]),
('english as a second language',array['0057','0876','0472','0510','0511']::text[]),
('esl',array['0057','0876','0472','0510','0511']::text[]),
('geography',array['0065','0839','0460']::text[]),
('german',array['0064','0771','0525']::text[]),
('german language',array['0064','0771','0525']::text[]),
('global perspective',array['0838','1129','0457']::text[]),
('global perspectives',array['0838','1129','0457']::text[]),
('global-perspectives',array['0838','1129','0457']::text[]),
('humanities',array['0065','0839','0460']::text[]),
('ict',array['0059','0072','0860','0082','0417']::text[]),
('kyrgyz',array['0064','0771']::text[]),
('kyrgyz language',array['0064','0771']::text[]),
('math',array['0096','0862','0580']::text[]),
('mathematics',array['0096','0862','0580']::text[]),
('maths',array['0096','0862','0580']::text[]),
('modern foreign language',array['0064','0771']::text[]),
('modern languages',array['0064','0771']::text[]),
('physics',array['0097','0893','0625']::text[]),
('russian',array['0064','0771']::text[]),
('russian language',array['0064','0771']::text[]),
('science',array['0097','0893','0653']::text[]),
('travel & tourism',array['0471']::text[]),
('travel and tourism',array['0471']::text[]),
('travel-tourism',array['0471']::text[])
)
update public.academic_skill_registry_subject_aliases a
set allowed_programme_codes=s.allowed_programme_codes
from seed s
where a.alias_normalized=s.alias_normalized;

CREATE OR REPLACE FUNCTION public.rpc_academic_skill_registry_for_generation(p_subject_key text, p_grade_level integer, p_phase text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
 v_phase text;
 v_alias public.academic_skill_registry_subject_aliases%rowtype;
 v_version public.academic_skill_registry_versions%rowtype;
begin
 v_phase:=coalesce(nullif(trim(p_phase),''),
   case when p_grade_level between 1 and 6 then 'primary'
        when p_grade_level between 7 and 9 then 'lower_secondary'
        when p_grade_level between 10 and 12 then 'upper_secondary'
        else null end);
 if v_phase not in ('primary','lower_secondary','upper_secondary') then
   raise exception using errcode='22023',message='invalid_registry_phase';
 end if;

 select a.* into v_alias
 from public.academic_skill_registry_subject_aliases a
 where a.alias_normalized=lower(trim(coalesce(p_subject_key,'')))
   and a.status='active'
 limit 1;

 if not found then
   return jsonb_build_object('success',true,'supported',false,'reason','registry_not_available_for_subject');
 end if;

 select * into v_version
 from public.academic_skill_registry_versions
 where id=v_alias.registry_version_id and status='published';
 if not found then
   return jsonb_build_object('success',true,'supported',false,'reason','registry_not_published');
 end if;

 return jsonb_build_object(
  'success',true,'supported',true,
  'canonicalSubject',v_version.subject_key,
  'registryVersion',v_version.code,'phase',v_phase,
  'cambridgeProgrammes',coalesce((
    select jsonb_agg(distinct jsonb_build_object('code',c.programme_code,'name',c.programme_name))
    from public.academic_skill_framework_crosswalks c
    where c.registry_version_id=v_version.id
      and c.phase=v_phase
      and c.status='active'
      and (v_alias.allowed_programme_codes is null or c.programme_code=any(v_alias.allowed_programme_codes))
  ),'[]'::jsonb),
  'rules',jsonb_build_array(
    'Select canonical codes from this registry; do not invent a new official skill or subskill.',
    'Skill identity describes the durable subject competency, not the assessment process or one question context.',
    'Keep question-specific detail in the evidence statement, not the canonical skill name.',
    'If no canonical subskill fits, require taxonomy review instead of silently creating one.'
  ),
  'skills',coalesce((
    select jsonb_agg(jsonb_build_object(
      'strandCode',strand.code,'strandName',strand.name,
      'skillCode',skill.code,'skillName',skill.name,'skillDescription',skill.description,
      'subskillCode',leaf.code,'subskillName',leaf.name,'subskillDescription',leaf.description
    ) order by strand.code,skill.code,leaf.code)
    from public.academic_skill_registry_nodes leaf
    join public.academic_skill_registry_nodes skill
      on skill.id=leaf.parent_id and skill.node_type='skill' and skill.status='active'
    join public.academic_skill_registry_nodes strand
      on strand.id=skill.parent_id and strand.node_type='strand' and strand.status='active'
    where leaf.registry_version_id=v_version.id
      and leaf.node_type='subskill' and leaf.status='active'
      and v_phase=any(leaf.applicable_phases)
      and v_phase=any(skill.applicable_phases)
      and (v_alias.allowed_strand_codes is null or strand.code=any(v_alias.allowed_strand_codes))
  ),'[]'::jsonb)
 );
end;
$function$
;

revoke all on function public.rpc_academic_skill_registry_for_generation(text,integer,text)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_academic_skill_registry_for_generation(text,integer,text)
to authenticated,service_role;
