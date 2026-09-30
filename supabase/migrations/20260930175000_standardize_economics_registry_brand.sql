-- Standardize the live Economics registry display title with the canonical product brand.
update public.academic_skill_registry_versions
set title='Brains Heist Economics Core Skill Registry v1'
where code='bh-economics-core-v1'
  and title is distinct from 'Brains Heist Economics Core Skill Registry v1';
