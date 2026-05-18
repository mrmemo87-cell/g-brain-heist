-- IELTS Practice archived assignment view.
-- Keeps archived assignments out of the default manager list while allowing a
-- scoped archive tab and a manager-only restore action that preserves history.

drop function if exists public.rpc_ielts_practice_list_assignments(uuid, uuid);

create or replace function public.rpc_ielts_practice_list_assignments(
  p_school_id uuid default null,
  p_class_id uuid default null,
  p_status_filter text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_status_filter text := lower(coalesce(nullif(trim(p_status_filter), ''), 'active'));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_status_filter not in ('active', 'archived', 'all') then raise exception 'invalid_status_filter'; end if;

  select coalesce(p_school_id, u.school_id) into v_school_id from public.users u where u.id = auth.uid();
  if v_school_id is null then raise exception 'school_required'; end if;

  return coalesce((
    select jsonb_agg(public.ielts_practice_assignment_payload(a.id) order by a.created_at desc)
    from public.ielts_practice_assignments a
    where a.school_id = v_school_id
      and (
        (v_status_filter = 'active' and a.status in ('draft', 'assigned', 'closed'))
        or (v_status_filter = 'archived' and a.status = 'archived')
        or v_status_filter = 'all'
      )
      and (p_class_id is null or a.class_id = p_class_id)
      and public.can_manage_ielts_practice_class(a.school_id, a.class_id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_ielts_practice_restore_assignment(
  p_assignment_id uuid,
  p_status text default 'closed'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.ielts_practice_assignments%rowtype;
  v_restore_status text := lower(coalesce(nullif(trim(p_status), ''), 'closed'));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_restore_status not in ('closed', 'assigned') then raise exception 'invalid_restore_status'; end if;

  select * into v_assignment
  from public.ielts_practice_assignments
  where id = p_assignment_id
  for update;

  if v_assignment.id is null then raise exception 'assignment_not_found'; end if;
  if not public.can_manage_ielts_practice_assignment(p_assignment_id) then raise exception 'forbidden'; end if;
  if v_assignment.status <> 'archived' then raise exception 'assignment_not_archived'; end if;

  update public.ielts_practice_assignments
  set status = v_restore_status
  where id = p_assignment_id;

  return public.ielts_practice_assignment_payload(p_assignment_id);
end;
$$;

grant execute on function public.rpc_ielts_practice_list_assignments(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_ielts_practice_restore_assignment(uuid, text) to authenticated;
