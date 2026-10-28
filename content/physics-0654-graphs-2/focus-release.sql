-- Additive Evidence Focus release for 0654 Physics graph set 2. Run before importing it.

-- Owner-authorised content release; never edits or removes existing registry rows.

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.electricity.circuits.focus.resistance-from-current-voltage-graph','Calculate resistance from a current-voltage graph','Evidence that the learner can calculate resistance from a current-voltage graph.',
array['upper_secondary'],'human_governed','a9fc2bc31dc76a01a2e1fec9c90b16b7603ef1d4c046ccd64a2bc735f0c3ffb5','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.electricity.circuits'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.electricity.circuits.focus.compare-resistances-from-current-voltage-graph','Compare resistances using current-voltage graphs','Evidence that the learner can compare resistances using current-voltage graphs.',
array['upper_secondary'],'human_governed','5077d2f1343475559ca6bc7b48561fd5556d659e95ab38ddec61345d4b7be253','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.electricity.circuits'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.electricity.circuits.focus.series-combined-resistance','Calculate the combined resistance of resistors in series','Evidence that the learner can calculate the combined resistance of resistors in series.',
array['upper_secondary'],'human_governed','533b6b2b4d7a81e241051d7ec9ea470fd349f53c24f70abbeea3c367777bf818','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.electricity.circuits'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.electricity.circuits.focus.current-from-pd-and-total-resistance','Calculate circuit current from p.d. and total resistance','Evidence that the learner can calculate circuit current from p.d. and total resistance.',
array['upper_secondary'],'human_governed','fe3403720b529fc79faf4829d52f7b4987be539bc2e7958cc3419f34fe5864df','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.electricity.circuits'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.electricity.circuits.focus.parallel-combined-resistance','Calculate the combined resistance of two resistors in parallel','Evidence that the learner can calculate the combined resistance of two resistors in parallel.',
array['upper_secondary'],'human_governed','953abba23da5c9704fca24612b314fa72240cc1601db65c568f2c1513745efd2','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.electricity.circuits'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.electricity.circuits.focus.parallel-junction-current','Calculate supply current as the sum of parallel branch currents','Evidence that the learner can calculate supply current as the sum of parallel branch currents.',
array['upper_secondary'],'human_governed','e23166bd669e541d5be2b382498f725d987316379aa8acf67794b35bc186f078','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.electricity.circuits'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.waves.properties.focus.amplitude-from-wave-graph','Read the amplitude of a wave from a displacement-distance graph','Evidence that the learner can read the amplitude of a wave from a displacement-distance graph.',
array['upper_secondary'],'human_governed','0882805ecbf807da6061fa0b858040093b08cd96ab882e532f9e302aef97cfc3','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.waves.properties'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.waves.properties.focus.wavelength-from-wave-graph','Read the wavelength of a wave from a displacement-distance graph','Evidence that the learner can read the wavelength of a wave from a displacement-distance graph.',
array['upper_secondary'],'human_governed','95539d3f27a7f79e917cc6182a1ff760dfed2fb3b16fdaa9f31d3fa377af4ab7','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.waves.properties'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.waves.properties.focus.wave-speed-from-graph-and-frequency','Calculate wave speed from a wave graph and its frequency','Evidence that the learner can calculate wave speed from a wave graph and its frequency.',
array['upper_secondary'],'human_governed','86eaeffec3786284e0dae0e5b6026b251de3b5e6abc719277d7e66a10090466a','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.waves.properties'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;
