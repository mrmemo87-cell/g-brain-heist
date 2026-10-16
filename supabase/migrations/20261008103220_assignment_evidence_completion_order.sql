-- Evidence must observe the final submission state, not the order in which an
-- authorized importer writes answers, the result and the completion status.
-- Existing materializers retain their verified/hash/grade/independence gates.
-- No student answers, scores, rewards or historical snapshots are rewritten.
drop trigger if exists trg_zzz_capture_verified_assignment_diagnostic_evidence
  on public.student_assignment_results;
create constraint trigger trg_zzz_capture_verified_assignment_diagnostic_evidence
after insert or update on public.student_assignment_results
deferrable initially deferred
for each row execute function private.capture_verified_assignment_diagnostic_evidence();

-- Also reconcile when completion is committed after an already-saved result.
-- The ordinary student RPC completes the assignment before inserting its result,
-- so this inexpensive existence check does not run a second materialization there.
create or replace function private.capture_completed_assignment_evidence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if exists (
    select 1 from public.student_assignment_results r
    where r.assignment_id=new.assignment_id and r.student_id=new.student_id
  ) then
    perform private.ingest_verified_assignment_registry_evidence(
      new.assignment_id,new.student_id
    );
    perform private.ingest_verified_assignment_diagnostic_evidence(
      new.assignment_id,new.student_id
    );
  end if;
  return new;
end;
$function$;
revoke all on function private.capture_completed_assignment_evidence()
from public,anon,authenticated,service_role;

drop trigger if exists trg_capture_completed_assignment_evidence
  on public.student_assignments;
create trigger trg_capture_completed_assignment_evidence
after update of status on public.student_assignments
for each row
when (new.status='completed' and old.status is distinct from new.status)
execute function private.capture_completed_assignment_evidence();

comment on function private.capture_completed_assignment_evidence() is
'Reconcile verified evidence when an existing result precedes completion; uses the governed idempotent materializers and does not change scoring or reward state.';
