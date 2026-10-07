# Recent correct-attempt reward lookup index

Applied to Brains Heist production (sozodkxwhubespiedgxm) on 2026-10-07 UTC / 2026-10-08 Bishkek.

Migration: `20261007181737_question_attempt_reward_lookup_index.sql` (filename reconciled with the actual applied migration history).

## Change

Added a partial B-tree index on `question_attempts(student_id, question_id, attempted_at DESC) WHERE is_correct = true`. It matches the existing 24-hour reward-duplication lookup in `record_question_attempt`. The moving time boundary remains in the query; it is not part of the index predicate. No function, scoring, authorization or reward behavior changed.

The production table had approximately 43,153 records during verification and a 6.4 MB heap. The transactional index build used a 500 ms lock timeout and a 5 s statement timeout. Regular CREATE INDEX briefly excludes writers during the build; this was not a concurrent build. Application succeeded, and PostgreSQL reports the index valid and ready. Index size: 2,170,880 bytes.

## Verification

Read-only EXPLAIN ANALYZE used a real student/question pair selected internally, without invoking the reward RPC or creating attempts. No account identifiers are stored in this report.

| Lookup | Execution | Indexes used | Shared blocks |
|---|---:|---|---|
| Before | 3.066 ms | Separate question and student indexes | 4 hits, 1 read |
| First after build | 6.821 ms | New composite partial index | 0 hits, 3 reads |
| Warm repeat | 0.082 ms | New composite partial index | 3 hits, 0 reads |

The cold post-build result was slower than the earlier sample. Cache and storage conditions differ, so these samples do not establish a reliable speedup ratio. The useful verification is that PostgreSQL uses the complete lookup index, rather than combining broad student/question indexes and filtering the results afterward. These timings are only the EXISTS lookup, not full answer latency.

Local PGlite accepted the migration twice and produced the expected index definition. The repository migration security guard passed. Supabase performance advisors were fetched after application; pre-existing findings, including duplicate student indexes, remain. No new RLS/table/function grants were introduced.

## Limits and follow-up

This addresses one gameplay query risk. It does not remove synchronous rewards/statistics updates, isolate the reminder cron, change assignment/finalization locking, bound managed Auth pools, or prove 500-user capacity. The existing duplicate student indexes remain for separately reviewed cleanup. The next capacity test must include the full schema and hosted connection limits.
