with v as (
  select id from public.academic_skill_registry_versions
  where code='bh-global-perspectives-core-v1'
)
insert into public.academic_skill_registry_subject_aliases(
  alias_normalized,registry_version_id,allowed_strand_codes,display_name,status
)
select 'global perspective',v.id,null,'Global Perspective','active' from v
on conflict(alias_normalized) do update set
  registry_version_id=excluded.registry_version_id,status='active';
