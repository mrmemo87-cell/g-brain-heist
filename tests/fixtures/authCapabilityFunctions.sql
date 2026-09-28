CREATE OR REPLACE FUNCTION public.rpc_is_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.superadmins s
    where s.user_id = auth.uid()
  );
$function$

CREATE OR REPLACE FUNCTION public.school_admin_get_my_allocation_capabilities(p_school_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_payload jsonb;
begin
  v_payload := public.school_admin_get_my_capabilities(p_school_id);
  if v_payload ? 'has_active_teaching_assignment' then
    v_payload := (v_payload - 'has_active_teaching_assignment') || jsonb_build_object(
      'has_active_teacher_allocation', v_payload -> 'has_active_teaching_assignment'
    );
  end if;
  return v_payload;
end;
$function$

CREATE OR REPLACE FUNCTION public.school_admin_get_my_capabilities(p_school_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_member public.school_members%rowtype;
  v_has_active_assignment boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;
  select sm.* into v_member
  from public.school_members sm
  where sm.user_id = auth.uid()
    and sm.status = 'active'
    and (p_school_id is null or sm.school_id = p_school_id)
  order by sm.is_owner desc, sm.joined_at, sm.id
  limit 1;
  if v_member.id is null then
    return jsonb_build_object('success', false, 'error', 'No active school membership');
  end if;

  select exists (
    select 1
    from public.class_teacher_assignments cta
    join public.classes c on c.id = cta.class_id
      and c.school_id = cta.school_id
      and c.is_active is distinct from false
    where cta.school_id = v_member.school_id
      and cta.teacher_user_id = v_member.user_id
      and cta.active is distinct from false
  ) into v_has_active_assignment;

  return jsonb_build_object(
    'success', true,
    'user_id', v_member.user_id,
    'school_id', v_member.school_id,
    'role', v_member.role_in_school,
    'account_type', case when v_member.is_owner then 'school_head' else v_member.role_in_school end,
    'is_owner', v_member.is_owner,
    'can_administer', v_member.role_in_school = 'school_admin',
    'can_teach', v_member.can_teach,
    'has_active_teaching_assignment', v_has_active_assignment,
    'can_manage_billing', v_member.is_owner,
    'can_manage_admins', v_member.is_owner,
    'can_transfer_ownership', v_member.is_owner,
    'can_view_governance', v_member.is_owner
  );
end;
$function$
