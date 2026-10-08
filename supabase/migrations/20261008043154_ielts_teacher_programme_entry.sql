-- Lightweight teacher navigation discovery; the existing workspace authorizes every operation.
create function public.rpc_ielts_teacher_programme_entry() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('schools', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name, s.id)
    from private.ielts_programme_leads l
    join public.schools s on s.id = l.school_id
    where auth.uid() is not null
      and l.teacher_id = auth.uid()
      and l.revoked_at is null
      and private.is_ielts_programme_lead(l.school_id, auth.uid())
  ), '[]'::jsonb));
$$;
revoke all on function public.rpc_ielts_teacher_programme_entry() from public, anon, authenticated, service_role;
grant execute on function public.rpc_ielts_teacher_programme_entry() to authenticated;
