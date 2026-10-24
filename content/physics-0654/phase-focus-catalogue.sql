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
