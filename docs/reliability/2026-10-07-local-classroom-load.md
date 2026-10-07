# Brains Heist staged classroom load — 2026-10-07

**30 and 100 concurrent students passed. The completed 500-student stage failed. Production capacity at 500, or thousands, is not established.** No Supabase subscription upgrade was performed. No production load or fixture writes were performed.

## Completed staged run

Evidence: `2026-10-07-classroom-results/results-auth-exhaustion/` contains the reconciliation report and unedited k6 summary exports. In k6's legacy export, a threshold boolean of `true` means it failed; use the exit status and recorded `passed` field.

| Concurrent students | Completed | Stored answers | HTTP failures | Answer p95 | Answer p99 | Result |
|---:|---:|---:|---:|---:|---:|---|
| 30 | 30 | 480 | 0 | 12.51 ms | 80.91 ms | Pass |
| 100 | 100 | 1,600 | 0 | 20.99 ms | 90.62 ms | Pass |
| 500 | 392 | 6,272 | 108 (0.498%) | 527.43 ms | 2,991.48 ms | Fail |

Passing stages required every student to finish, zero failed checks, exact database and teacher-report counts, answer p95 <500 ms and p99 <1,500 ms, and read/report p95 <1,500 ms. At 500, 108 Auth identity requests returned HTTP 500. Auth logs showed connection exhaustion (`too many clients`, reserved connection slots) and deadline errors. Stored results had no duplicate answers or incorrect fixture grades, but 108 students did not complete. Correct results for the successful subset do not make the stage pass.

## Test behavior and environment

Each student uses a distinct real Supabase Auth identity and password-issued session. Account provisioning is outside measurement. Students verify identity and bootstrap, read their assignment, answer 16 questions with three simultaneous duplicate save requests each, verify resume state, then finalize twice with a forged client score. The expected server result is 13 correct, 3 incorrect, score 130. A teacher polls every five seconds for two minutes. Each stage uses a fresh assignment.

The disposable Vercel VM had 4 vCPUs and 8 GiB allocated memory in iad1. Real Docker services ran PostgreSQL 17.11 (`postgres:17.11.0.004`), Auth `gotrue:v2.197.0`, PostgREST `v16.4`, and Kong `2.8.1`; CLI 2.120.0 and checksum-verified k6 2.3.0. Production reports PostgreSQL 17.6, so this is not an identical server version. PostgreSQL allowed 100 connections and PostgREST pooled 10. The completed failing run used Auth's unbounded default database pool. Kong initially had 512 worker connections; this was raised to 8,192 during the 100-stage teacher observation, after that cohort finished its student flows, before the 500-stage burst. This infrastructure difference is recorded explicitly.

Current application RPC migration hashes and initial database counts are in the JSON reports. The source snapshot is `fe28b3e8bbac0c83641a59e3b86d16f79afeee81`. Synthetic records from earlier attempts were retained; stages always received new assignments. Teacher reconciliation checked cumulative results for that teacher, including the baseline where sessions were reused.

## Investigation and follow-up

An earlier 500 attempt completed only 153 students. The original harness copied the entire cohort into each virtual user, consuming about 6 GB RSS; the local gateway also logged exhausted 512 connection slots. The harness now shares individual students, reducing the observed generator RSS to about 305 MB. This attempt's report and 500 summary are retained under `results-generator-overload/`; its manually interrupted exit code 105 is not a clean threshold-only exit.

With that generator issue fixed and gateway enlarged, the completed run above still failed at 500 with exit code 99. This independently exposed the Auth/database limit.

A follow-up bounded the disposable Auth pool to 20 connections, keeping PostgreSQL at 100 and PostgREST at 10. Its 30 stage passed. Its 100 student flows all finished correctly, but I interrupted the teacher observation before the VM's hard lifetime limit; the stage is recorded as interrupted (exit 105), not passed. **The bounded-pool 500 stage did not run. The proposed pool configuration is not a verified 500-user fix.** Its report and summaries are retained under `pool-bounded-followup/`. An earlier retry had a relative fixture-path error before any load; the runner now resolves its output path absolutely.

Reproduction scripts and a manual-only GitHub Actions workflow are included in this PR. They configure the isolated gateway and Auth pool explicitly, stop escalation on failure, save only non-secret summaries, and delete local credentials afterward. No production configuration was changed. The disposable VM was stopped after evidence was downloaded.

## Practical recommendation

Do not advertise support for 500 or thousands of concurrent users from these results. First complete the bounded-pool rerun, then test a separate hosted environment with the full production schema, triggers, entitlement hook, comparable resource limits and representative historic data. Measure database connection use and queueing throughout. Pool limits must fit the combined database budget; the local value of 20 is an experimental configuration, not a prescribed managed-Supabase setting.

This benchmark omits production analytics/reward triggers, foreign-key/check-constraint coverage, the billing pre-request hook, browser rendering, realtime, network/TLS/CDN delays and other app features. Generator and services share one machine. It simulates concurrent classroom API activity, not thousands of complete human browser sessions. No failure-free guarantee is justified.
