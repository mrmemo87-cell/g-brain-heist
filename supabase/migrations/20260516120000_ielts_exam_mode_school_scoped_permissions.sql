-- Phase 0 IELTS Academy permission alignment.
--
-- Purpose:
-- - Keep legacy IELTS global admins separate from school-scoped IELTS Exam Mode.
-- - Allow platform admins and school admins to manage only school-scoped exams they own by role/school.
-- - Keep assigned teachers monitor-scoped through class_teacher_assignments; teachers do not receive answer_key.
-- - Preserve the existing student Exam Mode RPC surface and answer_key protections.

create or replace function public.can_manage_ielts_exam(p_exam_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and (
          coalesce(u.is_admin, false) = true
          or coalesce(u.role, '') in ('admin', 'superadmin')
        )
    )
    or exists (
      select 1
      from public.ielts_exam_events e
      join public.users u on u.id = auth.uid()
      where e.id = p_exam_event_id
        and e.school_id is not null
        and u.school_id = e.school_id
        and coalesce(u.role, '') = 'school_admin'
    )
    or exists (
      select 1
      from public.ielts_exam_events e
      join public.school_members sm on sm.school_id = e.school_id
      where e.id = p_exam_event_id
        and e.school_id is not null
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role_in_school in ('school_admin', 'admin', 'superadmin')
    );
$$;

create or replace function public.can_create_ielts_exam(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and (
          coalesce(u.is_admin, false) = true
          or coalesce(u.role, '') in ('admin', 'superadmin')
          or (coalesce(u.role, '') = 'school_admin' and u.school_id = p_school_id)
        )
    )
    or exists (
      select 1
      from public.school_members sm
      where sm.school_id = p_school_id
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role_in_school in ('school_admin', 'admin', 'superadmin')
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
    and exists (
      select 1
      from public.ielts_exam_events e
      join public.classes c on c.id = p_class_id and c.school_id = e.school_id
      where e.id = p_exam_event_id
        and coalesce(c.is_active, true) = true
    );
$$;

drop function if exists public.rpc_ielts_get_exam_admin_detail(uuid);
create or replace function public.rpc_ielts_get_exam_admin_detail(p_exam_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ielts_exam_events%rowtype;
  v_classes jsonb := '[]'::jsonb;
  v_students jsonb := '[]'::jsonb;
  v_forms jsonb := '[]'::jsonb;
  v_assignments jsonb := '[]'::jsonb;
  v_is_manager boolean := false;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_event from public.ielts_exam_events where id = p_exam_event_id;
  if v_event.id is null then raise exception 'exam_not_found'; end if;
  v_is_manager := public.can_manage_ielts_exam(p_exam_event_id);
  if not v_is_manager and not public.can_monitor_ielts_exam(p_exam_event_id) then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(
    case when v_is_manager then to_jsonb(f) else to_jsonb(f) - 'answer_key' end
    order by f.created_at desc
  ), '[]'::jsonb)
  into v_forms
  from public.ielts_exam_forms f
  where f.exam_event_id = p_exam_event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'school_id', c.school_id,
    'class_code', c.class_code,
    'class_name', c.class_name,
    'grade_level', c.grade_level,
    'is_active', c.is_active
  ) order by c.class_name), '[]'::jsonb)
  into v_classes
  from public.classes c
  where c.school_id = v_event.school_id
    and coalesce(c.is_active, true) = true
    and (
      v_is_manager
      or exists (
        select 1 from public.class_teacher_assignments cta
        where cta.class_id = c.id and cta.teacher_user_id = auth.uid() and coalesce(cta.active, true) = true
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', u.id,
    'username', u.username,
    'email', u.email,
    'class_id', cs.class_id,
    'class_name', c.class_name,
    'grade', u.grade,
    'batch', u.batch
  ) order by c.class_name, u.username), '[]'::jsonb)
  into v_students
  from public.users u
  left join public.class_students cs on cs.student_id = u.id
  left join public.classes c on c.id = cs.class_id
  where u.school_id = v_event.school_id
    and coalesce(u.role, 'student') = 'student'
    and (
      v_is_manager
      or exists (
        select 1 from public.class_teacher_assignments cta
        where cta.class_id = cs.class_id and cta.teacher_user_id = auth.uid() and coalesce(cta.active, true) = true
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'student_id', a.student_id,
    'username', u.username,
    'class_id', a.class_id,
    'class_name', c.class_name,
    'form_id', a.form_id,
    'status', a.status,
    'created_at', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  into v_assignments
  from public.ielts_exam_assignments a
  join public.users u on u.id = a.student_id
  left join public.classes c on c.id = a.class_id
  where a.exam_event_id = p_exam_event_id
    and (
      v_is_manager
      or exists (
        select 1 from public.class_teacher_assignments cta
        where cta.class_id = a.class_id and cta.teacher_user_id = auth.uid() and coalesce(cta.active, true) = true
      )
    );

  return jsonb_build_object(
    'exam', to_jsonb(v_event),
    'forms', v_forms,
    'classes', v_classes,
    'students', v_students,
    'assignments', v_assignments
  );
end;
$$;

comment on function public.can_manage_ielts_exam(uuid) is 'School-scoped IELTS Exam Mode manager check. Legacy IELTS admins are not included unless they also have platform or school exam permissions.';
comment on function public.can_create_ielts_exam(uuid) is 'Allows platform admins and school admins to create IELTS Exam Mode events for their scoped school only.';
comment on function public.can_assign_ielts_exam_class(uuid, uuid) is 'Restricts IELTS Exam Mode assignment writes to exam managers; assigned teachers remain monitor-only.';
comment on function public.rpc_ielts_get_exam_admin_detail(uuid) is 'Returns Exam Mode details scoped by school/class; answer_key is returned only to managers and omitted for monitor-only teachers.';

grant execute on function public.can_manage_ielts_exam(uuid) to authenticated;
grant execute on function public.can_create_ielts_exam(uuid) to authenticated;
grant execute on function public.can_assign_ielts_exam_class(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_get_exam_admin_detail(uuid) to authenticated;
