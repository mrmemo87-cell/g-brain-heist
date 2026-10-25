# Shared English curriculum repair and question catalogue

The academic subject and global curriculum are shared resources. No school-specific
name, roster, teacher allocation or student evidence is copied into this package.

## Delivered changes

- A private, shared learning catalogue precomputes the question's hash-bound registry
  eligibility and approved curriculum-scope IDs. Teacher/school/year/grade/pool
  permissions and current question hashes remain live. Browser payloads, metadata,
  assessment profiles, filters and keyset pagination retain their existing contract.
- Relevant content/governance writes invalidate the catalogue transactionally.
  Dirty reads execute the original checks; they never use stale access decisions.
  The minute worker rebuilds once for everyone. Clean ticks do not write. Answer
  counters, attempts and assignment completion do not rebuild or invalidate it.
- New curriculum editions require specific outcomes, assessment boundaries and an
  explicit partial/complete scope designation before approval/publication. Legacy
  editions and their immutable historical approvals retain their original meaning.
- New approvals to known generic template objectives or non-assessable headings
  are rejected. Exact-focus objectives reject questions with a different reviewed
  focus/hash. Existing content-hash, approval and provenance checks still apply.

The generic-template detector is a targeted regression guard, not a substitute for
editorial judgment. Existing generic objectives are not retroactively relabelled
or silently removed from historical coverage.

## English repair draft

Run `prepare-draft.sql` after the governance migration. It creates a shared,
subject-specific **draft** with Grade 7/8 objectives proposed from current, approved
English Evidence Focus records attached to global verified questions. It creates
only strand/topic organisation and precise objective candidates, rather than
another skill/subskill identity hierarchy. Every objective identifies its focus
and states its assessment boundary. Coverage is explicitly **partial**, based on
available bank evidence, not a complete Cambridge or school syllabus.

This is a review candidate, not a claim that existing focus labels, overlaps or
grade eligibility have all passed a new curriculum editorial review. In particular,
review near-duplicate and example-specific focuses before adopting objectives.
A rerun never overwrites an existing draft. No approvals or school switches occur.

## Adoption and historical evidence

1. Review exact objective wording, overlaps, exclusions, grades and the candidate
   question-to-objective list. Mark headings non-assessable and merge overlapping
   objectives deliberately; do not infer full syllabus coverage from bank coverage.
2. Use the existing governed review/publish workflow. Record reviewers and exact
   release hashes; the new precision gate is additional to those existing gates.
3. Propose mappings using each reviewed question hash and the objective's exact
   evidence focus. The database rejects a mismatching focus. Do not bulk-approve
   mappings merely because the draft was generated from a registry.
4. Preview affected school offerings by ID, academic year and current curriculum
   scope. Compare English and ESL objectives by content rather than their counts.
5. Adopt per school offering. Do not silently update other schools, prior
   assignments, answer ledgers, registry identities or previously computed reports.
6. Any historical curriculum correction is a separate, explicit, auditable
   operation. Marks and answers are never recomputed by this package.

## Verification and operations

`npm run test:curriculum-catalogue` runs PostgreSQL/PGlite behaviour tests for
school isolation, permission revocation, stale/dirty fallback, focus/hash alignment,
publication gates, preserved historical approvals, draft preparation and answer
counter isolation. It is also wired into `npm test`/CI.

Run `verify-catalogue.sql` inside `BEGIN; ... ROLLBACK;` to compare cached and full
responses for every existing teacher without retaining impersonated sessions or
changing production data. It fails on any difference, including filters, facets,
question ordering or cursor payloads.

Monitor `private.question_learning_catalogue_state`: revision must eventually
match built_revision. A mismatch is safe (the original query runs), but prolonged
mismatch or a failed pg_cron job means the speedup is unavailable. Inspect the
`brains-heist-question-learning-catalogue` job in `cron.job_run_details`.
A refresh function failure rolls back its catalogue replacement atomically.

To disable the fast path without changing permissions, increment revision and
pause its cron job. The dirty catalogue uses the original learning checks. Restore
by repairing the worker and invoking the private refresh function as the database
operator. No cache table is directly readable or executable by clients.

## Measurements

Controlled warm database comparison on 2026-10-26, using a current Silk Road
English teacher, 50-question page and metadata disabled:

| Query | Before | Prepared catalogue |
| --- | ---: | ---: |
| English question page | 21.61 ms | 16.48 ms |
| Subject/topic counts | 93.22 ms | 22.97 ms |

The initial live shadow comparison returned identical English pages and facets,
with 2,608 derived entries. Before and after enabling the migrations, all 22 current
teachers passed 88 full-response comparisons (three filters and topic counts per
teacher). Eleven new PostgreSQL behaviour tests and 25 relevant existing regression
tests passed; typecheck, build and the migration security guard also passed.
Security-advisor comparison added no warnings/errors; two informational notices
reflect intentionally inaccessible private RLS tables with no client policies. These are database timings, not browser/network or
classroom concurrency guarantees. Existing pagination was already implemented and
was retained rather than rebuilt.

## Consolidated editorial proposal

The next-stage audit is in [editorial/REVIEW.md](editorial/REVIEW.md). It consolidates
the raw 604 candidates into 399 grade-specific recognition objectives (200 Grade 7,
199 Grade 8), retaining an explicit source-focus allowlist rather than merging
registry identities. It holds 129 distinct questions, including all 32 with
multiple current diagnostic focuses, from the proposed mapping package.

`npm run curriculum:english:editorial` reproduces the package and draft SQL from
its source manifest and curated outcomes. The SQL aborts on question/hash/taxonomy
or focus-definition drift. It creates only draft objectives and proposed focus
links. Editorial approval, mapping approval, school adoption and historical
correction remain distinct operations. The live draft is `2026-editorial-2`.

## Held-item repair decisions

[held-repairs/REPAIR_REVIEW.md](held-repairs/REPAIR_REVIEW.md) gives an individual,
hash-bound disposition for all 129 held questions. It includes 12 self-contained
reading replacement candidates and four clearer connective wording candidates.
No canonical code or reviewer approval is invented for proposed focus changes.

Run `npm run curriculum:english:held-repairs` to rebuild and validate the candidates.
The supplied SQL calls the normal registry importer in **dry-run mode only**.
Publication, canonical taxonomy approval, per-school adoption and historical
correction are separate governed actions. See `held-repairs/VALIDATION.md` for
actual production/deployment checks and the importer's dry-run result.

The next repair stage also adds a private, reversible selection hold for the 12 reading questions missing their source passages. Existing published assignment references are grandfathered; new assignment selection and publication reject held current content. See `held-repairs/VALIDATION.md` for production checks and the release procedure.
