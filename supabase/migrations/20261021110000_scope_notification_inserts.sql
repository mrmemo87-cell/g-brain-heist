-- Scope client-side notification inserts.
-- Before: notifications_insert_system allowed any caller to insert a
-- notification for any user (WITH CHECK (true)).
-- After: a signed-in user may insert a notification for themselves (e.g.
-- achievement alerts) or for a teacher/school admin in their own school (e.g.
-- ExamGuard auto-submission alerts). Everything else must go through
-- SECURITY DEFINER functions, triggers or the service role, which bypass RLS
-- and are unaffected.

create or replace function public.can_notify_user(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_target = auth.uid()
    or exists (
      select 1
      from public.users target
      join public.users me on me.id = auth.uid()
      where target.id = p_target
        and target.role in ('teacher', 'school_admin', 'admin')
        and target.school_id is not null
        and target.school_id = me.school_id
    );
$$;

revoke all on function public.can_notify_user(uuid) from public, anon;
grant execute on function public.can_notify_user(uuid) to authenticated;

drop policy if exists notifications_insert_system on public.notifications;
drop policy if exists notifications_insert_scoped on public.notifications;

create policy notifications_insert_scoped on public.notifications
  for insert to authenticated
  with check (public.can_notify_user(user_id));
