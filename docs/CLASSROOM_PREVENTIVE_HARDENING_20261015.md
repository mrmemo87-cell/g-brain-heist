# Classroom preventive hardening — October 15, 2026

## What this changes
- Evidence worker cadence moves from **one invocation per minute** to **one every 10 seconds**, with exactly one global worker at a time. This is a guarded throughput increase, **not** parallel evidence ingestion or a guarantee that 100 completions are reflected in under ten minutes.
- `saa_teacher_group_select` and `sar_teacher_group_select` no longer access the protected teacher-group table directly. They use the authenticated current-user/active-group helper installed in the P0 repair. No extra student or school access is intended.
- Authenticated student-owned answer/attempt policies cache the per-statement `auth.uid()` value without changing their row predicates.
- Email claiming is database-bounded at five attempts. Exhausted pending jobs enter `failed` state rather than cycling indefinitely. Already delivered or failed notifications remain unchanged.
- Three indexes confirmed identical by Supabase's performance advisor are dropped. Their peer indexes remain.
- The staging k6 script now covers the heavy `rpc_get_student_pending_assignments_v2` response.

## Safety and validation
- Baseline incident repair remains intact: verified result commits with a durable queue entry; expensive registry + diagnostic evidence is never in the student completion transaction.
- Migration must pass rollback-only live-schema DDL compilation, authenticated student/teacher RLS smoke tests and GitHub typecheck/build/test/security guard.
- Do **not** run staging classroom tests on production. The k6 script has a hard block for the production project.
- Confirm active pg_cron cadence and zero failed runs; new jobs must transition pending -> done. Record evidence latency and queue age before further increasing worker concurrency.
- Watch SQL stats and postgrest endpoint p95/p99. `pg_stat_statements` totals are historical since their last reset and cannot prove improvement by themselves.
- No live modifications to student grades, answers, evidence or authentication records.

## Still required
- Run 30 then 100 **distinct authenticated users** concurrently on a separate staging database with unique assignments and answered questions. Verify zero mismatches and zero cross-school visibility leaks.
- Check evidence queue drain under sustained submissions, retry idempotency, stalled jobs and teacher dashboards.
- Connect a notification channel to the existing evidence watchdog; it currently only emits database warnings.
- Follow-on work for assignment-loading payload design must preserve legacy `questions` and student resume contracts; do not remove them from existing RPCs.

## Rollback
- Restore original worker schedule:
```sql
select cron.schedule('brains-heist-assignment-evidence-worker','* * * * *',
  $cron$set lock_timeout='2s';
set statement_timeout='120s';
select private.process_one_verified_assignment_evidence();$cron$);
```
- Restore previous teacher-group SELECT policies from the schema backup if cross-school authorization differs, but do not grant direct SELECT to the internal tables as a shortcut.
- The dropped indexes can be recreated from the prior migration/source definitions if query plans regress. Original data is not changed.
