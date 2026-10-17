-- Printing prepares a future classroom session; confirming results remains bounded by now.
-- Patch only the upper-bound guard in the two sheet-issuance RPCs.
-- Preserve the live authorization, option validation, idempotency and scan logic.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_guard text := ' or p_assessed_at>now()+interval ''5 minutes''';
begin
  foreach v_signature in array array[
    'public.rpc_teacher_issue_scan_sheets(uuid,uuid,uuid[],timestamp with time zone,jsonb)',
    'public.rpc_teacher_issue_unnamed_sheets(uuid,uuid,integer,timestamp with time zone,jsonb)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if strpos(v_definition,v_guard)=0 then
      raise exception 'Expected print assessment guard missing in %',v_signature;
    end if;
    if length(v_definition)-length(replace(v_definition,v_guard,'')) <> length(v_guard) then
      raise exception 'Ambiguous print assessment guard in %',v_signature;
    end if;
    execute replace(v_definition,v_guard,'');
  end loop;
end;
$migration$;
