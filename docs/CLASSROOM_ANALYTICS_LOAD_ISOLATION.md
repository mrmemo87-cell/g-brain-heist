# Classroom analytics load isolation — October 2026

## Scope

This is a narrow performance change only. It does not modify grading, student answers, assignments, RLS authorization, teacher boundaries, curriculum mapping, or school membership.

1. Registry and diagnostic ingestion previously inserted an observation (which fires an AFTER INSERT focus refresh) and **always** repeated a focus refresh. On new observation inserts, let the trigger do it once. On idempotent conflict/replay, retain the explicit refresh so late corrections and academic-year state remain available.
2. Replace hourly refresh of all schools in one database transaction with a **durable private per-school schedule**, three active owner-managed schools per two minutes, per-school exception subtransactions and a five-minute retry. Each school stays on a 60-minute target. The existing manual service-only all-school RPC is preserved.
3. Separate notification dispatch (every ten minutes) and snapshot retention (daily) from the school-head refresh.
4. Keep school email provider dispatch every minute. Move cleanup to five-minute and 24-hour-window reminders to ten-minute schedules. Do not remove the original RPCs.
5. Suppress repeat presence row updates within 45 seconds. Browser heartbeat interval remains sixty seconds and `auth.uid()` self-scope is unchanged.

## Go/no-go gates

- Production schema rollback-only compile and `pg_get_functiondef` confirmation that both ingest functions have a single conditional explicit refresh and still call the same materialization functions.
- GitHub typecheck, build, migration security guard, full test suite.
- Production cron: `school-head-decision-center` has the bounded command and `*/2` schedule. New digest, retention, email-cleanup and email-reminder jobs exist; original one-minute email dispatcher retains the HTTP delivery.
- No failed cron jobs and no `private.school_head_refresh_schedule` row with persistent failures or `next_refresh_at` older than 20 minutes while eligible.
- Verify authenticated presence cannot update another user's row. Do not use a public definer shortcut.
- Run 30 and 100 distinct authenticated classroom users on staging before claiming capacity. **Do not load-test production.**

## Monitoring SQL (operations role)

```sql
select jobname,schedule,active from cron.job
where jobname like 'school-head-%' or jobname like 'school-email-%';
select count(*) as tracked, count(*) filter(where failure_count>0) as failing,
  min(next_refresh_at) as oldest_due
from private.school_head_refresh_schedule;
select school_id,failure_count,last_error,next_refresh_at
from private.school_head_refresh_schedule where failure_count>0
order by failure_count desc limit 15;
```

## Rollback

- Repoint `school-head-decision-center` to its original 12th-minute hourly `public.rpc_refresh_all_school_head_decisions()`, disable the new head notification and snapshot jobs, preserving the schedule table for forensics.
- Restore the original school-email-dispatcher command that runs cleanup, reminders, then `net.http_post` each minute; unschedule the standalone email cleanup/reminder jobs.
- Restore both ingestion function bodies from pre-migration source if conditional behavior regresses. Do not remove their result-commit queue or observation INSERT trigger.
- Restore original presence RPC if user online status is delayed by the 45-second write guard.
- Never drop saved answers, results, observations or the existing private evidence queue to roll back a performance change.

## Known limits

There is no staging Supabase branch connected. No real 100-student load test has passed yet; production uptime alone is not equivalent to concurrency certification. The 60 PostgreSQL connection limit is a configuration ceiling, not a proof that 60 students exhaust connections (pooling changes that relationship).
