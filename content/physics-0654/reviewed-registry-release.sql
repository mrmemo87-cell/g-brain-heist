-- Proposed content release. Requires human review of the exact manifest first.
-- Run in a transaction; rollback for rehearsal. This file never imports questions.
do $review$ begin
  if coalesce(current_setting('brains_heist.physics_review_authority',true),'')=''
     or current_setting('brains_heist.physics_review_manifest_sha256',true) is distinct from '56f65c4493bdc29650b08c5b46f099c0c01a6cb6d2d8ba5922c1c9bbb61fc387' then
    raise exception 'physics_0654_human_taxonomy_review_required';
  end if;
end $review$;

do $identity$ begin
  if exists(select 1 from public.academic_skill_registry_nodes n
    join public.academic_skill_registry_versions v on v.id=n.registry_version_id and v.code='bh-science-core-v1'
    left join public.academic_skill_registry_nodes p on p.id=n.parent_id
    where n.code='science.physics.nuclear.atomic-structure' and
      (n.name is distinct from 'Nuclear composition and isotopes' or n.node_type is distinct from 'subskill'
       or p.code is distinct from 'science.physics.nuclear' or n.status<>'active')) then
    raise exception 'physics_registry_identity_conflict';
  end if;
end $identity$;

do $identity$ begin
  if exists(select 1 from public.academic_skill_registry_nodes n
    join public.academic_skill_registry_versions v on v.id=n.registry_version_id and v.code='bh-science-core-v1'
    left join public.academic_skill_registry_nodes p on p.id=n.parent_id
    where n.code='science.physics.nuclear.nuclear-reactions' and
      (n.name is distinct from 'Nuclear fission and fusion' or n.node_type is distinct from 'subskill'
       or p.code is distinct from 'science.physics.nuclear' or n.status<>'active')) then
    raise exception 'physics_registry_identity_conflict';
  end if;
end $identity$;

do $identity$ begin
  if exists(select 1 from public.academic_skill_registry_nodes n
    join public.academic_skill_registry_versions v on v.id=n.registry_version_id and v.code='bh-science-core-v1'
    left join public.academic_skill_registry_nodes p on p.id=n.parent_id
    where n.code='science.physics.space' and
      (n.name is distinct from 'Space physics' or n.node_type is distinct from 'skill'
       or p.code is distinct from 'science.physics' or n.status<>'active')) then
    raise exception 'physics_registry_identity_conflict';
  end if;
end $identity$;

do $identity$ begin
  if exists(select 1 from public.academic_skill_registry_nodes n
    join public.academic_skill_registry_versions v on v.id=n.registry_version_id and v.code='bh-science-core-v1'
    left join public.academic_skill_registry_nodes p on p.id=n.parent_id
    where n.code='science.physics.space.solar-system' and
      (n.name is distinct from 'Solar System relationships and astronomical scales' or n.node_type is distinct from 'subskill'
       or p.code is distinct from 'science.physics.space' or n.status<>'active')) then
    raise exception 'physics_registry_identity_conflict';
  end if;
end $identity$;

do $identity$ begin
  if exists(select 1 from public.academic_skill_registry_nodes n
    join public.academic_skill_registry_versions v on v.id=n.registry_version_id and v.code='bh-science-core-v1'
    left join public.academic_skill_registry_nodes p on p.id=n.parent_id
    where n.code='science.physics.space.stars' and
      (n.name is distinct from 'Stellar composition and evolution' or n.node_type is distinct from 'subskill'
       or p.code is distinct from 'science.physics.space' or n.status<>'active')) then
    raise exception 'physics_registry_identity_conflict';
  end if;
end $identity$;

do $identity$ begin
  if exists(select 1 from public.academic_skill_registry_nodes n
    join public.academic_skill_registry_versions v on v.id=n.registry_version_id and v.code='bh-science-core-v1'
    left join public.academic_skill_registry_nodes p on p.id=n.parent_id
    where n.code='science.physics.space.cosmology' and
      (n.name is distinct from 'Galaxies and the expanding Universe' or n.node_type is distinct from 'subskill'
       or p.code is distinct from 'science.physics.space' or n.status<>'active')) then
    raise exception 'physics_registry_identity_conflict';
  end if;
