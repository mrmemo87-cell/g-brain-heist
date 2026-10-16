-- Diagnostic Bible 1.10.0: expose response coverage, never rewrite scores/history.
-- Patch the current definitions so all current school/lead/self authorization stays intact.
-- Abort on drift rather than replacing a newer authorization implementation.
do $migration$
declare source text; updated text;
begin
  source := pg_get_functiondef('public.rpc_ielts_starting_point_summary()'::regprocedure);
  if position('''items_answered'',r.confidence' in source)>0 then
    raise exception 'starting_point_coverage_patch_drift';
  end if;
  updated := replace(source,
    '''total'',r.marks_possible,',
    '''total'',r.marks_possible,''items_answered'',r.confidence->''items_answered'',');
  if updated = source then raise exception 'starting_point_coverage_patch_drift'; end if;
  execute updated;

  source := pg_get_functiondef('public.rpc_ielts_diagnostic_result(uuid)'::regprocedure);
  updated := replace(source,
    '''outcomes'',r.outcomes,''next_step'',''Review the sampled items with your teacher, then gather evidence in the remaining skills.'',',
    $patch$'outcomes',r.outcomes,'response_coverage',case
      when (r.confidence->>'items_answered')::int=0 then 'empty'
      when (r.confidence->>'items_answered')::int<r.marks_possible then 'partial'
      when (r.confidence->>'items_answered')::int=r.marks_possible then 'complete'
      else 'unknown' end,
    'next_step',case
      when (r.confidence->>'items_answered')::int=0 then
        'No answers were recorded. This does not show your reading or listening ability. Ask your teacher to arrange a supervised fresh check; complete the other available screeners meanwhile.'
      when (r.confidence->>'items_answered')::int<r.marks_possible then
        'Some questions were unanswered. Ask your teacher to review the missing evidence and arrange a fresh check. Continue with the other available screeners; repeating the same form is practice, not independent evidence.'
      else 'Review the sampled items with your teacher, then gather evidence in the remaining skills.' end,$patch$);
  if updated = source then raise exception 'diagnostic_coverage_patch_drift'; end if;
  execute updated;
  source := pg_get_functiondef('public.rpc_ielts_programme_workspace(uuid,text,integer)'::regprocedure);
  if position('''items_answered'',r.confidence' in source)>0 then
    raise exception 'programme_coverage_patch_drift';
  end if;
  updated := replace(source,
    '''total'',r.marks_possible)',
    '''total'',r.marks_possible,''items_answered'',r.confidence->''items_answered'')');
  if updated = source then raise exception 'programme_coverage_patch_drift'; end if;
  execute updated;
end;
$migration$;
-- CREATE OR REPLACE retains ACLs; restate the public API boundary explicitly.
revoke all on function public.rpc_ielts_starting_point_summary() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_starting_point_summary() to authenticated;
revoke all on function public.rpc_ielts_diagnostic_result(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_diagnostic_result(uuid) to authenticated;
revoke all on function public.rpc_ielts_programme_workspace(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_programme_workspace(uuid,text,integer) to authenticated;
notify pgrst,'reload schema';
