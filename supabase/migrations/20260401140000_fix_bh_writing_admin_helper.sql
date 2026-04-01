-- Fix bh writing admin/teacher helper to avoid relying on users.role
-- Uses existing repo pattern: admins via users.is_admin and teachers via teachers.user_id

create or replace function public.is_bh_admin_or_teacher()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and coalesce(u.is_admin, false)
  )
  or exists (
    select 1
    from public.teachers t
    where t.user_id = auth.uid()
  );
$$;
