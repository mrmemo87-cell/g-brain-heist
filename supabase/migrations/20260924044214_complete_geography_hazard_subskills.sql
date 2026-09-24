with v as (select id from public.academic_skill_registry_versions where code='bh-geography-core-v1'),
seed(code,name,description) as (values
 ('geo.environment.hazards.risk','Exposure, vulnerability and risk',
  'Explain how exposure, vulnerability and preparedness shape hazard risk and impacts.'),
 ('geo.environment.hazards.resilience','Risk reduction and resilience',
  'Evaluate warning, evacuation, protection, adaptation and build-back-better strategies.')
)
insert into public.academic_skill_registry_nodes(
 registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,p.id,'subskill',s.code,s.name,s.description,
       array['primary','lower_secondary','upper_secondary']::text[],'active'
from v cross join seed s
join public.academic_skill_registry_nodes p on p.code='geo.environment.hazards'
on conflict(code) do update set parent_id=excluded.parent_id,name=excluded.name,
 description=excluded.description,applicable_phases=excluded.applicable_phases,status='active',updated_at=now();
