create index if not exists academic_skill_registry_aliases_node_idx
  on public.academic_skill_registry_aliases(node_id);

create index if not exists academic_skill_framework_crosswalks_registry_idx
  on public.academic_skill_framework_crosswalks(registry_version_id);
