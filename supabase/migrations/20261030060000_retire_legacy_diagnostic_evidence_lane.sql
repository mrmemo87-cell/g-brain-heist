-- Retire the legacy `diagnostic:` evidence lane in favour of the canonical `registry:` lane.
--
-- Background (docs/academic-skill-registry.md, "Longitudinal behaviour"): Academic Profile
-- identity should use the stable registry code so evidence from many questions accumulates into
-- ONE focus state per sub-skill. Since 2026-09-28 every assignment result has been ingested by two
-- lanes in parallel (student_learning_ingest_assignment_result / process_claimed_assignment_evidence):
--   * private.ingest_verified_assignment_registry_evidence   -> skill_key 'registry:<version>:<atomic>'
--   * private.ingest_verified_assignment_diagnostic_evidence -> skill_key 'diagnostic:<scope>:<skill>:<atomic>'
-- The same answers therefore produced two focus states per sub-skill, double-counting evidence in
-- every reader (teacher interventions, academic profile, guardian views, school-head analytics).
-- Audit on 2026-10-30: 875 legacy observations, 603 with a registry twin from the same assignment;
-- the remaining 272 came from 18 assignment/student pairs (4 "Quick Diagnostic" assignments from
-- the first days of the registry lane) where the registry lane had simply never run. A dry-run
-- replay produced a twin for every one of them. No professional review or intervention references
-- a legacy key.
--
-- What this migration does, in order:
--   1. Backfill: replay the registry lane for every assignment/student pair that has legacy-only
--      evidence (idempotent: observations upsert on (student_id, source_key)).
--   2. Supersede: every legacy observation that now has a registry twin from the same assignment
--      stops contributing to focus state. Rows are NOT deleted or re-keyed; the evidence JSON gains
--      an audit block (superseded_by_scheme / superseded_at / superseded_reason).
--   3. Refresh: rebuild derived focus/confidence states for every affected (student, key). Legacy
--      states fall to insufficient_evidence (hidden from every active-status reader, row kept);
--      registry states absorb the backfilled evidence under the registry lane's governed rules.
--   4. Stop dual-writing: the two ingest entry points call only the registry lane. The legacy
--      ingest function is left in place, unused, for audit/replay.
-- Learner evidence identity is not silently changed: observation rows keep their skill_key, and the
-- supersession is explicit and queryable (evidence->>'superseded_by_scheme' = 'registry').

set local statement_timeout = '900s';

-- 1. Backfill ---------------------------------------------------------------------------------
do $$
declare r record; n int := 0;
begin
  for r in
    select distinct d.source_id as assignment_id, d.student_id
    from public.student_learning_observations d
    where d.skill_key like 'diagnostic:%'
      and d.source_type = 'assignment_result'
      and not exists (
        select 1 from public.student_learning_observations x
        where x.student_id = d.student_id and x.source_id = d.source_id and x.skill_key like 'registry:%')
  loop
    perform private.ingest_verified_assignment_registry_evidence(r.assignment_id, r.student_id);
    n := n + 1;
  end loop;
  raise notice 'legacy lane retirement: backfilled registry evidence for % assignment/student pairs', n;
end $$;

-- 2. Supersede --------------------------------------------------------------------------------
update public.student_learning_observations d
set contributes_to_focus_state = false,
    evidence = coalesce(d.evidence, '{}'::jsonb) || jsonb_build_object(
      'superseded_by_scheme', 'registry',
      'superseded_at', now(),
      'superseded_reason', 'legacy diagnostic lane retired 2026-10-30; same answers recorded under registry skill_key'
    )
where d.skill_key like 'diagnostic:%'
  and d.source_type = 'assignment_result'
  and d.contributes_to_focus_state
  and exists (
    select 1 from public.student_learning_observations x
    where x.student_id = d.student_id and x.source_id = d.source_id and x.skill_key like 'registry:%');

-- 3. Refresh derived states -------------------------------------------------------------------
do $$
declare r record; n int := 0;
begin
  for r in
    select distinct o.student_id, o.skill_key
    from public.student_learning_observations o
    where (o.skill_key like 'diagnostic:%' or o.skill_key like 'registry:%')
      and o.student_id in (
        select distinct student_id from public.student_learning_observations
        where skill_key like 'diagnostic:%' and source_type = 'assignment_result')
  loop
    perform public.student_learning_refresh_focus_state(r.student_id, r.skill_key);
    n := n + 1;
  end loop;
  raise notice 'legacy lane retirement: refreshed % focus states', n;
end $$;

-- 4. Stop dual-writing ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_learning_ingest_assignment_result(p_assignment_id uuid, p_student_id uuid, p_completed_at timestamp with time zone, p_accuracy integer, p_score integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Registry lane only since 2026-10-30; the legacy diagnostic lane is retired
  -- (see 20261030060000_retire_legacy_diagnostic_evidence_lane.sql).
  perform private.ingest_verified_assignment_registry_evidence(
    p_assignment_id,p_student_id
  );
end;
$function$;

revoke all on function public.student_learning_ingest_assignment_result(uuid,uuid,timestamptz,integer,integer)
from public,anon,authenticated;
grant execute on function public.student_learning_ingest_assignment_result(uuid,uuid,timestamptz,integer,integer)
to service_role;

CREATE OR REPLACE FUNCTION private.process_claimed_assignment_evidence(p_job private.assignment_evidence_jobs)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_error text;v_count integer;
begin
  -- A revoked/superseded claim must never acknowledge newer work.
  if not exists(select 1 from private.assignment_evidence_jobs j
    where j.assignment_id=p_job.assignment_id and j.student_id=p_job.student_id
      and j.revision=p_job.revision and j.status='processing' and j.lease_token=p_job.lease_token) then
    return 'superseded';
  end if;
  begin
    -- Registry lane only since 2026-10-30; the legacy diagnostic lane is retired.
    perform private.ingest_verified_assignment_registry_evidence(p_job.assignment_id,p_job.student_id);
  exception when query_canceled or others then
    -- OTHERS does not include QUERY_CANCELED.
    v_error=left(SQLSTATE||': '||SQLERRM,900);
    update private.assignment_evidence_jobs j set
      status=case when j.attempts>=8 then 'failed' else 'pending' end,
      available_at=clock_timestamp()+pg_catalog.make_interval(secs=>least(3600,20*(2^least(j.attempts,7))::integer)),
      lease_token=null,lease_until=null,last_error=v_error
    where j.assignment_id=p_job.assignment_id and j.student_id=p_job.student_id
      and j.revision=p_job.revision and j.lease_token=p_job.lease_token;
    raise warning 'BH evidence job unsuccessful, state %',left(v_error,5);
    return 'retry';
  end;
  update private.assignment_evidence_jobs j set status='done',processed_at=clock_timestamp(),
    lease_token=null,lease_until=null,last_error=null
  where j.assignment_id=p_job.assignment_id and j.student_id=p_job.student_id
    and j.revision=p_job.revision and j.lease_token=p_job.lease_token;
  get diagnostics v_count=row_count;
  return case when v_count=1 then 'done' else 'superseded' end;
end;
$function$;

revoke all on function private.process_claimed_assignment_evidence(private.assignment_evidence_jobs)
from public,anon,authenticated;
