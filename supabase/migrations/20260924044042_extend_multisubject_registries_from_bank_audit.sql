with additions(version_code,parent_code,node_type,code,name,description,phases) as (
 values
 ('bh-geography-core-v1','geo.environment','skill','geo.environment.hazards','Hazards and resilience',
  'Analyse hazard exposure, vulnerability, risk reduction and resilience.',
  array['primary','lower_secondary','upper_secondary']::text[]),
 ('bh-digital-technology-core-v1','digital.data.representation','subskill','digital.data.representation.files-compression','File formats and compression',
  'Explain file formats, compression and trade-offs between size and fidelity.',
  array['lower_secondary','upper_secondary']::text[]),
 ('bh-digital-technology-core-v1','digital.programming.design','subskill','digital.programming.design.version-control','Version control and collaborative development',
  'Use branches, versions and change history to support controlled software development.',
  array['lower_secondary','upper_secondary']::text[]),
 ('bh-digital-technology-core-v1','digital.computer-systems.software','subskill','digital.computer-systems.software.virtualization','Virtualisation',
  'Explain virtual machines, hypervisors and appropriate virtualised environments.',
  array['lower_secondary','upper_secondary']::text[]),
 ('bh-digital-technology-core-v1','digital.computer-systems.hardware','subskill','digital.computer-systems.hardware.performance','Processor performance and parallelism',
  'Explain processor performance, parallelism, bottlenecks and limits to speed-up.',
  array['lower_secondary','upper_secondary']::text[]),
 ('bh-science-core-v1','science.biology.ecology','subskill','science.biology.ecology.classification','Classification of organisms',
  'Classify organisms from observable characteristics and biological evidence.',
  array['primary','lower_secondary','upper_secondary']::text[]),
 ('bh-science-core-v1','science.physics.motion-forces','subskill','science.physics.motion-forces.pressure','Pressure',
  'Relate force and area to pressure and interpret pressure effects.',
  array['primary','lower_secondary','upper_secondary']::text[]),
 ('bh-science-core-v1','science.physics.energy','subskill','science.physics.energy.efficiency','Energy efficiency',
  'Calculate or evaluate useful output, wasted energy and efficiency.',
  array['primary','lower_secondary','upper_secondary']::text[]),
 ('bh-science-core-v1','science.physics.energy','subskill','science.physics.energy.machines','Simple machines and mechanical advantage',
  'Explain how simple machines transfer forces or change mechanical advantage.',
  array['primary','lower_secondary']::text[]),
 ('bh-travel-tourism-core-v1','travel.industry-destinations.destination','subskill','travel.industry-destinations.destination.access','Destination access and connectivity',
  'Evaluate how transport access and connectivity affect destination appeal and development.',
  array['upper_secondary']::text[])
)
insert into public.academic_skill_registry_nodes(
 registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,p.id,a.node_type,a.code,a.name,a.description,a.phases,'active'
from additions a
join public.academic_skill_registry_versions v on v.code=a.version_code
join public.academic_skill_registry_nodes p on p.code=a.parent_code
on conflict(code) do update set
 parent_id=excluded.parent_id,name=excluded.name,description=excluded.description,
 applicable_phases=excluded.applicable_phases,status='active',updated_at=now();
