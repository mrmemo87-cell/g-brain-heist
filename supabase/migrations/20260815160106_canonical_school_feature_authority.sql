-- Canonical school feature authority.
-- A school agreement always wins over legacy per-user tiers. PostgREST requests
-- and direct table access both fail closed when the effective school plan does
-- not include the requested feature.

create schema if not exists private;

create or replace function private.actor_school_id(p_actor uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.school_id from public.users u where u.id = p_actor),
    (
      select sm.school_id
      from public.school_members sm
      where sm.user_id = p_actor and sm.status = 'active'
      order by sm.is_owner desc, sm.joined_at nulls last, sm.id
      limit 1
    )
  );
$$;

revoke all on function private.actor_school_id(uuid) from public, anon, authenticated, service_role;

create or replace function private.feature_module_key(p_feature_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_feature_key, '')))
    when 'cambridge_tests' then 'cambridge'
    when 'ielts_tests' then 'ielts'
    when 'admission_tests' then 'admissions'
    when 'writing_hub' then 'writing'
    else 'core'
  end;
$$;

revoke all on function private.feature_module_key(text) from public, anon, authenticated, service_role;

create or replace function private.actor_has_feature_entitlement(
  p_feature_key text,
  p_allow_individual boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_plan text;
  v_role text;
  v_enabled boolean := false;
  v_module_key text := private.feature_module_key(p_feature_key);
begin
  if v_actor is null or nullif(trim(coalesce(p_feature_key, '')), '') is null then
    return false;
  end if;
  if public.is_superadmin(v_actor) then return true; end if;

  select u.role into v_role from public.users u where u.id = v_actor;
  v_school_id := private.actor_school_id(v_actor);

  if v_school_id is null then
    if p_allow_individual and coalesce(v_role, '') not in ('admin', 'superadmin', 'super_admin', 'school_admin') then
      return true;
    end if;
    v_plan := coalesce(public.get_effective_tier(v_actor), 'free');
  else
    -- A school plan is authoritative. A legacy personal Pro flag must never
    -- unlock features for a Free/None school.
    v_plan := private.professional_onboarding_active_plan(v_school_id);
  end if;

  select be.enabled
  into v_enabled
  from public.billing_entitlements be
  where be.plan = v_plan and be.feature_key = lower(trim(p_feature_key));

  if not coalesce(v_enabled, false) then return false; end if;
  if v_school_id is null then return true; end if;
  return public.school_has_module_access(v_school_id, v_module_key);
end;
$$;

revoke all on function private.actor_has_feature_entitlement(text,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.can_use_feature(
  p_feature_key text,
  p_allow_individual boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.actor_has_feature_entitlement(p_feature_key, p_allow_individual);
$$;

revoke all on function public.can_use_feature(text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.can_use_feature(text,boolean) to authenticated;

-- Keep the legacy RPC for compatibility, but make it school-first.
create or replace function public.get_effective_tier(p_user_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_user record;
begin
  if v_uid is null then return 'free'; end if;
  select u.account_tier, private.actor_school_id(v_uid) as school_id
  into v_user
  from public.users u
  where u.id = v_uid;
  if not found then return 'free'; end if;

  if v_user.school_id is not null then
    return private.professional_onboarding_active_plan(v_user.school_id);
  end if;
  if v_user.account_tier = 'pro' then return 'pro'; end if;
  return 'free';
end;
$$;

revoke all on function public.get_effective_tier(uuid) from public, anon;
grant execute on function public.get_effective_tier(uuid) to authenticated;

create or replace function public.get_my_effective_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_school_id uuid;
  v_plan text := 'free';
  v_entitlements jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'plan', 'free', 'school_id', null, 'modules', '{}'::jsonb, 'entitlements', '{}'::jsonb);
  end if;

  v_school_id := private.actor_school_id(v_uid);
  v_plan := case
    when v_school_id is not null then private.professional_onboarding_active_plan(v_school_id)
    else coalesce(public.get_effective_tier(v_uid), 'free')
  end;

  select coalesce(jsonb_object_agg(rows.feature_key, jsonb_build_object(
    'feature_key', rows.feature_key,
    'enabled', rows.effective_enabled,
    'limit_value', case when rows.effective_enabled then rows.limit_value else 0 end,
    'module_key', rows.module_key
  )), '{}'::jsonb)
  into v_entitlements
  from (
    select be.feature_key, be.limit_value,
      private.feature_module_key(be.feature_key) as module_key,
      be.enabled and (
        v_school_id is null
        or public.school_has_module_access(v_school_id, private.feature_module_key(be.feature_key))
      ) as effective_enabled
    from public.billing_entitlements be
    where be.plan = v_plan
  ) rows;

  return jsonb_build_object(
    'success', true,
    'plan', v_plan,
    'school_id', v_school_id,
    'modules', jsonb_build_object(
      'core', case when v_school_id is null then true else public.school_has_module_access(v_school_id, 'core') end,
      'cambridge', case when v_school_id is null then false else public.school_has_module_access(v_school_id, 'cambridge') end,
      'ielts', case when v_school_id is null then false else public.school_has_module_access(v_school_id, 'ielts') end,
      'writing', case when v_school_id is null then false else public.school_has_module_access(v_school_id, 'writing') end,
      'admissions', case when v_school_id is null then false else public.school_has_module_access(v_school_id, 'admissions') end
    ),
    'entitlements', v_entitlements
  );
end;
$$;

revoke all on function public.get_my_effective_entitlements() from public, anon, authenticated, service_role;
grant execute on function public.get_my_effective_entitlements() to authenticated;

-- Lockdown is the one Free school feature. Its limits come from the same
-- entitlement rows as every other capability and use real map identifiers.
create or replace function public.check_lockdown_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_school_id uuid;
  v_plan text := 'free';
  v_duration integer;
  v_students integer;
  v_map_count integer;
  v_all_maps text[] := array['default','downtown','compound','vault'];
begin
  if v_actor is null then return jsonb_build_object('success', false, 'error', 'not_authenticated'); end if;
  v_school_id := private.actor_school_id(v_actor);
  v_plan := case
    when v_school_id is not null then private.professional_onboarding_active_plan(v_school_id)
    else coalesce(public.get_effective_tier(v_actor), 'free')
  end;

  if not private.actor_has_feature_entitlement('lockdown_mode', true) then
    return jsonb_build_object('success', false, 'error', 'feature_not_included', 'tier', v_plan);
  end if;

  select max(be.limit_value) filter (where be.feature_key = 'lockdown_duration'),
         max(be.limit_value) filter (where be.feature_key = 'lockdown_students'),
         max(be.limit_value) filter (where be.feature_key = 'lockdown_maps')
  into v_duration, v_students, v_map_count
  from public.billing_entitlements be
  where be.plan = v_plan;

  return jsonb_build_object(
    'success', true,
    'tier', v_plan,
    'max_duration_minutes', v_duration,
    'max_students', v_students,
    'allowed_maps', case when v_map_count is null then null else to_jsonb(v_all_maps[1:greatest(0, least(v_map_count, array_length(v_all_maps, 1)))]) end,
    'custom_questions', private.actor_has_feature_entitlement('custom_questions', false),
    'save_results', v_plan <> 'free',
    'watermark', v_plan = 'free'
  );
end;
$$;

revoke all on function public.check_lockdown_limits() from public, anon;
grant execute on function public.check_lockdown_limits() to authenticated;

create or replace function public.enforce_request_entitlement()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := split_part(coalesce(current_setting('request.path', true), ''), '?', 1);
  v_feature text;
  v_allow_individual boolean := false;
begin
  if auth.uid() is null or public.is_superadmin(auth.uid()) then return; end if;

  if v_path = any(array[
    '/assignments','/assignment_questions','/assignment_students','/student_assignments',
    '/student_assignment_answers','/student_assignment_results','/student_assignment_analyses',
    '/assignment_question_details','/rpc/rpc_create_assignment','/rpc/rpc_update_teacher_assignment',
    '/rpc/rpc_delete_teacher_assignment','/rpc/rpc_get_assignments_for_teacher',
    '/rpc/rpc_get_students_for_assignment','/rpc/rpc_get_student_active_assignment',
    '/rpc/rpc_get_student_pending_assignments','/rpc/rpc_get_student_completed_assignments',
    '/rpc/rpc_get_my_assignment_answers','/rpc/rpc_submit_assignment_answer',
    '/rpc/rpc_submit_assignment_result','/rpc/check_assignment_achievements',
    '/rpc/school_admin_delete_teacher_assignment','/rpc/school_admin_list_teacher_assignments'
  ]) then
    v_feature := 'assignments';
  elsif v_path = any(array[
    '/rpc/rpc_teacher_assignment_report','/rpc/rpc_teacher_assignment_success_summary',
    '/rpc/rpc_get_assignment_question_analysis','/rpc/rpc_get_assignment_student_answers'
  ]) then
    v_feature := 'reports';
  elsif v_path = any(array['/teacher_questions','/rpc/get_unlocked_teacher_questions']) then
    v_feature := 'question_bank';
  elsif v_path = any(array[
    '/clans','/clan_members','/clan_join_requests','/clan_chat','/clan_buff_templates',
    '/clan_buffs','/clan_active_buffs','/clan_member_coin_contributions','/clan_member_scores',
    '/clan_scores','/leaderboard_clan_stats','/rivalry_wars','/rivalry_war_actions',
    '/rivalry_war_effects','/rivalry_war_member_state','/rivalry_war_pair_cooldowns',
    '/rivalry_war_rewards','/rivalry_war_rosters','/rivalry_war_scores',
    '/rivalry_war_stakes','/rivalry_war_structures','/rpc/get_school_clan_leaderboard',
    '/rpc/rpc_clan_deposit_coins','/rpc/rpc_clan_join_request_decide','/rpc/rpc_clan_join_requests',
    '/rpc/rpc_clan_territory_my_context','/rpc/rpc_claim_clan_territory_reward',
    '/rpc/claim_clan_territory_rewards','/rpc/rpc_create_clan','/rpc/rpc_get_clan_leaderboard',
    '/rpc/rpc_get_clan_members','/rpc/rpc_join_clan','/rpc/rpc_leave_clan',
    '/rpc/rpc_purchase_clan_buff','/rpc/rpc_purchase_clan_member_slot',
    '/rpc/rpc_transfer_clan_leadership','/rpc/rpc_update_clan_member_role',
    '/rpc/rpc_rivalry_claim_reward','/rpc/rpc_rivalry_declare_war',
    '/rpc/rpc_rivalry_get_public_wars','/rpc/rpc_rivalry_get_war_logs',
    '/rpc/rpc_rivalry_get_war_state','/rpc/rpc_rivalry_lock_roster',
    '/rpc/rpc_rivalry_respond_war','/rpc/rpc_rivalry_set_doctrine',
    '/rpc/rpc_rivalry_settle_war','/rpc/rpc_rivalry_submit_action',
    '/rpc/rpc_rivalry_update_roster_member'
  ]) then
    v_feature := 'clans'; v_allow_individual := true;
  elsif v_path = any(array[
    '/pvp_attack_attempts','/competition_pvp_wins','/rpc/get_attack_targets',
    '/rpc/get_bot_pvp_targets','/rpc/rpc_hack_attempt','/rpc/rpc_update_pvp_score'
  ]) then
    v_feature := 'pvp_battles'; v_allow_individual := true;
  elsif v_path = any(array['/inventory','/shop_purchases','/rpc/inventory_activate']) then
    v_feature := case when v_path = '/shop_purchases' then 'shop' else 'shop' end;
    v_allow_individual := true;
  elsif v_path = any(array[
    '/raids','/raid_events','/raid_participants','/raid_waves','/brains_heist_raids',
    '/brains_heist_raid_attacks','/brains_heist_raid_participants','/rpc/create_raid',
    '/rpc/finalize_raid','/rpc/get_raid_status','/rpc/join_raid','/rpc/submit_raid_answer',
    '/rpc/brains_heist_attack_raid'
  ]) then
    v_feature := 'raids'; v_allow_individual := true;
  elsif v_path = any(array[
    '/tournament_matches','/tournament_school_signups','/tournament_seasons',
    '/tournament_public_bracket','/rpc/approve_tournament_signup'
  ]) then
    v_feature := 'tournaments'; v_allow_individual := true;
  end if;

  if v_feature is not null and not private.actor_has_feature_entitlement(v_feature, v_allow_individual) then
    raise sqlstate 'PGRST'
      using message = jsonb_build_object(
        'code', 'FEATURE_NOT_INCLUDED',
        'message', 'This feature is not included in the effective school plan',
        'details', jsonb_build_object('feature', v_feature)
      )::text,
      detail = '{"status":403,"headers":{"X-Entitlement-Decision":"denied"}}';
  end if;
end;
$$;

revoke all on function public.enforce_request_entitlement() from public, anon, authenticated, service_role;
grant execute on function public.enforce_request_entitlement() to anon, authenticated;

-- PostgREST calls the hook before both table and RPC requests. Existing RPC
-- implementations remain unchanged, while their authorization is centralized.
alter role authenticator set pgrst.db_pre_request = 'public.enforce_request_entitlement';
notify pgrst, 'reload config';

-- Restrictive policies are ANDed with the existing tenant/ownership policies,
-- so Realtime and direct table access cannot bypass the PostgREST request hook.
do $$
declare
  v_table text;
  v_feature text;
  v_allow_individual boolean;
begin
  for v_table, v_feature, v_allow_individual in
    select * from (values
      ('assignments','assignments',false),('assignment_questions','assignments',false),
      ('assignment_students','assignments',false),('student_assignments','assignments',false),
      ('student_assignment_answers','assignments',false),('student_assignment_results','assignments',false),
      ('student_assignment_analyses','assignments',false),('teacher_questions','question_bank',false),
      ('clans','clans',true),('clan_members','clans',true),('clan_join_requests','clans',true),
      ('clan_chat','clans',true),('clan_buff_templates','clans',true),('clan_buffs','clans',true),
      ('clan_member_coin_contributions','clans',true),('rivalry_wars','clans',true),
      ('rivalry_war_actions','clans',true),('rivalry_war_effects','clans',true),
      ('rivalry_war_member_state','clans',true),('rivalry_war_pair_cooldowns','clans',true),
      ('rivalry_war_rewards','clans',true),('rivalry_war_rosters','clans',true),
      ('rivalry_war_scores','clans',true),('rivalry_war_stakes','clans',true),
      ('rivalry_war_structures','clans',true),('pvp_attack_attempts','pvp_battles',true),
      ('inventory','shop',true),('shop_purchases','shop',true),
      ('raids','raids',true),('raid_events','raids',true),('raid_participants','raids',true),
      ('raid_waves','raids',true),('brains_heist_raids','raids',true),
      ('brains_heist_raid_attacks','raids',true),('brains_heist_raid_participants','raids',true),
      ('tournament_matches','tournaments',true),('tournament_school_signups','tournaments',true),
      ('tournament_seasons','tournaments',true)
    ) as guarded(table_name, feature_key, allow_individual)
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('drop policy if exists feature_entitlement_guard on public.%I', v_table);
      execute format(
        'create policy feature_entitlement_guard on public.%I as restrictive for all to authenticated using (public.can_use_feature(%L,%L)) with check (public.can_use_feature(%L,%L))',
        v_table, v_feature, v_allow_individual, v_feature, v_allow_individual
      );
    end if;
  end loop;
end
$$;

