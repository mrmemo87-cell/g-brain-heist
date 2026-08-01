-- Cover audit-log foreign keys for member and actor history lookups.
create index if not exists school_member_role_audit_member_created_idx
  on public.school_member_role_audit (member_user_id, created_at desc);

create index if not exists school_member_role_audit_actor_created_idx
  on public.school_member_role_audit (actor_user_id, created_at desc);
