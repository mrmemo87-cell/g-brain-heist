with v as (
  select id from public.academic_skill_registry_versions where code='bh-english-core-v1'
),
programmes(programme_code,programme_name,phase,source_url,source_version) as (
  values
    ('0057','Cambridge Primary English as a Second Language','primary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-primary/curriculum/english-as-a-second-language/','current public framework overview'),
    ('0058','Cambridge Primary English','primary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-primary/curriculum/english/','current public programme overview'),
    ('0876','Cambridge Lower Secondary English as a Second Language','lower_secondary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-lower-secondary/curriculum/english-as-a-second-language/','current public framework overview'),
    ('0861','Cambridge Lower Secondary English','lower_secondary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-lower-secondary/curriculum/english/','current public programme overview'),
    ('0472','Cambridge IGCSE English as an Additional Language','upper_secondary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-as-an-additional-language-0472/','2026-2028 public syllabus overview'),
    ('0500','Cambridge IGCSE First Language English','upper_secondary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-first-language-0500/','2027-2029 public syllabus overview'),
    ('0510','Cambridge IGCSE English as a Second Language (Speaking Endorsement)','upper_secondary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-second-language-oral-endorsement-0510/','2027-2029 syllabus'),
    ('0511','Cambridge IGCSE English as a Second Language (Count-in Speaking)','upper_secondary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-second-language-count-in-oral-0511/','2027-2029 syllabus')
),
eligible as (
  select v.id registry_version_id,p.*,n.id node_id,n.code node_code
  from v cross join programmes p
  join public.academic_skill_registry_nodes n
    on n.registry_version_id=v.id
   and n.status='active'
   and p.phase=any(n.applicable_phases)
)
insert into public.academic_skill_framework_crosswalks(
  registry_version_id,node_id,provider_name,programme_code,programme_name,phase,
  external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status
)
select e.registry_version_id,e.node_id,'Cambridge International Education',
  e.programme_code,e.programme_name,e.phase,
  case
    when split_part(e.node_code,'.',2)='reading' then 'Reading'
    when split_part(e.node_code,'.',2)='writing' then 'Writing'
    when split_part(e.node_code,'.',2)='speaking' then 'Speaking'
    when split_part(e.node_code,'.',2)='listening' then 'Listening'
    when split_part(e.node_code,'.',2)='use-of-english' and e.programme_code in ('0057','0876') then 'Use of English'
    when split_part(e.node_code,'.',2)='use-of-english' then 'Integrated language control'
  end,
  null,'programme',
  'Brain Heist canonical competency crosswalk at programme level; exact Cambridge objective wording is not reproduced.',
  e.source_url,e.source_version,'active'
from eligible e
where not exists (
  select 1
  from public.academic_skill_framework_crosswalks c
  where c.node_id=e.node_id
    and c.programme_code=e.programme_code
    and c.status='active'
)
on conflict do nothing;