end $identity$;

insert into public.academic_skill_registry_nodes(registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status)
select v.id,p.id,'subskill','science.physics.nuclear.atomic-structure','Nuclear composition and isotopes',
'Transferable Physics capability: Nuclear composition and isotopes.',array['upper_secondary'],'active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes p on p.registry_version_id=v.id and p.code='science.physics.nuclear'
where v.code='bh-science-core-v1' and v.status='published' and p.status='active'
on conflict(registry_version_id,code) do nothing;

insert into public.academic_skill_registry_nodes(registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status)
select v.id,p.id,'subskill','science.physics.nuclear.nuclear-reactions','Nuclear fission and fusion',
'Transferable Physics capability: Nuclear fission and fusion.',array['upper_secondary'],'active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes p on p.registry_version_id=v.id and p.code='science.physics.nuclear'
where v.code='bh-science-core-v1' and v.status='published' and p.status='active'
on conflict(registry_version_id,code) do nothing;

insert into public.academic_skill_registry_nodes(registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status)
select v.id,p.id,'skill','science.physics.space','Space physics',
'Transferable Physics capability: Space physics.',array['upper_secondary'],'active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes p on p.registry_version_id=v.id and p.code='science.physics'
where v.code='bh-science-core-v1' and v.status='published' and p.status='active'
on conflict(registry_version_id,code) do nothing;

insert into public.academic_skill_registry_nodes(registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status)
select v.id,p.id,'subskill','science.physics.space.solar-system','Solar System relationships and astronomical scales',
'Transferable Physics capability: Solar System relationships and astronomical scales.',array['upper_secondary'],'active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes p on p.registry_version_id=v.id and p.code='science.physics.space'
where v.code='bh-science-core-v1' and v.status='published' and p.status='active'
on conflict(registry_version_id,code) do nothing;

insert into public.academic_skill_registry_nodes(registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status)
select v.id,p.id,'subskill','science.physics.space.stars','Stellar composition and evolution',
'Transferable Physics capability: Stellar composition and evolution.',array['upper_secondary'],'active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes p on p.registry_version_id=v.id and p.code='science.physics.space'
where v.code='bh-science-core-v1' and v.status='published' and p.status='active'
on conflict(registry_version_id,code) do nothing;

