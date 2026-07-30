-- Allow a teacher to permanently delete only an assignment they created.
-- Assignment-owned questions, student rows, answers, results, submissions, and
-- analyses are removed by their existing ON DELETE CASCADE foreign keys.
create or replace function public.rpc_delete_teacher_assignment(p_assignment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.assignments a
  using public.teachers t
  where a.id = p_assignment_id
    and t.id = a.teacher_id
    and t.user_id = auth.uid()
  returning a.id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Assignment not found or you are not its creator';
  end if;

  return true;
end;
$$;

revoke all on function public.rpc_delete_teacher_assignment(uuid) from public;
grant execute on function public.rpc_delete_teacher_assignment(uuid) to authenticated;
