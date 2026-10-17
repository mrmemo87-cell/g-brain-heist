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


## 16 October follow-up (completed; 500 latency gate failed)

The current branch preserves the existing failed 500-student report. A new isolated run exercises the current full pending payload, finalization budgets, durable queue/lease SQL, 10 minutes of paced answer activity at each stage, and a repeated 500-student recovery stage. Escalation stops at the first failure. Auth pooling stays bounded to 20 on the disposable stack; this changes no hosted setting.

The real academic ingestion pipelines are replaced by deterministic two-lane receipts in this focused diagnostic. Queue completion and exact receipts are reconciled with a five-minute drain deadline, but this is **not** evidence of full academic-pipeline throughput, IELTS capacity or hosted production capacity. The completed result is retained in `2026-10-16-classroom-results/` and summarized below.


### Sustained run outcome

Workflow [38915506177](https://github.com/mrmemo87-cell/g-brain-heist/actions/runs/38915506177), exact source `e33d7931bafea446761bfcb46507deb755e0c629`, completed on a 4-vCPU Linux runner with 16.8 GB reported RAM. The unmodified report and three k6 exports are committed under `2026-10-16-classroom-results/`. Earlier failure evidence is retained unchanged.

| Students | Completed | Answer p95 / p99 | Catalogue p95 | Queue drain | Result |
|---:|---:|---:|---:|---:|---|
| 30 | 30 | 55.03 / 84.05 ms | 131.83 ms | 5.43 s | Pass |
| 100 | 100 | 45.14 / 88.01 ms | 213.44 ms | 37.17 s | Pass |
| 500 | 500 | 15.09 / 73.68 ms | 4,713.61 ms | 237.20 s | Fail |

All stages had zero HTTP failures, exact database totals, correct known grades and no duplicate answers. The 500 stage stored 8,000 answers and 500 results, drained 500 real durable jobs with 1,000 deterministic receipts, and reconciled the teacher total to 630. The old Auth connection failure did not recur with the isolated bounded pool; this does not establish a managed-production fix.

The unchanged catalogue p95 gate is 1,500 ms, so exit 99 stopped escalation. The repeated 500 stage did not run. No gate was weakened. The real academic ingestion pipeline is still omitted; even the deterministic 500-job drain took almost four minutes. These results do not certify full evidence throughput or IELTS/hosted capacity.

A read-only production inspection confirmed existing student/assignment-question lookup indexes. One direct inner query plan took about 5.85 ms (32.87 ms planning) but returned no active assignments for that pilot, so it does not reproduce the 500-student burst or establish the cause. The function wrapper sample took about 197.67 ms. No speculative hosted pool, index or RPC change was applied. The next investigation needs concurrent database/API queue-wait and planning/resource measurements in a faithful disposable environment.

The disposable stack and synthetic credentials were removed successfully. Documentation/result-only branch updates no longer rerun the expensive benchmark; manual dispatch remains available.