insert into public.academic_skill_registry_nodes(registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status)
select v.id,p.id,'subskill','science.physics.space.cosmology','Galaxies and the expanding Universe',
'Transferable Physics capability: Galaxies and the expanding Universe.',array['upper_secondary'],'active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes p on p.registry_version_id=v.id and p.code='science.physics.space'
where v.code='bh-science-core-v1' and v.status='published' and p.status='active'
on conflict(registry_version_id,code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.temperature-particle.focus.liquid-particles','Describe liquid particle arrangement and motion','Evidence that the learner can describe liquid particle arrangement and motion.',
array['upper_secondary'],'human_governed','3b30fb77cafc809e350fbc8029160e2dca4078e0c5d32b8e57a38ffe4bb2adc9','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.temperature-particle.focus.gas-volume','Distinguish gas and liquid volume properties','Evidence that the learner can distinguish gas and liquid volume properties.',
array['upper_secondary'],'human_governed','3d7d3699b087fa97633ef4b45065a3737f0c30ddc0e23a0e924bce7763fe1ddb','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.temperature-particle.focus.brownian-motion','Explain Brownian motion using molecular collisions','Evidence that the learner can explain Brownian motion using molecular collisions.',
array['upper_secondary'],'human_governed','c6d84a976038267caaef79f892d24b1bdfd76011e86009e2100a732ae26ac3ec','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.gases.focus.constant-volume-heating','Explain gas pressure increase at constant volume','Evidence that the learner can explain gas pressure increase at constant volume.',
array['upper_secondary'],'human_governed','402b042121c7718f9074aac296f135d4025eb9dc5f6039ffa1e381886830a86f','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.gases'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.gases.focus.gas-wall-collisions','Explain gas pressure using wall collisions','Evidence that the learner can explain gas pressure using wall collisions.',
array['upper_secondary'],'human_governed','1d9c1d86c3b028673e4c99e89a7c67887290adbbf87e4432d1f2d20a7abb1b0c','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.gases'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.gases.focus.pressure-volume-prediction','Predict pressure change at constant temperature','Evidence that the learner can predict pressure change at constant temperature.',
array['upper_secondary'],'human_governed','783d4dc9d9331707b317e090133c3943dfe253c4d0e35e7ad2ebe775545a78ae','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.gases'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.temperature-particle.focus.compare-expansion','Compare thermal expansion of states of matter','Evidence that the learner can compare thermal expansion of states of matter.',
array['upper_secondary'],'human_governed','8b6719d657cc59484936418db059ad22d76da5b900581ad7f5d7d576253e91d8','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.temperature-particle.focus.expansion-applications','Explain expansion gaps in structures','Evidence that the learner can explain expansion gaps in structures.',
array['upper_secondary'],'human_governed','55f5f3e0841d5dbec79a4fd9a1916ef95d31af6fcad64bd29edfaa5c4534bd51','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.temperature-particle.focus.expansion-particles','Explain expansion using mean particle separation','Evidence that the learner can explain expansion using mean particle separation.',
array['upper_secondary'],'human_governed','e7dbed9db44a7af04305468fb7b0a06896fe5806d5e042163c4e901ba0b2d510','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.temperature-particle.focus.melting-energy','Explain constant temperature during melting','Evidence that the learner can explain constant temperature during melting.',
array['upper_secondary'],'human_governed','2a3380401733f96374b2e01ef8aa510a3438bc479ada412a7c8cb13c25eb3e1d','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.temperature-particle.focus.evaporation-cooling','Explain evaporative cooling through particle energies','Evidence that the learner can explain evaporative cooling through particle energies.',
array['upper_secondary'],'human_governed','a05afb0060eaac7111f2853050a61c9e5a77d23779a72307e3f833f5f6f82b60','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.temperature-particle.focus.boiling-evaporation','Distinguish boiling and evaporation','Evidence that the learner can distinguish boiling and evaporation.',
array['upper_secondary'],'human_governed','98f308677034b0ade5cd7ac88d66ae0537d11a9a052d4d48d2c9bed9870c5b66','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.heat-transfer.focus.lattice-conduction','Explain conduction through particle vibrations','Evidence that the learner can explain conduction through particle vibrations.',
array['upper_secondary'],'human_governed','81f7fc309d9f2c6a09adc29fce75bc9a37f46e98c3e2f3547761256e8f716eb9','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.heat-transfer.focus.convection-medium','Identify why convection requires a flowing medium','Evidence that the learner can identify why convection requires a flowing medium.',
array['upper_secondary'],'human_governed','08057c26f5fff6731ff78096ebcd8a1815440b330692962873b321c84bfc6833','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.heat-transfer.focus.convection-density','Explain convection through density changes','Evidence that the learner can explain convection through density changes.',
array['upper_secondary'],'human_governed','219b1dcd428869d8a6a90a117b1339232acc747aabcd80756b2f67d27a7618b4','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.heat-transfer.focus.radiation-vacuum','Identify radiation as energy transfer through vacuum','Evidence that the learner can identify radiation as energy transfer through vacuum.',
array['upper_secondary'],'human_governed','b9a7ebd13eca93f273a5e725a9e7f8160cf68b6a85a1999bf69d4f80cbad7fa6','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.heat-transfer.focus.surface-emission','Compare thermal emission from different surfaces','Evidence that the learner can compare thermal emission from different surfaces.',
array['upper_secondary'],'human_governed','d395d4145952e42c420c7cd1ba9af7873ec524f35b430ac79a5e059054b3bfc3','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.heat-transfer.focus.radiative-equilibrium','Explain temperature stability using radiation balance','Evidence that the learner can explain temperature stability using radiation balance.',
array['upper_secondary'],'human_governed','22d3810a777f572b080de61a9a408f991db196b2aa31c79a752cdb25d94d9f70','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.thermal.heat-transfer.focus.vacuum-insulation','Explain vacuum insulation against conduction and convection','Evidence that the learner can explain vacuum insulation against conduction and convection.',
array['upper_secondary'],'human_governed','d07b60716d5bf5dbd72f14d91188f26aed434872a339d99485dad75f5d89f4b5','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.atomic-structure.focus.nuclear-composition','Identify nuclear constituents','Evidence that the learner can identify nuclear constituents.',
array['upper_secondary'],'human_governed','3052ab4f7d1d89100f9e4fbb4b3089fbaf3d5479de2649db64f9993f9834aca7','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.atomic-structure'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.atomic-structure.focus.nuclide-numbers','Calculate proton and neutron numbers from nuclide notation','Evidence that the learner can calculate proton and neutron numbers from nuclide notation.',
array['upper_secondary'],'human_governed','52c91e2d70a6a1239f2c905631d16eb3b2b17eab9c27adbe6c6dea5cb95097ba','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.atomic-structure'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.atomic-structure.focus.isotopes','Distinguish isotopes using proton and neutron numbers','Evidence that the learner can distinguish isotopes using proton and neutron numbers.',
array['upper_secondary'],'human_governed','a52d2107dce7f9711fa9536e5dd1f802199bf02e1636b56f1fab94d618eb2859','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.atomic-structure'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.nuclear-reactions.focus.fission','Distinguish nuclear fission from fusion','Evidence that the learner can distinguish nuclear fission from fusion.',
array['upper_secondary'],'human_governed','908ee04c1394f3941587ca924ccde2d91bae5b61ed4c4657d405e8a2335b79ee','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.nuclear-reactions'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.nuclear-reactions.focus.fusion','Distinguish nuclear fusion from fission','Evidence that the learner can distinguish nuclear fusion from fission.',
array['upper_secondary'],'human_governed','ecd8a517679630a8c41de59af7b11e1f30cb7a8348907f07a954966374afb1b9','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.nuclear-reactions'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.background-sources','Identify sources of ionising background radiation','Evidence that the learner can identify sources of ionising background radiation.',
array['upper_secondary'],'human_governed','1e1284f4641b1320a5ba41bd36688bdab26f68ad0489d58277bbe3b17d9c5882','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.alpha-nature','Identify alpha particle composition','Evidence that the learner can identify alpha particle composition.',
array['upper_secondary'],'human_governed','d86498e6e0cd6e94ac667e0e63f6a1888d1c47aef6d91d37192dbbc736029f5e','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.beta-nature','Identify beta-minus particles','Evidence that the learner can identify beta-minus particles.',
array['upper_secondary'],'human_governed','16be92d0a649390acc8bc8b7a60dc870bcd538171089e719cf83bd587d6976d4','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.gamma-nature','Identify gamma as electromagnetic radiation','Evidence that the learner can identify gamma as electromagnetic radiation.',
array['upper_secondary'],'human_governed','e8049c180df4b3923815659790610fe9db527197df0bbe2ac6212f50a1aff22e','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.ionisation','Compare ionising effects of nuclear emissions','Evidence that the learner can compare ionising effects of nuclear emissions.',
array['upper_secondary'],'human_governed','51148919993f1a239afb2891c30df8bbcabfb780af8c2ff500249e588f100e90','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.penetration','Identify emissions using absorber evidence','Evidence that the learner can identify emissions using absorber evidence.',
array['upper_secondary'],'human_governed','ef2d36bb77ae9d8c78e8576de6c81af3559e0f5740facb1dcbba532d78d66a0d','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.alpha-decay','Determine daughter nuclides after alpha decay','Evidence that the learner can determine daughter nuclides after alpha decay.',
array['upper_secondary'],'human_governed','fa3dbd0b1a1b43aa795fd1cad375b38575e8b9e9a978929786308b95856eddc7','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.beta-decay-nuclide','Determine daughter nuclides after beta-minus decay','Evidence that the learner can determine daughter nuclides after beta-minus decay.',
array['upper_secondary'],'human_governed','f2d71b76505bfd5c8661f01a319163b7adb0801fe1d9f0fa91a0d5f4eec11ac9','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.beta-decay-process','Describe nuclear change in beta-minus emission','Evidence that the learner can describe nuclear change in beta-minus emission.',
array['upper_secondary'],'human_governed','9f0e9d540faa72590919474ca05e9a05bfb208a44953942040ba09716c36cc81','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.gamma-decay','Determine nucleon and proton changes in gamma emission','Evidence that the learner can determine nucleon and proton changes in gamma emission.',
array['upper_secondary'],'human_governed','1e513931f43d1cf643ad82626dab295e13a9faad3f2fc45821342f3409e8b31a','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.random-decay','Explain random and spontaneous radioactive decay','Evidence that the learner can explain random and spontaneous radioactive decay.',
array['upper_secondary'],'human_governed','b1d1989da4b89c7905c5cb96e0d40b5374a1bf45b4fa80d20b9210d577eb639b','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.half-life-definition','Define radioactive half-life','Evidence that the learner can define radioactive half-life.',
array['upper_secondary'],'human_governed','6bdf922481871a864ec24222f331328e66341ea92d2e859ae95827f5f65e1dc6','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.half-life-remaining','Calculate undecayed quantity after whole half-lives','Evidence that the learner can calculate undecayed quantity after whole half-lives.',
array['upper_secondary'],'human_governed','1139c45d91fe103973d37e3f02401cfe4b947d46755b399e95c02b18f8176206','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.half-life-from-data','Determine half-life from decay data','Evidence that the learner can determine half-life from decay data.',
array['upper_secondary'],'human_governed','180d21906ac5aedffe748ca0f69e49a93aed89cfd2f5461448e729f48d475cf4','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.smoke-detectors','Explain alpha radiation use in smoke detectors','Evidence that the learner can explain alpha radiation use in smoke detectors.',
array['upper_secondary'],'human_governed','8a511265d81a596425f02cb6d08585c1ac356714b74beb999aeec8c753ed8ef1','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.thickness-monitoring','Select radiation for thickness monitoring','Evidence that the learner can select radiation for thickness monitoring.',
array['upper_secondary'],'human_governed','66083e1c3702af7962922845f970c7b061c0d1e195818faa04a89665977158d3','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.nuclear.radioactivity.focus.radiation-safety','Select effective exposure-reduction precautions','Evidence that the learner can select effective exposure-reduction precautions.',
array['upper_secondary'],'human_governed','e7a91144e844da31726686ffe0d66fc859684a8c34aa472004376a117889153e','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.solar-system.focus.planet-order','Recall planet order from the Sun','Evidence that the learner can recall planet order from the Sun.',
array['upper_secondary'],'human_governed','994d518800b3c2f03e140b8076eb66e6035a399b0ddf231eae7f449ce7c782e7','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.solar-system.focus.orbital-speed-distance','Predict orbital speed with distance from the Sun','Evidence that the learner can predict orbital speed with distance from the Sun.',
array['upper_secondary'],'human_governed','eb9fa52019c6650713a85d3db43468127f286f07aaed5ec76a20efb60591d1fe','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.solar-system.focus.orbital-speed-calculation','Calculate orbital speed from radius and period','Evidence that the learner can calculate orbital speed from radius and period.',
array['upper_secondary'],'human_governed','29b290eb9b11b79fa7468e60e797a2eea5c62c430edad94502a73ddccd57c1bf','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.solar-system.focus.light-travel-time','Calculate light travel time across astronomical distances','Evidence that the learner can calculate light travel time across astronomical distances.',
array['upper_secondary'],'human_governed','9c83f50c4f1e3b422a538efb368626aa248e18af8eb3341fabed64a213b3987c','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.stars.focus.stellar-composition','Describe the Sun''s composition and size','Evidence that the learner can describe the Sun''s composition and size.',
array['upper_secondary'],'human_governed','bfdf90cd9d7a9b3dac671f56c3480360c278ee2a18ebdd8bace34e1991c6f1f1','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.stars.focus.solar-spectrum','Identify the main regions of solar radiation','Evidence that the learner can identify the main regions of solar radiation.',
array['upper_secondary'],'human_governed','389acc7702439de5bf599382867cffecf5a5ad1838875313ccf4085712607592','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.stars.focus.stellar-fusion','Identify hydrogen fusion as stable-star energy source','Evidence that the learner can identify hydrogen fusion as stable-star energy source.',
array['upper_secondary'],'human_governed','c39887e927f13951951b6738c3138506d7ed4b23e335ef5a85e9d0f71f2b5ebb','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.cosmology.focus.galaxy-structure','Describe galaxies as collections of stars','Evidence that the learner can describe galaxies as collections of stars.',
array['upper_secondary'],'human_governed','cead983f9d6ef79fe1293606e6837346383e5075e4105166b125e29a4459be4e','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.cosmology'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.solar-system.focus.light-year-definition','Identify light-year as a distance unit','Evidence that the learner can identify light-year as a distance unit.',
array['upper_secondary'],'human_governed','27c1f6af449311a1c9601aeb3a1dbf8807394952b97cee71c33f000f8ef1103b','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.solar-system.focus.light-year-conversion','Convert astronomical distances using a supplied light-year value','Evidence that the learner can convert astronomical distances using a supplied light-year value.',
array['upper_secondary'],'human_governed','a3c5108434ad092ca44886a0193b6bcd9536156a4ba38baa4dca526b00c3f05b','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.stars.focus.protostar-formation','Describe gravitational protostar formation','Evidence that the learner can describe gravitational protostar formation.',
array['upper_secondary'],'human_governed','689f3cc9da6ee1f7946a60c40d785e02bc5d02ada983a6cf0da42eb0a2b0f091','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.stars.focus.low-mass-evolution','Identify red-giant evolution of a Sun-like star','Evidence that the learner can identify red-giant evolution of a Sun-like star.',
array['upper_secondary'],'human_governed','bc4a558f942b81a6a63319c162d1184c292cb41112bb51be6f32fce3f4cf53b5','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.stars.focus.low-mass-remnant','Identify the white-dwarf remnant of a Sun-like star','Evidence that the learner can identify the white-dwarf remnant of a Sun-like star.',
array['upper_secondary'],'human_governed','4c4a9457e217374767ba3502efa3c61d3daab3d742b1afe3d29db37c29a87236','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.stars.focus.massive-star-evolution','Sequence the evolution of massive stars','Evidence that the learner can sequence the evolution of massive stars.',
array['upper_secondary'],'human_governed','d836770ae15afffbb22456357074cfceaa4977cb61dee477a756ae3d2ba92776','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,'science.physics.space.stars.focus.stellar-recycling','Describe star and planet formation from supernova remnants','Evidence that the learner can describe star and planet formation from supernova remnants.',
array['upper_secondary'],'human_governed','9d09d277e071a88da9114ff5783bfadf605c37af8c5de4b91bd3c11ac8789b89','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;

update public.academic_skill_registry_subject_aliases
set allowed_programme_codes=array(select distinct x from unnest(allowed_programme_codes||array['0654']) x order by x)
where alias_normalized='physics' and status='active'
  and registry_version_id=(select id from public.academic_skill_registry_versions where code='bh-science-core-v1');

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.1.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.atomic-structure'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.1.3','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.atomic-structure'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.1.5','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.atomic-structure'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.1.7','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.nuclear-reactions'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.2.1.2','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.2.2.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.2.3.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.2.3.3','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.2.3.4','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.2.4.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.2.5.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P5.2.5.3','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.nuclear.radioactivity'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.3.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.cosmology'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.1.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.1.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.1.2','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.1.6','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.1.7','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.solar-system'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.1.5','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.1.8','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.2.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.2.2','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P6.2.2.3','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.space.stars'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.1.2.6','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.gases'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.1.3.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.gases'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.3.1.2','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.3.2.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.3.2.3','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.3.3.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.3.3.2','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.3.3.3','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.3.4.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.heat-transfer'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.1.1.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.1.2.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.1.2.2','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.1.2.4','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.1.2.5','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.2.1.1','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.2.1.2','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.2.2.3','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.2.2.5','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;

insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
'CIE0654-2025-2027-P2.2.2.6','subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf','2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code='science.physics.thermal.temperature-particle'
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;
