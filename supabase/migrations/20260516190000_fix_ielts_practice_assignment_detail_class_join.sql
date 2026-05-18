-- Forward-only repair for IELTS Practice assignment roster detail.
-- Recreates the manager-scoped detail RPC with class membership joins instead of
-- reading a class column from users.

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
        'created_at', i.created_at,
        'assigned_count', coalesce(item_counts.assigned_count, 0),
        'in_progress_count', coalesce(item_counts.in_progress_count, 0),
        'completed_count', coalesce(item_counts.completed_count, 0),
        'skipped_count', coalesce(item_counts.skipped_count, 0)
      ) order by i.order_index, i.created_at)
      from public.ielts_practice_assignment_items i
      left join lateral (
        select
          count(*) filter (where coalesce(item_s.status, 'assigned') = 'assigned') as assigned_count,
          count(*) filter (where item_s.status = 'in_progress') as in_progress_count,
          count(*) filter (where item_s.status = 'completed') as completed_count,
          count(*) filter (where item_s.status = 'skipped') as skipped_count
        from public.ielts_practice_assignment_students s
        left join public.ielts_practice_assignment_item_students item_s
          on item_s.assignment_item_id = i.id
          and item_s.student_id = s.student_id
        where s.assignment_id = p_assignment_id
      ) item_counts on true
      where i.assignment_id = p_assignment_id
    ), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', roster.student_id,
        'username', roster.username,
        'email', roster.email,
        'class_id', roster.class_id,
        'class_name', roster.class_name,
        'status', roster.status,
        'completed_at', roster.completed_at,
        'updated_at', roster.updated_at,
        'required_count', roster.required_count,
        'completed_required_count', roster.completed_required_count,
        'item_count', roster.item_count,
        'completed_item_count', roster.completed_item_count
      ) order by roster.class_name nulls last, roster.username nulls last, roster.email nulls last)
      from (
        select distinct on (s.student_id)
          s.student_id,
          u.username,
          u.email,
          coalesce(cs.class_id, a.class_id) as class_id,
          c.class_name,
          case
            when s.status not in ('completed', 'excused') and a.due_at is not null and a.due_at < now() then 'overdue'
            else s.status
          end as status,
          s.completed_at,
          s.updated_at,
          coalesce(progress_counts.required_count, 0) as required_count,
          coalesce(progress_counts.completed_required_count, 0) as completed_required_count,
          coalesce(progress_counts.item_count, 0) as item_count,
          coalesce(progress_counts.completed_item_count, 0) as completed_item_count
        from public.ielts_practice_assignment_students s
        join public.users u on u.id = s.student_id
        join public.ielts_practice_assignments a on a.id = s.assignment_id
        left join public.class_students cs
          on cs.student_id = s.student_id
         and (a.class_id is null or cs.class_id = a.class_id)
        left join public.classes c
          on c.id = coalesce(cs.class_id, a.class_id)
         and c.school_id = a.school_id
        left join lateral (
          select
            count(*) filter (where i.required = true) as required_count,
            count(*) filter (where i.required = true and item_s.status = 'completed') as completed_required_count,
            count(*) as item_count,
            count(*) filter (where item_s.status = 'completed') as completed_item_count
          from public.ielts_practice_assignment_items i
          left join public.ielts_practice_assignment_item_students item_s
            on item_s.assignment_item_id = i.id
            and item_s.student_id = s.student_id
          where i.assignment_id = p_assignment_id
        ) progress_counts on true
        where s.assignment_id = p_assignment_id
          and a.school_id = v_assignment.school_id
          and u.school_id = v_assignment.school_id
        order by s.student_id, (coalesce(cs.class_id, a.class_id) = a.class_id) desc, c.class_name nulls last
      ) roster
    ), '[]'::jsonb),
    'item_progress', public.ielts_practice_assignment_progress_payload(p_assignment_id, null)
  );
end;
$$;

grant execute on function public.rpc_ielts_practice_assignment_detail(uuid) to authenticated;
