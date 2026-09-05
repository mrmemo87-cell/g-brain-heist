-- Canonical teacher -> class -> student roster visibility.
--
-- class_teacher_assignments is the authority for teacher allocations.
-- class_students is the authority for current student placement.
-- Never derive teacher roster access from legacy classes.teacher_id.

create schema if not exists private;

create or replace function private.current_teacher_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct cta.class_id
  from public.class_teacher_assignments cta
  join public.classes c
    on c.id = cta.class_id
   and c.school_id = cta.school_id
  where cta.teacher_user_id = (select auth.uid())
    and cta.active = true
    and coalesce(c.is_active, true)
    and exists (
      select 1
      from public.school_members sm
      where sm.school_id = cta.school_id
        and sm.user_id = (select auth.uid())
        and sm.status = 'active'
        and (sm.role_in_school = 'teacher' or sm.can_teach = true)
    );
$$;

comment on function private.current_teacher_class_ids() is
  'Canonical current-user teacher class scope. Uses active class_teacher_assignments + active school membership; never classes.teacher_id.';

revoke all on function private.current_teacher_class_ids() from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.current_teacher_class_ids() to authenticated;

-- Keep the legacy helper name only as a compatibility wrapper. Its behavior is
-- now canonical, so old callers cannot reintroduce the classes.teacher_id bug.
create or replace function public.get_my_teacher_class_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select class_id
  from private.current_teacher_class_ids() as class_id;
$$;

comment on function public.get_my_teacher_class_ids() is
  'Compatibility wrapper for canonical class_teacher_assignments-based teacher scope.';

revoke all on function public.get_my_teacher_class_ids() from public, anon, authenticated, service_role;
grant execute on function public.get_my_teacher_class_ids() to authenticated;

-- Teachers are roster readers, not placement managers. Placement mutations stay
-- inside the reviewed school-admin placement workflow.
drop policy if exists "Teachers can manage students in their classes" on public.class_students;
drop policy if exists "Teachers can view students in allocated classes" on public.class_students;

create policy "Teachers can view students in allocated classes"
on public.class_students
for select
to authenticated
using (
  class_id in (select private.current_teacher_class_ids())
);

notify pgrst, 'reload schema';
