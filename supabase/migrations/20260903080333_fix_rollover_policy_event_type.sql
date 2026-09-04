do $patch$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='apply_school_year_rollover_post_commit_policies'
    and pg_get_function_identity_arguments(p.oid)='p_plan_id uuid';
  if v_def is null or position('post_commit_policies_applied' in v_def)=0 then
    raise exception 'rollover_policy_event_patch_anchor_not_found';
  end if;
  execute replace(v_def,'''post_commit_policies_applied''','''committed''');
end;
$patch$;
