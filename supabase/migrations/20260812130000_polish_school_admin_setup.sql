-- Keep official school identity stable and restore the placement review RPC in
-- the Data API cache. School identity changes are platform-reviewed because the
-- name and logo are embedded in official reports and historical documents.

create or replace function public.update_school_info(
  p_school_id uuid,
  p_name text default null,
  p_logo_url text default null,
  p_allowed_domains text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school public.schools%rowtype;
  v_is_platform_admin boolean := false;
  v_is_school_admin boolean := false;
  v_identity_changed boolean := false;
begin
  if v_actor is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select * into v_school from public.schools where id = p_school_id for update;
  if v_school.id is null then
    return jsonb_build_object('success', false, 'error', 'School not found');
  end if;

  v_is_platform_admin := public.is_superadmin(v_actor);
  select exists(
    select 1
    from public.school_members sm
    where sm.school_id = p_school_id
      and sm.user_id = v_actor
      and sm.role_in_school = 'school_admin'
      and sm.status = 'active'
  ) into v_is_school_admin;

  if not v_is_platform_admin and not v_is_school_admin then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;

  v_identity_changed := (
    p_name is not null
    and coalesce(nullif(trim(p_name), ''), v_school.name) is distinct from v_school.name
  ) or (
    p_logo_url is not null
    and p_logo_url is distinct from v_school.logo_url
  );

  if not v_is_platform_admin and v_identity_changed then
    return jsonb_build_object(
      'success', false,
      'error', 'School identity changes require platform review.',
      'code', 'school_identity_change_requires_platform_approval'
    );
  end if;

  update public.schools
  set name = case when v_is_platform_admin then coalesce(nullif(trim(p_name), ''), name) else name end,
      logo_url = case when v_is_platform_admin then coalesce(p_logo_url, logo_url) else logo_url end,
      allowed_email_domains = coalesce(p_allowed_domains, allowed_email_domains),
      updated_at = now()
  where id = p_school_id;

  if v_is_platform_admin and v_identity_changed then
    insert into public.school_governance_audit_log(
      school_id, actor_user_id, event_type, category, severity, summary, metadata
    ) values (
      p_school_id, v_actor, 'school_identity_changed', 'school', 'warning',
      'Platform administrator changed the verified school identity',
      jsonb_build_object(
        'previous_name', v_school.name,
        'new_name', coalesce(nullif(trim(p_name), ''), v_school.name),
        'logo_changed', p_logo_url is not null and p_logo_url is distinct from v_school.logo_url,
        'domains_changed', p_allowed_domains is not null and p_allowed_domains is distinct from v_school.allowed_email_domains
      )
    );
  end if;

  return jsonb_build_object('success', true, 'message', case when v_identity_changed then 'School identity updated' else 'School information updated' end);
end;
$$;

revoke all on function public.update_school_info(uuid, text, text, text[]) from public, anon, authenticated, service_role;
grant execute on function public.update_school_info(uuid, text, text, text[]) to authenticated, service_role;

comment on function public.update_school_info(uuid, text, text, text[]) is
  'Platform-reviewed school identity update. School administrators cannot mutate report branding directly.';

create or replace function public.rpc_school_admin_list_placement_exceptions(p_school_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.can_administer_school(p_school_id) then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'studentUserId', e.student_user_id,
      'issueCode', e.issue_code,
      'severity', e.severity,
      'status', e.status,
      'observedClassId', e.observed_class_id,
      'expectedClassId', e.expected_class_id,
      'evidence', e.evidence,
      'openedAt', e.opened_at
    ) order by case e.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end, e.opened_at)
    from public.school_student_placement_exceptions e
    where e.school_id = p_school_id and e.status = 'open'
  ), '[]'::jsonb) else '[]'::jsonb end;
$$;

revoke all on function public.rpc_school_admin_list_placement_exceptions(uuid) from public, anon, authenticated, service_role;
grant execute on function public.rpc_school_admin_list_placement_exceptions(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
