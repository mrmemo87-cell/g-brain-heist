-- Cover each placement-audit foreign key in its useful lookup direction.
-- The existing (school_id, student_user_id, created_at) index remains the
-- primary school-admin history path and already covers the school_id key.

create index if not exists school_student_placement_audit_student_created_idx
  on public.school_student_placement_audit (student_user_id, created_at desc);

create index if not exists school_student_placement_audit_actor_created_idx
  on public.school_student_placement_audit (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists school_student_placement_audit_class_created_idx
  on public.school_student_placement_audit (to_class_id, created_at desc)
  where to_class_id is not null;
