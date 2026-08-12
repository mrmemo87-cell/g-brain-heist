-- Remove accidental anonymous publication of privileged programme helpers.
-- Preserve the access each authenticated/service role already had before the
-- PUBLIC grant is removed. Candidate admission RPCs and the intentionally
-- public IELTS preview RPC are deliberately outside this cleanup.

do $$
declare
  v_function record;
  v_authenticated boolean;
  v_service_role boolean;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and (
        (p.proname like 'rpc_ielts_%' and p.proname not like 'rpc_public_ielts_%')
        or p.proname in (
          'adm_is_platform_admin',
          'adm_prevent_locked_content_mutation',
          'can_assign_ielts_exam_class',
          'can_manage_ielts_practice_assignment',
          'can_review_ielts_productive_submission',
          'enforce_cambridge_score_delete_scope',
          'get_billing_subscription',
          'get_ielts_prime_subscription_status',
          'ielts_exam_mode_is_global_admin',
          'ielts_exam_mode_is_school_admin',
          'ielts_latest_skill_readiness',
          'ielts_practice_assert_item_progress_scope',
          'ielts_practice_assignment_payload',
          'ielts_practice_assignment_progress_payload',
          'ielts_practice_sync_parent_completion',
          'ielts_productive_review_seed',
          'ielts_resolve_exam_form',
          'ielts_review_attempt_payload',
          'prepare_cambridge_quiz_score'
        )
      )
  loop
    v_authenticated:=has_function_privilege('authenticated',v_function.oid,'execute');
    v_service_role:=has_function_privilege('service_role',v_function.oid,'execute');
    execute format('revoke execute on function %s from public, anon',v_function.oid::regprocedure);
    if v_authenticated then
      execute format('grant execute on function %s to authenticated',v_function.oid::regprocedure);
    end if;
    if v_service_role then
      execute format('grant execute on function %s to service_role',v_function.oid::regprocedure);
    end if;
  end loop;
end $$;

comment on function public.rpc_public_ielts_task_previews() is
  'Intentional anonymous read-only IELTS preview boundary; excluded from privileged RPC cleanup.';
