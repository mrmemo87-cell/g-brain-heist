-- Keep the legacy account role aligned with the authoritative school membership.
-- Older school approvals could leave an owner labelled as a teacher globally
-- even though their active school membership was administrative.
update public.users u
set role = 'school_admin',
    updated_at = now()
where u.role <> 'admin'
  and u.role <> 'school_admin'
  and exists (
    select 1
    from public.school_members sm
    where sm.user_id = u.id
      and sm.status = 'active'
      and sm.role_in_school = 'school_admin'
  );

notify pgrst, 'reload schema';
