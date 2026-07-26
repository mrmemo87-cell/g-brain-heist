-- Resolve Clan Territory school/class eligibility from the canonical school model.
-- The legacy public.profiles table is intentionally not consulted.

create or replace function public.rpc_clan_territory_my_context()
returns jsonb
language sql
stable
security invoker
set search_path = public, auth
as $$
  with me as (
    select
      u.id,
      u.username,
      u.batch,
      u.school_id
    from public.users u
    where u.id = (select auth.uid())
  ),
  resolved_school as (
    select
      m.*,
      coalesce(
        (
          select sm.school_id
          from public.school_members sm
          where sm.user_id = m.id
            and sm.status = 'active'
            and sm.school_id = m.school_id
          order by sm.updated_at desc nulls last, sm.joined_at desc nulls last
          limit 1
        ),
        (
          select sm.school_id
          from public.school_members sm
          where sm.user_id = m.id
            and sm.status = 'active'
          order by sm.updated_at desc nulls last, sm.joined_at desc nulls last
          limit 1
        ),
        m.school_id
      ) as resolved_school_id
    from me m
  ),
  canonical_classes as (
    select distinct
      upper(regexp_replace(btrim(c.class_code), '\s+', '', 'g')) as class_code
    from resolved_school rs
    join public.class_students cs on cs.student_id = rs.id
    join public.classes c on c.id = cs.class_id
    where coalesce(c.is_active, true)
      and c.school_id = rs.resolved_school_id
      and nullif(btrim(c.class_code), '') is not null
  ),
  canonical_class_array as (
    select array_agg(cc.class_code order by cc.class_code) as class_codes
    from canonical_classes cc
  )
  select jsonb_build_object(
    'username', rs.username,
    'school_id', rs.resolved_school_id,
    'class_codes', coalesce(
      cca.class_codes,
      case
        when nullif(btrim(rs.batch), '') is not null
          then array[upper(regexp_replace(btrim(rs.batch), '\s+', '', 'g'))]
        else array[]::text[]
      end
    ),
    'class_source', case
      when cca.class_codes is not null then 'class_students'
      when nullif(btrim(rs.batch), '') is not null then 'users.batch'
      else 'none'
    end
  )
  from resolved_school rs
  cross join canonical_class_array cca;
$$;

revoke all on function public.rpc_clan_territory_my_context() from public;
revoke all on function public.rpc_clan_territory_my_context() from anon;
grant execute on function public.rpc_clan_territory_my_context() to authenticated;
grant execute on function public.rpc_clan_territory_my_context() to service_role;

comment on function public.rpc_clan_territory_my_context() is
  'Returns the authenticated user school and normalized active class codes for Clan Territory eligibility.';
