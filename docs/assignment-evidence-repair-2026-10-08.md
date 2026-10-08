# Grade 8 ESL evidence repair — 2026-10-08

## Observed production gap

The second Grade 8 ESL diagnostic had 13 completed submissions and 390 saved,
graded answers. Only the original online submission had 30 legacy item-evidence
records; the 12 paper imports had none. There were no registry item-evidence
records for this diagnostic. All 30 questions now have approved, hash-matching
registry-native taxonomy, so content or taxonomy changes are unnecessary.

The legacy school-scope mapping agrees with only nine assignment-pinned
taxonomies. The other 21 resolve to different scope/framework mappings. Do not
weaken this join or rewrite immutable snapshots: the canonical registry lane
already provides the approved stable subskill identity for all 30 items.

## Cause and prevention

The result trigger previously ran immediately, while both materializers require
an already-completed student assignment. A result written before completion can
therefore silently produce no evidence, with no later completion trigger to retry.
The exact import SQL was not persisted in the repository, so its statement order
cannot be proven retrospectively. The missing records match the paper-import
audit cohort exactly; the ordering failure is reproduced by database tests.

The migration defers the existing result trigger until transaction end and adds
a completion-transition trigger that reconciles an already-saved result. Normal
student submission completes first, so the latter only performs an existence
check on that path. It also handles results and completion committed separately.
The existing materializers and their content, grade, mapping, independence and
uniqueness gates remain intact. This does not move ingestion to a background
worker or establish a new concurrent-load capacity claim.

## Production repair and verification

Applied `assignment_evidence_completion_order` to the existing Brains Heist
project. Replayed both governed ingestion functions for the 23 completed
submissions in the affected Grade 8 ESL group: nine initial diagnostics, thirteen
second diagnostics and one future-continuous assignment.

- Every completed second diagnostic has 30 registry items across 17 subskills.
- Its pending recipient still has zero evidence.
- The three assignments now have 676 registry item-evidence records in total.
- Confidence/focus states were refreshed through the existing ingestion functions.
- Before/after digests of all saved answer rows, result rows and student XP/coin
  reward fields match. The repair transaction asserted this before committing.
- A repeated live replay of one imported submission created no additional item
  evidence or observations.
- With Jess's authenticated database context, Academic Profile returns the saved
  work and verified-question counts; the intervention workspace returns newly
  observed targets with `collect_evidence` where the baseline remains sparse.
- Forty database tests passed, including five new ordering, retry, rollback and
  execute-permission tests. Migration security guard and whitespace checks pass.

Low-data states remain intentional. The repair does not mark every learner weak,
grant teacher confirmation, create interventions automatically, or count targeted
practice as independent mastery. The compatibility ledger is retained alongside
the authoritative registry lane; neither lane's historical entries are deleted.

Verification used database projections rather than an interactive browser session.
No new IELTS scoring, diagnostic content, taxonomy or delivery behavior is changed.
