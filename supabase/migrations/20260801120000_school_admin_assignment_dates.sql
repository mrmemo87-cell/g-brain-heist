-- Include a stable assignment date in the existing school-admin assignment feed.
-- to_jsonb keeps this compatible with installations where the timestamp column
-- was named created_at or assigned_at.
create or replace function public.school_admin_list_teacher_assignments(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_school_admin_of(p_school_id) then
    raise exception 'Forbidden: not a school admin of this school';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'school_id', a.school_id,
        'class_id', a.class_id,
        'teacher_user_id', a.teacher_user_id,
        'subject', a.subject,
        'active', a.active,
        'assigned_at', coalesce(to_jsonb(a)->>'assigned_at', to_jsonb(a)->>'created_at')
      ) order by a.class_id, a.subject, a.teacher_user_id
    )
    from public.class_teacher_assignments a
    where a.school_id = p_school_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.school_admin_list_teacher_assignments(uuid) from public, anon;
grant execute on function public.school_admin_list_teacher_assignments(uuid) to authenticated;
