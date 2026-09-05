create or replace function private.enforce_request_entitlement()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_path text := split_part(coalesce(current_setting('request.path', true), ''), '?', 1);
  v_feature text;
  v_allow_individual boolean := false;
begin
  if auth.uid() is null or public.is_superadmin(auth.uid()) then return; end if;

  if v_path = any(array[
    '/rpc/rpc_get_student_active_assignment',
    '/rpc/rpc_get_student_pending_assignments',
    '/rpc/rpc_get_student_completed_assignments',
    '/rpc/rpc_get_my_assignment_answers'
  ]) then
    return;
  end if;

  if v_path = any(array[
    '/rpc/school_admin_list_teacher_assignments',
    '/rpc/school_admin_delete_teacher_assignment'
  ]) then
    return;
  end if;

  if v_path = any(array[
    '/assignments','/assignment_questions','/assignment_students','/student_assignments',
    '/student_assignment_answers','/student_assignment_results','/student_assignment_analyses',
    '/assignment_question_details','/rpc/rpc_create_assignment','/rpc/rpc_update_teacher_assignment',
    '/rpc/rpc_delete_teacher_assignment','/rpc/rpc_get_assignments_for_teacher',
    '/rpc/rpc_submit_assignment_answer','/rpc/rpc_submit_assignment_result',
    '/rpc/check_assignment_achievements'
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
    v_feature := 'clans';
    v_allow_individual := true;
  elsif v_path = any(array[
    '/pvp_attack_attempts','/competition_pvp_wins','/rpc/get_attack_targets',
    '/rpc/get_bot_pvp_targets','/rpc/rpc_hack_attempt','/rpc/rpc_update_pvp_score'
  ]) then
    v_feature := 'pvp_battles';
    v_allow_individual := true;
  elsif v_path = any(array['/inventory','/shop_purchases','/rpc/inventory_activate']) then
    v_feature := 'shop';
    v_allow_individual := true;
  elsif v_path = any(array[
    '/raids','/raid_events','/raid_participants','/raid_waves','/brains_heist_raids',
    '/brains_heist_raid_attacks','/brains_heist_raid_participants','/rpc/create_raid',
    '/rpc/finalize_raid','/rpc/get_raid_status','/rpc/join_raid','/rpc/submit_raid_answer',
    '/rpc/brains_heist_attack_raid'
  ]) then
    v_feature := 'raids';
    v_allow_individual := true;
  elsif v_path = any(array[
    '/tournament_matches','/tournament_school_signups','/tournament_seasons',
    '/tournament_public_bracket','/rpc/approve_tournament_signup'
  ]) then
    v_feature := 'tournaments';
    v_allow_individual := true;
  end if;

  if v_feature is not null
    and not private.actor_has_feature_entitlement(v_feature, v_allow_individual) then
    raise sqlstate 'PGRST'
      using message = jsonb_build_object(
        'code', 'FEATURE_NOT_INCLUDED',
        'message', 'This feature is not included in the effective school plan',
        'details', format('Required feature: %s', v_feature),
        'hint', 'Ask your school administrator to review the current plan.'
      )::text,
      detail = jsonb_build_object(
        'status', 403,
        'headers', jsonb_build_object('X-Entitlement-Decision', 'denied')
      )::text;
  end if;
end;
$function$;

comment on function private.enforce_request_entitlement() is
  'Global Data API feature gate. Core teacher roster reads are intentionally ungated; assignment creation/history/reporting remain entitlement-gated.';
