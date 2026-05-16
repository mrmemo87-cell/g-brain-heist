-- Phase 2.7 IELTS Practice Assignment backend repair/hardening.
--
-- This forward-only migration repairs environments that may have already applied
-- 20260516130000_ielts_practice_assignments_foundation.sql before later edits.
-- It recreates the assignment payload helper with an internal permission check,
-- restores/creates the manager-only roster detail RPC, and makes the student
-- assignment RPC return only student-safe assignment data.

create or replace function public.ielts_practice_assignment_payload(p_assignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
  v_is_manager boolean := false;
  v_is_assigned_student boolean := false;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id;

  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;

  v_is_manager := public.can_manage_ielts_practice_assignment(p_assignment_id);
  select exists (
    select 1
    from public.ielts_practice_assignment_students s
    where s.assignment_id = p_assignment_id
      and s.student_id = auth.uid()
  ) into v_is_assigned_student;

  if not (v_is_manager or v_is_assigned_student) then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'id', a.id,
    'school_id', a.school_id,
    'class_id', a.class_id,
    'class_name', c.class_name,
    'assigned_by', a.assigned_by,
    'title', a.title,
    'description', a.description,
    'status', a.status,
    'due_at', a.due_at,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'item_count', coalesce((select count(*) from public.ielts_practice_assignment_items i where i.assignment_id = a.id), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'assignment_id', i.assignment_id,
        'skill', i.skill,
        'content_type', i.content_type,
        'content_id', i.content_id,
        'title', i.title,
        'required', i.required,
        'order_index', i.order_index,
        'created_at', i.created_at
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      where i.assignment_id = a.id
    ), '[]'::jsonb)
  ) into v_payload
  from public.ielts_practice_assignments a
  left join public.classes c on c.id = a.class_id
  where a.id = p_assignment_id;

  if v_is_manager then
    v_payload := v_payload || (
      select jsonb_build_object(
        'total_students', coalesce(count(s.id), 0),
        'assigned_count', coalesce(count(s.id) filter (where s.status = 'assigned'), 0),
        'in_progress_count', coalesce(count(s.id) filter (where s.status = 'in_progress'), 0),
        'completed_count', coalesce(count(s.id) filter (where s.status = 'completed'), 0),
        'overdue_count', coalesce(count(s.id) filter (where s.status = 'overdue' or (v_assignment.due_at is not null and v_assignment.due_at < now() and s.status not in ('completed', 'excused'))), 0),
        'excused_count', coalesce(count(s.id) filter (where s.status = 'excused'), 0),
        'completion_percent', case
          when count(s.id) = 0 then 0
          else round((count(s.id) filter (where s.status = 'completed'))::numeric * 100 / count(s.id), 1)
        end
      )
      from public.ielts_practice_assignment_students s
      where s.assignment_id = p_assignment_id
    );
  end if;

  return v_payload;
end;
$$;

create or replace function public.rpc_ielts_practice_assignment_detail(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id;

  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if not public.can_manage_ielts_practice_assignment(p_assignment_id) then raise exception 'forbidden'; end if;

  return jsonb_build_object(
    'assignment', public.ielts_practice_assignment_payload(p_assignment_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'assignment_id', i.assignment_id,
        'skill', i.skill,
        'content_type', i.content_type,
        'content_id', i.content_id,
        'title', i.title,
        'required', i.required,
        'order_index', i.order_index,
        'created_at', i.created_at
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      where i.assignment_id = p_assignment_id
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', s.student_id,
        'username', u.username,
        'email', u.email,
        'class_id', v_assignment.class_id,
        'class_name', c.class_name,
        'status', case
          when s.status not in ('completed', 'excused') and v_assignment.due_at is not null and v_assignment.due_at < now() then 'overdue'
          else s.status
        end,
        'completed_at', s.completed_at,
        'updated_at', s.updated_at
      ) order by c.class_name nulls last, u.username nulls last, u.email nulls last)
      from public.ielts_practice_assignment_students s
      join public.users u on u.id = s.student_id and u.school_id = v_assignment.school_id
      left join public.classes c on c.id = v_assignment.class_id and c.school_id = v_assignment.school_id
      where s.assignment_id = p_assignment_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_ielts_practice_student_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  return coalesce((
    select jsonb_agg(
      public.ielts_practice_assignment_payload(a.id)
      || jsonb_build_object(
        'student_assignment_id', s.id,
        'student_status', s.status,
        'completed_at', s.completed_at,
        'student_updated_at', s.updated_at
      ) order by s.created_at desc
    )
    from public.ielts_practice_assignment_students s
    join public.ielts_practice_assignments a on a.id = s.assignment_id
    where s.student_id = auth.uid()
      and a.status in ('assigned', 'closed')
  ), '[]'::jsonb);
end;
$$;

-- Internal helper: callable by SECURITY DEFINER RPCs, but not an RPC entry point.
revoke execute on function public.ielts_practice_assignment_payload(uuid) from public;
revoke execute on function public.ielts_practice_assignment_payload(uuid) from authenticated;

-- Intended RPC entry points for authenticated clients.
grant execute on function public.rpc_ielts_practice_list_assignments(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_create_assignment(uuid, uuid, text, text, timestamptz, jsonb) to authenticated;
grant execute on function public.rpc_ielts_practice_assign_to_class(uuid, uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_assign_to_students(uuid, uuid[]) to authenticated;
grant execute on function public.rpc_ielts_practice_assignment_detail(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_student_assignments() to authenticated;
grant execute on function public.rpc_ielts_practice_mark_started(uuid) to authenticated;
grant execute on function public.rpc_ielts_practice_mark_completed(uuid) to authenticated;
