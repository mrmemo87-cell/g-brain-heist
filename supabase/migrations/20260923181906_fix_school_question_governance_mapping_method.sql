-- School question governance is a human superadmin decision.
-- Record the resulting curriculum mapping as manual so the AI-assisted mapping
-- guard remains fail-closed for genuinely AI-generated mapping proposals.

do $migration$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='rpc_superadmin_govern_school_question'
    and pg_get_function_identity_arguments(p.oid)='p_question_id uuid, p_action text, p_payload jsonb';

  if v_oid is null then
    raise exception 'rpc_superadmin_govern_school_question signature not found';
  end if;

  select pg_get_functiondef(v_oid) into v_def;

  if position('''primary'', ''ai_assisted'', ''approved''' in v_def)=0 then
    raise exception 'Expected school governance mapping insert pattern not found';
  end if;

  v_def:=replace(
    v_def,
    '''primary'', ''ai_assisted'', ''approved''',
    '''primary'', ''manual'', ''approved'''
  );

  execute v_def;
end;
$migration$;

revoke all on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
to authenticated,service_role;

comment on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb) is
  'Atomic school-pool governance. Human superadmin curriculum selections are recorded as manual mappings so the mapping guard remains fail-closed for genuinely AI-assisted mappings.';
