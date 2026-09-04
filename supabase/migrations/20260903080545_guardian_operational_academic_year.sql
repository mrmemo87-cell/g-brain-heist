do $patch$
declare v_def text;
  v_old text:='v_year_id := public.academic_resolve_year_id(v_school_id, now());';
  v_new text:='v_year_id := public.academic_resolve_operational_year_id(v_school_id, now());';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rpc_guardian_child_academic_year_progress'
    and pg_get_function_identity_arguments(p.oid)='p_student_id uuid, p_subject text';
  if v_def is null or position(v_old in v_def)=0 then
    raise exception 'guardian_operational_year_patch_anchor_not_found';
  end if;
  execute replace(v_def,v_old,v_new);
end;
$patch$;
