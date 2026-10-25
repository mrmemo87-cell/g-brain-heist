# Live classroom diagnostic recorder

Temporary, admin-only observability for production `sozodkxwhubespiedgxm`.
Installed 25 October 2026; automatic stop 1 November 2026 at 14:26 Bishkek
(08:26 UTC). This operational SQL is not an application migration baseline and
must not be run blindly on another project or used to rearm an expired capture.

## What is installed

`live-test-recorder.sql` creates two private RLS-enabled tables and a
SECURITY INVOKER sampler callable only by the operator role. It adds the single
cron job `brains-heist-live-test-recorder`, scheduled every ten seconds, with
1.5-second statement and 100-ms lock limits. It changes no application trigger,
student record, grading rule, business job schedule, or runtime connection limit.
Sampler writes are limited to its own private diagnostic tables and cleanup of
its own older cron run records; it does not write to application tables.

Captures:

- Client backend connections and states by database role, versus the cluster
  connection limit; active/idle-transaction/lock/IO waits.
- Up to 12 interesting sessions: query ID, role, whitelisted operation label,
  duration, and blocker PID/query-ID chains. No raw query text, parameters,
  client IP, email, student identity, answer, or token is stored.
- Once a minute: up to 60 cumulative query patterns with statement execution,
  read/write, temp-block and WAL counters; database reset/counter metadata;
  assignment evidence backlog; running/recently failed cron metadata.
- The sampler's own elapsed time.

Samples keep a rolling 48-hour history while capture is active. Pruning runs
hourly. On expiry the sampler prunes old samples and unschedules its own job;
the final bounded history remains for operator review until explicitly removed.
Its own completed cron records older than two hours are pruned from a bounded
newest-runid tail; other jobs' records are not deleted. No unindexed full cron
history scan runs every ten seconds.

## Live test procedure

1. Tell the assistant **starting now**, the expected student count, and an
   assignment/class label. Do not send student passwords or session tokens.
   Capture already runs automatically; this message identifies the test window.
2. Note the exact Bishkek time of any delay, the action (open/save/submit/login),
   and the visible error. Keep any available request ID or screenshot.
3. Tell the assistant when the test ends. Review the captured interval promptly,
   within 48 hours. Inspect the Supabase CPU/RAM/IO/pool dashboard graphs for
   that same interval when resource or pool pressure remains a hypothesis.

Optional operator-only marker (not an application endpoint):

```sql
insert into private.reliability_samples(sampled_at,payload,capture_ms)
values(clock_timestamp(),jsonb_build_object(
  'type','operator_test_marker','phase','start','expected_students',50
),0);
```

## Read-only health check

```sql
select c.enabled_until,
  max(s.sampled_at) filter(where s.payload ? 'activity') latest_capture,
  round(avg(s.capture_ms)::numeric,2) mean_capture_ms,
  max((s.payload->'activity'->>'connections')::int) sampled_connections,
  max((s.payload->'activity'->>'lock_waiters')::int) sampled_lock_waiters
from private.reliability_capture_config c
left join private.reliability_samples s on s.sampled_at>now()-interval '5 minutes'
group by c.enabled_until;
```

Use `sampled_at`'s primary-key range for narrow time windows. Aggregate first,
then inspect at most 30 detailed samples around an incident. Query IDs are text
to preserve 64-bit precision in JSON. Query totals are cumulative: calculate
deltas using matching role_oid/query_id/toplevel/stats_since and reset markers.
Missing/evicted/reset baselines mean unavailable deltas, not zero. Cumulative
max execution time is not an interval maximum or a percentile.

The existing **Brains Heist Reliability Watch** remains hourly and read-only.
Its prompt now correlates narrow-window gateway/Auth/Postgres/PostgREST logs
with this sampler. It alerts only on consequential new/worsening issues and
distinguishes confirmed observations, hypotheses, and missing evidence. It is
not a sub-minute alert; the sampler preserves evidence between hourly checks.

## Limits of diagnosis

This is ten-second sampling, not full distributed tracing. Shorter waits may
be missed. The capped statement/session lists are not exhaustive. Neither CPU
nor RAM, PostgREST/Supavisor acquisition queues, nor browser/network latency is
directly measured. A healthy cluster connection count does not prove the
PostgREST pool has free slots. Join request IDs only where actual logs expose
them; never invent a link between a student request and a sampled PID. Correlated
activity alone is not proof of the original timeout's cause.

## Verification recorded at installation

- Successive scheduled captures succeeded; first 13 samples averaged 13.80 ms,
  maximum 47.19 ms under quiet traffic. These are sampler elapsed times, not CPU
  measurements or overhead guarantees under classroom load.
- `anon`, `authenticated`, and `service_role` cannot select the sample table or
  execute the sampler; both tables have RLS enabled and no public policies.
- Expiry was exercised inside a rolled-back subtransaction: it unscheduled only
  the recorder, and rollback restored the active job and future expiry.
- Persisted JSON was checked for forbidden raw SQL, email, IP and token fields.
- Security Advisor was rerun. Private tables with RLS and no policies intentionally
  deny API access; pre-existing unrelated findings are outside this change.

## Stop and remove

Stop only the diagnostic job:

```sql
select cron.unschedule(jobid) from cron.job
where jobname='brains-heist-live-test-recorder';
```

After exporting needed evidence, an operator may remove only these objects:

```sql
drop function private.capture_reliability_sample();
drop table private.reliability_samples;
drop table private.reliability_capture_config;
```

Do not reset `pg_stat_statements`, cancel student transactions, change compute,
or modify normal production cron jobs as part of observation.
