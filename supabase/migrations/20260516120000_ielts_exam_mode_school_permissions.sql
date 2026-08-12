-- Forward-only repair for IELTS Exam Mode long-term multi-school permissions.
--
-- Exam Mode is administered through Brains Heist school permissions, not the
-- legacy IELTS admin flag. Legacy rpc_is_ielts_admin access remains valid for
-- old IELTS admin pages only; these helpers intentionally do not reference it.
--
-- Model after this repair:
-- - users.is_admin, users.role='admin', users.role='superadmin', or superadmins
--   can create/manage global and school-scoped Exam Mode exams.
-- - school_admin users can create/manage only their own school exams through an
--   active school_members school_admin row or their users.school_id fallback.
-- - assigned teachers can monitor/operate exams for classes they are assigned
--   to, but cannot create arbitrary school-scoped exams from legacy IELTS admin
--   status alone.

create or replace function public.ielts_exam_mode_is_global_admin(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin(coalesce(p_user_id, auth.uid()))
    or exists (
      select 1
      from public.users u
      where u.id = coalesce(p_user_id, auth.uid())
        and coalesce(u.role, '') in ('admin', 'superadmin')
    );
$$;

create or replace function public.ielts_exam_mode_is_school_admin(p_school_id uuid, p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_school_id is not null
    and (
      exists (
        select 1
        from public.school_members sm
        where sm.school_id = p_school_id
          and sm.user_id = coalesce(p_user_id, auth.uid())
          and sm.status = 'active'
          and sm.role_in_school = 'school_admin'
      )
      or exists (
        select 1
        from public.users u
        where u.id = coalesce(p_user_id, auth.uid())
          and u.school_id = p_school_id
          and coalesce(u.role, '') = 'school_admin'
      )
    );
$$;

create or replace function public.can_create_ielts_exam(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ielts_exam_mode_is_global_admin(auth.uid())
    or public.ielts_exam_mode_is_school_admin(p_school_id, auth.uid());
$$;

create or replace function public.can_manage_ielts_exam(p_exam_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.ielts_exam_mode_is_global_admin(auth.uid())
    or exists (
      select 1
      from public.ielts_exam_events e
      where e.id = p_exam_event_id
        and public.ielts_exam_mode_is_school_admin(e.school_id, auth.uid())
    )
    or exists (
      select 1
      from public.ielts_exam_events e
      where e.id = p_exam_event_id
        and e.created_by = auth.uid()
        and public.can_create_ielts_exam(e.school_id)
    );
$$;

create or replace function public.can_assign_ielts_exam_class(p_exam_event_id uuid, p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_ielts_exam(p_exam_event_id)
    or exists (
      select 1
      from public.ielts_exam_events e
      join public.classes c on c.id = p_class_id and c.school_id = e.school_id
      join public.class_teacher_assignments cta on cta.class_id = c.id
      where e.id = p_exam_event_id
        and cta.teacher_user_id = auth.uid()
        and coalesce(cta.active, true) = true
    );
$$;

create or replace function public.can_monitor_ielts_exam(p_exam_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_ielts_exam(p_exam_event_id)
    or exists (
      select 1
      from public.ielts_exam_assignments a
      join public.class_teacher_assignments cta on cta.class_id = a.class_id
      where a.exam_event_id = p_exam_event_id
        and a.class_id is not null
        and cta.teacher_user_id = auth.uid()
        and coalesce(cta.active, true) = true
    );
$$;

comment on function public.ielts_exam_mode_is_global_admin(uuid) is 'True for Brains Heist global Exam Mode admins: superadmins, users.is_admin, users.role admin, or users.role superadmin. Does not use legacy IELTS admin status.';
comment on function public.ielts_exam_mode_is_school_admin(uuid, uuid) is 'True when a user has valid Brains Heist school_admin authority for the given school. Does not use legacy IELTS admin status.';
comment on function public.can_create_ielts_exam(uuid) is 'Brains Heist Exam Mode create gate: global admins or school admins for the target school only; legacy IELTS admins are not sufficient.';
comment on function public.can_manage_ielts_exam(uuid) is 'Brains Heist Exam Mode manage gate: global admins or school admins for the exam school only; legacy IELTS admins are not sufficient.';
comment on function public.can_assign_ielts_exam_class(uuid, uuid) is 'Allows Exam Mode class assignment by managers or teachers assigned to that exact class.';
comment on function public.can_monitor_ielts_exam(uuid) is 'Allows Exam Mode monitoring by managers or teachers assigned to classes with assignments in the exam.';

grant execute on function public.ielts_exam_mode_is_global_admin(uuid) to authenticated;
grant execute on function public.ielts_exam_mode_is_school_admin(uuid, uuid) to authenticated;
grant execute on function public.can_create_ielts_exam(uuid) to authenticated;
grant execute on function public.can_manage_ielts_exam(uuid) to authenticated;
grant execute on function public.can_assign_ielts_exam_class(uuid, uuid) to authenticated;
grant execute on function public.can_monitor_ielts_exam(uuid) to authenticated;
