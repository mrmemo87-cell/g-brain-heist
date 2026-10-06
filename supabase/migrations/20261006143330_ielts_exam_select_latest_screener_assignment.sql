-- IELTS Diagnostic Bible v1.2.0. Preserve attempts, scoring and authorization.
-- Align Exam Mode with the catalog's deterministic latest-assignment selection.
set lock_timeout = '5s';
do $migration$
declare
  definition text;
  old_selector text := E'and a.student_id = auth.uid()\n  limit 1;';
  new_selector text := E'and a.student_id = auth.uid()\n  order by a.created_at desc, a.id desc\n  limit 1;';
begin
  select pg_get_functiondef('public.rpc_ielts_exam_whoami_entitlement_internal(uuid)'::regprocedure)
    into definition;
  if position(new_selector in definition) > 0 then
    return;
  end if;
  if position(old_selector in definition) = 0 then
    raise exception 'Unexpected IELTS assignment selector; inspect before applying';
  end if;
  execute replace(definition, old_selector, new_selector);
end;
$migration$;
