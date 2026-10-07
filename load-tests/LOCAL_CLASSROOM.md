# Local classroom concurrency benchmark

This benchmark runs **30 → 100 → 500 authenticated students**, plus one teacher,
against a disposable local Supabase instance. It does not call production.

Each stage has a fresh shared classroom assignment with 16 questions, including
one deterministically graded short answer. Five hundred distinct students are
provisioned with the real Supabase Auth admin API and sign in using passwords.
Session provisioning happens before the measured load; this is not a signup or
login-storm test. Students may take another fresh assignment in a later stage.

Each student verifies their Auth identity and app bootstrap, reads the assignment
catalog and detail, sends three simultaneous identical save requests per answer,
checks resume state, and finalizes twice. Some fixture answers are intentionally
wrong. The test checks the server's known score instead of trusting the forged
score supplied by the client. The teacher polls the assignment report every five
seconds for two minutes.

## Gates before escalation

- Every expected student must complete the full flow.
- All HTTP status checks must pass, with zero classroom correctness errors.
- Answer saves: p95 below 500 ms and p99 below 1,500 ms.
- Catalog, detail and teacher summary: p95 below 1,500 ms.
- Database reconciliation: exactly 16 answers and one correct final result per
  student; no duplicates, missing completions or pending reviews.
- The teacher's final report must contain the exact cumulative submission count.

A failed stage stops escalation. Fixture preparation failures also stop the run.
Results include timestamps, host specifications, application source SHA and
hashes of the actual RPC migration files. Repeated retries do not count as extra
student completions.

## Reproduce

Use the manual `Isolated classroom load (30, 100, 500)` GitHub Actions workflow
after the workflow is available on the default branch. Choose the desired code
ref explicitly. The workflow requires no production credentials, creates an
unlinked local Supabase instance, installs pinned Supabase CLI 2.120.0 and k6
2.3.0, verifies the k6 release checksum, and deletes the local stack afterward.
Only non-secret summary JSON and the report are uploaded as artifacts. Normal
GitHub runner-minute limits apply; this does not change any subscription.

The same scripts can run on a Docker-capable workstation: initialize a separate
Supabase project outside the application folder, start its Auth/API/Postgres
services, save `supabase status -o json` to a private file, generate the focused
schema with `node load-tests/prepare-local-classroom.mjs`, apply that schema to
the disposable `supabase_db_brains-classroom-local` container, and invoke
`node load-tests/run-local-classroom.mjs <private-status-json> <results-dir> <k6-path>`.
The workflow provides the complete commands. Never upload the status JSON or
the generated `fixture-*.json` files; they contain local credentials.

## What the results mean

The stack runs real PostgreSQL, Supabase Auth, PostgREST and Kong. The assignment,
bootstrap and teacher-report RPCs are the current repository migrations. Index
and answer-normalization metadata was read from production on 2026-10-07; no
production records or secrets were copied.

The public table definitions are a focused contract fixture, not a full schema
clone. Generated UUIDs and production index definitions are added. Direct table
access is closed with RLS and revoked grants; the caller-bound RPCs retain their
own authorization. Unrelated tables, production analytics/reward triggers,
foreign-key/check-constraint coverage and the billing pre-request hook are not
reproduced. Therefore, this benchmark cannot certify the full production result
pipeline, entitlement enforcement, or production query plans under historic data.

The load generator shares the host with the services. Loopback HTTP excludes
WAN latency, TLS, CDN behavior and hosted resource limits. It opens no browsers
and does not test realtime subscriptions, Rendering, Writing Hub, clan battles,
signup storms or mixed-feature traffic. A passing result supports classroom RPC
concurrency on the recorded test host; it is not a hosted capacity guarantee.
