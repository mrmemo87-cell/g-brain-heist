# Classroom assignment reliability: deployment and rollback

## Guardrails

This migration preserves **all existing student answers, scores and result rows**. It changes only the expensive evidence trigger handlers, adds a durable private queue and low-concurrency pg_cron worker, removes school-plan read writes, and repairs three independent error paths. The new worker is eventually consistent: teachers may see academic-evidence updates after the result itself is committed.

Do not report a permanent fix until staging has passed real authenticated 30-student (then 100-student) tests and production has completed a comparable pilot. There is no scientifically justified promise that future outages can never occur.

## Time-driven pilot expiry

School/billing change triggers still maintain lifecycle, but wall-clock trial expiry
requires an independent five-minute reconciliation cron. Check job
`brains-heist-school-pilot-expiry` alongside the evidence queue jobs. This
runs only for active lifecycle rows whose trial expiration has passed, not for
every school-plan read. It is not a generic polling write storm.

## Deployment order

1. Take a schema backup / snapshot; record active job list, current trigger definitions and function definitions. Avoid classroom hours.
2. Apply `20261015150000_classroom_async_evidence_and_incident_repairs.sql` **as a transaction**; do not run a manual evidence backfill during cutover.
3. Confirm both triggers still exist and now call `private.enqueue_verified_assignment_evidence_row`, not the two ingestion functions. Confirm the worker cron schedule is active and the queue is private.
4. Under an authenticated test role, verify student-owned attempt history works and cross-school / unassigned resources do not appear. Verify teacher's assigned subject group is still visible.
5. Run a fresh staging classroom with 30 unique students, verify answers/results and eventual evidence row counts. Ramp to 100 only when 30 passes. Existing `load-tests/classroom.js` refuses production URLs by design.
6. Watch p95 completion, error rate, pg_statement timeouts, queue age and worker warnings; ensure authenticated logins remain responsive.

## Database health (operations only)

```sql
select status, count(*) as jobs, min(requested_at) as oldest_request,
       max(attempts) as max_attempts
from private.assignment_evidence_jobs
group by status order by status;
select jobname,schedule,active from cron.job
where jobname like 'brains-heist-assignment-evidence%';
select event_message,runid,start_time,end_time,status
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname like 'brains-heist-assignment-evidence%')
order by start_time desc limit 20;
```

Investigate any `failed` jobs or pending jobs older than 10 minutes. Requeue only after resolving root cause, and only through a reviewed transaction. Never clear verified evidence, delete student answers or arbitrarily re-run ingestion on every result.

## Reconciliation of affected students

For the 2026-10-15 08:45–09:10 UTC window, compare: committed answer count against assignment question count, status against result existence, and duplicate results. Do **not** infer from an HTTP 500 that no commit happened. Check any client-held drafts with affected students; server data alone cannot establish preservation of unsent drafts.

## Emergency rollback

If the worker causes errors, first disable just the background job:
```sql
select cron.unschedule('brains-heist-assignment-evidence-worker');
```
This **does not** disable recording results or durable queueing. Leave the queue intact for retry.

Reverting the two trigger handlers to synchronous work will restore the earlier critical completion latency failure; avoid doing so during a classroom incident. Roll back narrowly from the backed-up function definitions after incident review. Never truncate `private.assignment_evidence_jobs`.
