with v as (
  select id from public.academic_skill_registry_versions where code='bh-english-core-v1'
),
seed(code,parent_code,name,description,phases) as (
  values
    ('eng.use-of-english.verb-tense-time.regular-irregular',
     'eng.use-of-english.verb-tense-time',
     'Regular and irregular verb forms',
     'Form and distinguish common regular and irregular past and participle forms.',
     array['primary','lower_secondary','upper_secondary']::text[]),
    ('eng.use-of-english.adjectives-adverbs.compound-modifiers',
     'eng.use-of-english.adjectives-adverbs',
     'Compound adjective and modifier forms',
     'Form, punctuate and select compound modifiers, including common hyphenation patterns.',
     array['primary','lower_secondary','upper_secondary']::text[])
)
insert into public.academic_skill_registry_nodes(
  registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,p.id,'subskill',s.code,s.name,s.description,s.phases,'active'
from v cross join seed s
join public.academic_skill_registry_nodes p on p.code=s.parent_code
on conflict (code) do update set
  parent_id=excluded.parent_id,name=excluded.name,description=excluded.description,
  applicable_phases=excluded.applicable_phases,status='active',updated_at=now();
