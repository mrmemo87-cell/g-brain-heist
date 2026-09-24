update public.academic_skill_registry_nodes
set applicable_phases=array['primary','lower_secondary','upper_secondary']::text[],updated_at=now()
where code in (
  'geo.human.settlement.urbanisation',
  'geo.physical.weather-climate.atmosphere',
  'geo.physical.rivers-water.processes',
  'geo.physical.coasts',
  'geo.physical.coasts.processes',
  'geo.human.population.structure',
  'math.geometry-measure.transformations-vectors',
  'math.geometry-measure.transformations-vectors.transformations',
  'science.physics.fields'
);

update public.academic_skill_registry_nodes
set applicable_phases=array['lower_secondary','upper_secondary']::text[],updated_at=now()
where code in (
  'math.algebra.advanced',
  'math.algebra.advanced.fractions'
);

with additions(version_code,parent_code,node_type,code,name,description,phases) as (
 values
 ('bh-mathematics-core-v1','math.algebra.patterns-sequences','subskill',
  'math.algebra.patterns-sequences.rules','Input-output and functional rules',
  'Infer, express and apply rules connecting inputs and outputs or successive values.',
  array['primary','lower_secondary','upper_secondary']::text[]),
 ('bh-science-core-v1','science.physics.thermal','subskill',
  'science.physics.thermal.temperature-particle','Temperature and particle energy',
  'Relate temperature to particle motion or kinetic energy in a thermal model.',
  array['primary','lower_secondary','upper_secondary']::text[]),
 ('bh-science-core-v1','science.chemistry.particle-model','subskill',
  'science.chemistry.particle-model.material-properties','Material properties',
  'Use observations and tests to describe, compare or infer properties of materials.',
  array['primary','lower_secondary','upper_secondary']::text[]),
 ('bh-science-core-v1','science.physics.fields','subskill',
  'science.physics.fields.magnetism','Magnetism',
  'Classify magnetic materials and explain basic magnetic interactions.',
  array['primary','lower_secondary','upper_secondary']::text[])
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
