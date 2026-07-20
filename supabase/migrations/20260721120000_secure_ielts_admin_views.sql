-- Prevent anonymous or ordinary authenticated clients from querying admin-only
-- IELTS views, including the view that joins auth.users for email addresses.
-- Admin UI access is preserved through RPCs with an explicit server-side guard.

revoke all on table public.ielts_users_admin from anon, authenticated;
revoke all on table public.ielts_prime_applications_admin from anon, authenticated;
revoke all on table public.ielts_admin_stats from anon, authenticated;

create or replace function public.rpc_admin_ielts_users()
returns setof public.ielts_users_admin
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not (
    public.is_superadmin()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and (u.role = 'admin' or coalesce(u.is_admin, false))
    )
  ) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return query
  select *
  from public.ielts_users_admin
  order by created_at desc;
end;
$$;

create or replace function public.rpc_admin_ielts_stats()
returns setof public.ielts_admin_stats
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not (
    public.is_superadmin()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and (u.role = 'admin' or coalesce(u.is_admin, false))
    )
  ) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return query select * from public.ielts_admin_stats;
end;
$$;

revoke all on function public.rpc_admin_ielts_users() from public, anon;
revoke all on function public.rpc_admin_ielts_stats() from public, anon;
grant execute on function public.rpc_admin_ielts_users() to authenticated;
grant execute on function public.rpc_admin_ielts_stats() to authenticated;

comment on function public.rpc_admin_ielts_users() is
  'Global-admin-only replacement for direct access to ielts_users_admin.';
comment on function public.rpc_admin_ielts_stats() is
  'Global-admin-only replacement for direct access to ielts_admin_stats.';
