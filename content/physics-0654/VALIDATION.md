# Validation record

Implementation base: `e90cdb47eea855e2262367a96ee1a0cd82918320`.

## Executed

- `npm run verify`: **passed**. This includes the portal integrity guard,
  question-package/taxonomy validators, TypeScript, migration security guard,
  production Vite build, compiled tests and repository DOM/database suites.
  Aggregate Node test summaries: **2,540 passed, 2 skipped, 0 failed**.
- Physics-specific tests: **7 passed**, exercising the actual SQL validator,
  governor, importer, evidence materializer and aggregate report in PGlite,
  plus teacher preview/panel rendering in JSDOM.
- Existing registry/mapping/Academic Profile regression subset: **44 passed**.
- Import wrapper refuses execution without an exact-version human review file.
- `git diff --check`: passed.

An initial full run stopped at the existing paper-scan test because Canvas native
bindings were missing after dependency installation with scripts disabled.
Installing the existing root Canvas package's native binding resolved the issue;
the subsequent complete verification passed. No package versions were changed.

## Meaningful checks

- A 62-question dry-run creates no questions or assessment profiles.
- An invalid final question aborts the entire publication transaction.
- Replaying the same approved release creates no duplicates.
- Wrong programme/subject/version, missing fields, unsupported tier/component,
  mismatched AO components and AO3 claims are rejected for 0654 MCQs.
- Existing supported Economics 0455 profiles remain valid.
- Explicit upper-secondary programme context permits Grade 9 IGCSE items without
  changing the global grade-to-phase rule. An unsupported override is rejected.
- Offering activation requires a named reviewer, exact manifest checksum and one
  exact active Physics offering. Catalogue queries use the configured phase.
- Completed fixture assignments generate canonical and external-AO snapshots
  through the real evidence materializer. Replay is idempotent.
- Teacher report access requires active school membership and exact active Physics
  group allocation. Practice/repetition is separated from fresh independent items.
- Retiring a current question profile does not erase frozen historical AO evidence.
- Teacher UI distinguishes unavailable data, no evidence and actual answer counts.

## Not asserted

No new content, registry nodes, offering mappings or migrations were applied to
production. No real student answers or historical records were modified.

A live named-user browser/assignment/pilot remains outstanding, as do human
content/taxonomy approval and confirmation that the target cohort uses the
2025–2027 syllabus. Difficulty has not been psychometrically calibrated; no
predicted qualification grade or mastery conclusion is produced by this feature.

The existing Physics bank's suspicious historical taxonomy placements were
identified but not rewritten. They require a separate reviewed successor-mapping
change because historical evidence must retain its original identity.

## Production release follow-up (2026-10-24)

The owner explicitly authorized merge, deploy and go-live. PR #1707 was merged
and its technical migration applied. The production deployment reached READY.
Live checks confirmed 62 active verified questions, 62 current approved
registry taxonomies and 62 current external assessment profiles. Held items
were not imported. No real student answers were written.

Release rehearsal caught two integration defects before committed publication:
Git normalized CSV line endings, invalidating the original raw-byte manifest;
and the actual registry-node unique key is `code`, while the fixture had modeled
`(registry_version_id, code)`. CSV output is now explicitly LF, checksums match
the repository bytes, the SQL uses the actual conflict target, and the fixture
models the live unique key. Eight targeted tests pass, including manifest integrity.
Both the live dry run and a full publication rehearsal with rollback then passed.

The default pilot account is not enrolled in Physics, and the existing Physics
groups have no active teacher/student allocations. Those permissions were not
invented or bypassed. A real teacher/student submission pilot is still unperformed.
School-specific exam-version mappings remain unset. See `release-authorization.json`.
