with v as (select id from public.academic_skill_registry_versions where code='bh-mathematics-core-v1')
insert into public.academic_skill_registry_nodes(
  registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,p.id,'skill','math.algebra.calculus','Calculus',
       'Reason about rates of change, derivatives, accumulation and integration.',
       array['upper_secondary']::text[],'active'
from v join public.academic_skill_registry_nodes p on p.code='math.algebra'
on conflict(code) do update set parent_id=excluded.parent_id,name=excluded.name,
 description=excluded.description,applicable_phases=excluded.applicable_phases,status='active',updated_at=now();

with v as (select id from public.academic_skill_registry_versions where code='bh-mathematics-core-v1'),
seed(code,name,description) as (values
 ('math.algebra.calculus.derivatives','Differentiation and rates of change','Use derivatives to represent and analyse rates of change.'),
 ('math.algebra.calculus.integration','Integration and accumulation','Use integration or antiderivatives to reason about accumulation and area.')
)
insert into public.academic_skill_registry_nodes(
 registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,p.id,'subskill',s.code,s.name,s.description,array['upper_secondary']::text[],'active'
from v cross join seed s join public.academic_skill_registry_nodes p on p.code='math.algebra.calculus'
on conflict(code) do update set parent_id=excluded.parent_id,name=excluded.name,
 description=excluded.description,applicable_phases=excluded.applicable_phases,status='active',updated_at=now();
