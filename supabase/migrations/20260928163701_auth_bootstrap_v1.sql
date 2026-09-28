-- Read-only caller-bound bootstrap. Private definer, public invoker; no cached authority.
CREATE OR REPLACE FUNCTION private.auth_bootstrap_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_profile jsonb;
  v_school jsonb;
  v_caps jsonb;
  v_email text;
  v_verified boolean;
  v_banned boolean;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select a.email, a.email_confirmed_at is not null
    into v_email, v_verified from auth.users a where a.id = v_uid;
  if not found then raise exception 'ACCOUNT_NOT_FOUND' using errcode = '28000'; end if;

  select to_jsonb(p) into v_profile from (
    select u.id, u.email, u.username, u.full_name, u.full_name_status,
      u.avatar_url, u.role, u.school_id, u.needs_setup, u.tutorial_completed,
      u.is_banned, u.banned_until, u.required_changes, u.profile_locked,
      u.grade, u.batch, u.level, u.xp, u.coins, u.gemstones, u.streak,
      u.ap_now, u.ap_max, u.last_ap_update, u.attack_power, u.defense_power,
      u.pvp_score, u.last_seen, u.is_admin, u.account_tier,
      u.active_cosmetic_frame, u.active_cosmetic_theme, u.active_cosmetic_effect,
      u.brains_master_until, u.brains_master_show_badge
    from public.users u where u.id = v_uid
  ) p;
  v_banned := coalesce((v_profile ->> 'is_banned')::boolean, false);

  -- Do not resolve workspace capabilities for banned/unverified/incomplete users.
  if v_profile is not null and not v_banned and v_verified then
    select jsonb_build_object('id', s.id, 'name', s.name, 'logo_url', s.logo_url)
      into v_school from public.schools s where s.id = (v_profile ->> 'school_id')::uuid;
    v_caps := public.school_admin_get_my_allocation_capabilities((v_profile ->> 'school_id')::uuid);
    if not coalesce((v_caps ->> 'success')::boolean, false) then v_caps := null; end if;
  end if;

  return jsonb_build_object(
    'user_id', v_uid, 'email', v_email, 'email_verified', v_verified,
    'needs_setup', v_profile is null or coalesce((v_profile ->> 'needs_setup')::boolean, false),
    'is_banned', v_banned, 'profile', case when v_banned then null else v_profile end,
    'school', v_school, 'capabilities', v_caps,
    'is_superadmin', not v_banned and v_verified and public.rpc_is_superadmin(),
    'has_parent_workspace', not v_banned and v_verified and exists (
      select 1 from public.student_guardian_relationships r
      join public.users u on u.id = r.student_id and u.school_id = r.school_id
      join public.schools s on s.id = r.school_id
      where r.guardian_user_id = v_uid and r.status = 'active'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_auth_bootstrap_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.auth_bootstrap_v1(); $function$;

revoke all on function private.auth_bootstrap_v1() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.auth_bootstrap_v1() to authenticated;
revoke all on function public.rpc_auth_bootstrap_v1() from public, anon;
grant execute on function public.rpc_auth_bootstrap_v1() to authenticated;
notify pgrst, 'reload schema';
