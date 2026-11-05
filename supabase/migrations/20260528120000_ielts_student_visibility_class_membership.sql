create or replace function public.rpc_ielts_practice_student_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_school_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select u.school_id
  into v_school_id
  from public.users u
  where u.id = v_user_id;

  if v_school_id is null then
    raise exception 'school_required';
  end if;

  return coalesce((
    with visible_assignments as (
      -- Class-targeted assignments: visibility is based on CURRENT class membership.
      select distinct a.id
      from public.class_students cs
      join public.classes c
        on c.id = cs.class_id
       and c.school_id = v_school_id
      join public.ielts_practice_assignments a
        on a.class_id = c.id
       and a.school_id = v_school_id
      where cs.student_id = v_user_id
        and a.status in ('assigned', 'closed')

      union

      -- Individual path: direct rows still grant visibility for individual-style assignments.
      select distinct a.id
      from public.ielts_practice_assignment_students s
      join public.ielts_practice_assignments a
        on a.id = s.assignment_id
      where s.student_id = v_user_id
        and a.school_id = v_school_id
        and (a.class_id is null)
        and (a.status in ('assigned', 'closed') or s.status = 'completed')
    )
    select jsonb_agg(
      public.ielts_practice_assignment_payload(a.id)
      || jsonb_build_object(
        'student_assignment_id', s.id,
        'student_status', coalesce(s.status, 'assigned'),
        'completed_at', s.completed_at,
        'student_updated_at', s.updated_at
      )
      order by a.created_at desc
    )
    from visible_assignments va
    join public.ielts_practice_assignments a
      on a.id = va.id
    left join public.ielts_practice_assignment_students s
      on s.assignment_id = a.id
     and s.student_id = v_user_id
    where a.school_id = v_school_id
      and a.status <> 'archived'
      and a.status <> 'draft'
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.rpc_ielts_practice_student_assignments() to authenticated;
