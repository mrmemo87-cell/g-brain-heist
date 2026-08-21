-- Silk Road 2026/27 migration, phase 1.
--
-- Preserve all historical assignments, recipients, results, classes, and users.
-- Only deactivate active teacher allocations that:
--   1) belong to Silk Road International School,
--   2) point to a teacher_user_id that no longer exists, and
--   3) already have another active, valid school member covering the same class + subject.
--
-- This is intentionally non-destructive: orphan rows remain in place with active = false.

do $$
declare
  v_school_id uuid;
  v_candidate_count integer := 0;
  v_updated_count integer := 0;
begin
  select s.id
    into v_school_id
  from public.schools s
  where s.name = 'Silk Road International School'
  order by s.created_at asc, s.id
  limit 1;

  if v_school_id is null then
    raise exception 'silk_road_school_not_found';
  end if;

  select count(*)::integer
    into v_candidate_count
  from public.class_teacher_assignments orphaned
  where orphaned.school_id = v_school_id
    and orphaned.active = true
    and not exists (
      select 1
      from public.users u
      where u.id = orphaned.teacher_user_id
    )
    and exists (
      select 1
      from public.class_teacher_assignments replacement
      join public.users replacement_user
        on replacement_user.id = replacement.teacher_user_id
      join public.school_members replacement_member
        on replacement_member.school_id = replacement.school_id
       and replacement_member.user_id = replacement.teacher_user_id
       and replacement_member.status = 'active'
       and replacement_member.can_teach = true
      where replacement.school_id = orphaned.school_id
        and replacement.class_id = orphaned.class_id
        and replacement.id <> orphaned.id
        and replacement.active = true
        and lower(trim(replacement.subject)) = lower(trim(orphaned.subject))
    );

  update public.class_teacher_assignments orphaned
  set active = false
  where orphaned.school_id = v_school_id
    and orphaned.active = true
    and not exists (
      select 1
      from public.users u
      where u.id = orphaned.teacher_user_id
    )
    and exists (
      select 1
      from public.class_teacher_assignments replacement
      join public.users replacement_user
        on replacement_user.id = replacement.teacher_user_id
      join public.school_members replacement_member
        on replacement_member.school_id = replacement.school_id
       and replacement_member.user_id = replacement.teacher_user_id
       and replacement_member.status = 'active'
       and replacement_member.can_teach = true
      where replacement.school_id = orphaned.school_id
        and replacement.class_id = orphaned.class_id
        and replacement.id <> orphaned.id
        and replacement.active = true
        and lower(trim(replacement.subject)) = lower(trim(orphaned.subject))
    );

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> v_candidate_count then
    raise exception 'silk_road_orphan_allocation_update_mismatch: expected %, updated %',
      v_candidate_count, v_updated_count;
  end if;
end
$$;
